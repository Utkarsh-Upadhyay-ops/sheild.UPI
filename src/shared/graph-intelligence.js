/* Synthetic intelligence models. Pure inference, shared by browser and server. */
(function (root) {
  function c(n) {
    return n <= 1 ? 0 : n === 2 ? 1 : 2 * (Math.log(n - 1) + 0.5772156649) - (2 * (n - 1)) / n;
  }
  function anomaly(model, x) {
    let sum = 0;
    for (const t of model.trees) {
      let i = 0,
        d = 0;
      while (t.left[i] >= 0) {
        i = x[t.feature[i]] <= t.threshold[i] ? t.left[i] : t.right[i];
        d++;
      }
      sum += d + c(t.samples[i]);
    }
    return Math.pow(2, -sum / model.trees.length / c(model.maxSamples));
  }
  function network(model, history, payment) {
    const at = Date.parse(payment.timestamp),
      edges = history.filter(
        (h) =>
          h.settled !== false &&
          Date.parse(h.timestamp) <= at &&
          at - Date.parse(h.timestamp) <= 120000,
      );
    const ids = [
        ...new Set([
          payment.sender,
          payment.receiver,
          ...edges.flatMap((h) => [h.sender, h.receiver]),
        ]),
      ].slice(0, 1000),
      idx = new Map(ids.map((id, i) => [id, i])),
      adj = ids.map((_, i) => new Set([i])),
      ins = ids.map(() => new Set()),
      outs = ids.map(() => new Set());
    for (const h of edges) {
      let a = idx.get(h.sender),
        b = idx.get(h.receiver);
      if (a === undefined || b === undefined) continue;
      adj[a].add(b);
      adj[b].add(a);
      ins[b].add(a);
      outs[a].add(b);
    }
    const x = ids.map((_, i) => [
      1,
      Math.min(ins[i].size / 8, 1),
      Math.min(outs[i].size / 8, 1),
      +(ins[i].size > 0 && outs[i].size > 0),
    ]);
    const scores = x.map((self, i) => {
      let avg = [0, 0, 0, 0];
      let total = 0;
      for (const j of adj[i]) {
        let weight = i !== j && outs[i].has(j) && outs[j].has(i) ? 2 : 1;
        total += weight;
        for (let k = 0; k < 4; k++) avg[k] += x[j][k] * weight;
      }
      avg = avg.map((v) => v / total);
      let row = [...self, ...avg],
        logit = model.bias;
      for (let k = 0; k < model.head.length; k++) {
        let h = 0;
        for (let j = 0; j < 8; j++) h += row[j] * model.weights[j][k];
        logit += Math.max(0, h) * model.head[k];
      }
      return 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, logit))));
    });
    return {
      sender: scores[idx.get(payment.sender)] || 0,
      recipient: scores[idx.get(payment.receiver)] || 0,
      nodes: ids.length,
      edges: edges.length,
      senderId: payment.sender,
      recipientId: payment.receiver,
      reviewThreshold: model.reviewThreshold || 0.85,
      links: edges
        .slice(-120)
        .map((h) => ({ sender: h.sender, receiver: h.receiver, amount: h.amount })),
      accounts: ids
        .map((id, i) => ({ id, risk: scores[i] }))
        .sort((a, b) => b.risk - a.risk)
        .slice(0, 12),
    };
  }
  function distance(a, b) {
    const r = Math.PI / 180,
      p = (b.lat - a.lat) * r,
      q = (b.lon - a.lon) * r,
      v = Math.sin(p / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(q / 2) ** 2;
    return 6371 * 2 * Math.atan2(Math.sqrt(v), Math.sqrt(1 - v));
  }
  function assess(model, body, base) {
    const start = performance.now(),
      s = base.signals,
      gnn = network(model.graph, body.history, body.payment),
      a = anomaly(model.anomaly, [
        Math.log(Math.max(0.001, s.amount / s.average)),
        s.velocity / 4,
        +s.newRecipient,
        s.behavior,
      ]);
    const session = body.session || {},
      locations = Array.isArray(session.locations) ? session.locations.slice(-2) : [],
      valid =
        locations.length === 2 &&
        locations.every(
          (l) =>
            Number.isFinite(l.lat) &&
            Math.abs(l.lat) <= 90 &&
            Number.isFinite(l.lon) &&
            Math.abs(l.lon) <= 180 &&
            Number.isFinite(Date.parse(l.time)),
        );
    let geo = { available: valid, impossibleTravel: false };
    if (valid) {
      let hours = (Date.parse(locations[1].time) - Date.parse(locations[0].time)) / 3600000,
        km = distance(...locations);
      geo = {
        available: true,
        kilometers: km,
        speedKmh: hours > 0 ? km / hours : null,
        impossibleTravel: hours > 0 && km > 100 && km / hours > 1000,
      };
    }
    let devices = Array.isArray(session.accountsOnDevice)
      ? new Set(session.accountsOnDevice.filter((x) => typeof x === 'string').slice(0, 50)).size
      : 1;
    const device = {
      newDevice: s.newDevice,
      accountsOnDevice: devices,
      sharedDevice: devices >= 4,
      source: 'User supplied synthetic session context, not trusted device attestation',
    };
    let recipientRisk = Math.min(
      1,
      0.65 * gnn.recipient + 0.2 * (s.age < 7) + 0.15 * s.newRecipient,
    );
    let combined = 0.65 * base.modelScore + 0.15 * gnn.sender + 0.1 * a + 0.1 * recipientRisk,
      decision = base.decision,
      reasons = [];
    if (a >= (model.anomaly.reviewThreshold ?? 0.72)) {
      reasons.push('Isolation Forest detects an unusual transaction feature combination.');
      if (decision === 'Allow') decision = 'Verify';
    }
    if (geo.impossibleTravel || device.sharedDevice) {
      decision = 'Flag';
      reasons.push(
        geo.impossibleTravel
          ? 'Supplied demo locations imply travel above 1000 km/h.'
          : 'At least four demo accounts share the supplied device context.',
      );
    }
    if (gnn.sender >= gnn.reviewThreshold && decision === 'Allow') {
      decision = 'Verify';
      reasons.push('The experimental graph model suggests additional review.');
    }
    return {
      version: model.version,
      combinedRisk: combined,
      combinedRiskScope: 'Weighted research risk index, not a calibrated fraud probability',
      anomalyScore: a,
      anomalyEvidence: {
        version: model.anomaly.version || 'legacy',
        threshold: model.anomaly.reviewThreshold ?? 0.72,
        unusual: a >= (model.anomaly.reviewThreshold ?? 0.72),
        scope: 'Unusualness index, not fraud probability; verification only',
        features: [
          { name: 'Amount versus observed average', value: s.amount / Math.max(1, s.average) },
          { name: 'Recent payment count', value: s.velocity },
          { name: 'New recipient', value: !!s.newRecipient },
          {
            name: 'Experimental behavior deviation',
            available: !!body.behavior?.available,
            value: body.behavior?.available ? s.behavior : null,
          },
        ],
      },
      graphModel: gnn,
      recipientRisk,
      device,
      geo,
      decision,
      reasons,
      scoringMs: performance.now() - start,
      calibrationWarning:
        'Graph model is evaluated on held out synthetic graphs only; never used alone to block a payment.',
    };
  }
  const api = { anomaly, network, distance, assess };
  if (typeof module !== 'undefined') module.exports = api;
  else root.ShieldIntelligence = api;
})(typeof window !== 'undefined' ? window : globalThis);
