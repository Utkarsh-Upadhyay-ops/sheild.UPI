/* Standalone inference and CSV utilities shared with deterministic tests. */
(function (root) {
  const names = [
    'Payment size vs usual',
    'Transfer velocity',
    'Receiver account age',
    'New recipient',
    'Unfamiliar device',
    'Night payment',
    'Incoming account count',
    'Rapid onward transfer',
    'Typing deviation',
  ];
  function predict(model, x) {
    let sum = 0;
    for (const t of model.trees) {
      let i = 0;
      while (t.left[i] !== -1) i = x[t.feature[i]] <= t.threshold[i] ? t.left[i] : t.right[i];
      sum += t.value[i];
    }
    let raw = sum / model.trees.length;
    if (!model.calibration) return raw;
    let p = Math.min(1 - 1e-6, Math.max(1e-6, raw)),
      z = model.calibration.a * Math.log(p / (1 - p)) + model.calibration.b;
    return 1 / (1 + Math.exp(-z));
  }
  function features(t) {
    return [
      t.amount / t.average,
      t.velocity,
      t.age,
      +t.newRecipient,
      +t.newDevice,
      +t.night,
      t.fanin,
      +t.rapid,
      t.behavior,
    ];
  }
  function score(model, t) {
    validateTransaction(t);
    const x = features(t),
      started = performance.now(),
      value = predict(model, x),
      ms = performance.now() - started;
    const reference = [1, 1, 365, 0, 0, 0, 0, 0, 0];
    let contributions = x
      .map((v, i) => {
        const alt = x.slice();
        alt[i] = reference[i];
        return { name: names[i], value: value - predict(model, alt), index: i };
      })
      .filter((c) => c.value > 0.002)
      .sort((a, b) => b.value - a.value);
    return { value, ms, contributions };
  }
  function decision(value, settings) {
    return value >= settings.flag ? 'Flag' : value >= settings.verify ? 'Verify' : 'Allow';
  }
  function parseCSV(s) {
    let rows = [],
      row = [],
      field = '',
      quoted = false,
      closed = false;
    s = s.replace(/^\uFEFF/, '');
    for (let i = 0; i < s.length; i++) {
      let c = s[i];
      if (quoted) {
        if (c === '"') {
          if (s[i + 1] === '"') {
            field += '"';
            i++;
          } else {
            quoted = false;
            closed = true;
          }
        } else field += c;
        continue;
      }
      if (c === ',') {
        row.push(field);
        field = '';
        closed = false;
      } else if (c === '\n' || c === '\r') {
        if (c === '\r' && s[i + 1] === '\n') i++;
        row.push(field);
        if (row.some((x) => x.trim())) rows.push(row);
        row = [];
        field = '';
        closed = false;
      } else if (c === '"') {
        if (field || closed) throw Error('Unexpected quote in CSV');
        quoted = true;
      } else {
        if (closed) throw Error('Unexpected text after closing CSV quote');
        field += c;
      }
    }
    if (quoted) throw Error('Unclosed quote in CSV');
    row.push(field);
    if (row.some((x) => x.trim())) rows.push(row);
    return rows;
  }
  function validateTransaction(t) {
    if (!t || typeof t !== 'object') throw Error('Invalid transaction');
    for (const [k, min, max] of [
      ['amount', 1, 1e7],
      ['average', 1, 1e7],
      ['velocity', 1, 1000],
      ['age', 0, 20000],
      ['fanin', 0, 1000],
      ['behavior', 0, 6],
    ])
      if (
        !Number.isFinite(t[k]) ||
        t[k] < min ||
        t[k] > max ||
        (['velocity', 'age', 'fanin'].includes(k) && !Number.isInteger(t[k]))
      )
        throw Error('Invalid ' + k);
    for (const k of ['newRecipient', 'newDevice', 'night', 'rapid'])
      if (typeof t[k] !== 'boolean') throw Error('Invalid ' + k);
    return t;
  }
  function networkSignals(incoming, outgoing) {
    let rapid = false,
      maxIncoming = 0;
    for (const o of outgoing) {
      const at = Date.parse(o.timestamp),
        senders = new Set(
          incoming
            .filter((i) => {
              let delta = at - Date.parse(i.timestamp);
              return i.sender !== o.sender && delta >= 0 && delta <= 120000;
            })
            .map((i) => i.sender),
        );
      if (senders.size) rapid = true;
      maxIncoming = Math.max(maxIncoming, senders.size);
    }
    return { rapid, windowSenders: maxIncoming, pattern: maxIncoming >= 3 };
  }

  function csvCell(v) {
    let s = String(v ?? '');
    if (/^[\s\u0000-\u001f]*[=+@-]/.test(s)) s = "'" + s;
    return '"' + s.replaceAll('"', '""') + '"';
  }
  function csv(rows) {
    return rows.map((r) => r.map(csvCell).join(',')).join('\r\n');
  }
  const api = {
    predict,
    features,
    score,
    decision,
    parseCSV,
    csv,
    names,
    validateTransaction,
    networkSignals,
  };
  if (typeof module !== 'undefined') module.exports = api;
  else root.ShieldEngine = api;
})(typeof window !== 'undefined' ? window : globalThis);
