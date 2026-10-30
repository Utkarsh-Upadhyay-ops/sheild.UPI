/* Matched split comparison against the preserved topology-only graph model. */
const fs = require('node:fs'),
  I = require('../dist/intelligence.js'),
  T = require('../dist/temporal-graph.js'),
  original = require('../dist/intelligence-model.json').graph,
  data = JSON.parse(fs.readFileSync(0, 'utf8')),
  out = {};
for (const name of ['test', 'rareTraffic']) {
  let tp = 0,
    fp = 0,
    tn = 0,
    fn = 0;
  for (const g of data[name]) {
    const ids = T.features(g.history, g.payment).ids;
    for (let i = 0; i < ids.length; i++) {
      const p =
          I.network(original, g.history, { ...g.payment, sender: ids[i] }).sender >=
          original.reviewThreshold,
        y = !!g.labels[i];
      if (p && y) tp++;
      else if (p) fp++;
      else if (y) fn++;
      else tn++;
    }
  }
  out[name] = {
    precision: tp + fp ? tp / (tp + fp) : 0,
    recall: tp + fn ? tp / (tp + fn) : 0,
    falsePositiveRate: fp / Math.max(1, fp + tn),
    confusion: { tp, fp, tn, fn },
  };
}
process.stdout.write(JSON.stringify(out));
