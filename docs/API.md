# API Reference

This document describes the current backend HTTP surface implemented in `/Users/HP/outlook-bot/backend/src/routes`.

Important implementation note:

- the backend does **not** use an `/api` prefix
- local base URL is typically `http://localhost:4000`
- the frontend talks to the backend with `credentials: 'include'`
- authenticated requests work through either:
  - the HttpOnly session cookie, or
  - `Authorization: Bearer <jwt>` as a compatibility fallback

## Route Registration

The backend mounts routes in `/Users/HP/outlook-bot/backend/src/app.ts` as follows:

- `/auth`
- `/emails`
- `/tasks`
- `/preferences`
- `/feedback`
- `/actions`
- `/agent`
- `/webhooks`

Additional public endpoints:

- `GET /health`
- `GET /.well-known/security.txt`

## Conventions

### Authentication

Protected endpoints use `authMiddleware` and require a valid authenticated user.

Unauthenticated protected requests generally return:

```json
{ "error": "Unauthorized" }
```

### Validation

Request validation is enforced through Zod schemas and the `validate` middleware.

Typical validation failures return HTTP `400` with a JSON error payload from the backend middleware layer.

### Pagination

List endpoints use `limit` and `offset`.

Current max page size on validated list routes is `200`.

Typical list response pattern:

```json
{
  "items": [],
  "total": 0,
  "limit": 50,
  "offset": 0
}
```

Actual route-specific keys vary by endpoint. For example:

- `/emails` returns `emails`
- `/tasks` returns `tasks`
- `/agent/actions` returns `actions`

### Error Shape

The backend commonly returns one of these shapes:

```json
{ "error": "Unauthorized" }
```

```json
{ "error": "Task not found" }
```

```json
{ "ok": true }
```

The frontend additionally wraps transport errors and timeouts into a normalized `ApiRequestError` in `/Users/HP/outlook-bot/frontend/src/lib/api.ts`.

## Public Endpoints

### `GET /health`

Purpose:

- basic liveness check

Response:

```json
{ "ok": true }
```

### `GET /.well-known/security.txt`

Purpose:

- publishes a simple security contact and policy location

Response type:

- plain text

## Authentication Endpoints

Implemented in `/Users/HP/outlook-bot/backend/src/routes/auth.ts`.

### `GET /auth/session`

Purpose:

- determine whether the current request is authenticated
- return user identity needed by the frontend session provider

Auth required:

- no

Response when authenticated:

```json
{
  "authenticated": true,
  "user": {
    "userId": "uuid",
    "email": "student@example.com"
  },
  "authMode": "cookie"
}
```

Response when not authenticated:

```json
{
  "authenticated": false
}
```

Notes:

- this is the authoritative session check used by `/Users/HP/outlook-bot/frontend/src/lib/appContext.tsx`
- `authMode` may be `cookie` or `bearer`

### `POST /auth/logout`

Purpose:

- clear the auth cookie

Auth required:

- no explicit middleware, but meaningful only when a session cookie exists

Response:

```json
{ "ok": true }
```

### `GET /auth/google`

Purpose:

- start Google OAuth

Behavior:

- creates an `oauth_state_google` cookie
- redirects the browser to Google OAuth

Auth required:

- no

### `GET /auth/google/callback`

Purpose:

- complete Google OAuth

Behavior:

- validates `oauth_state_google`
- exchanges code for Google tokens
- reads Google profile
- upserts the user and stores encrypted provider tokens
- issues the application auth cookie
- redirects the browser to frontend `/auth/callback`

Redirect query params:

- success: `status=connected&provider=google`
- failure: `status=error&provider=google`

### `GET /auth/microsoft`

Purpose:

- start Microsoft OAuth

Behavior:

- creates an `oauth_state` cookie
- redirects to Azure/Microsoft OAuth

### `GET /auth/microsoft/callback`

Purpose:

- complete Microsoft OAuth

Behavior:

- validates `oauth_state`
- exchanges code for Graph tokens
- reads profile
- upserts the user and stores encrypted provider tokens
- optionally creates a Graph webhook subscription when `MS_WEBHOOK_NOTIFICATION_URL` is configured
- issues the application auth cookie
- redirects to frontend `/auth/callback`

Redirect query params:

- success: `status=connected&provider=microsoft`
- failure: `status=error&provider=microsoft`

### `GET /auth/verify`

Purpose:

- authenticated verification/debug endpoint

Auth required:

- yes

Response:

```json
{
  "ok": true,
  "user": {
    "userId": "uuid",
    "email": "student@example.com"
  },
  "authMode": "cookie"
}
```

## Email Endpoints

Implemented in `/Users/HP/outlook-bot/backend/src/routes/emails.ts`.

### `POST /emails/sync`

Purpose:

- queue an inbox sync job for the current user

Auth required:

- yes

Behavior:

- adds a `sync-user` job to the `email-ingestion` queue
- BullMQ retry policy: `attempts: 3`, exponential backoff, `delay: 2000`

Response:

```json
{ "status": "queued" }
```

### `GET /emails`

Purpose:

- return a paginated email list for the authenticated user

Auth required:

- yes

Query parameters:

- `limit`: integer, default `50`, min `1`, max `200`
- `offset`: integer, default `0`
- `status`: optional email processing status
- `classification`: optional email classification filter
- `query`: optional sender/subject search, max length `200`

Sort order:

- `received_at DESC NULLS LAST`

Response shape:

```json
{
  "emails": [
    {
      "id": "uuid",
      "message_id": "provider-message-id",
      "subject": "Internship application reminder",
      "sender_email": "recruiter@company.com",
      "sender_name": "Hiring Team",
      "received_at": "2026-03-24T07:30:00.000Z",
      "classification": "internship",
      "ai_score": 0.92,
      "status": "processed"
    }
  ],
  "total": 240,
  "limit": 50,
  "offset": 0
}
```

Common values:

- `classification`: `assignment`, `internship`, `event`, `academic`, `personal`, `spam`, `other`
- `status`: typically `pending` or `processed`

## Task Endpoints

Implemented in `/Users/HP/outlook-bot/backend/src/routes/tasks.ts`.

### `GET /tasks`

Purpose:

- return paginated extracted tasks for the current user

Auth required:

- yes

Query parameters:

- `limit`: integer, default `50`, min `1`, max `200`
- `offset`: integer, default `0`
- `status`: optional task status
- `category`: optional category or comma-separated categories
- `query`: optional text search across title/description
- `sort`: one of `priority`, `due`, `created`
- `minPriority`: optional numeric threshold
- `maxPriority`: optional numeric threshold
- `dueOnly`: optional boolean
- `dueFrom`: optional ISO-like date string
- `dueTo`: optional ISO-like date string

Sort semantics:

- `priority`: `priority_score DESC, due_at ASC NULLS LAST`
- `due`: `due_at ASC NULLS LAST, priority_score DESC`
- `created`: `created_at DESC`

Response shape:

```json
{
  "tasks": [
    {
      "id": "uuid",
      "email_id": "uuid",
      "message_id": "provider-message-id",
      "title": "Submit operating systems assignment",
      "description": "Complete and upload the assignment.",
      "due_at": "2026-03-24T18:00:00.000Z",
      "link": "https://portal.example.edu",
      "category": "assignment",
      "priority_score": 3.7,
      "status": "open",
      "created_at": "2026-03-22T08:00:00.000Z"
    }
  ],
  "total": 120,
  "limit": 50,
  "offset": 0
}
```

Task status values:

- `open`
- `snoozed`
- `completed`

### `GET /tasks/dashboard`

Purpose:

- return dashboard sections plus additive automation summary fields

Auth required:

- yes

Behavior:

- serves from cache when available
- cache key is `dashboard:<userId>`
- cache is invalidated on task status patch operations

Response shape:

```json
{
  "criticalToday": [],
  "upcomingDeadlines": [],
  "opportunities": [],
  "lowPriority": [],
  "groupedActions": [],
  "workflowSummaries": [],
  "impact": {
    "savedTimeMinutes": 0,
    "automationsCompleted": 0,
    "approvalsPending": 0
  }
}
```

Sections:

- `criticalToday`
- `upcomingDeadlines`
- `opportunities`
- `lowPriority`

The additive fields come from `/Users/HP/outlook-bot/backend/src/agent/magicOutput.ts`.

### `PATCH /tasks/:id`

Purpose:

- update an extracted task status

Auth required:

- yes

Body:

```json
{
  "status": "completed"
}
```

Allowed values:

- `open`
- `snoozed`
- `completed`

Response:

```json
{ "ok": true }
```

Side effect:

- invalidates dashboard cache for the current user

## Preferences Endpoints

Implemented in `/Users/HP/outlook-bot/backend/src/routes/preferences.ts`.

### `GET /preferences`

Purpose:

- read user preference weights

Auth required:

- yes

Response:

```json
{
  "weights": {
    "assignment": 1.5,
    "internship": 2,
    "event": 1
  }
}
```

### `PUT /preferences`

Purpose:

- update user preference weights

Auth required:

- yes

Body:

```json
{
  "weights": {
    "assignment": 1.5,
    "internship": 2,
    "event": 1
  }
}
```

Validation:

- values must be numeric
- each value must be between `0` and `10`

Response:

```json
{ "ok": true }
```

## Feedback Endpoints

Implemented in `/Users/HP/outlook-bot/backend/src/routes/feedback.ts`.

### `POST /feedback`

Purpose:

- record lightweight user behavior feedback tied to an email and/or category

Auth required:

- yes

Body:

```json
{
  "emailId": "uuid",
  "action": "thumbs_up",
  "category": "assignment",
  "metadata": {
    "surface": "dashboard"
  }
}
```

Fields:

- `emailId`: optional UUID
- `action`: required string, max length `50`
- `category`: optional string, max length `50`
- `metadata`: optional object

Response:

```json
{ "ok": true }
```

## Direct User Action Endpoints

Implemented in `/Users/HP/outlook-bot/backend/src/routes/actions.ts`.

These endpoints execute tools directly outside the autonomous planner, usually from explicit user clicks in the UI.

### `POST /actions/calendar`

Purpose:

- create a calendar event from a task

Auth required:

- yes

Body:

```json
{
  "taskId": "uuid"
}
```

Behavior:

- resolves the task to its source email and message context
- executes tool `create_calendar_event`

Possible errors:

- `401 Unauthorized`
- `404 Task not found`

### `POST /actions/important`

Purpose:

- mark an email as important

Auth required:

- yes

Body:

```json
{
  "emailId": "provider-message-id"
}
```

Behavior:

- resolves the message context in the `emails` table
- executes tool `mark_important`

Possible errors:

- `401 Unauthorized`
- `404 Email not found`

### `POST /actions/reply`

Purpose:

- draft a reply and optionally send it

Auth required:

- yes

Body:

```json
{
  "emailId": "provider-message-id",
  "send": false
}
```

Behavior:

- always executes tool `draft_reply`
- if `send === true` and a draft ID is available, also executes `send_reply`

Response shape:

```json
{
  "draftId": "provider-draft-id",
  "subject": "Re: Internship conversation",
  "body": "Thanks for reaching out...",
  "sent": false
}
```

Important note:

- the autonomous system keeps `send_reply` approval-gated
- this direct endpoint can still send when explicitly instructed with `send: true`
- treat this endpoint carefully in production UI and testing

### `POST /actions/snooze`

Purpose:

- snooze a task

Auth required:

- yes

Body:

```json
{
  "taskId": "uuid",
  "until": "2026-03-25T09:00:00.000Z"
}
```

Behavior:

- resolves task and message context
- executes tool `snooze`

## Agent Endpoints

Implemented in `/Users/HP/outlook-bot/backend/src/routes/agent.ts`.

## `GET /agent/goals`

Purpose:

- return the current user’s goals, autopilot level, and personality mode

Auth required:

- yes

Response:

```json
{
  "goals": [
    { "goal": "get internship", "weight": 2 },
    { "goal": "focus on academics", "weight": 3 }
  ],
  "autopilotLevel": 1,
  "personalityMode": "proactive"
}
```

## `PUT /agent/goals`

Purpose:

- update goals and agent posture

Auth required:

- yes

Body:

```json
{
  "goals": [
    { "goal": "get internship", "weight": 2 }
  ],
  "autopilotLevel": 1,
  "personalityMode": "proactive"
}
```

Validation:

- goal text max `200`
- weight between `0` and `10`
- autopilot allowed values: `0`, `1`, `2`
- personality allowed values: `chill`, `proactive`, `aggressive`

Response:

```json
{ "ok": true }
```

## `POST /agent/feedback`

Purpose:

- record higher-fidelity agent feedback tied to a specific agent action

Auth required:

- yes

Body:

```json
{
  "actionId": "uuid",
  "status": "approve",
  "notes": "This was exactly right",
  "metadata": {
    "surface": "agent_page"
  }
}
```

Accepted status aliases:

- `accepted`
- `approved`
- `approve`
- `rejected`
- `reject`
- `modified`
- `always_allow`
- `cancel`
- `cancelled`

Response:

```json
{ "ok": true }
```

## `GET /agent/activity-feed`

Purpose:

- return the latest activity feed plus additive workflow/impact summary fields

Auth required:

- yes

Response shape:

```json
{
  "feed": {
    "summary_date": "2026-03-24",
    "summary": {
      "actions_taken": ["Created task", "Drafted reply"],
      "improvements": ["Confidence improved for recruiter emails"],
      "insights": ["Assignment emails peaked in the morning"]
    }
  },
  "groupedActions": [],
  "workflowSummaries": [],
  "impact": {
    "savedTimeMinutes": 10,
    "automationsCompleted": 4,
    "approvalsPending": 1
  }
}
```

## `GET /agent/actions`

Purpose:

- return paginated agent action history

Auth required:

- yes

Query parameters:

- `limit`: integer, default `50`, max `200`
- `offset`: integer, default `0`
- `status`: optional status filter

Response shape:

```json
{
  "actions": [
    {
      "id": "uuid",
      "action_type": "draft_reply",
      "status": "preview",
      "workflow_name": "Recruiter Follow-up",
      "workflow_id": "abc123",
      "action_payload": {},
      "confidence": 0.81,
      "decision_reason": "Recruiter email with clear scheduling intent",
      "requires_approval": true,
      "created_at": "2026-03-24T09:00:00.000Z",
      "email_id": "uuid",
      "subject": "Screening Call",
      "sender_name": "Recruiter",
      "sender_email": "recruiter@example.com"
    }
  ],
  "total": 20,
  "limit": 50,
  "offset": 0,
  "groupedActions": [],
  "workflowSummaries": [],
  "impact": {
    "savedTimeMinutes": 4,
    "automationsCompleted": 1,
    "approvalsPending": 2
  }
}
```

Common status values currently seen in code and UI:

- `preview`
- `suggest`
- `suggested`
- `modified`
- `executed`
- `approved`
- `failed`
- `cancelled`
- `undone`
- `discarded`

## `GET /agent/intent`

Purpose:

- inspect active intent/session override state

Auth required:

- yes

Query parameter:

- `sessionId` optional

Response:

- whatever is returned by `/Users/HP/outlook-bot/backend/src/agent/intent.ts`
- typically includes short-term intents, session overrides, and priority boosts

## `POST /agent/intent`

Purpose:

- update short-term intent state

Auth required:

- yes

Body:

```json
{
  "intents": ["focus on recruiting today"],
  "sessionOverrides": ["deprioritize newsletters"],
  "priorityBoosts": { "internship": 2 },
  "sessionId": "browser-tab-1",
  "ttlHours": 24
}
```

Validation:

- intent strings max `200`
- session ID max `120`
- `ttlHours` between `1` and `168`

## Preview And Approval Endpoints

### `POST /agent/preview/approve`

Purpose:

- approve and execute a single preview action

Body:

```json
{
  "actionId": "uuid",
  "payloadOverride": {
    "until": "2026-03-25T09:00:00.000Z"
  }
}
```

Response:

```json
{
  "ok": true,
  "result": {}
}
```

### `POST /agent/preview/modify`

Purpose:

- modify a pending preview action payload before execution

Body:

```json
{
  "actionId": "uuid",
  "payloadOverride": {
    "label": "important"
  }
}
```

Validation note:

- `payloadOverride` is required on this route

Response:

```json
{
  "ok": true,
  "actionId": "uuid",
  "status": "modified"
}
```

### `POST /agent/preview/approve-all`

Purpose:

- approve all preview actions for a workflow bundle

Body:

```json
{
  "workflowId": "abc123"
}
```

Response:

```json
{
  "ok": true,
  "results": []
}
```

### `POST /agent/preview/cancel`

Purpose:

- cancel a pending preview action

Body:

```json
{
  "actionId": "uuid",
  "reason": "user_cancelled"
}
```

Response:

```json
{
  "ok": true,
  "result": {}
}
```

## Recovery Endpoints

### `POST /agent/recovery/undo`

Purpose:

- undo a reversible executed action

Body:

```json
{
  "actionId": "uuid"
}
```

Response:

```json
{
  "ok": true,
  "result": {}
}
```

### `POST /agent/recovery/rollback`

Purpose:

- rollback a workflow when supported by underlying tools

Body:

```json
{
  "workflowId": "abc123"
}
```

Response:

```json
{
  "ok": true,
  "result": {}
}
```

## Webhook Endpoints

Implemented in `/Users/HP/outlook-bot/backend/src/routes/webhooks.ts`.

### `POST /webhooks/graph`

Purpose:

- handle Microsoft Graph mailbox webhook events

Modes:

1. Graph validation handshake
2. actual notification processing

Validation handshake behavior:

- if `validationToken` query param exists, backend returns the token as plain text

Notification behavior:

- reads `subscriptionId` and optional `clientState`
- matches against `graph_subscriptions`
- enqueues `sync-user` jobs for matching users

Response after notification processing:

```json
{ "ok": true }
```

## Tool Names Used Across APIs And Agent Payloads

Current tool registry names:

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

## Route-to-Frontend Mapping

These frontend files depend on the API surface described above:

- `/Users/HP/outlook-bot/frontend/src/lib/api.ts`
- `/Users/HP/outlook-bot/frontend/src/lib/appContext.tsx`
- `/Users/HP/outlook-bot/frontend/src/pages/AuthCallback.tsx`
- `/Users/HP/outlook-bot/frontend/src/pages/Dashboard.tsx`
- `/Users/HP/outlook-bot/frontend/src/pages/Inbox.tsx`
- `/Users/HP/outlook-bot/frontend/src/pages/Tasks.tsx`
- `/Users/HP/outlook-bot/frontend/src/pages/Agent.tsx`
- `/Users/HP/outlook-bot/frontend/src/pages/Settings.tsx`

## API Smoke Test Checklist

Before calling the API “healthy,” verify:

1. `GET /health` returns `{ "ok": true }`
2. `GET /auth/session` returns `authenticated: false` for logged-out requests
3. OAuth connects and `GET /auth/session` returns the user
4. `POST /emails/sync` returns `{ "status": "queued" }`
5. `GET /emails` returns rows after worker ingestion
6. `GET /tasks/dashboard` returns section arrays
7. `GET /agent/actions` returns rows after planner execution
8. preview approval routes work for a queued preview action
9. recovery routes work only on supported reversible actions

For full validation, use `/Users/HP/outlook-bot/docs/TESTING.md`.
