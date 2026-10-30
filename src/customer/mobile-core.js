(function (root) {
  const pipeline = typeof module !== 'undefined' ? require('../shared/assessment-pipeline.js') : root.ShieldPipeline;
  const banks = [
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
  function initialiseWallet(wallet) {
    if (!wallet.accounts || !Object.keys(wallet.accounts).length) wallet.accounts = {sbi: {balance: wallet.balance}};
    if (!wallet.accounts[wallet.selectedBank]) wallet.selectedBank = Object.keys(wallet.accounts)[0];
    wallet.balance = wallet.accounts[wallet.selectedBank].balance;
    return wallet;
  }
  function selectBank(wallet, id) {
    initialiseWallet(wallet);
    if (!banks.some(b => b.id === id) || !wallet.accounts[id]) throw Error('Add this sample bank account first.');
    wallet.selectedBank = id;
    wallet.balance = wallet.accounts[id].balance;
  }
  function linkBank(wallet, id) {
    if (!banks.some(b => b.id === id)) throw Error('Choose a supported bank.');
    initialiseWallet(wallet);
    if (!wallet.accounts[id]) wallet.accounts[id] = {balance: 25000};
    selectBank(wallet, id);
  }
  function assess(model, amount, person, scenario = 'normal', options = {}) {
    const pipelineStart = performance.now();
    amount = Number(amount);
    if (!Number.isFinite(amount) || amount < 1 || amount > 100000 || Math.abs(Math.round(amount * 100) - amount * 100) > 1e-7) throw Error('Enter an amount between ₹1 and ₹1,00,000, with at most two decimal places.');
    if (!Number.isInteger(person) || person < 1 || person > 99) throw Error('Choose a person from 1 to 99.');
    if (!['normal', 'verify', 'ring', 'cycle'].includes(scenario)) throw Error('Choose a valid scenario.');
    const at = Date.now(), sender = 'person-self', receiver = 'person-' + person;
    const history = Array.from({length: 8}, (_, i) => ({sender, receiver: scenario === 'verify' ? 'person-familiar' : receiver, amount: [450, 500, 600, 400][i % 4], timestamp: new Date(at - (i + 1) * 86400000).toISOString(), settled: true}));
    if (scenario === 'ring') for (let i = 0; i < 4; i++) history.push({sender: 'person-network-' + i, receiver: sender, amount: 2000, timestamp: new Date(at - 20000 - i * 1000).toISOString(), settled: true});
    if (scenario === 'cycle') history.push({sender:receiver,receiver:'person-99',amount:1000,timestamp:new Date(at-40000).toISOString(),settled:true},{sender:'person-99',receiver:sender,amount:1000,timestamp:new Date(at-20000).toISOString(),settled:true});
    const payment = {id: 'PAY-' + crypto.randomUUID(), sender, receiver, amount, timestamp: new Date(at).toISOString(), device: 'familiar'};
    const body = {demo: true, payment, history, extraVerification: scenario === 'verify', behavior: options.behavior || {available:false}};
    const assessment = pipeline.assess(model, body);
    const rank = {Allow:0, Verify:1, Flag:2};
    let scoringMs = assessment.timings.scoringMs;
    if(options.intelligence) {
      const engine = typeof module !== 'undefined' ? require('../shared/graph-intelligence.js') : root.ShieldIntelligence;
      assessment.intelligence = engine.assess(options.intelligence, body, assessment);
      scoringMs += assessment.intelligence.scoringMs;
      if(rank[assessment.intelligence.decision] > rank[assessment.decision]) assessment.decision=assessment.intelligence.decision;
      assessment.reasons.push(...assessment.intelligence.reasons);
    }
    if(options.temporal) {
      const engine = typeof module !== 'undefined' ? require('../shared/temporal-graph.js') : root.ShieldTemporalGraph;
      const started = performance.now();
      assessment.temporalGraph = engine.score(options.temporal, history, payment);
      assessment.timings.temporalScoringMs = performance.now()-started;
      scoringMs += assessment.timings.temporalScoringMs;
      if(assessment.temporalGraph.sender >= assessment.temporalGraph.reviewThreshold && assessment.decision==='Allow') {
        assessment.decision='Verify';assessment.reasons.push('Temporal graph messages indicate unusual connected-account activity.');
      }
    }
    if(body.behavior.available && body.behavior.deviation>2 && assessment.decision==='Allow') {
      assessment.decision='Verify';assessment.reasons.push('Your measured interaction timing differs from the enrolled sample baseline.');
    }
    assessment.timings.allModelsMs=scoringMs;
    assessment.timings.pipelineTotalMs=performance.now()-pipelineStart;
    assessment.settlementPermitted=assessment.decision==='Allow';
    assessment.network = history.filter(e=>at-Date.parse(e.timestamp)<=120000).map(e=>({...e,candidate:false}));
    assessment.network.push({...payment,candidate:true});
    return {...payment, person, scenario, assessment, status: assessment.decision === 'Flag' ? 'Held for review' : assessment.decision === 'Verify' ? 'Verification required' : 'Ready to pay'};
  }
  function settle(wallet, payment, verified = false) {
    const existing = wallet.payments.find(p => p.id === payment.id);
    if (!existing || existing.status === 'Cancelled') throw Error('This payment is no longer available. Start again.');
    if (existing.status === 'Paid') return existing;
    if (existing.assessment.decision === 'Flag') throw Error('High-risk payments are held. No amount has been debited.');
    if (existing.assessment.decision === 'Verify' && !verified) throw Error('Verify the recipient before continuing.');
    const account = existing.bank && wallet.accounts ? wallet.accounts[existing.bank] : wallet;
    if (!account) throw Error('The selected sample bank account is unavailable.');
    if (account.balance < existing.amount) throw Error('Insufficient demo balance. Try a smaller amount.');
    account.balance = Math.round((account.balance - existing.amount) * 100) / 100;
    if (existing.bank === wallet.selectedBank) wallet.balance = account.balance;
    existing.status = 'Paid';
    existing.paidAt = new Date().toISOString();
    return existing;
  }
  function authorise(wallet, payment, pin, verified = false) {
    if (typeof pin !== 'string' || !/^\d{6}$/.test(pin) || pin !== '123456') throw Error('Incorrect demo PIN. Use 123456 only.');
    return settle(wallet, payment, verified);
  }
  const api = {assess, settle, authorise, banks, initialiseWallet, linkBank, selectBank};
  if (typeof module !== 'undefined') module.exports = api;
  else root.ShieldPayDemo = api;
})(typeof window !== 'undefined' ? window : globalThis);
