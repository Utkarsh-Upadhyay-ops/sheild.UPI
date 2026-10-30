(function () {
  const client = new ShieldSharedClient('investigator');
  let overviewBusy = false,
    overviewLoadError = '';
  let publishedPerformance = null,
    publishedPerformancePending = false;
  let anomalyReport = null,
    anomalyPending = false;
  let temporalReport = null,
    temporalPending = false;
  let candidateReport = null,
    candidatePending = false;
  let graphReport = null,
    graphReportPending = false;
  let graphSource = 'auto',
    graphExamples = null,
    graphExamplesLoading = false,
    graphExamplesError = '',
    graphExampleIndex = 0;
  let selected = null,
    nodeId = null,
    tab = 'overview',
    speed = 1500,
    simulation = null,
    simBusy = false,
    simCount = 0,
    bench = null,
    benchRunning = false,
    benchStop = false;
  const h = (v) =>
      String(v ?? '').replace(
        /[&<>"']/g,
        (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
      ),
    money = (n) => '₹' + Number(n).toLocaleString('en-IN'),
    ms = (n) => (Number.isFinite(n) ? n.toFixed(2) + ' ms' : 'Unavailable');
  const accountName = (value) => {
    const names = (window.ShieldAccountNames ||= new Map());
    const id = String(value ?? '');
    if (!id) return 'Unknown person';
    if (!names.has(id)) names.set(id, names.size + 1);
    return 'Person ' + names.get(id);
  };
  const payments = () => client.data?.payments || [];
  function head(title, sub) {
    return `<div class="pagetop"><div><div class="eyebrow">UPI Shield / Command center</div><h1>${title}</h1><p>${sub}</p></div><div class="actions"><button class="btn" data-shared="guide">Payment walkthrough</button><a class="btn primary" href="./pay">Open ShieldPay</a></div></div>`;
  }
  function loadingWorkspace() {
    return `<section class="card"><div class="eyebrow">UPI Shield / Command center</div><h1>${client.error ? 'Workspace unavailable' : 'Opening command center…'}</h1><p class="limitnote" role="status">${h(client.error?.message || 'Loading shared transactions and fraud analysis.')}</p>${client.error ? '<button class="btn primary spacer" data-shared="retryWorkspace">Try again</button>' : ''}<a href="./pay" class="btn spacer">Open customer payments</a></section>`;
  }
  function rows(list) {
    const term = (typeof query === 'string' ? query : '').trim().toLowerCase();
    if (term)
      list = list.filter((p) =>
        [p.id, p.sender, p.receiver, p.recipientName, p.source, p.status].some((v) =>
          String(v).toLowerCase().includes(term),
        ) || [p.sender, p.receiver].some((v) => accountName(v).toLowerCase().includes(term)),
      );
    return `<div class="shared-feed">${
      list
        .slice()
        .reverse()
        .slice(0, 80)
        .map(
          (p) =>
            `<button class="paymenthistory" data-shared-payment="${p.id}"><span>${h(p.recipientName)} · ${money(p.amount)}<small>${h(p.id)} · ${h(p.source === 'overview-sample' ? 'Overview sample' : p.source)} · ${new Date(p.timestamp).toLocaleTimeString('en-IN')}</small></span><b>${h(p.status)}<small>${p.assessment ? 'RF ' + (p.assessment.modelScore * 100).toFixed(1) + ' / 100' : 'Pending'} · ${p.source === 'overview-sample' ? 'Model ' + ms(p.assessment?.timings?.scoringMs) : 'API ' + ms(p.clientRequestMs)}</small></b></button>`,
        )
        .join('') ||
      '<p class="empty">No shared transactions yet. Initiate a payment in ShieldPay or start the simulator.</p>'
    }</div>`;
  }
  function metrics() {
    const all = payments(),
      assessed = all.filter((p) => p.assessment);
    return `<div class="stats">${[
      ['Total assessed', assessed.length],
      ['Allowed decisions', assessed.filter((p) => p.assessment.decision === 'Allow').length],
      ['Verification requests', assessed.filter((p) => p.assessment.decision === 'Verify').length],
      ['High risk decisions', assessed.filter((p) => p.assessment.decision === 'Flag').length],
      ['Currently held', all.filter((p) => p.status === 'Held for review').length],
      ['Assessment failures', all.filter((p) => p.status === 'Assessment failed').length],
    ]
      .map(
        ([l, v]) =>
          `<div class="stat"><div class="statlabel">${l}</div><strong>${v}</strong><small>Shared server records</small></div>`,
      )
      .join('')}</div>`;
  }
  function distributions() {
    const a = payments().filter((p) => p.assessment),
      n = Math.max(a.length, 1);
    return `<section class="card"><h2>Risk decision distribution</h2>${[
      ['Allow', '#219365'],
      ['Verify', '#e2b347'],
      ['Flag', '#d9783f'],
    ]
      .map(([d, c]) => {
        let count = a.filter((p) => p.assessment.decision === d).length;
        return `<div class="reasonbar"><div class="row"><span>${d}</span><b>${count}</b></div><div class="mini-track"><span style="width:${(count / n) * 100}%;background:${c}"></span></div></div>`;
      })
      .join(
        '',
      )}<p class="limitnote">Decision counts describe sample records, not measured detection accuracy.</p></section>`;
  }
  function graph() {
    const live = payments().filter((p) => p.assessment);
    const current =
      live.find((p) => p.id === selected) ||
      [...live].sort((a, b) => (b.graphHistory?.length || 0) - (a.graphHistory?.length || 0))[0];
    const examplesMode =
      graphSource === 'examples' ||
      (graphSource === 'auto' && (!current || (current.graphHistory?.length || 0) < 3));
    const controls = `<section class="card graph-toolbar"><div><h2>Graph explorer</h2><p class="limitnote">Select a network, then select any account to inspect its evidence.</p></div><div class="actions"><button class="btn ${examplesMode ? 'primary' : ''}" data-graph-source="examples">Sample networks</button><button class="btn ${!examplesMode ? 'primary' : ''}" data-graph-source="live">Saved payments (${live.length})</button></div></section>`;
    if (examplesMode && !graphExamples && !graphExamplesLoading && !graphExamplesError) {
      graphExamplesLoading = true;
      fetch('./graph-examples.json')
        .then((r) => {
          if (!r.ok) throw Error('Network examples could not be loaded.');
          return r.json();
        })
        .then((data) => {
          if (!Array.isArray(data.examples) || !data.examples.length)
            throw Error('No network examples available.');
          graphExamples = data.examples;
        })
        .catch((e) => {
          graphExamplesError = e.message;
        })
        .finally(() => {
          graphExamplesLoading = false;
          refresh();
        });
    }
    const p = examplesMode ? graphExamples?.[graphExampleIndex] : current;
    if (!p)
      return (
        controls +
        `<section class="card empty"><h2>${examplesMode ? 'Loading sample networks' : 'No assessed payments yet'}</h2><p>${examplesMode ? h(graphExamplesError || 'Preparing the graph, model scores and account evidence…') : 'Use Sample networks to explore an assessed network now, or send a payment in ShieldPay.'}</p>${graphExamplesError ? '<button class="btn" data-graph-source="retry">Try again</button>' : ''}</section>`
      );
    const picker = `<section class="card graph-picker"><label class="field">${examplesMode ? 'Sample network' : 'Payment'}<select id="sharedGraphSelection" aria-label="${examplesMode ? 'Sample network' : 'Saved payment'}" data-mode="${examplesMode ? 'examples' : 'live'}">${(examplesMode ? graphExamples : live).map((entry, i) => `<option value="${examplesMode ? i : h(entry.id)}" ${(examplesMode ? i === graphExampleIndex : entry.id === p.id) ? 'selected' : ''}>${h(entry.title || entry.id + ' · ' + accountName(entry.sender) + ' → ' + accountName(entry.receiver))}</option>`).join('')}</select></label><p class="limitnote">${examplesMode ? h(p.description) + ' Read-only synthetic example. Model scores come from the assessment engine. This creates no payment or alert.' : 'This network belongs to a saved payment in the shared database.'}</p></section>`;
    const dense =
      new Set([
        p.sender,
        p.receiver,
        ...(p.graphHistory || []).flatMap((e) => [e.sender, e.receiver]),
      ]).size > 18;
    const edges = p.graphHistory || [],
      ids = [
        ...new Set([p.sender, p.receiver, ...edges.flatMap((e) => [e.sender, e.receiver])]),
      ].slice(0, 28),
      scores = new Map(
        (
          p.assessment?.intelligence?.temporalGraphModel?.accounts ||
          p.assessment?.intelligence?.graphModel.accounts ||
          []
        ).map((a) => [a.id, a.risk]),
      ),
      pos = new Map(
        ids.map((id, i) => [
          id,
          {
            x:
              id === p.sender
                ? dense
                  ? 400
                  : 300
                : (dense ? 400 : 300) +
                  (dense ? 285 : 230) *
                    Math.cos(((i - 1) * 2 * Math.PI) / Math.max(1, ids.length - 1)),
            y:
              id === p.sender
                ? dense
                  ? 280
                  : 205
                : (dense ? 280 : 205) +
                  (dense ? 210 : 155) *
                    Math.sin(((i - 1) * 2 * Math.PI) / Math.max(1, ids.length - 1)),
          },
        ]),
      );
    nodeId = ids.includes(nodeId) ? nodeId : p.sender;
    let incoming = edges.filter((e) => e.receiver === nodeId),
      outgoing = edges.filter((e) => e.sender === nodeId),
      a = pos.get(p.sender),
      b = pos.get(p.receiver);
    return (
      controls +
      picker +
      (p.dataset
        ? `<section class="card graph-picker"><div><h2>Large dataset</h2><p>${p.dataset.transfers.toLocaleString('en-IN')} transfers · ${p.dataset.accounts.toLocaleString('en-IN')} accounts</p><a class="btn tiny" href="./network-transfers.csv" download>Download synthetic CSV</a></div><p class="limitnote">Showing a connected neighborhood of ${p.dataset.visibleHistoryTransfers} historical transfers. The full corpus is not drawn or scored in a single payment request. This exploration corpus is separate from model training and test splits.</p></section>`
        : '') +
      `<div class="graph-summary">${[
        ['Accounts', ids.length],
        ['Settled history transfers', edges.length],
        [
          'Aggregation hops',
          p.assessment?.intelligence?.temporalGraphModel?.messagePassingHops ?? 'Unavailable',
        ],
        ['Assessment', p.assessment?.decision || 'Unavailable'],
      ]
        .map(([label, value]) => `<div><span>${h(label)}</span><strong>${h(value)}</strong></div>`)
        .join(
          '',
        )}</div><section class="card"><div class="cardhead"><h2>${examplesMode ? h(p.title) : 'Account relationships'}</h2>${examplesMode ? '<span class="tag">READ-ONLY SAMPLE</span>' : `<button class="btn tiny" data-shared-payment="${p.id}">Inspect payment</button>`}</div><p class="limitnote">${h(accountName(p.sender))} → ${h(accountName(p.receiver))} · ${h(p.source === 'overview-sample' ? 'Overview sample' : p.source)} · ${h(p.status)}</p><div class="networklayout"><div><svg class="shared-graph ${dense ? 'graph-dense' : ''}" viewBox="${dense ? '0 0 800 600' : '0 0 600 430'}" role="group" aria-label="Directed payment network; select an account for evidence"><defs><marker id="sharedArrow" viewBox="0 0 10 10" refX="22" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10Z" fill="#78ad8b"/></marker></defs>${edges
        .map((e) => {
          const a = pos.get(e.sender),
            b = pos.get(e.receiver);
          return a && b
            ? `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="${e.sender === nodeId || e.receiver === nodeId ? '#43866b' : '#ccdcd3'}" stroke-width="${e.sender === nodeId || e.receiver === nodeId ? 2.7 : 1.2}" marker-end="url(#sharedArrow)"/>`
            : '';
        })
        .join(
          '',
        )}${a && b ? `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="#d98a40" stroke-width="2.5" stroke-dasharray="6 5" marker-end="url(#sharedArrow)"/>` : ''}${ids
        .map((id, index) => {
          const angle = ((index - 1) * 2 * Math.PI) / Math.max(1, ids.length - 1);
          const labelX =
            dense && id !== p.sender ? pos.get(id).x + 28 * Math.cos(angle) : pos.get(id).x;
          const labelY =
            dense && id !== p.sender
              ? pos.get(id).y + 28 * Math.sin(angle) + 4
              : pos.get(id).y + 36;
          const anchor =
            dense && id !== p.sender && Math.abs(Math.cos(angle)) > 0.3
              ? Math.cos(angle) > 0
                ? 'start'
                : 'end'
              : 'middle';
          const pt = pos.get(id),
            risk = scores.get(id),
            sus =
              (id === p.sender &&
                (p.assessment?.graph.fanInPattern || p.assessment?.graph.cycle)) ||
              (risk !== undefined &&
                p.assessment?.intelligence?.temporalGraphModel &&
                risk >= p.assessment.intelligence.temporalGraphModel.reviewThreshold);
          return `<g role="button" tabindex="0" data-shared-node="${h(id)}" aria-label="Inspect account ${h(accountName(id))}"><circle cx="${pt.x}" cy="${pt.y}" r="${dense ? 16 : 21}" fill="${sus ? '#fff0df' : '#e7f4ed'}" stroke="${id === nodeId ? '#143e67' : sus ? '#d88438' : '#60a27d'}" stroke-width="${id === nodeId ? 4 : 2}"/><text x="${pt.x}" y="${pt.y + 4}" text-anchor="middle" font-size="10" fill="#2c5742">${risk === undefined ? '—' : (risk * 100).toFixed(0)}</text><text x="${labelX}" y="${labelY}" text-anchor="${anchor}" font-size="10" fill="#3e674e">${h(accountName(id).length > 19 ? accountName(id).slice(0, 16) + '…' : accountName(id))}</text></g>`;
        })
        .join(
          '',
        )}</svg><p class="limitnote">Solid arrows: settled sample history within 120 seconds. Dashed orange arrow: candidate payment, not recorded as settled. Orange nodes: rule evidence or an elevated experimental graph index, not proof of guilt. Showing up to 28 accounts.</p></div><aside><h3>${h(accountName(nodeId))}</h3><div class="detailrow"><span>${p.assessment?.intelligence?.temporalGraphModel ? 'Temporal GNN index' : 'Original GNN index'}</span><b>${scores.has(nodeId) ? (scores.get(nodeId) * 100).toFixed(1) + ' / 100' : 'Not retained'}</b></div><div class="detailrow"><span>Settled incoming / outgoing</span><b>${incoming.length} / ${outgoing.length}</b></div><div class="detailrow"><span>Distinct incoming accounts</span><b>${new Set(incoming.map((e) => e.sender)).size}</b></div><div class="detailrow"><span>Rapid forwarding index</span><b>${(() => {
        const account = p.assessment?.intelligence?.temporalGraphModel?.accounts?.find(
          (a) => a.id === nodeId,
        );
        return account?.evidence
          ? (account.evidence.rapidForwardingIndex * 100).toFixed(1) + ' / 100'
          : 'Unavailable';
      })()}</b></div><p class="limitnote">${nodeId === p.sender && p.assessment?.graph.fanInPattern ? 'Payment rule: several sources converge before the pending onward transfer. ' : ''}${nodeId === p.sender && p.assessment?.graph.cycle ? 'Payment-level circular path: ' + p.assessment.graph.cyclePath.map((id) => h(accountName(id))).join(' → ') : ''}</p>${
        [...incoming, ...outgoing]
          .slice(0, 8)
          .map(
            (e) =>
              `<div class="audit">${h(accountName(e.sender))} → ${h(accountName(e.receiver))}<small>${money(e.amount)} · ${new Date(e.timestamp).toLocaleTimeString()}</small></div>`,
          )
          .join('') ||
        '<p class="limitnote">No settled history touches this account. The dashed transfer is assessed separately.</p>'
      }${nodeId === p.sender || nodeId === p.receiver ? `<div class="audit">Pending: ${h(accountName(p.sender))} → ${h(accountName(p.receiver))}<small>${money(p.amount)} · Candidate edge, excluded from settled counts.</small></div>` : ''}</aside></div><div class="graph-method"><div><b>1. Read relationships</b><p>Build directed links from settled history and add the pending transfer as a hypothetical edge.</p></div><div><b>2. Pass graph messages</b><p>Two directed aggregation hops combine account activity with upstream and onward neighbors.</p></div><div><b>3. Review the evidence</b><p>The GNN returns an account index. Rules and other models determine the payment outcome. A high index alone does not prove fraud.</p></div></div></section>`
    );
  }
  function detail(id) {
    const p = payments().find((p) => p.id === id);
    if (!p) return;
    selected = id;
    const a = p.assessment;
    modal(
      `<div class="eyebrow">Shared transaction evidence</div><h2>${money(p.amount)} · ${h(p.status)}</h2><p>${h(accountName(p.sender))} → ${h(accountName(p.receiver))}</p><p class="limitnote">${h(p.id)} · Source: ${h(p.source === 'overview-sample' ? 'Overview sample' : p.source)} · Simulated funds</p>${
        a
          ? `<div class="detailrow"><span>Model score / decision</span><b>${(a.modelScore * 100).toFixed(1)} /100 · ${h(a.decision)}</b></div><div class="detailrow"><span>Full customer API request</span><b>${ms(p.clientRequestMs)}</b></div><div class="detailrow"><span>Model scoring</span><b>${ms(a.timings.scoringMs)}</b></div><ul class="paymentreasons">${a.reasons.map((r) => `<li>${h(r)}</li>`).join('')}</ul><details><summary>Detection signals and timing stages</summary>${Object.entries(
              a.signals,
            )
              .map(([k, v]) => `<div class="detailrow"><span>${h(k)}</span><b>${h(v)}</b></div>`)
              .join('')}${Object.entries(a.timings)
              .map(([k, v]) => `<div class="detailrow"><span>${h(k)}</span><b>${ms(v)}</b></div>`)
              .join(
                '',
              )}<p class="limitnote">Behavioral data: ${p.behavior?.available ? 'Experimental derived comparison' : 'Behavioral Data Unavailable'}. Server assessment timings exclude network and persistence. Full customer API request is reported separately.</p></details>`
          : `<p class="notice">${h(p.error || 'Assessment pending')}</p>`
      }<div class="actions spacer"><button class="btn" data-shared="graph">Open account graph</button></div>${p.status === 'Held for review' ? `<label class="field spacer">Investigation reason<textarea id="sharedReviewNote" maxlength="1000" rows="3" required></textarea></label><div class="actions spacer"><button class="btn primary" data-shared-review="release" data-id="${p.id}">Release for customer authorisation</button><button class="btn danger" data-shared-review="cancel" data-id="${p.id}">Cancel payment</button></div><p id="reviewResult" role="status" class="limitnote"></p>` : ''}<h3 class="spacer">Timestamped audit history</h3>${p.timeline.map((e) => `<div class="audit">${h(e.action)}${e.note ? '<p>' + h(e.note) + '</p>' : ''}<small>${h(e.time)} · ${h(e.role)}</small></div>`).join('')}`,
    );
  }
  function recordedPerformance() {
    if (!publishedPerformance)
      return '<p class="limitnote">Loading recorded performance evidence…</p>';
    return `<section class="card spacer"><h2>Recorded deployment verification</h2><p class="limitnote">${h(publishedPerformance.recordedAt)} · ${h(publishedPerformance.scope)}</p><div class="tablewrap"><table><thead><tr><th>Concurrency</th><th>P50</th><th>P95</th><th>P99 / max</th><th>Backend P95</th><th>Model P95</th><th>Failures</th><th>Throughput</th></tr></thead><tbody>${publishedPerformance.reports.map((r) => `<tr><td>${r.concurrency}</td><td>${ms(r.P50)}</td><td>${ms(r.P95)}</td><td>${ms(r.P99)} / ${ms(r.max)}</td><td>${ms(r.backendP95)}</td><td>${ms(r.modelP95)}</td><td>${r.failures}/${r.success + r.failures}</td><td>${r.throughput.toFixed(2)}/s</td></tr>`).join('')}</tbody></table></div><h3>Static file control</h3>${publishedPerformance.staticControl.reports.map((r) => `<div class="detailrow"><span>Concurrency ${r.concurrency} · no model or database</span><b>P95 ${ms(r.P95)}</b></div>`).join('')}<p class="limitnote">${h(publishedPerformance.interpretation)}</p><a class="btn" href="./performance-evaluation.json" download>Download recorded measurements</a></section>`;
  }
  function benchmarkPage() {
    if (!publishedPerformance && !publishedPerformancePending) {
      publishedPerformancePending = true;
      fetch('./performance-evaluation.json')
        .then((r) => r.json())
        .then((r) => {
          publishedPerformance = r;
          if (location.hash === '#performance') refresh();
        })
        .catch(() => {})
        .finally(() => {
          publishedPerformancePending = false;
        });
    }
    return (
      head(
        'Measure the full assessment request.',
        'Authenticated backend checks with shared database access. Browser inference is never used as a network benchmark.',
      ) +
      `<section class="card"><div class="formgrid"><label class="field">Benchmark path<select id="sharedBenchMode"><option value="ledger">Full payment assessment with ledger writes</option><option value="assessment">Assessment only with authenticated database read</option></select></label><label class="field">Requests<select id="sharedBenchCount"><option>25</option><option>50</option><option>100</option></select></label><label class="field">Concurrency<select id="sharedBenchConcurrency"><option>1</option><option>3</option><option>5</option><option>10</option></select></label></div><button class="btn primary spacer" data-shared="benchmark" ${benchRunning ? 'disabled' : ''}>${benchRunning ? 'Running…' : 'Run repeatable assessment benchmark'}</button><button class="btn spacer" data-shared="stopBenchmark">Stop after in flight requests</button><p class="limitnote" id="sharedBenchProgress">${benchRunning ? 'Testing…' : 'No real payment or settlement occurs.'}</p></section>${
        bench
          ? `<section class="card"><h2>Measured results</h2>${Object.entries(bench)
              .map(([k, v]) => `<div class="detailrow"><span>${h(k)}</span><b>${h(v)}</b></div>`)
              .join(
                '',
              )}<p class="limitnote">Small synthetic test. Cold starts, failures and slow calls remain in the measurements. The selected path is recorded with these results. Ledger mode includes payment creation and decision persistence; assessment mode excludes writes. Neither settles funds or certifies production capacity. Percentiles include failed and successful attempt durations.</p></section>`
          : ''
      }` +
      recordedPerformance()
    );
  }
  window.renderSharedModelAnalytics = function () {
    if (!anomalyReport && !anomalyPending) {
      anomalyPending = true;
      fetch('./anomaly-evaluation.json')
        .then((r) => r.json())
        .then((r) => {
          anomalyReport = r;
          if (location.hash === '#model') window.render();
        })
        .catch(() => {})
        .finally(() => {
          anomalyPending = false;
        });
    }
    if (!temporalReport && !temporalPending) {
      temporalPending = true;
      fetch('./temporal-graph-evaluation.json')
        .then((r) => r.json())
        .then((r) => {
          temporalReport = r;
          if (location.hash === '#model') window.render();
        })
        .catch(() => {})
        .finally(() => {
          temporalPending = false;
        });
    }
    if (!candidateReport && !candidatePending) {
      candidatePending = true;
      fetch('./graph-candidate-evaluation.json')
        .then((r) => r.json())
        .then((r) => {
          candidateReport = r;
          if (location.hash === '#model') window.render();
        })
        .catch(() => {})
        .finally(() => {
          candidatePending = false;
        });
    }
    if (!graphReport && !graphReportPending) {
      graphReportPending = true;
      fetch('./graph-evaluation.json')
        .then((r) => r.json())
        .then((r) => {
          graphReport = r;
          if (location.hash === '#model') window.render();
        })
        .catch(() => {})
        .finally(() => {
          graphReportPending = false;
        });
    }
    return (
      renderModel() +
      (temporalReport?.dataset
        ? `<section class="card spacer"><h2>Training and evaluation dataset</h2><p class="limitnote">${h(temporalReport.dataset.kind)}. ${h(temporalReport.dataset.splitIsolation)}.</p><div class="detailrow"><span>Total graph samples</span><b>${temporalReport.dataset.totalGraphs.toLocaleString('en-IN')}</b></div><div class="detailrow"><span>Historical transfers across all splits</span><b>${temporalReport.dataset.totalHistoricalTransfers.toLocaleString('en-IN')}</b></div><div class="detailrow"><span>Candidate payments across all splits</span><b>${temporalReport.dataset.totalCandidatePayments.toLocaleString('en-IN')}</b></div>${Object.entries(
            temporalReport.dataset.splits,
          )
            .map(
              ([name, split]) =>
                `<div class="detailrow"><span>${h(name)} · graphs / historical transfers</span><b>${split.graphs.toLocaleString('en-IN')} / ${split.historicalTransfers.toLocaleString('en-IN')}</b></div>`,
            )
            .join(
              '',
            )}<p class="limitnote">${h(temporalReport.dataset.trainingMethod)}. These counts describe independent synthetic examples, not live bank volume.</p></section>`
        : '') +
      `<section class="card spacer"><h2>Isolation Forest evaluation</h2><p class="limitnote">80 isolation trees learn normal synthetic activity. A separate normal validation split selects the review threshold. Scores measure unusualness, not fraud probability.</p>${anomalyReport ? `<div class="detailrow"><span>Training / validation transactions</span><b>${anomalyReport.trainingCount} / ${anomalyReport.normalValidationCount}</b></div><div class="detailrow"><span>Held out unusualness precision / recall</span><b>${(anomalyReport.test.precision * 100).toFixed(1)}% / ${(anomalyReport.test.recall * 100).toFixed(1)}%</b></div><div class="detailrow"><span>Normal activity false positive rate</span><b>${(anomalyReport.test.falsePositiveRate * 100).toFixed(2)}%</b></div><div class="detailrow"><span>Rare unusual activity precision / recall</span><b>${(anomalyReport.rareTrafficStress.precision * 100).toFixed(1)}% / ${(anomalyReport.rareTrafficStress.recall * 100).toFixed(1)}%</b></div><p class="limitnote">${h(anomalyReport.limitations)}</p>` : '<p>Loading anomaly evaluation…</p>'}<p class="limitnote">Reproduce: python scripts/train_anomaly.py</p></section>` +
      `<section class="card spacer"><h2>Temporal graph neural network</h2><p class="limitnote">Two directed aggregation hops connect upstream sources and onward destinations. The trained prediction head uses timing, amounts, incoming and outgoing neighborhoods and the hypothetical payment edge. Original model artifacts remain preserved. This layer can request verification; it never blocks or settles a payment by itself.</p>${temporalReport ? `<div class="detailrow"><span>Independent synthetic test graphs</span><b>${temporalReport.testGraphs}</b></div><div class="detailrow"><span>Precision / recall</span><b>${(temporalReport.test.precision * 100).toFixed(1)}% / ${(temporalReport.test.recall * 100).toFixed(1)}%</b></div><div class="detailrow"><span>Preserved graph on the same test graphs</span><b>${(temporalReport.originalOnSameSplits.test.precision * 100).toFixed(1)}% precision / ${(temporalReport.originalOnSameSplits.test.recall * 100).toFixed(1)}% recall</b></div><div class="detailrow"><span>True / false positives / missed positives</span><b>${temporalReport.test.confusion.tp} / ${temporalReport.test.confusion.fp} / ${temporalReport.test.confusion.fn}</b></div><p class="limitnote">${h(temporalReport.limitations)}</p><h3>Rare fraud stress split</h3><div class="detailrow"><span>${temporalReport.rareTrafficStress.graphs} graphs · positive account prevalence</span><b>${(temporalReport.rareTrafficStress.metrics.positivePrevalence * 100).toFixed(2)}%</b></div><div class="detailrow"><span>Precision / recall</span><b>${(temporalReport.rareTrafficStress.metrics.precision * 100).toFixed(1)}% / ${(temporalReport.rareTrafficStress.metrics.recall * 100).toFixed(1)}%</b></div><div class="detailrow"><span>Legitimate account false positive rate</span><b>${(temporalReport.rareTrafficStress.metrics.falsePositiveRate * 100).toFixed(2)}%</b></div>${temporalReport.timingShiftStress ? `<div class="detailrow"><span>3× slower movement stress: precision / recall</span><b>${(temporalReport.timingShiftStress.metrics.precision * 100).toFixed(1)}% / ${(temporalReport.timingShiftStress.metrics.recall * 100).toFixed(1)}%</b></div><p class="limitnote">${h(temporalReport.timingShiftStress.description)}</p>` : ''}<p class="limitnote">${h(temporalReport.thresholdSelection)}. Low prevalence reduces alert precision. These signals request verification and do not establish fraud.</p>` : '<p>Loading temporal graph evaluation…</p>'}<p class="limitnote">Reproduce: python scripts/train_temporal_graph.py. Training, validation and test graphs use distinct seeds. Features and Python/JavaScript parity are tested.</p></section>` +
      `<section class="card spacer"><h2>Graph generalisation stress tests</h2><p class="limitnote">The existing graph weights are preserved. This reproducible suite tests normal chains, legitimate hubs and cycles, rings, mule forwarding and fund movement chains. Similar topology can have legitimate or fraudulent labels, so graph structure alone cannot establish intent. Results are synthetic stress measurements, not real bank accuracy.</p>${graphReport ? graphReport.groups.map((g) => `<div class="detailrow"><span>${h(g.pattern)} · ${g.graphs} graphs</span><b>Precision ${g.precision === null ? 'Unavailable' : (g.precision * 100).toFixed(1) + '%'} / recall ${g.recall === null ? 'Unavailable' : (g.recall * 100).toFixed(1) + '%'}</b></div>`).join('') : '<p class="limitnote">Loading graph evaluation…</p>'}<p class="limitnote">Command: node scripts/evaluate_graph_patterns.cjs. Model replacement remains subject to independent validation; no improved accuracy is claimed.</p></section>` +
      `<section class="card spacer"><h2>Topology only candidate (not active)</h2><p class="limitnote">A separate candidate uses 900 training, 240 validation and 360 untouched test graphs with six varied patterns. The deployed weights remain preserved. Candidate thresholds require 85% validation precision; failure to meet that requirement prevents promotion.</p>${candidateReport ? `<div class="detailrow"><span>Deployed model on new test split</span><b>Precision ${(candidateReport.baseline.precision * 100).toFixed(1)}% · recall ${(candidateReport.baseline.recall * 100).toFixed(1)}%</b></div><div class="detailrow"><span>Candidate on same test split</span><b>Precision ${(candidateReport.candidate.precision * 100).toFixed(1)}% · recall ${(candidateReport.candidate.recall * 100).toFixed(1)}%</b></div><p>${h(candidateReport.decision)}</p><p class="limitnote">${h(candidateReport.limitations)}</p>` : '<p>Loading candidate results…</p>'}<p class="limitnote">Reproduce: python scripts/train_graph_candidate.py. These are synthetic measurements, not banking accuracy.</p></section>`
    );
  };
  function settingsPage() {
    return (
      head('Settings', 'Display preferences and shared workspace information.') +
      `<section class="card"><h2>Display</h2><label class="check"><input type="checkbox" id="sharedMotion" ${document.body?.classList?.contains('reduced') ? 'checked' : ''}>Reduce all motion for this session</label><p class="limitnote">Decorative animations are disabled by default. Loading indicators remain visible.</p></section><section class="card spacer"><h2>Shared workspace</h2><div class="detailrow"><span>Data source</span><b>Shared backend</b></div><div class="detailrow"><span>Balances and settlement</span><b>Simulated</b></div><p class="limitnote">Payment decisions and investigation records are controlled by the backend. Display preferences do not change fraud policies or release payments.</p><button class="btn" data-shared="exportShared">Export shared transaction evidence</button><a class="btn" href="#model">Model evaluation</a></section>`
    );
  }
  function render(view) {
    tab = view;
    if (!client.data) return loadingWorkspace();
    if (view === 'performance') return benchmarkPage();
    if (view === 'settings') return settingsPage();
    const all = payments(),
      held = all.filter((p) => p.status === 'Held for review'),
      alerts = all.filter((p) => p.assessment?.decision !== 'Allow' && p.assessment),
      recent = all.filter((p) => p.assessment).slice(-30),
      score = recent.length
        ? recent.reduce((a, p) => a + p.assessment.timings.scoringMs, 0) / recent.length
        : null,
      net = all.filter((p) => p.assessment && Number.isFinite(p.clientRequestMs)).slice(-30),
      latency = net.length ? net.reduce((a, p) => a + p.clientRequestMs, 0) / net.length : null;
    const top = head(
      view === 'network'
        ? 'Graph network'
        : view === 'cases'
          ? 'Investigate before release.'
          : view === 'alerts'
            ? 'Fraud alerts, backed by evidence.'
            : view === 'transactions'
              ? 'One authoritative payment feed.'
              : view === 'simulator'
                ? 'Generate activity. Observe decisions.'
                : 'Overview',
      'Shared database records · Simulated funds · Polling every 1.5 seconds',
    );
    const banner = `<div class="modebar"><span class="tag live">${client.error ? 'Connection interrupted' : 'Shared backend connected'}</span><span>Revision ${client.data.revision} · ${h(client.data.serverTime)} · ${h(client.error?.message || 'Customer payments and investigator decisions use these same records.')}</span></div>`;
    if (view === 'network') return top + banner + graph();
    if (view === 'transactions')
      return (
        top +
        banner +
        `<section class="card"><button class="btn tiny" data-shared="clearSearch">Clear search</button>${rows(all)}</section>`
      );
    if (view === 'alerts')
      return (
        top +
        banner +
        `<section class="card"><h2>${alerts.length} flagged or verification decisions</h2>${rows(alerts)}</section>`
      );
    if (view === 'cases')
      return (
        top +
        banner +
        `<section class="card"><h2>Held for investigation (${held.length})</h2>${rows(held)}</section><section class="card"><h2>Recent reviewed cases</h2>${rows(all.filter((p) => p.caseStatus === 'Resolved'))}</section>`
      );
    if (view === 'simulator')
      return (
        top +
        banner +
        `<section class="card"><h2>Continuous synthetic payment stream</h2><p class="limitnote">Generated on the server, assessed through the existing models and saved to the same ledger. Source is labelled simulator. Reset removes simulator records only.</p><label class="field">Simulation interval<select id="sharedSimSpeed"><option value="3000" ${speed === 3000 ? 'selected' : ''}>Slow · 3 seconds</option><option value="1500" ${speed === 1500 ? 'selected' : ''}>Normal · 1.5 seconds</option><option value="500" ${speed === 500 ? 'selected' : ''}>Fast · 0.5 seconds</option></select></label><div class="actions spacer"><button class="btn primary" data-shared="startSim">Start</button><button class="btn" data-shared="pauseSim">Pause</button><button class="btn danger" data-shared="resetSim">Reset simulator records</button></div><p class="limitnote">${simulation ? 'Running' : 'Paused'} · ${simCount} generated in this session. Scenarios include normal, unusual amounts, bursts, mule fan in, cycles, chains, new recipients, unfamiliar devices and abnormal interaction timing.</p></section><section class="card">${rows(all.filter((p) => p.source === 'simulator'))}</section>`
      );
    return (
      top +
      banner +
      `<section class="card overview-activity"><div><h2>Workspace activity</h2><p class="limitnote">${all.filter((p) => p.source === 'overview-sample').length} assessed overview samples · ${all.filter((p) => p.source === 'shieldpay').length} ShieldPay payments · ${all.filter((p) => p.source === 'simulator').length} simulator records. Sample funds are never debited.</p><p role="status" class="limitnote">${overviewBusy ? 'Preparing 500 samples through the detection engine…' : h(overviewLoadError || 'Counts below come from saved assessments, not the model training dataset.')}</p></div><div class="actions"><button class="btn primary" data-shared="loadOverview" ${overviewBusy ? 'disabled' : ''}>${overviewBusy ? 'Loading…' : 'Load 500 samples'}</button><button class="btn" data-shared="clearOverview" ${overviewBusy || !all.some((p) => p.source === 'overview-sample') ? 'disabled' : ''}>Clear overview samples</button><a class="btn" href="#simulator">Live simulator</a></div></section>` +
      metrics() +
      `<div class="grid"><section class="card"><div class="cardhead"><h2>Live transaction feed</h2><a class="btn tiny" href="#transactions">View all</a></div>${rows(all.slice(-8))}</section><section class="card"><h2>Immediate fraud alerts</h2>${rows(alerts.slice(-5))}</section></div><div class="grid equal">${distributions()}<section class="card"><h2>Observed latency</h2><div class="metriclarge">${ms(score)}</div><p class="limitnote">Mean model scoring, last ${recent.length} assessed records</p><div class="metriclarge">${ms(latency)}</div><p class="limitnote">Mean full client API request, ${net.length} measured records. Includes network and ledger operations. Client timing reports are untrusted telemetry, not a performance certification.</p><a class="btn" href="#performance">Run benchmark</a></section></div>${graph()}<section class="card spacer"><h2>Recent investigation cases</h2>${rows(held.slice(-5))}</section>`
    );
  }
  function selectGraphNode(id) {
    nodeId = id;
    refresh();
    // Restore focus after the selected node and its evidence are re-rendered.
    const node = [...document.querySelectorAll('[data-shared-node]')].find(
      (el) => el.dataset.sharedNode === id,
    );
    node?.focus({ preventScroll: true });
  }
  function refresh() {
    if (
      window.render &&
      [
        'overview',
        'transactions',
        'alerts',
        'network',
        'cases',
        'simulator',
        'performance',
        'settings',
      ].includes(location.hash.slice(1) || 'overview') &&
      !document.getElementById('dialog')?.open &&
      !document.activeElement?.closest?.('form') &&
      !benchRunning
    )
      window.render();
  }
  client.onchange = (data, error) => {
    if (error?.status === 401) client.data = null;
    refresh();
  };
  window.renderCommandCenter = render;
  window.ShieldCommandClient = client;
  document.addEventListener('click', async (e) => {
    const sourceControl = e.target.closest('[data-graph-source]');
    if (sourceControl) {
      if (sourceControl.dataset.graphSource === 'retry') {
        graphExamplesError = '';
        graphSource = 'examples';
      } else graphSource = sourceControl.dataset.graphSource;
      nodeId = null;
      refresh();
      return;
    }
    const p = e.target.closest('[data-shared-payment]');
    if (p) return detail(p.dataset.sharedPayment);
    const n = e.target.closest('[data-shared-node]');
    if (n) {
      selectGraphNode(n.dataset.sharedNode);
      return;
    }
    const rev = e.target.closest('[data-shared-review]');
    if (rev) {
      if (rev.disabled) return;
      rev.disabled = true;
      try {
        await client.api({
          action: 'review',
          id: rev.dataset.id,
          outcome: rev.dataset.sharedReview,
          note: document.getElementById('sharedReviewNote').value,
        });
        document.getElementById('dialog').close();
        await client.pull(true);
        refresh();
      } catch (err) {
        const errorEl = document.getElementById('reviewResult');
        if (errorEl) errorEl.textContent = err.message;
        else notify(err.message);
      } finally {
        rev.disabled = false;
      }
      return;
    }
    const a = e.target.closest('[data-shared]')?.dataset.shared;
    if (!a) return;
    try {
      if (a === 'guide') {
        modal(
          `<div class="eyebrow">Payment walkthrough</div><h2>From account setup to investigation</h2><ol><li>Open ShieldPay on your phone. Connect a sample account with consent and the displayed code 123456.</li><li>Keep this command center open on another device.</li><li>In Send Money, open Demo scenarios and select DEMO 1, continue, and authorise with the displayed demo keypad. Check Live transactions for the same payment reference and Settled status.</li><li>In Demo scenarios, choose DEMO 3 and send the payment. The server generates labelled synthetic network evidence, holds the payment and saves an alert.</li><li>Open Fraud alerts, inspect the payment and choose Open account graph. Follow solid settled arrows and the dashed candidate transfer.</li><li>Open Investigations, record a reason and release or cancel. Release permits customer authorisation; it does not settle automatically.</li><li>Observe the updated phone status, timestamped audit history and measured model and full request timings.</li></ol><p class="limitnote">Balances and settlement are simulated. No real UPI PIN or bank credentials are needed. Optional experimental behavior enrollment is inside the send form.</p><a class="btn primary" href="./pay">Open ShieldPay</a>`,
        );
      }
      if (a === 'exportShared')
        download(
          'upi-shield-shared-transactions.json',
          JSON.stringify(
            { simulated: true, exportedAt: new Date().toISOString(), payments: payments() },
            null,
            2,
          ),
          'application/json',
        );
      if (a === 'clearSearch') {
        query = '';
        refresh();
      }
      if (a === 'loadOverview') await ensureOverviewSamples(true);
      if (a === 'clearOverview' && !overviewBusy) {
        await client.api({ action: 'clearOverviewSamples' });
        await client.pull(true);
        refresh();
      }
      if (a === 'retryWorkspace') {
        await client.start();
        ensureOverviewSamples();
        refresh();
      }
      if (a === 'graph') {
        graphSource = 'live';
        document.getElementById('dialog').close();
        location.hash = 'network';
        refresh();
      }
      if (a === 'startSim' && !simulation) {
        speed = +document.getElementById('sharedSimSpeed').value;
        simulation = setTimeout(tick, 0);
        refresh();
      }
      if (a === 'pauseSim') {
        clearTimeout(simulation);
        simulation = null;
        refresh();
      }
      if (a === 'resetSim') {
        if (simBusy) {
          notify('Pause and wait for the current assessment before resetting.');
          return;
        }
        clearTimeout(simulation);
        simulation = null;
        await client.api({ action: 'resetSimulation' });
        simCount = 0;
        await client.pull(true);
        refresh();
      }
      if (a === 'benchmark') runBenchmark();
      if (a === 'stopBenchmark') benchStop = true;
    } catch (err) {
      notify(err.message);
    }
  });
  document.addEventListener('change', (e) => {
    if (e.target.id === 'sharedMotion') document.body.classList.toggle('reduced', e.target.checked);
  });
  document.addEventListener('keydown', (e) => {
    if (['Enter', ' '].includes(e.key) && e.target.matches('[data-shared-node]')) {
      e.preventDefault();
      selectGraphNode(e.target.dataset.sharedNode);
    }
  });
  async function tick() {
    if (!simulation || simBusy) return;
    simBusy = true;
    const patterns = [
        'normal',
        'normal',
        'normal',
        'normal',
        'normal',
        'normal',
        'amount',
        'velocity',
        'ring',
        'cycle',
        'chain',
        'recipient',
        'device',
        'behavior',
        'verify',
      ],
      kind = patterns[simCount % patterns.length];
    try {
      const r = await client.api({
        action: 'create',
        key: crypto.randomUUID(),
        source: 'simulator',
        scenario: kind,
        bank: 'sbi',
        receiver: kind === 'recipient' ? 'pay-new' : 'pay-aanya',
        recipientName: kind === 'recipient' ? 'New sample recipient' : 'Sample merchant',
        amount: kind === 'amount' ? 12000 : Math.round(200 + Math.random() * 500),
      });
      await client.api({ action: 'clientTiming', id: r.data.payment.id, ms: r.ms });
      simCount++;
      await client.pull(true);
    } catch (e) {
      notify(e.message);
      simulation = null;
    } finally {
      simBusy = false;
      if (simulation) simulation = setTimeout(tick, speed);
      refresh();
    }
  }
  async function runBenchmark() {
    if (benchRunning) return;
    const count = +document.getElementById('sharedBenchCount').value,
      concurrency = +document.getElementById('sharedBenchConcurrency').value,
      mode = document.getElementById('sharedBenchMode').value;
    benchRunning = true;
    benchStop = false;
    let index = 0,
      success = [],
      attempts = [],
      scoring = [],
      backend = [],
      dbRead = [],
      dbWrite = [],
      failures = 0;
    const start = performance.now();
    async function worker() {
      while (index < count && !benchStop) {
        index++;
        const attemptStart = performance.now();
        try {
          const r = await client.api({ action: 'benchmark', mode });
          success.push(r.ms);
          scoring.push(r.data.timings.scoringMs);
          backend.push(r.data.requestTiming?.handlerMs);
          dbRead.push(r.data.requestTiming?.databaseReadMs || 0);
          dbWrite.push(r.data.requestTiming?.databaseWriteMs || 0);
        } catch {
          failures++;
        } finally {
          attempts.push(performance.now() - attemptStart);
        }
        const el = document.getElementById('sharedBenchProgress');
        if (el) el.textContent = success.length + failures + '/' + count + ' completed';
      }
    }
    try {
      await Promise.all(Array.from({ length: concurrency }, worker));
      const elapsed = performance.now() - start,
        q = (a, p) => {
          a.sort((x, y) => x - y);
          return a.length ? a[Math.min(a.length - 1, Math.ceil(a.length * p) - 1)] : null;
        };
      bench = {
        time: new Date().toISOString(),
        concurrency,
        successful: success.length,
        failed: failures,
        'failure rate': ((failures / Math.max(1, attempts.length)) * 100).toFixed(1) + '%',
        P50: ms(q(attempts, 0.5)),
        P95: ms(q(attempts, 0.95)),
        P99: ms(q(attempts, 0.99)),
        maximum: ms(attempts.length ? Math.max(...attempts) : null),
        'model P95': ms(q(scoring, 0.95)),
        'backend handler P95': ms(q(backend, 0.95)),
        'database read P95': ms(q(dbRead, 0.95)),
        'database write P95': ms(q(dbWrite, 0.95)),
        'successful requests below 500ms':
          success.filter((x) => x < 500).length + '/' + success.length,
        'model calls below 200ms': scoring.filter((x) => x < 200).length + '/' + scoring.length,
        throughput: (success.length / (elapsed / 1000)).toFixed(1) + ' successful requests/s',
        scope:
          mode === 'ledger'
            ? 'Network, database authentication, payment creation, feature extraction, models and persisted decision; no settlement'
            : 'Network + database authentication + assessment; no ledger writes',
      };
      if (mode === 'ledger') {
        try {
          await client.api({ action: 'resetBenchmark' });
          bench['test record cleanup'] = 'Completed';
        } catch {
          bench['test record cleanup'] = 'Failed; rerun cleanup before another ledger test';
        }
      }
    } finally {
      benchRunning = false;
      refresh();
    }
  }

  document.addEventListener('change', (e) => {
    if (e.target.id === 'sharedSimSpeed') speed = +e.target.value;
    if (e.target.id === 'sharedGraphSelection') {
      if (e.target.dataset.mode === 'examples') graphExampleIndex = +e.target.value;
      else selected = e.target.value;
      nodeId = null;
      refresh();
    }
  });
  async function ensureOverviewSamples(force = false) {
    if (overviewBusy || client.data?.actor?.role !== 'investigator') return;
    if (!force && (client.data.overviewSamples?.initialized || payments().length >= 30)) return;
    overviewBusy = true;
    overviewLoadError = '';
    refresh();
    try {
      await client.api({ action: 'loadOverviewSamples' });
      await client.pull(true);
    } catch (e) {
      overviewLoadError = e.message;
    } finally {
      overviewBusy = false;
      refresh();
    }
  }
  client
    .start()
    .then(() => ensureOverviewSamples())
    .catch((e) => {
      client.error = e;
      refresh();
    });
})();
