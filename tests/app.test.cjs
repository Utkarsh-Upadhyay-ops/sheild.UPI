const assert = require('node:assert/strict'),
  vm = require('node:vm'),
  fs = require('node:fs'),
  E = require('../dist/engine.js');
const elements = new Map();
const el = (id) => {
  if (!elements.has(id))
    elements.set(id, {
      id,
      innerHTML: '',
      textContent: '',
      hidden: false,
      open: false,
      showModal() {
        this.open = true;
      },
      close() {
        this.open = false;
      },
      setAttribute() {},
      classList: {
        add() {},
        remove() {},
        toggle() {},
        contains() {
          return false;
        },
      },
      focus() {},
      value: '',
    });
  return elements.get(id);
};
const context = {
  ShieldEngine: E,
  ShieldPipeline: require('../dist/pipeline.js'),
  performance,
  console,
  window: {
    addEventListener() {},
    renderCommandCenter() {
      return '<section>Shared command center renderer</section>';
    },
  },
  document: {
    getElementById: el,
    querySelector: el,
    querySelectorAll() {
      return [];
    },
    addEventListener() {},
    title: '',
    body: {
      classList: {
        contains() {
          return false;
        },
      },
    },
  },
  location: { hash: '#overview' },
  localStorage: {
    getItem() {
      return null;
    },
    setItem() {},
    removeItem() {},
  },
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval,
  requestAnimationFrame: (f) => f(),
};
vm.createContext(context);
vm.runInContext(fs.readFileSync('dist/app.js', 'utf8').replace(/^init\(\);$/m, ''), context);
const run = (s) => vm.runInContext(s, context);
context.testModel = JSON.parse(fs.readFileSync('dist/model.json'));
run('model=testModel');
run('seed()');
assert.equal(run('transactions.length'), 90);
assert.equal(run('new Set(transactions.map(t=>t.id)).size'), 90);
assert.equal(run('next'), 1090);
const before = run('next');
run('renderLab();renderLab()');
assert.equal(run('next'), before, 'previews must not allocate IDs');
run(
  "simulationResult=process({...sampleInputs.unusual,sender:'demo-user',receiver:'demo-receiver',source:'test',timestamp:new Date().toISOString()})",
);
assert.match(run('renderLab()'), /Assessment complete/);
assert.match(run('renderLab()'), /Inspect TX-/);
run(
  "settings.flag=.95;settings.verify=.8;transactions[0].risk=.7;transactions[0].decision='Allow'",
);
assert.match(
  run('table([transactions[0]])'),
  /riskpill low/,
  'risk colour follows recorded decision',
);
run("savedFixture={format:'UPIShield-2',transactions,cases,audit,settings}");
assert.doesNotThrow(() => run('validateBackup(savedFixture)'));
assert.throws(() => run("validateBackup({...savedFixture,settings:{...settings,flag:'0.95'}})"));
assert.throws(() => E.score(context.testModel, { amount: 0 }));
assert.throws(() => E.parseCSV('a,b\n"hello"junk,value'));
assert.throws(() => E.parseCSV('a,b\nabc"x",value'));
assert.equal(E.csv([[' \t=HYPERLINK("bad")']]).startsWith('"\''), true);
const at = '2026-10-29T12:00:00.000Z',
  incoming = [1, 2, 3].map((n) => ({
    sender: 's' + n,
    timestamp: new Date(Date.parse(at) + n * 1000).toISOString(),
  }));
const outgoing = [{ sender: 'hub', timestamp: '2026-10-29T12:01:00.000Z' }];
assert.equal(E.networkSignals(incoming, outgoing).pattern, true);
incoming[0].timestamp = '2026-10-29T10:00:00.000Z';
assert.equal(
  E.networkSignals(incoming, outgoing).pattern,
  false,
  'old incoming sender must not count toward a recent ring',
);
const valid = run('({...sampleInputs.normal})');
assert.throws(() => E.score(context.testModel, { ...valid, velocity: 1.5 }));
assert.throws(() => E.score(context.testModel, { ...valid, average: 0 }));
assert.throws(() => E.score(context.testModel, { ...valid, behavior: NaN }));
run("storageBlocked=true;localStorage.setItem=()=>{throw Error('must not write')} ");
assert.doesNotThrow(() => run('save()'));
console.log(
  'Passed app regressions: seed identity, preview purity, result labels, policy colours, backup validation, corrupt-storage preservation, strict CSV, spreadsheet formula safety, input validation and coherent graph time windows.',
);
(async () => {
  run('storageBlocked=false;localStorage.setItem=()=>{}');
  run("bankConnect('axis');$('bankContinue').onclick()");
  assert.equal(run('connections.axis'), undefined, 'consent checkbox is required');
  run(
    "$('bankConsent').checked=true;$('bankDays').value='30';$('bankContinue').onclick();$('bankCode').value='999999';$('bankVerifyForm').onsubmit({preventDefault(){}})",
  );
  assert.equal(run('connections.axis'), undefined, 'wrong demo code must fail');
  run("$('bankCode').value='123456';$('bankVerifyForm').onsubmit({preventDefault(){}})");
  assert.equal(run('bankActive(connections.axis)'), true, 'demo code grants simulated connection');
  run("$('dialog').close()");
  const beforeBank = run('transactions.length');
  await run("bankSync('sbi')");
  assert.equal(run('transactions.length'), beforeBank, 'unconsented banks must not import');
  run(
    "connections.sbi={status:'connected',consentId:'DEMO-sbi-123',days:30,connectedAt:new Date().toISOString(),expiresAt:new Date(Date.now()+86400000).toISOString(),lastSync:null,cursor:0,historyImported:false}",
  );
  assert.doesNotThrow(() => run('validateConnections(connections)'));
  await Promise.all([run("bankSync('sbi')"), run("bankSync('sbi')")]);
  assert.equal(
    run("transactions.filter(t=>t.bank==='sbi').length"),
    10,
    'concurrent initial syncs must not duplicate',
  );
  await run("bankSync('sbi')");
  assert.equal(run("transactions.filter(t=>t.bank==='sbi').length"), 11);
  assert.equal(run('new Set(transactions.filter(t=>t.bank).map(t=>t.bankEventKey)).size'), 11);
  run("connections.sbi.status='revoked'");
  await run("bankSync('sbi')");
  assert.equal(
    run("transactions.filter(t=>t.bank==='sbi').length"),
    11,
    'revoked bank must not import',
  );
  run("connections.sbi.status='connected';connections.sbi.expiresAt='2020-01-01T00:00:00Z'");
  await run("bankSync('sbi')");
  assert.equal(
    run("transactions.filter(t=>t.bank==='sbi').length"),
    11,
    'expired consent must not import',
  );
  assert.throws(() => run('validateConnections({unknown:{}})'));
  assert.match(run('renderBanks()'), /SIMULATED BANK CONNECTIONS/);
  console.log(
    'Passed demo bank regressions: consent required, concurrent sync deduplication, incremental sync, revoked/expired consent blocking and connection validation.',
  );
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
assert.equal(run('bankCatalog.length'), 12);
assert.equal(run('new Set(bankCatalog.map(b=>b.id)).size'), 12);
for (const b of run('bankCatalog'))
  assert(fs.existsSync('dist/' + b.logo), 'Missing logo: ' + b.name);
run("bankQuery='kotak'");
assert.equal(run('bankCatalog.filter(bankMatches).length'), 1);
run("bankQuery='no-such-bank'");
assert.equal(run('bankCatalog.filter(bankMatches).length'), 0);
run("bankQuery=''");
console.log(
  'Passed expanded directory checks: 12 unique banks, all local logos present, bank search matches and empty results.',
);
run("view='overview';updateNav()");
const currentNavigation = el('nav').innerHTML;
assert.equal((currentNavigation.split('<details')[0].match(/<a /g) || []).length, 7);
for (const route of [
  'overview',
  'transactions',
  'alerts',
  'network',
  'cases',
  'model',
  'performance',
  'simulator',
  'protection',
  'behavior',
  'intelligence',
  'settings',
])
  assert(currentNavigation.includes('href="#' + route + '"'));
assert(
  !currentNavigation.includes('href="#checkout"') && !currentNavigation.includes('href="#lab"'),
);
console.log(
  'PASS: seven primary admin sections and five advanced destinations; no duplicate payment links.',
);
