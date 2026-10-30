import assert from 'node:assert/strict';
process.env.SHIELD_LOCAL_DB = ':memory:';
delete process.env.INVESTIGATOR_ACCESS_CODE;
const handler = (await import('../api/workspace.mjs')).default;
const origin = 'http://localhost';
function client(role = 'customer') {
  let cookies = {};
  return {
    async call(body, expected = 200) {
      const r = await handler.fetch(
        new Request(origin + '/api/workspace', {
          method: body ? 'POST' : 'GET',
          headers: {
            origin,
            'Content-Type': 'application/json',
            Cookie: Object.entries(cookies)
              .map(([k, v]) => k + '=' + v)
              .join('; '),
            ...(role === 'investigator' ? { 'X-Shield-Role': 'investigator' } : {}),
          },
          body: body ? JSON.stringify(body) : undefined,
        }),
      );
      const c = r.headers.get('set-cookie');
      if (c) {
        const [k, v] = c.split(';')[0].split('=');
        cookies[k] = v;
      }
      const data = await r.json();
      assert.equal(r.status, expected, JSON.stringify(data));
      return data;
    },
  };
}
const c = client(),
  other = client(),
  a = client('investigator');
await c.call({ action: 'bootstrap' });
await other.call({ action: 'bootstrap' });
await c.call({ action: 'connect', bank: 'sbi', consent: true, code: '123456' });
const demoSession = await a.call({ action: 'bootstrap' });
assert.equal(demoSession.actor.role, 'investigator');
const repeatedSession = await a.call({ action: 'bootstrap' });
assert.deepEqual(repeatedSession.actor, demoSession.actor);
assert.equal((await c.call()).actor.role, 'customer');
console.log('PASS: command center opens without an access code; refresh reuses its session and customer sessions remain separate.');
const payment = {
  action: 'create',
  key: 'normal-request-123',
  bank: 'sbi',
  receiver: 'pay-aanya',
  recipientName: 'Aanya',
  amount: 250,
  scenario: 'normal',
};
let result = await c.call(payment);
assert.equal(result.payment.status, 'Allowed');
let admin = await a.call();
assert(admin.payments.some((p) => p.id === result.payment.id));
assert(!(await other.call()).payments.some((p) => p.id === result.payment.id));
await other.call({ action: 'settle', id: result.payment.id, code: '123456' }, 404);
await c.call({ ...payment, key: 'reject-history-123', history: [] }, 400);
const dup = await c.call(payment);
assert.equal(dup.payment.id, result.payment.id);
const settled = await Promise.all([
  c.call({ action: 'settle', id: result.payment.id, code: '123456' }),
  c.call({ action: 'settle', id: result.payment.id, code: '123456' }),
]);
assert(settled.every((s) => s.payment.status === 'Settled'));
assert.equal((await c.call()).account.banks.sbi.balance, 24750);
let held = (await c.call({ ...payment, key: 'ring-request-123', scenario: 'ring' })).payment;
assert.equal(held.status, 'Held for review');
await c.call({ action: 'settle', id: held.id, code: '123456' }, 409);
await c.call(
  { action: 'review', id: held.id, outcome: 'release', note: 'Customer cannot approve' },
  403,
);
await a.call({
  action: 'review',
  id: held.id,
  outcome: 'cancel',
  note: 'Network evidence requires cancellation',
});
assert.equal((await c.call()).payments.find((p) => p.id === held.id).status, 'Cancelled');
assert(
  (await a.call()).payments
    .find((p) => p.id === held.id)
    .timeline.some((t) => t.role === 'investigator'),
);
console.log(
  'PASS: independent customer/admin sessions share durable records; ownership, idempotency, concurrent single debit, held payment gating, protected review and audit propagation.',
);

await c.call({
  action: 'baseline',
  consent: true,
  baseline: { typingMean: 100, typingSpread: 10, swipeSpeed: 1 },
});
const compared = (
  await c.call({
    ...payment,
    key: 'behavior-comparison-123',
    behavior: { consent: true, typingMean: 250, swipeSpeed: 2 },
  })
).payment;
assert.equal(compared.behavior.available, true);
assert(compared.behavior.deviation > 2);
const noComparison = (await c.call({ ...payment, key: 'behavior-missing-123' })).payment;
assert.equal(noComparison.behavior.available, false);
await c.call({ action: 'baseline', consent: true, clear: true });
const afterClear = (
  await c.call({
    ...payment,
    key: 'behavior-cleared-123',
    behavior: { consent: true, typingMean: 250, swipeSpeed: 2 },
  })
).payment;
assert.equal(afterClear.behavior.available, false);
await c.call({ action: 'benchmark' }, 403);
const bench = await a.call({ action: 'benchmark' });
assert.equal(bench.persisted, false);
assert(Number.isFinite(bench.timings.scoringMs));
console.log(
  'PASS: consent based baseline, derived comparison, unavailable signals after clearing, and authenticated benchmark.',
);
const ledgerBench = await a.call({ action: 'benchmark', mode: 'ledger' });
assert.equal(ledgerBench.persisted, true);
assert(ledgerBench.paymentId);
assert(!(await a.call()).payments.some((p) => p.id === ledgerBench.paymentId));
await c.call({ action: 'benchmark', mode: 'ledger' }, 403);
await a.call({ action: 'resetBenchmark' });
const internal = (await (await import('../lib/store.mjs')).getStore()).read;
assert(!(await internal()).data.payments.some((p) => p.source === 'benchmark'));
console.log(
  'PASS: ledger benchmark includes persistence, requires investigator access, is excluded from operational counts and cleans up safely.',
);
const recoveryStore = await (await import('../lib/store.mjs')).getStore();
await recoveryStore.mutate((s) => {
  s.payments.push({
    id: 'interrupted-assessment',
    userId: Object.values(s.sessions).find((x) => x.role === 'customer').userId,
    status: 'Pending assessment',
    timestamp: new Date(Date.now() - 180000).toISOString(),
    timeline: [],
  });
});
await a.call();
const recovered = (await recoveryStore.read()).data.payments.find(
  (p) => p.id === 'interrupted-assessment',
);
assert.equal(recovered.status, 'Assessment failed');
assert(recovered.timeline.some((e) => e.role === 'service'));
console.log('PASS: abandoned pending assessments fail closed with a timestamped recovery audit.');
