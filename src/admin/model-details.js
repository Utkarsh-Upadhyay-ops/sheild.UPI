/* Integrated research workbench. No real bank or device claims. */
(function () {
  let asset = null,
    result = null,
    error = '',
    busy = false,
    feedback = [],
    events = [],
    loop = null,
    scenario = 'normal',
    metadataLoading = false;
  try {
    feedback = JSON.parse(localStorage.getItem('shield-feedback-v1') || '[]')
      .filter((x) => x && ['fraud', 'legitimate'].includes(x.label) && Number.isFinite(x.score))
      .slice(-500);
  } catch {}
  const features = [
    ['ML scoring', 'Trained Random Forest with separate synthetic calibration', 'model'],
    [
      'Fraud networks',
      'Trained mean aggregation graph model plus deterministic cycle and fan-in evidence',
      'network',
    ],
    [
      'Interaction checks',
      'Measured typing and swipe experiments; optional enrollment',
      'behavior',
    ],
    [
      'Payment controls',
      'Approve, verify, hold, release, cancel and explicit simulated settlement',
      'checkout',
    ],
    [
      'Anomaly detection',
      'Trained 80 tree Isolation Forest runs alongside supervised scoring',
      'intelligence',
    ],
    [
      'Device intelligence',
      'New device and shared device checks using synthetic session context',
      'intelligence',
    ],
    [
      'Travel and time',
      'Haversine distance, travel speed and India time checks on supplied sample events',
      'intelligence',
    ],
    [
      'Investigation dashboard',
      'Transaction history, cases, account graph and evidence',
      'overview',
    ],
    [
      'Live alerts',
      'In app event feed while the simulator is running; no push delivery',
      'intelligence',
    ],
    [
      'Explainability',
      'Reference feature comparisons and explicit policy evidence, not SHAP',
      'checkout',
    ],
    [
      'Adaptive learning',
      'Label outcomes, export feedback and inspect threshold recommendations; retraining remains an offline release step',
      'intelligence',
    ],
    [
      'Multiple layers',
      'RF, anomaly, graph, recipient, device and interaction signals drive a risk decision',
      'intelligence',
    ],
    [
      'Latency architecture',
      'Separate model and total request timings, bounded graph traversal and request test',
      'performance',
    ],
    [
      'Recipient risk',
      'Graph exposure, observed age and unfamiliar recipient index; not a trusted reputation service',
      'intelligence',
    ],
    [
      'Simulation lab',
      'Repeatable normal, ring, device and impossible travel scenarios',
      'intelligence',
    ],
  ];
  function html(s) {
    return String(s).replace(
      /[&<>"']/g,
      (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
    );
  }
  function driftReport(f) {
    if (f.length < 50) return 'Distribution shift: insufficient data (50 labels required).';
    let ref = [0.9, 0.06, 0.03, 0.01],
      counts = [0, 0, 0, 0];
    for (let x of f) counts[x.score < 0.2 ? 0 : x.score < 0.4 ? 1 : x.score < 0.65 ? 2 : 3]++;
    let psi = counts.reduce((a, n, i) => {
      let p = (n + 1) / (f.length + 4);
      return a + (p - ref[i]) * Math.log(p / ref[i]);
    }, 0);
    return (
      'Population stability index ' +
      psi.toFixed(3) +
      ' against an illustrative synthetic reference. This is a distribution warning, not proof of fraud drift.'
    );
  }
  function loadGraphMetadata() {
    if (asset || metadataLoading) return;
    if (window.SHIELD_INTELLIGENCE_MODEL) {
      asset = window.SHIELD_INTELLIGENCE_MODEL.graph;
      return;
    }
    metadataLoading = true;
    fetch('./intelligence-model.json')
      .then((r) => {
        if (!r.ok) throw Error('Model metadata unavailable');
        return r.json();
      })
      .then((m) => {
        asset = m.graph;
        refresh();
      })
      .catch(() => {})
      .finally(() => {
        metadataLoading = false;
      });
  }
  function graphPanel() {
    let g = asset,
      r = result?.intelligence.graphModel;
    let nodes = r?.accounts || [],
      links = r?.links || [],
      positions = new Map(
        nodes.map((n, i) => [
          n.id,
          {
            x: 250 + 185 * Math.cos((2 * Math.PI * i) / nodes.length),
            y: 170 + 125 * Math.sin((2 * Math.PI * i) / nodes.length),
          },
        ]),
      );
    return `<section class="card spacer"><div class="cardhead"><h2>Graph neural network evidence</h2><span class="tag">Trained message passing model</span></div><p class="limitnote">Each account receives its own incoming and outgoing connection features plus the mean features of neighboring accounts. Learned weights produce a node risk score. Edges below represent settled sample transfers in the preceding 120 seconds; the pending payment has not settled.</p>${
      r
        ? `<div class="grid equal"><div><svg class="gnn-evidence" viewBox="0 0 500 350" role="img" aria-label="Account relationships with graph model risk scores"><defs><marker id="gnnarrow" markerWidth="6" markerHeight="6" refX="20" refY="3" orient="auto"><path d="M0 0L6 3L0 6" fill="#76a98b"/></marker></defs>${links
            .map((e) => {
              let a = positions.get(e.sender),
                b = positions.get(e.receiver);
              return a && b
                ? `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="#9cc6ac" stroke-width="1.5" marker-end="url(#gnnarrow)"/>`
                : '';
            })
            .join('')}${nodes
            .map((n) => {
              let p = positions.get(n.id);
              return `<g><title>${html(n.id)}: ${(n.risk * 100).toFixed(1)} risk index</title><circle cx="${p.x}" cy="${p.y}" r="20" fill="${n.risk >= (r.reviewThreshold || 0.85) ? '#fff0df' : '#e8f5ed'}" stroke="${n.id === r.senderId ? '#173d5d' : '#55a47a'}" stroke-width="2"/><text x="${p.x}" y="${p.y + 4}" text-anchor="middle" font-size="11" fill="#244c3a">${(n.risk * 100).toFixed(0)}</text><text x="${p.x}" y="${p.y + 34}" text-anchor="middle" font-size="9" fill="#244c3a">${html(n.id.length > 18 ? n.id.slice(0, 15) + '…' : n.id)}</text></g>`;
            })
            .join(
              '',
            )}</svg><p class="limitnote">${r.nodes} nodes and ${r.edges} transfers assessed. Drawing shows up to 12 highest scoring accounts and 120 edges. An isolated node is not evidence of fraud. Node scores are not calibrated probabilities.</p></div><div>${nodes.map((n) => `<div class="detailrow"><span>${html(n.id)}</span><b>${(n.risk * 100).toFixed(1)} / 100</b></div>`).join('')}</div></div>`
        : '<p class="limitnote">Run the mule network scenario to populate the graph and node scores.</p>'
    }${g ? `<h3>Independent graph evaluation</h3><div class="profilegrid"><div><small>Training graphs</small><b>${g.trainingGraphs}</b></div><div><small>Validation graphs</small><b>${g.validationGraphs}</b></div><div><small>Held out test graphs</small><b>${g.testGraphs}</b></div></div><div class="detailrow"><span>Validation selected review threshold</span><b>${(g.reviewThreshold * 100).toFixed(1)} / 100</b></div><div class="detailrow"><span>Test precision / recall</span><b>${(g.precision * 100).toFixed(1)}% / ${(g.recall * 100).toFixed(1)}%</b></div><div class="detailrow"><span>Test average precision</span><b>${(g.averagePrecision * 100).toFixed(1)}%</b></div><div class="detailrow"><span>True positives / false positives</span><b>${g.confusion.tp} / ${g.confusion.fp}</b></div><div class="detailrow"><span>Missed fraud nodes / true negatives</span><b>${g.confusion.fn} / ${g.confusion.tn}</b></div><p class="limitnote">Validation selects the threshold; the test set is used for reporting only. Separate generated graphs prevent the same graph appearing in multiple splits. Precision improves at the cost of recall: the model misses many synthetic fraud nodes. Graph rules and other signals remain necessary. Real bank data and independent external evaluation are pending.</p>` : '<p class="limitnote">Loading graph model evaluation…</p>'}</section>`;
  }
  function render() {
    loadGraphMetadata();
    const f = feedback,
      known = f.filter((x) => x.label === 'fraud'),
      good = f.filter((x) => x.label === 'legitimate');
    let report = result;
    return `<div class="pagetop"><div><div class="eyebrow">UPI Shield / Integrated research platform</div><h1>Every signal. One decision.</h1><p>Run connected fraud scenarios and inspect real model outputs. Banking and session context are simulated.</p></div><a class="btn primary" href="./pay">Open payment journey</a></div><div class="alertbanner">Graph neural model and Isolation Forest are trained on generated data. The graph model threshold is selected using a separate validation set. Test precision and missed fraud are reported below. It can request verification, not block on its own. Weighted risk is an index, not a calibrated probability. No real device fingerprint or bank access is collected.</div><div class="simlayout"><section class="card"><h2>Run a layered assessment</h2><p class="limitnote">Generated history and a synthetic session are sent to the backend. No personal location is requested.</p><label class="field">Scenario<select id="intelScenario">${[
      ['normal', 'Everyday payment'],
      ['ring', 'Mule fan in network'],
      ['device', 'Shared device takeover'],
      ['travel', 'Impossible travel'],
    ]
      .map(([v, l]) => `<option value="${v}" ${scenario === v ? 'selected' : ''}>${l}</option>`)
      .join(
        '',
      )}</select></label><div class="actions spacer"><button class="btn primary" data-intel="run" ${busy ? 'disabled' : ''}>${busy ? 'Checking…' : 'Run assessment'}</button><button class="btn" data-intel="stream">${loop ? 'Stop live simulator' : 'Start live simulator'}</button></div><p class="limitnote">The live simulator submits one synthetic request every three seconds while this page remains open. It stops on navigation.</p>${error ? `<p role="alert">${html(error)}</p>` : ''}<div class="spacer"><h2>Live alerts</h2><div aria-live="polite">${
      events
        .slice(-6)
        .reverse()
        .map(
          (e) =>
            `<div class="audit"><b>${html(e.decision)}</b> · ${html(e.scenario)}<small>${html(e.time)} · ${e.ms.toFixed(1)} ms execution</small></div>`,
        )
        .join('') || '<p class="limitnote">Run a scenario to see its alert.</p>'
    }</div></div></section><section class="card"><h2>Unified assessment evidence</h2>${
      report
        ? `<div class="statebanner">${html(report.decision)} before simulated settlement</div><p class="limitnote">${html(report.executionMode)}</p><div class="detailrow"><span>Calibrated synthetic RF probability</span><b>${(report.modelScore * 100).toFixed(2)}%</b></div>${Object.entries(
            {
              'Weighted risk index': report.intelligence.combinedRisk,
              'Graph sender risk': report.intelligence.graphModel.sender,
              'Graph recipient risk': report.intelligence.graphModel.recipient,
              'Isolation Forest anomaly': report.intelligence.anomalyScore,
              'Recipient risk index': report.intelligence.recipientRisk,
            },
          )
            .map(
              ([k, v]) =>
                `<div class="detailrow"><span>${k}</span><b>${(v * 100).toFixed(1)} / 100</b></div>`,
            )
            .join(
              '',
            )}<div class="detailrow"><span>Execution / model scoring</span><b>${report.requestMs.toFixed(1)} / ${report.timings.scoringMs.toFixed(2)} ms</b></div><div class="detailrow"><span>Device accounts</span><b>${report.intelligence.device.accountsOnDevice}</b></div><div class="detailrow"><span>Impossible travel</span><b>${report.intelligence.geo.available ? (report.intelligence.geo.impossibleTravel ? 'Detected' : 'No') : 'Unavailable'}</b></div><ul class="paymentreasons">${report.reasons.map((r) => `<li>${html(r)}</li>`).join('')}</ul><div class="actions"><button class="btn" data-intel="fraud">Label confirmed fraud</button><button class="btn" data-intel="legitimate">Label legitimate</button><button class="btn" data-intel="receipt">Export evidence</button></div><p class="limitnote">Labels are review feedback stored on this device, not verified bank outcomes. These test calls assess risk; use Payment check for settlement controls.</p>`
        : '<p class="empty">Choose a scenario and run an assessment.</p>'
    }</section></div>${graphPanel()}<section class="card spacer"><h2>Feedback evaluation and distribution shift</h2><p class="limitnote">${f.length} labelled assessments, ${known.length} fraud and ${good.length} legitimate. Feedback never silently changes the deployed model. Export it for review and offline retraining. Small synthetic samples cannot establish model drift. ${driftReport(f)}</p>${[
      0.2, 0.4, 0.65, 0.8,
    ]
      .map((t) => {
        let tp = known.filter((x) => x.score >= t).length,
          fp = good.filter((x) => x.score >= t).length;
        return `<div class="detailrow"><span>Threshold ${t}: labelled precision / recall</span><b>${tp + fp ? ((100 * tp) / (tp + fp)).toFixed(0) + '%' : 'Unknown'} / ${known.length ? ((100 * tp) / known.length).toFixed(0) + '%' : 'Unknown'}</b></div>`;
      })
      .join(
        '',
      )}<button class="btn spacer" data-intel="feedback">Export labelled feedback</button></section><section class="card spacer"><h2>All 15 capabilities</h2><p class="limitnote">These descriptions state what is implemented and its practical boundary. Additional frameworks are not required merely to display their names.</p><div class="guidecards spacer">${features.map(([name, desc, route], i) => `<article class="howstep"><div class="eyebrow">${String(i + 1).padStart(2, '0')}</div><h3>${name}</h3><p>${desc}</p><a class="btn tiny" href="#${route}">Explore capability</a></article>`).join('')}</div></section><section class="card spacer"><h2>Connected architecture</h2><p class="limitnote">Payment request → sample feature collection → Random Forest + graph message passing + Isolation Forest + behavior + device/travel → policy decision → payment verification or investigator review → explicit simulated settlement → audit evidence.</p><p class="limitnote">Not yet provisioned: central database, protected customer and investigator identities, trusted bank events, production streaming infrastructure, push delivery, automatic model deployment or a production latency guarantee.</p></section>`;
  }
  async function run() {
    if (busy) return;
    scenario = document.getElementById('intelScenario')?.value || scenario;
    busy = true;
    error = '';
    refresh();
    const now = Date.now(),
      sender = 'research-sender',
      receiver = 'research-merchant',
      history = Array.from({ length: 10 }, (_, i) => ({
        sender,
        receiver,
        amount: 650 + i * 12,
        timestamp: new Date(now - (i + 1) * 86400000).toISOString(),
        settled: true,
      }));
    if (scenario === 'ring')
      for (let i = 0; i < 5; i++)
        history.push({
          sender: 'victim-' + i,
          receiver: sender,
          amount: 4000,
          timestamp: new Date(now - 60000 + i * 1000).toISOString(),
        });
    const session = {
        accountsOnDevice: scenario === 'device' ? ['a', 'b', 'c', 'd', 'e'] : ['a'],
        locations:
          scenario === 'travel'
            ? [
                { lat: 28.61, lon: 77.2, time: new Date(now - 600000).toISOString() },
                { lat: 19.07, lon: 72.87, time: new Date(now).toISOString() },
              ]
            : [],
      },
      body = {
        demo: true,
        payment: {
          id: 'PAY-research-' + now,
          sender,
          receiver,
          amount: scenario === 'normal' ? 700 : 18000,
          timestamp: new Date().toISOString(),
          device: scenario === 'device' ? 'new' : 'familiar',
        },
        history,
        behavior: { available: false },
        session,
      };
    const start = performance.now();
    try {
      if (window.SHIELD_MODEL) {
        if (!window.SHIELD_INTELLIGENCE_MODEL)
          throw Error('Research models are unavailable in this offline copy.');
        let base = ShieldPipeline.assess(window.SHIELD_MODEL, body),
          layers = ShieldIntelligence.assess(window.SHIELD_INTELLIGENCE_MODEL, body, base);
        base.timings.scoringMs += layers.scoringMs;
        result = {
          ...base,
          intelligence: layers,
          decision: layers.decision,
          reasons: [...base.reasons, ...layers.reasons],
          executionMode: 'Local offline inference',
        };
      } else {
        let r = await fetch('/api/assess', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(10000),
        });
        if (!r.ok) throw Error('Assessment service returned ' + r.status);
        result = await r.json();
        if (!result.intelligence) throw Error('Updated intelligence service is not available yet.');
      }
      result.executionMode = result.executionMode || 'Backend request including network';
      result.requestMs = performance.now() - start;
      events.push({
        decision: result.decision,
        scenario,
        time: new Date().toLocaleTimeString(),
        ms: result.requestMs,
      });
      events = events.slice(-50);
    } catch (e) {
      error = e.message;
    } finally {
      busy = false;
      refresh();
    }
  }
  function refresh() {
    if (location.hash === '#intelligence') {
      let el = document.getElementById('content');
      if (el) el.innerHTML = render();
    }
  }
  function download(name, data) {
    let a = document.createElement('a'),
      url = URL.createObjectURL(
        new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }),
      );
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  window.renderIntelligenceCentre = render;
  document.addEventListener('click', (e) => {
    let a = e.target.closest('[data-intel]')?.dataset.intel;
    if (!a) return;
    if (a === 'run') run();
    if (a === 'stream') {
      if (loop) {
        clearInterval(loop);
        loop = null;
      } else {
        run();
        loop = setInterval(run, 3000);
      }
      refresh();
    }
    if (['fraud', 'legitimate'].includes(a) && result) {
      let entry = {
        id: result.paymentId,
        score: result.modelScore,
        label: a,
        time: new Date().toISOString(),
        model: result.modelVersion,
        signals: result.signals,
      };
      feedback = feedback.filter((f) => f.id !== entry.id);
      feedback.push(entry);
      feedback = feedback.slice(-500);
      try {
        localStorage.setItem('shield-feedback-v1', JSON.stringify(feedback));
      } catch {
        error = 'Feedback could not be saved. Export before closing.';
      }
      refresh();
    }
    if (a === 'feedback')
      download('shield-feedback.json', { format: 'shield-feedback-v1', records: feedback });
    if (a === 'receipt' && result) download('shield-intelligence-evidence.json', result);
  });
  window.addEventListener('hashchange', () => {
    if (location.hash !== '#intelligence' && loop) {
      clearInterval(loop);
      loop = null;
    }
  });
})();
