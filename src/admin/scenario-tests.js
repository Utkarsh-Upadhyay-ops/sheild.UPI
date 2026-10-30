(function () {
  let results = [],
    running = false,
    busy = false,
    timer = null,
    index = 0,
    error = '',
    runType = 'mixed',
    plan = [],
    selectedScenario = 'normal';
  const C = ShieldProtection.catalog;
  function esc(v) {
    return String(v).replace(
      /[&<>"']/g,
      (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
    );
  }
  function sample(id) {
    const rule = C.find((r) => r.id === id),
      now = Date.now(),
      sender = 'auto-customer',
      receiver = 'auto-merchant',
      history = Array.from({ length: 12 }, (_, i) => ({
        sender,
        receiver,
        amount: 1000,
        timestamp: new Date(now - (i + 1) * 86400000).toISOString(),
        settled: true,
      })),
      ctx = {};
    function edge(a, b, amount = 1000, ago = 20000) {
      history.push({
        sender: a,
        receiver: b,
        amount,
        timestamp: new Date(now - ago).toISOString(),
        settled: true,
      });
    }
    if (id === 'normal') {
      for (const h of history) h.amount = Math.round(800 + Math.random() * 400);
      history.forEach((h) => (h.receiver = receiver));
    }
    if (id === 'mule') for (let i = 0; i < 5; i++) edge('incoming-' + i, sender);
    else if (id === 'ring') {
      edge(receiver, 'cycle-middle');
      edge('cycle-middle', sender);
    } else if (id === 'chain') {
      edge('origin', 'hop-a', 1000, 60000);
      edge('hop-a', 'hop-b', 1000, 40000);
      edge('hop-b', sender, 1000, 20000);
    } else if (id === 'split' || id === 'bot')
      for (let i = 0; i < (id === 'bot' ? 25 : 6); i++)
        edge(sender, receiver, 3000, 50000 - i * 1000);
    else if (rule) ctx[rule.signal] = true;
    return {
      demo: true,
      payment: {
        id: 'PAY-auto-' + now + '-' + id,
        sender,
        receiver,
        amount: id === 'normal' ? Math.round(400 + Math.random() * 1200) : 1000,
        timestamp: new Date(now).toISOString(),
        device: id === 'takeover' ? 'new' : 'familiar',
      },
      history,
      behavior: { available: false },
      protectionContext: ctx,
    };
  }
  function render() {
    return `<div class="pagetop"><div><div class="eyebrow">UPI Shield / Automated scenario protection</div><h1>Check automatically. Explain every action.</h1><p>Mixed sample traffic by default. Keep the 20 fraud checks in a separate test suite.</p></div><a class="btn" href="./pay">Payment journey</a></div><div class="alertbanner">This is an automatic demonstration engine, not background protection for other UPI apps. Bank connections and risk signals are simulated. A missing signal is shown as unavailable. A triggered check is not proof of fraud.</div><section class="card"><div class="formgrid"><label class="field">Scenario<select id="protectScenario">${C.map((r) => `<option value="${r.id}" ${selectedScenario === r.id ? 'selected' : ''}>${esc(r.name)}</option>`).join('')}<option value="normal" ${selectedScenario === 'normal' ? 'selected' : ''}>Normal sample payment</option></select></label><div><h2>${running ? 'Automatic sequence running' : 'Protection engine ready'}</h2><p class="limitnote">Mixed mode shuffles 36 normal sample payments and 4 randomly chosen suspicious scenarios. Amounts vary. Decisions come from the backend, not preset totals. The 10% suspicious sample share is for demonstration, not a real fraud rate. The separate test suite runs all 20 scenarios plus a normal control.</p></div></div><div class="actions spacer"><button class="btn primary" data-protect="start" ${running ? 'disabled' : ''}>Run mixed traffic</button><button class="btn" data-protect="suite" ${busy || running ? 'disabled' : ''}>Run 20 scenario test suite</button><button class="btn" data-protect="single" ${busy || running ? 'disabled' : ''}>Check selected scenario</button><button class="btn danger" data-protect="stop" ${running ? '' : 'disabled'}>Stop sequence</button><button class="btn" data-protect="export">Export run report</button></div><p role="status" class="limitnote">${busy ? 'Assessment in progress…' : running ? index + '/' + plan.length + ' scheduled assessments completed' : results.length + ' assessments retained in this tab'}</p>${error ? `<p role="alert">${esc(error)}</p>` : ''}</section><div class="alertbanner"><b>${runType === 'suite' ? 'Scenario test suite' : runType === 'single' ? 'Single scenario check' : 'Mixed sample traffic'}</b> · These totals describe this run, not detection accuracy. Normal samples can still need verification if a policy triggers.</div><div class="stats spacer">${[
      ['Assessed', results.length],
      ['Held', results.filter((r) => r.decision === 'Flag').length],
      ['Extra verification', results.filter((r) => r.decision === 'Verify').length],
      ['Allowed', results.filter((r) => r.decision === 'Allow').length],
    ]
      .map(([l, v]) => `<div class="stat"><small>${l}</small><strong>${v}</strong></div>`)
      .join('')}</div><section class="card"><h2>Automatic decisions</h2><div aria-live="polite">${
      results
        .slice()
        .reverse()
        .map(
          (r) =>
            `<article class="timelineitem"><b>${esc(r.name)} · ${r.decision === 'Flag' ? 'Hold' : r.decision === 'Verify' ? 'Additional verification' : 'Allow'}</b><span>${esc(r.sampleType)} · ₹${r.amount.toLocaleString('en-IN')} · ${esc(r.mode)} · ${r.ms.toFixed(1)} ms execution · ${r.triggered.length} protection checks triggered</span>${r.triggered.map((t) => `<p class="limitnote">${esc(t.reason)}</p>`).join('')}${!r.triggered.length ? '<p class="limitnote">No protection rule triggered. Other model or policy decisions may still require review.</p>' : ''}<details><summary>Inspect available and missing signals</summary>${r.checks.map((c) => `<div class="detailrow"><span>${esc(c.name)}<small class="muted"> · ${esc(c.requires)}</small></span><b>${esc(c.status)}</b></div>`).join('')}</details></article>`,
        )
        .join('') || '<p class="empty">Start the sequence to watch automatic decisions appear.</p>'
    }</div></section><section class="card spacer"><h2>Scenario signal requirements</h2>${[
      'Transaction and graph signals',
      'Trusted device, bank or session signals',
      'Reports and external verification',
    ]
      .map(
        (category) =>
          `<h3>${category}</h3><p class="limitnote">${C.filter((r) => r.category === category)
            .map((r) => esc(r.name))
            .join(', ')}</p>`,
      )
      .join(
        '',
      )}</section><section class="card spacer"><h2>What the engine can and cannot observe</h2><p class="limitnote">Transaction graph, recent aggregate value and attempt velocity are calculated from supplied sample history. QR intent, support verification, coercion, SIM changes, remote access and app integrity require external signals; this demo injects them deliberately. The website does not scan your phone, calls, SMS, installed apps or other payment applications.</p><p class="limitnote">Holds prevent automatic progression in the simulator. Use Payment check for the explicit verification, investigator review and simulated settlement workflow. An assessment here does not create a bank transaction.</p></section>`;
  }
  function refresh() {
    if (location.hash === '#protection') document.getElementById('content').innerHTML = render();
  }
  async function assess(id) {
    if (busy) return;
    busy = true;
    error = '';
    refresh();
    const body = sample(id),
      start = performance.now();
    try {
      let data, mode;
      if (window.SHIELD_MODEL) {
        data = ShieldPipeline.assess(window.SHIELD_MODEL, body);
        let p = ShieldProtection.evaluate(body, data);
        data.protection = p;
        if (p.decision === 'Flag' || (p.decision === 'Verify' && data.decision === 'Allow'))
          data.decision = p.decision;
        mode = 'Local offline policy + RF';
      } else {
        let response = await fetch('/api/assess', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(10000),
        });
        if (!response.ok) throw Error('Assessment failed: HTTP ' + response.status);
        data = await response.json();
        if (!data.protection)
          throw Error('Protection backend unavailable. Refresh after deployment.');
        mode = 'Backend model + protection policies';
      }
      results.push({
        id: data.paymentId,
        name: C.find((r) => r.id === id)?.name || 'Normal sample payment',
        sampleType: id === 'normal' ? 'Normal sample' : 'Injected suspicious scenario',
        amount: body.payment.amount,
        decision: data.decision,
        triggered: data.protection.triggered,
        checks: data.protection.checks,
        ms: performance.now() - start,
        mode,
        time: new Date().toISOString(),
      });
      results = results.slice(-100);
    } catch (e) {
      error = e.message;
      stop();
    } finally {
      busy = false;
      refresh();
    }
  }
  function stop() {
    running = false;
    clearTimeout(timer);
    timer = null;
  }
  function makePlan(type) {
    if (type === 'suite') return [...C.map((r) => r.id), 'normal'];
    let ids = Array(36).fill('normal');
    for (let i = 0; i < 4; i++) ids.push(C[Math.floor(Math.random() * C.length)].id);
    for (let i = ids.length - 1; i > 0; i--) {
      let j = Math.floor(Math.random() * (i + 1));
      [ids[i], ids[j]] = [ids[j], ids[i]];
    }
    return ids;
  }
  function start(type) {
    if (busy || running) return;
    runType = type;
    plan = makePlan(type);
    index = 0;
    results = [];
    error = '';
    running = true;
    step();
  }
  async function step() {
    if (!running) return;
    await assess(plan[index]);
    index++;
    if (index >= plan.length || !running) {
      stop();
      refresh();
      return;
    }
    timer = setTimeout(step, 400);
  }
  window.renderAutoProtection = render;
  window.ShieldProtectionSample = sample;
  window.ShieldProtectionPlan = makePlan;
  document.addEventListener('change', (e) => {
    if (e.target.id === 'protectScenario') selectedScenario = e.target.value;
  });
  document.addEventListener('click', (e) => {
    let a = e.target.closest('[data-protect]')?.dataset.protect;
    if (!a) return;
    if (a === 'start') start('mixed');
    if (a === 'suite') start('suite');
    if (a === 'stop') {
      stop();
      refresh();
    }
    if (a === 'single' && !running && !busy) {
      runType = 'single';
      results = [];
      plan = [selectedScenario];
      index = 0;
      assess(selectedScenario);
    }
    if (a === 'export') {
      const blob = new Blob(
          [
            JSON.stringify(
              {
                scope: 'Synthetic samples, not production accuracy evaluation',
                runType,
                planned: plan.length,
                completed: results.length,
                results,
              },
              null,
              2,
            ),
          ],
          { type: 'application/json' },
        ),
        url = URL.createObjectURL(blob),
        link = document.createElement('a');
      link.href = url;
      link.download = 'upi-shield-protection-run.json';
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  });
  window.addEventListener('hashchange', () => {
    if (location.hash !== '#protection') stop();
  });
})();
