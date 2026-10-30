/* Credentials are accepted on stdin, never command arguments or logs. */
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
if (process.stdin.isTTY) process.stdin.setRawMode(true);
process.stdout.write('Ready for verification JSON on stdin (input is hidden).\n');
const input = await new Promise((resolve) => {
  let s = '';
  process.stdin.on('data', (b) => {
    s += b.toString();
    if (s.includes('\n')) {
      if (process.stdin.isTTY) process.stdin.setRawMode(false);
      process.stdin.pause();
      resolve(JSON.parse(s.trim()));
    }
  });
});
const base = input.base;
function client(role = 'customer') {
  let cookies = {};
  return {
    async call(body, expected = 200) {
      const start = performance.now(),
        r = await fetch(base + '/api/workspace', {
          method: body ? 'POST' : 'GET',
          headers: {
            Origin: base,
            'Content-Type': 'application/json',
            Cookie: Object.entries(cookies)
              .map(([k, v]) => k + '=' + v)
              .join('; '),
            ...(role === 'investigator' ? { 'X-Shield-Role': 'investigator' } : {}),
          },
          body: body ? JSON.stringify(body) : undefined,
          signal: AbortSignal.timeout(20000),
        });
      for (const c of r.headers.getSetCookie()) {
        const [k, v] = c.split(';')[0].split('=');
        cookies[k] = v;
      }
      const data = await r.json();
      assert.equal(r.status, expected, JSON.stringify(data));
      return { data, ms: performance.now() - start };
    },
  };
}
const customer = client(),
  admin = client('investigator'),
  other = client();
await customer.call({ action: 'bootstrap' });
await other.call({ action: 'bootstrap' });
await customer.call({ action: 'connect', bank: 'sbi', consent: true, code: '123456' });
await admin.call({ action: 'login', code: input.code });
const request = {
  action: 'create',
  bank: 'sbi',
  amount: 251,
  receiver: 'pay-aanya',
  recipientName: 'Aanya',
  key: crypto.randomUUID(),
  scenario: 'normal',
};
const normal = await customer.call(request);
assert.equal(normal.data.payment.status, 'Allowed');
const id = normal.data.payment.id;
await customer.call({ action: 'clientTiming', id, ms: normal.ms });
assert((await admin.call()).data.payments.some((p) => p.id === id));
assert(!(await other.call()).data.payments.some((p) => p.id === id));
await Promise.all([
  customer.call({ action: 'settle', id, code: '123456' }),
  customer.call({ action: 'settle', id, code: '123456' }),
]);
assert.equal((await customer.call()).data.account.banks.sbi.balance, 24749);
const held = await customer.call({
  ...request,
  key: crypto.randomUUID(),
  scenario: 'ring',
  amount: 4000,
});
const holdId = held.data.payment.id;
assert.equal(held.data.payment.status, 'Held for review');
await customer.call({ action: 'clientTiming', id: holdId, ms: held.ms });
await customer.call({ action: 'settle', id: holdId, code: '123456' }, 409);
await customer.call(
  { action: 'review', id: holdId, outcome: 'release', note: 'Must not allow customer release' },
  403,
);
assert(
  (await admin.call()).data.payments.some((p) => p.id === holdId && p.status === 'Held for review'),
);
await admin.call({
  action: 'review',
  id: holdId,
  outcome: 'release',
  note: 'Synthetic evidence inspected during end to end validation; release for customer authorisation.',
});
assert.equal((await customer.call()).data.payments.find((p) => p.id === holdId).status, 'Allowed');
await customer.call({ action: 'settle', id: holdId, code: '123456' });
assert.equal((await admin.call()).data.payments.find((p) => p.id === holdId).status, 'Settled');
const reports = [];
for (const concurrency of input.concurrency || [1, 3, 5]) {
  let index = 0,
    lat = [],
    attempts = [],
    scores = [],
    backend = [],
    dbRead = [],
    dbWrite = [],
    failures = 0;
  const start = performance.now();
  async function worker() {
    while (index++ < (input.count || 20)) {
      const attemptStart = performance.now();
      try {
        const r = await admin.call({ action: 'benchmark', mode: input.mode || 'assessment' });
        lat.push(r.ms);
        scores.push(r.data.timings.scoringMs);
        backend.push(r.data.requestTiming?.handlerMs);
        dbRead.push(r.data.requestTiming?.databaseReadMs || 0);
        dbWrite.push(r.data.requestTiming?.databaseWriteMs || 0);
      } catch {
        failures++;
      } finally {
        attempts.push(performance.now() - attemptStart);
      }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  const wall = performance.now() - start,
    q = (a, p) => {
      a.sort((x, y) => x - y);
      return a[Math.min(a.length - 1, Math.ceil(a.length * p) - 1)] ?? null;
    };
  reports.push({
    concurrency,
    success: lat.length,
    failures,
    P50: q(attempts, 0.5),
    P95: q(attempts, 0.95),
    P99: q(attempts, 0.99),
    max: attempts.length ? Math.max(...attempts) : null,
    modelP95: q(scores, 0.95),
    backendP95: q(backend, 0.95),
    databaseReadP95: q(dbRead, 0.95),
    databaseWriteP95: q(dbWrite, 0.95),
    under500: lat.filter((v) => v < 500).length,
    throughput: lat.length / (wall / 1000),
  });
}
if (input.mode === 'ledger') await admin.call({ action: 'resetBenchmark' });
const result = {
  passed: true,
  recordedAt: new Date().toISOString(),
  temporalGraphVersion: normal.data.payment.assessment.intelligence?.temporalGraphModel?.version,
  temporalReviewThreshold:
    normal.data.payment.assessment.intelligence?.temporalGraphModel?.reviewThreshold,
  normalRequestMs: normal.ms,
  normalModelMs: normal.data.payment.assessment.timings.scoringMs,
  normalBackendTiming: normal.data.requestTiming,
  heldRequestMs: held.ms,
  heldModelMs: held.data.payment.assessment.timings.scoringMs,
  heldBackendTiming: held.data.requestTiming,
  normalId: id,
  heldId: holdId,
  checks: [
    'independent authenticated sessions',
    'shared alert visibility',
    'ownership isolation',
    'concurrent single debit',
    'held settlement restriction',
    'protected investigator release',
    'customer state and audit propagation',
  ],
  benchmarkScope:
    input.mode === 'ledger'
      ? 'Network + database authentication + payment creation, assessment and decision writes; no settlement. Measured from executor, not physical devices.'
      : 'Network + database authentication + assessment; no benchmark ledger writes. Measured from executor, not the phone.',
  reports,
};
writeFileSync(
  input.label === 'records'
    ? 'tests/live-record-storage-20261030.json'
    : input.mode === 'ledger'
      ? 'tests/live-ledger-verification-20261030.json'
      : 'tests/live-verification-20261030.json',
  JSON.stringify(result, null, 2) + '\n',
);
console.log(JSON.stringify(result, null, 2));
