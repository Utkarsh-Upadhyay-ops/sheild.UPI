const assert = require('node:assert/strict'),
  T = require('../dist/temporal-graph.js'),
  model = require('../dist/temporal-graph-model.json'),
  fixtures = require('./temporal-graph-parity.json'),
  report = require('../dist/temporal-graph-evaluation.json');
for (const f of fixtures) {
  const features = T.features(f.history, f.payment),
    scored = T.score(model, f.history, f.payment),
    map = new Map(scored.accounts.map((a) => [a.id, a.risk]));
  features.ids.forEach((id, i) => assert(Math.abs(map.get(id) - f.expected[i]) < 1e-10));
  assert(scored.candidateIncluded);
  assert.equal(scored.messagePassingHops, 2);
  assert(scored.accounts.every((a) => a.risk >= 0 && a.risk <= 1));
}
const at = Date.now(),
  p = { sender: 'alice', receiver: 'bob', amount: 250, timestamp: new Date(at).toISOString() },
  out = T.features(
    [
      {
        sender: 'old',
        receiver: 'alice',
        amount: 500,
        timestamp: new Date(at - 121000).toISOString(),
        settled: true,
      },
      {
        sender: 'pending',
        receiver: 'alice',
        amount: 500,
        timestamp: new Date(at).toISOString(),
        settled: false,
      },
    ],
    p,
  );
assert.equal(out.edges, 0);
assert(!out.ids.includes('pending'));
assert(!out.ids.includes('old'));
assert(
  model.enabled &&
    report.test.precision >= 0.85 &&
    report.test.recall >= 0.3 &&
    report.rareTrafficStress.metrics.falsePositiveRate <= 0.0075,
);
console.log(
  'PASS: 12 Python/JS temporal GNN graph parity fixtures, candidate-edge distinction, settled-only timestamp windows and synthetic promotion guards.',
);
// IDs carry no labels: renaming accounts must preserve graph predictions.
const fixture = fixtures[0];
const renamed = T.score(
  model,
  fixture.history.map((e) => ({
    ...e,
    sender: 'renamed-' + e.sender,
    receiver: 'renamed-' + e.receiver,
  })),
  {
    ...fixture.payment,
    sender: 'renamed-' + fixture.payment.sender,
    receiver: 'renamed-' + fixture.payment.receiver,
  },
);
const original = T.score(model, fixture.history, fixture.payment);
for (const account of original.accounts)
  assert(
    Math.abs(account.risk - renamed.accounts.find((a) => a.id === 'renamed-' + account.id).risk) <
      1e-10,
  );
assert(original.accounts.every((a) => a.evidence && typeof a.evidence.circularPath === 'boolean'));
console.log('PASS: account identity permutation invariance and per-account structural evidence.');
