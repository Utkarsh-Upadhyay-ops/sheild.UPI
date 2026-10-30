"""Seeded candidate experiment. Preserves deployed weights and independent test splits.
Same directed-neighborhood features and reciprocal edge weighting as intelligence.js.
Labels describe synthetic scenarios, not inferred real-world criminal intent.
"""
import json
from pathlib import Path
import numpy as np
from sklearn.metrics import precision_score, recall_score, average_precision_score, confusion_matrix
root=Path(__file__).resolve().parents[1]
base=json.loads((root/'dist/intelligence-model.json').read_text())['graph']
patterns=['normal','legitimate_hub','legitimate_cycle','fraud_ring','mule_forwarding','fund_chain']
def dataset(seed,count):
 rng=np.random.default_rng(seed);graphs=[]
 for run in range(count):
  kind=patterns[run%len(patterns)];n=int(rng.integers(10,23));a=np.zeros((n,n));y=np.zeros(n)
  # Random background at several densities, no shared accounts across graph splits.
  a[rng.random((n,n))<rng.uniform(.005,.045)]=1;np.fill_diagonal(a,0)
  ids=rng.permutation(n)
  if kind=='normal':
   for i in range(n-1):
    if rng.random()<.7:a[ids[i],ids[i+1]]=1
  if kind=='legitimate_hub':
   for i in range(1,n):a[ids[i],ids[0]]=1
  if kind in ['legitimate_cycle','fraud_ring']:
   size=int(rng.integers(3,7))
   for i in range(size):a[ids[i],ids[(i+1)%size]]=1
   if kind=='fraud_ring':y[ids[:size]]=1
  if kind=='mule_forwarding':
   for i in range(1,int(rng.integers(4,n-1))):a[ids[i],ids[0]]=1
   a[ids[0],ids[-1]]=1;y[ids[0]]=1
  if kind=='fund_chain':
   size=int(rng.integers(4,min(9,n)))
   for i in range(size-1):a[ids[i],ids[i+1]]=1
   y[ids[1:size-1]]=1
  x=np.stack([np.ones(n),np.minimum(a.sum(0)/8,1),np.minimum(a.sum(1)/8,1),((a.sum(0)>0)&(a.sum(1)>0)).astype(float)],1)
  neighbors=((a+a.T)>0).astype(float);neighbors+=a*a.T;np.fill_diagonal(neighbors,1)
  neighbors/=neighbors.sum(1,keepdims=True)
  graphs.append((np.concatenate([x,neighbors@x],1),y,kind))
 return graphs
train=dataset(80411,900);valid=dataset(80412,240);test=dataset(80413,360)
x=np.concatenate([a for a,b,c in train]);y=np.concatenate([b for a,b,c in train]);rng=np.random.default_rng(80414)
w=rng.normal(0,.2,(8,12));v=rng.normal(0,.2,12);bias=0.
for epoch in range(1800):
 hidden=np.maximum(0,x@w);p=1/(1+np.exp(-np.clip(hidden@v+bias,-30,30)));d=(p-y)*np.where(y==1,3,1)/len(y)
 dw=x.T@((d[:,None]*v)*(hidden>0));dv=hidden.T@d
 w-=.18*dw;v-=.18*dv;bias-=.18*d.sum()
def predict(model,items):
 a=np.concatenate([x for x,y,k in items]);return 1/(1+np.exp(-np.clip(np.maximum(0,a@np.array(model['weights']))@np.array(model['head'])+model['bias'],-30,30)))
candidate={'weights':w.tolist(),'head':v.tolist(),'bias':float(bias)}
vy=np.concatenate([y for x,y,k in valid]);vp=predict(candidate,valid);options=[]
for t in np.linspace(.05,.999,250):
 pred=vp>=t
 if pred.sum()>=10 and precision_score(vy,pred,zero_division=0)>=.85:options.append((recall_score(vy,pred,zero_division=0),float(t)))
threshold=max(options)[1] if options else .999;candidate['reviewThreshold']=threshold

def metrics(model,items):
 truth=np.concatenate([y for x,y,k in items]);score=predict(model,items);pred=score>=model['reviewThreshold'];tn,fp,fn,tp=confusion_matrix(truth,pred,labels=[0,1]).ravel()
 return {'precision':float(precision_score(truth,pred,zero_division=0)),'recall':float(recall_score(truth,pred,zero_division=0)),'averagePrecision':float(average_precision_score(truth,score)) if truth.sum() else None,'confusion':dict(zip(['tp','fp','tn','fn'],map(int,[tp,fp,tn,fn])))}
old=metrics(base,test);new=metrics(candidate,test)
# Promotion requires BOTH precision and recall guardrails on an untouched test split.
promotable=bool(options and new['precision']>=.85 and new['recall']>old['recall']+.05)
report={'version':'GRAPH-CANDIDATE-2','seed':80411,'trainingGraphs':900,'validationGraphs':240,'testGraphs':360,'patterns':patterns,'deployedModelModified':False,'candidatePromoted':False,'passesSyntheticPromotionGate':promotable,'decision':'Candidate not promoted: no validation threshold met the precision requirement. The fallback threshold makes no positive predictions on this test split. Deployed model preserved.' if not promotable else 'Candidate passes the synthetic gate but remains unpromoted pending independent validation.','threshold':threshold,'thresholdSelection':'Validation recall maximum with precision >= .85 and >= 10 positives; fallback .999','validation':metrics(candidate,valid),'baseline':old,'candidate':new,'groups':[{'pattern':k,'baseline':metrics(base,[g for g in test if g[2]==k]),'candidate':metrics(candidate,[g for g in test if g[2]==k])} for k in patterns],'limitations':'Benign cycles and fraudulent rings can be structurally identical. Labels are injected scenario truth; these results do not establish real banking accuracy.'}
(root/'reports/graph-candidate-evaluation.json').write_text(json.dumps(report,indent=2)+'\n')
(root/'tests/graph-candidate-weights.json').write_text(json.dumps(candidate,separators=(',',':'))+'\n')
print(json.dumps({k:report[k] for k in ['candidatePromoted','passesSyntheticPromotionGate','baseline','candidate']}))

import shutil
shutil.copyfile('reports/graph-candidate-evaluation.json','dist/graph-candidate-evaluation.json')
