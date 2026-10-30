/* Same-origin demo record bridge. No credentials or PIN data are read. */
(function(root){
  const key='shieldpay-mobile-v1';
  const states=new Set(['Ready to pay','Verification required','Held for review','Paid','Cancelled']);
  function feedback(r){
    if(!r||!['Looks right','Not sure','Suspicious'].includes(r.answer)||!['unsure','unauthorised','impersonation','pressure','goods'].includes(r.reason)||!Number.isFinite(Date.parse(r.updatedAt)))return null;
    return {answer:r.answer,reason:r.reason,updatedAt:new Date(r.updatedAt).toISOString()};
  }
  function record(p){
    if(!p||typeof p.id!=='string'||!/^PAY-[a-zA-Z0-9-]{5,80}$/.test(p.id)||!states.has(p.status))return null;
    const a=p.assessment,s=a?.signals,t=a?.timings;
    if(!s||!t||!['Allow','Verify','Flag'].includes(a.decision)||!Number.isFinite(a.modelScore)||a.modelScore<0||a.modelScore>1||!Number.isFinite(Date.parse(p.timestamp)))return null;
    if(!Number.isFinite(p.amount)||p.amount<1||p.amount>1e7||!/^person-(?:self|[1-9]\d?)$/.test(p.sender)||!/^person-[1-9]\d?$/.test(p.receiver))return null;
    for(const [field,min,max] of [['average',1,1e7],['velocity',1,1000],['age',0,20000],['fanin',0,1000],['behavior',0,6]])if(!Number.isFinite(s[field])||s[field]<min||s[field]>max)return null;
    for(const field of ['newRecipient','newDevice','night','rapid'])if(typeof s[field]!=='boolean')return null;
    if(!['velocity','age','fanin'].every(field=>Number.isInteger(s[field])))return null;
    if(!Number.isFinite(t.scoringMs)||t.scoringMs<0||!Number.isFinite(t.serverTotalMs)||t.serverTotalMs<0)return null;
    if(!a.policy||!(a.policy.verify>0&&a.policy.verify<a.policy.flag&&a.policy.flag<1))return null;
    if(p.status==='Paid'&&a.decision==='Flag')return null;
    const contributions=(Array.isArray(a.contributions)?a.contributions:[]).filter(c=>c&&typeof c.name==='string'&&c.name.length<=100&&Number.isFinite(c.value)).slice(0,9);
    return {
      ...Object.fromEntries(['average','velocity','age','fanin','behavior','newRecipient','newDevice','night','rapid'].map(k=>[k,s[k]])),id:p.id,shieldPayId:p.id,sender:p.sender,receiver:p.receiver,amount:p.amount,
      timestamp:p.status==='Paid'&&Number.isFinite(Date.parse(p.paidAt))?p.paidAt:p.timestamp,
      createdAt:p.timestamp,status:p.status,source:'ShieldPay',bank:typeof p.bank==='string'?p.bank.slice(0,30):'',
      risk:a.modelScore,decision:a.decision,scoreMs:t.scoringMs,assessmentMs:Number.isFinite(t.pipelineTotalMs)?t.pipelineTotalMs:t.serverTotalMs,
      contributions,thresholds:{verify:a.policy.verify,flag:a.policy.flag},model:String(a.modelVersion||'RF-SYN').slice(0,50),
      ...(p.status==='Paid'&&feedback(p.customerReport)?{customerReport:feedback(p.customerReport)}:{}),
      settled:p.status==='Paid',graphHistory:(Array.isArray(a.network)?a.network:[]).filter(e=>e&&!e.candidate&&/^[a-zA-Z0-9_-]{1,60}$/.test(e.sender)&&/^[a-zA-Z0-9_-]{1,60}$/.test(e.receiver)&&Number.isFinite(e.amount)&&e.amount>=1&&e.amount<=1e7&&Number.isFinite(Date.parse(e.timestamp))).slice(0,180).map(e=>({sender:e.sender,receiver:e.receiver,amount:e.amount,timestamp:e.timestamp,settled:e.settled===true})),
    };
  }
  function read(raw){
    try{const data=JSON.parse(raw);if(!data||!Array.isArray(data.payments))return null;return data.payments.slice(0,100).map(record).filter(Boolean);}catch{return null;}
  }
  function merge(current,incoming,limit=1500){
    const ids=new Set(),rows=[...incoming,...current.filter(t=>t.source!=='ShieldPay')];
    return rows.filter(t=>{if(ids.has(t.id))return false;ids.add(t.id);return true;}).sort((a,b)=>Date.parse(b.timestamp)-Date.parse(a.timestamp)).slice(0,limit);
  }
  function normalise(row){
    if(!row)return null;
    return record({...row,timestamp:row.createdAt,paidAt:row.timestamp,assessment:{signals:row,timings:{scoringMs:row.scoreMs,serverTotalMs:row.assessmentMs},decision:row.decision,modelScore:row.risk,policy:row.thresholds,contributions:row.contributions,modelVersion:row.model,network:row.graphHistory}});
  }
  function combine(local,remote){
    const rows=new Map(remote.map(r=>[r.id,r]));
    const terminal=new Set(['Paid','Cancelled','Held for review']);
    for(const row of local){
      const old=rows.get(row.id);
      if(!old||(!terminal.has(old.status)&&terminal.has(row.status)))rows.set(row.id,row);
      const current=rows.get(row.id);
      const reports=[feedback(old?.customerReport),feedback(row.customerReport)].filter(Boolean).sort((a,b)=>Date.parse(b.updatedAt)-Date.parse(a.updatedAt));
      if(current?.status==='Paid'&&reports.length)rows.set(row.id,{...current,customerReport:reports[0]});
    }
    return [...rows.values()].sort((a,b)=>Date.parse(b.timestamp)-Date.parse(a.timestamp));
  }
  const api={key,record,read,merge,normalise,combine,feedback};
  if(typeof module!=='undefined')module.exports=api;else root.ShieldPaymentBridge=api;
})(typeof window!=='undefined'?window:globalThis);
