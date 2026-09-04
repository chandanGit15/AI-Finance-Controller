# ReconAI — Run Doc

## Prerequisites

- Node.js 18+ and npm installed
- All dependencies already installed in `node_modules/`

## How to Reproduce Artifacts

No special env files needed. The app uses SQLite (auto-created in `data/reconai.db`).

Build the frontend:
```
npx vite build
```

## How to Run the Server

### Production mode (single process, port 3001)
```
PORT=3001 node backend/index.js
```
The Express server serves the built frontend from `dist/` and the API at `/api/*`.

NOTE: this shell environment exports `PORT=0`, so the port must be pinned explicitly
(as above) — otherwise the server binds a random port. When launching detached via
PowerShell `Start-Process`, set the env var for the child first (e.g. `$env:PORT='3001'`
or `PORT=3001 powershell …` from bash) and write the `-PassThru` pid to a file, since
the child keeps stdout open and makes synchronous waits time out.

### Development mode (with HMR)
```
npm run dev
```
This runs both:
- Vite dev server on port 5173 (with API proxy to backend)
- Express backend on port 3001

### Quick test flow
1. Open the app
2. Click **Generate Demo Dataset** or **Run Demo Reconciliation**
3. Navigate between Dashboard, Reconciliation, Exceptions, Audit Log

## Key Ports

| Service | Port | Notes |
|---------|------|-------|
| Express backend | 3001 | Serves API + production frontend |
| Vite dev server | 5173 | HMR dev mode, proxies /api to 3001 |
