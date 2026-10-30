# UPI Shield

UPI Shield is a payment fraud analysis application with a customer payment interface, an investigator command center, shared transaction storage and trained synthetic-data models. Bank accounts, balances and settlements are simulated.

## Start in VS Code

1. Install Node.js 24 or newer.
2. Extract the project and open `UPI-Shield.code-workspace` in VS Code.
3. Open **Terminal → New Terminal** and run:

```bash
npm ci
npm run dev
```

Open `http://localhost:4173` for the command center and `http://localhost:4173/pay` for ShieldPay. The development server builds the frontend first and creates its local SQLite directory automatically. Python is not needed to run the application.

The command center opens directly without sign-in for the hackathon demo. Visitors can view shared investigation records and use investigator actions. Sample bank setup and payment authorisation use the displayed `123456` code.

To change local settings, copy `.env.example` to `.env`. Restart the server after changing environment settings.

## Project structure

| Location                     | Responsibility                                                                      |
| ---------------------------- | ----------------------------------------------------------------------------------- |
| `src/customer/`              | ShieldPay pages, payment journey, interaction experiment and styles                 |
| `src/admin/`                 | Command center, transaction feed, cases, graph view, analytics and styles           |
| `src/shared/`                | API client, fraud engine, graph inference and shared policies                       |
| `api/`                       | Server entry points for assessments and shared transactions                         |
| `lib/`                       | Session checks, payment state transitions, database access and request measurements |
| `models/`                    | Versioned model artifacts used by the runtime                                       |
| `reports/`                   | Reproducible model evaluations and recorded performance evidence                    |
| `migrations/`                | PostgreSQL schema and storage migrations                                            |
| `public/`                    | UPI/NPCI artwork, sample bank logos and standalone offline release                  |
| `config/frontend-build.json` | Source-to-output mapping, preserving the existing public URLs                       |
| `scripts/`                   | Development server, build, training, evaluation and test commands                   |
| `tests/`                     | Model parity, application, API, storage and state transition checks                 |
| `.vscode/`                   | Editor settings, recommended extensions, tasks and debugger configuration           |
| `docs/`                      | Architecture, contribution notes and detailed implementation evidence               |
| `dist/`                      | Generated application files; edit the corresponding source files instead            |

VS Code hides `dist/` and `node_modules/` from the Explorer to keep the source view focused. Their files remain on disk.

## Commands

| Command                           | Purpose                                                             |
| --------------------------------- | ------------------------------------------------------------------- |
| `npm run dev`                     | Build and start the complete local frontend/API server              |
| `npm run build`                   | Copy the mapped source, models, reports and assets into `dist/`     |
| `npm test`                        | Build and run all twelve test suites                                |
| `npm run format`                  | Format editable frontend, backend, scripts, tests and configuration |
| `npm run format:check`            | Check formatting without changing files                             |
| `python scripts/build_offline.py` | Regenerate the standalone local-only release after a build          |

Press **F5** to debug the backend. Breakpoints can be placed in `api/` and `lib/`. VS Code also provides Build and Test tasks through **Terminal → Run Task**.

The development server does not hot-reload backend modules. Stop and restart it after editing backend code. Run `npm run build` and refresh the browser after editing frontend files while a server is already running.

## Payment flow

Connect a sample account in ShieldPay, initiate an Everyday payment and authorise its simulated settlement. The command center reads the same server records. A Mule network scenario generates labelled synthetic evidence and holds the payment. An authenticated investigator can inspect the graph and audit history, record a reason, and release or cancel the payment. Release still requires customer authorisation before settlement.

The command center includes a **Payment walkthrough** for the complete two-screen demonstration.

## Deployment

Production uses the existing Vercel project, `npm run build`, and the `dist/` output directory. Keep the existing `DATABASE_URL` in Vercel. No investigator access code is required for the demo. Keep credentials out of source control. PostgreSQL storage is required in hosted mode; it does not fall back to browser storage. Local development uses SQLite.

## Model and performance evidence

Original model weights are preserved. The temporal graph model is an additional experimental verification signal. Synthetic evaluation, rare-fraud tradeoffs, measured latency and remaining validation limits are documented in [the implementation report](docs/IMPLEMENTATION_REPORT.md). Dataset assumptions do not establish real bank accuracy. The complete HTTP request target below 500 ms is not consistently achieved in the recorded concurrent tests.

See [architecture](docs/ARCHITECTURE.md) for the module boundaries and [contribution notes](docs/CONTRIBUTING.md) for changes, testing and model updates.

## Google Colab

The model lab is available in `notebooks/UPI_Shield_Model_Lab.ipynb`. Upload it to Google Colab, run all cells, and upload the project source ZIP when asked. It trains and evaluates all model layers, provides interactive payment assessments, and exports model artifacts for this project. See [the Colab instructions](notebooks/README.md). The live website continues to use its own backend; notebook training does not automatically deploy changes.

## Navigation

ShieldPay has five primary destinations: Home, Send Money, Payment Status, Transaction History and Security Notifications. Sample bank setup is accessed through Home → Manage accounts. The command center has seven primary sections: Overview, Live Transactions, Fraud Alerts, Graph Network, Investigations, Model Analytics and Performance Testing. Simulator, scenario tests, the behavioral experiment, model details and settings sit under Advanced tools.

Older payment-lab and bank-setup URLs redirect to ShieldPay in the hosted application. Their local research functions remain available to the standalone offline release. Hosted settings show shared evidence export and display preferences rather than browser-local controls that could be mistaken for backend policy changes.

Interface transitions are limited to page changes, dialogs and direct interactions. Live record refreshes do not replay page entrance animations. Reduced-motion preferences remain supported. Alignment checks cover small phone and desktop viewports; simulated funds and server-authoritative payment states are unchanged.

Graph and anomaly model internals, reproduction steps, benchmark scope and limitations are documented in [docs/GRAPH_AND_ANOMALY.md](docs/GRAPH_AND_ANOMALY.md). Model Analytics shows measured temporal GNN and Isolation Forest results. The Colab lab retrains both current versions.

The graph explorer includes three read-only, model-scored sample networks when no useful payment network is available. Switch between samples and saved payments; samples never create ledger records, settlements or alerts. Regenerate examples after changing model artifacts with `npm run build` followed by `node scripts/build_graph_examples.mjs` and another build.

Overview can load 500 backend-assessed synthetic samples once after investigator sign-in when the workspace has fewer than 30 payments. Samples are saved with source `overview-sample`, visible only to investigators, and counted from their actual decisions. They never debit customer balances or settle automatically. The Overview provides separate load and clear actions; repeat loads do not duplicate records. Rule outcomes are compacted for sample records to keep the initial response below the hosting payload limit. Customer payment records and complete scenario descriptions are preserved.

## Public hackathon payment app

The homepage opens ShieldPay at `/pay`. The mobile payment interface lives in `src/customer/mobile.html`, `mobile.css`, `mobile.js`, and `mobile-core.js`. Payments use the existing synthetic random-forest model and graph-pattern policies in the browser. The risk dialog appears before confirmation; high-risk transfers cannot debit the sample balance, and verification decisions require an explicit recipient check. All balances and receipts are local demo data. No real UPI PIN or bank authorization is collected. The investigator dashboard remains at `/upi-shield-offline#overview`.

Run `node tests/mobile-pay.test.cjs` for the payment flow safety checks.

## HACK-11 payment checks

The public payment flow now preloads the random forest, Isolation Forest and temporal graph models and combines their evidence before confirmation. The risk dialog includes a directed candidate-edge graph, all-model scoring time and submit-to-warning browser latency. Optional consenting users can enroll three typing or swipe samples and compare a fourth; unavailable comparisons remain unavailable, and timing drift can request verification. This is an experimental self-enrolled comparison, not authenticated biometric identity.

The Protection page links to `/pay#evidence`, which displays saved rare-fraud precision/recall and a repeatable 200-decision browser benchmark with 0.5% suspicious sample traffic. The local benchmark excludes network/database latency and does not establish production scalability or real bank accuracy. The mobile layout was checked at 390 × 844.

## Demo PIN and interface motion

After a permitted risk decision, Continue to demo PIN opens a six-digit keypad. Only the displayed sequence `123456` authorizes a simulated debit. Incorrect or incomplete entries preserve the balance; high-risk and extra-verification gates still apply. PIN digits are kept only in temporary UI memory, never persisted or sent, and cleared on exit. Never enter a real UPI PIN.

Page transitions, pressed buttons, risk sheets, PIN dots and successful receipts have short animations. Reduced-motion preferences disable these effects. No artificial model or payment-processing delay is introduced.

## ShieldPay → Shield transaction history

The public investigator dashboard reads the ShieldPay wallet (`shieldpay-mobile-v1`) from the same origin and browser. It merges payment assessments by their original PAY reference, updates pending/paid/held/cancelled statuses without duplicates, preserves the actual risk decision and bank, and refreshes on cross-tab storage events, focus and visibility changes. The receipt links directly to its filtered Shield transaction record. Only paid ShieldPay transfers enter settled graph history. Imported payment references remain valid in backups without corrupting the numeric sample ID counter.

Shared demo payment synchronization now uses the separate UPI Shield Supabase project. ShieldPay posts sanitized payment records through /api/demo-payments; the public dashboard polls the shared ledger every two seconds. Payments from phones and other browsers therefore appear in Shield history. The original Neon workspace service remains quota-limited and is not used for this payment feed. PIN digits, bank balances and raw behavior samples are never included in shared records.

The payment app footer reports sharing success or an automatic retry; the dashboard displays live connection status and has a Sync now / show latest button. Refresh existing app/dashboard pages once after deployment. This is a public synthetic hackathon ledger, not a bank ledger. The latest 1,500 records are retained in the database, with 500 returned per feed request. Table access is denied to browser roles; the Edge Function validates records and uses a server-only database credential. A delayed pending update cannot overwrite a terminal payment state.

Cloud source: supabase/schema.sql, supabase/functions/demo-payments/index.ts, src/shared/payment-cloud.js and api/demo-payments.mjs. config/payment-cloud.json contains only a publishable app key; it is not a privileged database key. Run node scripts/verify-payment-cloud.mjs to verify independent read/write against the deployed website.

### Post-payment safety support
Completed payments ask the user whether the payment looks right, feels uncertain or is suspicious. Concerns offer a fixed reason, a practice checklist and a downloadable demo incident summary. Responses sync to Shield history and uncertain/suspicious responses open a review case. Responses are user concerns, not confirmed fraud labels, and do not change the model decision or payment status. Checklist completion stays on the device. For actual financial cyber fraud, the guide links to 1930 and cybercrime.gov.in and advises contacting the bank promptly. No official report, fund freeze or reversal is performed. Guidance checked against Government of India PIB release PRID 2307871 and the National Cybercrime Reporting Portal.
