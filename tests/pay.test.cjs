const fs = require('node:fs'),
  vm = require('node:vm'),
  assert = require('node:assert/strict'),
  elements = new Map();
function el(id) {
  if (!elements.has(id))
    elements.set(id, {
      innerHTML: '',
      textContent: '',
      value: '',
      addEventListener() {},
      setAttribute() {},
      classList: { add() {}, remove() {} },
      showModal() {
        this.open = true;
      },
      close() {
        this.open = false;
      },
    });
  return elements.get(id);
}
const ctx = {
  document: {
    getElementById: el,
    querySelectorAll() {
      return [];
    },
    addEventListener() {},
    title: '',
  },
  window: { addEventListener() {}, scrollTo() {} },
  location: { hash: '#home' },
  localStorage: {
    getItem() {
      return null;
    },
    setItem() {},
  },
  setTimeout,
  clearTimeout,
  URL,
  Blob,
  performance,
  console,
};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync('dist/pay.js', 'utf8'), ctx);
const run = (s) => vm.runInContext(s, ctx);
assert.match(run('home()'), /Connect bank account/);
run(
  "connect('sbi');$('consent').checked=true;$('bankCode').value='123456';$('connectConfirm').onclick()",
);
assert.equal(run('state.banks.sbi.balance'), 25000);
run(
  "state.payments.push({id:'PAY-test',bank:'sbi',amount:500,status:'Held',recipientName:'Sample',upi:'sample@sample',timeline:[]})",
);
run("passcode('PAY-test')");
assert.equal(run('state.banks.sbi.balance'), 25000, 'hold cannot settle');
(async () => {
  run("state.payments[0].status='Ready';passcode('PAY-test');demoPinKey('9')");
  assert.equal(run('pinSession.count'), 0, 'wrong demo digit is not retained');
  assert.equal(run('state.banks.sbi.balance'), 25000);
  run("demoPinKey('1');demoPinKey('2');demoPinKey('delete')");
  assert.equal(run('pinSession.count'), 1);
  run("demoPinKey('2');demoPinKey('3');demoPinKey('4');demoPinKey('5');demoPinKey('6')");
  assert.equal(run('pinSession.count'), 6);
  await Promise.all([run('confirmDemoPin()'), run('confirmDemoPin()')]);
  assert.equal(run('state.banks.sbi.balance'), 24500, 'settlement debits once');
  assert.equal(run('state.payments[0].status'), 'Settled');
  run(
    "connect('sbi');$('consent').checked=true;$('bankCode').value='123456';$('connectConfirm').onclick()",
  );
  assert.equal(run('state.banks.sbi.balance'), 24500, 'reconnecting does not refill balance');
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
console.log(
  'ShieldPay checks passed: bank setup, held payment restriction, passcode validation, single debit and reconnect preservation.',
);
run("location.hash='#home';render()");
const navigation = el('bottom').innerHTML;
for (const label of [
  'Home',
  'Send Money',
  'Payment Status',
  'Transaction History',
  'Security Notifications',
])
  assert(navigation.includes('aria-label="' + label + '"'));
assert(!navigation.includes('href="#banks"') && !navigation.includes('href="#requests"'));
assert(run('home()').includes('Manage accounts'));
console.log(
  'PASS: five customer destinations, account setup on Home, and no duplicate request page entry.',
);
