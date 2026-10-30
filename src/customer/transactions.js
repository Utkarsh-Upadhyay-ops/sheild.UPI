let lastCustomerRoute = null;
/* ShieldPay now reads and changes the shared server ledger. Old local data is preserved but not imported. */
const customerShared = new ShieldSharedClient('customer');
let sharedRetry = null;
let sharedReady = false,
  sharedLast = 0;
const oldPayRender = render;
save = () => {};
function fromShared(p) {
  return {
    ...p,
    time: p.timestamp,
    status:
      {
        'Pending assessment': 'Checking',
        Allowed: 'Ready',
        'Verification required': 'Verify',
        'Held for review': 'Held',
        'Assessment failed': 'Failed',
      }[p.status] || p.status,
    requestMs: Number.isFinite(p.clientRequestMs) ? p.clientRequestMs : null,
  };
}
function sharedApply(data, error) {
  if (error) {
    sharedReady = false;
    const connection = document.querySelector('.shared-connection');
    if (connection)
      connection.textContent =
        'Shared service unavailable. No settlement will be attempted. ' + error.message;
    if (document.activeElement?.closest?.('form') || pinSession) return;
    render();
    return;
  }
  if (!data) return;
  sharedReady = true;
  sharedLast = Date.now();
  state = {
    banks: data.account.banks,
    payments: data.payments.map(fromShared),
    dismissed: state.dismissed || [],
  };
  storageError = false;
  const focused = document.activeElement?.closest?.('form');
  if (!busy && !pinSession && !focused && !$('modal').open) render();
}
customerShared.onchange = sharedApply;
render = function () {
  if (route() === 'requests') location.replace('#security');
  oldPayRender();
  if (!sharedReady && !customerShared.data) {
    $('app').innerHTML =
      '<section class="card"><h1>' +
      (customerShared.error ? 'Shared service unavailable' : 'Opening your shared workspace') +
      '</h1><p>' +
      (customerShared.error
        ? esc(customerShared.error.message)
        : 'Loading your saved sample accounts and payment history…') +
      '</p>' +
      (customerShared.error
        ? '<button class="btn primary" id="sharedReconnect">Try again</button>'
        : '<span class="spin" aria-label="Loading saved workspace"></span>') +
      '</section>';
    const retry = $('sharedReconnect');
    if (retry)
      retry.onclick = async () => {
        retry.disabled = true;
        try {
          await customerShared.start();
        } catch (e) {
          customerShared.error = e;
          render();
        }
      };
  }
  if (route() === 'security' && customerShared.data)
    $('app').innerHTML =
      '<div class="eyebrow">Security notifications</div><h1>Your payment safety updates</h1><section class="card">' +
      state.payments
        .filter((p) => p.assessment?.decision !== 'Allow' && p.assessment)
        .slice()
        .reverse()
        .map(
          (p) =>
            '<button class="row" style="width:100%;background:none;border:0;text-align:left" data-receipt="' +
            esc(p.id) +
            '"><div><b>' +
            esc(p.recipientName) +
            ' · ' +
            money(p.amount) +
            '</b><small>' +
            esc(p.status) +
            '</small></div><span>View evidence →</span></button>',
        )
        .join('') +
      (state.payments.some((p) => p.assessment && p.assessment.decision !== 'Allow')
        ? ''
        : '<p class="hint">No security notifications. Verification requests and held payment updates will appear here.</p>') +
      '</section>';
  const currentRoute = route();
  const viewShell = document.createElement('div');
  viewShell.className =
    'customer-view' + (lastCustomerRoute !== currentRoute ? ' route-enter' : '');
  lastCustomerRoute = currentRoute;
  while ($('app').firstChild) viewShell.appendChild($('app').firstChild);
  $('app').appendChild(viewShell);
  const requestsLink = $('bottom').querySelector('a[href="#requests"]');
  if (requestsLink) {
    requestsLink.href = '#security';
    requestsLink.innerHTML = '<span>◉</span>Alerts';
    requestsLink.classList.toggle('active', route() === 'security');
  }
  const banner = document.createElement('div');
  banner.className = 'banner shared-connection';
  banner.setAttribute('role', 'status');
  banner.textContent = sharedReady
    ? 'Connected to the shared transaction ledger · Simulated funds · Updates every 1.5 seconds'
    : customerShared.error
      ? 'Shared service unavailable: ' + customerShared.error.message + ' Payments are disabled.'
      : 'Connecting to the shared transaction service…';
  $('app').prepend(banner);
  if (route() === 'receipt') {
    const p = state.payments.find((p) => p.id === selectedPayment) || state.payments.at(-1),
      canonical = customerShared.data?.payments.find((x) => x.id === p?.id);
    if (p && canonical) {
      const evidence = document.createElement('p');
      evidence.className = 'banner';
      evidence.textContent =
        'Payment state: ' +
        canonical.status +
        ' · ' +
        (p.behavior?.available
          ? 'Experimental interaction comparison available'
          : 'Behavioral Data Unavailable');
      $('app').append(evidence);
    }
  }
};
connect = function (id) {
  if (!sharedReady) return toast('Wait for the shared service connection.');
  const bank = banks.find((b) => b.id === id);
  if (!bank) return;
  modal(
    `<h2 style="padding-top:50px">Connect ${bank.name}</h2><p class="hint">Sample consent and generated account history are saved to the shared service. No real bank connection is made.</p><label class="check"><input type="checkbox" id="consent">Use sample account history for fraud assessment.</label><label class="field">Displayed verification code: 123456<input id="bankCode" inputmode="numeric" maxlength="6" autocomplete="off"></label><button class="btn primary full" id="connectConfirm">Verify sample account</button><p id="connectError" class="hint" role="status"></p>`,
  );
  $('connectConfirm').onclick = async () => {
    if (!$('consent').checked || $('bankCode').value !== '123456')
      return ($('connectError').textContent = 'Accept consent and use code 123456.');
    $('connectConfirm').disabled = true;
    try {
      await customerShared.api({ action: 'connect', bank: id, consent: true, code: '123456' });
      await customerShared.pull(true);
      $('modal').close();
      render();
      toast('Shared sample account connected.');
    } catch (e) {
      $('connectError').textContent = e.message;
      $('connectConfirm').disabled = false;
    }
  };
};
submit = async function (bank) {
  if (busy || !sharedReady)
    return toast('Shared service unavailable or assessment already running.');
  if (!Number.isFinite(amount) || amount < 1 || amount > 100000)
    return toast('Enter a valid amount.');
  busy = true;
  const button = document.querySelector('#sendForm button[type=submit]');
  if (button) {
    button.disabled = true;
    button.innerHTML = '<span class="spin"></span> Assessing pending payment…';
  }
  const c = contact(),
    behavior = window.ShieldPayBehavior?.comparison?.() || undefined,
    intent = JSON.stringify({
      bank,
      amount,
      receiver: c.id,
      scenario,
      requestType,
      note,
      behavior,
    });
  if (sharedRetry?.intent !== intent) sharedRetry = { intent, key: crypto.randomUUID() };
  const key = sharedRetry.key;
  let p;
  try {
    const response = await customerShared.api({
      action: 'create',
      key,
      bank,
      amount,
      receiver: 'pay-' + c.id,
      recipientName: c.name,
      upi: c.upi,
      note,
      scenario: scenario === 'device' ? 'device' : scenario,
      requestType,
      behavior,
    });
    p = response.data.payment;
    sharedRetry = null;
    selectedPayment = p.id;
    await customerShared.api({ action: 'clientTiming', id: p.id, ms: response.ms }).catch(() => {});
    await customerShared.pull(true);
    location.hash = 'receipt';
  } catch (e) {
    toast(e.message + ' No local settlement will be attempted.');
  } finally {
    busy = false;
    requestType = null;
    render();
  }
};
confirmDemoPin = async function () {
  const s = pinSession;
  if (!s || s.count !== 6 || s.processing || !sharedReady) return;
  s.processing = true;
  updatePin();
  $('pinError').textContent = 'Confirming with the shared ledger…';
  try {
    await customerShared.api({
      action: s.verification ? 'verify' : 'settle',
      id: s.id,
      code: '123456',
    });
    await customerShared.pull(true);
    if (pinSession === s) {
      closePin();
      render();
    }
  } catch (e) {
    if (pinSession === s) {
      s.processing = false;
      $('pinError').textContent = e.message;
      updatePin();
    }
    await customerShared.pull(true);
  }
};
review = function () {
  modal(
    '<h2 style="padding-top:50px">Investigator access required</h2><p class="hint">Review decisions are protected by the shared backend. Sign in on the command center to inspect evidence and record a release or cancellation.</p><a class="btn primary full" href="./#cases">Open investigations</a>',
  );
};
document.addEventListener(
  'click',
  async (e) => {
    const el = e.target.closest(
      '[data-cancel],[data-act],[data-route],[data-contact],[data-connect],[data-scenario],[data-authorise],[data-verify],[data-review],[data-request]',
    );
    if (!el) return;
    if (el.dataset.act === 'close') return;
    if (!sharedReady) {
      e.preventDefault();
      e.stopImmediatePropagation();
      toast('The shared backend must be connected before continuing.');
      return;
    }
    if (el.dataset.cancel) {
      e.preventDefault();
      e.stopImmediatePropagation();
      try {
        await customerShared.api({ action: 'cancel', id: el.dataset.cancel });
        await customerShared.pull(true);
        render();
      } catch (err) {
        toast(err.message);
      }
    }
  },
  true,
);
state = { banks: {}, payments: [], dismissed: [] };
render();
customerShared.start().catch((e) => {
  customerShared.error = e;
  render();
});
