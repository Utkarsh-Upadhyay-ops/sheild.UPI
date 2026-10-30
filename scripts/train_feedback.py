"""Train an isolated candidate calibrator from exported review labels. Never auto deploy."""
import argparse,json
import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import train_test_split
from sklearn.metrics import brier_score_loss,average_precision_score
p=argparse.ArgumentParser();p.add_argument('feedback');p.add_argument('--output',default='feedback-candidate.json');a=p.parse_args()
d=json.load(open(a.feedback));records=d['records'];unique={r['id']:r for r in records};rows=list(unique.values())
if len(rows)<100:raise SystemExit('At least 100 distinct reviewed records required; candidate not trained.')
x=np.array([r['score'] for r in rows]);y=np.array([r['label']=='fraud' for r in rows],dtype=int)
if min(y.sum(),len(y)-y.sum())<20:raise SystemExit('At least 20 examples of each class required.')
if not np.all(np.isfinite(x)) or np.any((x<0)|(x>1)):raise SystemExit('Invalid scores.')
x=np.log(np.clip(x,.0001,.9999)/(1-np.clip(x,.0001,.9999))).reshape(-1,1)
xt,xv,yt,yv=train_test_split(x,y,test_size=.3,stratify=y,random_state=411)
m=LogisticRegression().fit(xt,yt);pred=m.predict_proba(xv)[:,1]
report={'status':'candidate-only, requires review and representative independent testing','coefficient':float(m.coef_[0,0]),'intercept':float(m.intercept_[0]),'trainCount':len(xt),'testCount':len(xv),'brier':float(brier_score_loss(yv,pred)),'averagePrecision':float(average_precision_score(yv,pred)),'warning':'Labels supplied by demo reviewers are unverified. This candidate does not change the live model.'}
with open(a.output,'w') as f:json.dump(report,f,indent=2)
print('Candidate saved; live model unchanged.')
