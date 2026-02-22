# DarkHound
Security hunting platform with a web UI, SSH-based asset sessions, hunt modules, AI-assisted analysis, and intelligence findings.

## Highlights

- Asset manager with SSH credentials, sudo support, and CSV import/export.
- Hunt modules CRUD and execution with step orchestration.
- AI Executive Report generation with streaming output.
- Findings, timeline, and enrichment events over WebSocket.
- Docker-based dev environment (Postgres, Vault, backend, frontend).

## Architecture

- Backend: FastAPI app in backend/app
- Frontend: Vite + React app in frontend
- DB: Postgres (alembic migrations in alembic/)
- Hunt modules: markdown specs in hunt_modules/

## Quickstart (Docker)

1) Copy the .env.sample to .env file
2) Start the stack:

   ./dev.sh

3) Open the UI:

   http://localhost:3500

## Local Dev (without Docker) - NOT TESTED

Backend:

- make install
- make dev-backend

Frontend:

- cd frontend
- npm install
- npm run dev

## Common Make Targets

- make up / make down / make logs
- make migrate / make migrate-create / make migrate-down
- make lint / make test / make audit

## Ports

- 3500: Frontend
- 8000: Backend API
- 5432: Postgres
- 8200: Vault (dev)

## Environment Variables (selected)

- AI_PROVIDER, ANTHROPIC_API_KEY, ANTHROPIC_MODEL
- OPENAI_API_KEY, OPENAI_MODEL, OPENAI_BASE_URL
- OLLAMA_HOST, OLLAMA_MODEL
- VIRUSTOTAL_API_KEY, SHODAN_API_KEY, ABUSEIPDB_API_KEY
- ADMIN_USERNAME, ADMIN_PASSWORD
- CORS_ORIGINS

## Notes

- Alembic migrations are required for DB schema updates.
- The backend uses an async SQLAlchemy engine and emits WebSocket events.
- The UI expects the backend at /api/v1 (see frontend/src/api/client.ts).

### Windows 11

Install OpenSSH server on Windows 11
To install OpenSSH server on Windows 11, follow the steps outlined below:

1. Open Settings.
2. Navigate to System on the sidebar.
3. Click/tap on Optional Features.
4. Press the View features button.
5. Select the OpenSSH Server checkbox.
6. Press the Next button.

With that, you are done installing OpenSSH server on Windows 11.