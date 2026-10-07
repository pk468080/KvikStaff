# KvikStaff FastAPI Backend

Production-oriented FastAPI backend for KvikStaff.

## Architecture

The backend is a modular monolith. Customer and worker Expo apps plus the admin dashboard consume the API. Supabase remains the system of record for PostgreSQL, Auth, Storage and Realtime where useful.

### Layers

`api/` owns HTTP contracts and dependency injection.

`modules/` owns business domains and is where existing client-side Supabase RPC logic will be migrated.

`integrations/` isolates external providers such as Razorpay, Supabase, push notifications and maps.

`workers/` contains asynchronous/background job entrypoints.

`shared/` contains cross-domain primitives only; business logic must not live here.

## Run locally

```bash
cd backend
cp .env.example .env
python -m venv .venv
source .venv/bin/activate
pip install -e '.[dev]'
uvicorn app.main:app --reload
```

Open `http://localhost:8000/docs`.

## API

Base path: `/api/v1`.

Health: `GET /api/v1/health/live`, `GET /api/v1/health/ready`

Current user: `GET /api/v1/auth/me` with `Authorization: Bearer <supabase-access-token>`.

## Migration rule

Do not rewrite the existing database first. Migrate one domain at a time from direct mobile/admin Supabase calls and Edge Functions into FastAPI, keep compatibility during rollout, then retire the legacy path.
