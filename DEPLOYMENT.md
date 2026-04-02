# Deployment Guide

## Target Setup

- Frontend: Vercel
- Backend API: Railway
- Background worker: Railway

This repository now supports that split directly:

- the frontend includes `frontend/vercel.json` for SPA route rewrites
- the backend supports cross-site auth cookies for Vercel to Railway setups
- origin matching supports exact domains plus preview-style patterns such as `https://your-app-*.vercel.app`

## Frontend (Vercel)

1. Create a new Vercel project and point it at the `frontend/` directory.
2. Use these settings:
   - Framework: Vite
   - Build command: `npm run build`
   - Output directory: `dist`
3. Add environment variables:
   - `VITE_API_BASE=https://your-api.up.railway.app`
4. Deploy.

Notes:
- `frontend/vercel.json` handles client-side routes such as `/auth/callback`, `/dashboard`, and `/tasks`.
- If you only want the landing page live first, Vercel can deploy that immediately. The waitlist form will work once `VITE_API_BASE` points to the Railway backend.

### Frontend-Only Waitlist Mode

If you want the landing page and waitlist live before deploying the backend,
the frontend can invoke a Supabase Edge Function instead of calling `/waitlist`
on the API.

Set these in Vercel:

- `VITE_SUPABASE_URL=https://your-project.supabase.co`
- `VITE_SUPABASE_ANON_KEY=your_supabase_anon_key`

In this mode:

- the landing page waitlist calls `supabase/functions/waitlist-signup`
- the rest of the authenticated app still needs the backend later
- the `waitlist` table should be created from `supabase/sql/waitlist.sql`
- Resend runs inside the Edge Function, not in the browser

Supabase requirements:

1. Run the SQL in `supabase/sql/waitlist.sql` in your Supabase project.
2. Set Edge Function secrets:
   - `RESEND_API_KEY`
   - `RESEND_FROM_EMAIL` (optional, defaults to `onboarding@resend.dev`)
3. Deploy the function:

```bash
supabase functions deploy waitlist-signup --no-verify-jwt
```

Notes:

- `--no-verify-jwt` is intentional because the landing page is public.
- Do not move `DATABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, or the Resend key
  into the frontend.

## Backend API (Railway)

1. Create a Railway service from the `backend/` directory.
2. Set:
   - Build command: `npm install && npm run build`
   - Start command: `npm run start`
3. Add environment variables from `backend/.env.example`.
4. For a Vercel frontend, set these explicitly:
   - `FRONTEND_URL=https://your-app.vercel.app,https://your-app-*.vercel.app`
   - `AUTH_COOKIE_SAME_SITE=none`
   - `AUTH_COOKIE_SECURE=true`
5. Set your provider callback URLs to the Railway API domain:
   - `GOOGLE_REDIRECT_URI=https://your-api.up.railway.app/auth/google/callback`
   - `MS_REDIRECT_URI=https://your-api.up.railway.app/auth/microsoft/callback`

Important:
- Put the canonical Vercel production URL first in `FRONTEND_URL`. The backend uses the first exact origin for redirecting the OAuth callback back to the frontend.
- The `https://your-app-*.vercel.app` pattern is for preview deployments. If you use a custom preview domain strategy instead, prefer that.

## Backend Worker (Railway)

Create a second Railway service from the same `backend/` directory:

- Build command: `npm install && npm run build`
- Start command: `node dist/workers/index.js`

Use the same env values as the API service.

## Postgres + Redis

Use managed services such as Neon, Supabase, or Railway Postgres for DB, and Upstash, Railway Redis, or Redis Cloud for Redis.

Set the following environment variables:

- `DATABASE_URL`
- `REDIS_URL`
- `QUEUE_REDIS_URL` (optional override for BullMQ)
- `CACHE_REDIS_URL` (optional override for cache/state reads)
- `FRONTEND_URL`
- `AUTH_JWT_SECRET`
- `AUTH_JWT_ISSUER`
- `AUTH_JWT_AUDIENCE`
- `AUTH_COOKIE_NAME`
- `AUTH_COOKIE_SAME_SITE`
- `AUTH_COOKIE_SECURE`
- `TOKEN_ENC_KEY`
- `SECURITY_CONTACT`
- `SECURITY_POLICY_URL`
- `MS_CLIENT_ID`
- `MS_CLIENT_SECRET`
- `MS_REDIRECT_URI`
- `MS_SCOPES`
- `MS_WEBHOOK_NOTIFICATION_URL`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URI`
- `GOOGLE_SCOPES`
- `AI_PROVIDER`, `AI_MODEL`, and API keys

Run migrations for the agent system if you are upgrading:

```bash
psql "$DATABASE_URL" -f backend/db/migrations/002_agent_system.sql
psql "$DATABASE_URL" -f backend/db/migrations/003_autopilot_level.sql
psql "$DATABASE_URL" -f backend/db/migrations/004_agent_enhancements.sql
psql "$DATABASE_URL" -f backend/db/migrations/005_personality_mode.sql
psql "$DATABASE_URL" -f backend/db/migrations/006_google_integration.sql
psql "$DATABASE_URL" -f backend/db/migrations/007_productization_indexes.sql
psql "$DATABASE_URL" -f backend/db/migrations/008_autonomous_operator_hardening.sql
```

## Microsoft Graph Webhooks

Ensure `MS_WEBHOOK_NOTIFICATION_URL` is publicly reachable over HTTPS and routed to:

- `POST /webhooks/graph`

Update your Azure App Registration redirect URI to:

- `https://your-api.up.railway.app/auth/microsoft/callback`

Update your Google Cloud OAuth redirect URI to:

- `https://your-api.up.railway.app/auth/google/callback`
