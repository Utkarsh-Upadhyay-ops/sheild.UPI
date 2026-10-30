# Graph and anomaly model release

The live assessment API uses both models. Existing Random Forest and original graph weights are preserved. Original Isolation Forest and temporal graph artifacts are backed up before replacement.

## Directed temporal GNN v2

A 120 second settled-history window and a hypothetical candidate edge become account features. Ten self features describe incoming/outgoing diversity, amounts, rapid forwarding and circular paths. Two directed mean aggregation hops retain upstream sources and onward destinations. A trained 24-unit ReLU head predicts an experimental account risk index from 90 inputs. Sender and recipient indices can request verification. They cannot independently hold, release or settle funds.

The graph is bounded to 500 historical edges and 120 accounts. This bounds work but can omit relationships. Circular paths are searched only to a bounded depth and iteration count. Account evidence records incoming and outgoing diversity, rapid forwarding and cycle presence. These are observed features, not causal model attributions.

Training uses 12000 independently seeded synthetic graphs with graph-specific account IDs. There are 33000 graph samples and 402805 historical transfers across all splits. Threshold selection uses broad validation and a separate rare-pattern validation split. The untouched evaluation has 3000 graphs and a separate 8000-graph rare-pattern stress split. A further untuned three-times-slower history test exposes sensitivity to timing/window assumptions. Legitimate and fraudulent flows can share topology. Synthetic labels do not establish real banking accuracy. Low-prevalence alert precision remains limited.

## Isolation Forest v2

80 trees, 256 subsamples and 100000 normal synthetic training rows. Features are log amount relative to observed average, recent payment count, recipient familiarity and available experimental behavior deviation. The threshold is the 99.5th percentile of a separate 20000-row normal validation split, selected before testing. Unavailable behavior is neutral in inference and explicitly unavailable in returned evidence.

The score measures unusualness, not fraud probability. It cannot identify a scam's intent from unusualness alone. Broad test recall is limited; the rare unusualness test yields many false alerts relative to rare positives. The model can request verification only. Decision rules and supervised layers remain separate.

## Reproduce

Use Python with NumPy and scikit-learn 1.8.0, and Node.js 24.

```sh
npm run build
python scripts/train_temporal_graph.py
python scripts/train_anomaly.py
npm test
node scripts/benchmark_intelligence.cjs
```

The Google Colab notebook runs the same training scripts and parity tests against an uploaded project ZIP. Training the original intelligence script alone overwrites the Isolation Forest; run train_anomaly.py afterward to restore v2.

JSON reports in reports/ contain confusion matrices, precision, recall, average precision and false positive rates. Python/JavaScript parity fixtures compare exported inference scores. Local inference benchmark results exclude HTTP, database, concurrency and cold starts and do not prove the full request latency target.

## Large exploration corpus

Graph explorer DEMO 4 uses a separate seeded CSV of 50000 transfers and 3100 accounts. It visualizes a connected 26-transfer neighborhood, assessed by the actual engine. The full CSV can be downloaded without rendering every account. This corpus is not the model training set. Regenerate with `node scripts/build_graph_examples.mjs` then `node scripts/build_large_network.mjs` after rebuilding model artifacts. Downloaded data is synthetic.
