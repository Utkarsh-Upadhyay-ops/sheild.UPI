"""Reproducible synthetic graph convolution and Isolation Forest training."""
import numpy as np,json
from sklearn.ensemble import IsolationForest
from sklearn.metrics import average_precision_score,precision_score,recall_score,confusion_matrix
from pathlib import Path
rng=np.random.default_rng(411)
def graph(risky):
 n=12;a=np.zeros((n,n));
 for i in range(n):
  for j in range(n):
   if i!=j and rng.random()<.045:a[i,j]=1
 y=np.zeros(n)
 if risky:
  ids=rng.choice(n,4,replace=False);y[ids]=1
  for i in range(4):a[ids[i],ids[(i+1)%4]]=1
  for i in range(n):
   if i not in ids and rng.random()<.65:a[i,ids[0]]=1
 x=np.stack([np.ones(n),np.minimum(a.sum(0)/8,1),np.minimum(a.sum(1)/8,1),((a.sum(0)>0)&(a.sum(1)>0)).astype(float)],1)
 b=a+a.T+np.eye(n);b=b/b.sum(1,keepdims=True)
 return np.concatenate([x,b@x],1),y
sets=[graph(i%3==0) for i in range(900)]
x=np.concatenate([a for a,b in sets[:650]]);y=np.concatenate([b for a,b in sets[:650]])
w=rng.normal(0,.2,(8,12));v=rng.normal(0,.2,12);bias=0.
for epoch in range(1600):
 h=np.maximum(0,x@w);p=1/(1+np.exp(-np.clip(h@v+bias,-30,30)));d=(p-y)*np.where(y==1,4,1)/len(y)
 dw=x.T@((d[:,None]*v)*(h>0));dv=h.T@d
 w-=.15*dw;v-=.15*dv;bias-=.15*d.sum()
def predict(items):
 tx=np.concatenate([a for a,b in items]);ty=np.concatenate([b for a,b in items]);p=1/(1+np.exp(-np.clip(np.maximum(0,tx@w)@v+bias,-30,30)))
 return ty,p
vy,vp=predict(sets[650:775]);ty,p=predict(sets[775:])
options=[]
for threshold in np.linspace(.05,.999,250):
 pred=vp>=threshold
 if pred.sum()>=10 and precision_score(vy,pred,zero_division=0)>=.85:options.append((recall_score(vy,pred,zero_division=0),float(threshold)))
review_threshold=max(options)[1] if options else .999
pred=p>=review_threshold
tn,fp,fn,tp=confusion_matrix(ty,pred,labels=[0,1]).ravel()

z=np.stack([rng.normal(0,.6,6000),rng.poisson(1,6000)/4,rng.binomial(1,.1,6000),rng.normal(0,.25,6000)],1)
iso=IsolationForest(n_estimators=40,max_samples=128,random_state=411).fit(z)
trees=[]
for estimator in iso.estimators_:
 t=estimator.tree_;trees.append({'left':t.children_left.tolist(),'right':t.children_right.tolist(),'feature':t.feature.tolist(),'threshold':t.threshold.tolist(),'samples':t.n_node_samples.tolist()})
out={'version':'INT-SYN-1.1','scope':'Synthetic research models, not validated on real payments','graph':{'architecture':'One mean aggregation message passing layer, concatenated self features, 12 unit ReLU head','weights':w.tolist(),'head':v.tolist(),'bias':bias,'trainingGraphs':650,'validationGraphs':125,'testGraphs':125,'reviewThreshold':review_threshold,'thresholdSelection':'Max validation recall with precision >= 85% and >=10 predicted positives; fallback .999','validationPrecision':float(precision_score(vy,vp>=review_threshold,zero_division=0)),'validationRecall':float(recall_score(vy,vp>=review_threshold,zero_division=0)),'confusion':{'tp':int(tp),'fp':int(fp),'tn':int(tn),'fn':int(fn)},'averagePrecision':float(average_precision_score(ty,p)),'precision':float(precision_score(ty,p>=review_threshold,zero_division=0)),'recall':float(recall_score(ty,p>=review_threshold,zero_division=0))},'anomaly':{'trees':trees,'maxSamples':128,'trainingCount':6000}}
Path('models/graph-and-anomaly.json').write_text(json.dumps(out,separators=(',',':')))
print(json.dumps({k:out['graph'][k] for k in ['trainingGraphs','testGraphs','averagePrecision','precision','recall']}))

# Keep runtime artifacts synchronized with their canonical source.
import shutil
shutil.copyfile('models/graph-and-anomaly.json','dist/intelligence-model.json')
