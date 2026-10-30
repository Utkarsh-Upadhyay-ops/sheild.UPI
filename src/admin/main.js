'use strict';
const $ = (id) => document.getElementById(id),
  E = ShieldEngine,
  esc = (s) =>
    String(s ?? '').replace(
      /[&<>"']/g,
      (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
    ),
  money = (n) => '₹' + Number(n).toLocaleString('en-IN', { maximumFractionDigits: 0 }),
  pct = (n) => (n * 100).toFixed(1) + '%',
  icon = (name) => {
    let paths = {
      guide: 'M3 10l9-7 9 7 M5 9v12h5v-7h4v7h5V9',
      banks: 'M3 9l9-6 9 6H3z M5 11v8 M10 11v8 M14 11v8 M19 11v8 M3 21h18',
      checkout: 'M3 5h18v14H3z M3 9h18 M7 14h4',
      overview: 'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
      lab: 'M9 3h6 M10 3v6L4 19q-1 2 2 2h12q3 0 2-2L14 9V3 M8 14h8',
      transactions: 'M4 7h16 M16 3l4 4-4 4 M20 17H4 M8 13l-4 4 4 4',
      network: 'M12 5v7 M12 12L5 19 M12 12l7 7 M9 2h6v6H9z M2 16h6v6H2z M16 16h6v6h-6z',
      cases: 'M3 6h7l2 3h9v12H3z M3 6V3h7l2 3',
      behavior: 'M4 17v-6 M8 20V6 M12 22V2 M16 20V6 M20 17v-6',
      model:
        'M5 5h14v14H5z M9 9h6v6H9z M9 2v3 M15 2v3 M9 19v3 M15 19v3 M2 9h3 M2 15h3 M19 9h3 M19 15h3',
      settings:
        'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M12 2v3 M12 19v3 M2 12h3 M19 12h3 M5 5l2 2 M17 17l2 2 M5 19l2-2 M17 7l2-2',
      arrow: 'M5 12h14 M13 6l6 6-6 6',
      download: 'M12 3v12 M7 10l5 5 5-5 M4 17v4h16v-4',
      play: 'M8 4l12 8-12 8z',
      pause: 'M8 4v16 M16 4v16',
    };
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name] || paths.overview}"/></svg>`;
  };
const views = {
  overview: 'Overview',
  transactions: 'Live transactions',
  alerts: 'Fraud alerts',
  network: 'Graph network',
  cases: 'Investigations',
  model: 'Model analytics',
  performance: 'Performance testing',
  wallet: 'ShieldPay',
  simulator: 'Automated fraud simulator',
  protection: '20 fraud scenario tests',
  behavior: 'Behavioral experiment',
  intelligence: 'Model details',
  settings: 'Settings',
  guide: 'Getting started',
  checkout: 'Payment check',
  lab: 'Payment lab',
  banks: 'Bank setup',
};
let model,
  transactions = [],
  cases = {},
  audit = [],
  settings = { verify: 0.2, flag: 0.65, persist: true, reduced: false },
  view = 'overview',
  timer = null,
  streamCount = 0,
  page = 0,
  filter = '',
  query = '',
  selected = 'hub-01',
  zoom = 1,
  graphFilter = 'all',
  simulationResult = null,
  typing = { samples: [], times: [], valid: true, mean: null, deviation: null },
  tourIndex = 0;
const STORE = 'upi-shield-v2',
  PHRASE = 'secure payment',
  MAX = 1500;
let next = 1000,
  toastTimer,
  searchTimer,
  storageBlocked = false;
function accountName(value) {
  const names = (window.ShieldAccountNames ||= new Map());
  const id = String(value ?? '');
  if (id === 'person-self') return 'Person 0 (you)';
  if (/^person-[1-9]\d?$/.test(id)) return 'Person ' + Number(id.slice(7));
  if (!id) return 'Unknown person';
  if (!names.has(id)) names.set(id, names.size + 1);
  return 'Person ' + names.get(id);
}
function notify(s) {
  $('toast').textContent = s;
  $('toast').classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('toast').classList.remove('show'), 3200);
}
function save() {
  if (storageBlocked) return;
  try {
    if (settings.persist)
      localStorage.setItem(
        STORE,
        JSON.stringify({
          transactions: transactions.slice(0, MAX),
          cases,
          audit: audit.slice(-2500),
          settings,
          next,
          connections,
          journey,
          demoPayments,
        }),
      );
    else localStorage.removeItem(STORE);
  } catch (e) {
    notify('Browser storage is full. Export a backup to preserve this session.');
  }
}
let sharedShieldPayments=[], shieldCloud=null, shieldSyncStatus='Connecting to shared payment history…';
function syncShieldPayRecords() {
  const bridge = window.ShieldPaymentBridge;
  if(!bridge || !model) return false;
  let incoming;
  try {incoming=bridge.read(localStorage.getItem(bridge.key));}catch{return false;}
  incoming=bridge.combine(incoming||[],sharedShieldPayments);
  const before=transactions.filter(t=>t.source==='ShieldPay');
  if(JSON.stringify(before)===JSON.stringify(incoming.slice().sort((a,b)=>Date.parse(b.timestamp)-Date.parse(a.timestamp))))return false;
  const previous=new Map(before.map(t=>[t.id,t]));
  transactions=bridge.merge(transactions,incoming,MAX);
  page=0;
  const retained=new Set(transactions.map(t=>t.id));
  for(const id of Object.keys(cases))if(!retained.has(id))delete cases[id];
  for(const row of incoming){
    if((row.decision!=='Allow'||['Suspicious','Not sure'].includes(row.customerReport?.answer))&&!cases[row.id])cases[row.id]={status:'Open',notes:[],outcome:null};
    if(previous.get(row.id)?.status!==row.status)logAudit(row.id,'ShieldPay payment: '+row.status);
    if(row.customerReport?.updatedAt!==previous.get(row.id)?.customerReport?.updatedAt&&row.customerReport)logAudit(row.id,'Customer safety response: '+row.customerReport.answer+' ('+row.customerReport.reason+')');
  }
  return true;
}
function logAudit(ref, action) {
  audit.push({ time: new Date().toISOString(), ref, action });
  if (audit.length > 2500) audit.shift();
}
function rng(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
let random = rng(110411);
function synthetic(kind) {
  let risky = kind === 'high' || kind === 'ring',
    medium = kind === 'medium',
    r = random;
  return {
    sender: 'demo-' + String(1 + Math.floor(r() * 18)).padStart(2, '0'),
    receiver:
      kind === 'ring' ? 'hub-01' : 'demo-' + String(21 + Math.floor(r() * 18)).padStart(2, '0'),
    amount: risky
      ? Math.round(18000 + r() * 62000)
      : medium
        ? Math.round(4000 + r() * 12000)
        : Math.round(100 + r() * 2200),
    average: risky ? 1500 : medium ? 2000 : 2500,
    velocity: risky
      ? 7 + Math.floor(r() * 8)
      : medium
        ? 3 + Math.floor(r() * 2)
        : 1 + Math.floor(r() * 2),
    age: risky ? 1 + Math.floor(r() * 6) : medium ? 20 : 120 + Math.floor(r() * 600),
    newRecipient: risky || medium || r() < 0.15,
    newDevice: risky,
    night: risky && r() < 0.6,
    fanin: kind === 'ring' ? 6 : risky ? 3 : medium ? 2 : 0,
    rapid: risky,
    behavior: risky ? 2.8 : medium ? 1 : 0.25,
    kind: kind || 'normal',
    source: 'Generated sample',
    timestamp: new Date().toISOString(),
  };
}
function process(t, record = true, persist = true, allocate = record, assessment = null) {
  const start = performance.now();
  let scored = assessment
      ? {
          value: assessment.modelScore,
          ms: assessment.timings.scoringMs,
          contributions: assessment.contributions,
        }
      : E.score(model, t),
    decision = assessment?.decision || E.decision(scored.value, settings);
  let item = {
    ...t,
    id: t.id || (allocate ? 'TX-' + String(++next).padStart(6, '0') : 'PREVIEW'),
    risk: scored.value,
    decision,
    scoreMs: scored.ms,
    assessmentMs: assessment ? assessment.timings.serverTotalMs : performance.now() - start,
    contributions: scored.contributions,
    thresholds: assessment ? assessment.policy : { verify: settings.verify, flag: settings.flag },
    model: model.version,
  };
  if (record) {
    transactions.unshift(item);
    transactions = transactions.slice(0, MAX);
    let retained = new Set(transactions.map((t) => t.id));
    for (let id of Object.keys(cases)) if (!retained.has(id)) delete cases[id];
    if (decision !== 'Allow') cases[item.id] = { status: 'Open', notes: [], outcome: null };
    logAudit(item.id, 'Assessed: ' + decision);
    if (persist) {
      save();
      updateNav();
    }
  }
  return item;
}
function seed() {
  for (let i = 0; i < 84; i++) {
    let t = synthetic(i % 11 === 0 ? 'high' : i % 7 === 0 ? 'medium' : 'normal');
    t.timestamp = new Date(Date.now() - (84 - i) * 120000).toISOString();
    let s = process(t, false, true, true);
    transactions.unshift(s);
    if (s.decision !== 'Allow')
      cases[s.id] = { status: i % 3 === 0 ? 'Investigating' : 'Open', notes: [], outcome: null };
  }
  for (let i = 0; i < 5; i++) {
    let t = synthetic('ring');
    t.sender = 'demo-0' + (i + 1);
    t.amount = 4000 + i * 1500;
    t.timestamp = new Date(Date.now() - 100000 + i * 10000).toISOString();
    let s = process(t, false, true, true);
    transactions.unshift(s);
    if (s.decision !== 'Allow') cases[s.id] = { status: 'Open', notes: [], outcome: null };
  }
  let out = synthetic('high');
  out.sender = 'hub-01';
  out.receiver = 'exit-01';
  out.timestamp = new Date(Date.now() - 25000).toISOString();
  let t = process(out, false, true, true);
  transactions.unshift(t);
  cases[t.id] = { status: 'Open', notes: [], outcome: null };
  logAudit('WORKSPACE', 'Synthetic demo dataset created');
  save();
}
function updateNav() {
  updateMobileNav();
  const main = ['overview', 'transactions', 'alerts', 'network', 'cases', 'model', 'performance'],
    advanced = ['simulator', 'protection', 'behavior', 'intelligence', 'settings'];
  $('nav').innerHTML =
    main
      .map(
        (id) =>
          `<a href="${id === 'wallet' ? './pay' : '#' + id}" class="${view === id ? 'active' : ''}" ${view === id ? 'aria-current="page"' : ''}>${icon(id)}<span>${views[id]}</span></a>`,
      )
      .join('') +
    `<details class="advancednav" ${advanced.includes(view) ? 'open' : ''}><summary>Advanced tools</summary>${advanced.map((id) => `<a href="#${id}" class="${view === id ? 'active' : ''}">${icon(id)}<span>${views[id]}</span></a>`).join('')}</details>`;
}

function updateMobileNav() {
  if (!$('mobileNav')) return;
  const links = [
    ['overview', 'Overview', 'overview'],
    ['transactions', 'Activity', 'transactions'],
    ['alerts', 'Alerts', 'cases'],
    ['network', 'Graph', 'network'],
  ];
  $('mobileNav').innerHTML =
    links
      .map(
        ([id, label, glyph]) =>
          `<a href="#${id}" class="${view === id ? 'active' : ''}" ${view === id ? 'aria-current="page"' : ''}>${icon(glyph)}<span>${label}</span></a>`,
      )
      .join('') +
    `<button type="button" data-mobile-menu aria-label="Open all pages" aria-controls="sidebar" aria-expanded="${document.body.classList.contains('menuopen')}">${icon('settings')}<span>More</span></button>`;
}
function setMobileMenu(open, restoreFocus = false) {
  document.body.classList.toggle('menuopen', open);
  $('menuBtn').setAttribute('aria-expanded', String(open));
  $('menuBackdrop').hidden = !open;
  document.querySelector('[data-mobile-menu]')?.setAttribute('aria-expanded', String(open));
  document.querySelector('.workspace').inert = open;
  $('mobileNav').inert = open;
  if (open) $('closeMenu').focus();
  else if (restoreFocus) $('menuBtn').focus();
}
document.addEventListener('click', (e) => {
  if (e.target.closest('[data-mobile-menu]')) setMobileMenu(true);
  if (
    e.target.closest('#nav a,.brand,.mobile-bottom a') &&
    document.body.classList.contains('menuopen')
  )
    setMobileMenu(false);
});
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Tab' || !document.body.classList.contains('menuopen')) return;
  const items = Array.from($('sidebar').querySelectorAll('a,button,summary')).filter(
      (el) => el.getClientRects().length,
    ),
    first = items[0],
    last = items.at(-1);
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last?.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first?.focus();
  }
});
window.addEventListener('resize', () => {
  if (window.innerWidth > 900 && document.body.classList.contains('menuopen')) setMobileMenu(false);
});
function pagehead(title, desc, buttons = '') {
  return `<div class="pagetop"><div><div class="eyebrow">UPI Shield / ${views[view]}</div><h1>${title}</h1><p>${desc}</p></div><div class="actions">${buttons}</div></div>`;
}
function badge(d) {
  return `<span class="chip ${d}"><span class="dot"></span>${d === 'Flag' ? 'Flag for review' : d === 'Verify' ? 'Verify' : 'Allowed'}</span>`;
}
function riskclass(r) {
  return r >= 0.65 ? 'high' : r >= 0.2 ? 'medium' : 'low';
}
function stat(label, value, note, symbol) {
  return `<div class="stat"><div class="statlabel">${label}<i>${symbol}</i></div><strong>${value}</strong><small>${note}</small></div>`;
}
function stats() {
  let flagged = transactions.filter((t) => t.decision === 'Flag'),
    open = Object.values(cases).filter((c) => c.status !== 'Resolved').length,
    mean = transactions.length
      ? transactions.reduce((a, t) => a + t.scoreMs, 0) / transactions.length
      : 0;
  return `<div class="stats">${stat('Transactions assessed', transactions.length.toLocaleString(), timer ? 'Synthetic stream is running' : settings.persist && !storageBlocked ? 'Stored in this browser' : 'Session memory only', '↗')}${stat('Flagged value', money(flagged.reduce((a, t) => a + t.amount, 0)), 'Simulated value, not prevented losses', '◇')}${stat('Open review cases', open, 'Includes verification requests', '◎')}${stat('Mean scoring time', (mean < 0.01 ? '＜0.01' : mean.toFixed(2)) + ' ms', 'Browser inference only', 'ϟ')}</div>`;
}
function table(items) {
  return `<div class="tablewrap"><table><thead><tr><th>Transaction</th><th>Sender → Receiver</th><th>Amount</th><th>Risk index</th><th>Decision</th><th>Scoring</th></tr></thead><tbody>${items.map((t, i) => `<tr data-tx="${t.id}" tabindex="0" aria-label="Open ${t.id}" class="${i === 0 && timer ? 'newrow' : ''}"><td data-label="Transaction"><span class="mono">${esc(t.id)}</span>${t.source==='ShieldPay'?`<span class="shieldpay-status ${t.status==='Paid'?'is-paid':t.status==='Held for review'?'is-held':''}">ShieldPay · ${esc(t.status)}</span>`:''}${t.customerReport?`<span class="customer-concern ${t.customerReport.answer==='Looks right'?'is-clear':''}">Customer: ${esc(t.customerReport.answer)}</span>`:''}${t.bank ? `<span class="bank-source">${esc(bankFor(t.bank)?.short || 'Demo bank')}</span>` : ''}<span class="muted">${new Date(t.timestamp).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span></td><td data-label="Sender → Receiver"><span class="accounticon">${esc(accountName(t.sender).replace('Person ', ''))}</span>${esc(accountName(t.sender))} <span class="muted">→ ${esc(accountName(t.receiver))}</span></td><td data-label="Amount"><b>${money(t.amount)}</b></td><td data-label="Risk index"><span class="riskpill ${t.decision === 'Flag' ? 'high' : t.decision === 'Verify' ? 'medium' : 'low'}">${(t.risk * 100).toFixed(1)}</span> <span class="muted">/100</span></td><td data-label="Decision">${badge(t.decision)}</td><td data-label="Scoring">${t.scoreMs < 0.01 ? '&lt;0.01' : t.scoreMs.toFixed(2)} ms</td></tr>`).join('')}</tbody></table>${items.length ? '' : '<div class="empty">No transactions match these filters.<br>Try another search or assess a new payment.</div>'}</div>`;
}
function trend() {
  let now = Date.now(),
    buckets = Array.from({ length: 12 }, () => []);
  transactions.forEach((t) => {
    let age = now - Date.parse(t.timestamp),
      i = 11 - Math.floor(age / 120000);
    if (age >= 0 && i >= 0 && i < 12) buckets[i].push(t);
  });
  let max = Math.max(1, ...buckets.map((b) => b.length)),
    all = buckets.map((b, i) => [(i * 600) / 11, 140 - (b.length / max) * 110]),
    risky = buckets.map((b, i) => [
      (i * 600) / 11,
      140 - (b.filter((t) => t.decision !== 'Allow').length / max) * 110,
    ]),
    pts = (a) => a.map((p) => p.join(',')).join(' ');
  return `<svg class="chart" viewBox="-5 -5 620 180" role="img" aria-label="Payments in the last 24 minutes, grouped into 2 minute bins"><defs><linearGradient id="area" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#3baf83" stop-opacity=".25"/><stop offset="1" stop-color="#3baf83" stop-opacity=".01"/></linearGradient></defs>${[30, 65, 100, 140].map((y) => `<line x1="0" x2="600" y1="${y}" y2="${y}"/>`).join('')}<polygon points="0,140 ${pts(all)} 600,140" fill="url(#area)"/><polyline points="${pts(all)}" fill="none" stroke="#20835e" stroke-width="2.5" stroke-linejoin="round" pathLength="1"/><polyline points="${pts(risky)}" fill="none" stroke="#ed9b49" stroke-width="2.5" stroke-linejoin="round" pathLength="1"/>${risky.map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="3" fill="#ed9b49"><title>Bin ${i + 1}: ${buckets[i].length} payments, ${buckets[i].filter((t) => t.decision !== 'Allow').length} require review</title></circle>`).join('')}<text x="0" y="168">24 minutes ago</text><text x="555" y="168">Now</text><text x="0" y="15">Peak: ${max} payments / bin</text></svg>`;
}

function distribution() {
  let a = transactions.filter((t) => t.decision === 'Allow').length,
    v = transactions.filter((t) => t.decision === 'Verify').length,
    f = transactions.length - a - v,
    n = Math.max(1, transactions.length);
  return `<div class="split"><div class="donut" style="background:conic-gradient(#2e9d73 0 ${(a / n) * 100}%,#f2ce78 ${(a / n) * 100}% ${((a + v) / n) * 100}%,#eea359 ${((a + v) / n) * 100}% 100%)"><div><b>${transactions.length}</b><small>ASSESSED</small></div></div><div class="distlabels"><div><span class="dot" style="color:#2e9d73"></span>Allowed <strong>${a}</strong></div><div><span class="dot" style="color:#e6bb58"></span>Verify <strong>${v}</strong></div><div><span class="dot" style="color:#eaa15a"></span>Flagged <strong>${f}</strong></div></div></div>`;
}
function renderOverview() {
  return (
    pagehead(
      'Your fraud detection demo.',
      'Built in sample payments. No files, bank account or setup needed.',
      `<button class="btn" data-action="present">Presentation mode ↗</button><button class="btn primary" data-action="stream">${icon(timer ? 'pause' : 'play')}${timer ? 'Pause stream' : 'Play sample payments'}</button>`,
    ) +
    `<section class="hero"><div class="herotext"><div class="hero-kicker"><span class="tricolor-mini"></span> PAYMENT MONITORING</div><h2>Payment monitoring<br>and fraud review.</h2><p>Catch unusual payment behavior and connected account patterns in one explainable workspace.</p><button class="btn" data-go="guide">Start the guided demo ${icon('arrow')}</button></div><div class="heroart" aria-hidden="true"><svg class="payment-orbit" viewBox="0 0 340 210"><defs><linearGradient id="triRoute"><stop stop-color="#ef963f"/><stop offset=".5" stop-color="#8aabc1"/><stop offset="1" stop-color="#168451"/></linearGradient></defs><ellipse cx="170" cy="105" rx="145" ry="72" fill="none" stroke="#cadbd3" stroke-width="1" stroke-dasharray="3 7"/><path id="payRoute" d="M35 120 Q100 10 170 100 T305 95" fill="none" stroke="url(#triRoute)" stroke-width="3"/><circle r="5" fill="#ed9236"><animateMotion dur="4s" repeatCount="indefinite"><mpath href="#payRoute"/></animateMotion></circle><circle r="4" fill="#158151"><animateMotion dur="4s" begin="-2s" repeatCount="indefinite"><mpath href="#payRoute"/></animateMotion></circle><g class="float-a"><rect x="15" y="99" width="46" height="46" rx="14" fill="#fff3e5" stroke="#f1bf88"/><text x="38" y="128" text-anchor="middle" fill="#b05f1f" font-size="22">₹</text></g><g class="float-b"><path d="M170 63 L200 74 L197 111 Q190 133 170 143 Q150 133 143 111 L140 74Z" fill="#153b70"/><path d="M157 100 L167 110 L184 88" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></g><g class="float-c"><rect x="282" y="72" width="46" height="46" rx="14" fill="#e2f4e8" stroke="#9acdb0"/><text x="305" y="101" text-anchor="middle" fill="#147248" font-size="21">✓</text></g><text x="170" y="190" text-anchor="middle" fill="#688774" font-size="10" letter-spacing="2">DETECT · EXPLAIN · REVIEW</text></svg></div></section><div class="demo-ready"><b>Start with the complete payment journey.</b><span>Connect a demo bank, sync its generated payments, then review the alerts. No real account is needed.</span><button class="btn primary" data-go="guide">Open your guide →</button></div><div class="flowstrip" aria-label="Illustrative assessment pipeline"><div class="flow-title"><span class="signal-dot"></span><b>Intelligence in motion</b><small>Illustrative pipeline</small></div><div class="flowsteps"><div class="flowstep"><span>01</span>Payment signals</div><i aria-hidden="true">→</i><div class="flowstep"><span>02</span>Model scoring</div><i aria-hidden="true">→</i><div class="flowstep"><span>03</span>Account patterns</div><i aria-hidden="true">→</i><div class="flowstep"><span>04</span>Human review</div></div></div><div id="stats">${stats()}</div><div class="grid"><section class="card"><div class="cardhead"><div><h2>Transaction pulse</h2><p class="subtitle">Last 24 minutes, grouped in 2 minute bins</p></div><span class="tag ${timer ? 'live' : ''}">${timer ? '<span class="dot"></span>Live simulation' : 'Demo history'}</span></div><div id="trend">${trend()}</div><div class="legend"><span><i style="background:#2e9d73"></i>All payments</span><span><i style="background:#eea359"></i>Verification + flags</span></div></section><section class="card"><div class="cardhead"><h2>Decision mix</h2><span class="tag">Session data</span></div><div id="distribution">${distribution()}</div><p class="limitnote">Counts reflect policy decisions, not confirmed fraud. Every flagged case is available for review.</p></section></div><div class="grid"><section class="card"><div class="cardhead"><div><h2>Recent transactions</h2><p class="subtitle">Select any row to inspect the decision</p></div><button class="btn tiny" data-go="transactions">View all ↗</button></div><div id="recent">${table(transactions.slice(0, 5))}</div></section><section class="card"><div class="cardhead"><h2>Investigation desk</h2><span class="tag">Next actions</span></div><div class="activity"><span class="activityicon">◇</span><div><p><b>Inspect connected accounts</b><br>Follow incoming payments into ${esc(accountName('hub-01'))} and their rapid onward transfer.</p><button class="btn tiny spacer" data-go="network">Explore network →</button></div></div><div class="activity"><span class="activityicon" style="background:#e8f8f1;color:#32a780">◎</span><div><p><b>Review before concluding</b><br>Add investigator notes and record a case outcome.</p><button class="btn tiny spacer" data-go="cases">Open case board →</button></div></div><p class="limitnote">This is a fully interactive sandbox. It has no connection to UPI or banking infrastructure.</p></section></div>`
  );
}
const sampleInputs = {
  normal: {
    amount: 650,
    average: 2000,
    velocity: 1,
    age: 420,
    newRecipient: false,
    newDevice: false,
    night: false,
    fanin: 0,
    rapid: false,
    behavior: 0.3,
  },
  unusual: {
    amount: 40000,
    average: 1000,
    velocity: 8,
    age: 3,
    newRecipient: true,
    newDevice: true,
    night: true,
    fanin: 2,
    rapid: false,
    behavior: 2.8,
  },
  ring: {
    amount: 12000,
    average: 1500,
    velocity: 9,
    age: 2,
    newRecipient: true,
    newDevice: true,
    night: false,
    fanin: 6,
    rapid: true,
    behavior: 2.5,
  },
};
let labInput = { ...sampleInputs.normal },
  scenario = 'normal';
function field(id, label, value, min, max, step = 1) {
  return `<label class="field" for="${id}">${label}<input id="${id}" type="number" min="${min}" max="${max}" step="${step}" value="${value}" required></label>`;
}
function renderLab() {
  let x = labInput;
  return (
    pagehead(
      'Choose a payment. See what happens.',
      'Tap an example below. We fill in the sample details and check it instantly.',
    ) +
    `<div class="scenariochips">${[
      ['normal', 'Normal payment', '◉'],
      ['unusual', 'Large unusual payment', 'ϟ'],
      ['ring', 'Suspicious network', '◇'],
    ]
      .map(
        ([id, l, s]) =>
          `<button class="btn ${scenario === id ? 'active' : ''}" data-scenario="${id}">${s} ${l}</button>`,
      )
      .join(
        '',
      )}</div><div class="simlayout"><section class="card"><div class="cardhead"><h2>Sample payment</h2><span class="tag">Demo data</span></div><form id="labForm"><div class="assumed-details"><b>${scenario === 'normal' ? 'A familiar everyday payment' : scenario === 'unusual' ? 'A large payment from an unfamiliar device' : 'Several accounts sending money through one hub'}</b><p>${scenario === 'normal' ? 'Assumed: an established recipient, one recent transfer and a familiar device.' : scenario === 'unusual' ? 'Assumed: a new recipient, eight recent transfers and an unfamiliar device.' : 'Assumed: six incoming senders, nine recent transfers and a rapid onward transfer.'}</p></div>${field('amount', 'Payment amount (₹)', x.amount, 1, 10000000)}<details class="advanced-inputs"><summary>Advanced: view or change the assumptions</summary><div class="formgrid spacer">${field('average', 'Usual payment amount (₹)', x.average, 1, 10000000)}${field('velocity', 'Transfers in 10 minutes', x.velocity, 1, 1000)}${field('age', 'Receiver age (days)', x.age, 0, 20000)}${field('fanin', 'Distinct incoming senders (sample)', x.fanin, 0, 1000)}${field('behavior', 'Typing deviation (demo units)', x.behavior, 0, 6, 0.1)}</div><div class="checks">${[
      ['newRecipient', 'First payment to recipient'],
      ['newDevice', 'Unfamiliar device'],
      ['night', 'Night time activity'],
      ['rapid', 'Rapid onward transfer'],
    ]
      .map(
        ([id, l]) =>
          `<label class="check"><input type="checkbox" id="${id}" ${x[id] ? 'checked' : ''}>${l}</label>`,
      )
      .join(
        '',
      )}</div><label class="check"><input type="checkbox" id="useBehavior" ${typing.deviation === null ? 'disabled' : ''}>Use captured behavior deviation ${typing.deviation === null ? '(enrol in Behavior lab first)' : ''}</label></details><button class="btn primary full spacer" type="submit">${icon('lab')} Check this payment</button><p class="limitnote" id="labState">All details are made up for this demonstration. No money is sent.</p></form></section><div id="labResult">${resultCard(simulationResult || process({ ...x, sender: 'demo-user', receiver: scenario === 'ring' ? 'hub-01' : 'demo-receiver', source: 'Simulator preview', timestamp: new Date().toISOString() }, false), !simulationResult)}</div></div><div class="alertbanner spacer">This model is trained and calibrated on separate made up datasets. Its estimate is not validated for real fraud.</div>`
  );
}
function resultCard(t, preview = false) {
  let color = t.decision === 'Flag' ? '#e97898' : t.decision === 'Verify' ? '#dfb24f' : '#41b995',
    percent = t.risk * 100;
  return `<section class="card scorecard"><div class="eyebrow">${preview ? 'Scenario preview' : 'Assessment complete'} / ${esc(t.model)}</div><svg viewBox="0 0 240 145" role="img" aria-label="Model risk index ${percent.toFixed(1)} out of 100"><path d="M25 115 A95 95 0 0 1 215 115" fill="none" stroke="#e4ede8" stroke-width="13" stroke-linecap="round" pathLength="100"/><path d="M25 115 A95 95 0 0 1 215 115" fill="none" stroke="${color}" stroke-width="13" stroke-linecap="round" pathLength="100" stroke-dasharray="${Math.max(0.01, percent)} 100" style="--gauge:${Math.max(0.01, percent)}" class="gaugepath"/><text x="120" y="98" text-anchor="middle" class="scorevalue">${percent.toFixed(1)}</text><text x="120" y="120" text-anchor="middle" class="scorecaption">DEMO RISK SCORE / 100</text></svg><div>${badge(t.decision)}</div><div class="scoredecision">${t.decision === 'Allow' ? 'No extra check suggested' : t.decision === 'Verify' ? 'Ask for an extra check' : 'Review before proceeding'}</div><p>${t.decision === 'Allow' ? 'No configured threshold was exceeded. A low score does not guarantee a safe payment.' : 'These signals warrant attention. A model flag is not proof of fraud.'}</p><details class="result-explanation"><summary>Why this result? See details</summary><div>${
    t.contributions
      .slice(0, 4)
      .map(
        (c) =>
          `<div class="reasonbar"><div class="row"><span>${esc(c.name)}</span><b>+${(c.value * 100).toFixed(1)} pts*</b></div><div class="mini-track"><span style="width:${Math.min(100, c.value * 150)}%"></span></div></div>`,
      )
      .join('') ||
    '<p class="limitnote">No positive single input contributions above the display threshold.</p>'
  }</div><div class="timinggrid"><div><small>Model scoring</small><b>${t.scoreMs < 0.01 ? '&lt;0.01' : t.scoreMs.toFixed(2)} ms</b></div><div><small>Local assessment</small><b>${t.assessmentMs.toFixed(2)} ms</b></div></div><p class="limitnote">*Single feature reference comparisons do not add up to the score. Timing excludes network, rendering and settlement.</p></details>${!preview ? `<button class="btn tiny" data-detail="${t.id}">Inspect ${t.id} ↗</button>` : ''}</section>`;
}
function filtered() {
  return transactions.filter(
    (t) =>
      (!filter || t.decision === filter) &&
      (!query ||
        [t.id, t.sender, t.receiver, t.source, t.customerReport?.answer||''].some((s) =>
          (String(s) + ' ' + accountName(s)).toLowerCase().includes(query.toLowerCase()),
        )),
  );
}
function renderTransactions() {
  let items = filtered();
  page = Math.max(0, Math.min(page, Math.ceil(items.length / 15) - 1));
  return (
    pagehead(
      'Every transaction. Every signal.',
      'Shared ShieldPay payment history. Payments from your phone appear here automatically.',
      `<a class="btn" href="./pay">Make a ShieldPay payment ↗</a><button class="btn" data-shieldpay-only>ShieldPay payments only</button><button class="btn primary" data-action="export">${icon('download')} Export filtered CSV</button>`,
    ) +
    `<div class="shield-sync-bar"><span id="shieldSync" role="status">${esc(shieldSyncStatus)}</span><button class="btn tiny" data-sync-payments>Sync now / show latest</button><small>Public synthetic demo activity · No real bank payments</small></div><div class="filterbar"><input id="txSearch" value="${esc(query)}" placeholder="Search transaction or demo account" aria-label="Search transaction history"><select id="txFilter" aria-label="Decision filter"><option value="">All decisions</option>${['Allow', 'Verify', 'Flag'].map((v) => `<option ${filter === v ? 'selected' : ''}>${v}</option>`).join('')}</select><span class="tag">${items.length} records</span><button class="btn tiny" data-action="clearfilters">Clear filters</button></div><section class="card">${table(items.slice(page * 15, page * 15 + 15))}<div class="pagination"><span>${items.length ? page * 15 + 1 : 0}–${Math.min(items.length, page * 15 + 15)} of ${items.length}</span><div class="actions"><button class="btn tiny" data-action="prev" ${page === 0 ? 'disabled' : ''}>← Previous</button><button class="btn tiny" data-action="next" ${(page + 1) * 15 >= items.length ? 'disabled' : ''}>Next →</button></div></div></section><p class="limitnote">At most ${MAX} recent transactions are retained. Export before resetting. Decisions retain the threshold values used when they were assessed.</p>`
  );
}
function networkData() {
  let tx = transactions
      .filter(
        (t) => (t.source!=='ShieldPay'||t.settled===true)&&(!t.paymentId || demoPayments.find((p) => p.id === t.paymentId)?.status === 'Settled'),
      )
      .slice(0, 180),
    map = new Map();
  tx.forEach((t) => {
    for (let id of [t.sender, t.receiver])
      if (!map.has(id)) map.set(id, { id, incoming: [], outgoing: [], risk: 0 });
    let a = map.get(t.sender),
      b = map.get(t.receiver);
    a.outgoing.push(t);
    b.incoming.push(t);
    a.risk = Math.max(a.risk, t.risk);
    b.risk = Math.max(b.risk, t.risk);
  });
  let sorted = [...map.values()].sort(
    (a, b) => b.incoming.length + b.outgoing.length - (a.incoming.length + a.outgoing.length),
  );
  let priority = new Set(['hub-01', 'exit-01', selected]);
  let focus = map.get(selected);
  if (focus) {
    focus.incoming.forEach((t) => priority.add(t.sender));
    focus.outgoing.forEach((t) => priority.add(t.receiver));
  }
  let ids = [...priority].map((id) => map.get(id)).filter(Boolean);
  ids = [...ids, ...sorted.filter((n) => !priority.has(n.id))].slice(0, 22);
  let allowed = new Set(ids.map((n) => n.id));
  return {
    nodes: ids,
    edges: tx.filter((t) => allowed.has(t.sender) && allowed.has(t.receiver)),
    map,
  };
}
function graphSVG() {
  let { nodes, edges } = networkData(),
    cx = 360,
    cy = 235,
    positions = {};
  nodes.forEach((n, i) => {
    let a = (i / nodes.length) * Math.PI * 2;
    positions[n.id] =
      n.id === 'hub-01' ? [cx, cy] : [cx + Math.cos(a) * 260, cy + Math.sin(a) * 175];
  });
  let adj = new Set([selected]);
  edges
    .filter((t) => t.sender === selected || t.receiver === selected)
    .forEach((t) => {
      adj.add(t.sender);
      adj.add(t.receiver);
    });
  return `<svg viewBox="0 0 720 470" id="networkSvg" aria-label="Interactive directed payment graph"><defs><marker id="arrow" markerWidth="7" markerHeight="7" refX="6" refY="3" orient="auto"><path d="M0 0 L0 6 L6 3Z" fill="#87af9c"/></marker></defs><g transform="translate(${360 * (1 - zoom)} ${235 * (1 - zoom)}) scale(${zoom})">${edges
    .filter((t) => graphFilter !== 'risky' || t.decision !== 'Allow')
    .map((t) => {
      let [x, y] = positions[t.sender],
        [xx, yy] = positions[t.receiver],
        dx = xx - x,
        dy = yy - y,
        len = Math.hypot(dx, dy) || 1;
      return `<line class="edge ${t.decision === 'Flag' ? 'hot' : ''}" x1="${x + (dx / len) * 17}" y1="${y + (dy / len) * 17}" x2="${xx - (dx / len) * 23}" y2="${yy - (dy / len) * 23}" marker-end="url(#arrow)" style="opacity:${t.sender === selected || t.receiver === selected ? 0.9 : 0.18}"><title>${esc(accountName(t.sender))} → ${esc(accountName(t.receiver))}: ${money(t.amount)}</title></line>`;
    })
    .join('')}${nodes
    .map((n) => {
      let [x, y] = positions[n.id],
        r = n.id === 'hub-01' ? 25 : 17;
      return `<g class="node ${selected === n.id ? 'selected' : ''}" data-node="${esc(n.id)}" tabindex="0" role="button" aria-label="Inspect account ${esc(accountName(n.id))}" style="opacity:${adj.has(n.id) ? 1 : 0.45}" transform="translate(${x} ${y})"><circle r="${r}" fill="${n.risk >= 0.65 ? '#ffe4ed' : '#e4f2e9'}" stroke="${n.risk >= 0.65 ? '#e985a2' : '#6ab791'}"/><text text-anchor="middle" y="4">${esc(accountName(n.id).replace('Person ', ''))}</text><text text-anchor="middle" y="${r + 15}">${esc(accountName(n.id))}</text></g>`;
    })
    .join('')}</g></svg>`;
}
function nodeInfo() {
  let d = networkData(),
    n = d.map.get(selected);
  if (!n) return '<div class="empty">Select a node in the graph.</div>';
  let incoming = new Set(n.incoming.map((t) => t.sender)),
    signals = E.networkSignals(n.incoming, n.outgoing),
    rapid = signals.rapid,
    pattern = signals.pattern;
  return `<span class="tag">Selected account</span><h3>${esc(accountName(n.id))}</h3><p class="subtitle">Synthetic identity · No real account</p><div class="detailrow"><span>Incoming senders</span><b>${incoming.size}</b></div><div class="detailrow"><span>Received</span><b>${money(n.incoming.reduce((a, t) => a + t.amount, 0))}</b></div><div class="detailrow"><span>Sent</span><b>${money(n.outgoing.reduce((a, t) => a + t.amount, 0))}</b></div><div class="detailrow"><span>Highest linked risk</span><b>${(n.risk * 100).toFixed(1)} /100</b></div><div class="detailrow"><span>Rapid onward transfer</span><b>${rapid ? 'Detected' : 'Not detected'}</b></div><div class="detailrow"><span>Senders within 120 seconds</span><b>${signals.windowSenders}</b></div><div class="notice">${pattern ? 'Fan in + rapid onward pattern detected from the displayed dataset. Review the linked payments before drawing conclusions.' : 'No combined fan in + rapid onward pattern detected. This does not establish that the account is safe.'}</div><button class="btn tiny full spacer" data-account="${esc(n.id)}">View account transactions →</button><p class="limitnote">Graph uses up to 180 sample ledger records (unsettled guided payments are excluded), with up to 22 accounts prioritising the selected account and its neighbours. It shows a subset of the ledger.</p>`;
}
function renderNetwork() {
  return (
    pagehead(
      'Account network',
      'Select an account to follow the payment relationships.',
      `<button class="btn" data-action="ring">Inject network scenario</button>`,
    ) +
    `<div class="networklayout"><section class="card"><div class="cardhead"><div><h2>Payment relationship graph</h2><p class="subtitle">Directed edges · Select any node · Animated flagged links</p></div><span class="tag">Graph analysis</span></div><div class="graph-controls"><button class="btn tiny" data-action="zoomout" aria-label="Zoom out">−</button><button class="btn tiny" data-action="zoomin" aria-label="Zoom in">+</button><button class="btn tiny" data-action="zoomreset">Reset view</button><button class="btn tiny" data-action="graphfilter">${graphFilter === 'all' ? 'Show risky links' : 'Show all links'}</button></div><div class="graphcanvas" id="graphcanvas">${graphSVG()}</div><div class="legend"><span><i style="background:#6ab791"></i>Account</span><span><i style="background:#ed8faa"></i>Linked to flagged payment</span><span>Arrows indicate money direction</span></div><div class="nodelegend">${networkData()
      .nodes.map((n) => `<button data-node="${esc(n.id)}">${esc(accountName(n.id))}</button>`)
      .join(
        '',
      )}</div></section><section class="card nodedetail" id="nodeInfo">${nodeInfo()}</section></div>`
  );
}
function renderCases() {
  let entries = transactions.filter((t) => cases[t.id]);
  return (
    pagehead(
      'From signal to investigation.',
      'Review customer concerns and model alerts, leave notes, and record a human decision.',
      `<button class="btn" data-action="caseexport">${icon('download')} Export case report</button>`,
    ) +
    `<div class="alertbanner">Case outcomes are investigator labels in this demo. They do not reverse a payment or establish legal wrongdoing.</div><div class="cases">${[
      'Open',
      'Investigating',
      'Resolved',
    ]
      .map((status) => {
        let list = entries.filter((t) => cases[t.id].status === status);
        return `<section class="casecol"><h2>${status}<span>${list.length}</span></h2>${
          list
            .slice(0, 30)
            .map(
              (t) =>
                `<article class="caseitem" data-tx="${t.id}" tabindex="0" aria-label="Open case ${t.id}"><div class="headrow">${badge(t.decision)}<span class="mono">${t.id.slice(-6)}</span></div><h3>${money(t.amount)} · ${esc(accountName(t.sender))}</h3><p>${esc(t.customerReport&&t.customerReport.answer!=='Looks right'?'Customer reported: '+t.customerReport.answer:t.contributions[0]?.name || 'Policy threshold exceeded')}</p><div class="casefooter"><span>${cases[t.id].notes.length} notes</span><span>${status === 'Resolved' ? esc(cases[t.id].outcome || 'Reviewed') : 'Risk ' + (t.risk * 100).toFixed(1)}</span></div></article>`,
            )
            .join('') || '<div class="empty">No cases here.</div>'
        }${list.length > 30 ? '<p class="limitnote">Showing the first 30. Search the ledger for more.</p>' : ''}</section>`;
      })
      .join('')}</div>`
  );
}
function renderBehavior() {
  return (
    pagehead(
      'A rhythm, not a password.',
      'Capture typing intervals and compare them with a session baseline.',
    ) +
    `<div class="grid equal"><section class="card"><div class="cardhead"><h2>Typing rhythm enrolment</h2><span class="tag">Session only</span></div><p class="limitnote">Type the phrase manually, then capture the sample. Three samples establish a reference. The phrase itself is fixed demo text, not a password.</p><div class="steps">${[0, 1, 2].map((i) => `<span class="${typing.samples.length > i ? 'done' : ''}"></span>`).join('')}</div><div class="typephrase">${PHRASE}</div><input id="typingInput" class="typinginput" placeholder="Type the phrase here" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="Type secure payment"><div class="typedots" id="typedots"></div><p class="limitnote" id="typingHint">${typing.samples.length}/3 enrolment samples. ${typing.mean ? 'Baseline ready. Type again and compare.' : 'A baseline needs three samples.'}</p><div class="actions"><button class="btn primary" id="captureTyping">${typing.mean ? 'Compare sample' : 'Capture sample'}</button><button class="btn" data-action="resettyping">Reset enrolment</button></div></section><section class="card"><div class="cardhead"><h2>Behavior signals</h2><span class="tag">Experimental</span></div><div id="behaviorStats">${behaviorStats()}</div><div class="notice">Timing differences can come from stress, device changes, accessibility needs or network/browser scheduling. This does not authenticate identity. It never automatically blocks a transaction.</div><p class="limitnote">No raw text or keystroke events are uploaded. Timing samples exist only in this tab and are discarded on reload. If you explicitly select “Use captured behavior” in Payment lab, the derived numeric deviation is stored with that demo transaction.</p><button class="btn full spacer" data-go="checkout">Continue to payment check →</button></section></div>${swipeMarkup()}<div class="howsteps">${[
      ['01', 'Enrol', 'Capture three manually typed samples of the same phrase.'],
      ['02', 'Compare', 'Compare a later sample’s mean interval with the enrolment baseline.'],
      [
        '03',
        'Investigate',
        'Use the derived deviation as one optional model input, never as proof of identity.',
      ],
    ]
      .map(
        ([n, b, p]) =>
          `<div class="howstep"><div class="stepnumber">${n}</div><b>${b}</b><p>${p}</p></div>`,
      )
      .join('')}</div>`
  );
}
function behaviorStats() {
  return `<div class="stats" style="grid-template-columns:1fr 1fr">${stat('Baseline interval', typing.mean ? typing.mean.toFixed(0) + ' ms' : '—', typing.mean ? 'Mean of three samples' : 'Not enrolled', '⌁')}${stat('Deviation', typing.deviation === null ? '—' : typing.deviation.toFixed(2), 'Normalised demo units', '↔')}</div><p class="limitnote">Deviation = absolute difference from baseline ÷ max(30 ms, 25% of baseline), capped at 6. This heuristic maps timing to the synthetic model’s feature range.</p>`;
}
let metricThreshold = 0.65,
  benchmarkHTML = '';
function renderModel() {
  let m = model.metadata,
    metric = m.metrics.find((m) => m.threshold === metricThreshold) || m.metrics[3];
  return (
    pagehead(
      'Open the black box.',
      'Reproducible training, honest evaluation, and visible performance limits.',
      `<button class="btn" data-action="benchmark">Run local benchmark</button><button class="btn primary" data-action="modelreport">${icon('download')} Model report</button>`,
    ) +
    `<div class="alertbanner"><b>Synthetic evaluation only.</b> This model learned intentionally generated patterns. Strong results here do not establish accuracy, fairness, calibration or safety on real payment data.</div><div class="stats">${stat('Training transactions', m.training_rows.toLocaleString(), 'Separate from held out test data', '◇')}${stat('Test transactions', m.test_rows.toLocaleString(), m.test_fraud + ' synthetic positive labels', '◎')}${stat('Test fraud prevalence', pct(m.prevalence), 'Highly imbalanced generated sample', '◒')}${stat('Average precision', pct(m.average_precision), 'Ranking metric on synthetic test set', '↗')}</div><div class="grid equal"><section class="card"><div class="cardhead"><div><h2>Precision & recall tradeoff</h2><p class="subtitle">Evaluation threshold is independent of live policy settings</p></div><select id="metricThreshold" aria-label="Evaluation threshold">${m.metrics.map((x) => `<option value="${x.threshold}" ${metricThreshold === x.threshold ? 'selected' : ''}>${x.threshold * 100}/100</option>`).join('')}</select></div><div class="stats" style="grid-template-columns:1fr 1fr">${stat('Precision', pct(metric.precision), 'Of predicted positives, how many were labelled positive?', '✓')}${stat('Recall', pct(metric.recall), 'Of labelled positives, how many were detected?', '↗')}</div><div class="confusion"><div>True positives<b>${metric.tp}</b></div><div class="bad">False positives<b>${metric.fp}</b></div><div class="bad">False negatives<b>${metric.fn}</b></div><div>True negatives<b>${metric.tn}</b></div></div><p class="limitnote">Positive = synthetic fraud label. F1 score: ${pct(metric.f1)}. The training and test split comes from the same synthetic generator, so it does not test real world generalisation.</p></section><section class="card"><div class="cardhead"><h2>What the model learned</h2><span class="tag">32 decision trees</span></div><div class="featurelist">${m.feature_importance
      .map((v, i) => ({ v, n: E.names[i] }))
      .sort((a, b) => b.v - a.v)
      .map(
        (o) =>
          `<div class="reasonbar"><div class="row"><span>${o.n}</span><b>${pct(o.v)}</b></div><div class="mini-track"><span style="width:${o.v * 100}%"></span></div></div>`,
      )
      .join(
        '',
      )}</div><p class="limitnote">Global impurity based importance from training. It is not causal. Calibration uses ${m.calibration_rows || 0} separate synthetic rows. Brier score: ${m.brier_raw?.toFixed(4) || '—'} before and ${m.brier_calibrated?.toFixed(4) || '—'} after calibration on the held out synthetic test set.</p></section></div><div class="grid equal"><section class="card"><h2>Browser performance</h2><div id="benchmark" class="${benchmarkHTML ? '' : 'empty'}">${benchmarkHTML || 'Run a local benchmark to measure 500 inference calls.<br>No network or bank latency is included.'}</div></section><section class="card"><h2>Architecture & scope</h2><div class="howsteps spacer" style="grid-template-columns:1fr"><div class="howstep"><b>Input → features → random forest → policy</b><p>Local feature preparation and model scoring. Decisions create a review case. The network view separately analyses recorded account relationships.</p></div><div class="howstep"><b>What is still needed for deployment</b><p>Authorised bank integration, representative labelled data, model validation, protected server storage, real behavioral verification, access roles, monitoring, adversarial evaluation and load tests.</p></div></div><p class="limitnote">The app neither claims sub 500 ms production latency nor prevents real transfers. It is a complete presentation sandbox, not a banking deployment.</p></section></div>`
  );
}
function renderSettings() {
  return (
    pagehead(
      'Make the workspace yours.',
      'Tune future decisions, manage local data, and adjust motion.',
    ) +
    `<div class="grid equal"><section class="card"><h2>Decision policy</h2><p class="limitnote">These thresholds apply to future assessments. Existing decisions retain their original policy.</p><form id="policyForm"><label class="field spacer" for="verifyThreshold">Request verification from <span class="rangevalue" id="verifyValue">${settings.verify * 100}</span><input id="verifyThreshold" type="range" min="5" max="80" step="1" value="${settings.verify * 100}"></label><label class="field spacer" for="flagThreshold">Flag for review from <span class="rangevalue" id="flagValue">${settings.flag * 100}</span><input id="flagThreshold" type="range" min="10" max="95" step="1" value="${settings.flag * 100}"></label><button class="btn primary spacer" type="submit">Save policy</button></form><div class="settingsrow"><div><b>Remember this workspace</b><p>Store demo records and notes in this browser.</p></div><label class="switch"><input type="checkbox" id="persistToggle" aria-label="Remember workspace" ${settings.persist ? 'checked' : ''}><span></span></label></div><div class="settingsrow"><div><b>Reduce animations</b><p>Pause decorative motion and transitions.</p></div><label class="switch"><input type="checkbox" id="motionToggle" aria-label="Reduce animations" ${settings.reduced ? 'checked' : ''}><span></span></label></div></section><section class="card"><h2>Data tools</h2><p class="limitnote">Use synthetic or anonymised sample records. Imported data is processed locally. Browser storage does not provide banking grade protection.</p><div class="actions spacer"><button class="btn" data-action="import">Import transactions</button><button class="btn" data-action="sample">Sample CSV</button><button class="btn" data-action="backup">Export workspace JSON</button><button class="btn" data-action="auditexport">Export audit log</button><a class="btn" style="text-decoration:none" href="./upi-shield-offline.html" download>Download offline app</a></div><div class="uploadzone"><b>Restore an exported workspace</b><p>Restores demo transactions, review notes and policy. The current workspace will be replaced after validation.</p><input id="restoreFile" type="file" accept=".json,application/json" aria-label="Restore workspace JSON"></div><button class="btn danger" data-action="reset">Reset demo workspace</button><p class="limitnote">Audit events here are editable browser records, not a tamper resistant ledger. Blockchain has not been added.</p></section></div>`
  );
}
const renderers = {
  alerts: () => window.renderCommandCenter('alerts'),
  simulator: () => window.renderCommandCenter('simulator'),
  wallet: () =>
    pagehead(
      'ShieldPay. Payments with protection built in.',
      'Open the customer payment experience, then inspect its decisions in the investigator workspace.',
    ) +
    '<section class="card"><h2>Customer payment application</h2><p class="limitnote">Connect a sample bank, send money, review requests and track payment outcomes. Sandbox funds only.</p><a class="btn primary spacer" href="./pay.html">Open ShieldPay →</a></section>',
  protection: () => window.renderAutoProtection(),
  intelligence: () => window.renderIntelligenceCentre(),
  guide: renderGuide,
  checkout: renderCheckout,
  performance: () => window.renderCommandCenter('performance'),
  banks: renderBanks,
  overview: () => window.renderCommandCenter('overview'),
  lab: renderLab,
  transactions: () => window.renderCommandCenter('transactions'),
  network: () => window.renderCommandCenter('network'),
  cases: () => window.renderCommandCenter('cases'),
  behavior: renderBehavior,
  model: () => window.renderSharedModelAnalytics(),
  settings: () =>
    typeof window.renderCommandCenter === 'function'
      ? window.renderCommandCenter('settings')
      : renderSettings(),
};
let lastAnimatedView = null;
function render() {
  if (typeof window.renderCommandCenter === 'function') {
    if (['wallet', 'checkout', 'lab', 'banks'].includes(view)) {
      location.replace('./pay' + (view === 'banks' ? '#banks' : ''));
      return;
    }
    if (view === 'guide') {
      view = 'overview';
      location.hash = 'overview';
    }
  }
  clearTimeout(searchTimer);
  document.title = views[view] + ' | UPI Shield';
  updateNav();
  $('crumb').textContent = views[view];
  const searchbox = document.querySelector('.searchbox');
  if (searchbox) searchbox.hidden = !['overview', 'transactions', 'alerts', 'cases'].includes(view);
  const routeChanged = lastAnimatedView !== view;
  lastAnimatedView = view;
  $('content').innerHTML =
    `<div class="pageenter ${routeChanged ? 'route-enter' : ''}">${renderers[view]()}</div>`;
  if (
    ![
      'overview',
      'transactions',
      'alerts',
      'network',
      'cases',
      'simulator',
      'performance',
      ...(typeof window.renderCommandCenter === 'function' ? ['settings'] : []),
    ].includes(view)
  )
    bindView();
  if (document.body.classList.contains('presentation')) ensureExit();
}
function go(id) {
  if (!views[id]) id = 'overview';
  if (location.hash.slice(1) !== id) location.hash = id;
  else {
    view = id;
    render();
  }
}
function refreshOverview() {
  if (view === 'overview') {
    for (const [id, html] of [
      ['stats', stats()],
      ['trend', trend()],
      ['distribution', distribution()],
      ['recent', table(transactions.slice(0, 5))],
    ])
      if ($(id)) $(id).innerHTML = html;
    document.querySelectorAll('#stats strong').forEach((el) => el.classList.add('flash'));
    updateNav();
  }
}
function streamTick() {
  document.body.classList.remove('payment-arrived');
  requestAnimationFrame(() => document.body.classList.add('payment-arrived'));
  streamCount++;
  process(synthetic(streamCount % 9 === 0 ? 'high' : streamCount % 5 === 0 ? 'medium' : 'normal'));
  refreshOverview();
  if (paymentBusy) return;
  if (
    view === 'transactions' &&
    !document.activeElement?.closest?.('#content') &&
    !$('dialog').open
  )
    render();
  if (view === 'network' && !document.activeElement?.closest?.('#content')) {
    $('graphcanvas').innerHTML = graphSVG();
    $('nodeInfo').innerHTML = nodeInfo();
  }
  if (view === 'cases' && !$('dialog').open && !document.activeElement?.closest?.('#content'))
    render();
}
function toggleStream() {
  if (timer) {
    clearInterval(timer);
    timer = null;
    notify('Synthetic stream paused.');
  } else {
    timer = setInterval(streamTick, 1800);
    notify('Live demo started: one synthetic transaction every 1.8 seconds.');
  }
  render();
}
function ringScenario() {
  let base = Date.now() - 60000;
  for (let i = 0; i < 5; i++) {
    let t = synthetic('ring');
    t.sender = 'demo-0' + (i + 1);
    t.timestamp = new Date(base + i * 7000).toISOString();
    process(t);
  }
  let out = synthetic('high');
  out.sender = 'hub-01';
  out.receiver = 'exit-01';
  process(out);
  selected = 'hub-01';
  notify('Five incoming payments and an onward transfer added.');
  if (view === 'network') render();
  else go('network');
}
function ensureExit() {
  if (!$('exitPresent')) {
    let b = document.createElement('button');
    b.id = 'exitPresent';
    b.className = 'btn exitpresent';
    b.textContent = 'Exit presentation';
    b.onclick = () => {
      document.body.classList.remove('presentation');
      b.remove();
    };
    document.body.append(b);
  }
}
function download(name, content, type = 'text/csv') {
  let url = URL.createObjectURL(new Blob([content], { type })),
    a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  notify('Download prepared: ' + name);
}
function exportTx() {
  let items = filtered();
  download(
    'upi-shield-transactions.csv',
    E.csv([
      [
        'id',
        'timestamp',
        'sender',
        'receiver',
        'amount',
        'risk_index',
        'decision',
        'scoring_ms',
        'source',
      ],
      ...items.map((t) => [
        t.id,
        t.timestamp,
        t.sender,
        t.receiver,
        t.amount,
        (t.risk * 100).toFixed(3),
        t.decision,
        t.scoreMs,
        t.source,
      ]),
    ]),
  );
}
const csvHeaders = [
  'sender',
  'receiver',
  'amount',
  'average',
  'velocity',
  'age',
  'new_recipient',
  'new_device',
  'night',
  'fanin',
  'rapid',
  'behavior',
];
function sampleCSV() {
  return E.csv([
    csvHeaders,
    ['demo-01', 'demo-22', 650, 2000, 1, 420, 0, 0, 0, 0, 0, 0.3],
    ['demo-04', 'hub-01', 40000, 1000, 8, 3, 1, 1, 1, 5, 1, 2.8],
  ]);
}
function modal(html) {
  $('dialogContent').innerHTML =
    `<div class="dialoginner"><button class="dialogclose" data-action="closedialog" aria-label="Close dialog">×</button>${html}</div>`;
  if (!$('dialog').open) $('dialog').showModal();
}
function detail(id) {
  let t = transactions.find((t) => t.id === id);
  if (!t) return notify('This record is no longer retained.');
  let c = cases[id];
  modal(
    `<div class="eyebrow">Transaction investigation</div><h2>${esc(t.id)} · ${money(t.amount)}</h2><p>${esc(accountName(t.sender))} → ${esc(accountName(t.receiver))}<br>${esc(new Date(t.timestamp).toLocaleString('en-IN'))} · ${esc(t.source)}</p>${t.source==='ShieldPay'?`<div class="detailrow"><span>Payment status</span><b>${esc(t.status)} · ${t.settled?'Simulated settlement complete':'Not settled'}</b></div><a class="btn" href="./pay#history">Open ShieldPay history ↗</a>`:''}${t.customerReport?`<div class="notice"><b>Customer safety response: ${esc(t.customerReport.answer)}</b><p>Reason: ${esc(({unsure:'Something feels wrong',unauthorised:'Payment not authorised by customer',impersonation:'Impersonation concern',pressure:'Pressure or refund promise',goods:'Goods or service not received'})[t.customerReport.reason]||t.customerReport.reason)}<br>Reported ${esc(new Date(t.customerReport.updatedAt).toLocaleString('en-IN'))}. Customer feedback is not a confirmed fraud finding.</p></div>`:''}${badge(t.decision)}<span class="tag" style="margin-left:10px">Model index ${(t.risk * 100).toFixed(1)}</span><div class="detailrow"><span>Amount / usual amount</span><b>${(t.amount / t.average).toFixed(1)}×</b></div><div class="detailrow"><span>Transfers in 10 minutes</span><b>${t.velocity}</b></div><div class="detailrow"><span>Receiver age</span><b>${t.age} days</b></div><div class="detailrow"><span>New recipient / device</span><b>${t.newRecipient ? 'Yes' : 'No'} / ${t.newDevice ? 'Yes' : 'No'}</b></div><div class="detailrow"><span>Incoming / rapid onward</span><b>${t.fanin} / ${t.rapid ? 'Yes' : 'No'}</b></div><div class="detailrow"><span>Applied verify / flag thresholds</span><b>${t.thresholds.verify * 100} / ${t.thresholds.flag * 100}</b></div><p class="limitnote">Top reference comparisons: ${
      t.contributions
        .slice(0, 3)
        .map((c) => esc(c.name) + ' (+' + (c.value * 100).toFixed(1) + ' points)')
        .join(', ') || 'None above display threshold'
    }.</p>${c ? `<div class="formgrid spacer"><label class="field" for="caseStatus">Case status<select id="caseStatus"><option ${c.status === 'Open' ? 'selected' : ''}>Open</option><option ${c.status === 'Investigating' ? 'selected' : ''}>Investigating</option><option ${c.status === 'Resolved' ? 'selected' : ''}>Resolved</option></select></label><label class="field" for="caseOutcome">Review outcome<select id="caseOutcome"><option value="">Not decided</option>${['Needs more evidence', 'Likely legitimate', 'Suspected fraud'].map((o) => `<option ${c.outcome === o ? 'selected' : ''}>${o}</option>`).join('')}</select></label></div><label class="field spacer" for="caseNote">Investigator note<textarea id="caseNote" rows="2" maxlength="1000" placeholder="Record evidence or next steps"></textarea></label><div class="dialogactions"><button class="btn primary" data-savecase="${id}">Save case review</button><button class="btn" data-account="${esc(t.receiver)}">Related transactions</button>${t.paymentId ? `<button class="btn primary" data-open-guided="${esc(t.paymentId)}">Open pending payment</button>` : ''}</div>${c.notes.map((n) => `<div class="audit">${esc(n.text)}<small>${esc(new Date(n.time).toLocaleString('en-IN'))}</small></div>`).join('')}` : `<div class="dialogactions"><button class="btn" data-createcase="${id}">Open a manual review case</button></div>`}<details class="spacer"><summary>Audit history</summary>${
      audit
        .filter((a) => a.ref === id)
        .map((a) => `<div class="audit">${esc(a.action)}<small>${esc(a.time)}</small></div>`)
        .join('') || '<p class="limitnote">No audit event retained for this seeded sample.</p>'
    }</details>`,
  );
}
function saveCase(id) {
  let c = cases[id],
    status = $('caseStatus').value,
    outcome = $('caseOutcome').value,
    note = $('caseNote').value.trim();
  if (status === 'Resolved' && !outcome) return notify('Choose a review outcome before resolving.');
  if (note && c.notes.length >= 500)
    return notify('This case has reached the 500 note limit. Export its report.');
  if (note) c.notes.push({ text: note, time: new Date().toISOString() });
  c.status = status;
  c.outcome = outcome;
  logAudit(id, 'Case ' + status + (outcome ? ': ' + outcome : '') + (note ? ' · note added' : ''));
  save();
  updateNav();
  detail(id);
  if (view === 'cases') render();
  notify('Case review saved.');
}
function importDialog() {
  modal(
    `<div class="eyebrow">Local data import</div><h2>Import transactions</h2><p>Upload up to 500 synthetic or anonymised records. All rows are validated before anything is imported. No file is uploaded to a bank or server.</p><div class="code">${csvHeaders.join(',')}</div><div class="uploadzone"><input type="file" id="csvFile" accept=".csv,text/csv" aria-label="Import transaction CSV"><p>Maximum 1 MB · UTF 8 CSV · All columns required</p></div><button class="btn" data-action="sample">Download a sample CSV</button><p id="importStatus" class="limitnote">Boolean fields accept 0 or 1. Account labels must be demo identifiers, using letters, numbers, underscores or dots.</p>`,
  );
  $('csvFile').onchange = async (e) => {
    let f = e.target.files[0];
    if (!f) return;
    if (f.size > 1000000) return ($('importStatus').textContent = 'File exceeds 1 MB.');
    try {
      let rows = E.parseCSV(await f.text());
      if (rows.length < 2 || rows.length > 501) throw Error('Provide 1 to 500 data rows.');
      let headers = rows.shift().map((s) => s.trim().toLowerCase());
      if (new Set(headers).size !== headers.length || csvHeaders.some((h) => !headers.includes(h)))
        throw Error('Missing or duplicate columns. Download the sample for the required format.');
      let prepared = rows.map((row, i) => {
        if (row.length !== headers.length)
          throw Error('Row ' + (i + 2) + ': column count mismatch.');
        let obj = Object.fromEntries(headers.map((h, j) => [h, row[j].trim()]));
        for (let id of ['sender', 'receiver'])
          if (!/^[a-zA-Z0-9_.-]{1,32}$/.test(obj[id]))
            throw Error('Row ' + (i + 2) + ': invalid demo account identifier.');
        if (obj.sender === obj.receiver)
          throw Error('Row ' + (i + 2) + ': sender and receiver must differ.');
        let bounds = {
          amount: [1, 1e7],
          average: [1, 1e7],
          velocity: [1, 1000],
          age: [0, 20000],
          fanin: [0, 1000],
          behavior: [0, 6],
        };
        for (let [k, [min, max]] of Object.entries(bounds)) {
          if (obj[k] === '' || !Number.isFinite(+obj[k]) || +obj[k] < min || +obj[k] > max)
            throw Error('Row ' + (i + 2) + ': invalid ' + k);
          obj[k] = +obj[k];
          if (['velocity', 'age', 'fanin'].includes(k) && !Number.isInteger(obj[k]))
            throw Error('Row ' + (i + 2) + ': ' + k + ' must be a whole number.');
        }
        for (let k of ['new_recipient', 'new_device', 'night', 'rapid'])
          if (!['0', '1'].includes(obj[k]))
            throw Error('Row ' + (i + 2) + ': ' + k + ' must be 0 or 1.');
        return {
          sender: obj.sender,
          receiver: obj.receiver,
          amount: obj.amount,
          average: obj.average,
          velocity: obj.velocity,
          age: obj.age,
          fanin: obj.fanin,
          behavior: obj.behavior,
          newRecipient: obj.new_recipient === '1',
          newDevice: obj.new_device === '1',
          night: obj.night === '1',
          rapid: obj.rapid === '1',
          source: 'CSV import',
          timestamp: new Date().toISOString(),
        };
      });
      prepared.forEach((t) => process(t, true, false));
      save();
      updateNav();
      $('dialog').close();
      filter = '';
      query = '';
      page = 0;
      go('transactions');
      notify(prepared.length + ' transactions imported and assessed.');
    } catch (err) {
      if ($('importStatus')) $('importStatus').textContent = err.message;
      else notify(err.message);
    }
  };
}
function captureTyping() {
  let value = $('typingInput').value;
  if (value !== PHRASE || !typing.valid || typing.times.length !== PHRASE.length) {
    $('typingHint').textContent =
      'Type the complete phrase manually without corrections or paste. Clear the field to start again.';
    return;
  }
  let gaps = typing.times.slice(1).map((t, i) => t - typing.times[i]),
    mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  if (mean < 15 || mean > 3000) {
    $('typingHint').textContent = 'Timing sample is outside the demo range. Please try again.';
    return;
  }
  if (typing.samples.length < 3) {
    typing.samples.push(mean);
    if (typing.samples.length === 3) typing.mean = typing.samples.reduce((a, b) => a + b, 0) / 3;
    notify(
      typing.mean
        ? 'Baseline enrolled. Type once more to compare.'
        : 'Sample ' + typing.samples.length + ' captured.',
    );
    render();
  } else {
    typing.deviation = Math.min(6, Math.abs(mean - typing.mean) / Math.max(30, typing.mean * 0.25));
    $('behaviorStats').innerHTML = behaviorStats();
    $('typingHint').textContent =
      'Latest interval ' +
      mean.toFixed(0) +
      ' ms. Deviation ' +
      typing.deviation.toFixed(2) +
      '. Available in Payment lab.';
    $('typingInput').value = '';
    typing.times = [];
    typing.valid = true;
    notify('Comparison captured. This is not an identity decision.');
  }
}
function benchmark() {
  let x = transactions.slice(0, 50).map(E.features);
  if (!x.length) x = [E.features(synthetic('normal'))];
  let values = [],
    sum = 0;
  for (let i = 0; i < 50; i++) E.predict(model, x[i % x.length]);
  for (let i = 0; i < 500; i++) {
    let s = performance.now();
    sum += E.predict(model, x[i % x.length]);
    values.push(performance.now() - s);
  }
  values.sort((a, b) => a - b);
  let avg = values.reduce((a, b) => a + b, 0) / values.length,
    median = values[250],
    p95 = values[475];
  $('benchmark').className = '';
  $('benchmark').innerHTML =
    benchmarkHTML = `<div class="metriclarge">${p95 < 0.01 ? '&lt;0.01' : p95.toFixed(3)} ms</div><b>P95 local model inference</b><div class="detailrow"><span>Median</span><b>${median < 0.01 ? '&lt;0.01' : median.toFixed(3)} ms</b></div><div class="detailrow"><span>Mean</span><b>${avg.toFixed(3)} ms</b></div><div class="detailrow"><span>Samples / warm up</span><b>500 / 50 calls</b></div><p class="limitnote">This is a single browser, sequential inference benchmark. Timer precision may round very fast calls to zero. It excludes concurrent load, network, feature retrieval and payment infrastructure.</p>`;
  logAudit('BENCHMARK', '500 local inference calls. P95 ' + p95.toFixed(3) + ' ms');
  save();
}
function report() {
  return {
    application: 'UPI Shield',
    model: model.version,
    algorithm: 'Random forest, 32 trees, max depth 7',
    evaluation: model.metadata,
    scope: 'Synthetic training, calibration and test splits only. No real UPI validation.',
    features: model.features,
    policy: settings,
    exported_at: new Date().toISOString(),
  };
}
function confirmReset() {
  modal(
    `<div class="eyebrow">Reset workspace</div><h2>Start a fresh demo?</h2><p>This replaces transactions, case notes and the audit log stored in this browser with a fresh sample dataset. Export a backup first if you want to keep your work.</p><div class="dialogactions"><button class="btn" data-action="backup">Export backup</button><button class="btn danger" data-action="confirmreset">Reset demo data</button></div>`,
  );
}
function validateBackup(s) {
  validateJourney(s);
  validateConnections(s?.connections);
  if (
    !s ||
    s.format !== 'UPIShield-2' ||
    !Array.isArray(s.transactions) ||
    s.transactions.length > MAX ||
    !Array.isArray(s.audit) ||
    s.audit.length > 2500 ||
    typeof s.cases !== 'object' ||
    s.cases === null ||
    Array.isArray(s.cases)
  )
    throw Error('Invalid workspace format or size.');
  let ids = new Set();
  for (let t of s.transactions) {
    E.validateTransaction(t);
    if (typeof t.id !== 'string' || !/^(?:TX-\d{6,12}|PAY-[a-zA-Z0-9-]{5,80})$/.test(t.id) || ids.has(t.id))
      throw Error('Invalid or duplicate transaction ID.');
    ids.add(t.id);
    for (let k of ['sender', 'receiver'])
      if (typeof t[k] !== 'string' || !/^[a-zA-Z0-9_.-]{1,32}$/.test(t[k]))
        throw Error('Invalid account label.');
    for (let [k, min, max] of [
      ['amount', 1, 1e7],
      ['average', 1, 1e7],
      ['velocity', 1, 1000],
      ['age', 0, 20000],
      ['fanin', 0, 1000],
      ['behavior', 0, 6],
      ['risk', 0, 1],
      ['scoreMs', 0, 1e9],
      ['assessmentMs', 0, 1e9],
    ])
      if (!Number.isFinite(t[k]) || t[k] < min || t[k] > max)
        throw Error('Invalid transaction ' + k);
    for (let k of ['newRecipient', 'newDevice', 'night', 'rapid'])
      if (typeof t[k] !== 'boolean') throw Error('Invalid boolean signal.');
    if (
      !['Allow', 'Verify', 'Flag'].includes(t.decision) ||
      typeof t.timestamp !== 'string' ||
      !Number.isFinite(Date.parse(t.timestamp)) ||
      typeof t.source !== 'string' ||
      t.source.length > 100 ||
      typeof t.model !== 'string' ||
      t.model.length > 50
    )
      throw Error('Invalid transaction metadata.');
    if (
      !t.thresholds ||
      typeof t.thresholds.verify !== 'number' ||
      typeof t.thresholds.flag !== 'number' ||
      !(t.thresholds.verify > 0 && t.thresholds.verify < t.thresholds.flag && t.thresholds.flag < 1)
    )
      throw Error('Invalid policy.');
    if (
      !Array.isArray(t.contributions) ||
      t.contributions.length > 9 ||
      t.contributions.some(
        (c) => typeof c.name !== 'string' || c.name.length > 100 || !Number.isFinite(c.value),
      )
    )
      throw Error('Invalid explanations.');
  }
  for (let [id, c] of Object.entries(s.cases)) {
    if (
      !c ||
      typeof c !== 'object' ||
      !ids.has(id) ||
      !['Open', 'Investigating', 'Resolved'].includes(c.status) ||
      !Array.isArray(c.notes) ||
      c.notes.length > 500 ||
      c.notes.some(
        (n) =>
          typeof n.text !== 'string' ||
          n.text.length > 1000 ||
          !Number.isFinite(Date.parse(n.time)),
      ) ||
      ![null, '', 'Needs more evidence', 'Likely legitimate', 'Suspected fraud'].includes(
        c.outcome,
      ) ||
      (c.status === 'Resolved' && !c.outcome)
    )
      throw Error('Invalid case data.');
  }
  if (
    s.audit.some(
      (a) =>
        typeof a.ref !== 'string' ||
        a.ref.length > 100 ||
        typeof a.action !== 'string' ||
        a.action.length > 2000 ||
        !Number.isFinite(Date.parse(a.time)),
    )
  )
    throw Error('Invalid audit data.');
  if (
    !s.settings ||
    typeof s.settings.verify !== 'number' ||
    typeof s.settings.flag !== 'number' ||
    typeof s.settings.persist !== 'boolean' ||
    typeof s.settings.reduced !== 'boolean' ||
    !(s.settings.verify >= 0.05 && s.settings.verify < s.settings.flag && s.settings.flag <= 0.95)
  )
    throw Error('Invalid policy settings.');
  return s;
}
async function restoreFile(file) {
  if (!file) return;
  if (file.size > 6e6) return notify('Backup exceeds 6 MB.');
  try {
    let s = validateBackup(JSON.parse(await file.text()));
    modal(
      `<div class="eyebrow">Restore preview</div><h2>Restore ${s.transactions.length} transactions?</h2><p>This will replace your current browser workspace, including case reviews. It will not affect other browsers.</p><div class="dialogactions"><button class="btn" data-action="backup">Export current backup</button><button class="btn primary" id="confirmRestore">Restore validated workspace</button></div>`,
    );
    $('confirmRestore').onclick = () => {
      if (paymentBusy || loadRunning)
        return notify('Wait for the current assessment or test before replacing the workspace.');
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
      simulationResult = null;
      storageBlocked = false;
      $('storageWarning').hidden = true;
      stopBankAuto();
      journey = s.journey || { behaviorSkipped: false, useOffline: false };
      demoPayments = s.demoPayments || [];
      demoPayments.forEach((p) => {
        if (p.status === 'Checking') p.status = 'Assessment failed';
      });
      connections = validateConnections(s.connections);
      transactions = s.transactions;
      cases = s.cases;
      audit = s.audit;
      settings = {
        verify: s.settings.verify,
        flag: s.settings.flag,
        persist: true,
        reduced: !!s.settings.reduced,
      };
      next = Math.max(1000, ...transactions.filter(t=>/^TX-\d+$/.test(t.id)).map((t) => +t.id.slice(3)));
      document.body.classList.toggle('reduced', settings.reduced);
      logAudit('WORKSPACE', 'Backup restored');
      save();
      $('dialog').close();
      render();
      notify('Workspace restored.');
    };
  } catch (err) {
    notify('Restore failed: ' + err.message);
  }
}
function tour() {
  const steps = [
    [
      'guide',
      'Start with your guided journey',
      'Follow the checklist: connect a demo bank, load its profile, set up interactions, check a pending payment and complete its outcome.',
    ],
    [
      'checkout',
      'Check before settlement',
      'Create a pending payment. The backend calculates signals and returns a decision. Settlement is a separate, explicit simulated action.',
    ],
    [
      'network',
      'Follow the connections',
      'Select HUB 1 to inspect its incoming senders and rapid onward transfer. Saffron links identify payments flagged by the model policy.',
    ],
    [
      'cases',
      'Review a case',
      'Open a card, add an evidence note, and choose a case status and outcome. The audit history records your review.',
    ],
    [
      'model',
      'Explain the limitations',
      'Show the held out synthetic evaluation and local benchmark. Clearly distinguish a working sandbox from validated banking infrastructure.',
    ],
  ];
  let [v, title, text] = steps[tourIndex];
  go(v);
  modal(
    `<div class="eyebrow">Demo tour / ${tourIndex + 1} of ${steps.length}</div><div class="tourprogress">${steps.map((_, i) => `<i class="${i <= tourIndex ? 'active' : ''}"></i>`).join('')}</div><h2>${title}</h2><p>${text}</p><div class="dialogactions">${tourIndex ? '<button class="btn" data-action="tourprev">← Back</button>' : ''}<button class="btn primary" data-action="tournext">${tourIndex === steps.length - 1 ? 'Finish tour' : 'Next →'}</button><button class="btn" data-action="closedialog">Explore this screen</button></div>`,
  );
}
function about() {
  modal(
    `<div class="eyebrow">UPI Shield / Platform information</div><h2>A working fraud intelligence sandbox.</h2><p>Assess sample payments with a trained random forest, investigate account connections, review cases and explore model metrics. Online assessments use the assessment API; offline mode runs locally.</p><div class="detailrow"><span>Payments</span><b>Simulated only</b></div><div class="detailrow"><span>Training and evaluation</span><b>Synthetic data</b></div><div class="detailrow"><span>Storage</span><b>This browser</b></div><div class="detailrow"><span>Blockchain</span><b>Not included</b></div><p>There is no live UPI connection, bank authorization, money movement or production fraud protection. A low score is not proof of safety and a high score is not proof of wrongdoing.</p><button class="btn primary" data-action="starttour">Take the guided tour</button>`,
  );
}
const actions = {
  stream: toggleStream,
  present: () => {
    document.body.classList.add('presentation');
    ensureExit();
    notify('Presentation mode on. Use the floating button to exit.');
  },
  export: exportTx,
  import: importDialog,
  sample: () => download('upi-shield-sample.csv', sampleCSV()),
  clearfilters: () => {
    filter = '';
    query = '';
    page = 0;
    render();
  },
  prev: () => {
    page--;
    render();
  },
  next: () => {
    page++;
    render();
  },
  ring: ringScenario,
  zoomin: () => {
    zoom = Math.min(2, zoom + 0.2);
    $('graphcanvas').innerHTML = graphSVG();
  },
  zoomout: () => {
    zoom = Math.max(0.6, zoom - 0.2);
    $('graphcanvas').innerHTML = graphSVG();
  },
  zoomreset: () => {
    zoom = 1;
    $('graphcanvas').innerHTML = graphSVG();
  },
  graphfilter: () => {
    graphFilter = graphFilter === 'all' ? 'risky' : 'all';
    render();
  },
  closedialog: () => $('dialog').close(),
  benchmark,
  modelreport: () =>
    download('upi-shield-model-report.json', JSON.stringify(report(), null, 2), 'application/json'),
  backup: () =>
    download(
      'upi-shield-workspace.json',
      JSON.stringify(
        {
          format: 'UPIShield-2',
          transactions,
          cases,
          audit,
          settings,
          connections,
          journey,
          demoPayments,
        },
        null,
        2,
      ),
      'application/json',
    ),
  auditexport: () =>
    download(
      'upi-shield-audit.csv',
      E.csv([['time', 'reference', 'action'], ...audit.map((a) => [a.time, a.ref, a.action])]),
    ),
  caseexport: () =>
    download(
      'upi-shield-cases.csv',
      E.csv([
        ['transaction', 'amount', 'risk', 'status', 'outcome', 'notes'],
        ...transactions
          .filter((t) => cases[t.id])
          .map((t) => [
            t.id,
            t.amount,
            t.risk,
            cases[t.id].status,
            cases[t.id].outcome,
            cases[t.id].notes.map((n) => n.text).join(' | '),
          ]),
      ]),
    ),
  reset: confirmReset,
  confirmreset: () => {
    if (paymentBusy || loadRunning)
      return notify('Wait for the current assessment or request test to finish.');
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
    stopBankAuto();
    journey = { behaviorSkipped: false, useOffline: false };
    demoPayments = [];
    connections = {};
    transactions = [];
    cases = {};
    audit = [];
    next = 1000;
    random = rng(110411);
    seed();
    storageBlocked = false;
    $('storageWarning').hidden = true;
    $('dialog').close();
    simulationResult = null;
    filter = '';
    query = '';
    page = 0;
    render();
    notify('Fresh demo workspace created.');
  },
  resettyping: () => {
    typing = { samples: [], times: [], valid: true, mean: null, deviation: null };
    render();
    notify('Typing baseline cleared.');
  },
  starttour: () => {
    tourIndex = 0;
    tour();
  },
  tournext: () => {
    if (tourIndex === 4) {
      $('dialog').close();
      notify('Ready to demonstrate UPI Shield.');
    } else {
      tourIndex++;
      tour();
    }
  },
  tourprev: () => {
    tourIndex--;
    tour();
  },
};
document.addEventListener('click', (e) => {
  let a = e.target.closest('[data-action]');
  if (a) {
    actions[a.dataset.action]?.();
    return;
  }
  let g = e.target.closest('[data-go]');
  if (g) {
    go(g.dataset.go);
    return;
  }
  let tx = e.target.closest('[data-tx],[data-detail]');
  if (tx) {
    detail(tx.dataset.tx || tx.dataset.detail);
    return;
  }
  let node = e.target.closest('[data-node]');
  if (node) {
    selected = node.dataset.node;
    if (view === 'network' && !document.activeElement?.closest?.('#content')) {
      $('graphcanvas').innerHTML = graphSVG();
      $('nodeInfo').innerHTML = nodeInfo();
    }
    return;
  }
  let sc = e.target.closest('[data-scenario]');
  if (sc) {
    scenario = sc.dataset.scenario;
    labInput = { ...sampleInputs[scenario] };
    simulationResult = process({
      ...labInput,
      sender: 'demo-user',
      receiver: scenario === 'ring' ? 'hub-01' : 'demo-receiver',
      source: 'One click demo',
      timestamp: new Date().toISOString(),
    });
    render();
    notify('Sample checked. No real payment was made.');
    return;
  }
  let c = e.target.closest('[data-savecase]');
  if (c) {
    saveCase(c.dataset.savecase);
    return;
  }
  let newcase = e.target.closest('[data-createcase]');
  if (newcase) {
    let id = newcase.dataset.createcase;
    cases[id] = { status: 'Open', notes: [], outcome: null };
    logAudit(id, 'Manual case opened');
    save();
    updateNav();
    detail(id);
    return;
  }
  let acct = e.target.closest('[data-account]');
  if (acct) {
    query = acct.dataset.account;
    filter = '';
    page = 0;
    $('dialog').close();
    go('transactions');
  }
});
document.addEventListener('keydown', (e) => {
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[data-tx],[data-node]')) {
    e.preventDefault();
    e.target.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  }
  if (e.key === 'Escape' && document.body.classList.contains('menuopen')) {
    setMobileMenu(false, true);
  }
});
function bindView() {
  if (view === 'checkout') bindCheckout();
  if (view === 'banks') bindBankFilters();
  if (view === 'lab') {
    $('labForm').onsubmit = (e) => {
      e.preventDefault();
      if (!$('labForm').reportValidity()) return;
      readLab();
      let t = {
        ...labInput,
        sender: 'demo-user',
        receiver: scenario === 'ring' ? 'hub-01' : 'demo-receiver',
        source: 'Payment lab',
        timestamp: new Date().toISOString(),
      };
      if ($('useBehavior').checked && typing.deviation !== null) {
        t.behavior = typing.deviation;
        t.source = 'Payment lab + captured behavior';
      }
      simulationResult = process(t);
      $('labResult').innerHTML = resultCard(simulationResult);
      $('labState').textContent =
        'Assessment recorded as ' + simulationResult.id + '. Review it in Transactions.';
      notify('Payment assessed. No money moved.');
    };
    $('labForm').oninput = () => {
      $('labState').textContent = 'Inputs changed. Assess again to update and record the result.';
      if ($('labForm').checkValidity()) readLab();
    };
  }
  if (view === 'transactions') {
    $('txSearch').oninput = (e) => {
      query = e.target.value;
      page = 0;
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        if (view !== 'transactions' || !$('txSearch')) return;
        let pos = $('txSearch').selectionStart;
        render();
        $('txSearch').focus();
        $('txSearch').setSelectionRange(pos, pos);
      }, 220);
    };
    $('txFilter').onchange = (e) => {
      filter = e.target.value;
      page = 0;
      render();
    };
  }
  if (view === 'behavior') {
    bindSwipe();
    typing.times = [];
    typing.valid = true;
    let el = $('typingInput');
    el.onbeforeinput = (e) => {
      if (
        e.inputType === 'insertText' &&
        typeof e.data === 'string' &&
        e.data.length === 1 &&
        !e.isComposing
      ) {
        typing.times.push(performance.now());
        let last = typing.times.at(-2),
          gap = last ? typing.times.at(-1) - last : 80;
        let span = document.createElement('span');
        span.style.height = Math.min(70, Math.max(8, gap / 5)) + 'px';
        $('typedots').append(span);
      } else typing.valid = false;
    };
    el.onpaste = () => {
      typing.valid = false;
    };
    el.oninput = () => {
      if (!el.value) {
        typing.times = [];
        typing.valid = true;
        $('typedots').innerHTML = '';
      }
    };
    $('captureTyping').onclick = captureTyping;
  }
  if (view === 'model')
    $('metricThreshold').onchange = (e) => {
      metricThreshold = +e.target.value;
      render();
    };
  if (view === 'settings') {
    $('verifyThreshold').oninput = (e) => ($('verifyValue').textContent = e.target.value);
    $('flagThreshold').oninput = (e) => ($('flagValue').textContent = e.target.value);
    $('policyForm').onsubmit = (e) => {
      e.preventDefault();
      let a = +$('verifyThreshold').value / 100,
        b = +$('flagThreshold').value / 100;
      if (a >= b) return notify('Verification threshold must be below the flag threshold.');
      settings.verify = a;
      settings.flag = b;
      logAudit('POLICY', 'Updated verify ' + a + ' / flag ' + b);
      save();
      notify('Policy saved for future assessments.');
    };
    $('persistToggle').onchange = (e) => {
      settings.persist = e.target.checked;
      save();
      notify(
        settings.persist
          ? 'Browser persistence enabled.'
          : 'Persistence disabled. Current session stays in memory.',
      );
    };
    $('motionToggle').onchange = (e) => {
      settings.reduced = e.target.checked;
      document.body.classList.toggle('reduced', settings.reduced);
      save();
    };
    $('restoreFile').onchange = (e) => restoreFile(e.target.files[0]);
  }
}
function readLab() {
  for (let id of ['amount', 'average', 'velocity', 'age', 'fanin', 'behavior'])
    labInput[id] = +$(id).value;
  for (let id of ['newRecipient', 'newDevice', 'night', 'rapid']) labInput[id] = $(id).checked;
}
window.addEventListener('hashchange', () => {
  if (location.hash === '#main') {
    $('main').focus();
    return;
  }
  view = views[location.hash.slice(1)] ? location.hash.slice(1) : 'overview';
  setMobileMenu(false);
  render();
  window.scrollTo({ top: 0, behavior: 'instant' });
});
$('menuBtn').onclick = () => setMobileMenu(!document.body.classList.contains('menuopen'));
$('tourBtn').onclick = () => {
  if (typeof window.renderCommandCenter === 'function') return;
  tourIndex = 0;
  tour();
};
$('helpBtn').onclick = about;
$('globalSearch').onkeydown = (e) => {
  if (e.key === 'Enter') {
    query = e.target.value;
    filter = '';
    page = 0;
    go('transactions');
    e.target.value = '';
  }
};
const bankCatalog = [
  {
    id: 'sbi',
    name: 'State Bank of India',
    short: 'SBI',
    color: '#1276ac',
    last4: '4821',
    logo: 'bank-logos/sbi.svg',
    logoBg: '#ffffff',
  },
  {
    id: 'hdfc',
    name: 'HDFC Bank',
    short: 'HDFC',
    color: '#164780',
    last4: '7354',
    logo: 'bank-logos/hdfc.svg',
    logoBg: '#ffffff',
  },
  {
    id: 'icici',
    name: 'ICICI Bank',
    short: 'ICICI',
    color: '#ad5a24',
    last4: '2609',
    logo: 'bank-logos/icici.png',
    logoBg: '#8b3422',
  },
  {
    id: 'axis',
    name: 'Axis Bank',
    short: 'AXIS',
    color: '#9b2857',
    last4: '9186',
    logo: 'bank-logos/axis.svg',
    logoBg: '#971d4a',
  },
  {
    id: 'kotak',
    name: 'Kotak Mahindra Bank',
    short: 'KOTAK',
    color: '#003974',
    last4: '6342',
    logo: 'bank-logos/kotak.svg',
    logoBg: '#ffffff',
  },
  {
    id: 'bob',
    name: 'Bank of Baroda',
    short: 'BOB',
    color: '#e76a28',
    last4: '5728',
    logo: 'bank-logos/bob.svg',
    logoBg: '#eb6a22',
  },
  {
    id: 'pnb',
    name: 'Punjab National Bank',
    short: 'PNB',
    color: '#a5204a',
    last4: '3951',
    logo: 'bank-logos/pnb.png',
    logoBg: '#a02048',
  },
  {
    id: 'canara',
    name: 'Canara Bank',
    short: 'CANARA',
    color: '#0089c9',
    last4: '8403',
    logo: 'bank-logos/canara.webp',
    logoBg: '#0089c9',
  },
  {
    id: 'union',
    name: 'Union Bank of India',
    short: 'UNION',
    color: '#d92635',
    last4: '7164',
    logo: 'bank-logos/union.png',
    logoBg: '#ffffff',
  },
  {
    id: 'idfc',
    name: 'IDFC FIRST Bank',
    short: 'IDFC',
    color: '#9b1c29',
    last4: '5297',
    logo: 'bank-logos/idfc.svg',
    logoBg: '#9b1c29',
  },
  {
    id: 'indusind',
    name: 'IndusInd Bank',
    short: 'INDUSIND',
    color: '#953c3c',
    last4: '1638',
    logo: 'bank-logos/indusind.png',
    logoBg: '#ffffff',
  },
  {
    id: 'yes',
    name: 'YES BANK',
    short: 'YES',
    color: '#1764aa',
    last4: '9702',
    logo: 'bank-logos/yes.png',
    logoBg: '#ffffff',
  },
];
let connections = {},
  bankAutoTimer = null,
  bankQuery = '',
  bankListMode = 'all';
const bankSyncing = new Set();

function bankLogo(b) {
  return `<span class="banklogoframe" style="background:${b.logoBg}"><img src="${b.logo}" alt="${b.name} logo" width="160" height="45" loading="lazy" decoding="async"></span>`;
}
function bankMatches(b) {
  return (
    (!bankQuery ||
      [b.name, b.short].some((v) => v.toLowerCase().includes(bankQuery.toLowerCase()))) &&
    (bankListMode !== 'connected' || bankActive(connections[b.id]))
  );
}
function bindBankFilters() {
  const update = () => {
    bankQuery = $('bankSearch').value;
    bankListMode = $('bankListMode').value;
    let count = 0;
    document.querySelectorAll('[data-bank-id]').forEach((el) => {
      let match = bankMatches(bankFor(el.dataset.bankId));
      el.hidden = !match;
      if (match) count++;
    });
    $('bankCount').textContent = count + ' banks';
    $('bankEmpty').hidden = count > 0;
  };
  $('bankSearch').oninput = update;
  $('bankListMode').onchange = update;
}

function bankFor(id) {
  return bankCatalog.find((b) => b.id === id);
}
function bankActive(c) {
  return !!c && c.status === 'connected' && Date.parse(c.expiresAt) > Date.now();
}
function validateConnections(value) {
  if (value === undefined) return {};
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).length > bankCatalog.length
  )
    throw Error('Invalid demo bank links');
  for (const [id, c] of Object.entries(value)) {
    if (
      !bankFor(id) ||
      !c ||
      !['connected', 'revoked'].includes(c.status) ||
      typeof c.consentId !== 'string' ||
      !/^DEMO-[a-z]+-\d+$/.test(c.consentId) ||
      !Number.isFinite(Date.parse(c.expiresAt)) ||
      !Number.isFinite(Date.parse(c.connectedAt)) ||
      ![7, 30, 90].includes(c.days) ||
      !Number.isInteger(c.cursor) ||
      c.cursor < 0 ||
      c.cursor > 1e9 ||
      typeof c.historyImported !== 'boolean' ||
      (c.lastSync !== null && !Number.isFinite(Date.parse(c.lastSync)))
    )
      throw Error('Invalid demo bank connection');
  }
  return value;
}
function stopBankAuto() {
  if (bankAutoTimer) clearInterval(bankAutoTimer);
  bankAutoTimer = null;
}
function renderBanks() {
  let active = bankCatalog.filter((b) => bankActive(connections[b.id]));
  return (
    pagehead(
      'Bank accounts',
      'A complete simulated walkthrough. No real bank, mobile number, password or UPI PIN is used.',
      `<button class="btn ${bankAutoTimer ? 'danger' : 'primary'}" data-bankaction="auto" ${active.length ? '' : 'disabled'}>${bankAutoTimer ? 'Pause auto sync' : 'Start auto sync'}</button>`,
    ) +
    `<div class="bank-demo-notice"><b>SIMULATED BANK CONNECTIONS</b><span>Bank names identify the demo scenarios only. Verification and all transactions are generated locally. No SMS is sent and no bank is contacted. Bank logos belong to their respective owners; no affiliation is implied.</span></div>${active.some((b) => connections[b.id].historyImported) ? `<div class="demo-ready"><b>Your sample profile is ready.</b><span>Continue to a pending payment and check it before simulated settlement.</span><button class="btn primary" data-go="checkout">Continue to payment check →</button></div>` : ''}<div class="bankjourney">${[
      ['1', 'Choose a bank'],
      ['2', 'Review consent'],
      ['3', 'Verify demo code'],
      ['4', 'Sync & detect'],
    ]
      .map(([n, s]) => `<div><span>${n}</span>${s}</div>`)
      .join(
        '',
      )}</div><div class="bankfilters"><input id="bankSearch" type="search" value="${esc(bankQuery)}" placeholder="Find a bank by name" aria-label="Find a demo bank"><select id="bankListMode" aria-label="Filter demo banks"><option value="all" ${bankListMode === 'all' ? 'selected' : ''}>All 12 banks</option><option value="connected" ${bankListMode === 'connected' ? 'selected' : ''}>Connected banks</option></select><span id="bankCount" class="tag">${bankCatalog.filter(bankMatches).length} banks</span></div><div class="bankgrid">${bankCatalog
      .map((b) => {
        let c = connections[b.id],
          active = bankActive(c),
          busy = bankSyncing.has(b.id),
          count = transactions.filter((t) => t.bank === b.id).length,
          flags = transactions.filter((t) => t.bank === b.id && t.decision === 'Flag').length;
        return `<section class="card bankcard" data-bank-id="${b.id}" ${bankMatches(b) ? '' : 'hidden'}><div class="cardhead">${bankLogo(b)}<span class="tag ${active ? 'live' : ''}">${active ? 'Demo connected' : c?.status === 'revoked' ? 'Consent revoked' : c ? 'Consent expired' : 'Not connected'}</span></div><h2>${b.name}</h2><p class="subtitle">Sample savings account · •••• ${b.last4}</p><div class="detailrow"><span>Imported demo payments</span><b>${count}</b></div><div class="detailrow"><span>Flagged for review</span><b>${flags}</b></div><div class="detailrow"><span>Last sync</span><b>${c?.lastSync ? new Date(c.lastSync).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : 'Not synced'}</b></div>${active ? `<p class="limitnote">Read only demo consent · ${c.days} days of history<br>Expires ${new Date(c.expiresAt).toLocaleString('en-IN')}</p><div class="actions spacer"><button class="btn primary" data-banksync="${b.id}" ${busy ? 'disabled' : ''}>${busy ? 'Syncing sample data…' : c.historyImported ? 'Sync new demo payments' : 'Sync sample history'}</button><button class="btn tiny" data-bankdetails="${b.id}">Consent details</button></div><button class="bankrevoke" data-bankrevoke="${b.id}">Disconnect demo bank</button>` : `<p class="limitnote">Walk through account selection and consent, then use the provided demo verification code.</p><button class="btn primary full spacer" data-bankconnect="${b.id}">${c ? 'Reconnect' : 'Connect'} demo ${b.short}</button>`}</section>`;
      })
      .join(
        '',
      )}</div><div id="bankEmpty" class="empty" ${bankCatalog.some(bankMatches) ? 'hidden' : ''}>No banks match. Try another name or choose All 12 banks.</div><section class="card spacer"><div class="cardhead"><div><h2>Connected payments → fraud review</h2><p class="subtitle">Each imported sample is scored immediately and can create a review alert.</p></div><button class="btn tiny" data-go="cases">Review alerts →</button></div>${table(transactions.filter((t) => t.bank).slice(0, 5))}<p class="limitnote">Auto sync adds one new generated payment per connected bank every 10 seconds while this tab stays open. It does not run in the background after closing the app. Disconnecting stops future access but keeps the previous demo assessments.</p></section>`
  );
}
function bankConnect(id) {
  let b = bankFor(id);
  if (!b) return;
  modal(
    `<div class="eyebrow">Step 1 of 3 · Demo consent</div>${bankLogo(b)}<h2>Connect demo ${b.short}</h2><p>This is a simulated read only connection to a sample ${b.name} account.</p><div class="bank-demo-notice"><b>No real bank login</b><span>Never enter a real password, bank OTP or UPI PIN in this demonstration.</span></div><div class="detailrow"><span>Sample customer</span><b>Demo Customer</b></div><div class="detailrow"><span>Sample account</span><b>•••• ${b.last4}</b></div><label class="field spacer" for="bankDays">Sample transaction history<select id="bankDays"><option value="7">Last 7 days</option><option value="30" selected>Last 30 days</option><option value="90">Last 90 days</option></select></label><p class="limitnote">Purpose: demonstrate fraud assessment. Scope: transaction amount, time, sender and receiver. Consent lasts 24 hours in this demo. No balances, payments or credentials can be changed.</p><label class="check spacer"><input id="bankConsent" type="checkbox">I allow this app to generate and read this bank’s demo transactions.</label><button class="btn primary full spacer" id="bankContinue">Continue to demo verification →</button><p class="limitnote" id="bankConsentError" role="status"></p>`,
  );
  $('bankContinue').onclick = () => {
    if (!$('bankConsent').checked) {
      $('bankConsentError').textContent = 'Select the demo consent checkbox to continue.';
      return;
    }
    bankVerify(id, +$('bankDays').value);
  };
}
function bankVerify(id, days) {
  let b = bankFor(id);
  modal(
    `<div class="eyebrow">Step 2 of 3 · Simulated verification</div><h2>Verify the sample account</h2><p>For this demo, enter <b>123456</b>. No message has been sent. This is not a real bank OTP.</p><div class="typephrase">DEMO CODE: 123456</div><form id="bankVerifyForm"><label class="field spacer" for="bankCode">Demo verification code<input id="bankCode" type="text" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" placeholder="123456" autocomplete="off" required></label><button class="btn primary full spacer" type="submit">Verify & connect demo ${b.short}</button></form><p id="bankCodeError" class="limitnote" role="status"></p>`,
  );
  $('bankVerifyForm').onsubmit = (e) => {
    e.preventDefault();
    if ($('bankCode').value !== '123456') {
      $('bankCodeError').textContent = 'Use the displayed demo code: 123456.';
      return;
    }
    let old = connections[id],
      now = new Date(),
      consentId = 'DEMO-' + id + '-' + Date.now();
    connections[id] = {
      status: 'connected',
      consentId,
      days,
      connectedAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + 86400000).toISOString(),
      lastSync: old?.lastSync || null,
      cursor: old?.cursor || 0,
      historyImported: old?.historyImported || false,
    };
    logAudit(
      'BANK-' + id,
      'Demo consent granted: ' + days + ' days history, read only, consent ' + consentId,
    );
    save();
    render();
    modal(
      `<div class="eyebrow">Step 3 of 3 · Demo bank connected</div><h2>Demo ${b.short} is ready.</h2><p>Your simulated consent is active. Sync sample payments to demonstrate how the detector assesses them and creates alerts.</p><div class="notice">Only generated data will be imported. This has not connected an actual bank account.</div><button class="btn primary full spacer" data-banksync="${id}">Sync & check demo payments →</button>`,
    );
    notify('Demo bank connected. Sync sample history next.');
  };
}
async function bankSync(id) {
  let b = bankFor(id),
    c = connections[id];
  if (!b || !bankActive(c)) {
    notify('Connect the demo bank and grant consent first.');
    return;
  }
  if (bankSyncing.has(id)) return;
  let consent = c.consentId;
  bankSyncing.add(id);
  if ($('dialog').open) $('dialog').close();
  if (view === 'banks') render();
  try {
    await new Promise((resolve) => setTimeout(resolve, 650));
    if (storageBlocked || !bankActive(connections[id]) || connections[id].consentId !== consent)
      return;
    let first = !c.historyImported,
      added = 0,
      flags = 0;
    const n = first ? 10 : 1;
    for (let i = 0; i < n; i++) {
      let index = first ? i : c.cursor++,
        providerId = first ? id + '-history-' + i : id + '-new-' + index;
      if (transactions.some((t) => t.bankEventKey === providerId)) continue;
      let kind = first
          ? i === 8
            ? 'high'
            : i === 9
              ? 'ring'
              : 'normal'
          : index % 3 === 0
            ? 'high'
            : 'normal',
        t = synthetic(kind);
      t.bank = id;
      t.bankEventKey = providerId;
      t.sender = id + '-account';
      t.receiver = kind === 'ring' ? 'hub-01' : id + '-merchant-' + (i + 1);
      t.source = 'Demo bank: ' + b.name;
      t.timestamp = new Date(
        first ? Date.now() - (n - 1 - i) * ((c.days * 86400000) / n) : Date.now(),
      ).toISOString();
      let item = process(t, true, false);
      added++;
      if (item.decision === 'Flag') flags++;
    }
    c.historyImported = true;
    c.lastSync = new Date().toISOString();
    logAudit('BANK-' + id, 'Demo sync: ' + added + ' generated payments, ' + flags + ' flagged');
    save();
    notify(b.short + ': ' + added + ' demo payments checked, ' + flags + ' flagged.');
  } finally {
    bankSyncing.delete(id);
    updateNav();
    if (view === 'banks') render();
    else refreshOverview();
  }
}
function bankConsentDetails(id) {
  let b = bankFor(id),
    c = connections[id];
  if (!c) return;
  modal(
    `<div class="eyebrow">Simulated consent receipt</div><h2>${b.name} · •••• ${b.last4}</h2><div class="detailrow"><span>Consent reference</span><b>${esc(c.consentId)}</b></div><div class="detailrow"><span>Status</span><b>${bankActive(c) ? 'Active' : c.status === 'revoked' ? 'Revoked' : 'Expired'}</b></div><div class="detailrow"><span>Scope</span><b>Read only demo transactions</b></div><div class="detailrow"><span>History window</span><b>${c.days} days</b></div><div class="detailrow"><span>Expires</span><b>${new Date(c.expiresAt).toLocaleString('en-IN')}</b></div><p class="limitnote">This receipt is a local demo record, not bank authorisation. Imported payments remain in the assessment history after disconnecting. Reset demo data in Advanced tools → Demo settings to remove them.</p><button class="btn danger full spacer" data-bankrevoke="${id}">Disconnect demo bank</button>`,
  );
}
function bankRevoke(id) {
  let b = bankFor(id),
    c = connections[id];
  if (!c) return;
  modal(
    `<div class="eyebrow">Disconnect simulated account</div><h2>Disconnect demo ${b.short}?</h2><p>Future syncs for this sample account will stop. Previously imported assessments and review notes will remain.</p><button class="btn danger full spacer" id="confirmBankRevoke">Revoke demo consent</button>`,
  );
  $('confirmBankRevoke').onclick = () => {
    c.status = 'revoked';
    logAudit('BANK-' + id, 'Demo consent revoked');
    if (!Object.values(connections).some(bankActive)) stopBankAuto();
    save();
    $('dialog').close();
    render();
    notify('Demo bank disconnected. Future sync is stopped.');
  };
}
function toggleBankAuto() {
  if (bankAutoTimer) {
    stopBankAuto();
    notify('Automatic demo sync paused.');
  } else {
    if (!Object.values(connections).some(bankActive)) return notify('Connect a demo bank first.');
    bankAutoTimer = setInterval(() => {
      if ($('dialog').open) return;
      if (storageBlocked) {
        stopBankAuto();
        return;
      }
      let active = bankCatalog.filter((b) => bankActive(connections[b.id]));
      if (!active.length) {
        stopBankAuto();
        if (view === 'banks') render();
        return;
      }
      active.forEach((b) => bankSync(b.id));
    }, 10000);
    notify('Auto sync enabled for this tab. New generated payments arrive every 10 seconds.');
  }
  render();
}
document.addEventListener('click', (e) => {
  let connect = e.target.closest('[data-bankconnect]');
  if (connect) return bankConnect(connect.dataset.bankconnect);
  let sync = e.target.closest('[data-banksync]');
  if (sync) return bankSync(sync.dataset.banksync);
  let revoke = e.target.closest('[data-bankrevoke]');
  if (revoke) return bankRevoke(revoke.dataset.bankrevoke);
  let receipt = e.target.closest('[data-bankdetails]');
  if (receipt) return bankConsentDetails(receipt.dataset.bankdetails);
  let auto = e.target.closest('[data-bankaction="auto"]');
  if (auto) toggleBankAuto();
});

let swipeState = { samples: [], baseline: null, deviation: null, current: null };
function interactionContext() {
  let values = [];
  if (typing.deviation !== null) values.push(typing.deviation);
  if (swipeState.deviation !== null) values.push(swipeState.deviation);
  return values.length
    ? { available: true, deviation: values.reduce((a, b) => a + b, 0) / values.length }
    : { available: false };
}
function swipeMarkup() {
  return `<section class="card spacer"><div class="cardhead"><h2>Optional touch or pointer rhythm</h2><span class="tag">${swipeState.baseline ? 'Baseline ready' : swipeState.samples.length + '/3 samples'}</span></div><p class="limitnote">Swipe or drag across the strip from left to right. Capture three runs to establish a speed baseline, then a fourth to compare. This is an interaction experiment, not identity verification.</p><div id="swipePad" class="swipepad" tabindex="0" role="group" aria-label="Swipe rhythm experiment"><span>Drag from here</span><b>→</b><span>Finish here</span></div><p id="swipeStatus" class="limitnote" role="status">${swipeState.deviation !== null ? 'Latest normalised swipe deviation: ' + swipeState.deviation.toFixed(2) : 'No comparison yet. Coordinates stay in tab memory.'}</p><button class="btn tiny" data-journey="resetswipe">Reset swipe baseline</button><p class="limitnote">Keyboard users can skip this task and use typing instead. Only the derived deviation can be sent with an explicitly submitted guided payment; raw paths are never uploaded.</p></section>`;
}
function bindSwipe() {
  let pad = $('swipePad');
  if (!pad) return;
  pad.onpointerdown = (e) => {
    let rect = pad.getBoundingClientRect();
    if (e.clientX - rect.left > rect.width * 0.35) {
      $('swipeStatus').textContent = 'Start in the left third of the strip.';
      return;
    }
    pad.setPointerCapture(e.pointerId);
    swipeState.current = {
      id: e.pointerId,
      start: e.clientX,
      at: performance.now(),
      width: rect.width,
      left: rect.left,
    };
    pad.classList.add('dragging');
  };
  pad.onpointerup = (e) => {
    let s = swipeState.current;
    swipeState.current = null;
    pad.classList.remove('dragging');
    if (!s || s.id !== e.pointerId) return;
    let duration = performance.now() - s.at,
      distance = (e.clientX - s.start) / s.width;
    if (duration < 100 || duration > 10000 || distance < 0.55) {
      $('swipeStatus').textContent =
        'Drag from the left side across most of the strip, then release.';
      return;
    }
    let speed = distance / (duration / 1000);
    if (swipeState.samples.length < 3) {
      swipeState.samples.push(speed);
      if (swipeState.samples.length === 3)
        swipeState.baseline = swipeState.samples.reduce((a, b) => a + b, 0) / 3;
      $('swipeStatus').textContent = swipeState.baseline
        ? 'Baseline captured. Drag once more to compare.'
        : swipeState.samples.length + '/3 samples captured.';
    } else {
      swipeState.deviation = Math.min(
        6,
        Math.abs(speed - swipeState.baseline) / Math.max(0.1, swipeState.baseline * 0.25),
      );
      $('swipeStatus').textContent =
        'Comparison captured. Normalised deviation ' +
        swipeState.deviation.toFixed(2) +
        '. Available to guided payment checks.';
    }
  };
  pad.onpointercancel = () => {
    swipeState.current = null;
    pad.classList.remove('dragging');
  };
}

const P = ShieldPipeline;
let journey = { behaviorSkipped: false, useOffline: false },
  demoPayments = [],
  checkoutScenario = 'normal',
  paymentBusy = false,
  loadRunning = false,
  loadCancelled = false,
  loadReport = null;
function linkedDemoBanks() {
  return bankCatalog.filter(
    (b) => bankActive(connections[b.id]) && connections[b.id].historyImported,
  );
}
function sampleHistory() {
  return transactions.slice(0, 400).map((t) => ({
    sender: t.sender,
    receiver: t.receiver,
    amount: t.amount,
    timestamp: t.timestamp,
    settled: !t.paymentId || demoPayments.find((p) => p.id === t.paymentId)?.status === 'Settled',
  }));
}
function payerBank() {
  return linkedDemoBanks()[0];
}
function currentProfile() {
  let b = payerBank();
  return b ? P.profile(sampleHistory(), b.id + '-account') : null;
}
function guideSteps() {
  let connected = bankCatalog.some((b) => bankActive(connections[b.id])),
    profile = currentProfile(),
    paid = demoPayments.some((p) => p.assessment),
    reviewed = demoPayments.some(
      (p) => p.assessment && (p.status === 'Settled' || p.status === 'Cancelled'),
    );
  return [
    {
      title: 'Connect a demo bank',
      done: connected,
      route: 'banks',
      description:
        'Choose any sample bank, grant simulated consent and enter the displayed code 123456.',
    },
    {
      title: 'Load history & build a profile',
      done: !!profile?.baselineAvailable,
      route: 'banks',
      description:
        'Sync sample history. The app calculates normal payment amounts and familiar recipients from those records.',
    },
    {
      title: 'Set up interaction checks',
      done: interactionContext().available || journey.behaviorSkipped,
      route: 'behavior',
      description:
        'Capture a typing baseline and compare a sample. You may explicitly skip this experimental step.',
    },
    {
      title: 'Check a pending payment',
      done: paid,
      route: 'checkout',
      description:
        'Submit a demo payment. The backend checks it before any simulated settlement can occur.',
    },
    {
      title: 'Complete the outcome',
      done: reviewed,
      route: 'checkout',
      description:
        'Settle an allowed payment, complete extra verification, or review and release or cancel a held payment.',
    },
  ];
}
function guideNext() {
  return guideSteps().find((s) => !s.done) || { route: 'checkout', title: 'Try another payment' };
}
function renderGuide() {
  let steps = guideSteps(),
    done = steps.filter((s) => s.done).length,
    p = currentProfile();
  return (
    pagehead(
      'One complete payment safety journey.',
      'Follow five short steps. All accounts and payments are simulated.',
      `<button class="btn" data-go="overview">Investigator overview</button>`,
    ) +
    `<section class="journeyhero"><div><span class="eyebrow">UPI Shield / Getting started</span><h2>Understand the payment.<br>Check it before it settles.</h2><p>Connect a demo account, build its profile, compare interaction signals, and watch a payment reach a real state in the simulator.</p><button class="btn primary" data-go="${guideNext().route}">${done === 5 ? 'Run another scenario' : 'Continue: ' + guideNext().title} →</button></div><div class="journeyring" style="--progress:${(done / 5) * 100}%"><div><b>${done}/5</b><span>steps complete</span></div></div></section><div class="guidecards">${steps.map((s, i) => `<section class="card guidestep ${s.done ? 'complete' : ''}"><span class="stepbadge">${s.done ? '✓' : i + 1}</span><div><h2>${s.title}</h2><p>${s.description}</p><button class="btn tiny" data-go="${s.route}">${s.done ? 'Open again' : 'Start this step'} →</button>${i === 2 && !s.done ? '<button class="btn tiny" data-journey="skip">Skip for this demo</button>' : ''}</div></section>`).join('')}</div><section class="card spacer"><div class="cardhead"><h2>Your sample profile</h2><span class="tag">Calculated from ledger</span></div>${p ? `<div class="profilegrid"><div><small>History records</small><b>${p.count}</b></div><div><small>Typical payment (median)</small><b>${money(p.median)}</b></div><div><small>Familiar recipients</small><b>${p.recipients.length}</b></div></div>` : '<p class="limitnote">Connect a bank and sync its sample history to calculate the profile. No upload is needed.</p>'}<p class="limitnote">Online mode sends synthetic context to our assessment endpoint. Bank connections, identity checks and settlement are simulated. Your workspace is stored in this browser; it is not a secure multiuser banking system.</p></section>`
  );
}
function renderCheckout() {
  let banks = linkedDemoBanks(),
    last = demoPayments[0];
  return (
    pagehead(
      'Check first. Settle second.',
      'A pending demo payment stays unsettled until the decision and required checks are complete.',
      `<button class="btn" data-go="guide">Your guide</button>`,
    ) +
    `<div class="modebar"><span class="tag">${journey.useOffline || window.SHIELD_MODEL ? 'Local simulator' : 'Backend assessment'}</span><span>${journey.useOffline || window.SHIELD_MODEL ? 'No network measurement in local mode.' : 'Total request timing includes the browser’s network round trip.'}</span></div>${
      !banks.length
        ? `<section class="card empty"><h2>Prepare your demo account first.</h2><p>Connect a demo bank and sync its sample history.</p><button class="btn primary" data-go="banks">Connect demo bank →</button></section><div id="paymentResult" class="spacer">${last ? paymentReceipt(last) : ''}</div>`
        : `<div class="scenariochips">${[
            ['normal', 'Everyday payment'],
            ['verify', 'Extra verification'],
            ['unusual', 'Unusual session'],
            ['ring', 'Fan in network'],
            ['cycle', 'Circular transfers'],
          ]
            .map(
              ([id, l]) =>
                `<button class="btn ${checkoutScenario === id ? 'active' : ''}" data-pay-scenario="${id}" ${paymentBusy ? 'disabled' : ''}>${l}</button>`,
            )
            .join(
              '',
            )}</div><div class="simlayout"><section class="card"><h2>Create a pending payment</h2><form id="checkoutForm"><label class="field spacer" for="payBank">Pay from demo bank<select id="payBank" ${paymentBusy ? 'disabled' : ''}>${banks.map((b) => `<option value="${b.id}">${b.name} · •••• ${b.last4}</option>`).join('')}</select></label><label class="field spacer" for="payRecipient">Recipient<select id="payRecipient" ${paymentBusy ? 'disabled' : ''}><option value="familiar">Familiar sample merchant</option><option value="new">New sample recipient</option></select></label><label class="field spacer" for="payAmount">Amount (₹)<input id="payAmount" type="number" min="1" max="10000000" step="1" value="${['unusual', 'ring', 'cycle'].includes(checkoutScenario) ? 40000 : 650}" required ${paymentBusy ? 'disabled' : ''}></label><div class="assumed-details spacer"><b>${{ normal: 'A familiar recipient and a familiar session.', verify: 'A cautious demo policy requests an extra check.', unusual: 'An unfamiliar device with a burst of recent requests.', ring: 'Several fresh incoming transfers precede an onward payment.', cycle: 'This payment closes a loop across sample accounts.' }[checkoutScenario]}</b><p>Scenario history is generated and recorded in the ledger. Network features are calculated from those events, not entered as risk values.</p></div><p class="limitnote">Interaction comparison: ${interactionContext().available ? 'measured session deviation ' + interactionContext().deviation.toFixed(2) : journey.behaviorSkipped ? 'explicitly skipped' : 'not enrolled'}. Unavailable interaction data is reported as unavailable.</p><button class="btn primary full spacer" type="submit" ${paymentBusy ? 'disabled' : ''}>${paymentBusy ? 'Checking pending payment…' : 'Create & check demo payment'}</button></form><label class="check spacer"><input type="checkbox" id="offlineChoice" ${journey.useOffline ? 'checked' : ''} ${paymentBusy ? 'disabled' : ''}>Use local simulator instead of backend</label><p class="limitnote">No real payment instructions or credentials are sent to a bank. This sandbox endpoint accepts synthetic history supplied by the browser.</p></section><div id="paymentResult">${last ? paymentReceipt(last) : '<section class="card empty"><h2>Your payment story appears here.</h2><p>After you submit, inspect the decision, timing breakdown, evidence and settlement state.</p></section>'}</div></div>`
    }<section class="card spacer"><h2>Payment lifecycle history</h2><div class="paymentlist">${
      demoPayments
        .slice(0, 12)
        .map(
          (p) =>
            `<button class="paymenthistory" data-pay-detail="${p.id}"><span>${esc(p.id)}<small>${esc(p.bank)} · ${money(p.amount)}</small></span><b>${esc(p.status)}</b></button>`,
        )
        .join('') || '<p class="limitnote">No guided payments yet.</p>'
    }</div></section>`
  );
}
function paymentReceipt(p) {
  let r = p.assessment;
  return `<section class="card paymentreceipt" aria-live="polite"><div class="cardhead"><h2>Demo payment</h2><span class="tag">${esc(p.status)}</span></div><div class="metriclarge">${money(p.amount)}</div><p class="limitnote">${esc(p.sender)} → ${esc(p.receiver)}</p><div class="statebanner ${p.status === 'Settled' ? 'settled' : ''}">${p.status === 'Settled' ? 'Simulated settlement complete' : p.status === 'Cancelled' ? 'Demo payment cancelled' : p.status === 'Checking' ? 'Assessment in progress — not settled' : 'Not settled'}</div>${
    r
      ? `<div class="scoreline"><span>Model estimate</span><b>${(r.modelScore * 100).toFixed(1)} /100</b></div><p class="limitnote">${esc(r.probabilityScope)}. Not a verified probability of real fraud.</p>${badge(r.decision)}<ul class="paymentreasons">${r.reasons.map((reason) => `<li>${esc(reason)}</li>`).join('')}</ul><div class="timinggrid"><div><small>Model scoring</small><b>${formatMs(r.timings.scoringMs)}</b><small>${r.timings.scoringMs < 200 ? 'Below 200 ms for this call' : 'Above 200 ms for this call'}</small></div><div><small>${p.mode === 'backend' ? 'Browser request → response' : 'Local assessment'}</small><b>${formatMs(p.totalMs)}</b><small>${p.mode === 'backend' ? (p.totalMs < 500 ? 'Below 500 ms for this call' : 'Above 500 ms for this call') : 'Not an end to end network test'}</small></div></div><details class="result-explanation"><summary>Timing & graph evidence</summary>${[
          ['Feature preparation', r.timings.featuresMs],
          ['Graph analysis', r.timings.graphMs],
          ['Behavior context', r.timings.behaviorMs],
          ['Policy decision', r.timings.policyMs],
          ['Server assessment total', r.timings.serverTotalMs],
        ]
          .map(
            ([name, value]) =>
              `<div class="detailrow"><span>${name}</span><b>${formatMs(value)}</b></div>`,
          )
          .join(
            '',
          )}<p class="limitnote">${p.mode === 'backend' ? 'Request timing is measured from browser dispatch through parsed response. It includes network and cold start delay, excludes drawing the UI and any bank settlement.' : 'All stages ran locally.'}</p><div class="detailrow"><span>Recent incoming senders</span><b>${r.graph.fanin}</b></div><div class="detailrow"><span>Transfer cycle</span><b>${r.graph.cycle ? 'Detected' : 'Not detected'}</b></div>${r.graph.cycle ? `<p class="limitnote">${r.graph.cyclePath.map(esc).join(' → ')}</p>` : ''}<p class="limitnote">Graph history window: 120 seconds. ${r.graph.evidence.length} incoming evidence events retained. Graph rules may elevate the decision separately from the model score.</p></details>`
      : ''
  }${p.error ? `<p class="notice">${esc(p.error)} No settlement was performed.</p>` : ''}<div class="actions spacer">${p.status === 'Ready to settle' ? `<button class="btn primary" data-pay-settle="${p.id}">Confirm simulated settlement</button>` : ''}${p.status === 'Verification required' ? `<button class="btn primary" data-pay-verify="${p.id}">Complete extra demo verification</button>` : ''}${p.status === 'Held for review' ? `<button class="btn primary" data-pay-review="${p.id}">Open investigator review</button>` : ''}${['Assessment failed', 'Created'].includes(p.status) ? `<button class="btn primary" data-pay-retry="${p.id}">Retry assessment</button>` : ''}${!['Settled', 'Cancelled', 'Checking'].includes(p.status) ? `<button class="btn danger" data-pay-cancel="${p.id}">Cancel demo payment</button>` : ''}<button class="btn tiny" data-go="intelligence">Open intelligence centre</button><button class="btn tiny" data-pay-timeline="${p.id}">View timeline</button>${r ? `<button class="btn tiny" data-pay-graph="${p.id}">Inspect account graph</button>` : ''}</div></section>`;
}
function formatMs(n) {
  return Number.isFinite(n) ? (n < 0.01 ? '＜0.01' : n.toFixed(2)) + ' ms' : 'Unavailable';
}
function evidenceRecord(edge, bank) {
  let t = { ...synthetic('normal'), ...edge, bank, source: 'Guided scenario context' };
  return process(t, true, false);
}
function preparePayment(bank, amount, recipient) {
  let at = Date.now(),
    sender = bank + '-account',
    existing = sampleHistory(),
    prof = P.profile(existing, sender),
    receiver =
      recipient === 'familiar'
        ? prof.recipients.find((id) => !id.includes('hub')) || bank + '-merchant-1'
        : 'new-demo-recipient';
  if (checkoutScenario === 'cycle') {
    receiver = 'cycle-a';
    evidenceRecord(
      {
        sender: 'cycle-a',
        receiver: 'cycle-b',
        amount: 2000,
        timestamp: new Date(at - 20000).toISOString(),
      },
      bank,
    );
    evidenceRecord(
      {
        sender: 'cycle-b',
        receiver: sender,
        amount: 2000,
        timestamp: new Date(at - 10000).toISOString(),
      },
      bank,
    );
  }
  if (checkoutScenario === 'ring')
    for (let i = 0; i < 5; i++)
      evidenceRecord(
        {
          sender: 'incoming-' + i,
          receiver: sender,
          amount: 3000 + i * 100,
          timestamp: new Date(at - 60000 + i * 5000).toISOString(),
        },
        bank,
      );
  if (checkoutScenario === 'unusual')
    for (let i = 0; i < 7; i++)
      evidenceRecord(
        {
          sender,
          receiver: 'burst-merchant-' + i,
          amount: 600,
          timestamp: new Date(at - 70000 + i * 6000).toISOString(),
        },
        bank,
      );
  let id = 'PAY-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
  let p = {
    id,
    bank,
    amount,
    sender,
    receiver,
    timestamp: new Date().toISOString(),
    device: checkoutScenario === 'unusual' ? 'new' : 'familiar',
    status: 'Created',
    scenario: checkoutScenario,
    timeline: [{ status: 'Created', time: new Date().toISOString(), actor: 'customer' }],
    assessment: null,
    mode: null,
    totalMs: null,
  };
  demoPayments.unshift(p);
  demoPayments = demoPayments.slice(0, 50);
  save();
  return p;
}
async function assessPayment(p) {
  if (paymentBusy) return;
  if (!bankActive(connections[p.bank])) {
    notify('Reconnect the demo bank before checking this payment.');
    return;
  }
  paymentBusy = true;
  P.transition(p, 'Checking');
  save();
  p.error = null;
  if (view === 'checkout') render();
  let started = performance.now();
  try {
    let payload = {
        demo: true,
        extraVerification: p.scenario === 'verify',
        payment: {
          id: p.id,
          sender: p.sender,
          receiver: p.receiver,
          amount: p.amount,
          timestamp: new Date().toISOString(),
          device: p.device,
        },
        history: sampleHistory(),
        behavior: interactionContext(),
      },
      result;
    if (journey.useOffline || window.SHIELD_MODEL) {
      result = P.assess(model, payload);
      if (window.SHIELD_INTELLIGENCE_MODEL) {
        const layers = ShieldIntelligence.assess(window.SHIELD_INTELLIGENCE_MODEL, payload, result);
        result.intelligence = layers;
        result.decision = layers.decision;
        result.reasons.push(...layers.reasons);
        result.timings.scoringMs += layers.scoringMs;
        result.timings.serverTotalMs += layers.scoringMs;
      }
      p.mode = 'local';
    } else {
      let response = await fetch('/api/assess', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok)
        throw Error(
          'Assessment service returned ' +
            response.status +
            '. Retry, or explicitly choose the local simulator.',
        );
      result = await response.json();
      if (
        result.paymentId !== p.id ||
        !['Allow', 'Verify', 'Flag'].includes(result.decision) ||
        !Number.isFinite(result.modelScore)
      )
        throw Error('Invalid assessment response.');
      p.mode = 'backend';
    }
    p.totalMs = performance.now() - started;
    p.assessment = result;
    if (!bankActive(connections[p.bank]))
      throw Error(
        'Demo consent expired or was revoked during assessment. Reconnect before retrying.',
      );
    let decision = result.decision;
    P.transition(
      p,
      decision === 'Allow'
        ? 'Ready to settle'
        : decision === 'Verify'
          ? 'Verification required'
          : 'Held for review',
      'assessment',
    );
    const item = process(
      {
        ...result.signals,
        sender: p.sender,
        receiver: p.receiver,
        amount: p.amount,
        bank: p.bank,
        source: 'Guided pre settlement check',
        timestamp: p.timestamp,
        paymentId: p.id,
      },
      true,
      true,
      true,
      result,
    );
    p.assessmentRef = item.id;
    logAudit(p.id, 'Assessment returned ' + decision + '; payment remains unsettled.');
    save();
  } catch (e) {
    p.error =
      e.name === 'TimeoutError'
        ? 'The service did not respond within ten seconds. Retry or select local simulator.'
        : e.message;
    P.transition(p, 'Assessment failed', 'assessment');
    save();
  } finally {
    paymentBusy = false;
    if (view === 'checkout') render();
    else updateNav();
  }
}
function setPaymentState(id, status, actor = 'customer') {
  let p = demoPayments.find((p) => p.id === id);
  if (!p) return;
  try {
    if (['Ready to settle', 'Settled'].includes(status) && !bankActive(connections[p.bank]))
      throw Error('Reconnect the demo bank before releasing or settling this payment.');
    if (status === 'Settled' && !p.assessment) throw Error('A successful assessment is required.');
    P.transition(p, status, actor);
    logAudit(id, 'Demo payment ' + status + ' by ' + actor);
    save();
    render();
    notify(
      status === 'Settled'
        ? 'Simulated settlement recorded. No real money moved.'
        : 'Payment updated.',
    );
  } catch (e) {
    notify(e.message);
  }
}
function extraVerification(id) {
  let p = demoPayments.find((p) => p.id === id);
  if (p?.status !== 'Verification required') return;
  modal(
    `<div class="eyebrow">Extra verification / demo only</div><h2>Confirm this sample payment.</h2><p>Enter <b>654321</b>. No SMS was sent and this does not authenticate a real identity.</p><label class="field">Demo code<input id="extraCode" inputmode="numeric" maxlength="6" placeholder="654321"></label><button class="btn primary full spacer" id="extraConfirm">Complete demo check</button><p id="extraError" role="status" class="limitnote"></p>`,
  );
  $('extraConfirm').onclick = () => {
    if ($('extraCode').value !== '654321') {
      $('extraError').textContent = 'Use the displayed demo code 654321.';
      return;
    }
    $('dialog').close();
    setPaymentState(id, 'Ready to settle', 'demo verification');
  };
}
function reviewPayment(id) {
  let p = demoPayments.find((p) => p.id === id);
  if (p?.status !== 'Held for review') return;
  modal(
    `<div class="eyebrow">Investigator desk / simulated role</div><h2>Review ${money(p.amount)}</h2><p>${p.assessment.reasons.map(esc).join('<br>')}</p><label class="field">Investigation note<textarea id="releaseNote" rows="3" maxlength="1000" placeholder="Explain the evidence and decision" required></textarea></label><div class="actions spacer"><button class="btn primary" id="releasePayment">Release in demo</button><button class="btn danger" id="rejectPayment">Cancel in demo</button></div><p id="reviewError" class="limitnote" role="status"></p><p class="notice">This workspace role is simulated and does not provide protected investigator authentication. Nothing is transferred.</p>`,
  );
  function resolve(next) {
    let note = $('releaseNote').value.trim();
    if (!note) {
      $('reviewError').textContent = 'Add a review note before deciding.';
      return;
    }
    logAudit(id, 'Investigator note: ' + note);
    let c = cases[p.assessmentRef];
    if (c) {
      c.status = 'Resolved';
      c.outcome = next === 'Cancelled' ? 'Needs more evidence' : 'Likely legitimate';
      c.notes.push({ text: note, time: new Date().toISOString() });
    }
    $('dialog').close();
    setPaymentState(id, next, 'investigator');
  }
  $('releasePayment').onclick = () => resolve('Ready to settle');
  $('rejectPayment').onclick = () => resolve('Cancelled');
}
function paymentTimeline(id) {
  let p = demoPayments.find((p) => p.id === id);
  if (!p) return;
  modal(
    `<div class="eyebrow">Payment lifecycle receipt</div><h2>${esc(p.id)}</h2><p>${money(p.amount)} · ${esc(p.status)} · simulation only</p>${p.timeline.map((t) => `<div class="timelineitem"><b>${esc(t.status)}</b><span>${new Date(t.time).toLocaleTimeString('en-IN')} · ${esc(t.actor)}</span></div>`).join('')}<button class="btn spacer" data-journey="exportreceipt" data-payment="${p.id}">Download receipt</button>`,
  );
}
function bindCheckout() {
  if (!$('checkoutForm')) return;
  $('offlineChoice').onchange = (e) => {
    journey.useOffline = e.target.checked;
    save();
    render();
  };
  $('checkoutForm').onsubmit = (e) => {
    e.preventDefault();
    if (!$('checkoutForm').reportValidity() || paymentBusy) return;
    let bank = $('payBank').value;
    if (!bankActive(connections[bank]) || !connections[bank].historyImported)
      return notify('Connect and sync this demo bank first.');
    let p = preparePayment(bank, +$('payAmount').value, $('payRecipient').value);
    assessPayment(p);
  };
}
function renderPerformance() {
  let r = loadReport;
  return (
    pagehead(
      'Measure the complete request.',
      'A bounded concurrency test of the sandbox endpoint, not a production scale certification.',
    ) +
    `<div class="alertbanner">Each call sends generated sample history to the same assessment endpoint. These measurements include this browser’s network path and may exceed 500 ms. Cold starts and geographic distance are not hidden.</div><section class="card"><div class="formgrid"><label class="field">Requests<select id="loadCount" ${loadRunning ? 'disabled' : ''}><option>10</option><option selected>25</option><option>50</option></select></label><label class="field">Concurrent requests<select id="loadConcurrency" ${loadRunning ? 'disabled' : ''}><option>1</option><option>3</option><option selected>5</option></select></label></div><div class="actions spacer"><button class="btn primary" data-journey="load" ${loadRunning ? 'disabled' : ''}>${loadRunning ? 'Testing…' : 'Run backend request test'}</button>${loadRunning ? '<button class="btn danger" data-journey="stopload">Stop after in flight requests</button>' : ''}</div><p class="limitnote" id="loadProgress">${loadRunning ? 'Requests in progress. Please keep this tab open.' : payerBank() ? 'Ready to test the backend. Local offline mode cannot measure network latency.' : 'Connect and sync a demo bank first.'}</p></section>${r ? `<section class="card spacer"><h2>Measured results</h2><div class="stats spacer">${stat('Successful requests', r.success + '/' + r.attempted, 'Errors: ' + r.errors, '✓')}${stat('P95 request latency', formatMs(r.p95), 'Includes network round trip', '↗')}${stat('P95 model scoring', formatMs(r.scoreP95), 'Measured inside backend', 'ϟ')}${stat('Observed throughput', r.throughput.toFixed(1) + '/s', 'Successful requests / elapsed time', '◎')}</div><div class="detailrow"><span>Median request latency</span><b>${formatMs(r.median)}</b></div><div class="detailrow"><span>Requests below 500 ms</span><b>${r.under500}/${r.success}</b></div><div class="detailrow"><span>Model calls below 200 ms</span><b>${r.scoreUnder200}/${r.success}</b></div><p class="limitnote">Concurrency ${r.concurrency}, total wall time ${formatMs(r.wallMs)}. ${r.stopped ? 'Stopped early. ' : ''}${r.firstError ? 'First failure: ' + esc(r.firstError) : 'No failed requests in this run.'} Small browser driven tests do not establish large scale reliability. No bank settlement was performed.</p><button class="btn" data-journey="exportload">Download test report</button></section>` : ''}<section class="card spacer"><h2>What a complete production assessment still needs</h2><p class="limitnote">Representative labelled transactions, probability calibration validation, protected service identities, durable payment state and idempotency, trusted bank events, evaluated biometrics, queue/load tests and deployment monitoring. This demo has a stateless backend and browser local simulated settlement.</p></section>`
  );
}
async function runLoad() {
  if (loadRunning) return;
  let bank = payerBank();
  if (!bank) return notify('Connect a demo bank and sync its history first.');
  if (window.SHIELD_MODEL || journey.useOffline)
    return notify('Choose backend mode in Payment check to test network requests.');
  let count = Math.min(50, +$('loadCount').value),
    concurrency = Math.min(5, +$('loadConcurrency').value),
    completed = 0,
    index = 0,
    latencies = [],
    scores = [],
    errors = 0,
    firstError = '',
    start = performance.now();
  loadRunning = true;
  loadCancelled = false;
  render();
  async function worker() {
    while (!loadCancelled && index < count) {
      let i = index++,
        body = {
          demo: true,
          payment: {
            id: 'PAY-load-' + Date.now() + '-' + i,
            sender: bank.id + '-account',
            receiver: currentProfile()?.recipients[0] || 'demo-merchant',
            amount: 650,
            timestamp: new Date().toISOString(),
            device: 'familiar',
          },
          history: sampleHistory(),
          behavior: { available: false },
        },
        s = performance.now();
      try {
        let response = await fetch('/api/assess', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(10000),
        });
        if (!response.ok) throw Error('HTTP ' + response.status);
        let data = await response.json();
        if (!Number.isFinite(data.timings?.scoringMs)) throw Error('Invalid timing response');
        latencies.push(performance.now() - s);
        scores.push(data.timings.scoringMs);
      } catch (e) {
        errors++;
        if (!firstError) firstError = e.message;
      }
      completed++;
      if ($('loadProgress'))
        $('loadProgress').textContent =
          completed + '/' + count + ' completed; ' + errors + ' failures.';
    }
  }
  try {
    await Promise.all(Array.from({ length: concurrency }, worker));
    let wallMs = performance.now() - start;
    latencies.sort((a, b) => a - b);
    scores.sort((a, b) => a - b);
    const quantile = (a, q) =>
      a.length ? a[Math.min(a.length - 1, Math.ceil(a.length * q) - 1)] : null;
    loadReport = {
      time: new Date().toISOString(),
      scope: 'Bounded browser to stateless backend test using synthetic data',
      attempted: completed,
      success: latencies.length,
      errors,
      firstError,
      concurrency,
      wallMs,
      p95: quantile(latencies, 0.95),
      median: quantile(latencies, 0.5),
      scoreP95: quantile(scores, 0.95),
      under500: latencies.filter((v) => v < 500).length,
      scoreUnder200: scores.filter((v) => v < 200).length,
      throughput: latencies.length / (wallMs / 1000),
      stopped: loadCancelled,
    };
    logAudit('ENDPOINT-TEST', completed + ' requests, ' + errors + ' failed');
    save();
  } finally {
    loadRunning = false;
    if (view === 'performance') render();
    notify('Backend test completed. Open Request performance for results.');
  }
}
function validateJourney(data) {
  if (
    data.journey !== undefined &&
    (!data.journey ||
      typeof data.journey.behaviorSkipped !== 'boolean' ||
      typeof data.journey.useOffline !== 'boolean')
  )
    throw Error('Invalid guide settings');
  if (data.demoPayments === undefined) return;
  if (!Array.isArray(data.demoPayments) || data.demoPayments.length > 50)
    throw Error('Invalid demo payment history');
  let ids = new Set();
  for (const p of data.demoPayments) {
    if (
      !p ||
      typeof p.id !== 'string' ||
      !/^PAY-[a-zA-Z0-9-]{5,80}$/.test(p.id) ||
      ids.has(p.id) ||
      !bankFor(p.bank) ||
      !Number.isFinite(p.amount) ||
      p.amount < 1 ||
      p.amount > 1e7 ||
      ![
        'Created',
        'Checking',
        'Assessment failed',
        'Ready to settle',
        'Verification required',
        'Held for review',
        'Settled',
        'Cancelled',
      ].includes(p.status) ||
      !Array.isArray(p.timeline) ||
      p.timeline.length > 100 ||
      p.timeline.some(
        (t) =>
          typeof t.status !== 'string' ||
          t.status.length > 60 ||
          typeof t.actor !== 'string' ||
          t.actor.length > 60 ||
          !Number.isFinite(Date.parse(t.time)),
      )
    )
      throw Error('Invalid demo payment receipt');
    ids.add(p.id);
    if (p.assessment) {
      let r = p.assessment;
      if (
        !Number.isFinite(r.modelScore) ||
        r.modelScore < 0 ||
        r.modelScore > 1 ||
        !['Allow', 'Verify', 'Flag'].includes(r.decision) ||
        !Array.isArray(r.reasons) ||
        r.reasons.length > 30 ||
        r.reasons.some((s) => typeof s !== 'string' || s.length > 1000) ||
        !r.timings ||
        Object.values(r.timings).some((v) => !Number.isFinite(v) || v < 0) ||
        !r.graph ||
        !Array.isArray(r.graph.cyclePath) ||
        r.graph.cyclePath.length > 8 ||
        !Array.isArray(r.graph.evidence) ||
        r.graph.evidence.length > 12
      )
        throw Error('Invalid demo assessment');
      if (!Number.isFinite(p.totalMs) || p.totalMs < 0 || !['backend', 'local'].includes(p.mode))
        throw Error('Invalid assessment mode');
    }
    if (
      ['Ready to settle', 'Verification required', 'Held for review', 'Settled'].includes(
        p.status,
      ) &&
      !p.assessment
    )
      throw Error('Missing assessment for payment state');
  }
}
document.addEventListener('click', (e) => {
  const open = e.target.closest('[data-open-guided]');
  if (open) {
    let id = open.dataset.openGuided,
      p = demoPayments.find((p) => p.id === id);
    if (!p) return notify('This guided receipt is no longer retained.');
    $('dialog').close();
    go('checkout');
    return;
  }
  const sc = e.target.closest('[data-pay-scenario]');
  if (sc && !paymentBusy) {
    checkoutScenario = sc.dataset.payScenario;
    render();
    return;
  }
  for (const [key, fn] of [
    [
      'payGraph',
      (id) => {
        let p = demoPayments.find((p) => p.id === id);
        if (p) {
          selected = p.sender;
          go('network');
        }
      },
    ],
    ['paySettle', (id) => setPaymentState(id, 'Settled')],
    ['payVerify', extraVerification],
    ['payReview', reviewPayment],
    ['payCancel', (id) => setPaymentState(id, 'Cancelled')],
    ['payTimeline', paymentTimeline],
    [
      'payRetry',
      (id) => {
        let p = demoPayments.find((p) => p.id === id);
        if (p) assessPayment(p);
      },
    ],
    [
      'payDetail',
      (id) => {
        let p = demoPayments.find((p) => p.id === id);
        if (p) {
          $('paymentResult').innerHTML = paymentReceipt(p);
          $('paymentResult').scrollIntoView({
            behavior: settings.reduced ? 'instant' : 'smooth',
            block: 'start',
          });
        }
      },
    ],
  ]) {
    let el = e.target.closest('[data-' + key.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase()) + ']');
    if (el) {
      fn(el.dataset[key]);
      return;
    }
  }
  let action = e.target.closest('[data-journey]');
  if (!action) return;
  let a = action.dataset.journey;
  if (a === 'resetswipe') {
    swipeState = { samples: [], baseline: null, deviation: null, current: null };
    render();
  }
  if (a === 'skip') {
    journey.behaviorSkipped = true;
    save();
    render();
    notify('Interaction enrollment explicitly skipped for this demo.');
  }
  if (a === 'load') runLoad();
  if (a === 'stopload') {
    loadCancelled = true;
    notify('Stopping after current in flight requests.');
  }
  if (a === 'exportload' && loadReport)
    download(
      'upi-shield-request-test.json',
      JSON.stringify(loadReport, null, 2),
      'application/json',
    );
  if (a === 'exportreceipt') {
    let p = demoPayments.find((p) => p.id === action.dataset.payment);
    if (p)
      download('upi-shield-payment-receipt.json', JSON.stringify(p, null, 2), 'application/json');
  }
});

async function init() {
  try {
    if (window.SHIELD_MODEL) model = window.SHIELD_MODEL;
    else {
      let r = await fetch('./model.json');
      if (!r.ok) throw Error('Unable to load model');
      model = await r.json();
    }
    let saved;
    try {
      saved = JSON.parse(localStorage.getItem(STORE));
      if (saved) {
        validateBackup({ format: 'UPIShield-2', ...saved });
        journey = saved.journey || journey;
        demoPayments = saved.demoPayments || [];
        demoPayments.forEach((p) => {
          if (p.status === 'Checking') {
            p.status = 'Assessment failed';
            p.timeline.push({
              status: 'Assessment failed',
              time: new Date().toISOString(),
              actor: 'reload recovery',
            });
            p.error = 'The page reloaded during assessment. Retry before proceeding.';
          }
        });
        connections = validateConnections(saved.connections);
        transactions = saved.transactions;
        cases = saved.cases;
        audit = saved.audit;
        settings = { ...settings, ...saved.settings };
        next = Math.max(1000, ...transactions.filter(t=>/^TX-\d+$/.test(t.id)).map((t) => +t.id.slice(3)));
      }
    } catch (e) {
      saved = null;
      storageBlocked = true;
      showStorageWarning(
        'Saved data could not be read. Your existing data has been preserved. Export it before resetting.',
      );
    }
    if (!saved) seed();
    syncShieldPayRecords();
    if(window.ShieldPaymentCloud){
      shieldCloud=window.ShieldPaymentCloud.create({
        onStatus:message=>{shieldSyncStatus=message;if($('shieldSync'))$('shieldSync').textContent=message;},
        onRecords:rows=>{
          sharedShieldPayments=rows.map(window.ShieldPaymentBridge.normalise).filter(Boolean);
          if(syncShieldPayRecords())render();
        }
      });
      shieldCloud.start();
    }
    document.body.classList.toggle('reduced', settings.reduced);
    view = views[location.hash.slice(1)] ? location.hash.slice(1) : 'overview';
    const paymentRef = new URLSearchParams(location.search).get('payment');
    if(view==='transactions' && paymentRef && /^PAY-[a-zA-Z0-9-]{5,80}$/.test(paymentRef)) query=paymentRef;
    $('loading').hidden = true;
    render();
  } catch (e) {
    $('loading').innerHTML =
      '<h2>Unable to load the demo model.</h2><p>Check your connection and refresh the page.</p>';
    console.error(e);
  }
}
init();

function showStorageWarning(message) {
  let el = $('storageWarning');
  el.hidden = false;
  $('storageMessage').textContent = message;
}
window.addEventListener('storage', (e) => {
  if(e.key===window.ShieldPaymentBridge?.key){if(syncShieldPayRecords())render();return;}
  if (e.key !== STORE) return;
  storageBlocked = true;
  stopBankAuto();
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  showStorageWarning(
    'Another tab changed this workspace. Saving is paused to prevent overwriting its changes. Export this session or reload.',
  );
  notify('Workspace changed in another tab. Reload before saving.');
  render();
});
window.addEventListener('focus',()=>{if(syncShieldPayRecords())render();});
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&syncShieldPayRecords())render();});
document.addEventListener('click',e=>{if(e.target.closest('[data-shieldpay-only]')){query='ShieldPay';filter='';page=0;render();}if(e.target.closest('[data-sync-payments]')){query='ShieldPay';filter='';page=0;syncShieldPayRecords();render();void shieldCloud?.poll();}});
$('reloadWorkspace').onclick = () => location.reload();
$('exportStored').onclick = () => {
  try {
    let raw = localStorage.getItem(STORE);
    if (raw) download('upi-shield-stored-recovery.json', raw, 'application/json');
    else notify('No saved workspace is available.');
  } catch (e) {
    notify(
      'Browser permissions prevent access to saved data. You can still export the current session.',
    );
  }
};
$('exportSession').onclick = () => actions.backup();
document.querySelector('.skip').onclick = (e) => {
  e.preventDefault();
  $('main').focus();
};

$('closeMenu').onclick = () => setMobileMenu(false, true);
$('menuBackdrop').onclick = () => setMobileMenu(false, true);
