"""Reproducible synthetic demonstration model. Not evaluated on real payment data."""
import json, numpy as np
from pathlib import Path
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import precision_score, recall_score, average_precision_score, confusion_matrix, f1_score, brier_score_loss
from sklearn.linear_model import LogisticRegression
rng=np.random.default_rng(1104)
n=30000
y=(rng.random(n)<.025).astype(int)
rows=[]
for fraud in y:
    # Conditional distributions intentionally overlap. Labels are synthetic ground truth.
    risky = bool(fraud)
    ratio=float(np.clip(rng.lognormal(1.6 if risky else -.1,1.0),.05,80))
    velocity=int(rng.poisson(5 if risky else .8)+1)
    age=int(rng.exponential(25 if risky else 350))
    new=int(rng.random() < (.83 if risky else .22))
    device=int(rng.random() < (.58 if risky else .08))
    night=int(rng.random() < (.38 if risky else .12))
    fan=int(rng.poisson(3.5 if risky else .5))
    rapid=int(rng.random() < (.65 if risky else .09))
    behavior=float(np.clip(rng.normal(2.1 if risky else .6,1.1),0,6))
    rows.append([ratio,velocity,age,new,device,night,fan,rapid,behavior])
X=np.array(rows)
development,test=train_test_split(np.arange(n),test_size=.25,stratify=y,random_state=42)
train,cal=train_test_split(development,test_size=1/3,stratify=y[development],random_state=43)
clf=RandomForestClassifier(n_estimators=32,max_depth=7,min_samples_leaf=8,random_state=42,n_jobs=-1)
clf.fit(X[train],y[train])
def logit(p):
 p=np.clip(p,1e-6,1-1e-6);return np.log(p/(1-p)).reshape(-1,1)
calibrator=LogisticRegression(random_state=42)
calibrator.fit(logit(clf.predict_proba(X[cal])[:,1]),y[cal])
raw=clf.predict_proba(X[test])[:,1]
p=calibrator.predict_proba(logit(raw))[:,1]
calibration={'method':'sigmoid on held-out synthetic calibration data','a':float(calibrator.coef_[0,0]),'b':float(calibrator.intercept_[0])}

names=['amount_ratio','velocity','account_age','new_recipient','new_device','night_payment','distinct_incoming','rapid_onward','behavior_deviation']
def tree_data(est):
 t=est.tree_; vals=t.value[:,0,:]; probs=vals[:,1]/vals.sum(axis=1)
 return {'left':t.children_left.tolist(),'right':t.children_right.tolist(),'feature':t.feature.tolist(),'threshold':t.threshold.tolist(),'value':probs.tolist()}
metrics=[]
for threshold in [.2,.35,.5,.65,.8]:
 pred=p>=threshold; tn,fp,fn,tp=confusion_matrix(y[test],pred).ravel()
 metrics.append(dict(threshold=threshold,precision=float(precision_score(y[test],pred,zero_division=0)),recall=float(recall_score(y[test],pred)),f1=float(f1_score(y[test],pred)),tn=int(tn),fp=int(fp),fn=int(fn),tp=int(tp)))
model={'version':'RF-SYN-2.0-CAL','calibration':calibration,'features':names,'trees':[tree_data(e) for e in clf.estimators_], 'metadata':{'training_rows':len(train),'calibration_rows':len(cal),'brier_raw':float(brier_score_loss(y[test],raw)),'brier_calibrated':float(brier_score_loss(y[test],p)),'test_rows':len(test),'test_fraud':int(y[test].sum()),'prevalence':float(y[test].mean()),'average_precision':float(average_precision_score(y[test],p)),'metrics':metrics,'feature_importance':clf.feature_importances_.tolist(),'seed':1104,'description':'Synthetic class-conditional data with 2.5% fraud prevalence. Held-out synthetic evaluation only. Calibration uses a separate synthetic split; not validated for real UPI.'}}
Path('models/random-forest.json').write_text(json.dumps(model,separators=(',',':')))
Path('tests/parity.json').write_text(json.dumps([{'x':X[i].tolist(),'expected':float(calibrator.predict_proba(logit(clf.predict_proba(X[i:i+1])[:,1]))[0,1])} for i in test[:50]]))
print(json.dumps(model['metadata'],indent=2))

# Keep runtime artifacts synchronized with their canonical source.
import shutil
shutil.copyfile('models/random-forest.json','dist/model.json')
