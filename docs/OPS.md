# Operations Guide

This document is the operational handbook for running Student Intelligence Layer day to day.

It is written for engineers and operators who need to:

- boot the system locally or in staging
- understand what processes must be running
- monitor whether the product is healthy
- investigate sync, queue, planner, or action failures
- scale the API and workers without changing architecture
- recover safely from incidents

Primary implementation anchors:

- `/Users/HP/outlook-bot/backend/src/server.ts`
- `/Users/HP/outlook-bot/backend/src/workers/index.ts`
- `/Users/HP/outlook-bot/backend/src/workers/ingestionWorker.ts`
- `/Users/HP/outlook-bot/backend/src/workers/aiProcessor.ts`
- `/Users/HP/outlook-bot/backend/src/queues/index.ts`
- `/Users/HP/outlook-bot/backend/src/config/env.ts`
- `/Users/HP/outlook-bot/backend/src/services/ingestion.ts`
- `/Users/HP/outlook-bot/backend/src/agent/coreLoop.ts`
- `/Users/HP/outlook-bot/backend/src/observability/costTracker.ts`

## 1. Operational Model

Student Intelligence Layer is split into a few operational roles:

### Frontend

Path:

- `/Users/HP/outlook-bot/frontend`

Role:

- serves the landing page
- accepts waitlist signups through Supabase
- hosts the authenticated app shell and internal pages
- talks directly to the backend API with `credentials: 'include'`

### Backend API

Path:

- `/Users/HP/outlook-bot/backend`

Role:

- handles OAuth, session, and protected REST endpoints
- exposes task, inbox, goals, preferences, feedback, action, and preview endpoints
- writes durable product state into PostgreSQL
- queues async work into BullMQ via Redis

### Worker process

Path:

- `/Users/HP/outlook-bot/backend`

Role:

- runs inbox ingestion jobs
- runs the autonomous agent loop on a schedule and on demand
- performs provider sync, AI calls, planning, preview generation, execution, reflection, and memory optimization

### PostgreSQL

Role:

- durable system of record
- stores users, emails, tasks, plans, actions, reflections, memory, goals, preferences, and AI usage records

### Redis

Role:

- BullMQ transport
- cache layer for dashboard reads and hot aggregates
- state-hash storage for the state-aware planner skip system
- short-lived operational counters

### External providers

- Gmail API
- Google Calendar API
- Microsoft Graph Mail
- Microsoft Graph Calendar
- one or more LLM providers (`openrouter`, `groq`, `gemini`)
- Supabase for the public waitlist only

## 2. Process Topology

At minimum, a working environment needs:

1. frontend process
2. backend API process
3. backend worker process
4. PostgreSQL
5. Redis

Recommended deployment split:

```text
Frontend        -> static host / Vercel
Backend API     -> Node service / container
Worker          -> separate Node service / container
PostgreSQL      -> managed database
Redis           -> managed Redis
Supabase        -> managed waitlist database/service
```

Why the split matters:

- API latency should not depend on AI/planning throughput
- worker crashes should not take down auth or reads
- Redis/queue pressure should be isolated from frontend availability
- deployment rollback is easier when frontend, API, and worker are separately releasable

## 3. Runtime Cadence

Current worker bootstrap logic lives in `/Users/HP/outlook-bot/backend/src/workers/index.ts`.

By default it schedules:

- `sync-all` every 5 minutes
- `run-all` every 5 minutes

That means the production behavior today is:

- inboxes are periodically refreshed even if the user does nothing
- the continuous agent loop is periodic, not true streaming
- Graph webhooks can accelerate Outlook freshness, but the worker cadence remains the main consistency mechanism

## 4. Required Environment Variables

Authoritative parsing happens in `/Users/HP/outlook-bot/backend/src/config/env.ts`.

### Backend hard requirements

These must be present or the backend will fail to boot:

- `DATABASE_URL`
- `REDIS_URL`
- `AUTH_JWT_SECRET`
- `TOKEN_ENC_KEY`
- `MS_CLIENT_ID`
- `MS_CLIENT_SECRET`
- `MS_REDIRECT_URI`

Important current implementation note:

- Microsoft OAuth env vars are currently required at process boot, even if you are testing Gmail-first.
- Google OAuth env vars are optional in code, but required if you want Gmail login and Gmail-powered actions.

### Backend important operational knobs

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

### Frontend required environment

The frontend requires:

- `VITE_API_BASE`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Important current implementation note:

- `/Users/HP/outlook-bot/frontend/src/lib/supabase.ts` throws during startup if Supabase env vars are missing.
- That means the landing page is not optional with respect to env configuration: production frontend deploys must set Supabase env vars even if the rest of the app is the main focus.

## 5. Local Operations

### Start infrastructure

From the repo root you can use Docker Compose for local Postgres and Redis:

```bash
cd /Users/HP/outlook-bot
docker compose up -d
```

### Backend API

```bash
cd /Users/HP/outlook-bot/backend
npm install
npm run dev
```

### Worker

```bash
cd /Users/HP/outlook-bot/backend
npm run worker
```

### Frontend

```bash
cd /Users/HP/outlook-bot/frontend
npm install
npm run dev
```

### Production builds

Backend:

```bash
cd /Users/HP/outlook-bot/backend
npm run build
```

Frontend:

```bash
cd /Users/HP/outlook-bot/frontend
npm run build
```

## 6. Database and Migration Operations

For greenfield environments, the easiest path is:

- apply `/Users/HP/outlook-bot/backend/db/schema.sql`

For upgrade paths, apply migrations in order:

1. `/Users/HP/outlook-bot/backend/db/migrations/002_agent_system.sql`
2. `/Users/HP/outlook-bot/backend/db/migrations/003_autopilot_level.sql`
3. `/Users/HP/outlook-bot/backend/db/migrations/004_agent_enhancements.sql`
4. `/Users/HP/outlook-bot/backend/db/migrations/005_personality_mode.sql`
5. `/Users/HP/outlook-bot/backend/db/migrations/006_google_integration.sql`
6. `/Users/HP/outlook-bot/backend/db/migrations/007_productization_indexes.sql`
7. `/Users/HP/outlook-bot/backend/db/migrations/008_autonomous_operator_hardening.sql`

Operational guidance:

- run migrations before deploying new API or worker code that expects the new columns/tables
- validate indexes on `emails`, `extracted_tasks`, `agent_actions`, and cost tables after migration
- snapshot the database before production schema changes

## 7. Queues and Worker Responsibilities

Current queue ownership is defined under `/Users/HP/outlook-bot/backend/src/queues` and worker startup is in `/Users/HP/outlook-bot/backend/src/workers`.

### Ingestion queue

Purpose:

- sync one user inbox
- periodic `sync-all`
- webhook-triggered or manual refreshes

Signals to watch:

- backlog growth
- retries and exponential backoff events
- provider-specific auth failures
- per-user sync starvation

### Agent queue

Purpose:

- run the core loop per user
- periodic `run-all`
- reactive runs after sync or other triggers

Signals to watch:

- planner skip rate versus actual execution rate
- heavy planner invocation frequency
- preview creation bursts
- action failure clusters

## 8. What “Healthy” Looks Like

A healthy system typically shows:

- `/health` returns `200` with `{ "ok": true }`
- frontend loads without repeated session failures
- `POST /emails/sync` returns quickly with `{ "status": "queued" }`
- ingestion queue drains steadily
- emails move from `pending` to `processed`
- dashboard data refreshes after sync without long staleness
- agent actions are created in expected volumes
- preview-required actions appear in `/agent`
- cost per action remains within expected bounds

## 9. Observability Sources

### Application logs

Current backend logging uses `pino` and `pino-http`.

Important log-producing areas:

- request logs in `/Users/HP/outlook-bot/backend/src/app.ts`
- worker bootstrap and failures in `/Users/HP/outlook-bot/backend/src/workers/index.ts`
- agent logs in `/Users/HP/outlook-bot/backend/src/agent/logs.ts`
- frontend console instrumentation in `/Users/HP/outlook-bot/frontend/src/lib/api.ts` and app context

What to capture centrally:

- request path, latency, status
- provider auth failures
- sync enqueue and failure events
- preview approval and cancellation events
- agent step logs
- action execution failures
- rollback and undo attempts
- AI usage and cost anomalies

### Durable operational tables

Useful investigation tables:

- `emails`
- `extracted_tasks`
- `agent_actions`
- `agent_plans`
- `agent_reflections`
- `agent_logs`
- `decision_traces`
- `memory_store`
- `llm_usage_events`
- `llm_cost_daily_aggregates`

### Redis-backed runtime state

Useful Redis-backed concepts:

- BullMQ queue depth and stalled jobs
- dashboard cache freshness
- state hash values used to skip planning
- hot cost aggregate caches

## 10. Health Checks and Quick Triage Commands

### API health

```bash
curl http://localhost:4000/health
```

### List recent agent actions

```sql
SELECT action_type, status, workflow_name, created_at
FROM agent_actions
ORDER BY created_at DESC
LIMIT 20;
```

### Check emails still pending processing

```sql
SELECT status, COUNT(*)
FROM emails
GROUP BY status;
```

### Check current daily AI cost

```sql
SELECT summary_date, workflow_key, total_requests, total_cost, cost_per_action, cost_per_successful_action
FROM llm_cost_daily_aggregates
ORDER BY summary_date DESC, workflow_key ASC;
```

### Check recent agent errors

```sql
SELECT step, message, created_at
FROM agent_logs
WHERE step LIKE '%error%'
ORDER BY created_at DESC
LIMIT 50;
```

## 11. Scaling Guidance

## 11.1 API scaling

The API is mostly stateless and can scale horizontally.

Scale API when you see:

- rising `/auth/session` latency
- increasing p95 on list endpoints like `/emails` and `/tasks`
- request saturation from many simultaneous authenticated users

Before scaling API, check:

- Postgres query plans
- CORS and cookie behavior at the edge
- whether the bottleneck is really worker freshness instead of request capacity

## 11.2 Worker scaling

The worker is usually the first scaling bottleneck.

Scale workers when you see:

- sync jobs backing up
- agent runs lagging behind inbox freshness
- long preview creation delays
- elevated AI timeout rates

Operational strategy:

- add worker replicas before adding API replicas
- watch provider quotas before assuming the queue is the only bottleneck
- keep BullMQ and Redis stable before increasing concurrency

## 11.3 Database scaling

Watch closely:

- `emails` query latency
- `extracted_tasks` filter/sort latency
- `agent_actions` growth and dashboard summary queries
- `llm_usage_events` growth over time

Operational tasks:

- review index hit rates
- archive or partition high-volume audit tables if growth becomes large
- vacuum and analyze regularly in production

## 11.4 Redis scaling

Redis supports several critical runtime paths, not just queues.

Watch:

- memory usage
- connection count
- command latency
- eviction rate

Operational risk:

- if Redis degrades, queue throughput, cache freshness, and state-aware planning efficiency all degrade together

## 12. Queue Failure Modes

### Ingestion backlog grows

Likely causes:

- provider rate limiting
- expired or revoked tokens
- worker under-provisioning
- Redis instability

First checks:

1. confirm worker is running
2. inspect queue depth
3. inspect recent provider errors
4. verify user token refresh behavior

### Agent backlog grows

Likely causes:

- heavy planner or AI latency spikes
- large sync bursts creating too many downstream runs
- planner repeatedly generating preview-heavy workflows

First checks:

1. inspect `AI_TIMEOUT_MS` and provider health
2. inspect `llm_usage_events` latency
3. inspect planner skip rate
4. inspect number of actions created per workflow

## 13. Provider Operations

## 13.1 Gmail

Operational needs:

- Google OAuth app configured with exact redirect URI
- Gmail API enabled
- Calendar API enabled if calendar creation is expected
- scopes aligned with implemented features

Operational checks:

- drafts appear in Gmail
- labels and archive behavior work as expected
- token refresh remains functional across long-lived sessions

## 13.2 Outlook / Microsoft Graph

Operational needs:

- Azure app registration configured with exact redirect URI
- Graph permissions granted for mail and calendar operations
- webhook notification URL publicly reachable if subscriptions are used

Operational checks:

- subscriptions persist in `graph_subscriptions`
- `validationToken` handshake on `/webhooks/graph` succeeds
- webhook notifications enqueue sync jobs

## 14. Cost Operations

AI cost tracking is implemented in `/Users/HP/outlook-bot/backend/src/observability/costTracker.ts`.

What is tracked today:

- prompt tokens
- completion tokens
- total tokens
- latency per AI request
- estimated cost per request
- cost per action
- cost per successful action
- cost per workflow

Operational uses:

- detect runaway planner behavior
- detect expensive models being invoked unexpectedly often
- compare fast-planner skip rate versus heavy-planner usage
- understand whether autopilot behavior is increasing cost without corresponding user value

Useful query:

```sql
SELECT workflow_key, total_requests, total_cost, actions_created, successful_actions
FROM llm_cost_daily_aggregates
WHERE summary_date = CURRENT_DATE
ORDER BY total_cost DESC;
```

## 15. Incident Runbooks

## 15.1 Users can log in but no inbox data appears

Check:

1. `POST /emails/sync` works
2. ingestion worker is alive
3. provider token is still valid
4. `emails` rows are being inserted for the user
5. `users.last_sync_at` is updating

## 15.2 Emails ingest but tasks are not appearing

Check:

1. whether `emails.ai_json`, `classification`, and `processed_at` are being populated
2. whether `create_task` actions are being generated
3. whether `extracted_tasks` writes are succeeding
4. whether worker logs show AI validation failures

## 15.3 Agent appears idle

Check:

1. whether the state hash is unchanged and correctly skipping heavy planning
2. whether the agent queue is receiving jobs
3. whether `agent_actions` are being created
4. whether the planner is falling back to fast-only due to latency budget

## 15.4 Too many actions are being created

Check:

1. dedupe effectiveness in merged plans
2. whether planner rules are over-firing on repetitive input
3. whether state normalization is too sensitive
4. whether feedback/policy is failing to calm repeated workflows

## 15.5 Preview approvals do not execute

Check:

1. `agent_actions.status` for previewed rows
2. whether workflow/action ids match approval requests
3. whether execution keys are colliding incorrectly
4. whether tool validation is rejecting the preview payload

## 15.6 Dashboard looks stale

Check:

1. cache invalidation after task updates
2. dashboard cache TTL
3. whether sync finished but agent loop has not yet run
4. whether the frontend is using outdated session or stale list state

## 16. Backup and Recovery Expectations

Minimum production posture:

- daily PostgreSQL backups
- tested restore process
- point-in-time recovery if available from managed DB
- Redis treated as recoverable but still monitored closely
- secure backup storage with restricted access

Recovery priorities:

1. users
2. emails
3. extracted_tasks
4. agent_actions / agent_plans / agent_reflections
5. memory tables
6. AI usage tables

Why this order matters:

- users and emails restore core product access
- tasks and actions restore the visible user experience
- memory and usage data improve continuity but are less critical than core operational records

## 17. Release Readiness Checklist

Before any production release:

1. backend build passes
2. frontend build passes
3. migrations are applied in staging
4. OAuth redirects are verified for both Gmail and Microsoft if both are enabled
5. manual sync succeeds
6. agent preview and approval flow succeeds
7. undo/rollback critical paths are validated
8. dashboard, inbox, tasks, and agent pages load with real data
9. no unexpected increase in cost metrics on staging
10. rollback plan is documented

## 18. Known Operational Constraints

These are current realities of the codebase and should be documented, not hidden:

- the backend currently requires Microsoft env vars at startup
- the frontend currently requires Supabase waitlist env vars at startup
- the product does not yet ship with a full automated test suite in the repo
- the worker cadence is periodic every 5 minutes rather than event-stream continuous
- the system is single-agent only; all autonomy passes through one loop

## 19. Recommended Reading During Incidents

If you are actively debugging production, read these in order:

1. `/Users/HP/outlook-bot/docs/API.md`
2. `/Users/HP/outlook-bot/docs/ARCHITECTURE.md`
3. `/Users/HP/outlook-bot/docs/DATABASE.md`
4. `/Users/HP/outlook-bot/backend/src/agent/coreLoop.ts`
5. `/Users/HP/outlook-bot/backend/src/services/ingestion.ts`
6. `/Users/HP/outlook-bot/backend/src/routes/agent.ts`
7. `/Users/HP/outlook-bot/backend/src/routes/emails.ts`
8. `/Users/HP/outlook-bot/backend/src/observability/costTracker.ts`
