import config from '../config/payment-cloud.json' with {type:'json'};
const headers={'Cache-Control':'no-store','Content-Type':'application/json','X-Content-Type-Options':'nosniff'};
export default {async fetch(request){
  if(!['GET','POST'].includes(request.method))return Response.json({error:'Method not allowed'},{status:405,headers});
  if(request.method==='POST'&&request.headers.get('origin')!==new URL(request.url).origin)return Response.json({error:'Same origin required'},{status:403,headers});
  try{
    let body;
    if(request.method==='POST'){
      if(!request.headers.get('content-type')?.includes('application/json'))return Response.json({error:'JSON required'},{status:415,headers});
      body=await request.text();
      if(body.length>150000)return Response.json({error:'Request too large'},{status:413,headers});
    }
    const response=await fetch(config.endpoint,{method:request.method,headers:{apikey:config.publishableKey,...(body?{'Content-Type':'application/json'}:{})},...(body?{body}:{}),signal:AbortSignal.timeout(15000)});
    return new Response(await response.text(),{status:response.status,headers});
  }catch{return Response.json({error:'Shared payment history unavailable. Your local payment is preserved.'},{status:503,headers});}
}};
