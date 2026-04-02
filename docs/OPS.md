# Operations

This document covers how to run, deploy, observe, and scale Inbox Intelligence Layer in a production-style environment.

## Service Layout

### Backend API

- path: `backend`
- responsibility: REST API, auth, session handling, reads/writes, preview approvals

### Worker

- path: `backend`
- responsibility: ingestion, AI processing, autonomous agent loop, reflections, memory optimization

### Frontend

- path: `frontend`
- responsibility: landing page, dashboard, inbox, tasks, agent feed, settings

### Dependencies

- PostgreSQL
- Redis
- Gmail API and/or Microsoft Graph
- one configured LLM provider

## Local Runtime Commands

Backend:

```bash
cd backend
npm run dev
```

Worker:

```bash
cd backend
npm run worker
```

Frontend:

```bash
cd frontend
npm run dev
```

## Production Build Commands

Backend:

```bash
cd backend
npm run build
```

Frontend:

```bash
cd frontend
npm run build
```

## Migration Order

Apply in order:

1. `backend/db/migrations/002_agent_system.sql`
2. `backend/db/migrations/003_autopilot_level.sql`
3. `backend/db/migrations/004_agent_enhancements.sql`
4. `backend/db/migrations/005_personality_mode.sql`
5. `backend/db/migrations/006_google_integration.sql`
6. `backend/db/migrations/007_productization_indexes.sql`
7. `backend/db/migrations/008_autonomous_operator_hardening.sql`

For greenfield environments, using `backend/db/schema.sql` is simpler.

## Required Environment

Minimum backend environment groups:

- database and redis
- auth and token encryption
- at least one AI provider
- Gmail and/or Microsoft provider config

Important operational knobs:

- `AI_TIMEOUT_MS`
- `AI_MAX_RETRIES`
- `AGENT_LOOP_MAX_MS`
- `SYNC_BATCH_SIZE`
- `CACHE_TTL_SECONDS`

## Deployment Topology

Recommended production split:

```text
Frontend hosting: Vercel or static CDN
Backend API: container or Node runtime
Worker: separate container/process group
PostgreSQL: managed database
Redis: managed Redis
```

Recommended separation:

- frontend deploy independent from backend deploy
- worker deploy independent from API deploy
- staging and production credentials fully isolated

## Worker and Queue Guidance

BullMQ workloads should be isolated by concern when scale increases:

- ingestion-heavy queue capacity
- AI/planning capacity
- retry and dead-letter monitoring

Current practical guidance:

- start with one API instance and one worker instance
- scale workers first when sync or AI latency becomes the bottleneck
- keep Redis latency low because queues, cache, and state hash checks depend on it

## Scaling Notes

### API

API is stateless and can scale horizontally.

Watch:

- auth/session response times
- inbox and tasks list query latency
- cache hit rate for dashboard reads

### Worker

Worker throughput determines:

- ingestion freshness
- extraction latency
- autonomous action responsiveness

Watch:

- queue depth
- queue latency
- retry counts
- AI timeout rates

### PostgreSQL

Watch:

- slow queries on `emails`, `extracted_tasks`, and `agent_actions`
- bloat in action and memory tables
- index effectiveness

### Redis

Watch:

- memory pressure
- connection count
- queue latency
- hot key abuse

## Monitoring and Alerting

Recommended dashboards:

### Product Health

- sync jobs queued vs completed
- number of pending emails
- number of preview actions awaiting approval
- number of failed actions

### Agent Health

- planner skip rate
- heavy planner invocation rate
- workflow execution success rate
- rollback and undo frequency
- reflection failure rate

### AI and Cost

- prompt tokens
- completion tokens
- latency by model/provider
- cost per day
- cost per action
- cost per successful action
- cost per workflow

### Infrastructure

- API p95 latency
- worker p95 execution time
- Postgres CPU and slow queries
- Redis latency and memory usage

## Logging

Important events worth retaining:

- OAuth connection and failure events
- sync requests and failures
- planner skip decisions
- preview creation
- approvals, cancels, and modifies
- action execution failures
- recovery and rollback attempts
- LLM usage and cost anomalies

## Webhooks

Microsoft Graph webhook endpoint:

```text
POST /webhooks/graph
```

Operational requirements:

- publicly reachable HTTPS URL
- stable DNS
- valid TLS
- reliable request logging

## Backups and Recovery

Minimum production posture:

- daily Postgres backups
- backup retention policy
- restore drill for `users`, `emails`, `extracted_tasks`, `agent_actions`, `memory_store`
- Redis can be treated as rebuildable for cache and queue metadata, but queue recovery planning still matters

## Incident Playbooks

### If sync fails

Check:

- OAuth token validity
- provider API quotas
- queue backlog
- worker health

### If previews are not appearing

Check:

- ingestion completed
- planner skip status
- agent action inserts
- confidence thresholds
- preview endpoint behavior

### If actions duplicate

Check:

- execution key generation
- `agent_actions` rows for repeated `__meta.execution_key`
- merge/dedupe behavior
- retry paths in executor

### If costs spike

Check:

- heavy planner call rate
- planner skip rate
- retry loops
- model selection
- cost aggregates in `llm_usage_events` and `llm_cost_daily_aggregates`

## Pre-Launch Checklist

1. Apply all migrations
2. Confirm backend and frontend production builds succeed
3. Validate Gmail and Outlook OAuth flows
4. Confirm Redis and Postgres production credentials
5. Run the test checklist in `docs/TESTING.md`
6. Review `delete_email` and `send_reply` approval posture
7. Confirm rate limits, CORS, and cookie settings for production domains
8. Confirm backup and restore path for Postgres
