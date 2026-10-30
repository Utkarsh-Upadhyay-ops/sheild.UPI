import assert from 'node:assert/strict';
process.env.SHIELD_LOCAL_DB = ':memory:';
process.env.INVESTIGATOR_ACCESS_CODE = 'overview-test-only-code';
const W = await import('../lib/workspace.mjs');
const { getStore } = await import('../lib/store.mjs');
const store = await getStore();
const customer = await W.bootstrap(store, '');
await W.command(store, customer.token, {
  action: 'connect',
  bank: 'sbi',
  consent: true,
  code: '123456',
});
const own = await W.createPayment(store, customer.token, {
  key: 'overview-own-payment',
  bank: 'sbi',
  receiver: 'pay-aanya',
  recipientName: 'Aanya',
  amount: 250,
  scenario: 'normal',
});
await assert.rejects(
  () => W.loadOverviewSamples(store, customer.token),
  (e) => e.status === 403,
);
await assert.rejects(
  () => W.loadOverviewSamples(store, ''),
  (e) => e.status === 401,
);
const admin = await W.login(store, process.env.INVESTIGATOR_ACCESS_CODE, 'local-test', '');
const started = performance.now();
const result = await W.loadOverviewSamples(store, admin);
assert.equal(result.added, 500);
const snapshot = await W.view(store, admin);
const samples = snapshot.payments.filter((p) => p.source === 'overview-sample');
assert.equal(samples.length, 500);
assert(
  Buffer.byteLength(JSON.stringify(snapshot)) < 4000000,
  'Keep the initial dashboard response below the hosting response limit',
);
assert(samples.every((p) => p.assessment && p.status !== 'Settled' && p.timeline.length));
assert(samples.filter((p) => p.assessment.decision === 'Allow').length > 300);
assert(samples.some((p) => p.assessment.decision === 'Flag'));
assert(samples.some((p) => p.assessment.decision === 'Verify'));
assert.equal((await W.loadOverviewSamples(store, admin)).added, 0);
const cv = await W.view(store, customer.token);
assert.equal(cv.payments.length, 1);
assert.equal(cv.payments[0].id, own.payment.id);
assert.equal(cv.account.banks.sbi.balance, 25000);
await assert.rejects(
  () => W.command(store, customer.token, { action: 'clearOverviewSamples' }),
  (e) => e.status === 403,
);
await W.command(store, admin, { action: 'clearOverviewSamples' });
const cleared = await W.view(store, admin);
assert.equal(cleared.payments.length, 1);
assert(cleared.overviewSamples.initialized);
assert.equal(cleared.payments[0].id, own.payment.id);
console.log(
  'PASS: 500 model-assessed overview records, mixed decisions, idempotency, investigator-only actions, customer isolation, unchanged balances and selective cleanup.',
  JSON.stringify({
    generationAndChecksMs: performance.now() - started,
    allowed: samples.filter((p) => p.assessment.decision === 'Allow').length,
    verify: samples.filter((p) => p.assessment.decision === 'Verify').length,
    flag: samples.filter((p) => p.assessment.decision === 'Flag').length,
  }),
);
