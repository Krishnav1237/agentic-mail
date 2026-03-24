# API Reference

All endpoints are JSON over HTTPS. Protected endpoints require either:

- an HttpOnly session cookie, or
- `Authorization: Bearer <jwt>`

Base URL examples:

- local backend: `http://localhost:4000`
- frontend dev app: `http://localhost:5173`

## Conventions

### Pagination

List endpoints use:

- `limit`
- `offset`

Typical response shape:

```json
{
  "items": [],
  "total": 0,
  "limit": 50,
  "offset": 0
}
```

### Common status values

Agent action statuses commonly seen:

- `preview`
- `modified`
- `executed`
- `failed`
- `cancelled`
- `undone`

Task statuses:

- `open`
- `snoozed`
- `completed`

### Magic-moment fields

Dashboard and agent responses may include additive fields:

- `groupedActions`
- `workflowSummaries`
- `impact`

Example:

```json
{
  "impact": {
    "savedTimeMinutes": 12.5,
    "automationsCompleted": 6,
    "approvalsPending": 2
  }
}
```

## Auth

### `GET /auth/google`

Starts Google OAuth.

### `GET /auth/google/callback`

OAuth callback endpoint used by Google.

Behavior:

- validates state cookie
- exchanges code for tokens
- stores provider tokens
- creates session cookie
- redirects to frontend callback

### `GET /auth/microsoft`

Starts Microsoft OAuth.

### `GET /auth/microsoft/callback`

OAuth callback endpoint used by Microsoft Graph.

### `GET /auth/session`

Returns session state.

Example response:

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

### `POST /auth/logout`

Clears the auth cookie.

Response:

```json
{ "ok": true }
```

### `GET /auth/verify`

Protected verification endpoint.

## Emails

### `POST /emails/sync`

Queues an inbox sync job.

Response:

```json
{ "status": "queued" }
```

### `GET /emails`

Returns paginated inbox records.

Query parameters:

- `limit` - integer, 1 to 200
- `offset` - integer, 0+
- `status` - optional email processing status
- `classification` - optional classification filter
- `query` - sender/subject search

Example response:

```json
{
  "emails": [
    {
      "id": "uuid",
      "message_id": "provider-message-id",
      "subject": "Internship application reminder",
      "sender_email": "recruiter@company.com",
      "sender_name": "Hiring Team",
      "received_at": "2026-03-22T07:30:00.000Z",
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

## Tasks

### `GET /tasks`

Returns paginated tasks.

Query parameters:

- `limit`
- `offset`
- `status`
- `category`
- `query`
- `sort` - `priority`, `due`, `created`
- `minPriority`
- `maxPriority`
- `dueOnly`
- `dueFrom`
- `dueTo`

Example response:

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

### `GET /tasks/dashboard`

Returns dashboard task sections plus workflow visibility.

Example response:

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

### `PATCH /tasks/:id`

Updates a task status.

Body:

```json
{
  "status": "completed"
}
```

Response:

```json
{ "ok": true }
```

## Preferences

### `GET /preferences`

Returns user-defined weights.

Example response:

```json
{
  "weights": {
    "assignment": 1.5,
    "internship": 1.8
  }
}
```

### `PUT /preferences`

Updates weights.

Body:

```json
{
  "weights": {
    "assignment": 1.4,
    "internship": 1.8
  }
}
```

Response:

```json
{ "ok": true }
```

## Legacy Feedback

### `POST /feedback`

Stores lightweight user feedback not tied to a planner preview action.

Body:

```json
{
  "emailId": "uuid",
  "action": "thumbs_up",
  "category": "academic",
  "metadata": {
    "source": "dashboard"
  }
}
```

## Direct Actions

These are user-triggered shortcut operations that bypass the autonomous planner and invoke tools directly.

### `POST /actions/calendar`

Body:

```json
{
  "taskId": "uuid"
}
```

### `POST /actions/important`

Body:

```json
{
  "emailId": "provider-message-id"
}
```

### `POST /actions/reply`

Body:

```json
{
  "emailId": "provider-message-id",
  "send": false
}
```

### `POST /actions/snooze`

Body:

```json
{
  "taskId": "uuid",
  "until": "2026-03-25T09:00:00.000Z"
}
```

## Agent

### `GET /agent/goals`

Returns goals and autopilot settings.

### `PUT /agent/goals`

Body:

```json
{
  "goals": [
    { "goal": "focus on academics", "weight": 2 },
    { "goal": "get internship", "weight": 3 }
  ],
  "autopilotLevel": 1,
  "personalityMode": "proactive"
}
```

### `GET /agent/intent`

Reads active short-term intent state.

Optional query parameter:

- `sessionId`

### `POST /agent/intent`

Updates short-term intent state.

Body:

```json
{
  "intents": ["finish assignments this week"],
  "sessionOverrides": ["ignore club outreach today"],
  "priorityBoosts": {
    "academic": 1.2
  },
  "sessionId": "study-session-1",
  "ttlHours": 24
}
```

### `GET /agent/actions`

Returns paginated agent actions plus grouped workflow output.

Query parameters:

- `limit`
- `offset`
- `status`

Example response:

```json
{
  "actions": [
    {
      "id": "uuid",
      "action_type": "create_task",
      "status": "preview",
      "workflow_name": "Scheduling Triage",
      "workflow_id": "a1b2c3",
      "action_payload": {
        "__preview": {
          "summary": "Create task: Respond to scheduling request"
        }
      }
    }
  ],
  "total": 32,
  "limit": 50,
  "offset": 0,
  "groupedActions": [],
  "workflowSummaries": [],
  "impact": {
    "savedTimeMinutes": 4.5,
    "automationsCompleted": 3,
    "approvalsPending": 2
  }
}
```

### `GET /agent/activity-feed`

Returns the latest daily activity feed plus grouped workflow output.

### `POST /agent/feedback`

Records feedback for a specific agent action.

Canonical statuses:

- `approve`
- `reject`
- `always_allow`
- `modified`
- `cancel`

Accepted aliases are also supported for compatibility.

Body:

```json
{
  "actionId": "uuid",
  "status": "always_allow",
  "notes": "This kind of archive is always fine",
  "metadata": {
    "source": "agent_page"
  }
}
```

### `POST /agent/preview/approve`

Approves a single preview action.

Body:

```json
{
  "actionId": "uuid",
  "payloadOverride": {}
}
```

### `POST /agent/preview/modify`

Modifies a preview action before approval.

Body:

```json
{
  "actionId": "uuid",
  "payloadOverride": {
    "title": "Reworded task title"
  }
}
```

### `POST /agent/preview/cancel`

Cancels a pending preview.

Body:

```json
{
  "actionId": "uuid",
  "reason": "user_cancelled"
}
```

### `POST /agent/preview/approve-all`

Approves every pending action in a workflow.

Body:

```json
{
  "workflowId": "a1b2c3"
}
```

### `POST /agent/recovery/undo`

Attempts to undo one executed action.

Body:

```json
{
  "actionId": "uuid"
}
```

### `POST /agent/recovery/rollback`

Attempts to rollback an entire workflow in reverse execution order.

Body:

```json
{
  "workflowId": "a1b2c3"
}
```

## Webhooks

### `POST /webhooks/graph`

Receives Microsoft Graph change notifications.

Behavior:

- validates subscription mapping
- queues mailbox sync for the affected user

## Health and Security

### `GET /health`

Health endpoint.

Response:

```json
{ "ok": true }
```

### `GET /.well-known/security.txt`

Serves security disclosure metadata.

