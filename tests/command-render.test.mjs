import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
process.env.SHIELD_LOCAL_DB = ':memory:';
process.env.INVESTIGATOR_ACCESS_CODE = 'test-only-private-investigator';
const { getStore } = await import('../lib/store.mjs'),
  W = await import('../lib/workspace.mjs'),
  store = await getStore();
const c = await W.bootstrap(store, ''),
  token = c.token;
await W.command(store, token, { action: 'connect', bank: 'sbi', consent: true, code: '123456' });
const p = await W.createPayment(store, token, {
  key: 'render-test-ring-123',
  bank: 'sbi',
  amount: 500,
  receiver: 'pay-aanya',
  recipientName: 'Aanya',
  scenario: 'ring',
});
const adminToken = await W.login(store, process.env.INVESTIGATOR_ACCESS_CODE, 'test', '');
const snapshot = await W.view(store, adminToken);
snapshot.overviewSamples = { initialized: true, count: 0 };
class Client {
  constructor() {
    this.data = snapshot;
  }
  async start() {}
  async api() {
    return { data: {} };
  }
}
const context = {
  fetch: async (url) => ({
    ok: true,
    json: async () => JSON.parse(fs.readFileSync('dist/' + url.replace('./', ''), 'utf8')),
  }),
  ShieldSharedClient: Client,
  window: {},
  location: { hash: '#overview' },
  document: { addEventListener() {} },
  setTimeout,
  clearTimeout,
  performance,
  console,
  crypto,
  query: '',
  modal() {},
  renderModel() {
    return '<section>Model metrics</section>';
  },
};
vm.createContext(context);
vm.runInContext(fs.readFileSync('dist/command-ui.js', 'utf8'), context);
for (const page of [
  'overview',
  'transactions',
  'alerts',
  'network',
  'cases',
  'simulator',
  'performance',
]) {
  const html = context.window.renderCommandCenter(page);
  assert(html.length > 100);
  assert(!html.includes('undefined'), 'Unexpected missing value: ' + page);
}
assert(context.window.renderCommandCenter('network').includes('data-shared-node'));
assert(context.window.renderCommandCenter('alerts').includes(p.payment.id));
const failed = await W.createPayment(
  store,
  token,
  {
    key: 'fail-service-123',
    bank: 'sbi',
    amount: 300,
    receiver: 'pay-aanya',
    recipientName: 'Aanya',
  },
  async () => {
    throw Error('Injected assessment failure');
  },
);
assert.equal(failed.payment.status, 'Assessment failed');
await assert.rejects(() =>
  W.command(store, token, { action: 'settle', id: failed.payment.id, code: '123456' }),
);
console.log(
  'PASS: command center renders real shared records, directed node evidence and alerts; failed assessments remain unsettled.',
);
context.fetch = async (url) => ({
  ok: true,
  json: async () => JSON.parse(fs.readFileSync('dist/' + url.replace('./', ''), 'utf8')),
});
context.window.renderSharedModelAnalytics();
await new Promise((resolve) => setImmediate(resolve));
const modelHtml = context.window.renderSharedModelAnalytics();
assert(modelHtml.includes('Candidate not promoted'));
assert(modelHtml.includes('37.3%'));
assert(
  context.window
    .renderCommandCenter('performance')
    .includes('Full payment assessment with ledger writes'),
);
assert(context.window.renderCommandCenter('overview').includes('Payment walkthrough'));
console.log(
  'PASS: actual candidate comparison renders, ledger benchmark mode is available and walkthrough entry is present.',
);

const temporal = JSON.parse(fs.readFileSync('dist/temporal-graph-evaluation.json'));
assert(
  modelHtml.includes(
    (temporal.test.precision * 100).toFixed(1) +
      '% / ' +
      (temporal.test.recall * 100).toFixed(1) +
      '%',
  ),
);
assert(modelHtml.includes('Rare fraud stress split'));
assert(context.window.renderCommandCenter('network').includes('Temporal GNN index'));
console.log(
  'PASS: deployed temporal model metrics and account scores appear in analytics and graph evidence.',
);

assert(context.window.renderCommandCenter('performance').includes('Static file control'));
console.log(
  'PASS: recorded payment and static-control benchmark evidence renders with actual measurements.',
);
const settingsHtml = context.window.renderCommandCenter('settings');
assert(settingsHtml.includes('Export shared transaction evidence'));
assert(!settingsHtml.includes('Save policy'));
console.log(
  'PASS: Settings uses shared records and does not expose misleading browser-local decision controls.',
);
// Human-readable labels must never change graph node identity or break search.
const labelled = snapshot.payments[0];
labelled.sender = 'demo-01';
labelled.receiver = 'hub-01';
labelled.graphHistory = [
  { sender: 'demo-02', receiver: 'hub-01', amount: 200, timestamp: labelled.timestamp },
  { sender: 'demo-03', receiver: 'hub-01', amount: 300, timestamp: labelled.timestamp },
  { sender: 'demo-01', receiver: 'hub-01', amount: 250, timestamp: labelled.timestamp },
];
const labelledGraph = context.window.renderCommandCenter('network');
assert(labelledGraph.includes('Person ' + context.window.ShieldAccountNames.get('demo-01')));
assert(labelledGraph.includes('Person ' + context.window.ShieldAccountNames.get('hub-01')));
assert.notEqual(context.window.ShieldAccountNames.get('demo-01'), context.window.ShieldAccountNames.get('hub-01'));
assert(labelledGraph.includes('data-shared-node="demo-01"'));
assert(labelledGraph.includes('data-shared-node="hub-01"'));
context.query = 'Person ' + context.window.ShieldAccountNames.get('hub-01');
assert(context.window.renderCommandCenter('transactions').includes(labelled.id));
context.query = '';
console.log('PASS: numbered account labels preserve graph IDs and remain searchable.');
// Empty ledgers still provide a clearly labelled, read-only model-scored example.
snapshot.payments = [];
context.location.hash = '#network';
context.window.render = () => {};
context.document.getElementById = () => null;
context.window.renderCommandCenter('network');
await new Promise((resolve) => setImmediate(resolve));
const emptyGraph = context.window.renderCommandCenter('network');
assert(emptyGraph.includes('DEMO 1 · Mule network'));
assert(emptyGraph.includes('READ-ONLY SAMPLE'));
assert(emptyGraph.includes('Two directed aggregation hops'));
assert(emptyGraph.includes('data-shared-node="hub-01"'));
assert(!emptyGraph.includes('data-shared-payment="PAY-GRAPH-DEMO-1"'));
assert.equal(snapshot.payments.length, 0);
console.log('PASS: empty ledger shows model-scored sample graph without creating a payment.');
