# Working on the project

## Editing

Edit frontend code in `src/`, runtime models in `models/`, and published evaluation evidence in `reports/`. Generated files in `dist/` are overwritten by the build. Static artwork belongs in `public/`.

Keep customer UI, investigator UI and shared inference separate. Business rules, account ownership and settlement checks belong in the backend. Preserve existing session and payment-state protections when changing screens.

Run `npm run build` before testing a frontend change. Restart the development server after changing API or backend modules. Use `npm run format` for consistent formatting and `npm test` for regression checks. No model training occurs during a normal build.

## Models

Model training requires Python, NumPy and scikit-learn. Training and evaluation are explicit operations, not prerequisites for local development. Preserve the existing trained artifacts before experimenting, use separate training/validation/test seeds, and retain actual confusion matrices and rare-fraud results. Never replace measured results with target values.

Commands include `python scripts/train_model.py`, `python scripts/train_intelligence.py`, `python scripts/train_temporal_graph.py`, and `node scripts/evaluate_graph_patterns.cjs`. These scripts keep their canonical and runtime outputs synchronized. Run the build and tests after changing model artifacts.

## Credentials and data

Use `.env` for local configuration and Vercel environment settings for hosted credentials. The example file contains no production credentials. Runtime databases, sessions and environment secrets do not belong in release archives.

All demonstrations must continue to identify balances and settlement as simulated. Do not introduce real PIN collection or treat client-supplied history as bank evidence.
