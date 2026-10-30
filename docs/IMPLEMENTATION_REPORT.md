# UPI Shield

UPI Shield and ShieldPay share a server-authoritative simulated payment ledger. The existing visual design, random forest, graph model, Isolation Forest, scenario library and payment authorisation interface are preserved.

Live command center: https://upi-shield-beta.vercel.app/

Customer app: https://upi-shield-beta.vercel.app/pay

## Run locally

Use Node 22 or newer (local development requires `node:sqlite`). Run `npm ci` and `npm run dev`. The development server uses a local SQLite file and prints a local-only investigator access code. That code is not valid on the hosted site. Production requires `DATABASE_URL` (or `POSTGRES_URL`) and a private `INVESTIGATOR_ACCESS_CODE` of at least 16 characters. Never place either in frontend code. Vercel environment changes require redeployment.

The existing Vercel project is connected to free Neon Postgres in iad1. The backend now lazily applies `migrations/002_record_storage.sql`, migrating the legacy workspace when present. It fails closed if database configuration is missing; it never falls back to browser storage in production. The standalone offline file retains the original explicitly local simulation and cannot synchronize devices.

## How the integrated system works

1. ShieldPay obtains an opaque HttpOnly customer session and connects a sample bank using explicit consent and the displayed demo code `123456`. A server-generated sample balance and payment history are created.
2. Payment intent is persisted as Pending assessment. The server loads authoritative history and derives transaction, graph, anomaly and available experimental interaction features using the existing assessment pipeline.
3. The decision, signals, graph evidence, timings and audit history are persisted. Customer and protected investigator interfaces poll the same database every 1.5 seconds while visible.
4. Allowed payments require explicit customer demo authorisation before settlement. Verification required payments require the additional displayed demo code. Held payments cannot settle. An investigator must record a reason to release or cancel them; release still requires customer authorisation.
5. Settlement and balance debit use a versioned database compare-and-swap transaction. Repeated settlement is idempotent. Customer sessions cannot inspect other customers or release held payments.

All balances, banks, identities and settlements are simulated. The site is independent of NPCI, PhonePe and banks. Logos identify sample providers; sources remain in `BANK_LOGO_SOURCES.json`. No bank credentials or real UPI PINs are requested.

## Demonstration

1. On a phone open ShieldPay; connect a sample bank with consent and `123456`.
2. On a laptop open the command center and enter the private investigator code. Keep this code private.
3. Select Everyday payment and continue. The same record appears automatically in Live transactions. Authorise with the displayed demo keypad; both screens show Settled and the audit entry.
4. Select Mule network and continue. The generated synthetic network evidence causes a hold. The laptop shows the payment and alert without manual transaction entry.
5. Open the transaction, inspect signals and directed graph connections, then open Investigations. Record a reason and release or cancel.
6. Observe the updated phone status. A release does not debit funds; the customer must authorise. Review the receipt timeline and measured request/model timings.
7. Optionally enroll typing and swipe timings under Experimental interaction check on the send form. Without an enrolled baseline and current comparison the signal is unavailable. Only derived timing features leave the tab, never raw keys or sensitive inputs.
8. Advanced tools contain the automatic simulator, 20 scenario suite, behavioral experiment, model details and settings. The simulator runs while its page remains open, with start/pause/reset/speed controls. Generated records are explicitly separate from ShieldPay payments.

## Validation

Run the following checks:

```
node tests/engine.test.cjs
node tests/app.test.cjs
node tests/api.test.mjs
node tests/protection.test.mjs
node tests/pay.test.cjs
node tests/intelligence.test.mjs
node tests/pipeline.test.cjs
node tests/workspace.test.mjs
node tests/command-render.test.mjs
node scripts/evaluate_graph_patterns.cjs
python scripts/build_offline.py
```

All nine suites passed on 2026-10-30. The shared workspace tests cover independent sessions, ownership, forged-history rejection, duplicate creation, concurrent single debit, held settlement restriction, protected review, consented behavior and missing signals. Render tests cover graph evidence, alerts and failed assessment gating.

`tests/live-verification-20261030.json` contains actual hosted tests using independent HTTP cookie jars. Normal request: 152.09 ms; held request: 204.22 ms. Normal/held model inference: 0.099/0.218 ms. These are observations, not guarantees. The browser customer journey also completed assessment, keypad authorisation and settlement against the hosted database (176.1 ms assessment request shown in its receipt).

The live authenticated benchmark exercised database reads and model assessment, **not ledger writes or bank settlement**. Twenty requests per concurrency level:

| Concurrency | P50 ms |  P95 ms | P99 / max ms | Model P95 ms | Failures | Throughput / s |
| ----------- | -----: | ------: | -----------: | -----------: | -------: | -------------: |
| 1           | 130.97 |  174.39 |       207.27 |        0.135 |     0/20 |           7.08 |
| 3           | 127.26 | 7329.39 |      7336.85 |        0.108 |     0/20 |           2.72 |
| 5           | 163.08 | 7705.58 |      7781.05 |        0.907 |     0/20 |           2.44 |

These executor-to-host observations include network and platform startup effects; their individual causes were not isolated. They do not establish the required sub-500 ms latency under load. Model scoring stayed below 200 ms in this small run. No high-volume SLA is claimed. Performance Testing exposes repeatable authenticated tests and honest failure/percentile/throughput results.

## Model evaluation

Both trained model artifacts are byte-identical to the pre-change backup. Existing synthetic held-out graph precision is 82.6% and recall 34.8%. New seeded stress tests in `scripts/evaluate_graph_patterns.cjs` and `dist/graph-evaluation.json` expose weak patterns: fraud-ring recall 3.5%, forwarding recall 100%, fund-chain recall 5.25%. These small synthetic results are not real-world accuracy. Some legitimate and fraudulent cycles have indistinguishable topology; transaction graphs alone cannot establish criminal intent. Graph policy evidence and the learned graph score are shown separately. Deployed weights remain unchanged. A separate, unpromoted retraining experiment is documented below.

The random forest uses synthetic data and calibration; the exported graph network performs mean neighborhood message passing and a trained neural head. The Isolation Forest is preserved. Scores are risk indices, not validated real-world fraud probabilities. Experimental behavioral comparisons are spoofable client measurements, not identity authentication. The 20 scenarios are separated into transaction/graph signals, trusted bank/device/session inputs, and reports/external verification. Injected scenario signals are explicitly synthetic.

## Scope and remaining work

This is a functional integrated demonstration, not deployable banking infrastructure. The earlier single JSONB workspace has been superseded by atomic per-record storage, described in the current implementation section below. Full bounded snapshots (1,000 payment records, 1,500 history edges) still require further query and capacity work before scale. Polling transfers a bounded snapshot and is not a high-volume event bus. Other gaps: bank integrations, trusted device/location attestations, production identity/MFA and recovery, push notifications, tamper-evident audit retention, automated model promotion/drift response and operational monitoring. Sessions identify browsers for 24 hours; customer sign-in across devices is not implemented, while different customer and admin devices do share backend records. Simulator operation is browser driven, not an always-running worker.

The stateless `/api/assess` remains available for advanced synthetic experiments and accepts synthetic history. It is not the authoritative payment endpoint. Hosted ShieldPay uses `/api/workspace`, which rejects caller-supplied history. Old local advanced tools and imported browser records are not silently promoted to the shared ledger.

The pre-change backup is outside the project in `../upi-shield-backups/before-shared-backend-20261030.tar.gz`. The deployable archive contains source, models, migrations and tests, never environment secrets, SQLite data or node_modules.

## Follow-up completion pass, 30 October 2026

A second backup was made before this pass. The command center now has a Payment walkthrough showing account setup, phone payment, automatic alert, graph inspection, reasoned review and customer authorisation. ShieldPay shows canonical backend payment state and explicitly labels Behavioral Data Unavailable when no comparison exists. Repeated attempts after a failed HTTP request retain the same request key while the tab remains open. Optional timing telemetry failure no longer prevents opening a successfully assessed payment. Full request time is unavailable when not measured; partial server duration is never substituted. Abandoned Pending assessment records fail closed after two minutes on the next authenticated workspace read and receive a service recovery audit entry. Existing customer-session bootstrap avoids an unnecessary database mutation.

Performance Testing now defaults to the full payment path, including payment creation and persisted decision. Assessment-only remains a separately labelled option. Test payments are excluded from operational feeds/counts and can be cleaned up by a protected benchmark command. Browser percentiles include both successful and failed attempt durations. Both paths remain small synthetic experiments, not settlement or high-volume certification.

The hosted full-path rerun is saved in `tests/live-ledger-verification-20261030.json`. Independent customer/investigator sessions again passed the complete normal, held, review-release and single-debit sequence. Normal request: 208.30 ms; held request: 200.76 ms. Model inference: 0.930 / 0.893 ms respectively. All 60 benchmark requests succeeded:

| Concurrency | P50 ms |  P95 ms | P99 / max ms | Model P95 ms | Failure rate | Successful throughput / s |
| ----------- | -----: | ------: | -----------: | -----------: | -----------: | ------------------------: |
| 1           | 185.88 |  274.39 |       316.05 |        0.407 |           0% |                      4.79 |
| 3           | 279.13 | 3798.55 |      4064.83 |        0.295 |           0% |                      4.22 |
| 5           | 446.60 | 8117.39 |      8246.40 |        0.396 |           0% |                      2.42 |

The 500 ms requirement remains unmet under concurrency. This run includes ledger writes and cannot be directly used as proof of improvement over the earlier read-only run. Causes of the long tail have not been isolated. Physical phone/laptop testing has not been performed; the integration checks use independent HTTP sessions plus the cloud-browser customer UI.

A new `scripts/train_graph_candidate.py` experiment trains a separate message-passing candidate on six diverse patterns: 900 graphs for training, 240 for validation and 360 untouched graphs for testing. Its feature construction matches reciprocal-edge weighting used by JavaScript inference. Original deployed artifacts remain byte-identical to the backup. The candidate did not find a validation threshold satisfying 85% precision; fallback threshold .999 made no positive predictions on the test split, with precision/recall defined as zero. It was not promoted. On this harder test split the existing model obtained 37.3% precision and 15.6% recall; these numbers refer to a different dataset from its original held-out evaluation. The candidate improved ranking average precision from .339 to .468 but did not establish an acceptable decision threshold. Actual results are displayed in Model Analytics from `dist/graph-candidate-evaluation.json`. Candidate weights remain research-only in `tests/graph-candidate-weights.json`.

All nine regression suites passed again; added shared-ledger tests verify protected full-path benchmarking, exclusion from operational statistics, cleanup and recovery of interrupted assessments. Real bank access is intentionally absent. Remaining engineering limitations include graph model quality, sustained low latency, normalized database storage, production identity/access controls and operational security.

## Current implementation: record storage and temporal GNN

The active hosted backend now uses separate `shield_records` rows for customers, sessions, payments, history and audit events, with an atomic PostgreSQL patch function. Disjoint changes do not compete over one JSON document. Overlapping changes compare previous values and retry; a unique index protects customer/request-key idempotency. `migrations/002_record_storage.sql` migrates existing records once and retains the legacy `shield_workspace` snapshot. New writes are not mirrored back to that snapshot: reverting to the old storage handler alone is not a safe rollback after new transactions. Migration and rollback require a quiet traffic window in a production setting.

Full workspace reads and bounded histories remain, so this is not a high-volume banking storage certification. The free hosted service remains simulated. Existing model artifacts and customer data are preserved. Development still uses local SQLite; hosted mode never silently falls back to it.

A new auxiliary model, `TEMPORAL-GNN-SYN-1.1`, adds directed incoming/outgoing message passing over ten amount, timing and topology features, with a 20-unit neural head. Candidate payment edges are explicitly hypothetical, not settled history. This model augments the existing models, requests verification only, and cannot independently block or settle payments.

Reproduce with `OPENBLAS_NUM_THREADS=1 python scripts/train_temporal_graph.py` after installing NumPy and scikit-learn. It uses 900 training graphs, 240 broad validation graphs and 2,400 rare-pattern validation graphs. The operating threshold maximizes rare-validation recall while requiring at least 90% precision on broad validation, at most 0.5% legitimate-node false positives on rare validation, and at least 20 broad positive predictions. Training and all validation/test seeds are recorded in the evaluation JSON. Fresh final tests use seeds 96417 and 96418; they are not used for fitting weights or choosing the threshold. Earlier broad-threshold exploration used different test seeds.

| Final synthetic split     | Preserved graph precision | Preserved graph recall | Temporal graph precision | Temporal graph recall |
| ------------------------- | ------------------------: | ---------------------: | -----------------------: | --------------------: |
| 360 broad test graphs     |                     57.1% |                   6.7% |                    95.9% |                 56.9% |
| 2,400 rare-pattern graphs |                      2.6% |                   5.7% |                    48.1% |                 59.1% |

The rare split has 0.663% positive account labels. The temporal layer's legitimate-account false positive rate is 0.426%, with 114 true positives, 123 false positives and 79 missed positives. Broad-test confusion is 305 true positives, 13 false positives, 3,241 true negatives and 231 missed positives. These are account-level results from a generator that associates timing and amount motifs with injected labels, not real bank accuracy or calibrated fraud probability. Legitimate and fraudulent transfers may share observed patterns. The lower rare-fraud precision remains visible in Model Analytics; it is not hidden by reporting only broad-test results.

Run `npm ci` then `npm test` for all twelve suites, including the pinned PGlite PostgreSQL engine. Tests cover migration, preservation, atomic rollback, stale-update rejection, unique request keys, concurrent single debit, protected review, behavior availability, 12 graph inference parity fixtures and frontend evidence rendering. Both original deployed model JSON artifacts remain byte-identical to the pre-change backup.

### Final hosted measurements

`tests/live-record-storage-20261030.json` records the final live test with temporal model 1.1 and full ledger persistence. All seven independent-session payment/review checks passed; all 60 benchmark requests succeeded. `dist/performance-evaluation.json` publishes the measured results inside Performance Testing. AsyncLocalStorage keeps per-request database timing separate under concurrency; handler time excludes module initialization, routing and transport. Full client timing includes those costs.

| Concurrency | HTTP P50 ms | HTTP P95 ms | HTTP P99 / max ms | Backend P95 ms | Model P95 ms | Failures | Throughput / s |
| ----------- | ----------: | ----------: | ----------------: | -------------: | -----------: | -------: | -------------: |
| 1           |      196.67 |      284.78 |            346.65 |          81.67 |         6.60 |     0/20 |           4.67 |
| 3           |      259.37 |     4527.26 |           4562.27 |         205.87 |         0.71 |     0/20 |           4.09 |
| 5           |      338.56 |     7144.89 |           7151.97 |         319.22 |         1.95 |     0/20 |           2.79 |

A normal payment's full request took 210.95 ms and its model stage 1.42 ms. A held payment took 349.88 ms and its model stage 1.32 ms. Normal/held backend handler times were 47.74 / 73.06 ms. These measurements do not certify the under-500 ms end-to-end requirement at concurrency.

A separate static SVG control, which invokes no model, database or handler, also showed P95 of 7,550 ms at concurrency 3 and 7,513 ms at concurrency 5. It is recorded in `tests/live-static-control-20261030.json`. This demonstrates a comparable delivery/transport delay outside fraud processing, but does not isolate the responsible infrastructure component. Both backend and complete HTTP results remain visible. Fluid compute is explicitly configured in `vercel.json` using Vercel's supported configuration (https://vercel.com/docs/fluid-compute); no plan upgrade was made.

ShieldPay now keeps focused form edits during transient polling errors, shows a loading state before account retrieval, offers retry when initial connection fails, and deletes the stored experimental baseline when consent is explicitly withdrawn (with a visible failure notice if deletion cannot reach the service). Review buttons guard against repeated clicks. Existing navigation, branding, payment keypad, scenarios and settlement semantics remain preserved.

Remaining verification limits: no physical Android/iPhone-and-laptop test has been performed, and complete HTTP latency is not consistently below 500 ms from the executor network. No real banking, real-world model accuracy, production identity system or high-volume SLA is claimed. The on-site walkthrough supports the complete two-screen demonstration with simulated funds.
