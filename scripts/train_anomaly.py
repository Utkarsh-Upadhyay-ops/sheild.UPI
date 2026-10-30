"""Isolation Forest training and validation-only threshold selection. No bank data."""
import json
from pathlib import Path
import numpy as np
from sklearn.ensemble import IsolationForest
from sklearn.metrics import average_precision_score, confusion_matrix
ROOT=Path(__file__).resolve().parents[1]
def normal(seed,n):
 r=np.random.default_rng(seed)
 return np.stack([r.normal(0,.7,n),r.poisson(1.4,n)/4,r.binomial(1,.18,n),np.maximum(0,r.normal(.12,.12,n))],1)
def unusual(seed,n):
 r=np.random.default_rng(seed);x=normal(seed,n)
 for i in range(n):
  k=i%4
  if k==0:x[i,0]=r.uniform(2.6,4.6)
  if k==1:x[i,1]=r.uniform(2,7)
  if k==2:x[i,3]=r.uniform(.8,1)
  if k==3:x[i,:]=[r.uniform(1.5,3),r.uniform(1.5,3),1,r.uniform(.5,1)]
 return x
train=normal(8401,100000);validation=normal(8402,20000)
iso=IsolationForest(n_estimators=80,max_samples=256,random_state=8401,n_jobs=1).fit(train)
# Scores are unusualness, not fraud probabilities. Threshold sees normal validation only.
threshold=float(np.quantile(-iso.score_samples(validation),.995,method='higher'))
def metrics(seed,n,positive):
 x=np.concatenate([normal(seed,n),unusual(seed+1,positive)]);y=np.r_[np.zeros(n),np.ones(positive)];scores=-iso.score_samples(x);tn,fp,fn,tp=confusion_matrix(y,scores>=threshold,labels=[0,1]).ravel()
 return {'precision':float(tp/max(1,tp+fp)),'recall':float(tp/max(1,tp+fn)),'falsePositiveRate':float(fp/max(1,fp+tn)),'averagePrecision':float(average_precision_score(y,scores)),'positivePrevalence':float(y.mean()),'confusion':dict(zip(['tn','fp','fn','tp'],map(int,[tn,fp,fn,tp])))}
trees=[]
for estimator in iso.estimators_:
 t=estimator.tree_;trees.append(dict(left=t.children_left.tolist(),right=t.children_right.tolist(),feature=t.feature.tolist(),threshold=t.threshold.tolist(),samples=t.n_node_samples.tolist()))
p=ROOT/'models/graph-and-anomaly.json';model=json.loads(p.read_text());model['anomaly']={'version':'IF-SYN-2.1','trees':trees,'maxSamples':256,'trainingCount':100000,'reviewThreshold':threshold,'features':['log_amount_to_observed_average','recent_payment_count_div_4','new_recipient','available_behavior_deviation'],'referenceMedian':np.median(train,axis=0).tolist(),'referenceScale':np.maximum(np.std(train,axis=0),.1).tolist()};p.write_text(json.dumps(model,separators=(',',':')))
report={'version':'IF-SYN-2.1','seeds':{'training':8401,'validation':8402,'test':8410,'rareTest':8420},'trainingCount':100000,'normalValidationCount':20000,'reviewThreshold':threshold,'thresholdSelection':'99.5th percentile of normal validation unusualness, before testing','test':metrics(8410,20000,4000),'rareTrafficStress':metrics(8420,100000,500),'limitations':'Synthetic unusualness benchmark, not fraud accuracy. Unusual legitimate behavior can trigger review. Missing behavioral baseline is represented as unavailable in the payment evidence. No automatic rejection from this model alone.'}
(ROOT/'reports/anomaly-evaluation.json').write_text(json.dumps(report,indent=2)+'\n')
fixture=normal(8430,20).tolist()+unusual(8431,20).tolist();(ROOT/'tests/anomaly-parity.json').write_text(json.dumps([{'features':x,'expected':float(-iso.score_samples([x])[0])} for x in fixture]))
print(json.dumps(report))
# Keep standalone and Colab training consistent with deployed inference assets.
import shutil
shutil.copyfile(ROOT/'models/graph-and-anomaly.json', ROOT/'dist/intelligence-model.json')
shutil.copyfile(ROOT/'reports/anomaly-evaluation.json', ROOT/'dist/anomaly-evaluation.json')
