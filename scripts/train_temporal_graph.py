"""Reproducible candidate with directed aggregation and transaction-time features.
Synthetic labels use injected timing/amount motifs. Not bank accuracy.
"""
import json,subprocess,tempfile
from pathlib import Path
import numpy as np
from sklearn.metrics import precision_score,recall_score,confusion_matrix,average_precision_score
root=Path(__file__).resolve().parents[1]
with tempfile.TemporaryDirectory() as directory:
 output=Path(directory)/'temporal-graphs.json'
 subprocess.run(['node','scripts/generate_temporal_graphs.cjs',str(output)],cwd=root,check=True)
 data=json.loads(output.read_text())
def xy(split):return np.concatenate([g['rows'] for g in split]),np.concatenate([g['labels'] for g in split])
x,y=xy(data['train']);x=x.astype(np.float32);y=y.astype(np.float32)
rng=np.random.default_rng(96414);w=rng.normal(0,.15,(90,24)).astype(np.float32);v=rng.normal(0,.15,24).astype(np.float32);bias=0.
# Bounded minibatches keep the larger dataset practical on CPU and in Colab.
for epoch in range(100):
 order=rng.permutation(len(y))
 for offset in range(0,len(y),2048):
  indices=order[offset:offset+2048];batch=x[indices];labels=y[indices]
  hidden=np.maximum(0,batch@w);p=1/(1+np.exp(-np.clip(hidden@v+bias,-30,30)));d=(p-labels)*np.where(labels==1,3,1)/len(labels)
  dw=batch.T@((d[:,None]*v)*(hidden>0));dv=hidden.T@d
  w-=.055*dw;v-=.055*dv;bias-=.055*d.sum()
 if epoch%20==0:print('Training epoch',epoch,flush=True)
w=w.astype(np.float64);v=v.astype(np.float64)
def predict(rows):return 1/(1+np.exp(-np.clip(np.maximum(0,rows@w)@v+bias,-30,30)))
vx,vy=xy(data['validation']);vp=predict(vx);rx,ry=xy(data['rareValidation']);rp=predict(rx);options=[]
for t in np.unique(np.r_[np.linspace(.1,.99,250),1-np.geomspace(.01,.00000001,250)]):
 pred=vp>=t;rare_pred=rp>=t;fpr=float(((ry==0)&rare_pred).sum()/max(1,(ry==0).sum()))
 if pred.sum()>=20 and precision_score(vy,pred,zero_division=0)>=.9 and fpr<=.005:options.append((recall_score(ry,rare_pred,zero_division=0),float(t)))
threshold=max(options)[1] if options else .99999999

def evaluate(split):
 a,b=xy(split);p=predict(a);pred=p>=threshold;tn,fp,fn,tp=confusion_matrix(b,pred,labels=[0,1]).ravel();return {'precision':float(precision_score(b,pred,zero_division=0)),'recall':float(recall_score(b,pred,zero_division=0)),'averagePrecision':float(average_precision_score(b,p)) if b.sum() else None,'positivePrevalence':float(b.mean()),'falsePositiveRate':float(fp/max(1,fp+tn)),'confusion':dict(zip(['tp','fp','tn','fn'],map(int,[tp,fp,tn,fn])))}
test=evaluate(data['test']);rare=evaluate(data['rareTraffic']);promote=bool(options and test['precision']>=.85 and test['recall']>=.3 and rare['falsePositiveRate']<=.0075 and rare['recall']>=.3)
model={'version':'TEMPORAL-GNN-SYN-2.1','inputFeatures':90,'architecture':'Two directed incoming/outgoing mean aggregation hops with retained self features and a 24 unit trained ReLU head','weights':w.tolist(),'head':v.tolist(),'bias':float(bias),'reviewThreshold':threshold,'enabled':promote}
report={'version':model['version'],'seed':96411,'seeds':{'training':96411,'validation':96412,'rareValidation':96416,'test':96417,'rareTrafficTest':96418},'thresholdSelection':'Max rare-validation recall with broad-validation precision >=90% and rare-validation false positive rate <=0.5%; at least 20 broad positives','trainingGraphs':len(data['train']),'validationGraphs':len(data['validation']),'testGraphs':len(data['test']),'threshold':threshold,'validation':evaluate(data['validation']),'rareValidation':evaluate(data['rareValidation']),'test':test,'rareTrafficStress':{'graphs':len(data['rareTraffic']),'metrics':rare,'scope':'Separate rare-pattern stress split, not representative bank traffic. No threshold retuning.'},'enabledAsAuxiliaryReviewSignal':promote,'groups':[{'pattern':k,'metrics':evaluate([g for g in data['test'] if g['type']==k])} for k in ['normal','legitimate_hub','legitimate_cycle','fraud_ring','mule_forwarding','fund_chain']],'limitations':'Synthetic motif generator deliberately associates rapid timing and similar amounts with fraud. Split graphs are independent, but generated from the same assumptions. Legitimate transfers can share these motifs. Not real-world accuracy or proof of fraud. Existing graph model retained; this auxiliary layer can request verification only.'}
def split_stats(graphs):
 return {'graphs':len(graphs),'historicalTransfers':sum(len(g['history']) for g in graphs),'candidatePayments':len(graphs),'accountObservations':sum(len(g['labels']) for g in graphs),'positiveAccountLabels':sum(sum(g['labels']) for g in graphs),'patterns':{kind:sum(g['type']==kind for g in graphs) for kind in sorted({g['type'] for g in graphs})}}
report['dataset']={'kind':'Seeded synthetic graphs; no real bank data','splitIsolation':'Graph-specific account IDs and distinct random seeds across splits','trainingMethod':'100 epochs, shuffled 2048-account minibatches, CPU','splits':{name:split_stats(graphs) for name,graphs in data.items()}}
report['dataset']['totalGraphs']=sum(v['graphs'] for v in report['dataset']['splits'].values())
report['dataset']['totalHistoricalTransfers']=sum(v['historicalTransfers'] for v in report['dataset']['splits'].values())
report['dataset']['totalCandidatePayments']=sum(v['candidatePayments'] for v in report['dataset']['splits'].values())
# No threshold retuning: stress a timing shift outside the training generator.
shifted=[]
for g in data['test']:
 h=json.loads(json.dumps(g))
 from datetime import datetime, timezone, timedelta
 at=datetime.fromisoformat(h['payment']['timestamp'].replace('Z','+00:00'))
 for e in h['history']:
  dt=datetime.fromisoformat(e['timestamp'].replace('Z','+00:00'))
  e['timestamp']=(at-(at-dt)*3).isoformat().replace('+00:00','Z')
 shifted.append(h)
rows=json.loads(subprocess.check_output(['node','-e',"const T=require('./dist/temporal-graph.js');let s='';process.stdin.on('data',b=>s+=b);process.stdin.on('end',()=>console.log(JSON.stringify(JSON.parse(s).map(g=>T.features(g.history,g.payment)))));"],input=json.dumps(shifted).encode(),cwd=root))
# Use only the existing labelled accounts retained by the shifted graph.
base_graphs=json.loads(subprocess.check_output(['node','-e',"const T=require('./dist/temporal-graph.js');let s='';process.stdin.on('data',b=>s+=b);process.stdin.on('end',()=>console.log(JSON.stringify(JSON.parse(s).map(g=>T.features(g.history,g.payment).ids))));"],input=json.dumps(data['test']).encode(),cwd=root))
for h,r,g,ids in zip(shifted,rows,data['test'],base_graphs):
 labels=dict(zip(ids,g['labels']));h['rows']=r['secondHop'];h['labels']=[labels.get(id,0) for id in r['ids']]
report['timingShiftStress']={'description':'Untuned 3x slower historical movement; retained accounts only. Tests sensitivity to the 120 second feature window, not real banking generalisation.','metrics':evaluate(shifted)}
report['originalOnSameSplits']=json.loads(subprocess.check_output(['node','scripts/evaluate_temporal_baseline.cjs'],input=json.dumps({'test':data['test'],'rareTraffic':data['rareTraffic']}).encode(),cwd=root))
(root/'models/temporal-graph.json').write_text(json.dumps(model,separators=(',',':')))
(root/'reports/temporal-graph-evaluation.json').write_text(json.dumps(report,indent=2)+'\n')
fixtures=[]
for g in data['test'][:12]:fixtures.append({'history':g['history'],'payment':g['payment'],'expected':predict(np.array(g['rows'])).tolist()})
(root/'tests/temporal-graph-parity.json').write_text(json.dumps(fixtures,separators=(',',':')))
print(json.dumps({'enabled':promote,'test':test,'validation':report['validation']}))

# Keep runtime artifacts synchronized with their canonical source.
import shutil
shutil.copyfile('models/temporal-graph.json','dist/temporal-graph-model.json')
shutil.copyfile('reports/temporal-graph-evaluation.json','dist/temporal-graph-evaluation.json')
