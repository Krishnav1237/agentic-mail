# Code Map

This document is the “what lives where” map for the current repository.

Use it when you need to answer questions like:

- where does OAuth happen?
- where is inbox sync queued?
- where does the agent loop start?
- which file renders a specific page?
- where are previews, rollbacks, and action logs handled?

## Top-Level Repository Map

```text
/Users/HP/outlook-bot
├── README.md
├── DEPLOYMENT.md
├── docker-compose.yml
├── backend/
├── frontend/
└── docs/
```

## Frontend Map

Frontend root:

- `/Users/HP/outlook-bot/frontend`

Entrypoints:

- `/Users/HP/outlook-bot/frontend/src/main.tsx`
- `/Users/HP/outlook-bot/frontend/src/App.tsx`

### Frontend Entrypoints

#### `/Users/HP/outlook-bot/frontend/src/main.tsx`

Responsibility:

- bootstraps React
- chooses `BrowserRouter` vs `HashRouter`
- wraps the app in `AppProvider`
- wraps the app in a basic `ErrorBoundary`
- loads global CSS

#### `/Users/HP/outlook-bot/frontend/src/App.tsx`

Responsibility:

- defines all routes
- protects internal routes with `ProtectedRoute`
- keeps `/` and `/auth/callback` public

Current route map:

- `/`
- `/auth/callback`
- `/dashboard`
- `/tasks`
- `/deadlines`
- `/opportunities`
- `/inbox`
- `/agent`
- `/settings`

### Frontend Library Layer

#### `/Users/HP/outlook-bot/frontend/src/lib/api.ts`

Responsibility:

- central HTTP client for the frontend
- timeout handling
- retry-once behavior for GET requests
- normalized API transport errors
- typed wrappers for backend endpoints
- debug logging for API calls

Key exports:

- `getSession`
- `logout`
- `getDashboard`
- `getTasks`
- `getEmails`
- `getAgentActions`
- `getActivityFeed`
- `getGoals`
- `updateGoals`
- `getPreferences`
- `updatePreferences`
- `approveAction`
- `modifyAction`
- `cancelAction`
- `syncInbox`
- `recordFeedback`
- `addToCalendar`
- `markImportant`
- `generateReply`
- `snoozeTask`

#### `/Users/HP/outlook-bot/frontend/src/lib/appContext.tsx`

Responsibility:

- session bootstrap from `/auth/session`
- cookie-based auth state for the frontend
- sync status and sync helpers
- sign-out handling
- status message coordination across pages

Key state managed here:

- `isAuthenticated`
- `loading`
- `userEmail`
- `authMode`
- `status`
- `syncing`
- `lastSyncedAt`

#### `/Users/HP/outlook-bot/frontend/src/lib/presentation.ts`

Responsibility:

- shared presentation helpers for category/status/priority labels
- date formatting helpers
- autopilot and personality labels

#### `/Users/HP/outlook-bot/frontend/src/lib/supabase.ts`

Responsibility:

- initializes the Supabase client for the waitlist
- validates required frontend Supabase env vars

### Frontend Pages

#### `/Users/HP/outlook-bot/frontend/src/pages/Landing.tsx`

Responsibility:

- public landing page
- waitlist form submission to Supabase `waitlist` table
- hidden keyboard-triggered admin access path
- visual brand anchor of the product

#### `/Users/HP/outlook-bot/frontend/src/pages/AuthCallback.tsx`

Responsibility:

- reads callback query params / hash params
- stores bearer token only if present
- calls `refreshSession()` from the app context
- redirects to `/dashboard` on success or `/` on failure

#### `/Users/HP/outlook-bot/frontend/src/pages/Dashboard.tsx`

Responsibility:

- reads `/tasks/dashboard`
- renders top-level operational summary sections
- exposes direct task actions
- shows sync-driven empty and processing states

#### `/Users/HP/outlook-bot/frontend/src/pages/Tasks.tsx`

Responsibility:

- paginated task workspace
- task filters and sorting
- row-level task actions

#### `/Users/HP/outlook-bot/frontend/src/pages/Deadlines.tsx`

Responsibility:

- task view grouped around due dates
- due-date-driven operational triage

#### `/Users/HP/outlook-bot/frontend/src/pages/Opportunities.tsx`

Responsibility:

- internship and event task slice
- opportunity-focused search and action surface

#### `/Users/HP/outlook-bot/frontend/src/pages/Inbox.tsx`

Responsibility:

- paginated email list
- classification filter
- direct message actions (`markImportant`, `generateReply`)
- worker visibility when sync is still processing

#### `/Users/HP/outlook-bot/frontend/src/pages/Agent.tsx`

Responsibility:

- daily activity feed view
- approvals queue
- action history and traceability
- approval/cancel action controls

#### `/Users/HP/outlook-bot/frontend/src/pages/Settings.tsx`

Responsibility:

- read/write goals
- read/write preferences
- autopilot level and personality mode controls

### Frontend Components

#### `/Users/HP/outlook-bot/frontend/src/components/AppShell.tsx`

Responsibility:

- main authenticated layout shell
- left navigation
- top session / sync / trust context
- renders routed page content via `<Outlet />`

#### `/Users/HP/outlook-bot/frontend/src/components/PageHeader.tsx`

Responsibility:

- shared header block used across internal pages
- eyebrow, title, description, actions, stats, and aside slot

#### `/Users/HP/outlook-bot/frontend/src/components/ConnectPrompt.tsx`

Responsibility:

- shared “connect Gmail / Outlook” surface for unauthenticated internal pages

#### `/Users/HP/outlook-bot/frontend/src/components/TaskRow.tsx`

Responsibility:

- compact task row with expandable actions

#### `/Users/HP/outlook-bot/frontend/src/components/EmailRow.tsx`

Responsibility:

- compact email row with action buttons

#### `/Users/HP/outlook-bot/frontend/src/components/TaskCard.tsx`

Responsibility:

- card representation of a task used by section-based dashboard views

#### `/Users/HP/outlook-bot/frontend/src/components/Section.tsx`

Responsibility:

- dashboard section wrapper that renders a title, subtitle, count, and task cards

#### `/Users/HP/outlook-bot/frontend/src/components/Pagination.tsx`

Responsibility:

- shared limit/offset pagination control

#### `/Users/HP/outlook-bot/frontend/src/components/EmptyState.tsx`

Responsibility:

- shared empty-state display component

### Frontend Styling

#### `/Users/HP/outlook-bot/frontend/src/index.css`

Responsibility:

- global styles
- shared Tailwind component classes
- dark translucent design system used by internal pages

## Backend Map

Backend root:

- `/Users/HP/outlook-bot/backend`

Entrypoints:

- `/Users/HP/outlook-bot/backend/src/server.ts`
- `/Users/HP/outlook-bot/backend/src/app.ts`
- `/Users/HP/outlook-bot/backend/src/workers/index.ts`

### Backend Entrypoints

#### `/Users/HP/outlook-bot/backend/src/server.ts`

Responsibility:

- pings the database
- creates the Express app
- starts the HTTP server

#### `/Users/HP/outlook-bot/backend/src/app.ts`

Responsibility:

- creates the Express app
- configures middleware:
  - Helmet
  - CORS
  - JSON body parsing
  - cookie parser
  - pino-http logging
  - rate limiting
- mounts all route groups
- installs the global error handler

#### `/Users/HP/outlook-bot/backend/src/workers/index.ts`

Responsibility:

- starts BullMQ workers
- schedules repeating `sync-all` and `run-all` jobs

### Backend Config Layer

#### `/Users/HP/outlook-bot/backend/src/config/env.ts`

Responsibility:

- loads env vars through `dotenv`
- enforces required env keys
- exposes normalized runtime config

Important note:

- Microsoft OAuth env vars are still required at startup in the current implementation

#### `/Users/HP/outlook-bot/backend/src/config/db.ts`

Responsibility:

- DB connectivity helpers used during boot

#### `/Users/HP/outlook-bot/backend/src/config/redis.ts`

Responsibility:

- shared BullMQ/Redis connection config

#### `/Users/HP/outlook-bot/backend/src/config/logger.ts`

Responsibility:

- shared pino logger configuration

### Backend Route Layer

#### `/Users/HP/outlook-bot/backend/src/routes/auth.ts`

Responsibility:

- session lookup
- logout
- Google OAuth start/callback
- Microsoft OAuth start/callback
- `/auth/verify`

#### `/Users/HP/outlook-bot/backend/src/routes/emails.ts`

Responsibility:

- queue inbox sync
- list paginated email rows

#### `/Users/HP/outlook-bot/backend/src/routes/tasks.ts`

Responsibility:

- list paginated tasks
- return dashboard sections
- patch task status

#### `/Users/HP/outlook-bot/backend/src/routes/preferences.ts`

Responsibility:

- get/update user category weights

#### `/Users/HP/outlook-bot/backend/src/routes/feedback.ts`

Responsibility:

- record lightweight user feedback

#### `/Users/HP/outlook-bot/backend/src/routes/actions.ts`

Responsibility:

- direct user-triggered tool execution endpoints
- create calendar event
- mark important
- draft/send reply
- snooze task

#### `/Users/HP/outlook-bot/backend/src/routes/agent.ts`

Responsibility:

- goals
- agent feedback
- activity feed
- action list
- intent state
- preview approval / modify / cancel / approve-all
- undo / rollback

#### `/Users/HP/outlook-bot/backend/src/routes/webhooks.ts`

Responsibility:

- Microsoft Graph webhook validation and notification processing

### Middleware

#### `/Users/HP/outlook-bot/backend/src/middleware/auth.ts`

Responsibility:

- auth cookie / bearer parsing
- auth middleware
- auth request typing

#### `/Users/HP/outlook-bot/backend/src/middleware/validate.ts`

Responsibility:

- Zod validation wrapper for request bodies and query params

### Database Access Layer

#### `/Users/HP/outlook-bot/backend/src/db/index.ts`

Responsibility:

- query helpers
- transactional helper(s)

### Services Layer

#### `/Users/HP/outlook-bot/backend/src/services/ingestion.ts`

Responsibility:

- provider-specific inbox ingestion orchestration
- fetch from Gmail or Graph
- insert normalized `emails` rows
- queue the agent loop when new mail is processed

#### `/Users/HP/outlook-bot/backend/src/services/gmail.ts`

Responsibility:

- Google OAuth helpers
- Gmail message reads
- Gmail mailbox and calendar actions

#### `/Users/HP/outlook-bot/backend/src/services/graph.ts`

Responsibility:

- Microsoft OAuth helpers
- Graph mailbox reads
- Graph calendar access
- Graph subscription creation

#### `/Users/HP/outlook-bot/backend/src/services/tokens.ts`

Responsibility:

- resolve the current provider access context for a user

#### `/Users/HP/outlook-bot/backend/src/services/users.ts`

Responsibility:

- upsert user records from Google and Microsoft profiles
- manage stored encrypted token fields

#### `/Users/HP/outlook-bot/backend/src/services/tasks.ts`

Responsibility:

- task list query construction
- dashboard task section queries

#### `/Users/HP/outlook-bot/backend/src/services/preferences.ts`

Responsibility:

- get/update user preference weights

#### `/Users/HP/outlook-bot/backend/src/services/feedback.ts`

Responsibility:

- persist lightweight user feedback in `user_behavior_logs`

#### `/Users/HP/outlook-bot/backend/src/services/agentFeedback.ts`

Responsibility:

- higher-level feedback persistence for agent action learning and policy

#### `/Users/HP/outlook-bot/backend/src/services/ai.ts`

Responsibility:

- AI orchestration used by extraction, planning, preview drafting, and related features

#### `/Users/HP/outlook-bot/backend/src/services/cache.ts`

Responsibility:

- cache helpers backed by Redis

#### `/Users/HP/outlook-bot/backend/src/services/priority.ts`

Responsibility:

- priority-related calculations and scoring utilities

### Queue Layer

#### `/Users/HP/outlook-bot/backend/src/queues/index.ts`

Responsibility:

- create BullMQ queues used by ingestion and agent processing

Current queues:

- email ingestion queue
- agent core queue

### Worker Layer

#### `/Users/HP/outlook-bot/backend/src/workers/ingestionWorker.ts`

Responsibility:

- process `sync-all` and `sync-user` jobs
- enqueue per-user syncs for all users on periodic runs

#### `/Users/HP/outlook-bot/backend/src/workers/aiProcessor.ts`

Responsibility:

- process `run-all` and user-specific agent-core jobs
- run `runCoreLoop(userId)`

### Agent Layer

The live autonomous runtime is centered on `/Users/HP/outlook-bot/backend/src/agent/coreLoop.ts`.

#### `/Users/HP/outlook-bot/backend/src/agent/coreLoop.ts`

Responsibility:

- collect perception inputs
- load goals, strategist output, intent state, and energy context
- filter planning context
- build context
- compute decision-state hash
- skip planning when state is unchanged
- run fast planner first
- optionally run heavy planner
- persist plans
- execute or preview plan steps
- reflect on outcomes
- optimize memory
- generate activity feed
- update stored state hash

#### `/Users/HP/outlook-bot/backend/src/agent/contextFilter.ts`

Responsibility:

- reduce noisy inbox/task/calendar context before planning

#### `/Users/HP/outlook-bot/backend/src/agent/contextBuilder.ts`

Responsibility:

- combine filtered perception with memory and summary context

#### `/Users/HP/outlook-bot/backend/src/agent/stateManager.ts`

Responsibility:

- normalize decision state
- compute state hash
- store and retrieve state hash in Redis

#### `/Users/HP/outlook-bot/backend/src/agent/fastPlanner.ts`

Responsibility:

- run deterministic planning rules quickly

#### `/Users/HP/outlook-bot/backend/src/agent/heavyPlanner.ts`

Responsibility:

- run LLM-backed planning when needed

#### `/Users/HP/outlook-bot/backend/src/agent/planMerge.ts`

Responsibility:

- merge plan sources
- dedupe actions
- generate execution keys
- preserve workflow order

#### `/Users/HP/outlook-bot/backend/src/agent/planner.ts`

Responsibility:

- persist plans
- track plan timing and plan status

#### `/Users/HP/outlook-bot/backend/src/agent/executor.ts`

Responsibility:

- evaluate tool confidence and policy
- preview or execute plan steps
- create agent action records
- preserve workflow ordering
- write decision traces
- record workflow metrics

#### `/Users/HP/outlook-bot/backend/src/agent/preview.ts`

Responsibility:

- create action previews
- create workflow previews
- approve/modify/cancel previews
- approve all preview actions in a workflow

#### `/Users/HP/outlook-bot/backend/src/agent/recovery.ts`

Responsibility:

- undo single reversible actions
- rollback workflows
- risky outcome detection hooks

#### `/Users/HP/outlook-bot/backend/src/agent/reflection.ts`

Responsibility:

- evaluate execution outcomes after the executor finishes

#### `/Users/HP/outlook-bot/backend/src/agent/strategist.ts`

Responsibility:

- periodic higher-level adjustment of focus, aggressiveness, and priority weighting

#### `/Users/HP/outlook-bot/backend/src/agent/intent.ts`

Responsibility:

- short-term intent state
- session overrides
- category priority boosts

#### `/Users/HP/outlook-bot/backend/src/agent/energy.ts`

Responsibility:

- derive energy-aware planning hints

#### `/Users/HP/outlook-bot/backend/src/agent/goals.ts`

Responsibility:

- read/update user goals, autopilot level, and personality mode

#### `/Users/HP/outlook-bot/backend/src/agent/confidence.ts`

Responsibility:

- compute confidence adjustment factors from history and context

#### `/Users/HP/outlook-bot/backend/src/agent/policy.ts`

Responsibility:

- evaluate persistent policy allowances such as `always_allow`

#### `/Users/HP/outlook-bot/backend/src/agent/actionStore.ts`

Responsibility:

- create/update `agent_actions` records

#### `/Users/HP/outlook-bot/backend/src/agent/decisionTrace.ts`

Responsibility:

- persist input/reasoning/decision/action/result traces

#### `/Users/HP/outlook-bot/backend/src/agent/logs.ts`

Responsibility:

- structured agent log writing

#### `/Users/HP/outlook-bot/backend/src/agent/activityFeed.ts`

Responsibility:

- generate and read daily activity feed summaries

#### `/Users/HP/outlook-bot/backend/src/agent/magicOutput.ts`

Responsibility:

- compute grouped workflow/impact summaries for frontend-facing responses

#### `/Users/HP/outlook-bot/backend/src/agent/loop.ts`

Responsibility:

- older per-email loop still present in the repo

Status note:

- the primary live runtime is `coreLoop.ts`
- `loop.ts` exists historically and should be treated carefully before removal or reuse

### Planner Rule Modules

#### `/Users/HP/outlook-bot/backend/src/planner/rules/recruiterRules.ts`

Responsibility:

- deterministic recruiter workflow planning rules

#### `/Users/HP/outlook-bot/backend/src/planner/rules/schedulingRules.ts`

Responsibility:

- deterministic scheduling-related plan rules

#### `/Users/HP/outlook-bot/backend/src/planner/rules/cleanupRules.ts`

Responsibility:

- deterministic cleanup and low-risk mailbox organization rules

### AI Layer

#### `/Users/HP/outlook-bot/backend/src/ai/llmProviders.ts`

Responsibility:

- provider-specific LLM calling support

#### `/Users/HP/outlook-bot/backend/src/ai/prompts.ts`

Responsibility:

- prompt templates used across classification, extraction, planning, and related AI operations

#### `/Users/HP/outlook-bot/backend/src/ai/schemas.ts`

Responsibility:

- structured schema contracts for AI outputs and plans

### Memory Layer

#### `/Users/HP/outlook-bot/backend/src/memory/episodic.ts`

Responsibility:

- episodic memory reads/writes

#### `/Users/HP/outlook-bot/backend/src/memory/summary.ts`

Responsibility:

- summary construction for memory-aware context

#### `/Users/HP/outlook-bot/backend/src/memory/store.ts`

Responsibility:

- generic `memory_store` read/write helpers

#### `/Users/HP/outlook-bot/backend/src/memory/optimizer.ts`

Responsibility:

- summarize stale memory
- decay stale patterns
- preserve active patterns and policy state

### Observability Layer

#### `/Users/HP/outlook-bot/backend/src/observability/costTracker.ts`

Responsibility:

- log per-request LLM usage
- update per-user daily cost aggregates
- update per-workflow aggregates

### Tool Layer

#### `/Users/HP/outlook-bot/backend/src/tools/types.ts`

Responsibility:

- shared tool contract types
- `ToolName`, risk levels, context shape, tool definition structure

#### `/Users/HP/outlook-bot/backend/src/tools/registry.ts`

Responsibility:

- central tool registry
- runtime tool lookup and execution

Current tools:

- `create_task`
- `create_calendar_event`
- `draft_reply`
- `send_reply`
- `snooze`
- `mark_important`
- `archive_email`
- `delete_email`
- `move_to_folder`
- `label_email`

Provider-aware tool implementations:

- `/Users/HP/outlook-bot/backend/src/tools/archiveEmail.ts`
- `/Users/HP/outlook-bot/backend/src/tools/createCalendarEvent.ts`
- `/Users/HP/outlook-bot/backend/src/tools/createTask.ts`
- `/Users/HP/outlook-bot/backend/src/tools/deleteEmail.ts`
- `/Users/HP/outlook-bot/backend/src/tools/draftReply.ts`
- `/Users/HP/outlook-bot/backend/src/tools/labelEmail.ts`
- `/Users/HP/outlook-bot/backend/src/tools/markImportant.ts`
- `/Users/HP/outlook-bot/backend/src/tools/moveToFolder.ts`
- `/Users/HP/outlook-bot/backend/src/tools/sendReply.ts`
- `/Users/HP/outlook-bot/backend/src/tools/snooze.ts`
- `/Users/HP/outlook-bot/backend/src/tools/providerConfig.ts`

### Utilities

#### `/Users/HP/outlook-bot/backend/src/utils/crypto.ts`

Responsibility:

- encryption helpers used for token storage

#### `/Users/HP/outlook-bot/backend/src/utils/http.ts`

Responsibility:

- HTTP utility helpers shared in the backend

## Database Artifacts

Schema file:

- `/Users/HP/outlook-bot/backend/db/schema.sql`

Migrations currently present:

- `/Users/HP/outlook-bot/backend/db/migrations/002_agent_system.sql`
- `/Users/HP/outlook-bot/backend/db/migrations/003_autopilot_level.sql`
- `/Users/HP/outlook-bot/backend/db/migrations/004_agent_enhancements.sql`
- `/Users/HP/outlook-bot/backend/db/migrations/005_personality_mode.sql`
- `/Users/HP/outlook-bot/backend/db/migrations/006_google_integration.sql`
- `/Users/HP/outlook-bot/backend/db/migrations/007_productization_indexes.sql`
- `/Users/HP/outlook-bot/backend/db/migrations/008_autonomous_operator_hardening.sql`

For the full schema walkthrough, use `/Users/HP/outlook-bot/docs/DATABASE.md`.

## Reading Order By Use Case

### “I need to understand auth”

1. `/Users/HP/outlook-bot/frontend/src/pages/Landing.tsx`
2. `/Users/HP/outlook-bot/frontend/src/pages/AuthCallback.tsx`
3. `/Users/HP/outlook-bot/frontend/src/lib/appContext.tsx`
4. `/Users/HP/outlook-bot/backend/src/routes/auth.ts`
5. `/Users/HP/outlook-bot/backend/src/middleware/auth.ts`

### “I need to understand inbox sync”

1. `/Users/HP/outlook-bot/frontend/src/pages/Inbox.tsx`
2. `/Users/HP/outlook-bot/frontend/src/lib/api.ts`
3. `/Users/HP/outlook-bot/backend/src/routes/emails.ts`
4. `/Users/HP/outlook-bot/backend/src/workers/ingestionWorker.ts`
5. `/Users/HP/outlook-bot/backend/src/services/ingestion.ts`

### “I need to understand the agent loop”

1. `/Users/HP/outlook-bot/backend/src/agent/coreLoop.ts`
2. `/Users/HP/outlook-bot/backend/src/agent/contextFilter.ts`
3. `/Users/HP/outlook-bot/backend/src/agent/stateManager.ts`
4. `/Users/HP/outlook-bot/backend/src/agent/fastPlanner.ts`
5. `/Users/HP/outlook-bot/backend/src/agent/heavyPlanner.ts`
6. `/Users/HP/outlook-bot/backend/src/agent/planMerge.ts`
7. `/Users/HP/outlook-bot/backend/src/agent/executor.ts`
8. `/Users/HP/outlook-bot/backend/src/agent/preview.ts`
9. `/Users/HP/outlook-bot/backend/src/agent/reflection.ts`
10. `/Users/HP/outlook-bot/backend/src/memory/optimizer.ts`

### “I need to understand user-facing pages”

1. `/Users/HP/outlook-bot/frontend/src/App.tsx`
2. `/Users/HP/outlook-bot/frontend/src/components/AppShell.tsx`
3. each file in `/Users/HP/outlook-bot/frontend/src/pages`

## Summary

If you only remember one thing from this doc, it should be this:

- the frontend is a session-aware multi-page shell
- the backend is a route-driven product API plus workers
- the real autonomous runtime begins in `coreLoop.ts`
- the system’s durable truth lives in PostgreSQL
- Redis supports queues, cache, and state-aware optimization
