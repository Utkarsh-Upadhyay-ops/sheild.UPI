'use strict';
const $ = (id) => document.getElementById(id),
  esc = (v) =>
    String(v ?? '').replace(
      /[&<>"']/g,
      (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
    ),
  money = (n) => '₹' + Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 });
const banks = [
    { id: 'sbi', name: 'State Bank of India', logo: 'sbi.svg', last: '4821' },
    { id: 'hdfc', name: 'HDFC Bank', logo: 'hdfc.svg', last: '7354' },
    { id: 'icici', name: 'ICICI Bank', logo: 'icici.png', last: '2609' },
    { id: 'axis', name: 'Axis Bank', logo: 'axis.svg', last: '9186' },
  ],
  contacts = [
    { id: 'aanya', name: 'Aanya Sharma', upi: 'aanya@sample', initials: 'AS' },
    { id: 'rahul', name: 'Rahul Mehta', upi: 'rahul@sample', initials: 'RM' },
    { id: 'cafe', name: 'Campus Cafe', upi: 'campuscafe@sample', initials: 'CC' },
    { id: 'new', name: 'New recipient', upi: 'newrecipient@sample', initials: '+' },
  ];
const STORE = 'shieldpay-v1';
let state = { banks: {}, payments: [], dismissed: [] },
  busy = false,
  scenario = 'normal',
  recipient = 'aanya',
  amount = 250,
  note = '',
  selectedPayment = null,
  requestType = null,
  storageError = false;
try {
  const s = JSON.parse(localStorage.getItem(STORE) || 'null');
  if (s) {
    if (!s.banks || !Array.isArray(s.payments) || !Array.isArray(s.dismissed))
      throw Error('Invalid storage');
    for (const [id, b] of Object.entries(s.banks))
      if (!banks.some((x) => x.id === id) || !Number.isFinite(b.balance) || b.balance < 0)
        throw Error('Invalid account');
    if (
      s.payments.some(
        (p) =>
          !p ||
          typeof p.id !== 'string' ||
          !Number.isFinite(p.amount) ||
          !['Checking', 'Ready', 'Verify', 'Held', 'Settled', 'Cancelled', 'Failed'].includes(
            p.status,
          ),
      )
    )
      throw Error('Invalid payment');
    state = s;
    for (const p of state.payments)
      if (p.status === 'Checking') {
        p.status = 'Failed';
        p.error = 'The page reloaded during assessment. No funds were debited.';
      }
  }
} catch {
  storageError = true;
}
function save() {
  if (storageError) return;
  try {
    localStorage.setItem(STORE, JSON.stringify(state));
  } catch {
    toast('Storage unavailable. Keep this tab open; records may not persist.');
  }
}
function toast(s) {
  $('notice').textContent = s;
  $('notice').classList.add('show');
  setTimeout(() => $('notice').classList.remove('show'), 4000);
}
function modal(s) {
  pinSession = null;
  $('modal').classList.remove('pin-dialog');
  $('modalBody').innerHTML =
    `<button class="btn" data-act="close" style="float:right">Close</button>${s}`;
  $('modal').showModal();
}
function route() {
  return location.hash.slice(1) || 'home';
}
function go(r) {
  if (busy) return toast('Please wait for the current assessment.');
  location.hash = r;
  render();
  window.scrollTo({ top: 0, behavior: 'instant' });
}
function activeBank() {
  return banks.find((b) => state.banks[b.id]);
}
function contact() {
  return contacts.find((c) => c.id === recipient) || contacts[0];
}
function historyRows() {
  return (
    state.payments
      .slice()
      .reverse()
      .map(
        (p) =>
          `<button class="row" style="width:100%;background:none;border:0;border-bottom:1px solid var(--line);text-align:left;cursor:pointer" data-receipt="${esc(p.id)}"><div><b>${esc(p.recipientName)}</b><small>${esc(p.id)} · ${new Date(p.time).toLocaleString('en-IN')}</small></div><div><strong>${money(p.amount)}</strong><small>${esc(p.status === 'Settled' ? 'Paid' : p.status)}</small></div></button>`,
      )
      .join('') ||
    '<div class="empty"><h3>No payments yet</h3><p>Your payment receipts and safety decisions appear here.</p></div>'
  );
}
function home() {
  const connected = Object.keys(state.banks).length;
  return `<div class="eyebrow">ShieldPay</div><h1>Your account</h1><p class="hint">Send money, check a payment, or review your activity.</p><section class="card balance-card"><div class="row"><div><span class="hint">Available simulated balance</span><div class="amount">${money(Object.values(state.banks).reduce((sum, bank) => sum + bank.balance, 0))}</div></div><span class="status">${connected} sample account${connected === 1 ? '' : 's'}</span></div><div class="actions"><button class="btn primary" data-route="${connected ? 'pay' : 'banks'}">${connected ? 'Send money' : 'Connect bank account'}</button><button class="btn" data-route="banks">Manage accounts</button></div></section><section class="card"><div class="row"><h2>Recent payments</h2><a class="hint" href="#history">View all</a></div>${historyRows()}</section><section class="card"><h2>People & merchants</h2><div class="contacts">${contacts.map((c) => `<button class="contact" data-contact="${c.id}"><span class="avatar">${c.initials}</span>${esc(c.name.split(' ')[0])}</button>`).join('')}</div></section><p class="hint">All balances and settlements are simulated. Your bank credentials and real UPI PIN are never needed.</p>`;
}
function bankPage() {
  return `<div class="eyebrow">Accounts</div><h1>Your payment accounts</h1><div class="banner">Sample accounts come with ${money(25000)} each for demonstration. No bank credentials are collected or real accounts connected.</div><div class="grid">${banks.map((b) => `<section class="card"><div class="banktop"><img class="banklogo" src="bank-logos/${b.logo}" alt="${b.name}"><div><h3>${b.name}</h3><p class="hint">Savings account · •••• ${b.last}</p></div></div>${state.banks[b.id] ? `<div class="row"><span class="status success">Connected · sandbox</span><strong>${money(state.banks[b.id].balance)}</strong></div><button class="btn full" data-route="pay">Pay from account</button>` : `<button class="btn primary full" data-connect="${b.id}">Connect sample account</button>`}</section>`).join('')}</div>`;
}
function payPage() {
  const bank = activeBank();
  if (!bank)
    return `<section class="card empty"><h1>Connect your account first</h1><p>Choose a bank to get a simulated balance and payment history.</p><button class="btn primary" data-route="banks">Choose bank</button></section>`;
  return `<div class="eyebrow">Send money</div><h1>Send money</h1><details class="card demo-scenarios" ${scenario !== 'normal' ? 'open' : ''}><summary>Demo scenarios</summary><div class="scenario" aria-label="Payment scenarios">${[
    ['normal', 'DEMO 1 · Normal payment'],
    ['verify', 'DEMO 2 · Verification'],
    ['ring', 'DEMO 3 · Mule network'],
    ['device', 'DEMO 4 · New device'],
  ]
    .map(
      ([s, l]) =>
        `<button data-scenario="${s}" class="${scenario === s ? 'active' : ''}">${l}</button>`,
    )
    .join(
      '',
    )}</div></details><div class="grid"><section class="card"><form id="sendForm"><label class="field">Recipient<select id="recipient">${contacts.map((c) => `<option value="${c.id}" ${recipient === c.id ? 'selected' : ''}>${c.name} · ${c.upi}</option>`).join('')}</select></label><label class="field">Amount<input class="amountinput" id="amount" type="number" min="1" max="100000" step="0.01" value="${amount}" required></label><label class="field">Pay from<select id="bank">${banks
    .filter((b) => state.banks[b.id])
    .map(
      (b) =>
        `<option value="${b.id}">${b.name} · •••• ${b.last} · ${money(state.banks[b.id].balance)}</option>`,
    )
    .join(
      '',
    )}</select></label><label class="field">Note (optional)<input id="note" maxlength="80" placeholder="What is this payment for?" value="${esc(note)}"></label><div class="trust">✓ Your payment is checked before simulated settlement.</div><button class="btn primary full" type="submit" style="margin-top:20px" ${busy ? 'disabled' : ''}>${busy ? 'Checking payment…' : 'Continue securely →'}</button></form></section><section class="card"><h2>Payment steps</h2><div class="timeline"><p><b>1. Check the recipient</b><br>Confirm the name and amount.</p><p><b>2. Check the risk</b><br>Transaction ML, graph analysis and policies assess the pending payment.</p><p><b>3. Authorise the outcome</b><br>Enter only the displayed simulation passcode. Held payments need a simulated investigator review.</p><p><b>4. Get a receipt</b><br>A successful payment debits the sample balance once.</p></div><p class="hint">Scenario settings generate sample account activity. UPI Shield calculates the resulting risk score.</p></section></div>`;
}
function receipt() {
  const p = state.payments.find((p) => p.id === selectedPayment) || state.payments.at(-1);
  if (!p)
    return `<section class="card empty"><h1>No payment selected</h1><button class="btn" data-route="pay">Send money</button></section>`;
  const settled = p.status === 'Settled',
    held = p.status === 'Held';
  return `<div class="grid"><section class="card receipt"><div class="resulticon ${settled ? '' : 'hold'}">${settled ? '✓' : p.status === 'Checking' ? '<span class="spin"></span>' : held ? '!' : '↗'}</div><span class="status ${settled ? 'success' : held ? 'hold' : ''}">${esc(p.status)}</span><h1>${settled ? 'Payment successful' : held ? 'Payment held for review' : p.status === 'Verify' ? 'Additional verification required' : p.status === 'Ready' ? 'Ready to authorise' : p.status === 'Cancelled' ? 'Payment cancelled' : p.status === 'Failed' ? 'Payment could not be checked' : 'Checking your payment'}</h1><div class="amount">${money(p.amount)}</div><p>To <b>${esc(p.recipientName)}</b><br><span class="hint">${esc(p.upi)}</span></p><div class="row"><span>From</span><b>${esc(banks.find((b) => b.id === p.bank)?.name)}</b></div><div class="row"><span>Reference</span><small>${esc(p.id)}</small></div><div class="row"><span>Money movement</span><b>${settled ? 'Sample balance debited' : 'No funds debited'}</b></div>${p.error ? `<p class="banner">${esc(p.error)}</p>` : ''}<div class="actions" style="margin-top:20px">${p.status === 'Ready' ? `<button class="btn primary" data-authorise="${p.id}">Authorise ${money(p.amount)}</button>` : ''}${p.status === 'Verify' ? `<button class="btn primary" data-verify="${p.id}">Complete extra check</button>` : ''}${held ? `<button class="btn" data-review="${p.id}">Simulated investigator review</button>` : ''}${!['Settled', 'Cancelled', 'Checking'].includes(p.status) ? `<button class="btn danger" data-cancel="${p.id}">Cancel payment</button>` : ''}<button class="btn" data-export="${p.id}">Download receipt</button><button class="btn" data-route="home">Back home</button></div><p class="hint">${settled ? 'This receipt records a sandbox payment. No bank settlement occurred.' : 'No real UPI PIN is required or collected.'}</p></section><section class="card"><h2>Protected by UPI Shield</h2>${p.assessment ? `<div class="row"><span>Decision</span><b>${esc(p.assessment.decision)}</b></div><div class="row"><span>Model score</span><b>${(p.assessment.modelScore * 100).toFixed(1)} / 100</b></div><div class="row"><span>Model scoring</span><b>${p.assessment.timings.scoringMs.toFixed(2)} ms</b></div><div class="row"><span>Full assessment request</span><b>${Number.isFinite(p.requestMs) ? p.requestMs.toFixed(1) + ' ms' : 'Unavailable'}</b></div><ul>${p.assessment.reasons.map((r) => `<li>${esc(r)}</li>`).join('')}</ul><p class="hint">Models trained on synthetic data. Scores are not a validated real world fraud probability.</p>` : '<p class="hint">The backend assessment will appear here.</p>'}<h3>Payment timeline</h3><div class="timeline">${p.timeline.map((t) => `<p><b>${esc(t.action)}</b><br>${new Date(t.time).toLocaleTimeString('en-IN')}</p>`).join('')}</div></section></div>`;
}
const requests = [
  {
    id: 'rent',
    name: 'Rahul Mehta',
    amount: 800,
    description: 'Shared hostel expenses',
    recipient: 'rahul',
    suspicious: false,
  },
  {
    id: 'cashback',
    name: 'Rewards support',
    amount: 499,
    description: 'Pay to unlock a cashback reward',
    recipient: 'new',
    suspicious: true,
  },
];
function requestPage() {
  return `<div class="eyebrow">Payment requests</div><h1>You decide what leaves your account.</h1><div class="banner">Approving a request sends money. Do not approve a debit to receive cashback or a refund.</div>${
    requests
      .filter((r) => !state.dismissed.includes(r.id))
      .map(
        (r) =>
          `<section class="card"><div class="row"><div><h2>${r.name}</h2><p class="hint">${r.description}</p></div><strong>${money(r.amount)}</strong></div><div class="actions"><button class="btn primary" data-request="${r.id}">Review & check request</button><button class="btn danger" data-decline="${r.id}">Decline</button></div></section>`,
      )
      .join('') || '<section class="card empty">No pending requests.</section>'
  }`;
}
function render() {
  let r = route();
  $('app').innerHTML =
    (storageError
      ? '<div class="banner">Saved data could not be validated. Saving is disabled to preserve it. Use a fresh browser session for this demonstration.</div>'
      : '') +
    (r === 'banks'
      ? bankPage()
      : r === 'pay'
        ? payPage()
        : r === 'receipt'
          ? receipt()
          : r === 'history'
            ? `<div class="eyebrow">Activity</div><h1>Your payment history</h1><section class="card">${historyRows()}</section>`
            : r === 'requests'
              ? requestPage()
              : home());
  $('bottom').innerHTML = [
    ['home', '⌂', 'Home'],
    ['pay', '↗', 'Send Money'],
    ['receipt', '◉', 'Payment Status'],
    ['history', '◷', 'History'],
    ['security', '⌾', 'Security'],
  ]
    .map(
      ([id, i, l]) =>
        `<a href="#${id}" aria-label="${{ home: 'Home', pay: 'Send Money', receipt: 'Payment Status', history: 'Transaction History', security: 'Security Notifications' }[id] || l}" ${r === id ? 'aria-current="page"' : ''} class="${r === id ? 'active' : ''}"><span>${i}</span>${l}</a>`,
    )
    .join('');
  if ($('sendForm'))
    $('sendForm').onsubmit = (e) => {
      e.preventDefault();
      if (busy || !e.target.reportValidity()) return;
      recipient = $('recipient').value;
      amount = +$('amount').value;
      note = $('note').value;
      submit($('bank').value);
    };
  document.title = (r === 'receipt' ? 'Payment status' : 'ShieldPay') + ' | Protected payments';
}
function timeline(p, action) {
  p.timeline.push({ action, time: new Date().toISOString() });
  save();
}
async function submit(bank) {
  if (busy) return;
  const b = state.banks[bank];
  if (!b) return toast('Connect a sample bank first.');
  if (
    !Number.isFinite(amount) ||
    amount < 1 ||
    amount > 100000 ||
    (Math.round(amount * 100) !== amount * 100 &&
      Math.abs(Math.round(amount * 100) - amount * 100) > 0.00001)
  )
    return toast('Enter an amount with up to two decimal places.');
  if (amount > b.balance) return toast('Insufficient simulated balance.');
  busy = true;
  const c = contact(),
    id = 'PAY-shieldpay-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
    p = {
      id,
      bank,
      amount,
      recipientName: c.name,
      upi: c.upi,
      receiver: 'pay-' + c.id,
      time: new Date().toISOString(),
      note,
      status: 'Checking',
      timeline: [],
      assessment: null,
    };
  state.payments.push(p);
  state.payments = state.payments.slice(-100);
  selectedPayment = id;
  timeline(p, 'Payment created; no funds debited');
  location.hash = 'receipt';
  render();
  const now = Date.now(),
    sender = 'pay-' + bank,
    history = Array.from({ length: 12 }, (_, i) => ({
      sender,
      receiver: 'pay-' + ['aanya', 'rahul', 'cafe'][i % 3],
      amount: 300 + i * 20,
      timestamp: new Date(now - (i + 1) * 86400000).toISOString(),
      settled: true,
    }));
  for (const old of state.payments)
    if (old.status === 'Settled')
      history.push({
        sender: 'pay-' + old.bank,
        receiver: old.receiver,
        amount: old.amount,
        timestamp: old.settledAt,
        settled: true,
      });
  if (scenario === 'ring')
    for (let i = 0; i < 5; i++)
      history.push({
        sender: 'network-' + i,
        receiver: sender,
        amount: 3000,
        timestamp: new Date(now - 60000 + i * 1000).toISOString(),
        settled: true,
      });
  const body = {
    demo: true,
    payment: {
      id,
      sender,
      receiver: p.receiver,
      amount: p.amount,
      timestamp: p.time,
      device: scenario === 'device' ? 'new' : 'familiar',
    },
    history: history.slice(-500),
    behavior: { available: false },
    extraVerification: scenario === 'verify',
    protectionContext:
      requestType === 'cashback'
        ? { payToReceive: true, unexpectedCollect: true }
        : requestType
          ? { unexpectedCollect: true }
          : {},
  };
  const start = performance.now();
  try {
    const r = await fetch('/api/assess', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) throw Error('Assessment unavailable. No funds have been debited.');
    const a = await r.json();
    if (a.paymentId !== id || !['Allow', 'Verify', 'Flag'].includes(a.decision))
      throw Error('Invalid assessment response.');
    p.assessment = a;
    p.requestMs = performance.now() - start;
    p.status = a.decision === 'Allow' ? 'Ready' : a.decision === 'Verify' ? 'Verify' : 'Held';
    timeline(p, 'UPI Shield decision: ' + a.decision);
  } catch (e) {
    p.status = 'Failed';
    p.error = e.message;
    timeline(p, 'Assessment failed; settlement unavailable');
  } finally {
    busy = false;
    requestType = null;
    save();
    render();
  }
}
function connect(id) {
  if (busy) return;
  const bank = banks.find((b) => b.id === id);
  if (!bank) return;
  modal(
    `<h2 style="padding-top:50px">Connect ${bank.name}</h2><p class="hint">This creates a sample account with ${money(25000)}. No SMS is sent and no real bank connection is made.</p><label class="check"><input type="checkbox" id="consent">I consent to loading sample account history for this demonstration.</label><label class="field">Displayed verification code: 123456<input id="bankCode" inputmode="numeric" maxlength="6" autocomplete="off" placeholder="123456"></label><button class="btn primary full" id="connectConfirm">Verify sample account</button><p id="connectError" role="status" class="hint"></p>`,
  );
  $('connectConfirm').onclick = () => {
    if (!$('consent').checked || $('bankCode').value !== '123456')
      return ($('connectError').textContent =
        'Accept sample consent and enter the displayed code 123456.');
    if (!state.banks[id])
      state.banks[id] = { balance: 25000, connectedAt: new Date().toISOString() };
    save();
    $('modal').close();
    render();
    toast('Sample bank account connected.');
  };
}
let pinSession = null;
function closePin() {
  pinSession = null;
  $('modal').classList.remove('pin-dialog');
  $('modal').close();
}
function passcode(id, verification = false) {
  const p = state.payments.find((p) => p.id === id);
  if (!p || storageError || p.status !== (verification ? 'Verify' : 'Ready')) return;
  pinSession = { id, verification, count: 0, processing: false };
  $('modal').classList.add('pin-dialog');
  $('modalBody').innerHTML =
    `<div class="pin-shell"><div class="pin-bank"><div><b>${esc(banks.find((b) => b.id === p.bank)?.name)}</b><small>Account •••• ${esc(banks.find((b) => b.id === p.bank)?.last)}</small></div><span class="pin-brand">ShieldPay<small>DEMO AUTHORISATION</small></span></div><div class="pin-transfer"><span>To <b>${esc(p.recipientName)}</b></span><strong>${money(p.amount)}</strong></div><div class="pin-content"><div class="pin-label">${verification ? 'ADDITIONAL VERIFICATION' : 'AUTHORISE SANDBOX PAYMENT'}</div><h2>Enter 6 digit demo code</h2><p class="pin-demo">Use <b>1 2 3 4 5 6</b> · Never enter your real UPI PIN.</p><div id="pinSlots" class="pin-slots" role="img" aria-label="0 of 6 demo digits entered">${Array.from({ length: 6 }, (_, i) => `<span class="pin-slot" data-slot="${i}"></span>`).join('')}</div><p id="pinError" role="status" class="pin-message">This screen accepts only the displayed demonstration sequence.</p><div class="pin-safety">⌾ You are authorising a simulated debit of ${money(p.amount)}. No bank funds will move.</div></div><div class="pin-keypad" aria-label="Demo numeric keypad">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `<button type="button" data-pin-key="${n}" aria-label="Digit ${n}">${n}</button>`).join('')}<button type="button" data-pin-key="delete" aria-label="Delete last digit">⌫</button><button type="button" data-pin-key="0" aria-label="Digit 0">0</button><button type="button" id="pinConfirm" class="pin-submit" data-pin-key="confirm" aria-label="Confirm sandbox payment" disabled>✓</button></div><button class="pin-cancel" data-pin-key="cancel">Cancel authorisation</button></div>`;
  $('pinConfirm').onclick = confirmDemoPin;
  $('modal').showModal();
}
function updatePin() {
  if (!pinSession) return;
  const count = pinSession.count;
  document.querySelectorAll('[data-slot]').forEach((el, i) => {
    el.classList.toggle('filled', i < count);
    el.classList.toggle('current', i === count);
  });
  $('pinSlots').setAttribute('aria-label', count + ' of 6 demo digits entered');
  $('pinConfirm').disabled = count !== 6 || pinSession.processing;
}
function demoPinKey(key) {
  if (!pinSession) return;
  if (key === 'cancel') {
    closePin();
    return;
  }
  if (pinSession.processing) return;
  if (key === 'confirm') {
    confirmDemoPin();
    return;
  }
  if (key === 'delete') {
    pinSession.count = Math.max(0, pinSession.count - 1);
    $('pinError').textContent = 'Use only the displayed demo code 123456.';
    updatePin();
    return;
  }
  if (!/^[0-9]$/.test(key) || pinSession.count === 6) return;
  if (key !== '123456'[pinSession.count]) {
    pinSession.count = 0;
    $('pinError').textContent = 'Demo code only: 123456. Other digits are not retained.';
    $('pinSlots').classList.remove('pin-shake');
    void $('pinSlots').offsetWidth;
    $('pinSlots').classList.add('pin-shake');
  } else {
    pinSession.count++;
    $('pinError').textContent =
      pinSession.count === 6
        ? 'Ready. Tap the check mark to authorise.'
        : 'Use only the displayed demo code 123456.';
  }
  updatePin();
}
async function confirmDemoPin() {
  const session = pinSession;
  if (!session || session.count !== 6 || session.processing || storageError) return;
  const p = state.payments.find((p) => p.id === session.id),
    expected = session.verification ? 'Verify' : 'Ready';
  if (!p || p.status !== expected) return;
  session.processing = true;
  updatePin();
  $('pinError').textContent = 'Completing sandbox authorisation…';
  $('pinConfirm').innerHTML = '<span class="spin"></span>';
  await new Promise((resolve) => setTimeout(resolve, 350));
  if (pinSession !== session || storageError || p.status !== expected) return;
  if (session.verification) {
    p.status = 'Ready';
    timeline(p, 'Additional simulation verification completed');
  } else {
    const b = state.banks[p.bank];
    if (!b || p.amount > b.balance) {
      session.processing = false;
      $('pinError').textContent = 'Insufficient simulated balance.';
      $('pinConfirm').textContent = '✓';
      updatePin();
      return;
    }
    b.balance = Math.round((b.balance - p.amount) * 100) / 100;
    p.status = 'Settled';
    p.settledAt = new Date().toISOString();
    timeline(p, 'Sample balance debited once; sandbox payment completed');
  }
  save();
  closePin();
  render();
}
document.addEventListener('click', (e) => {
  const key = e.target.closest('[data-pin-key]');
  if (key && key.dataset.pinKey !== 'confirm') demoPinKey(key.dataset.pinKey);
});
document.addEventListener('keydown', (e) => {
  if (!pinSession || !$('modal').open) return;
  if (/^[0-9]$/.test(e.key) || ['Backspace', 'Delete', 'Enter', 'Escape'].includes(e.key)) {
    e.preventDefault();
    demoPinKey(
      e.key === 'Enter'
        ? 'confirm'
        : e.key === 'Escape'
          ? 'cancel'
          : ['Backspace', 'Delete'].includes(e.key)
            ? 'delete'
            : e.key,
    );
  }
});
$('modal').addEventListener('cancel', () => {
  pinSession = null;
  $('modal').classList.remove('pin-dialog');
});

function review(id) {
  let p = state.payments.find((p) => p.id === id);
  if (p?.status !== 'Held') return;
  modal(
    `<h2 style="padding-top:50px">Simulated investigator review</h2><p class="hint">This demonstration role is not protected authentication. Examine the evidence before recording a decision.</p><ul class="hint">${p.assessment.reasons.map((r) => `<li>${esc(r)}</li>`).join('')}</ul><label class="field">Review note<textarea id="reviewNote" maxlength="500" rows="3" placeholder="Explain your decision"></textarea></label><div class="actions"><button class="btn primary" id="release">Release for authorisation</button><button class="btn danger" id="reject">Cancel payment</button></div><p id="reviewError" class="hint" role="status"></p>`,
  );
  function decide(status) {
    let value = $('reviewNote').value.trim();
    if (!value) return ($('reviewError').textContent = 'A review note is required.');
    if (p.status !== 'Held') return;
    p.status = status;
    timeline(p, 'Simulated investigator: ' + value + '; ' + status);
    $('modal').close();
    render();
  }
  $('release').onclick = () => decide('Ready');
  $('reject').onclick = () => decide('Cancelled');
}
function scan() {
  modal(
    `<h2 style="padding-top:50px">Scan a sample merchant QR</h2><p class="hint">Use a prepared QR payload to demonstrate recipient verification. No camera access or real payment link is opened.</p><label class="field">Sample UPI payload<input id="qrPayload" value="upi://pay?pa=campuscafe@sample&pn=Campus%20Cafe&am=120" readonly></label><button class="btn primary full" id="readQr">Read sample QR</button>`,
  );
  $('readQr').onclick = () => {
    recipient = 'cafe';
    amount = 120;
    note = 'Campus Cafe';
    scenario = 'normal';
    requestType = null;
    $('modal').close();
    go('pay');
  };
}
document.addEventListener('click', (e) => {
  const el = e.target.closest(
    '[data-act],[data-route],[data-contact],[data-connect],[data-scenario],[data-receipt],[data-authorise],[data-verify],[data-review],[data-cancel],[data-export],[data-request],[data-decline]',
  );
  if (!el) return;
  const d = el.dataset;
  if (d.act === 'close') return $('modal').close();
  if (storageError)
    return toast(
      'This workspace changed or could not be validated. Reload or use a fresh browser session.',
    );
  if (busy) return toast('Assessment in progress. Please wait.');
  if (d.route) return go(d.route);
  if (d.contact) {
    recipient = d.contact;
    requestType = null;
    return go('pay');
  }
  if (d.connect) return connect(d.connect);
  if (d.scenario) {
    scenario = d.scenario;
    return render();
  }
  if (d.receipt) {
    selectedPayment = d.receipt;
    return go('receipt');
  }
  if (d.authorise) return passcode(d.authorise);
  if (d.verify) return passcode(d.verify, true);
  if (d.review) return review(d.review);
  if (d.cancel) {
    let p = state.payments.find((p) => p.id === d.cancel);
    if (p && !['Settled', 'Cancelled', 'Checking'].includes(p.status)) {
      p.status = 'Cancelled';
      timeline(p, 'Payment cancelled; no funds debited');
      render();
    }
    return;
  }
  if (d.export) {
    let p = state.payments.find((p) => p.id === d.export);
    if (!p) return;
    const url = URL.createObjectURL(
        new Blob(
          [
            JSON.stringify(
              { scope: 'Sandbox payment receipt; no real bank settlement', payment: p },
              null,
              2,
            ),
          ],
          { type: 'application/json' },
        ),
      ),
      a = document.createElement('a');
    a.href = url;
    a.download = 'shieldpay-receipt.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return;
  }
  if (d.request) {
    const r = requests.find((r) => r.id === d.request);
    if (!activeBank()) return go('banks');
    recipient = r.recipient;
    amount = r.amount;
    note = r.description;
    requestType = r.id;
    scenario = 'normal';
    return go('pay');
  }
  if (d.decline) {
    state.dismissed.push(d.decline);
    save();
    render();
    return toast('Request declined. No funds moved.');
  }
  if (d.act === 'banks') go('banks');
  if (d.act === 'upi') {
    modal(
      `<h2 style="padding-top:50px">Pay a sample UPI ID</h2><p class="hint">Use an ID ending in @sample. Real UPI addresses are not accepted in this sandbox.</p><label class="field">Sample UPI ID<input id="upiHandle" value="friend@sample" maxlength="40"></label><button class="btn primary full" id="upiContinue">Verify sample recipient</button><p id="upiError" role="status" class="hint"></p>`,
    );
    $('upiContinue').onclick = () => {
      const id = $('upiHandle').value.trim();
      if (!/^[a-zA-Z0-9._-]{2,30}@sample$/.test(id))
        return ($('upiError').textContent = 'Use a sample ID such as friend@sample.');
      contacts[3].upi = id;
      contacts[3].name = id.split('@')[0];
      recipient = 'new';
      requestType = null;
      $('modal').close();
      go('pay');
    };
    return;
  }
  if (d.act === 'send') {
    recipient = 'aanya';
    requestType = null;
    go('pay');
  }
  if (d.act === 'scan') scan();
});
window.addEventListener('storage', (e) => {
  if (e.key === STORE) {
    storageError = true;
    toast('Another tab changed this workspace. Reload before making payments.');
    render();
  }
});
window.addEventListener('hashchange', () => {
  if (pinSession) closePin();
  render();
  window.scrollTo({ top: 0, behavior: 'instant' });
});
$('bottom').addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'instant' }));
render();
