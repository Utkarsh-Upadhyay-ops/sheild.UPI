import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url),
  I = require('../dist/intelligence.js'),
  m = require('../dist/intelligence-model.json'),
  handler = (await import('../api/assess.mjs')).default;
const now = Date.now(),
  history = Array.from({ length: 8 }, (_, i) => ({
    sender: 'alice',
    receiver: 'merchant',
    amount: 650,
    timestamp: new Date(now - (i + 1) * 86400000).toISOString(),
  })),
  base = {
    demo: true,
    payment: {
      id: 'PAY-intelligence-test',
      sender: 'alice',
      receiver: 'merchant',
      amount: 700,
      timestamp: new Date(now).toISOString(),
      device: 'familiar',
    },
    history,
    behavior: { available: false },
  };
async function check(body) {
  let r = await handler.fetch(
    new Request('http://localhost/api/assess', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );
  assert.equal(r.status, 200);
  return r.json();
}
let normal = await check(base);
assert(normal.intelligence);
assert(normal.intelligence.anomalyScore >= 0 && normal.intelligence.anomalyScore <= 1);
assert.equal(normal.intelligence.geo.available, false);
let travel = await check({
  ...base,
  session: {
    locations: [
      { lat: 28.61, lon: 77.2, time: new Date(now - 600000).toISOString() },
      { lat: 19.07, lon: 72.87, time: new Date(now).toISOString() },
    ],
  },
});
assert.equal(travel.decision, 'Flag');
assert.equal(travel.settlementPermitted, false);
let shared = await check({ ...base, session: { accountsOnDevice: ['a', 'b', 'c', 'd'] } });
assert.equal(shared.decision, 'Flag');
assert(shared.reasons.some((x) => x.includes('device')));
let malformed = await check({ ...base, session: { locations: [{ lat: NaN }, { lat: 200 }] } });
assert.equal(malformed.intelligence.geo.available, false);
assert(I.distance({ lat: 0, lon: 0 }, { lat: 0, lon: 0 }) === 0);
assert(
  m.graph.trainingGraphs === 650 && m.graph.validationGraphs === 125 && m.graph.testGraphs === 125,
);
console.log(
  'Passed integrated intelligence tests: model inference, unavailable location, travel and device holds, malformed context and settlement gating.',
);
