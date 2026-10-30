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

context.window.ShieldPaymentBridge=require('../dist/payment-bridge.js');
const mobileCore=require('../src/customer/mobile-core.js');
const syncedPayment=mobileCore.assess(context.testModel,327,1);
syncedPayment.bank='sbi';
const mobileWallet={balance:1000,payments:[syncedPayment]};
context.localStorage.getItem=(key)=>key===context.window.ShieldPaymentBridge.key?JSON.stringify(mobileWallet):null;
assert.equal(run('syncShieldPayRecords()'),true);
assert.equal(run('transactions.filter(t=>t.source==="ShieldPay").length'),1);
assert.equal(run('transactions.find(t=>t.source==="ShieldPay").status'),'Ready to pay');
mobileCore.authorise(mobileWallet,syncedPayment,'123456');
assert.equal(run('syncShieldPayRecords()'),true);
assert.equal(run('transactions.find(t=>t.source==="ShieldPay").status'),'Paid');
assert.equal(run('syncShieldPayRecords()'),false);
assert.equal(run('transactions.filter(t=>t.source==="ShieldPay").length'),1);
assert(run('renderTransactions()').includes('ShieldPay · Paid'));
assert.equal(run('accountName("person-1")'),'Person 1');
assert.equal(run('accountName("person-self")'),'Person 0 (you)');
run('validateBackup({format:"UPIShield-2",transactions,cases,audit,settings,next,connections,journey,demoPayments})');
console.log('PASS: actual dashboard imports ShieldPay, updates completed payment once, renders paid status, preserves person names and accepts synced backups.');

const otherDevicePayment=mobileCore.assess(context.testModel,777,4);otherDevicePayment.bank='hdfc';
const otherWallet={balance:2000,payments:[otherDevicePayment]};mobileCore.authorise(otherWallet,otherDevicePayment,'123456');
context.remoteRows=[context.window.ShieldPaymentBridge.record(syncedPayment),context.window.ShieldPaymentBridge.record(otherDevicePayment)];
run('sharedShieldPayments=remoteRows');assert.equal(run('syncShieldPayRecords()'),true);
assert.equal(run('transactions.filter(t=>t.source==="ShieldPay").length'),2);
assert(run('renderTransactions()').includes('₹777'));
assert.equal(run('syncShieldPayRecords()'),false);
console.log('PASS: dashboard retains a different device’s completed payment alongside browser-local payments.');

context.remoteRows=context.remoteRows.map((row,i)=>i===1?{...row,customerReport:{answer:'Suspicious',reason:'pressure',updatedAt:new Date().toISOString()}}:row);
run('sharedShieldPayments=remoteRows');assert.equal(run('syncShieldPayRecords()'),true);
assert.equal(run('Boolean(cases[remoteRows[1].id])'),true);
assert.equal(run('transactions.find(t=>t.id===remoteRows[1].id).decision'),'Allow');
assert(run('renderTransactions()').includes('Customer: Suspicious'));
console.log('PASS: a customer concern opens a review case while preserving the model decision and paid status.');
