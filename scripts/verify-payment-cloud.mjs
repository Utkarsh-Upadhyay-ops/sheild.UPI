import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import gateway from '../api/demo-payments.mjs';
import config from '../config/payment-cloud.json' with {type:'json'};
const require=createRequire(import.meta.url),bridge=require('../src/shared/payment-bridge.js'),core=require('../src/customer/mobile-core.js'),model=require('../models/random-forest.json');
const endpoint=process.argv.slice(2).find(a=>a.startsWith('http'))||'https://upi-shield-beta.vercel.app/api/demo-payments';
const local=process.argv.includes('--direct');
async function call(method,body){
  const request=new Request(endpoint,{method,headers:{Origin:new URL(endpoint).origin,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
  const response=local?await gateway.fetch(request):await fetch(request);
  const data=await response.json();assert.equal(response.status,200,JSON.stringify(data));return data.records;
}
const payment=core.assess(model,431,3);payment.bank='sbi';
const wallet={balance:25000,payments:[payment]},pending=bridge.record(payment);
await call('POST',{records:[pending]});
core.authorise(wallet,payment,'123456');const paid=bridge.record(payment);
await call('POST',{records:[paid]});
await call('POST',{records:[pending]}); // A delayed request must never revert Paid.
const help=require('../src/customer/payment-help.js');
help.respond(payment,'Suspicious','pressure');const reported=bridge.record(payment);
await call('POST',{records:[reported]});
await call('POST',{records:[paid]}); // A stale completed record cannot erase the concern.
const records=await call('GET');
const found=records.find(r=>r.id===paid.id);assert(found);assert.equal(found.status,'Paid');assert.equal(found.amount,431);assert.equal(found.settled,true);assert.equal(found.customerReport.answer,'Suspicious');assert.equal(found.customerReport.reason,'pressure');
const unauthorised=await fetch(config.endpoint);assert.equal(unauthorised.status,401);
const denied=await fetch('https://xnzggjtswmohpwjqwwpz.supabase.co/rest/v1/shield_demo_payments?select=id',{headers:{apikey:config.publishableKey}});assert.equal(denied.status,401);
const invalid=await fetch(config.endpoint,{method:'POST',headers:{apikey:config.publishableKey,'Content-Type':'application/json'},body:JSON.stringify({records:[{id:'PAY-invalid-value',status:'Paid',pin:'never-store'}]})});assert.equal(invalid.status,400);
console.log(JSON.stringify({passed:true,reference:payment.id,amount:found.amount,status:found.status,independentRead:true,stalePendingIgnored:true,customerReportPreserved:true,directTableAccessDenied:true,invalidInputDenied:true}));
