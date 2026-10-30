# Application architecture

## Frontend

The customer and investigator applications share a backend but have separate entry points and sessions. They are implemented with browser JavaScript, HTML and CSS. The existing public filenames and routes remain stable through an explicit build manifest.

`src/customer/main.js` provides the established payment screens and demo keypad. `transactions.js` connects those screens to authoritative server records. `behavior.js` captures consented experimental interaction timing independently of the keypad.

`src/admin/main.js` provides navigation and the existing workspace shell. `command-center.js` renders shared records, investigations, graphs and benchmarks. Model details and the scenario suite have separate modules.

The API client in `src/shared/api-client.js` polls visible sessions and reports errors. Shared inference modules are copied to `dist/` so both browser experiments and Node API handlers use the same implementation. Production payments are assessed by the server.

## Backend

| Module | Boundary |
| --- | --- |
| `api/workspace.mjs` | HTTP validation, session cookies, command dispatch and request timing |
| `api/assess.mjs` | Stateless synthetic assessment endpoint used by the server pipeline and advanced tests |
| `lib/workspace.mjs` | Customer ownership, investigator authorisation, payment states and audit events |
| `lib/store.mjs` | Hosted PostgreSQL connection or explicit local SQLite storage |
| `lib/record-store.mjs` | Per-record change detection and conflict retries |
| `lib/request-metrics.mjs` | Request-scoped database measurements |

Allowed payment states are Pending assessment, Allowed, Verification required, Held for review, Settled, Cancelled and Assessment failed. A held payment cannot settle. Investigator release changes the state to Allowed; settlement remains a separate customer action. Request-key uniqueness and atomic balance changes prevent duplicate debits.

## Build and assets

`config/frontend-build.json` maps each editable source file to its established runtime filename. `scripts/build.mjs` copies these files and public assets into `dist/`. This preserves imports and URLs without introducing a framework migration. The build does not retrain models or modify their weights.

Training scripts update their canonical `models/` or `reports/` outputs and synchronize the corresponding runtime artifacts. The offline builder creates a separate local simulation; it does not offer shared cross-device storage.

## Boundaries

Bank connections and settlement are simulated. Client interaction timings are experimental and spoofable. Investigator authentication uses a private demo code, not a production identity provider. Models are trained on synthetic data, and the current bounded snapshot reads do not establish high-volume bank capacity. Full measurement details are retained in IMPLEMENTATION_REPORT.md.
