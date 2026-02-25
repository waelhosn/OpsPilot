# Deployment Guide: Vercel + Supabase

This project is deployed as a monorepo with:
- Frontend on Vercel (`apps/web`)
- Backend on Vercel (`apps/api`)
- Database on Supabase (Postgres)

## 1) Repository and project layout

Use a single GitHub repository.

Create two Vercel projects from that same repo:
- Web project root: `apps/web`
- API project root: `apps/api`

## 2) Supabase setup

1. Create a Supabase project (Free plan).
2. Open `Connect` in the Supabase dashboard.
3. Copy a Postgres connection string.
4. Prefer a pooled/session-compatible URI for serverless usage.
5. Ensure the URI includes `sslmode=require`.
6. URL-encode special characters in the DB password.

Example format:

```text
postgresql+psycopg://postgres:[PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres?sslmode=require
```

Notes:
- The API normalizes `postgres://` and `postgresql://` to `postgresql+psycopg://`.
- The API also auto-adds `sslmode=require` for Postgres URLs when absent.

## 3) Configure Vercel API project

Root directory:
- `apps/api`

Required environment variables:
- `DATABASE_URL` = Supabase Postgres URI
- `JWT_SECRET` = strong random string
- `CORS_ORIGINS` = comma-separated allowed origins (must include your web URL)

Optional environment variables:
- `AI_PROVIDER` = `mock` | `openai` | `anthropic`
- `AI_API_KEY` = provider key if using real AI provider
- `AI_MODEL` = model name
- `VAULT_ENABLED` = `false` on Vercel

Backend Vercel wiring already exists:
- `apps/api/index.py`
- `apps/api/vercel.json`

## 4) Configure Vercel Web project

Root directory:
- `apps/web`

Required environment variables:
- `NEXT_PUBLIC_API_URL=https://<your-api-project>.vercel.app`

## 5) Run database migrations

Run migrations against the same `DATABASE_URL` used by the API:

```bash
alembic upgrade head
```

If running locally against Supabase:

```bash
DATABASE_URL="<your-supabase-uri>" alembic upgrade head
```

## 6) CORS checklist

Set API `CORS_ORIGINS` to include:
- `https://<your-web-project>.vercel.app`
- local dev origins if needed (`http://localhost:3000`)

If CORS fails, verify:
- API deployment picked up latest env vars
- Web app points to the correct API URL
- No typo in comma-separated `CORS_ORIGINS`

## 7) Secrets strategy

For deployed environments:
- Store secrets in Vercel Project Environment Variables.

For local development:
- You can use the encrypted vault (`scripts/secret_vault.py`) instead of plain `.env` values.

## 8) Free-tier expectation

For assessment/demo traffic over one week, Vercel Hobby + Supabase Free is generally sufficient.

Potential limits to watch:
- Serverless cold starts/timeouts on long requests
- Supabase free-tier resource limits

