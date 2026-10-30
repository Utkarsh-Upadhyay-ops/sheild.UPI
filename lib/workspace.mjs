import { randomBytes, randomUUID, createHash, timingSafeEqual } from 'node:crypto';
import assessor from '../api/assess.mjs';
const hash = (s) => createHash('sha256').update(s).digest('hex'),
  stamp = () => new Date().toISOString(),
  bankIds = ['sbi', 'hdfc', 'icici', 'axis'],
  scenarios = [
    'normal',
    'verify',
    'ring',
    'cycle',
    'device',
    'amount',
    'velocity',
    'chain',
    'recipient',
    'behavior',
  ];
function fail(message, status = 400) {
  throw Object.assign(Error(message), { status });
}
function requireInvestigator(actor) {
  if (actor.role !== 'investigator') fail('Investigator access required.', 403);
}
function owner(s, actor, id) {
  const p = s.payments.find((p) => p.id === id);
  if (!p) fail('Payment not found.', 404);
  if (actor.role !== 'investigator' && p.userId !== actor.userId) fail('Payment not found.', 404);
  return p;
}
function audit(s, p, action, actor, note = '') {
  const e = {
    id: randomUUID(),
    time: stamp(),
    paymentId: p?.id || null,
    action,
    actor: actor.userId,
    role: actor.role,
    note,
  };
  s.audit.push(e);
  if (p) p.timeline.push(e);
  s.audit = s.audit.slice(-3000);
}
function session(s, token) {
  const a = s.sessions[hash(token || '')];
  if (!a || a.expires < Date.now()) fail('Sign in required.', 401);
  return a;
}
function clean(s) {
  for (const [k, a] of Object.entries(s.sessions)) if (a.expires < Date.now()) delete s.sessions[k];
  for (const [k, a] of Object.entries(s.loginAttempts))
    if (a.until < Date.now()) delete s.loginAttempts[k];
}
export async function bootstrap(store, token) {
  const current = (await store.read()).data.sessions[hash(token || '')];
  if (current && current.expires > Date.now())
    return { actor: current, token: null, existing: true };
  const fresh = randomBytes(32).toString('hex');
  const actor = await store.mutate((s) => {
    clean(s);
    let old = s.sessions[hash(token || '')];
    if (old) return old;
    if (Object.keys(s.sessions).length >= 300) fail('Session capacity reached. Try later.', 429);
    const userId = 'c-' + randomBytes(6).toString('hex'),
      a = { userId, role: 'customer', expires: Date.now() + 86400000 };
    s.sessions[hash(fresh)] = a;
    s.users[userId] = { banks: {}, baseline: null };
    return a;
  });
  return {
    actor,
    token: actor === null ? null : fresh,
    existing: !!(await store.read()).data.sessions[hash(token || '')],
  };
}
export async function bootstrapInvestigator(store, token) {
  const current = (await store.read()).data.sessions[hash(token || '')];
  if (current?.role === 'investigator' && current.expires > Date.now())
    return { actor: current, token: null, existing: true };
  const fresh = randomBytes(32).toString('hex');
  const actor = await store.mutate((s) => {
    clean(s);
    if (Object.keys(s.sessions).length >= 300) fail('Session capacity reached. Try later.', 429);
    const actor = { userId: 'investigator', role: 'investigator', expires: Date.now() + 8 * 3600000 };
    s.sessions[hash(fresh)] = actor;
    audit(s, null, 'Demo workspace opened', actor);
    return actor;
  });
  return { actor, token: fresh, existing: false };
}
export async function login(store, code, ip, oldToken) {
  if (typeof code !== 'string' || code.length > 200) fail('Invalid access code.');
  const expected = process.env.INVESTIGATOR_ACCESS_CODE;
  if (!expected || expected.length < 16) fail('Investigator access is not configured.', 503);
  const key = hash(ip || 'unknown');
  const permitted = await store.mutate((s) => {
    clean(s);
    const b = s.loginAttempts[key] || { count: 0, until: Date.now() + 900000 };
    b.count++;
    s.loginAttempts[key] = b;
    return b.count <= 10;
  });
  if (!permitted) fail('Too many access attempts. Try later.', 429);
  if (!timingSafeEqual(Buffer.from(hash(code)), Buffer.from(hash(expected))))
    fail('Invalid investigator access code.', 403);
  const token = randomBytes(32).toString('hex');
  await store.mutate((s) => {
    delete s.loginAttempts[key];
    const old = s.sessions[hash(oldToken || '')];
    if (old?.role === 'investigator') delete s.sessions[hash(oldToken)];
    s.sessions[hash(token)] = {
      userId: 'investigator',
      role: 'investigator',
      expires: Date.now() + 8 * 3600000,
    };
    audit(s, null, 'Investigator signed in', { userId: 'investigator', role: 'investigator' });
  });
  return token;
}
export async function view(store, token, since) {
  let { version, data: s } = await store.read();
  const a = session(s, token);
  if (
    s.payments.some(
      (p) => p.status === 'Pending assessment' && Date.now() - Date.parse(p.timestamp) > 120000,
    )
  ) {
    await store.mutate((state) => {
      for (const p of state.payments)
        if (p.status === 'Pending assessment' && Date.now() - Date.parse(p.timestamp) > 120000) {
          p.status = 'Assessment failed';
          p.error =
            'Assessment did not complete within the recovery window. No funds were debited.';
          audit(state, p, 'Assessment timeout recovered', {
            userId: 'assessment-recovery',
            role: 'service',
          });
        }
    });
    ({ version, data: s } = await store.read());
  }
  if (String(version) === String(since)) return { unchanged: true, revision: version, actor: a };
  const payments = s.payments.filter(
    (p) => p.source !== 'benchmark' && (a.role === 'investigator' || p.userId === a.userId),
  );
  return {
    revision: version,
    actor: { userId: a.userId, role: a.role },
    account: s.users[a.userId] || { banks: {} },
    payments,
    history: a.role === 'investigator' ? s.history.slice(-500) : [],
    overviewSamples:
      a.role === 'investigator'
        ? {
            initialized: !!s.users['overview-samples']?.overviewInitialized,
            count: payments.filter((p) => p.source === 'overview-sample').length,
          }
        : undefined,
    serverTime: stamp(),
    simulated: true,
    storage: 'Shared Postgres',
    audit: a.role === 'investigator' ? s.audit.slice(-100) : [],
  };
}
export async function command(store, token, body) {
  if (!body || typeof body.action !== 'string') fail('Action required.');
  return store.mutate((s) => {
    const a = session(s, token);
    if (body.action === 'logout') {
      delete s.sessions[hash(token)];
      return { loggedOut: true };
    }
    if (body.action === 'connect') {
      if (!bankIds.includes(body.bank) || body.consent !== true || body.code !== '123456')
        fail('Select a sample bank, consent and use code 123456.');
      const u = s.users[a.userId];
      if (!u) fail('Customer session required.', 403);
      if (!u.banks[body.bank]) {
        u.banks[body.bank] = { balance: 25000, connectedAt: stamp() };
        const sender = a.userId + '-' + body.bank;
        for (let i = 0; i < 12; i++)
          s.history.push({
            sender,
            receiver: 'pay-' + ['aanya', 'rahul', 'cafe'][i % 3],
            amount: 300 + i * 20,
            timestamp: new Date(Date.now() - (i + 1) * 86400000).toISOString(),
            settled: true,
            source: 'Server generated baseline',
          });
        s.history = s.history.slice(-1500);
      }
      return { connected: true };
    }
    if (body.action === 'baseline') {
      if (a.role !== 'customer' || body.consent !== true) fail('Customer consent required.');
      if (body.clear) {
        s.users[a.userId].baseline = null;
        return { enrolled: false };
      }
      const b = body.baseline;
      if (
        !b ||
        !Number.isFinite(b.typingMean) ||
        b.typingMean < 20 ||
        b.typingMean > 3000 ||
        !Number.isFinite(b.typingSpread) ||
        b.typingSpread < 0 ||
        b.typingSpread > 3000 ||
        (b.swipeSpeed !== null &&
          (!Number.isFinite(b.swipeSpeed) || b.swipeSpeed < 0.01 || b.swipeSpeed > 20))
      )
        fail('Invalid derived baseline.');
      s.users[a.userId].baseline = {
        typingMean: b.typingMean,
        typingSpread: b.typingSpread,
        swipeSpeed: b.swipeSpeed,
        enrolledAt: stamp(),
        experimental: true,
      };
      return { enrolled: true };
    }
    if (body.action === 'resetBenchmark') {
      requireInvestigator(a);
      s.payments = s.payments.filter((p) => p.source !== 'benchmark');
      s.history = s.history.filter((h) => h.source !== 'benchmark');
      audit(s, null, 'Benchmark records cleared', a);
      return { reset: true };
    }
    if (body.action === 'clearOverviewSamples') {
      requireInvestigator(a);
      const count = s.payments.filter((p) => p.source === 'overview-sample').length;
      s.payments = s.payments.filter((p) => p.source !== 'overview-sample');
      s.users['overview-samples'] = { banks: {}, overviewInitialized: true };
      audit(s, null, 'Overview samples cleared', a);
      return { cleared: count };
    }
    if (body.action === 'resetSimulation') {
      requireInvestigator(a);
      const ids = new Set(s.payments.filter((p) => p.source === 'simulator').map((p) => p.id));
      s.payments = s.payments.filter((p) => !ids.has(p.id));
      s.history = s.history.filter((h) => h.source !== 'simulator');
      audit(s, null, 'Simulation records reset', a);
      return { reset: ids.size };
    }
    const p = owner(s, a, body.id);
    if (body.action === 'clientTiming') {
      if (
        ((a.role !== 'customer' || p.userId !== a.userId) &&
          !(a.role === 'investigator' && p.source === 'simulator')) ||
        !Number.isFinite(body.ms) ||
        body.ms < 0 ||
        body.ms > 120000
      )
        fail('Invalid request timing.');
      if (!p.clientRequestMs) p.clientRequestMs = body.ms;
      return { recorded: true };
    }
    if (body.action === 'verify') {
      if (
        a.role !== 'customer' ||
        p.userId !== a.userId ||
        p.status !== 'Verification required' ||
        body.code !== '123456'
      )
        fail('Valid customer verification required.', 403);
      p.status = 'Allowed';
      audit(s, p, 'Additional demo verification completed', a);
      return { payment: p };
    }
    if (body.action === 'settle') {
      if (a.role !== 'customer' || p.userId !== a.userId)
        fail('Customer authorisation required.', 403);
      if (p.status === 'Settled') return { payment: p, duplicate: true };
      if (p.status !== 'Allowed' || !p.assessment || body.code !== '123456')
        fail('This payment is not authorised for settlement.', 409);
      const account = s.users[p.userId]?.banks[p.bank];
      if (!account || account.balance < p.amount) fail('Insufficient simulated balance.', 409);
      account.balance = Math.round((account.balance - p.amount) * 100) / 100;
      p.status = 'Settled';
      p.settledAt = stamp();
      s.history.push({
        sender: p.sender,
        receiver: p.receiver,
        amount: p.amount,
        timestamp: p.settledAt,
        settled: true,
        source: p.source,
        paymentId: p.id,
      });
      s.history = s.history.slice(-1500);
      audit(s, p, 'Simulated settlement completed; balance debited once', a);
      return { payment: p };
    }
    if (body.action === 'review') {
      requireInvestigator(a);
      if (p.status !== 'Held for review') fail('Payment is not held.', 409);
      if (
        typeof body.note !== 'string' ||
        body.note.trim().length < 5 ||
        body.note.length > 1000 ||
        !['release', 'cancel'].includes(body.outcome)
      )
        fail('Record a reason and select release or cancel.');
      p.status = body.outcome === 'release' ? 'Allowed' : 'Cancelled';
      p.caseStatus = 'Resolved';
      audit(s, p, 'Investigator ' + body.outcome, a, body.note.trim());
      return { payment: p };
    }
    if (body.action === 'cancel') {
      if (a.role !== 'customer' || p.userId !== a.userId) fail('Customer access required.', 403);
      if (
        !['Allowed', 'Verification required', 'Held for review', 'Assessment failed'].includes(
          p.status,
        )
      )
        fail('Payment cannot be cancelled.', 409);
      p.status = 'Cancelled';
      audit(s, p, 'Customer cancelled payment', a);
      return { payment: p };
    }
    fail('Unknown action.');
  });
}
export async function createPayment(store, token, b, score = defaultScore) {
  if (
    !b ||
    typeof b.key !== 'string' ||
    !/^[a-zA-Z0-9-]{8,90}$/.test(b.key) ||
    !bankIds.includes(b.bank) ||
    !Number.isFinite(b.amount) ||
    b.amount < 1 ||
    b.amount > 100000 ||
    Math.abs(Math.round(b.amount * 100) - b.amount * 100) > 0.00001 ||
    typeof b.receiver !== 'string' ||
    !/^pay-[a-zA-Z0-9_-]{1,30}$/.test(b.receiver) ||
    typeof b.recipientName !== 'string' ||
    b.recipientName.length > 80 ||
    !scenarios.includes(b.scenario || 'normal')
  )
    fail('Invalid payment.');
  if (b.upi !== undefined && typeof b.upi !== 'string') fail('Invalid sample address.');
  if (b.history !== undefined) fail('Client supplied history is not accepted.');
  const pid = 'PAY-' + randomUUID(),
    started = performance.now();
  const prepared = await store.mutate((s) => {
    const a = session(s, token),
      sim = ['simulator', 'benchmark'].includes(b.source);
    if (sim) requireInvestigator(a);
    const userId = sim ? (b.source === 'benchmark' ? 'benchmark' : 'simulation') : a.userId;
    if (!s.users[userId])
      s.users[userId] = {
        banks: { sbi: { balance: 1000000, connectedAt: stamp() } },
        baseline: null,
      };
    const u = s.users[userId];
    if (!u.banks[b.bank]) fail('Connect this sample bank first.');
    const existing = s.payments.find((p) => p.userId === userId && p.key === b.key);
    if (existing) {
      if (
        existing.amount !== b.amount ||
        existing.receiver !== b.receiver ||
        existing.bank !== b.bank ||
        existing.scenario !== (b.scenario || 'normal')
      )
        fail('Request key already used for a different payment.', 409);
      return { duplicate: existing };
    }
    if (s.payments.length >= 1000)
      fail('Workspace record limit reached. Export records or reset simulator data.', 409);
    if (u.banks[b.bank].balance < b.amount) fail('Insufficient simulated balance.', 409);
    const sender = userId + '-' + b.bank,
      now = Date.now(),
      scenario = b.scenario || 'normal',
      source = sim ? b.source : 'shieldpay';
    const p = {
      id: pid,
      key: b.key,
      userId,
      bank: b.bank,
      sender,
      receiver: b.receiver,
      amount: b.amount,
      recipientName: b.recipientName,
      upi: (b.upi || 'sample@sample').slice(0, 60),
      note: typeof b.note === 'string' ? b.note.slice(0, 80) : '',
      timestamp: stamp(),
      status: 'Pending assessment',
      source,
      scenario,
      timeline: [],
      assessment: null,
    };
    s.payments.push(p);
    audit(s, p, 'Payment requested; assessment pending', a);
    let h = s.history
      .filter((h) => h.sender === sender || now - Date.parse(h.timestamp) < 120000)
      .slice(-450);
    if (!h.some((h) => h.sender === sender))
      for (let i = 0; i < 12; i++)
        h.push({
          sender,
          receiver: 'pay-' + ['aanya', 'rahul', 'cafe'][i % 3],
          amount: 300 + i * 20,
          timestamp: new Date(now - (i + 1) * 86400000).toISOString(),
          settled: true,
          source: 'Server generated baseline',
        });
    function edge(sender, receiver, amount = 2000, ago = 20000) {
      const e = {
        sender,
        receiver,
        amount,
        timestamp: new Date(now - ago).toISOString(),
        settled: true,
        source: sim ? source : 'Server generated scenario',
        scenarioPaymentId: p.id,
      };
      h.push(e);
      s.history.push(e);
    }
    if (scenario === 'ring')
      for (let i = 0; i < 5; i++) edge('incoming-' + pid.slice(-6) + '-' + i, sender);
    if (scenario === 'cycle') {
      edge(p.receiver, 'cycle-' + pid.slice(-6));
      edge('cycle-' + pid.slice(-6), sender);
    }
    if (scenario === 'chain') {
      edge('origin-' + pid.slice(-6), 'hop-' + pid.slice(-6));
      edge('hop-' + pid.slice(-6), 'mid-' + pid.slice(-6));
      edge('mid-' + pid.slice(-6), sender);
    }
    if (scenario === 'velocity')
      for (let i = 0; i < 25; i++) edge(sender, 'burst-' + i, 400, 50000 - i * 1000);
    s.history = s.history.slice(-1500);
    let behavior = { available: false },
      baseline = u.baseline;
    if (b.behavior !== undefined) {
      const v = b.behavior;
      if (
        !v ||
        v.consent !== true ||
        !Number.isFinite(v.typingMean) ||
        v.typingMean < 20 ||
        v.typingMean > 3000 ||
        (v.swipeSpeed !== null &&
          v.swipeSpeed !== undefined &&
          (!Number.isFinite(v.swipeSpeed) || v.swipeSpeed < 0.01 || v.swipeSpeed > 20))
      )
        fail('Invalid derived interaction features.');
      if (baseline) {
        const deviation = Math.min(
          6,
          Math.abs(v.typingMean - baseline.typingMean) /
            Math.max(30, baseline.typingSpread, baseline.typingMean * 0.25),
        );
        behavior = {
          available: true,
          deviation,
          experimental: true,
          source: 'Consented derived typing comparison',
        };
        if (v.swipeSpeed && baseline.swipeSpeed)
          behavior.deviation = Math.min(
            6,
            (deviation +
              Math.abs(v.swipeSpeed - baseline.swipeSpeed) /
                Math.max(0.1, baseline.swipeSpeed * 0.25)) /
              2,
          );
      }
    }
    if (sim && scenario === 'behavior')
      behavior = {
        available: true,
        deviation: 4,
        experimental: true,
        source: 'Server generated simulator interaction',
      };
    return {
      id: p.id,
      body: {
        demo: true,
        payment: {
          id: p.id,
          sender,
          receiver: p.receiver,
          amount: p.amount,
          timestamp: p.timestamp,
          device: scenario === 'device' ? 'new' : 'familiar',
        },
        history: h.slice(-500),
        behavior,
        extraVerification: scenario === 'verify',
        protectionContext:
          b.requestType === 'cashback'
            ? { payToReceive: true, unexpectedCollect: true }
            : b.requestType
              ? { unexpectedCollect: true }
              : {},
      },
      actor: a,
    };
  });
  if (prepared.duplicate) return { payment: prepared.duplicate, duplicate: true };
  let assessment, error;
  try {
    assessment = await score(prepared.body);
  } catch {
    error = 'Assessment service failed. No settlement was performed.';
  }
  return store.mutate((s) => {
    const p = s.payments.find((p) => p.id === prepared.id);
    if (!p) fail('Payment record unavailable.', 409);
    if (p.status !== 'Pending assessment') return { payment: p };
    p.assessment = assessment || null;
    p.status = error
      ? 'Assessment failed'
      : assessment.decision === 'Allow'
        ? 'Allowed'
        : assessment.decision === 'Verify'
          ? 'Verification required'
          : 'Held for review';
    p.error = error || null;
    p.caseStatus = p.status === 'Held for review' ? 'Open' : null;
    p.serverRequestMs = performance.now() - started;
    if (assessment) {
      p.graphHistory = prepared.body.history
        .filter(
          (h) =>
            Date.parse(prepared.body.payment.timestamp) - Date.parse(h.timestamp) <= 120000 &&
            h.settled !== false,
        )
        .slice(-150);
      p.behavior = prepared.body.behavior;
    }
    audit(
      s,
      p,
      error ? 'Assessment failed' : 'Assessment decision: ' + assessment.decision,
      prepared.actor,
    );
    return { payment: p };
  });
}
export async function defaultScore(body) {
  const r = await assessor.fetch(
    new Request('http://assessment.local/api/assess', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );
  if (!r.ok) throw Error('Assessment failure');
  return r.json();
}

export async function benchmark(store, token, mode = 'assessment') {
  if (!['assessment', 'ledger'].includes(mode)) fail('Unknown benchmark mode.');
  if (mode === 'ledger') {
    const start = performance.now();
    const { payment: p } = await createPayment(store, token, {
      key: randomUUID(),
      bank: 'sbi',
      receiver: 'pay-aanya',
      recipientName: 'Benchmark sample',
      amount: 450,
      scenario: 'normal',
      source: 'benchmark',
    });
    return {
      decision: p.assessment?.decision || null,
      timings: p.assessment?.timings || {},
      serverMs: performance.now() - start,
      persisted: true,
      paymentId: p.id,
      scope:
        'Authenticated payment creation, shared ledger writes, feature extraction, model and decision persistence; no settlement',
    };
  }
  const start = performance.now(),
    { data: s } = await store.read(),
    a = session(s, token);
  requireInvestigator(a);
  const at = Date.now(),
    sender = 'benchmark-sender',
    history = Array.from({ length: 12 }, (_, i) => ({
      sender,
      receiver: 'pay-aanya',
      amount: 400,
      timestamp: new Date(at - (i + 1) * 86400000).toISOString(),
      settled: true,
    }));
  const r = await defaultScore({
    demo: true,
    payment: {
      id: 'PAY-benchmark-' + randomUUID(),
      sender,
      receiver: 'pay-aanya',
      amount: 450,
      timestamp: stamp(),
      device: 'familiar',
    },
    history,
    behavior: { available: false },
  });
  return {
    decision: r.decision,
    timings: r.timings,
    serverMs: performance.now() - start,
    persisted: false,
    scope: 'Authenticated database read and assessment; no ledger writes',
  };
}

/* Assessed synthetic overview records. No customer account or settlement is touched. */
export async function loadOverviewSamples(store, token, score = defaultScore) {
  const before = (await store.read()).data;
  requireInvestigator(session(before, token));
  const existing = before.payments.filter((p) => p.source === 'overview-sample');
  if (existing.length) return { added: 0, count: existing.length };
  if (before.payments.length + 500 > 1000)
    fail(
      'Not enough workspace capacity for 500 samples. Export or clear simulator records first.',
      409,
    );
  const prepared = [],
    batchId = randomUUID();
  for (let i = 0; i < 500; i++) {
    const now = Date.now(),
      sender = 'demo-' + (i + 1),
      receiver = 'hub-' + (1 + (i % 12));
    const kind =
      i % 100 < 85
        ? 'normal'
        : i % 100 < 91
          ? 'verify'
          : i % 100 < 96
            ? 'ring'
            : i % 100 < 98
              ? 'cycle'
              : 'amount';
    const amount = kind === 'amount' ? 12500 : 100 + ((i * 137) % 800);
    const history = Array.from({ length: 12 }, (_, j) => ({
      sender,
      receiver,
      amount: 450 + j * 10,
      timestamp: new Date(now - (j + 1) * 86400000).toISOString(),
      settled: true,
    }));
    if (kind === 'ring')
      for (let j = 0; j < 5; j++)
        history.push({
          sender: 'demo-' + (1000 + i * 5 + j),
          receiver: sender,
          amount: 2000,
          timestamp: new Date(now - 30000 - j * 1000).toISOString(),
          settled: true,
        });
    if (kind === 'cycle')
      history.push(
        {
          sender: receiver,
          receiver: 'hub-' + (100 + i),
          amount: 1000,
          timestamp: new Date(now - 20000).toISOString(),
          settled: true,
        },
        {
          sender: 'hub-' + (100 + i),
          receiver: sender,
          amount: 1000,
          timestamp: new Date(now - 10000).toISOString(),
          settled: true,
        },
      );
    const payment = {
      id: 'PAY-OVERVIEW-' + batchId + '-' + String(i + 1).padStart(6, '0'),
      sender,
      receiver,
      amount,
      timestamp: new Date(now).toISOString(),
      device: 'familiar',
    };
    let assessment = null,
      error = null;
    try {
      assessment = await score({
        demo: true,
        payment,
        history,
        behavior: { available: false },
        extraVerification: kind === 'verify',
      });
      // Keep every check outcome while avoiding 500 copies of the rule catalogue.
      if (Array.isArray(assessment.protection?.checks)) {
        assessment.protection.checks = assessment.protection.checks.map(({ id, status }) => ({
          id,
          status,
        }));
        assessment.protection.checksScope =
          'Compact sample outcomes; rule descriptions are available in the scenario library.';
      }
    } catch {
      error = 'Sample assessment failed. No settlement is permitted.';
    }
    prepared.push({
      ...payment,
      userId: 'overview-samples',
      key: 'overview-' + i,
      bank: 'sbi',
      recipientName: 'HUB ' + (1 + (i % 12)),
      source: 'overview-sample',
      scenario: kind,
      simulated: true,
      assessment,
      error,
      status: error
        ? 'Assessment failed'
        : assessment.decision === 'Allow'
          ? 'Allowed'
          : assessment.decision === 'Verify'
            ? 'Verification required'
            : 'Held for review',
      caseStatus: assessment?.decision === 'Flag' ? 'Open' : null,
      timeline: [],
      graphHistory: history.filter((h) => now - Date.parse(h.timestamp) <= 120000),
      behavior: { available: false },
    });
  }
  return store.mutate((s) => {
    const actor = session(s, token);
    requireInvestigator(actor);
    const existing = s.payments.filter((p) => p.source === 'overview-sample');
    if (existing.length) return { added: 0, count: existing.length };
    if (s.payments.length + prepared.length > 1000) fail('Workspace record limit reached.', 409);
    s.users['overview-samples'] = {
      banks: { sbi: { balance: 1000000, connectedAt: stamp() } },
      baseline: null,
      overviewInitialized: true,
    };
    for (const preparedPayment of prepared) {
      const p = structuredClone(preparedPayment);
      s.payments.push(p);
      audit(
        s,
        p,
        'Overview synthetic sample assessed',
        actor,
        'Generated sample. No settlement or customer debit.',
      );
    }
    if (
      Buffer.byteLength(
        JSON.stringify({
          payments: s.payments,
          history: s.history.slice(-500),
          audit: s.audit.slice(-100),
        }),
      ) > 4000000
    )
      fail(
        'The sample pack would exceed the dashboard response limit. Export or clear simulator records first.',
        409,
      );
    return { added: prepared.length, count: prepared.length };
  });
}
