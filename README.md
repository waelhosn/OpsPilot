# OpsPilot App

This repo contains my solution for two scenarios from the assessment:
- Version 4: Inventory Management System
- Version 5: Event Scheduler Application

## What is implemented

### Shared platform pieces
- JWT auth (register/login)
- RBAC with two roles: `admin`, `member`
- Single-team UX (workspace exists in backend but is not shown in the UI)
- Bootstrap admin is created during migrations. all users registering later are members by default
- FastAPI backend + SQLAlchemy + Alembic
- Next.js frontend in `apps/web`
- Optional encrypted local vault for secrets (for example `AI_API_KEY`)
- AI run logging (`ai_runs`)

### Inventory (V4)
- Add/edit/delete items
- Status tracking: `in_stock`, `low_stock`, `ordered`, `discontinued`
- Search
- AI import flow for receipt/invoice content: parse -> review -> commit
- Duplicate suggestions during import (`merge`, `create_new`, `auto`)
- Duplicate-safe commit (normalized matches merge quantity)
- Inventory copilot with guardrails and deterministic execution

### Events (V5)
- Add/edit/delete events
- Status tracking: `upcoming`, `attending`, `maybe`, `declined`
- Search
- External shadcn calendar UI (single mode)
- Invitations + invite response flow
- AI event drafting from natural language
- Conflict detection with alternatives
- AI description generation in create/edit flow

## AI features and guardrails

### Inventory AI
- Receipt/invoice import: parses uploaded content into structured rows, lets the user review/edit, then commits.
- Auto-normalization and duplicate handling: suggests merge behavior and safely merges known duplicates on commit.
- Copilot for inventory questions: supports summary and lookup questions over inventory data.

Guardrails used for inventory:
- Schema-first planning: AI output is validated before any query runs.
- Deterministic execution: the backend executes the validated plan; model output does not directly run SQL.
- Scope checks: out-of-scope prompts are handled with safe responses instead of open-ended answers.
- Injection resistance: prompt-injection style inputs are risk-scored and routed through safer paths.
- RBAC + data scoping: all queries are limited to the authenticated user/team scope and role.
- Query bounds: limits/sort/filter fields are constrained to allowed values.

### Events AI
- Natural-language event drafting: converts free text into a structured event draft.
- Conflict detection: checks overlapping events and suggests alternatives.
- AI description helper: generates event description text during create/edit flow.

Guardrails used for events:
- Structured output validation for draft fields (title/time/location/invitees).
- Deterministic conflict checks and overlap logic in backend services.
- Confirmation-before-write flow: users review AI draft before persisting.
- Fallback behavior when provider AI is unavailable (mock/deterministic paths).

## Project structure

- `apps/api` - FastAPI backend
- `apps/web` - Next.js frontend (primary UI)
- `tests/ai_eval` - deterministic AI workflow tests

## Design decisions (brief)

- I chose V4 + V5 together because they show both operational CRUD and AI-assisted workflows.
- I kept API and web separate inside one monorepo to keep boundaries clean and deployment simple.
- AI actions are validated and executed deterministically on the backend (no direct free-form model execution against data).
- RBAC is intentionally simple: one bootstrap admin, member by default after that.
- Bootstrap admin is seeded by migration (`BOOTSTRAP_ADMIN_*` env vars), and registration does not auto-promote users.
- Events UX is calendar-first; inventory UX is table-first.
- Migrations are handled with Alembic, not runtime `create_all`.
- Hosted setup targets Vercel + Supabase for easy reviewer access.

## Additional implementation notes

- Single monorepo, split into API and web apps for clean ownership and simpler deployment.
- API uses strict schema validation for AI outputs before any state-changing action.
- Copilot queries are executed with bounded, allowlisted fields (no direct model SQL execution).
- Inventory import is review-first (parse -> edit -> commit), and duplicate-aware during commit.
- Event draft creation is confirm-first (draft -> review -> save) to avoid accidental writes.
- Database URL handling is normalized for hosted Postgres providers (for example Supabase).
- Local secrets can be encrypted with the built-in vault helper; hosted secrets should be set in platform env vars.

## Local run

### Prerequisites
- Python 3.10+
- Node.js 20+

### 1) Backend

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# local quickstart:
# DATABASE_URL=sqlite:///./app.db
# optional bootstrap admin override before migration:
# BOOTSTRAP_ADMIN_EMAIL=admin@opspilot.local
# BOOTSTRAP_ADMIN_PASSWORD=Admin@123456
alembic upgrade head
./.venv/bin/uvicorn apps.api.main:app --reload --host 0.0.0.0 --port 8000
```

Windows PowerShell:

```powershell
py -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env
# local quickstart:
# DATABASE_URL=sqlite:///./app.db
# optional bootstrap admin override before migration:
# BOOTSTRAP_ADMIN_EMAIL=admin@opspilot.local
# BOOTSTRAP_ADMIN_PASSWORD=Admin@123456
alembic upgrade head
uvicorn apps.api.main:app --reload --host 0.0.0.0 --port 8000
```

### 2) Frontend

In a second terminal:

```bash
cd apps/web
cp .env.example .env.local
npm install
npm run dev
```

Open:
- Web UI: `http://localhost:3000`
- API docs: `http://localhost:8000/docs`

## Tests

```bash
PYTHONPATH=. ./.venv/bin/pytest -q
```

CI runs `pytest -q` on push/PR via `.github/workflows/ci.yml`.

## Receipt fixtures for inventory import

HTML samples:
- `tests/fixtures/receipts_html/receipt_office_electronics.html`
- `tests/fixtures/receipts_html/receipt_grocery_breakroom.html`
- `tests/fixtures/receipts_html/receipt_cleaning_supplies.html`
- `tests/fixtures/receipts_html/receipt_mixed_format.html`

In the UI: `Inventory -> AI Import`, upload one of those files, parse, review rows, then commit.

## AI provider setup

Default mode is deterministic:
- `AI_PROVIDER=mock`

Optional provider-backed mode:
- `AI_PROVIDER=openai` + `AI_API_KEY`
- `AI_PROVIDER=anthropic` + `AI_API_KEY`

If provider calls fail, the app falls back to deterministic behavior for demo stability.

## Deployment

Deployment details are in:
- `DEPLOYMENT.md`

## Local secret vault

You can keep secrets in an encrypted local vault file instead of plain `.env` values.

Generate a master key:

```bash
python3 scripts/secret_vault.py generate-key
```

Store a secret:

```bash
VAULT_MASTER_KEY="<your-generated-key>" python3 scripts/secret_vault.py set AI_API_KEY
```

List/get secrets:

```bash
VAULT_MASTER_KEY="<your-generated-key>" python3 scripts/secret_vault.py list
VAULT_MASTER_KEY="<your-generated-key>" python3 scripts/secret_vault.py get AI_API_KEY
```

Enable vault mode in `.env`:

```bash
VAULT_ENABLED=true
VAULT_PATH=.vault/secrets.enc
VAULT_MASTER_KEY=<your-generated-key>
```

## Demo flow 

1. Login using bootstrap admin credentials seeded by migration.
2. Inventory: add items, parse a receipt, commit parsed rows, ask copilot for low stock.
3. Events: create/edit from calendar, generate description, check conflicts, send invite.
4. Admin: add members (all registered users remain member by default).
