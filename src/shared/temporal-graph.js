/* Directed message passing with amount and timing features. Experimental synthetic model. */
(function (root) {
  function features(history, payment) {
    const at = Date.parse(payment.timestamp),
      edges = history
        .filter(
          (e) =>
            e.settled !== false &&
            Date.parse(e.timestamp) <= at &&
            at - Date.parse(e.timestamp) <= 120000,
        )
        .slice(-500),
      all = [...edges, { ...payment, candidate: true }],
      ids = [
        ...new Set([
          payment.sender,
          payment.receiver,
          ...edges.flatMap((e) => [e.sender, e.receiver]),
        ]),
      ].slice(0, 120),
      incoming = new Map(ids.map((id) => [id, []])),
      outgoing = new Map(ids.map((id) => [id, []]));
    for (const e of all)
      if (incoming.has(e.receiver) && outgoing.has(e.sender)) {
        incoming.get(e.receiver).push(e);
        outgoing.get(e.sender).push(e);
      }
    const self = ids.map((id) => {
      const ins = incoming.get(id),
        outs = outgoing.get(id),
        inIds = new Set(ins.map((e) => e.sender)),
        outIds = new Set(outs.map((e) => e.receiver)),
        inAmount = ins.reduce((s, e) => s + e.amount, 0),
        outAmount = outs.reduce((s, e) => s + e.amount, 0);
      let rapid = 0;
      for (const o of outs)
        for (const i of ins) {
          const gap = Date.parse(o.timestamp) - Date.parse(i.timestamp);
          if (gap >= 0 && gap <= 120000) rapid = Math.max(rapid, 1 - gap / 120000);
        }
      let cycle = 0,
        steps = 0;
      const stack = [{ id, path: [id] }];
      while (stack.length && steps++ < 200) {
        const n = stack.pop();
        if (n.path.length > 4) continue;
        for (const e of outgoing.get(n.id) || []) {
          if (e.receiver === id && n.path.length >= 3) {
            cycle = 1;
            break;
          }
          if (!n.path.includes(e.receiver))
            stack.push({ id: e.receiver, path: [...n.path, e.receiver] });
        }
        if (cycle) break;
      }
      return [
        1,
        Math.min(inIds.size / 8, 1),
        Math.min(outIds.size / 8, 1),
        +(ins.length > 0 && outs.length > 0),
        Math.min(inAmount / 30000, 1),
        Math.min(outAmount / 30000, 1),
        Math.min(outAmount / Math.max(1, inAmount), 2) / 2,
        rapid,
        cycle,
        Math.min(ins.filter((e) => at - Date.parse(e.timestamp) <= 30000).length / 8, 1),
      ];
    });
    const index = new Map(ids.map((id, i) => [id, i]));
    function avg(list) {
      if (!list.length) return Array(10).fill(0);
      return Array.from(
        { length: 10 },
        (_, k) => list.reduce((s, id) => s + self[index.get(id)][k], 0) / list.length,
      );
    }
    const rows = ids.map((id, i) => [
      ...self[i],
      ...avg([...new Set(incoming.get(id).map((e) => e.sender))]),
      ...avg([...new Set(outgoing.get(id).map((e) => e.receiver))]),
    ]);
    // A second directed hop captures upstream sources and onward destinations.
    const secondHop = ids.map((id, i) => {
      const neighbors = (list) => {
        if (!list.length) return Array(30).fill(0);
        return Array.from(
          { length: 30 },
          (_, k) => list.reduce((sum, other) => sum + rows[index.get(other)][k], 0) / list.length,
        );
      };
      return [
        ...rows[i],
        ...neighbors([...new Set(incoming.get(id).map((e) => e.sender))]),
        ...neighbors([...new Set(outgoing.get(id).map((e) => e.receiver))]),
      ];
    });
    return { ids, rows, secondHop, edges: edges.length, candidateIncluded: true };
  }
  function score(model, history, payment) {
    const graph = features(history, payment);
    const selectedRows = model.inputFeatures === 90 ? graph.secondHop : graph.rows;
    const accounts = selectedRows.map((row, i) => {
      let logit = model.bias;
      for (let k = 0; k < model.head.length; k++) {
        let sum = 0;
        for (let j = 0; j < row.length; j++) sum += row[j] * model.weights[j][k];
        logit += Math.max(0, sum) * model.head[k];
      }
      return {
        id: graph.ids[i],
        evidence: {
          incomingDiversity: graph.rows[i][1] * 8,
          outgoingDiversity: graph.rows[i][2] * 8,
          rapidForwardingIndex: graph.rows[i][7],
          circularPath: !!graph.rows[i][8],
        },
        risk: 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, logit)))),
      };
    });
    return {
      version: model.version,
      sender: accounts.find((a) => a.id === payment.sender)?.risk || 0,
      recipient: accounts.find((a) => a.id === payment.receiver)?.risk || 0,
      accounts: accounts.sort((a, b) => b.risk - a.risk),
      reviewThreshold: model.reviewThreshold,
      nodes: graph.ids.length,
      messagePassingHops: model.inputFeatures === 90 ? 2 : 1,
      candidateIncluded: true,
      scope:
        'Synthetic temporal graph index. Candidate edge is hypothetical; not settled. Review signal only.',
    };
  }
  const api = { features, score };
  if (typeof module !== 'undefined') module.exports = api;
  else root.ShieldTemporalGraph = api;
})(typeof window !== 'undefined' ? window : globalThis);
