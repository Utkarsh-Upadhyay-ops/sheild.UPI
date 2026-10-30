/* Seeded synthetic exploration corpus, separate from GNN train/validation/test data. */
import { writeFile } from 'node:fs/promises';
import handler from '../api/assess.mjs';
const at = Date.now();
let value = 44771;
const rand = () => (value = (1664525 * value + 1013904223) >>> 0) / 4294967296;
const id = (n) =>
  n < 100 ? 'hub-' + String(n + 1).padStart(2, '0') : 'demo-' + String(n - 99).padStart(4, '0');
const history = [];
for (let i = 0; i < 49974; i++) {
  const sender = id(Math.floor(rand() * 3100));
  let receiver = id(Math.floor(rand() * 3100));
  if (receiver === sender) receiver = id((i + 1) % 3100);
  if (receiver === sender) receiver = sender === 'hub-99' ? 'hub-98' : 'hub-99';
  history.push({
    sender,
    receiver,
    amount: Math.round(50 + rand() * 1950),
    timestamp: new Date(at - 3600000 - Math.floor(rand() * 3600000)).toISOString(),
    settled: true,
    scenario: 'background',
  });
}
const neighborhood = [];
function edge(sender, receiver, amount, ago) {
  const e = {
    sender,
    receiver,
    amount,
    timestamp: new Date(at - ago).toISOString(),
    settled: true,
    scenario: 'generated_mule',
  };
  history.push(e);
  neighborhood.push(e);
}
for (let cluster = 0; cluster < 3; cluster++)
  for (let i = 1; i <= 8; i++)
    edge(
      'demo-' + String(cluster * 8 + i).padStart(4, '0'),
      ['hub-01', 'hub-03', 'hub-04'][cluster],
      1000 + i * 50,
      60000 + cluster * 10000 - i * 1000,
    );
edge('hub-04', 'hub-03', 9500, 25000);
edge('hub-03', 'hub-01', 18000, 15000);
const payment = {
  id: 'PAY-LARGE-DATA-EXAMPLE',
  sender: 'hub-01',
  receiver: 'hub-02',
  amount: 25000,
  timestamp: new Date(at).toISOString(),
  device: 'familiar',
};
const baseline = history.filter((e) => e.sender === payment.sender).slice(-15);
const response = await handler.fetch(
  new Request('http://local/api/assess', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      demo: true,
      payment,
      history: [...baseline, ...neighborhood],
      behavior: { available: false },
    }),
  }),
);
if (!response.ok) throw Error(await response.text());
const assessment = await response.json();
const stats = {
  seed: 44771,
  transfers: history.length,
  accounts: new Set(history.flatMap((e) => [e.sender, e.receiver])).size,
  visibleHistoryTransfers: neighborhood.length,
  kind: 'Synthetic exploration corpus, separate from model training splits',
};
const example = {
  ...payment,
  title: 'DEMO 4 · Large dataset',
  description:
    'Explore a connected neighborhood from ' +
    stats.transfers.toLocaleString('en-IN') +
    ' generated transfers. The surrounding corpus is available as CSV.',
  source: 'Read-only synthetic exploration corpus',
  status:
    assessment.decision === 'Flag'
      ? 'Held for review'
      : assessment.decision === 'Verify'
        ? 'Verification required'
        : 'Allowed',
  isGraphExample: true,
  graphHistory: neighborhood,
  assessment,
  dataset: stats,
};
const fs = await import('node:fs/promises');
const examples = JSON.parse(await fs.readFile('public/graph-examples.json', 'utf8'));
examples.examples = examples.examples.filter((p) => p.title !== 'DEMO 4 · Large dataset');
examples.examples.push(example);
await writeFile('public/graph-examples.json', JSON.stringify(examples, null, 2) + '\n');
await writeFile(
  'public/network-transfers.csv',
  'sender,receiver,amount,timestamp,scenario\n' +
    history
      .map((e) => [e.sender, e.receiver, e.amount, e.timestamp, e.scenario].join(','))
      .join('\n') +
    '\n',
);
await writeFile('reports/exploration-dataset.json', JSON.stringify(stats, null, 2) + '\n');
console.log(stats);
