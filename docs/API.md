# API Reference

All endpoints are JSON over HTTPS. Protected endpoints require `Authorization: Bearer <jwt>`.

## Auth

### GET /auth/google
Starts Google OAuth.

### GET /auth/google/callback
OAuth callback. Redirects to `/auth/callback#token=...`.

### GET /auth/microsoft
Starts Microsoft OAuth.

### GET /auth/microsoft/callback
OAuth callback. Redirects to `/auth/callback#token=...`.

## Emails

### POST /emails/sync
Queue an inbox sync.

Response:

```json
{ "status": "queued" }
```

### GET /emails
Paginated list.

Query params:
- `limit` (1-200)
- `offset`
- `status` (e.g. `pending`, `processed`)
- `classification` (assignment, internship, event, academic, personal, spam, other)
- `query` (sender/subject search)

Response:

```json
{
  "emails": [
    {
      "id": "...",
      "message_id": "...",
      "subject": "...",
      "sender_email": "...",
      "sender_name": "...",
      "received_at": "...",
      "classification": "...",
      "ai_score": 0.82,
      "status": "pending"
    }
  ],
  "total": 240,
  "limit": 50,
  "offset": 0
}
```

## Tasks

### GET /tasks
Paginated list.

Query params:
- `limit`, `offset`
- `status` (`open`, `snoozed`, `completed`)
- `category` (single or comma-separated)
- `query` (title/description search)
- `sort` (`priority`, `due`, `created`)
- `minPriority`, `maxPriority`
- `dueOnly` (`true`/`false`)
- `dueFrom`, `dueTo` (ISO timestamps)

Response:

```json
{
  "tasks": [
    {
      "id": "...",
      "email_id": "...",
      "message_id": "...",
      "title": "...",
      "description": "...",
      "due_at": "...",
      "category": "assignment",
      "priority_score": 3.5,
      "status": "open",
      "created_at": "..."
    }
  ],
  "total": 120,
  "limit": 50,
  "offset": 0
}
```

### GET /tasks/dashboard
Returns the dashboard sections.

Response:

```json
{
  "criticalToday": [],
  "upcomingDeadlines": [],
  "opportunities": [],
  "lowPriority": []
}
```

### PATCH /tasks/:id
Update task status.

Body:

```json
{ "status": "completed" }
```

## Actions

### POST /actions/calendar
Body:

```json
{ "taskId": "..." }
```

### POST /actions/important
Body:

```json
{ "emailId": "..." }
```

### POST /actions/reply
Body:

```json
{ "emailId": "...", "send": false }
```

### POST /actions/snooze
Body:

```json
{ "taskId": "...", "until": "2026-03-21T09:00:00Z" }
```

## Preferences & Feedback

### GET /preferences
Returns priority weights.

### PUT /preferences
Body:

```json
{ "weights": { "assignment": 1.4, "internship": 1.8 } }
```

### POST /feedback
Body:

```json
{ "emailId": "...", "action": "thumbs_up", "category": "academic" }
```

## Agent

### GET /agent/actions
Paginated list of agent actions.

Query params:
- `limit`, `offset`
- `status` (preview, suggested, executed, etc.)

Response:

```json
{
  "actions": [
    {
      "id": "...",
      "action_type": "create_task",
      "status": "preview",
      "workflow_name": "Daily Plan",
      "action_payload": { "__preview": { "summary": "..." } }
    }
  ],
  "total": 32,
  "limit": 50,
  "offset": 0
}
```

### GET /agent/activity-feed
Daily agent summary feed.

### GET /agent/goals
Returns user goals + autopilot.

### PUT /agent/goals
Body:

```json
{
  "goals": [{ "goal": "get internship", "weight": 2 }],
  "autopilotLevel": 1,
  "personalityMode": "proactive"
}
```

### POST /agent/preview/approve
Body:

```json
{ "actionId": "...", "payloadOverride": {} }
```

### POST /agent/preview/modify
Body:

```json
{ "actionId": "...", "payloadOverride": { "title": "New title" } }
```

### POST /agent/preview/cancel
Body:

```json
{ "actionId": "...", "reason": "user_cancelled" }
```

### POST /agent/recovery/undo
Body:

```json
{ "actionId": "..." }
```

### POST /agent/recovery/rollback
Body:

```json
{ "workflowId": "..." }
```
