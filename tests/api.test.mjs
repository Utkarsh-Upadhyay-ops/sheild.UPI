import assert from 'node:assert/strict';
import handler from '../api/assess.mjs';
const now = Date.now(),
  body = {
    demo: true,
    payment: {
      id: 'PAY-api-12345',
      sender: 'demo-user',
      receiver: 'merchant-1',
      amount: 500,
      timestamp: new Date(now).toISOString(),
      device: 'familiar',
    },
    history: Array.from({ length: 5 }, (_, i) => ({
      sender: 'demo-user',
      receiver: 'merchant-' + i,
      amount: 500,
      timestamp: new Date(now - (i + 1) * 86400000).toISOString(),
    })),
    behavior: { available: false },
  };
let r = await handler.fetch(new Request('https://demo.test/api/assess'));
assert.equal(r.status, 405);
r = await handler.fetch(
  new Request('https://demo.test/api/assess', { method: 'POST', body: 'text' }),
);
assert.equal(r.status, 415);
r = await handler.fetch(
  new Request('https://demo.test/api/assess', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{broken',
  }),
);
assert.equal(r.status, 400);
r = await handler.fetch(
  new Request('https://demo.test/api/assess', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }),
);
assert.equal(r.status, 200);
let result = await r.json();
assert.equal(result.paymentId, body.payment.id);
assert.equal(result.decision, 'Allow');
assert.equal(result.demo, true);
assert.equal(r.headers.get('cache-control'), 'no-store');
assert(r.headers.get('server-timing').includes('model;dur='));
let outcomes = await Promise.all(
  Array.from({ length: 20 }, async () => {
    let r = await handler.fetch(
      new Request('https://demo.test/api/assess', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
    );
    assert.equal(r.status, 200);
    return r.json();
  }),
);
assert(outcomes.every((r) => r.decision === 'Allow'));
console.log(
  'Passed endpoint checks: methods, content type, malformed JSON, valid requests, no-store/timing headers and 20 concurrent local handler requests. Not a network load test.',
);
