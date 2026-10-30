/* Observable-context policies for the 20 fraud types in the supplied guide. */
(function (root) {
  const catalog = [
    [
      'qr',
      'QR code payment scam',
      'directionMismatch',
      'Hold',
      'The payment direction conflicts with the stated intention.',
      'Trusted intent and payment direction',
    ],
    [
      'collect',
      'Unexpected collect request',
      'unexpectedCollect',
      'Verify',
      'An unrecognised collect request needs independent confirmation.',
      'Collect request metadata',
    ],
    [
      'refund',
      'Fake cashback or refund',
      'payToReceive',
      'Hold',
      'The flow asks for a debit to receive a refund or reward.',
      'Trusted offer and payment direction',
    ],
    [
      'phishing',
      'Phishing link',
      'untrustedCredentialOrigin',
      'Hold',
      'A credential flow was initiated from an unverified origin.',
      'App origin or browser security integration',
    ],
    [
      'support',
      'Fake customer support',
      'unverifiedSupportPayment',
      'Verify',
      'An unverified support contact is requesting a payment.',
      'Verified support channel context',
    ],
    [
      'remote',
      'Screen sharing or remote access',
      'remoteAccessActive',
      'Hold',
      'A remote access signal is present during payment.',
      'Native device security integration',
    ],
    [
      'sim',
      'SIM swap',
      'recentSimChange',
      'Verify',
      'A recent SIM change requires additional authentication.',
      'Telecom or bank supplied SIM signal',
    ],
    [
      'apk',
      'Malicious app',
      'unsafeAppAttestation',
      'Hold',
      'Device app attestation reports an unsafe application environment.',
      'Native platform attestation',
    ],
    [
      'takeover',
      'Account takeover',
      'sessionMismatch',
      'Verify',
      'Session identity differs from the established profile.',
      'Trusted session and device history',
    ],
    [
      'mule',
      'Mule account network',
      'fanIn',
      'Hold',
      'Several incoming accounts converge before this onward payment.',
      'Recent settled transaction graph',
    ],
    [
      'ring',
      'Coordinated fraud ring',
      'cycle',
      'Hold',
      'The candidate payment closes a recent transfer cycle.',
      'Recent settled transaction graph',
    ],
    [
      'chain',
      'Multi hop fund transfers',
      'chain',
      'Verify',
      'The sender has a recent inbound transfer chain of at least three hops.',
      'Recent settled transaction graph',
    ],
    [
      'split',
      'Transaction splitting',
      'split',
      'Verify',
      'Several recent payments have a high combined value relative to typical spending.',
      'Sender transaction history',
    ],
    [
      'merchant',
      'Fake online merchant',
      'unverifiedMerchant',
      'Verify',
      'Merchant identity has not been independently verified.',
      'Merchant verification service',
    ],
    [
      'replacement',
      'Merchant QR replacement',
      'merchantIdentityMismatch',
      'Hold',
      'The scanned recipient conflicts with the expected merchant identity.',
      'Trusted merchant identity and scanned recipient',
    ],
    [
      'investment',
      'Investment or trading scam',
      'guaranteedReturnClaim',
      'Verify',
      'A guaranteed return claim needs independent provider verification.',
      'User report or trusted message analysis',
    ],
    [
      'job',
      'Fake job or task scam',
      'payToUnlockEarnings',
      'Hold',
      'The request asks for a payment to unlock a job or supposed earnings.',
      'User report or trusted message analysis',
    ],
    [
      'impersonation',
      'Friend or official impersonation',
      'unverifiedUrgentRequest',
      'Verify',
      'An urgent request has not been confirmed through a separate trusted channel.',
      'Independent contact verification',
    ],
    [
      'extortion',
      'Digital arrest extortion',
      'coerciveOfficialDemand',
      'Hold',
      'A coercive official claim is requesting a transfer.',
      'User report or trusted message analysis',
    ],
    [
      'bot',
      'Automated or bot abuse',
      'bot',
      'Hold',
      'Payment attempt velocity exceeds the configured demonstration limit.',
      'Recent sender requests',
    ],
  ].map(([id, name, signal, action, reason, requires]) => ({
    id,
    name,
    signal,
    action,
    reason,
    requires,
    category: ['mule', 'ring', 'chain', 'split', 'bot'].includes(id)
      ? 'Transaction and graph signals'
      : ['investment', 'job', 'impersonation', 'extortion', 'support', 'merchant'].includes(id)
        ? 'Reports and external verification'
        : 'Trusted device, bank or session signals',
  }));
  function evaluate(body, base) {
    const ctx = body.protectionContext;
    if (ctx !== undefined && (!ctx || typeof ctx !== 'object' || Array.isArray(ctx)))
      throw Error('Invalid protection context');
    const source = ctx || {};
    for (const [k, v] of Object.entries(source))
      if (!catalog.some((r) => r.signal === k) || typeof v !== 'boolean')
        throw Error('Invalid protection signal');
    const at = Date.parse(body.payment.timestamp),
      recent = body.history.filter(
        (h) =>
          h.settled !== false &&
          Date.parse(h.timestamp) <= at &&
          at - Date.parse(h.timestamp) <= 120000,
      ),
      out = body.history.filter(
        (h) =>
          h.sender === body.payment.sender &&
          Date.parse(h.timestamp) <= at &&
          at - Date.parse(h.timestamp) <= 60000,
      ),
      senders = new Set(
        recent.filter((h) => h.receiver === body.payment.sender).map((h) => h.sender),
      );
    let reverse = new Map();
    for (const e of recent) {
      if (!reverse.has(e.receiver)) reverse.set(e.receiver, []);
      reverse.get(e.receiver).push(e.sender);
    }
    let chainPath = null,
      queue = [[body.payment.sender]];
    while (queue.length && !chainPath) {
      let p = queue.shift();
      if (p.length >= 4) {
        chainPath = p.slice().reverse();
        break;
      }
      for (const prev of reverse.get(p.at(-1)) || [])
        if (!p.includes(prev)) queue.push([...p, prev]);
      if (queue.length > 2000) break;
    }
    const derived = {
      fanIn: senders.size >= 3,
      cycle: !!base.graph.cycle,
      chain: !!chainPath,
      split:
        out.length >= 5 &&
        out.reduce((a, h) => a + h.amount, body.payment.amount) > base.profile.median * 10,
      bot: out.length >= 20,
    };
    const checks = catalog.map((rule) => {
      const available = rule.signal in derived || rule.signal in source,
        value = rule.signal in derived ? derived[rule.signal] : source[rule.signal];
      return {
        ...rule,
        status: !available ? 'Unavailable' : value ? 'Triggered' : 'Clear',
        source:
          rule.signal in derived
            ? 'Derived from supplied sample history'
            : 'Supplied context; not independently verified',
      };
    });
    const triggered = checks.filter((c) => c.status === 'Triggered'),
      decision = triggered.some((c) => c.action === 'Hold')
        ? 'Flag'
        : triggered.length
          ? 'Verify'
          : 'Allow';
    return {
      decision,
      triggered,
      checks,
      chainPath,
      scope:
        'Demonstration policies on supplied sample context. Missing signals are unavailable, not safe. Flags are not proof of fraud.',
    };
  }
  const api = { catalog, evaluate };
  if (typeof module !== 'undefined') module.exports = api;
  else root.ShieldProtection = api;
})(typeof window !== 'undefined' ? window : globalThis);
