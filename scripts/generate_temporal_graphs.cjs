const fs = require('node:fs'),
  T = require('../dist/temporal-graph.js');
function dataset(seed, count, rare = false) {
  let value = seed;
  const rand = () => (value = (1664525 * value + 1013904223) >>> 0) / 4294967296,
    int = (a, b) => a + Math.floor(rand() * (b - a));
  const result = [],
    types = [
      'normal',
      'legitimate_hub',
      'legitimate_cycle',
      'fraud_ring',
      'mule_forwarding',
      'fund_chain',
    ];
  for (let run = 0; run < count; run++) {
    const type = rare
        ? run % 40 === 0
          ? types[3 + (Math.floor(run / 40) % 3)]
          : types[run % 3]
        : types[run % types.length],
      n = int(10, 31),
      edges = [],
      truth = new Set(),
      at = Date.parse('2026-01-01T12:00:00Z');
    function edge(a, b, amount, ago) {
      edges.push({
        sender: 's' + seed + 'g' + run + 'n' + a,
        receiver: 's' + seed + 'g' + run + 'n' + b,
        amount,
        timestamp: new Date(at - ago).toISOString(),
        settled: true,
      });
    }
    const fraud = ['fraud_ring', 'mule_forwarding', 'fund_chain'].includes(type),
      fast = fraud || rand() < 0.1;
    if (type === 'normal')
      for (let i = 0; i < n - 1; i++)
        if (rand() < 0.7) edge(i, i + 1, int(100, 900), int(1000, 120000));
    if (type === 'legitimate_hub')
      for (let i = 1; i < n; i++) edge(i, 0, int(50, 500), int(1000, 120000));
    if (type === 'legitimate_cycle' || type === 'fraud_ring') {
      const size = int(3, 7),
        amount = int(2000, 8000);
      for (let i = 0; i < size; i++)
        edge(
          i,
          (i + 1) % size,
          fast ? (amount * int(90, 101)) / 100 : int(100, 1500),
          fast ? 40000 - i * 4000 : int(1000, 120000),
        );
      if (fraud) for (let i = 0; i < size; i++) truth.add('s' + seed + 'g' + run + 'n' + i);
    }
    if (type === 'mule_forwarding') {
      const size = int(4, 9),
        amount = int(1000, 3500);
      for (let i = 1; i < size; i++) edge(i, 0, amount, 40000 - i * 1000);
      edge(0, n - 1, amount * (size - 1) * 0.92, 1000);
      truth.add('s' + seed + 'g' + run + 'n0');
    }
    if (type === 'fund_chain') {
      const size = int(4, 8),
        amount = int(2500, 8000);
      for (let i = 0; i < size - 1; i++) edge(i, i + 1, amount * (1 - i * 0.03), 50000 - i * 6000);
      for (let i = 1; i < size - 1; i++) truth.add('s' + seed + 'g' + run + 'n' + i);
    }
    // Background edges and varied account order, independently seeded between splits.
    for (let i = 0; i < 4; i++) {
      let a = int(0, n),
        b = int(0, n);
      if (a !== b && rand() < 0.5) edge(a, b, int(100, 2000), int(1000, 120000));
    }
    const payment = {
      sender: 's' + seed + 'g' + run + 'n' + int(0, n),
      receiver: 's' + seed + 'g' + run + 'n' + int(0, n),
      amount: int(100, 2000),
      timestamp: new Date(at).toISOString(),
    };
    if (payment.sender === payment.receiver)
      payment.receiver = 's' + seed + 'g' + run + 'candidate';
    const graph = T.features(edges, payment);
    result.push({
      type,
      history: edges,
      payment,
      rows: graph.secondHop,
      labels: graph.ids.map((id) => +truth.has(id)),
    });
  }
  return result;
}
fs.writeFileSync(
  process.argv[2] ||
    require('node:path').join(require('node:os').tmpdir(), 'shield-temporal-graphs.json'),
  JSON.stringify({
    train: dataset(96411, 12000),
    validation: dataset(96412, 2000),
    test: dataset(96417, 3000),
    rareTraffic: dataset(96418, 8000, true),
    rareValidation: dataset(96416, 8000, true),
  }),
);
