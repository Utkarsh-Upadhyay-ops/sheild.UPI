import './payment-bridge.js';
const bridge=(globalThis as any).ShieldPaymentBridge;
const headers={'Content-Type':'application/json','Cache-Control':'no-store'};
async function database(path:string,method='GET',body?:unknown){
  const key=JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')||'{}').default||Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const response=await fetch(Deno.env.get('SUPABASE_URL')+'/rest/v1/'+path,{method,headers:{apikey:key,...(key?.startsWith('eyJ')?{Authorization:'Bearer '+key}:{}),'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
  if(!response.ok)throw Error('Database request failed');
  return response.json();
}
Deno.serve(async(req:Request)=>{
  const keys=Object.values(JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS')||'{}'));
  if(!keys.includes(req.headers.get('apikey')))return Response.json({error:'Invalid app key'},{status:401,headers});
  if(!['GET','POST'].includes(req.method))return Response.json({error:'Method not allowed'},{status:405,headers});
  try{
    if(req.method==='GET'){
      const rows=await database('shield_demo_payments?select=record&order=updated_at.desc&limit=500');
      return Response.json({records:rows.map((r:any)=>r.record)},{headers});
    }
    const raw=await req.text();if(raw.length>150000)return Response.json({error:'Too large'},{status:413,headers});
    let data;try{data=JSON.parse(raw);}catch{return Response.json({error:'Invalid JSON'},{status:400,headers});}
    if(!Array.isArray(data.records)||data.records.length<1||data.records.length>10)return Response.json({error:'Invalid batch'},{status:400,headers});
    const records=data.records.map((r:any)=>bridge.normalise(r));
    if(records.some((r:any)=>!r||Date.parse(r.createdAt)>Date.now()+300000||Date.parse(r.createdAt)<Date.now()-30*86400000||r.customerReport&&Date.parse(r.customerReport.updatedAt)>Date.now()+300000))return Response.json({error:'Invalid synthetic payment'},{status:400,headers});
    const saved=[];
    for(const record of records)saved.push(await database('rpc/shield_save_demo_payment','POST',{payment:record}));
    return Response.json({records:saved},{headers});
  }catch{return Response.json({error:'Shared payment history temporarily unavailable'},{status:503,headers});}
});
