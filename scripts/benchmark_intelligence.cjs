/* Local CPU inference measurements, excludes HTTP/database/cold-start latency. */
const fs = require('node:fs');
const T = require('../dist/temporal-graph.js'),
  I = require('../dist/intelligence.js');
const graph = require('../dist/temporal-graph-model.json'),
  model = require('../dist/intelligence-model.json');
const at = Date.parse('2026-01-01T12:00:00Z');
const cases = [0, 100, 500].map((count) => {
  const payment = {
    sender: 'n0',
    receiver: 'n1',
    amount: 250,
    timestamp: new Date(at).toISOString(),
  };
  const history = Array.from({ length: count }, (_, i) => ({
    sender: 'n' + (i % 100),
    receiver: 'n' + ((i + 1) % 100),
    amount: 100 + (i % 2000),
    timestamp: new Date(at - i * 100).toISOString(),
    settled: true,
  }));
  for (let i = 0; i < 20; i++) T.score(graph, history, payment);
  const times = [];
  for (let i = 0; i < 200; i++) {
    const start = performance.now();
    T.score(graph, history, payment);
    I.anomaly(model.anomaly, [0, 0.25, 0, 0]);
    times.push(performance.now() - start);
  }
  times.sort((a, b) => a - b);
  const q = (p) => times[Math.ceil(times.length * p) - 1];
  return {
    historyEdges: count,
    samples: times.length,
    p50Ms: q(0.5),
    p95Ms: q(0.95),
    p99Ms: q(0.99),
    maximumMs: times.at(-1),
  };
});
const report = {
  scope:
    'Local warmed CPU inference only, GNN plus Isolation Forest. Excludes API, database, network and concurrency. Not end-to-end SLA evidence.',
  node: process.version,
  cases,
};
fs.writeFileSync(
  'reports/intelligence-inference-benchmark.json',
  JSON.stringify(report, null, 2) + '\n',
);
console.log(JSON.stringify(report));
