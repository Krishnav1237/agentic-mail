# Deployment Guide

## Frontend (Vercel)

1. Create a new Vercel project and import the `frontend/` directory.
2. Set the build settings:
   - Framework: Vite
   - Build command: `npm run build`
   - Output directory: `dist`
3. Add environment variables:
   - `VITE_API_BASE` = `https://your-api.example.com`
4. Deploy.

## Backend (Render or Fly.io)

### Render

1. Create a new **Web Service**.
2. Root directory: `backend/`.
3. Build command: `npm install && npm run build`.
4. Start command: `node dist/server.js`.
5. Add environment variables from `backend/.env.example`.
6. Create a second **Background Worker** service with:
   - Root directory: `backend/`
   - Build command: `npm install && npm run build`
   - Start command: `node dist/workers/index.js`

### Fly.io (alternative)

1. Create two Fly apps: one for API, one for workers.
2. Build with `npm install && npm run build`.
3. Run API with `node dist/server.js` and workers with `node dist/workers/index.js`.

## Postgres + Redis

Use managed services (Neon, Supabase, or Render Postgres for DB; Upstash or Redis Cloud for Redis).

Set the following environment variables:

- `DATABASE_URL`
- `REDIS_URL`
- `AUTH_JWT_SECRET`
- `AUTH_JWT_ISSUER`
- `AUTH_JWT_AUDIENCE`
- `TOKEN_ENC_KEY`
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
```

## Microsoft Graph Webhooks

Ensure `MS_WEBHOOK_NOTIFICATION_URL` is publicly reachable over HTTPS and routed to:

- `POST /webhooks/graph`

Update your Azure App Registration redirect URI to:

- `https://your-api.example.com/auth/microsoft/callback`

Update your Google Cloud OAuth redirect URI to:

- `https://your-api.example.com/auth/google/callback`
