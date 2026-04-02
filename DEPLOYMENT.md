# Deployment Guide

This document explains how to deploy Student Intelligence Layer as a real multi-service product.

It covers:

- production deployment topology
- required services
- environment configuration
- migration order
- frontend deployment
- backend API deployment
- worker deployment
- provider setup
- rollout verification and rollback

Primary references:

- `/Users/HP/outlook-bot/backend/src/config/env.ts`
- `/Users/HP/outlook-bot/backend/src/server.ts`
- `/Users/HP/outlook-bot/backend/src/workers/index.ts`
- `/Users/HP/outlook-bot/frontend/package.json`
- `/Users/HP/outlook-bot/backend/package.json`
- `/Users/HP/outlook-bot/backend/db/schema.sql`
- `/Users/HP/outlook-bot/backend/db/migrations`

## 1. Deployment Topology

Recommended production shape:

```text
Frontend            -> Vercel or other static host
Backend API         -> Node service / container platform
Worker              -> separate Node service / container platform
PostgreSQL          -> managed Postgres
Redis               -> managed Redis
Supabase            -> waitlist storage
Google Cloud        -> Gmail / Calendar OAuth + APIs
Azure / Microsoft   -> Outlook / Graph OAuth + webhook support
LLM Provider        -> OpenRouter, Groq, and/or Gemini
```

Why this split is recommended:

- frontend can deploy independently of backend logic
- worker failures do not take down auth or page loads
- API can scale independently from AI-heavy workloads
- Redis and Postgres can be operated as managed infrastructure

## 2. Production Prerequisites

Before deploying anything, you should have:

### Infrastructure

- managed PostgreSQL instance
- managed Redis instance
- production domain(s)
- TLS certificates at the edge
- secret manager or secure environment-variable store

### Provider accounts

- Google Cloud project with OAuth credentials
- Azure app registration for Microsoft Graph
- Supabase project with `waitlist` table and unique email constraint
- at least one AI provider key

### Application readiness

- database migrations prepared
- frontend build passing
- backend build passing
- worker boot tested against staging infra

## 3. Environment Strategy

At minimum, keep these environments separate:

- local
- staging
- production

Never share these between staging and production:

- OAuth apps
- JWT secrets
- token encryption key
- Postgres database
- Redis instance
- Supabase project
- AI provider keys if usage accounting matters by environment

## 4. Backend Environment Variables

Authoritative runtime parsing is in `/Users/HP/outlook-bot/backend/src/config/env.ts`.

## 4.1 Required to boot

These must exist:

- `DATABASE_URL`
- `REDIS_URL`
- `AUTH_JWT_SECRET`
- `TOKEN_ENC_KEY`
- `MS_CLIENT_ID`
- `MS_CLIENT_SECRET`
- `MS_REDIRECT_URI`

Important current implementation note:

- Microsoft env vars are still required at boot even if you plan to test or launch Gmail first.

## 4.2 Strongly recommended

- `NODE_ENV=production`
- `PORT`
- `FRONTEND_URL`
- `AUTH_JWT_ISSUER`
- `AUTH_JWT_AUDIENCE`
- `AUTH_COOKIE_NAME`
- `MS_TENANT_ID`
- `MS_SCOPES`
- `MS_WEBHOOK_NOTIFICATION_URL`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URI`
- `GOOGLE_SCOPES`
- `AI_PROVIDER`
- `AI_MODEL`
- `OPENROUTER_API_KEY`
- `GROQ_API_KEY`
- `GEMINI_API_KEY`
- `AI_TIMEOUT_MS`
- `AI_MAX_RETRIES`
- `AGENT_LOOP_MAX_MS`
- `SYNC_BATCH_SIZE`
- `CACHE_TTL_SECONDS`

## 4.3 Production notes

- `FRONTEND_URL` is used by CORS and auth redirects; set it to the real public frontend origin
- use a strong `TOKEN_ENC_KEY` and rotate it through an explicit plan, not casually
- use a distinct `AUTH_JWT_SECRET` per environment

## 5. Frontend Environment Variables

Frontend runtime expects:

- `VITE_API_BASE`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Important current implementation note:

- `/Users/HP/outlook-bot/frontend/src/lib/supabase.ts` throws if the Supabase env vars are missing
- that means production frontend deploys must always include the Supabase settings, even if the waitlist is not your main focus

## 6. Database Setup

## 6.1 Greenfield setup

For a fresh environment:

```bash
psql "$DATABASE_URL" -f /Users/HP/outlook-bot/backend/db/schema.sql
```

## 6.2 Upgrade path setup

For an existing environment, apply migrations in order:

```bash
psql "$DATABASE_URL" -f /Users/HP/outlook-bot/backend/db/migrations/002_agent_system.sql
psql "$DATABASE_URL" -f /Users/HP/outlook-bot/backend/db/migrations/003_autopilot_level.sql
psql "$DATABASE_URL" -f /Users/HP/outlook-bot/backend/db/migrations/004_agent_enhancements.sql
psql "$DATABASE_URL" -f /Users/HP/outlook-bot/backend/db/migrations/005_personality_mode.sql
psql "$DATABASE_URL" -f /Users/HP/outlook-bot/backend/db/migrations/006_google_integration.sql
psql "$DATABASE_URL" -f /Users/HP/outlook-bot/backend/db/migrations/007_productization_indexes.sql
psql "$DATABASE_URL" -f /Users/HP/outlook-bot/backend/db/migrations/008_autonomous_operator_hardening.sql
```

Deployment recommendation:

- run migrations before new backend and worker code receives traffic
- take a backup before production schema changes
- verify critical indexes after migration

## 7. Redis Setup

Redis is required for:

- BullMQ
- dashboard caching
- state-aware planning hashes
- hot cost aggregate cache

Deployment guidance:

- use a managed Redis with persistence and monitoring if possible
- put Redis in the same region as backend and worker
- ensure connection limits can handle both API and worker traffic

## 8. Frontend Deployment (Vercel Recommended)

## 8.1 Project settings

Use `/Users/HP/outlook-bot/frontend` as the project root.

Recommended settings:

- framework preset: `Vite`
- build command: `npm run build`
- output directory: `dist`

## 8.2 Frontend env vars

Set at minimum:

- `VITE_API_BASE=https://api.your-domain.com`
- `VITE_SUPABASE_URL=https://your-project.supabase.co`
- `VITE_SUPABASE_ANON_KEY=...`

## 8.3 Frontend verification

After deploy, verify:

- `/` loads correctly
- waitlist form submits
- `/auth/callback` loads
- protected routes redirect correctly when unauthenticated
- authenticated routes work after OAuth login

## 9. Backend API Deployment

You can deploy the backend anywhere that can run a Node process built from `/Users/HP/outlook-bot/backend`.

## 9.1 Build and start commands

Build:

```bash
cd /Users/HP/outlook-bot/backend
npm install
npm run build
```

Start:

```bash
node dist/server.js
```

## 9.2 Render example

For a Render web service:

- root directory: `backend`
- build command: `npm install && npm run build`
- start command: `node dist/server.js`

## 9.3 Fly.io or container example

Equivalent runtime command:

```bash
node dist/server.js
```

API deployment checks:

- `/health` returns `{ "ok": true }`
- CORS accepts the frontend origin
- auth redirects point back to the real frontend callback
- secure cookies work over HTTPS

## 10. Worker Deployment

The worker must be deployed separately from the API.

## 10.1 Build and start

Build:

```bash
cd /Users/HP/outlook-bot/backend
npm install
npm run build
```

Worker runtime:

```bash
npm run worker
```

Important current note:

- the worker uses the TypeScript source entrypoint through `tsx`
- if you want a pure compiled production worker command later, that would be a code change; document the current reality as-is

## 10.2 Why separate the worker

Do not colocate the worker with the API as a shared process unless you accept operational coupling.

Separate worker deployment gives you:

- queue isolation
- independent scaling
- easier AI-related incident containment
- cleaner rollout and rollback paths

## 11. Google Deployment Setup

For Gmail support, configure Google Cloud with:

- Gmail API enabled
- Google Calendar API enabled if calendar features are used
- OAuth consent screen configured
- exact redirect URI:
  - `https://api.your-domain.com/auth/google/callback`

Required backend env:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URI`
- `GOOGLE_SCOPES`

Production validation:

- user can connect Gmail
- inbox sync succeeds
- label/archive actions work
- draft reply works
- calendar event creation works if scope enabled

## 12. Microsoft Deployment Setup

For Outlook support, configure Azure with:

- app registration
- Microsoft Graph permissions for mail/calendar flows
- exact redirect URI:
  - `https://api.your-domain.com/auth/microsoft/callback`

Required backend env:

- `MS_CLIENT_ID`
- `MS_CLIENT_SECRET`
- `MS_REDIRECT_URI`
- `MS_TENANT_ID`
- `MS_SCOPES`

Optional but important for webhook freshness:

- `MS_WEBHOOK_NOTIFICATION_URL=https://api.your-domain.com/webhooks/graph`

Production validation:

- user can connect Outlook
- webhook handshake works if configured
- subscription rows are created in `graph_subscriptions`
- inbox sync and calendar actions succeed

## 13. Supabase Waitlist Setup

Current public waitlist behavior is frontend-direct and depends on:

- `/Users/HP/outlook-bot/frontend/src/lib/supabase.ts`
- `/Users/HP/outlook-bot/frontend/src/pages/Landing.tsx`

Supabase requirements:

- project created
- `waitlist` table exists
- `email` uniqueness constraint exists
- insert permission is allowed for the frontend client in whatever policy model you choose

Frontend env:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Production validation:

- valid email inserts successfully
- duplicate email returns the expected friendly message
- timeout/network issue shows the fallback error state

## 14. DNS, TLS, and URL Design

Recommended public URLs:

- frontend: `https://app.your-domain.com`
- API: `https://api.your-domain.com`

Important alignment requirements:

- `FRONTEND_URL` must match the frontend origin used by users
- provider redirect URIs must exactly match the public API callback URLs
- webhook notification URL must be public HTTPS

## 15. Deployment Order

Recommended release order:

1. provision Postgres and Redis
2. apply DB schema or migrations
3. deploy backend API with production env
4. deploy worker with the same backend env set
5. deploy frontend with API and Supabase env
6. configure provider redirect URIs and webhook URLs
7. run smoke tests

Why this order works:

- the API and worker need DB shape before they start
- the frontend should not point to an incomplete backend
- OAuth provider configs must reference stable public URLs

## 16. Post-Deploy Smoke Test

After every deploy, run this exact sanity sequence:

1. `GET /health`
2. load the landing page
3. submit the waitlist form
4. start OAuth flow for a provider
5. complete login and land on `/dashboard`
6. trigger inbox sync
7. confirm emails appear on `/inbox`
8. confirm tasks appear on `/tasks` or `/dashboard`
9. open `/agent` and confirm action history or previews render
10. logout and verify protected routes no longer render

## 17. Rollback Strategy

## 17.1 Frontend rollback

If a frontend deploy is bad:

- roll back the frontend deployment first
- verify `VITE_API_BASE` still points to the correct backend

## 17.2 Backend rollback

If an API deploy is bad:

- roll back API and worker together if they depend on the same code behavior
- verify migrations are backward compatible before reversing code

## 17.3 Database rollback

Be careful here:

- do not assume schema rollback is trivial
- use backups and tested migration strategy
- if a migration is not easily reversible, prefer restoring from backup only when absolutely necessary

## 18. Monitoring Immediately After Launch

Watch closely for the first hours after deployment:

- auth callback failures
- `/auth/session` error rate
- sync queue backlog
- provider API failures
- preview creation failures
- action execution failures
- AI timeout spikes
- cost per action spikes

## 19. Known Deployment Constraints

These are current realities of the codebase:

- backend boot currently requires Microsoft env vars even for Gmail-first testing
- frontend boot currently requires Supabase env vars because the landing page imports the Supabase client directly
- the worker is currently launched through `tsx src/workers/index.ts`
- the system does not yet include a full automated release suite

## 20. Recommended Staging Acceptance Checklist

Before promoting staging to production:

1. frontend build passes
2. backend build passes
3. worker boots
4. migrations applied cleanly
5. Gmail login works if enabled
6. Outlook login works if enabled
7. manual sync works
8. dashboard renders real data
9. preview/approval flow works
10. undo/rollback critical paths work
11. landing waitlist works
12. no critical log anomalies remain
