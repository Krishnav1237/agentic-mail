# Student Intelligence Layer

Student Intelligence Layer is a production-oriented SaaS for turning a student inbox into a structured execution system.

It currently supports:

- Gmail and Microsoft Outlook OAuth connections
- inbox ingestion through Gmail API and Microsoft Graph
- email classification and structured extraction
- task, deadline, and opportunity generation
- a continuous single-agent loop with planning, preview, execution, reflection, and memory
- goal-aware prioritization and personalization
- a multi-page frontend for dashboarding, inbox review, agent oversight, and settings
- direct landing-page waitlist capture through Supabase

This repository contains the entire product surface:

- a `React + Vite + TypeScript + Tailwind` frontend in `/Users/HP/outlook-bot/frontend`
- a `Node.js + Express + TypeScript` backend in `/Users/HP/outlook-bot/backend`
- BullMQ workers for inbox ingestion and autonomous agent execution
- PostgreSQL for the durable product state
- Redis for queues, cache, state hashes, and hot aggregates

## What The Product Does Today

At a practical level, the current platform behaves like a goal-aware autonomous inbox operator for students:

1. A user connects Gmail or Outlook.
2. The backend stores encrypted provider tokens and establishes a session.
3. Inbox sync jobs ingest provider messages into PostgreSQL.
4. The agent loop reads pending email, open tasks, recent actions, calendar context, goals, and memory.
5. The planner decides what should happen next.
6. The executor either:
   - auto-executes safe actions when policy and confidence allow, or
   - creates preview actions for human approval.
7. The system logs what happened, reflects on the outcome, and updates memory.
8. The frontend renders the result across dashboard, tasks, inbox, agent history, and settings pages.

## Product Surfaces

### Public Surface

- `/` — cinematic landing page
- waitlist form backed by Supabase (`frontend/src/lib/supabase.ts`)
- hidden keyboard-triggered admin access mechanism still present in `Landing.tsx`

### Authenticated Product Surface

- `/dashboard` — operating summary for urgent work and opportunity visibility
- `/tasks` — paginated task workspace with filters and direct actions
- `/deadlines` — due-date grouped task view
- `/opportunities` — internship and event-focused pipeline view
- `/inbox` — paginated structured email view with message actions
- `/agent` — approvals, activity feed, execution history, and traceability surface
- `/settings` — goals, autopilot level, personality mode, and category weights
- `/auth/callback` — OAuth completion handoff route

## High-Level Architecture

```mermaid
graph TD
  Landing["Landing + Waitlist"] --> Frontend["Frontend App"]
  Frontend --> API["Express API"]
  API --> Postgres[(PostgreSQL)]
  API --> Redis[(Redis)]
  API --> Gmail["Gmail API"]
  API --> Graph["Microsoft Graph"]
  Workers["BullMQ Workers"] --> Redis
  Workers --> Postgres
  Workers --> Gmail
  Workers --> Graph
  Workers --> Agent["Single Agent Loop"]
  Agent --> Memory["Memory + Policy + Confidence"]
  Agent --> Tools["Tool Registry + Executor"]
  Agent --> Cost["LLM Cost Tracking"]
```

The runtime loop is:

```text
Perceive -> Filter -> Build Context -> Hash State -> Plan -> Preview/Execute -> Reflect -> Learn -> Repeat
```

The system is intentionally **single-agent**. It is not a multi-agent orchestration framework.

## Core Capabilities By Layer

### Frontend

Implemented in `/Users/HP/outlook-bot/frontend/src`.

Responsibilities:

- public marketing + waitlist capture
- OAuth callback handoff
- session-aware routing
- dashboard and list rendering
- human approval actions
- settings management
- reliability handling for loading, empty, and processing states

### Backend API

Implemented in `/Users/HP/outlook-bot/backend/src/app.ts` and `/Users/HP/outlook-bot/backend/src/routes/*`.

Responsibilities:

- OAuth start and callback flows
- session and logout
- paginated task/email/action reads
- action execution endpoints for user-triggered operations
- preview approval / cancel / modify endpoints
- goals, preferences, feedback, and intent APIs
- Graph webhook handling

### Background Workers

Implemented in `/Users/HP/outlook-bot/backend/src/workers`.

Responsibilities:

- periodic inbox sync
- periodic autonomous loop execution
- user-specific sync and agent jobs

### Agent Core

Implemented primarily in `/Users/HP/outlook-bot/backend/src/agent/coreLoop.ts`.

Responsibilities:

- goal-aware planning
- state-aware compute skipping
- fast planner and heavy planner selection
- workflow grouping and dedupe
- preview generation
- execution and rollback coordination
- reflection and memory updates
- activity feed generation

## Repository Structure

```text
/Users/HP/outlook-bot
├── README.md
├── DEPLOYMENT.md
├── docker-compose.yml
├── backend
│   ├── db
│   │   ├── migrations
│   │   └── schema.sql
│   ├── package.json
│   └── src
│       ├── agent
│       ├── ai
│       ├── config
│       ├── db
│       ├── memory
│       ├── middleware
│       ├── observability
│       ├── planner
│       ├── queues
│       ├── routes
│       ├── services
│       ├── tools
│       ├── utils
│       └── workers
├── frontend
│   ├── package.json
│   └── src
│       ├── components
│       ├── lib
│       ├── pages
│       └── main.tsx
└── docs
    ├── API.md
    ├── ARCHITECTURE.md
    ├── CODEMAP.md
    ├── DATABASE.md
    ├── OPS.md
    ├── SECURITY.md
    └── TESTING.md
```

## Documentation Map

Use the docs in this order if you are onboarding to the codebase:

1. `/Users/HP/outlook-bot/README.md`
   - product overview, repo layout, quickstart, and doc index
2. `/Users/HP/outlook-bot/docs/ARCHITECTURE.md`
   - full system design, runtime flow, queue model, agent stages
3. `/Users/HP/outlook-bot/docs/CODEMAP.md`
   - where each major responsibility lives in the repository
4. `/Users/HP/outlook-bot/docs/DATABASE.md`
   - schema walkthrough, table responsibilities, and relationships
5. `/Users/HP/outlook-bot/docs/API.md`
   - backend route contracts and payload shapes
6. `/Users/HP/outlook-bot/docs/OPS.md`
   - operations, monitoring, incidents, and scaling guidance
7. `/Users/HP/outlook-bot/docs/SECURITY.md`
   - implemented controls and production security checklist
8. `/Users/HP/outlook-bot/docs/TESTING.md`
   - deep validation matrix before release
9. `/Users/HP/outlook-bot/DEPLOYMENT.md`
   - staged deployment guidance for frontend, API, worker, DB, Redis, and providers

## Quick Start

### Prerequisites

- Node.js 18+
- PostgreSQL 14+
- Redis 6+
- Gmail and/or Microsoft provider credentials
- at least one configured AI provider (`OPENROUTER_API_KEY`, `GROQ_API_KEY`, or `GEMINI_API_KEY`)

### 1. Start infrastructure

You can use the included Docker Compose file:

```bash
cd /Users/HP/outlook-bot
docker-compose up -d
```

### 2. Create or migrate the database

For a new database:

```bash
psql "postgres://postgres:postgres@localhost:5432/student_intel" -f /Users/HP/outlook-bot/backend/db/schema.sql
```

For an existing database that started earlier in the project lifecycle, apply migrations in order:

```bash
psql "$DATABASE_URL" -f /Users/HP/outlook-bot/backend/db/migrations/002_agent_system.sql
psql "$DATABASE_URL" -f /Users/HP/outlook-bot/backend/db/migrations/003_autopilot_level.sql
psql "$DATABASE_URL" -f /Users/HP/outlook-bot/backend/db/migrations/004_agent_enhancements.sql
psql "$DATABASE_URL" -f /Users/HP/outlook-bot/backend/db/migrations/005_personality_mode.sql
psql "$DATABASE_URL" -f /Users/HP/outlook-bot/backend/db/migrations/006_google_integration.sql
psql "$DATABASE_URL" -f /Users/HP/outlook-bot/backend/db/migrations/007_productization_indexes.sql
psql "$DATABASE_URL" -f /Users/HP/outlook-bot/backend/db/migrations/008_autonomous_operator_hardening.sql
```

### 3. Configure the backend

```bash
cd /Users/HP/outlook-bot/backend
cp .env.example .env
npm install
```

Generate a token encryption key:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Important note about current backend configuration:

- `/Users/HP/outlook-bot/backend/src/config/env.ts` currently **requires** the Microsoft env variables at process start.
- Even if you are validating Gmail first, the Microsoft env block must still be populated in `/Users/HP/outlook-bot/backend/.env`.

### 4. Configure the frontend

```bash
cd /Users/HP/outlook-bot/frontend
cp .env.example .env
npm install
```

Frontend env supports both API calls and waitlist capture:

- `VITE_API_BASE`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

### 5. Start processes

API:

```bash
cd /Users/HP/outlook-bot/backend
npm run dev
```

Worker:

```bash
cd /Users/HP/outlook-bot/backend
npm run worker
```

Frontend:

```bash
cd /Users/HP/outlook-bot/frontend
npm run dev
```

Default local URLs:

- frontend: `http://localhost:5173`
- backend: `http://localhost:4000`

## Environment Variables

### Backend Core

- `NODE_ENV`
- `PORT`
- `FRONTEND_URL`
- `DATABASE_URL`
- `REDIS_URL`
- `AUTH_JWT_SECRET`
- `AUTH_JWT_ISSUER`
- `AUTH_JWT_AUDIENCE`
- `AUTH_COOKIE_NAME`
- `TOKEN_ENC_KEY`
- `AI_PROVIDER`
- `AI_MODEL`
- `AI_TIMEOUT_MS`
- `AI_MAX_RETRIES`
- `AGENT_LOOP_MAX_MS`
- `SYNC_BATCH_SIZE`
- `CACHE_TTL_SECONDS`

### Microsoft Graph

- `MS_CLIENT_ID`
- `MS_CLIENT_SECRET`
- `MS_TENANT_ID`
- `MS_REDIRECT_URI`
- `MS_SCOPES`
- `MS_WEBHOOK_NOTIFICATION_URL`

### Google

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URI`
- `GOOGLE_SCOPES`

### AI Provider Keys

- `OPENROUTER_API_KEY`
- `GROQ_API_KEY`
- `GEMINI_API_KEY`

### Frontend

- `VITE_API_BASE`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

See:

- `/Users/HP/outlook-bot/backend/.env.example`
- `/Users/HP/outlook-bot/frontend/.env.example`

## Provider Setup

### Gmail

1. Create a Google Cloud project.
2. Enable:
   - Gmail API
   - Google Calendar API
3. Configure the OAuth consent screen.
4. Create a Web OAuth client.
5. Add redirect URI:

```text
http://localhost:4000/auth/google/callback
```

Recommended scopes:

- `openid`
- `email`
- `profile`
- `https://www.googleapis.com/auth/gmail.readonly`
- `https://www.googleapis.com/auth/gmail.modify`
- `https://www.googleapis.com/auth/gmail.send`
- `https://www.googleapis.com/auth/calendar`

### Microsoft Outlook

1. Create an Azure App Registration.
2. Add redirect URI:

```text
http://localhost:4000/auth/microsoft/callback
```

Recommended Graph scopes:

- `offline_access`
- `User.Read`
- `Mail.Read`
- `Mail.ReadWrite`
- `Calendars.ReadWrite`

For Graph webhooks, also configure:

- `MS_WEBHOOK_NOTIFICATION_URL`
- route target: `POST /webhooks/graph`

## Current Runtime Behavior

### Worker cadence

The worker bootstrap currently schedules:

- `sync-all` every 5 minutes
- `run-all` every 5 minutes

File: `/Users/HP/outlook-bot/backend/src/workers/index.ts`

### Continuous loop inputs

The core loop currently uses:

- pending emails
- open tasks
- recent agent actions
- upcoming calendar events
- user goals
- strategist output
- intent state
- energy context
- memory summaries via context builder

### State-aware skipping

The system hashes normalized decision state and skips planning when nothing decision-relevant changed.

File: `/Users/HP/outlook-bot/backend/src/agent/stateManager.ts`

### Fast vs heavy planning

- fast planner runs deterministic rules first
- heavy planner runs only when state changed and budget/coverage warrants it

Files:

- `/Users/HP/outlook-bot/backend/src/agent/fastPlanner.ts`
- `/Users/HP/outlook-bot/backend/src/agent/heavyPlanner.ts`

## Current Features Checklist

### Implemented

- Gmail OAuth
- Outlook OAuth
- encrypted token persistence
- inbox sync
- paginated inbox view
- paginated tasks view
- deadlines page
- opportunities page
- agent history and approvals page
- goal and preference settings
- single-agent continuous loop
- state-aware planning skip
- workflow preview generation
- preview approval / cancel / modify
- undo and rollback APIs
- tool registry with risk metadata
- LLM usage event tracking
- daily cost aggregates
- waitlist capture via Supabase

### Important current limitations or notes

- the backend env loader still requires Microsoft env values at startup
- frontend routing is session-protected for internal pages, but `/` intentionally remains public
- some agent capabilities exist more fully in the backend than in the frontend UX surface
- production reliability is strongly improved, but there is still no bundled automated test suite in the repo

## Core File Index

### Backend entrypoints

- `/Users/HP/outlook-bot/backend/src/server.ts`
- `/Users/HP/outlook-bot/backend/src/app.ts`
- `/Users/HP/outlook-bot/backend/src/workers/index.ts`

### Frontend entrypoints

- `/Users/HP/outlook-bot/frontend/src/main.tsx`
- `/Users/HP/outlook-bot/frontend/src/App.tsx`

### Product-critical backend files

- `/Users/HP/outlook-bot/backend/src/routes/auth.ts`
- `/Users/HP/outlook-bot/backend/src/routes/emails.ts`
- `/Users/HP/outlook-bot/backend/src/routes/tasks.ts`
- `/Users/HP/outlook-bot/backend/src/routes/agent.ts`
- `/Users/HP/outlook-bot/backend/src/services/ingestion.ts`
- `/Users/HP/outlook-bot/backend/src/agent/coreLoop.ts`
- `/Users/HP/outlook-bot/backend/src/tools/registry.ts`
- `/Users/HP/outlook-bot/backend/src/observability/costTracker.ts`

### Product-critical frontend files

- `/Users/HP/outlook-bot/frontend/src/pages/Landing.tsx`
- `/Users/HP/outlook-bot/frontend/src/pages/AuthCallback.tsx`
- `/Users/HP/outlook-bot/frontend/src/pages/Dashboard.tsx`
- `/Users/HP/outlook-bot/frontend/src/pages/Inbox.tsx`
- `/Users/HP/outlook-bot/frontend/src/pages/Tasks.tsx`
- `/Users/HP/outlook-bot/frontend/src/pages/Agent.tsx`
- `/Users/HP/outlook-bot/frontend/src/pages/Settings.tsx`
- `/Users/HP/outlook-bot/frontend/src/lib/api.ts`
- `/Users/HP/outlook-bot/frontend/src/lib/appContext.tsx`

## Common Development Tasks

### Build frontend

```bash
cd /Users/HP/outlook-bot/frontend
npm run build
```

### Build backend

```bash
cd /Users/HP/outlook-bot/backend
npm run build
```

### Start worker only

```bash
cd /Users/HP/outlook-bot/backend
npm run worker
```

### Force an inbox sync

```bash
curl -X POST http://localhost:4000/emails/sync \
  -H "Cookie: sil_auth=<session-cookie>"
```

### Check session

```bash
curl http://localhost:4000/auth/session \
  -H "Cookie: sil_auth=<session-cookie>"
```

## Recommended Reading Paths

### If you are a product or frontend engineer

Read in this order:

1. `/Users/HP/outlook-bot/README.md`
2. `/Users/HP/outlook-bot/docs/ARCHITECTURE.md`
3. `/Users/HP/outlook-bot/docs/API.md`
4. `/Users/HP/outlook-bot/docs/CODEMAP.md`
5. `/Users/HP/outlook-bot/docs/TESTING.md`

### If you are a backend or AI systems engineer

Read in this order:

1. `/Users/HP/outlook-bot/README.md`
2. `/Users/HP/outlook-bot/docs/ARCHITECTURE.md`
3. `/Users/HP/outlook-bot/docs/DATABASE.md`
4. `/Users/HP/outlook-bot/docs/API.md`
5. `/Users/HP/outlook-bot/docs/OPS.md`
6. `/Users/HP/outlook-bot/docs/SECURITY.md`

### If you are deploying the system

Read in this order:

1. `/Users/HP/outlook-bot/README.md`
2. `/Users/HP/outlook-bot/DEPLOYMENT.md`
3. `/Users/HP/outlook-bot/docs/OPS.md`
4. `/Users/HP/outlook-bot/docs/SECURITY.md`
5. `/Users/HP/outlook-bot/docs/TESTING.md`

## Troubleshooting Quick Notes

### Frontend shows no session after OAuth

Check:

- backend `FRONTEND_URL`
- cookie settings in production
- callback redirect URI
- `/auth/session` response
- browser cookie acceptance for the deployment domain

### Sync works but UI is empty

Check:

- `emails` rows exist in PostgreSQL
- worker process is running
- `agent_actions` and `extracted_tasks` are being populated
- internal pages are not filtered down to zero rows

### Gmail works but backend fails at startup

Check:

- Microsoft env variables are still populated in `/Users/HP/outlook-bot/backend/.env`
- current env loader requires them even if Gmail is the provider you are testing first

## License / Internal Use Note

No explicit open-source license file is currently included in the repository.
If this is intended for external distribution, add a license and a short governance note before publishing.
