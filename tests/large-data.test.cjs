const assert = require('node:assert/strict'),
  fs = require('node:fs');
const report = require('../reports/temporal-graph-evaluation.json');
const anomaly = require('../reports/anomaly-evaluation.json');
const examples = require('../public/graph-examples.json').examples;
const rows = fs.readFileSync('public/network-transfers.csv', 'utf8').trim().split('\n');
assert.equal(rows.shift(), 'sender,receiver,amount,timestamp,scenario');
const accounts = new Set();
for (const row of rows) {
  const [sender, receiver, amount, timestamp] = row.split(',');
  assert.notEqual(sender, receiver);
  assert(Number(amount) > 0);
  assert(Number.isFinite(Date.parse(timestamp)));
  accounts.add(sender);
  accounts.add(receiver);
}
const sample = examples.find((p) => p.dataset);
assert.equal(rows.length, sample.dataset.transfers);
assert.equal(accounts.size, sample.dataset.accounts);
const records = new Set(rows);
for (const edge of sample.graphHistory)
  assert(
    records.has(
      [edge.sender, edge.receiver, edge.amount, edge.timestamp, 'generated_mule'].join(','),
    ),
  );
assert.equal(sample.dataset.visibleHistoryTransfers, sample.graphHistory.length);
assert.equal(
  report.dataset.totalGraphs,
  Object.values(report.dataset.splits).reduce((n, s) => n + s.graphs, 0),
);
assert.equal(
  report.dataset.totalHistoricalTransfers,
  Object.values(report.dataset.splits).reduce((n, s) => n + s.historicalTransfers, 0),
);
assert.equal(new Set(Object.values(report.seeds)).size, 5);
assert(report.trainingGraphs >= 12000 && report.testGraphs >= 3000);
assert(anomaly.trainingCount >= 100000);
const T = require('../dist/temporal-graph.js'),
  model = require('../dist/temporal-graph-model.json');
for (const example of examples) {
  const actual = T.score(model, example.graphHistory, example);
  const saved = example.assessment.intelligence.temporalGraphModel;
  assert.equal(saved.version, model.version);
  assert(Math.abs(actual.sender - saved.sender) < 1e-10);
  assert(Math.abs(actual.recipient - saved.recipient) < 1e-10);
}
console.log(
  'PASS: 50,000-row CSV integrity, exact corpus/visible counts, split totals, and model-score provenance for all graph examples.',
);
