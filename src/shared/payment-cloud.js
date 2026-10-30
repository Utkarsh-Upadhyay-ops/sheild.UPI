/* Public, synthetic hackathon ledger. Never sends wallet balances, PINs or raw biometrics. */
(function(root){
  function create(options={}){
    const request=options.fetch||root.fetch.bind(root), endpoint=options.endpoint||'./api/demo-payments';
    const pending=new Map(), acknowledged=new Map();
    let sending=false,closed=false,timer=null,retry=null,lastFeed='';
    const status=(message)=>options.onStatus?.(message);
    async function json(method,body){
      const response=await request(endpoint,{method,cache:'no-store',headers:body?{'Content-Type':'application/json'}:{},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(12000)});
      if(!response.ok)throw Error('Shared history unavailable');
      const data=await response.json();
      if(!Array.isArray(data.records))throw Error('Invalid history response');
      return data.records;
    }
    async function flush(){
      if(sending||closed||!pending.size)return;
      sending=true;status('Sharing payments with Shield…');
      const batch=[...pending.values()].slice(0,10);
      let failed=false;
      try{
        await json('POST',{records:batch});
        for(const row of batch){
          const fingerprint=JSON.stringify(row);acknowledged.set(row.id,fingerprint);
          if(JSON.stringify(pending.get(row.id))===fingerprint)pending.delete(row.id);
        }
        status(pending.size?'Sharing payments with Shield…':'Shared with Shield · phone and laptop');
      }catch{failed=true;status('Saved on this device · sharing will retry');}
      finally{sending=false;if(pending.size&&!closed)retry=setTimeout(flush,failed?3000:0);}
    }
    function publish(records){
      for(const row of records)if(row&&acknowledged.get(row.id)!==JSON.stringify(row))pending.set(row.id,row);
      void flush();
    }
    async function poll(){
      try{
        const rows=await json('GET'),fingerprint=JSON.stringify(rows);
        if(fingerprint!==lastFeed){lastFeed=fingerprint;options.onRecords?.(rows);}
        status('Live across devices · updates every 2 seconds');
        return rows;
      }catch{status('Connection interrupted · retrying automatically');return null;}
    }
    async function tick(){await poll();if(!closed)timer=setTimeout(tick,options.pollMs||2000);}
    return {publish,poll,flush,start(){closed=false;void tick();},stop(){closed=true;clearTimeout(timer);clearTimeout(retry);}};
  }
  const api={create};
  if(typeof module!=='undefined')module.exports=api;else root.ShieldPaymentCloud=api;
})(typeof window!=='undefined'?window:globalThis);
