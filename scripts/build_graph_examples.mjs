/* Read-only synthetic graph examples scored by the actual assessment API handler. */
import handler from '../api/assess.mjs';
import { writeFile } from 'node:fs/promises';
const at = Date.now();
const examples = [];
for (const [index, type, title] of [
  [1, 'ring', 'Mule network'],
  [2, 'cycle', 'Circular transfers'],
  [3, 'normal', 'Routine payments'],
]) {
  const sender = 'hub-01',
    receiver = type === 'cycle' ? 'demo-01' : 'hub-02';
  const history = [];
  const edge = (sender, receiver, amount, ago) =>
    history.push({
      sender,
      receiver,
      amount,
      timestamp: new Date(at - ago).toISOString(),
      settled: true,
    });
  for (let i = 0; i < 10; i++)
    edge(sender, 'demo-' + String(i + 10).padStart(2, '0'), 500 + i * 10, (i + 1) * 86400000);
  if (type === 'ring') {
    for (let i = 1; i <= 6; i++) edge('demo-0' + i, sender, 2000, 35000 + i * 1000);
    edge('demo-07', 'hub-03', 1800, 25000);
    edge('demo-08', 'hub-03', 2200, 24000);
    edge('hub-03', sender, 3800, 16000);
    edge('hub-02', 'demo-09', 6000, 12000);
  } else if (type === 'cycle') {
    edge('demo-01', 'demo-02', 3000, 30000);
    edge('demo-02', 'hub-03', 2900, 25000);
    edge('hub-03', sender, 2800, 20000);
    edge('demo-03', 'demo-01', 700, 60000);
    edge('demo-04', 'hub-03', 500, 50000);
    edge('demo-05', 'demo-04', 300, 40000);
  } else {
    for (let i = 1; i <= 6; i++) edge('demo-0' + i, 'hub-03', 100 + i * 50, 110000 - i * 1000);
    edge('hub-03', 'demo-07', 300, 100000);
    edge('demo-08', sender, 250, 90000);
  }
  const payment = {
    id: 'PAY-GRAPH-DEMO-' + index,
    sender,
    receiver,
    amount: type === 'ring' ? 8500 : type === 'cycle' ? 2700 : 500,
    timestamp: new Date(at).toISOString(),
    device: 'familiar',
  };
  const response = await handler.fetch(
    new Request('http://local/api/assess', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ demo: true, payment, history, behavior: { available: false } }),
    }),
  );
  if (!response.ok) throw Error(await response.text());
  const assessment = await response.json();
  examples.push({
    ...payment,
    title: 'DEMO ' + index + ' · ' + title,
    description:
      type === 'ring'
        ? 'Several sources pay HUB 1 before a large onward request.'
        : type === 'cycle'
          ? 'The pending transfer would close a circular path.'
          : 'Ordinary varied transfers illustrate why a busy account alone is not fraud.',
    source: 'Read-only synthetic example',
    status:
      assessment.decision === 'Flag'
        ? 'Held for review'
        : assessment.decision === 'Verify'
          ? 'Verification required'
          : 'Allowed',
    isGraphExample: true,
    graphHistory: history.filter((e) => at - Date.parse(e.timestamp) <= 120000),
    assessment,
  });
}
await writeFile(
  'public/graph-examples.json',
  JSON.stringify(
    {
      scope:
        'Read-only synthetic examples. Scored with the actual server models. Not customer ledger records; no settlement occurs.',
      examples,
    },
    null,
    2,
  ) + '\n',
);
console.log(
  examples.map((p) => ({
    title: p.title,
    decision: p.assessment.decision,
    nodes: p.assessment.intelligence.temporalGraphModel.nodes,
  })),
);
