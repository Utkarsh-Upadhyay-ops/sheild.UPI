const assert = require('node:assert/strict'),
  P = require('../dist/pipeline.js'),
  model = require('../dist/model.json');
const now = Date.now(),
  stamp = (n) => new Date(now - n).toISOString();
const history = Array.from({ length: 10 }, (_, i) => ({
  sender: 'sbi-account',
  receiver: 'merchant-' + i,
  amount: 500 + i * 10,
  timestamp: stamp((i + 1) * 86400000),
}));
const body = () => ({
  demo: true,
  payment: {
    id: 'PAY-test-12345',
    sender: 'sbi-account',
    receiver: 'merchant-1',
    amount: 650,
    timestamp: stamp(0),
    device: 'familiar',
  },
  history: structuredClone(history),
  behavior: { available: false },
});
let normal = P.assess(model, body());
assert.equal(normal.decision, 'Allow');
assert.equal(normal.behavior.available, false);
assert.equal(normal.signals.fanin, 0);
assert.equal(normal.profile.count, 10);
assert(normal.timings.scoringMs >= 0);
let verify = body();
verify.extraVerification = true;
assert.equal(P.assess(model, verify).decision, 'Verify');
let ring = body();
ring.history.push(
  ...Array.from({ length: 4 }, (_, i) => ({
    sender: 'funder-' + i,
    receiver: 'sbi-account',
    amount: 3000,
    timestamp: stamp(30000 + i * 1000),
  })),
);
let r = P.assess(model, ring);
assert.equal(r.decision, 'Flag');
assert.equal(r.graph.fanin, 4);
assert.equal(r.signals.fanin, 4, 'model receives derived graph feature');
let cycle = body();
cycle.payment.receiver = 'a';
cycle.history.push(
  { sender: 'a', receiver: 'b', amount: 1000, timestamp: stamp(20000) },
  { sender: 'b', receiver: 'sbi-account', amount: 1000, timestamp: stamp(10000) },
);
assert.equal(P.assess(model, cycle).graph.cycle, true);
assert.equal(P.assess(model, cycle).decision, 'Flag');
let old = body();
old.history.push(
  ...Array.from({ length: 4 }, (_, i) => ({
    sender: 'old-' + i,
    receiver: 'sbi-account',
    amount: 1000,
    timestamp: stamp(180000 + i * 1000),
  })),
);
assert.equal(P.assess(model, old).graph.fanInPattern, false);
let future = body();
future.history.push({
  sender: 'later',
  receiver: 'sbi-account',
  amount: 1000,
  timestamp: new Date(now + 10000).toISOString(),
});
assert.equal(P.assess(model, future).graph.fanin, 0);
assert.throws(() => P.assess(model, { ...body(), demo: false }));
assert.throws(() => P.assess(model, { ...body(), history: Array(501).fill(history[0]) }));
let invalid = body();
invalid.payment.amount = -1;
assert.throws(() => P.assess(model, invalid));
let p = { status: 'Created' };
assert.throws(() => P.transition(p, 'Settled'));
P.transition(p, 'Checking');
P.transition(p, 'Held for review');
assert.throws(() => P.transition(p, 'Settled'));
assert.throws(() => P.transition(p, 'Ready to settle', 'customer'));
P.transition(p, 'Ready to settle', 'investigator');
P.transition(p, 'Settled');
assert.throws(() => P.transition(p, 'Settled'));
assert.throws(() => P.transition(p, 'Cancelled'));
let failed = { status: 'Created' };
P.transition(failed, 'Checking');
P.transition(failed, 'Assessment failed');
assert.throws(() => P.transition(failed, 'Settled'));
P.transition(failed, 'Checking');
P.transition(failed, 'Verification required');
P.transition(failed, 'Cancelled');
assert.throws(() => P.transition(failed, 'Ready to settle'));
console.log(
  'Passed pipeline checks: derived profile, optional interaction handling, graph feature integration, coherent fan in, cycle detection, timestamp windows, request validation and settlement state gating.',
);
let notSettled = body();
notSettled.history.push(
  {
    sender: 'demo-huge',
    receiver: 'sbi-account',
    amount: 100000,
    timestamp: stamp(10000),
    settled: false,
  },
  {
    sender: 'sbi-account',
    receiver: 'pending-target',
    amount: 9000000,
    timestamp: stamp(9000),
    settled: false,
  },
);
let pendingResult = P.assess(model, notSettled);
assert.equal(
  pendingResult.graph.fanin,
  0,
  'pending transfers do not become money movement graph edges',
);
assert.equal(
  pendingResult.profile.count,
  10,
  'pending transfers do not distort the settled profile',
);
