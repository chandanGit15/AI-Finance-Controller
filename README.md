ReconAI — AI Finance Controller
An end-to-end financial reconciliation system that matches invoices, payments, and bank transactions using a deterministic-first, AI-assisted matching engine — with full audit trails, human-in-the-loop exception resolution, and measurable accuracy against ground truth.

text
Copy
Documents (CSV / TXT / PDF / scanned images)
        │
        ▼
┌─────────────────────────────┐
│  Ingestion Pipeline         │  type detection → extraction (text / OCR)
│                             │  → normalization → validation
└────────────┬────────────────┘
             ▼
┌─────────────────────────────┐
│  Reconciliation Engine      │  normalize → candidates → deterministic rules
│                             │  → LLM (optional) → three-way match → scoring
└────────────┬────────────────┘
             ▼
┌─────────────────────────────┐
│  Results & Governance       │  dashboard · exceptions queue · audit log
│                             │  · CSV export · live metrics
└─────────────────────────────┘
Features
Document ingestion — upload up to 12 files at once (CSV, TXT, PDF, PNG, JPG, JPEG, WEBP; 20 MB each). PDFs are parsed as text first, falling back to OCR (Tesseract) for scanned pages; images go straight to OCR. Table detection handles invoice-style column layouts.
Multi-stage matching engine
Normalization — customer names, IDs, amounts, currencies, dates, and descriptions are canonicalized.
Candidate generation — currency/amount/date/customer filters narrow the search space before matching.
Deterministic rules — exact-reference and amount/date rules classify confident cases.
AI-assisted matching — ambiguous cases go to an LLM (OpenAI-compatible API) when configured; otherwise they are honestly labeled DETERMINISTIC_FALLBACK, never silently marked "AI".
Three-way reconciliation — confirmed Invoice → Payment → Bank Transaction links.
Confidence scoring & review thresholds — auto-reconcile above a configurable threshold (default 95%), route lower-confidence matches to human review.
Human-in-the-loop exceptions — an exceptions queue with manual match, mark-resolved, and dismiss actions; every resolution is audited.
Immutable audit log — every decision (engine, AI, ingestion, human) is recorded with method, evidence, and reason codes.
Ground-truth evaluation — precision, recall, F1, and accuracy against the synthetic dataset's known answers; metrics stay null instead of misleading 0% when no ground truth exists.
Developer consistency check — an endpoint that recomputes metrics and invariants (queue counts, audit coverage, confusion-matrix math) and reports any internal contradiction.
Live reconciliation streaming — the run emits every step in real time over SSE, with per-step timing and record counts.
CSV export of reconciliation results.
Demo dataset — a seeded generator produces 100 realistic records (Indian Rupee amounts, fictitious company names) with complete ground truth for immediate evaluation.
Tech Stack
Layer	Tools
Frontend	React 18, TypeScript, React Router, Recharts, Tailwind CSS, Vite
Backend	Node.js, Express, better-sqlite3 (embedded SQLite), multer
Extraction	pdfjs-dist, pdfkit, tesseract.js, csv-parse, papaparse
Validation	concurrently, scripts for e2e and fixture generation
Project Structure
text
Copy
├── backend/
│   ├── index.js               # Express API + reconciliation pipeline orchestration
│   ├── database.js            # SQLite schema & initialization
│   └── services/
│       ├── ingestion.js       # Unified document ingestion (CSV/TXT/PDF/OCR)
│       ├── normalizer.js      # Record normalization
│       ├── candidateFinder.js # Pre-match candidate generation
│       ├── deterministicMatcher.js
│       ├── aiMatcher.js       # LLM-backed matching with honest fallback
│       ├── threeWayMatcher.js # Invoice → Payment → Bank links
│       ├── evaluator.js       # Precision / recall / F1 vs ground truth
│       ├── dataGenerator.js   # Seeded demo dataset with ground truth
│       ├── pdfTables.js       # PDF table extractor
│       └── money.js           # Currency parsing & formatting helpers
├── src/                       # React frontend (Vite)
│   ├── App.tsx                # Routing + demo session gate
│   ├── components/ui.tsx      # Shared UI primitives
│   └── pages/
│       ├── Dashboard.tsx      # Metrics & charts
│       ├── Reconciliation.tsx # Live run with streaming steps
│       ├── Exceptions.tsx     # Human review queue
│       ├── DataPage.tsx       # Data generation / upload / ingestion
│       ├── AuditLog.tsx       # Full decision trail
│       └── Settings.tsx       # Thresholds & AI toggle
├── scripts/                   # e2e tests, fixtures, OCR/PDF probes
├── data/                      # SQLite database file location
└── samples/                   # Sample documents for ingestion testing
Getting Started
Prerequisites
Node.js ≥ 18
npm
Install & Run (Development)
bash
Copy
npm install
npm run dev
This starts both servers concurrently:

Service	URL	Source
Frontend	http://localhost:5173	Vite dev server (/api proxied to backend)
Backend	http://localhost:3001	node --watch backend/index.js
The app opens with a demo sign-in gate — any valid email and password lets you into the sandbox session (no real authentication).

Production Build
bash
Copy
npm run build      # Vite build → dist/
npm start          # Express serves dist/ statically on port 3001
When dist/ exists, the backend serves the built frontend, so a single process hosts the app.

Optional: Enable AI-Assisted Matching
The engine works fully without an LLM (deterministic fallback for ambiguous cases). To enable real LLM analysis, set an OpenAI-compatible endpoint:

bash
Copy
export LLM_API_URL="https://api.openai.com/v1/chat/completions"
export LLM_API_KEY="sk-..."          # keep this out of source control
export LLM_MODEL="gpt-4"             # default: gpt-4
Status is surfaced via GET /api/ai-status — the UI always shows whether the LLM or the deterministic fallback is active. API keys are never exposed by the backend.

Configuration
Runtime settings are editable in the Settings page and stored in the SQLite config table:

Setting	Default	Meaning
auto_reconcile_threshold	0.95	Confidence ≥ this auto-matches without review
review_threshold	0.80	Confidence ≥ this goes to the human review queue
date_tolerance_days	3	Allowed days between invoice and payment dates
amount_tolerance_percent	2.0	Allowed percentage difference in amounts
enable_ai_matching	true	Whether ambiguous cases go to the AI stage
The review threshold is kept strictly below the auto-reconcile threshold (guarded automatically).

API Reference
Base URL: http://localhost:3001/api

Method	Endpoint	Description
GET	/health	Service health with dataset/result counts
GET	/dataset	Current invoices, payments, transactions, ground truth
POST	/generate-demo	Regenerate the 100-record synthetic dataset
POST	/upload/:type	Replace a source table from CSV (invoices, payments, transactions)
POST	/ingest	Upload documents (multipart files[], up to 12) with extraction pipeline
GET	/ingest/files	Recent uploads and extracted records
POST	/ingest/accept	Promote extracted records into the reconciliation tables
POST	/reconcile	Run the full pipeline synchronously (JSON report)
POST	/reconcile/stream	Same run with SSE step events
GET	/results	Reconciliation results + evaluation metrics
GET	/exceptions	Active and resolved exceptions
POST	/exceptions/resolve	Manual match / mark-resolved / dismiss an exception
GET	/audit	Full audit log
GET	/settings / POST /settings	Read / update runtime configuration
GET	/ai-status	Whether the LLM or deterministic fallback is active
GET	/consistency-check	Internal invariant verification (developer tool)
GET	/export/results	Download results as CSV
Reconciliation Statuses
MATCHED · PARTIAL_MATCH · EXCEPTION · UNRESOLVED · DUPLICATE · MISSING

Review state is orthogonal: AUTO_RESOLVED, AWAITING_REVIEW, or MANUALLY_RESOLVED.

Testing & Scripts
text
Copy
scripts/
├── e2e-final.mjs              # End-to-end API walkthrough
├── e2e-pdf-upload.mjs         # PDF upload ingestion e2e
├── ingestion-test.mjs         # Ingestion pipeline tests
├── ocr-test.mjs               # OCR capability probe
├── pdf-test*.mjs / probe-*    # PDF parsing experiments
├── test-table-parser.mjs      # PDF table extraction unit tests
├── make-*-pdf.mjs             # PDF fixture generators
└── make_fixtures.py           # Python fixture helper
Run individual scripts with node scripts/<name>.mjs (backend must be running for e2e scripts).

Database
SQLite (better-sqlite3) with WAL journaling, stored on disk at backend/data/reconai.db. Main tables:

invoices, payments, bank_transactions, ground_truth, reconciliation_results, reconciliation_runs, audit_log, config, document_uploads, extracted_records.

Every reconciliation run replaces prior decision rows but preserves ingestion events and manual-resolution history, so the audit trail stays complete across runs.

Design Principles
Deterministic first — rules handle what they can; AI is reserved for genuinely ambiguous cases.
Never fake "AI" — lacking an LLM key produces an honestly labeled deterministic fallback, and the UI shows the active mode.
Full traceability — every decision carries evidence, rules triggered, reason codes, and confidence.
Extraction ≠ reconciliation confidence — document-reading confidence and match confidence are kept separate.
No silent currency conversion — foreign-currency records are flagged, not converted.
Honest metrics — without ground truth, precision/recall are reported as unavailable rather than 0%.
License
Private / internal project — all rights reserved.
