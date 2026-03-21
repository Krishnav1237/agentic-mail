# Student Intelligence Layer (Outlook + Gmail)

A production-ready, goal-driven inbox intelligence layer for students. It connects to Gmail and Microsoft Outlook, ingests email at scale, extracts tasks/deadlines/opportunities, and runs an autonomous agent loop (plan -> act -> reflect) with safety controls and human approvals.

## What This Gives You

- Gmail + Outlook ingestion with OAuth2
- Agentic planning and execution (plan, act, reflect, memory)
- Task + deadline extraction and scoring
- Approvals queue and action previews
- Autopilot levels with safety guardrails
- Multi-page dashboard UI built for large data

## Quick Start (Gmail First)

### 1) Prerequisites

- Node.js 18+
- PostgreSQL 14+
- Redis 6+

### 2) Start Postgres + Redis

```bash
cd /Users/HP/outlook-bot
docker-compose up -d
```

### 3) Apply Database Schema

For a fresh DB:

```bash
psql "postgres://postgres:postgres@localhost:5432/student_intel" -f /Users/HP/outlook-bot/backend/db/schema.sql
```

For upgrades, apply migrations in order:

```bash
psql "$DATABASE_URL" -f /Users/HP/outlook-bot/backend/db/migrations/002_agent_system.sql
psql "$DATABASE_URL" -f /Users/HP/outlook-bot/backend/db/migrations/003_autopilot_level.sql
psql "$DATABASE_URL" -f /Users/HP/outlook-bot/backend/db/migrations/004_agent_enhancements.sql
psql "$DATABASE_URL" -f /Users/HP/outlook-bot/backend/db/migrations/005_personality_mode.sql
psql "$DATABASE_URL" -f /Users/HP/outlook-bot/backend/db/migrations/006_google_integration.sql
psql "$DATABASE_URL" -f /Users/HP/outlook-bot/backend/db/migrations/007_productization_indexes.sql
```

### 4) Configure Backend Env

```bash
cd /Users/HP/outlook-bot/backend
cp .env.example .env
```

Fill in `.env` using your credentials (see sample file). Generate `TOKEN_ENC_KEY`:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

### 5) Run Backend + Workers

```bash
cd /Users/HP/outlook-bot/backend
npm install
npm run dev
```

In a second terminal:

```bash
cd /Users/HP/outlook-bot/backend
npm run worker
```

### 6) Run Frontend

```bash
cd /Users/HP/outlook-bot/frontend
cp .env.example .env
npm install
npm run dev
```

Open `http://localhost:5173`.

---

## OAuth Setup (Gmail + Outlook)

### Gmail (recommended first)

1. Create a Google Cloud project
2. Enable **Gmail API** and **Google Calendar API**
3. Configure OAuth consent screen
4. Create OAuth Client (Web)
5. Add redirect URI:

```
http://localhost:4000/auth/google/callback
```

### Outlook (optional)

1. Create Azure App Registration
2. Add redirect URI:

```
http://localhost:4000/auth/microsoft/callback
```

3. Grant Graph scopes in `MS_SCOPES`

---

## Frontend Pages (Multi-Page UX)

- `/dashboard` - KPI overview + top items
- `/tasks` - Paginated task list with filters
- `/deadlines` - Due-date focused view
- `/opportunities` - Internships and events
- `/inbox` - Email list with classification
- `/agent` - Activity feed + approvals
- `/settings` - Goals, autopilot, personality, weights

The shell has a persistent left nav + status/sync bar. All large lists are server-paginated.

---

## API Overview

**Auth**
- `GET /auth/google`
- `GET /auth/google/callback`
- `GET /auth/microsoft`
- `GET /auth/microsoft/callback`
- `GET /auth/session`
- `POST /auth/logout`

**Email & Tasks**
- `POST /emails/sync`
- `GET /emails?limit&offset&status&classification&query`
- `GET /tasks?limit&offset&status&category&query&sort&minPriority&maxPriority&dueOnly&dueFrom&dueTo`
- `GET /tasks/dashboard`
- `PATCH /tasks/:id`

**Actions**
- `POST /actions/calendar`
- `POST /actions/important`
- `POST /actions/reply`
- `POST /actions/snooze`

**Agent**
- `GET /agent/goals`
- `PUT /agent/goals`
- `GET /agent/actions?limit&offset&status`
- `GET /agent/activity-feed`
- `POST /agent/feedback`
- `POST /agent/intent`
- `POST /agent/preview/approve`
- `POST /agent/preview/modify`
- `POST /agent/preview/cancel`
- `POST /agent/recovery/undo`
- `POST /agent/recovery/rollback`

Full details in `docs/API.md`.

---

## Architecture (Short)

- **Ingestion**: Gmail/Graph OAuth -> sync -> `emails` table
- **AI Engine**: classify + extract -> tasks -> priority scoring
- **Agent Loop**: perception -> plan -> action -> reflection -> memory
- **Workers**: BullMQ + Redis for async processing
- **UI**: Multi-page React + Vite dashboard

See `docs/ARCHITECTURE.md` for diagrams.

---

## Security & Trust

- JWT issuer + audience verification
- HttpOnly session cookie support with secure OAuth callbacks
- OAuth tokens encrypted at rest
- Strict input validation (Zod)
- Rate limiting (global + auth + webhooks)
- Helmet headers + no-referrer
- `/.well-known/security.txt`

See `docs/SECURITY.md` for full details.

---

## Environment Variables

Backend (`backend/.env`):

- `DATABASE_URL`
- `REDIS_URL`
- `AUTH_JWT_SECRET`
- `AUTH_JWT_ISSUER`
- `AUTH_JWT_AUDIENCE`
- `AUTH_COOKIE_NAME`
- `TOKEN_ENC_KEY` (32 bytes base64)
- `MS_CLIENT_ID`
- `MS_CLIENT_SECRET`
- `MS_REDIRECT_URI`
- `MS_SCOPES`
- `MS_WEBHOOK_NOTIFICATION_URL`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URI`
- `GOOGLE_SCOPES`
- `AI_PROVIDER` (`openrouter`, `groq`, `gemini`)
- `AI_MODEL`
- `OPENROUTER_API_KEY` / `GROQ_API_KEY` / `GEMINI_API_KEY`

Frontend (`frontend/.env`):

- `VITE_API_BASE`

---

## Autopilot Levels

- `0`: Suggest only
- `1`: Auto-execute safe actions (tasks, calendar)
- `2`: Auto-execute all safe actions (restricted tools still require approval)

---

## Helpful Docs

- `docs/ARCHITECTURE.md`
- `docs/API.md`
- `docs/SECURITY.md`
- `docs/OPS.md`
