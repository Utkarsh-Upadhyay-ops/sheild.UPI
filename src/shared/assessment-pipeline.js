/* Shared browser/server demo assessment pipeline. No money movement. */
(function (root) {
  const E = typeof module !== 'undefined' ? require('./engine.js') : root.ShieldEngine;
  const account = /^[a-zA-Z0-9_.-]{1,40}$/;
  function validate(body) {
    if (!body || body.demo !== true) throw Error('This endpoint accepts demo requests only.');
    const t = body.payment;
    if (
      !t ||
      !/^PAY-[a-zA-Z0-9-]{5,80}$/.test(t.id) ||
      !account.test(t.sender) ||
      !account.test(t.receiver) ||
      t.sender === t.receiver ||
      !Number.isFinite(t.amount) ||
      t.amount < 1 ||
      t.amount > 1e7 ||
      typeof t.timestamp !== 'string' ||
      !Number.isFinite(Date.parse(t.timestamp))
    )
      throw Error('Invalid demo payment.');
    if (Math.abs(Date.now() - Date.parse(t.timestamp)) > 300000)
      throw Error('Payment timestamp is outside the five minute demo window.');
    if (typeof t.device !== 'string' || !['familiar', 'new'].includes(t.device))
      throw Error('Invalid device context.');
    if (!Array.isArray(body.history) || body.history.length > 500)
      throw Error('Provide at most 500 sample history events.');
    for (const h of body.history) {
      if (
        !h ||
        !account.test(h.sender) ||
        !account.test(h.receiver) ||
        h.sender === h.receiver ||
        !Number.isFinite(h.amount) ||
        h.amount < 1 ||
        h.amount > 1e7 ||
        typeof h.timestamp !== 'string' ||
        !Number.isFinite(Date.parse(h.timestamp))
      )
        throw Error('Invalid history event.');
    }
    if (body.extraVerification !== undefined && typeof body.extraVerification !== 'boolean')
      throw Error('Invalid verification policy.');
    if (body.behavior !== null && body.behavior !== undefined) {
      let b = body.behavior;
      if (
        typeof b !== 'object' ||
        typeof b.available !== 'boolean' ||
        (b.available && (!Number.isFinite(b.deviation) || b.deviation < 0 || b.deviation > 6))
      )
        throw Error('Invalid interaction context.');
    }
    return body;
  }
  function profile(history, sender, at = Date.now()) {
    const h = history.filter(
        (h) => h.sender === sender && h.settled !== false && Date.parse(h.timestamp) <= at,
      ),
      amounts = h.map((h) => h.amount).sort((a, b) => a - b);
    return {
      count: h.length,
      average: amounts.length ? amounts.reduce((a, b) => a + b, 0) / amounts.length : 1000,
      median: amounts.length ? amounts[Math.floor(amounts.length / 2)] : 1000,
      recipients: [...new Set(h.map((h) => h.receiver))],
      baselineAvailable: h.length >= 3,
    };
  }
  function graphFeatures(history, t) {
    let at = Date.parse(t.timestamp),
      recent = history.filter((h) => {
        if (h.settled === false) return false;
        let age = at - Date.parse(h.timestamp);
        return age >= 0 && age <= 120000;
      }),
      incoming = recent.filter((h) => h.receiver === t.sender),
      fanin = new Set(incoming.map((h) => h.sender)).size;
    let adjacency = new Map();
    for (const h of recent) {
      if (!adjacency.has(h.sender)) adjacency.set(h.sender, new Set());
      adjacency.get(h.sender).add(h.receiver);
    }
    let found = null,
      queue = [[t.receiver]],
      visited = new Set([t.receiver]);
    for (let i = 0; i < queue.length; i++) {
      let path = queue[i],
        id = path[path.length - 1];
      if (id === t.sender) {
        found = path;
        break;
      }
      if (path.length >= 5) continue;
      for (const n of adjacency.get(id) || [])
        if (!visited.has(n)) {
          visited.add(n);
          queue.push([...path, n]);
        }
    }
    return {
      fanin,
      rapid: fanin > 0,
      fanInPattern: fanin >= 3,
      cycle: !!found,
      cyclePath: found ? [t.sender, ...found] : [],
      windowSeconds: 120,
      evidence: incoming
        .map((h) => ({
          sender: h.sender,
          receiver: h.receiver,
          amount: h.amount,
          timestamp: h.timestamp,
        }))
        .slice(-12),
    };
  }
  function assess(model, body) {
    const start = performance.now();
    validate(body);
    let t = body.payment,
      at = Date.parse(t.timestamp),
      s = performance.now(),
      past = body.history.filter((h) => Date.parse(h.timestamp) <= at),
      p = profile(past, t.sender, at),
      featuresMs = performance.now() - s;
    s = performance.now();
    let graph = graphFeatures(past, t),
      graphMs = performance.now() - s;
    s = performance.now();
    let behavior = {
        available: !!body.behavior?.available,
        deviation: body.behavior?.available ? body.behavior.deviation : 0,
      },
      behaviorMs = performance.now() - s;
    let times = past.filter(
        (h) => h.sender === t.sender && at - Date.parse(h.timestamp) <= 600000,
      ).length,
      seen = past
        .filter((h) => h.sender === t.receiver || h.receiver === t.receiver)
        .map((h) => Date.parse(h.timestamp));
    let signals = {
      amount: t.amount,
      average: p.median,
      velocity: Math.min(1000, times + 1),
      age: seen.length
        ? Math.min(20000, Math.max(0, Math.floor((at - Math.min(...seen)) / 86400000)))
        : 0,
      newRecipient: !p.recipients.includes(t.receiver),
      newDevice: t.device === 'new',
      night:
        new Date(at + 330 * 60000).getUTCHours() >= 23 ||
        new Date(at + 330 * 60000).getUTCHours() < 6,
      fanin: Math.min(1000, graph.fanin),
      rapid: graph.rapid,
      behavior: behavior.deviation,
    };
    let scored = E.score(model, signals);
    s = performance.now();
    let policy = { verify: 0.2, flag: 0.65 },
      decision = E.decision(scored.value, policy),
      reasons = [];
    if (graph.fanInPattern) {
      decision = 'Flag';
      reasons.push(
        'At least three senders paid this account within 120 seconds before this onward transfer.',
      );
    }
    if (graph.cycle) {
      decision = 'Flag';
      reasons.push('This payment completes a transfer cycle within the recent account graph.');
    }
    if (signals.newRecipient)
      reasons.push('The recipient is not present in this sender’s sample payment history.');
    if (signals.amount > signals.average * 5)
      reasons.push('The amount exceeds five times this sender’s typical (median) sample payment.');
    if (signals.velocity >= 5)
      reasons.push('At least five payments were requested by this sender within ten minutes.');
    if (signals.newDevice) reasons.push('This demo session uses the unfamiliar device scenario.');
    if (behavior.available && behavior.deviation > 2)
      reasons.push('Interaction timing differs from the session’s experimental baseline.');
    if (!behavior.available)
      reasons.push(
        'No measured interaction comparison was supplied; the demo uses a neutral behavior input.',
      );
    if (!p.baselineAvailable && decision === 'Allow') {
      decision = 'Verify';
      reasons.push('Not enough history to establish a baseline; an extra check is requested.');
    }
    if (body.extraVerification && decision === 'Allow') {
      decision = 'Verify';
      reasons.push('The selected demo policy requires an extra verification step.');
    }
    let policyMs = performance.now() - s;
    return {
      paymentId: t.id,
      decision,
      modelScore: scored.value,
      modelVersion: model.version,
      probabilityScope: model.calibration
        ? 'Calibrated on separate synthetic data only'
        : 'Uncalibrated synthetic model score',
      signals,
      profile: p,
      graph,
      behavior,
      reasons,
      contributions: scored.contributions,
      policy,
      timings: {
        featuresMs,
        graphMs,
        behaviorMs,
        scoringMs: scored.ms,
        policyMs,
        serverTotalMs: performance.now() - start,
      },
      settlementPermitted: decision === 'Allow',
      demo: true,
      trustBoundary:
        'Stateless sandbox assessment using client supplied sample history; no bank authorisation or real settlement.',
    };
  }
  const allowed = {
    Created: ['Checking', 'Cancelled'],
    Checking: ['Ready to settle', 'Verification required', 'Held for review', 'Assessment failed'],
    'Assessment failed': ['Checking', 'Cancelled'],
    'Ready to settle': ['Settled', 'Cancelled'],
    'Verification required': ['Ready to settle', 'Cancelled'],
    'Held for review': ['Ready to settle', 'Cancelled'],
    Settled: [],
    Cancelled: [],
  };
  function transition(payment, next, actor = 'customer') {
    if (!allowed[payment.status]?.includes(next)) throw Error('Invalid payment state transition.');
    if (
      payment.status === 'Held for review' &&
      next === 'Ready to settle' &&
      actor !== 'investigator'
    )
      throw Error('An investigator review is required.');
    payment.status = next;
    (payment.timeline ??= []).push({ status: next, time: new Date().toISOString(), actor });
    return payment;
  }
  const api = { validate, profile, graphFeatures, assess, transition };
  if (typeof module !== 'undefined') module.exports = api;
  else root.ShieldPipeline = api;
})(typeof window !== 'undefined' ? window : globalThis);
