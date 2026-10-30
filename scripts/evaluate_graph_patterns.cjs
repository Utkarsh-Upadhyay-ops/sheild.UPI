/* Reproducible synthetic stress evaluation, never training or modifying the deployed model. */
const fs = require('node:fs'),
  I = require('../dist/intelligence.js'),
  model = require('../dist/intelligence-model.json');
let seed = 411;
function rand() {
  seed = (1664525 * seed + 1013904223) >>> 0;
  return seed / 4294967296;
}
const now = new Date('2026-01-01T12:00:00Z').toISOString(),
  types = [
    'normal',
    'legitimate_hub',
    'legitimate_cycle',
    'fraud_ring',
    'mule_forwarding',
    'fund_chain',
  ],
  groups = [];
for (const type of types) {
  let tp = 0,
    fp = 0,
    tn = 0,
    fn = 0;
  for (let run = 0; run < 100; run++) {
    const edges = [],
      truth = new Set();
    function e(a, b) {
      edges.push({
        sender: 'n' + a,
        receiver: 'n' + b,
        amount: 500,
        timestamp: now,
        settled: true,
      });
    }
    if (type === 'normal') for (let i = 0; i < 9; i++) e(i, i + 1);
    if (type === 'legitimate_hub') for (let i = 1; i < 10; i++) e(i, 0);
    if (type === 'legitimate_cycle' || type === 'fraud_ring') {
      for (let i = 0; i < 4; i++) e(i, (i + 1) % 4);
      if (type === 'fraud_ring') for (let i = 0; i < 4; i++) truth.add('n' + i);
    }
    if (type === 'mule_forwarding') {
      for (let i = 1; i < 8; i++) e(i, 0);
      e(0, 9);
      truth.add('n0');
    }
    if (type === 'fund_chain') {
      for (let i = 0; i < 5; i++) e(i, i + 1);
      for (let i = 1; i < 5; i++) truth.add('n' + i);
    }
    for (let i = 0; i < 6; i++) {
      let a = Math.floor(rand() * 10),
        b = Math.floor(rand() * 10);
      if (a !== b && rand() < 0.3) e(a, b);
    }
    const out = I.network(model.graph, edges, { sender: 'n0', receiver: 'n1', timestamp: now });
    for (const a of out.accounts) {
      const pred = a.risk >= model.graph.reviewThreshold,
        y = truth.has(a.id);
      if (pred && y) tp++;
      else if (pred) fp++;
      else if (y) fn++;
      else tn++;
    }
  }
  groups.push({
    pattern: type,
    graphs: 100,
    tp,
    fp,
    tn,
    fn,
    precision: tp + fp ? tp / (tp + fp) : null,
    recall: tp + fn ? tp / (tp + fn) : null,
  });
}
const report = {
  version: model.version,
  seed: 411,
  scope:
    'Synthetic stress suite with explicit scenario labels, not representative bank accuracy. Benign and fraudulent cycles can have identical topology.',
  threshold: model.graph.reviewThreshold,
  modelsModified: false,
  groups,
};
fs.writeFileSync('reports/graph-evaluation.json', JSON.stringify(report, null, 2));
fs.copyFileSync('reports/graph-evaluation.json', 'dist/graph-evaluation.json');
console.log(JSON.stringify(groups));
