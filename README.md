# Student Intelligence Layer

Student Intelligence Layer is a production-oriented SaaS for turning a student inbox into a structured execution system. It connects to Gmail and Microsoft Outlook, ingests email, extracts tasks and deadlines, and runs a single-agent loop that can plan, preview, execute, learn, and improve over time.

This repository contains:

- A React + Vite frontend with a multi-page SaaS dashboard
- A Node.js + Express backend API
- BullMQ workers for ingestion and asynchronous agent execution
- PostgreSQL for durable product state
- Redis for queues, cache, state hashes, and hot observability aggregates

## Product Capabilities

- Gmail and Outlook OAuth connections
- Inbox sync with Microsoft Graph and Gmail APIs
- Email classification and extraction using structured LLM outputs
- Task, deadline, opportunity, and calendar generation
- Goal-aware autonomous planning
- Workflow previews, approvals, rollback, and recovery
- Memory-aware agent behavior
- Cost-aware LLM observability
- Multi-page dashboard UX built for growing data volume

## Architecture At A Glance

```mermaid
graph TD
  UI["Frontend (React + Vite)"] --> API["Backend API (Express)"]
  API --> DB[(PostgreSQL)]
  API --> Redis[(Redis)]
  API --> Providers["Gmail API / Microsoft Graph"]
  Workers["Workers (BullMQ)"] --> DB
  Workers --> Redis
  Workers --> Providers
  Workers --> Agent["Agent Loop"]
  Agent --> Memory["Memory + Policy + Strategist"]
  Agent --> Tools["Tool Registry + Executor"]
```

Core loop:

```text
Perceive -> Filter Context -> Build Context -> Normalize State -> Plan -> Preview/Execute -> Reflect -> Learn -> Repeat
```

See `/Users/HP/outlook-bot/docs/ARCHITECTURE.md` for the full system walkthrough.

## Repository Structure

```text
/Users/HP/outlook-bot
├── backend
│   ├── db
│   │   ├── migrations
│   │   └── schema.sql
│   └── src
│       ├── agent
│       ├── ai
│       ├── memory
│       ├── observability
│       ├── planner
│       ├── routes
│       ├── services
│       ├── tools
│       └── workers
├── frontend
│   └── src
│       ├── components
│       ├── lib
│       └── pages
└── docs
    ├── API.md
    ├── ARCHITECTURE.md
    ├── OPS.md
    ├── SECURITY.md
    └── TESTING.md
```

## Frontend Pages

- `/` - Public landing page
- `/dashboard` - Product overview, KPI surfaces, top priority lists
- `/tasks` - Full task workspace with pagination and filters
- `/deadlines` - Due-date driven operational view
- `/opportunities` - Internship and event pipeline
- `/inbox` - Email intelligence inbox
- `/agent` - Activity feed, approvals, workflow visibility
- `/settings` - Goals, autopilot, personality, and preference controls
- `/auth/callback` - OAuth landing and session handoff

## Local Development

### Prerequisites

- Node.js 18+
- PostgreSQL 14+
- Redis 6+

### Start infrastructure

```bash
cd /Users/HP/outlook-bot
docker-compose up -d
```

### Database setup

Fresh database:

```bash
psql "postgres://postgres:postgres@localhost:5432/student_intel" -f /Users/HP/outlook-bot/backend/db/schema.sql
```

Existing database upgrade path:

```bash
psql "$DATABASE_URL" -f /Users/HP/outlook-bot/backend/db/migrations/002_agent_system.sql
psql "$DATABASE_URL" -f /Users/HP/outlook-bot/backend/db/migrations/003_autopilot_level.sql
psql "$DATABASE_URL" -f /Users/HP/outlook-bot/backend/db/migrations/004_agent_enhancements.sql
psql "$DATABASE_URL" -f /Users/HP/outlook-bot/backend/db/migrations/005_personality_mode.sql
psql "$DATABASE_URL" -f /Users/HP/outlook-bot/backend/db/migrations/006_google_integration.sql
psql "$DATABASE_URL" -f /Users/HP/outlook-bot/backend/db/migrations/007_productization_indexes.sql
psql "$DATABASE_URL" -f /Users/HP/outlook-bot/backend/db/migrations/008_autonomous_operator_hardening.sql
```

### Backend setup

```bash
cd /Users/HP/outlook-bot/backend
cp .env.example .env
npm install
```

Generate `TOKEN_ENC_KEY`:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Run API:

```bash
cd /Users/HP/outlook-bot/backend
npm run dev
```

Run worker:

```bash
cd /Users/HP/outlook-bot/backend
npm run worker
```

### Frontend setup

```bash
cd /Users/HP/outlook-bot/frontend
cp .env.example .env
npm install
npm run dev
```

Frontend default URL: `http://localhost:5173`

## Environment Variables

Backend:

- `DATABASE_URL`
- `REDIS_URL`
- `FRONTEND_URL`
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
- `CACHE_TTL_SECONDS`
- `SYNC_BATCH_SIZE`

Microsoft integration:

- `MS_CLIENT_ID`
- `MS_CLIENT_SECRET`
- `MS_TENANT_ID`
- `MS_REDIRECT_URI`
- `MS_SCOPES`
- `MS_WEBHOOK_NOTIFICATION_URL`

Google integration:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URI`
- `GOOGLE_SCOPES`

Current implementation note:

- the backend environment loader currently expects the Microsoft env block to be present at startup
- if you are validating Gmail first, make sure the Microsoft env values are still populated in `/Users/HP/outlook-bot/backend/.env`

AI provider keys:

- `OPENROUTER_API_KEY`
- `GROQ_API_KEY`
- `GEMINI_API_KEY`

Frontend:

- `VITE_API_BASE`

Use `/Users/HP/outlook-bot/backend/.env.example` and `/Users/HP/outlook-bot/frontend/.env.example` as templates.

## OAuth Setup

### Gmail

1. Create a Google Cloud project
2. Enable Gmail API
3. Enable Google Calendar API
4. Configure the OAuth consent screen
5. Create a Web OAuth client
6. Add redirect URI:

```text
http://localhost:4000/auth/google/callback
```

Recommended Google scopes:

- `openid`
- `email`
- `profile`
- `https://www.googleapis.com/auth/gmail.readonly`
- `https://www.googleapis.com/auth/gmail.modify`
- `https://www.googleapis.com/auth/gmail.send`
- `https://www.googleapis.com/auth/calendar`

### Outlook

1. Create an Azure App Registration
2. Add redirect URI:

```text
http://localhost:4000/auth/microsoft/callback
```

Recommended Microsoft Graph scopes:

- `offline_access`
- `User.Read`
- `Mail.Read`
- `Mail.ReadWrite`
- `Calendars.ReadWrite`

## Backend Surfaces

Main route groups:

- `/auth`
- `/emails`
- `/tasks`
- `/preferences`
- `/feedback`
- `/actions`
- `/agent`
- `/webhooks`

Full request and response examples live in `/Users/HP/outlook-bot/docs/API.md`.

## Security Posture

Implemented safeguards include:

- JWT issuer and audience verification
- HttpOnly cookie session support
- OAuth state cookies
- Encrypted provider tokens at rest
- Zod validation on public inputs
- Helmet and referrer policy
- Global plus route-specific rate limits
- Action preview and approval system
- Restricted high-risk tool execution
- Idempotent action persistence
- Recovery and rollback support
- `/.well-known/security.txt`

Details: `/Users/HP/outlook-bot/docs/SECURITY.md`

## Operations

Production operations guidance:

- `/Users/HP/outlook-bot/docs/OPS.md`

This covers:

- service layout
- migration order
- queue and worker scaling
- recommended monitoring
- deployment considerations
- incident response checks

## Testing

Deep validation guide:

- `/Users/HP/outlook-bot/docs/TESTING.md`

This is the document to use before launch or before onboarding real users. It covers:

- auth and session flows
- Gmail and Outlook sync
- extraction quality
- dashboard correctness
- agent preview and approvals
- autopilot safety
- rollback and recovery
- cost tracking
- memory optimization
- state-aware skip behavior
- performance and resilience testing

## Build Commands

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

## Recommended Release Checklist

1. Apply all migrations, including `/Users/HP/outlook-bot/backend/db/migrations/008_autonomous_operator_hardening.sql`
2. Configure real OAuth credentials
3. Verify Redis and Postgres connectivity
4. Run backend and frontend production builds
5. Execute the checklist in `/Users/HP/outlook-bot/docs/TESTING.md`
6. Review logs, cost metrics, and action preview behavior before enabling aggressive autopilot
