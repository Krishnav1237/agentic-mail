# Testing Guide

This document is the deep validation matrix for Student Intelligence Layer.

Use it before:

- onboarding real users
- enabling higher autopilot levels
- changing OAuth/provider configuration
- changing planner, executor, preview, or tool behavior
- releasing any production deployment

This document is intentionally broader than a unit-test checklist. The current product is a full-stack SaaS with async workers, provider integrations, and an autonomous agent loop. That means release confidence must come from a mix of:

- build validation
- manual end-to-end testing
- database inspection
- queue inspection
- safety verification
- security testing
- scale and failure drills

## 1. Current Testing Reality

Important honest note:

- the repository currently does **not** contain a comprehensive automated test suite wired into package scripts
- production confidence therefore depends heavily on a disciplined manual validation process
- this guide is the practical release gate until automated coverage is expanded

## 2. Core Test Environments

At minimum, maintain these environments:

### Local development

Use for:

- UI iteration
- route/auth sanity checks
- API contract verification
- basic provider smoke tests

### Staging

Use for:

- real OAuth credentials
- realistic mailbox volume
- queue behavior
- migration rehearsal
- preview and rollback validation

### Production-like verification

Use for:

- cost and latency checks under realistic load
- scaling exercises
- deployment rollback rehearsal
- backup/restore drills

## 3. Mailbox Personas To Test

The product should be tested against at least these data shapes:

### Academic-heavy inbox

Expected content:

- assignment emails
- professor announcements
- syllabus updates
- deadline reminders
- lab or club meeting notices

### Recruiter-heavy inbox

Expected content:

- internship outreach
- interview requests
- scheduling threads
- recruiter follow-ups
- networking conversations

### Noisy inbox

Expected content:

- newsletters
- promotions
- campus digests
- spam-like but technically valid mail
- low-signal event announcements

Why this matters:

- the planner and context filter behave very differently depending on inbox mix
- many bugs only show up when signal and noise are blended together

## 4. Release Gate Order

Validate in this order:

1. environment and startup
2. auth and session
3. provider connectivity
4. sync and ingestion
5. extraction and task creation
6. frontend UI states
7. autonomous agent loop
8. preview and approval flows
9. tool execution and recovery
10. cost, logs, and observability
11. security and abuse cases
12. scale and failure drills

## 5. Environment and Startup Tests

### Backend startup

Validate:

- process boots with full env
- process fails loudly on missing required env
- `/health` returns `200`

Check specifically:

- `DATABASE_URL`
- `REDIS_URL`
- `AUTH_JWT_SECRET`
- `TOKEN_ENC_KEY`
- Microsoft env vars currently required by backend boot

### Worker startup

Validate:

- worker boots cleanly
- repeat jobs are scheduled
- no Redis or BullMQ startup errors

### Frontend startup

Validate:

- Vite app boots
- landing renders
- internal routes load when authenticated
- Supabase env is present so the landing page does not crash at import time

### Build validation

Run and validate:

```bash
cd /Users/HP/outlook-bot/backend && npm run build
cd /Users/HP/outlook-bot/frontend && npm run build
```

Expected result:

- no compile errors
- no missing import/runtime startup surprises

## 6. Authentication and Session Testing

## 6.1 Gmail OAuth

Test:

- connect a brand-new Gmail user
- reconnect an existing Gmail user
- reject consent mid-flow
- refresh the page after login
- logout and confirm session clears

Verify:

- `users.google_user_id` is set
- encrypted Google token fields exist
- `/auth/session` returns `authenticated: true`
- protected routes load only after session resolves

## 6.2 Microsoft OAuth

Test:

- connect a brand-new Outlook user
- reconnect an existing Outlook user
- refresh after login
- logout and reconnect

Verify:

- `users.ms_user_id` is set
- encrypted Microsoft token fields exist
- Graph subscription record is created when webhook URL is configured

## 6.3 Session persistence

Test:

- reload `/dashboard`
- reload `/inbox`
- open a new tab on a protected route
- expire the auth cookie manually and reload

Expected result:

- valid session persists across refresh
- expired session redirects to `/`
- internal shell never flashes for unauthenticated state

## 6.4 Auth edge cases

Test:

- invalid OAuth state
- callback without code
- invalid JWT issuer or audience
- stale bearer token in storage
- protected route access without auth

Expected result:

- graceful failure
- no shell leakage
- no false “logged in” state

## 7. Provider Connectivity Tests

## 7.1 Gmail capabilities

Validate:

- inbox read works
- label operations work
- archive works
- draft creation works
- send-reply guarded flow works
- calendar event creation works if scope granted

## 7.2 Outlook capabilities

Validate:

- inbox read works
- mark important works
- draft flow works
- send-reply guarded flow works
- calendar event creation works
- webhook callback path works if configured

## 7.3 Token refresh and longevity

Test:

- long-lived sessions
- revoked provider token
- invalid refresh token
- provider quota exhaustion or rate limiting

Expected result:

- failures are visible in logs
- sync/jobs fail gracefully
- the rest of the product remains stable

## 8. Inbox Sync and Ingestion Tests

## 8.1 Manual sync

Trigger:

- `POST /emails/sync`
- frontend sync button from authenticated pages

Verify:

- response is quick and returns queued status
- sync job appears in BullMQ
- new emails land in `emails`
- `users.last_sync_at` updates

## 8.2 Duplicate handling

Test:

- run sync repeatedly against the same mailbox state
- run multiple sync triggers close together

Verify:

- `emails` unique `(user_id, message_id)` prevents duplicates
- task generation does not explode from repeated syncs

## 8.3 Worker restart resilience

Test:

- restart worker during or immediately after a sync burst

Verify:

- queue recovers
- ingestion resumes
- no silent job loss that leaves the UI permanently stale

## 8.4 Sync visibility in UI

Check frontend behavior when:

- sync has started but no emails have rendered yet
- there are no emails and no errors
- sync fails

Expected result:

- user sees a meaningful loading or “processing” state
- not a blank, broken-looking screen

## 9. Email Intelligence and Extraction Tests

## 9.1 Classification accuracy

Validate these classes specifically:

- assignment
- internship
- event
- academic
- personal
- spam
- other

## 9.2 Extraction quality

For each scenario, check JSON shape and user-visible outcomes:

- deadline extraction
- task extraction
- multiple tasks from one email
- link extraction
- entity extraction
- recruiter/company signal extraction
- event scheduling signal extraction

## 9.3 Robustness cases

Test:

- forwarded threads
- reply chains
- vague professor deadline phrasing
- newsletters with false urgency language
- recruiter emails with no explicit deadline
- conflicting date expressions

Expected result:

- invalid model outputs are retried or rejected safely
- malformed extraction does not crash the pipeline
- junk tasks are minimized

## 10. Task System and Dashboard Tests

## 10.1 Task creation

Verify:

- source email links correctly to task
- category is set appropriately
- priority score is populated
- due date is correct when present
- open tasks appear in dashboard and tasks page

## 10.2 Task updates

Test:

- mark completed
- snooze
- filter by category/status
- high offset pagination
- search with partial phrases

Verify:

- dashboard cache invalidates correctly
- UI updates reflect server truth
- counts stay accurate under pagination

## 10.3 Dashboard summary integrity

Validate:

- `criticalToday`
- `upcomingDeadlines`
- `opportunities`
- `lowPriority`
- additive workflow metadata from backend:
  - `groupedActions`
  - `workflowSummaries`
  - `impact`

Expected result:

- dashboard reflects real workload and recent automation value

## 11. Inbox UI Tests

## 11.1 List behavior

Test:

- pagination
- search
- classification filters
- very long sender names
- very long subjects
- empty mailbox state

## 11.2 Direct actions

Test from the inbox page:

- mark important
- draft reply
- sync now

Verify:

- success/failure states are understandable
- no silent UI failure on timeouts or backend errors

## 11.3 Loading and empty states

Expected text patterns should exist for:

- loading
- syncing / processing
- no data yet
- error state

The page should never look blank or broken while the worker is simply behind.

## 12. Agent Loop Tests

## 12.1 Core loop execution

Validate the full runtime path:

1. perceive new state
2. load goals
3. run strategist
4. load intent
5. load energy context
6. filter context
7. hash state
8. skip or plan
9. merge and dedupe actions
10. preview or execute
11. reflect and write memory
12. update activity feed

## 12.2 State-aware skip behavior

Test:

- run the loop repeatedly with no semantic change
- change only non-semantic timestamps or IDs
- then change an actually meaningful task/email/goal field

Expected result:

- unchanged semantic state skips heavy planning
- meaningful state changes trigger planning

## 12.3 Fast planner versus heavy planner

Test:

- obvious deterministic cases
- ambiguous complex inbox cases
- low latency budget conditions

Expected result:

- fast planner handles obvious cases
- heavy planner only runs when needed
- latency budget fallback prevents long loop stalls

## 12.4 Dedupe and workflow consistency

Test:

- duplicate candidate actions from merged plans
- retries after partial workflow failure
- replan after an execution error

Expected result:

- highest-confidence duplicate survives
- workflow order remains stable
- already executed steps are not duplicated

## 13. Preview, Approval, and Recovery Tests

## 13.1 Preview lifecycle

Test:

- preview creation for guarded actions
- approve one action
- modify one action
- cancel one action
- approve a workflow bundle via `approve-all`

Expected result:

- action status changes are correct
- approved actions execute once
- modified actions preserve override payload
- cancelled actions do not execute

## 13.2 Undo and rollback

Test:

- undo a reversible single action
- rollback a workflow with multiple executed steps
- attempt undo on a non-reversible action

Expected result:

- reversible tools revert cleanly when supported
- non-reversible actions fail safely and visibly

## 13.3 Human alignment tests

Validate:

- `delete_email` never auto-executes
- `send_reply` requires approval
- `always_allow` only affects appropriate tool/workflow behavior

## 14. Feedback, Policy, and Memory Tests

## 14.1 Feedback outcomes

Test:

- approve
- reject
- modify
- always_allow
- cancel

Verify:

- policy state updates persist where appropriate
- confidence adjustments happen over time
- action history remains traceable

## 14.2 Memory optimizer safeguards

Test with seeded historical data:

- active memory entries
- stale low-value entries
- policy entries
- recently used patterns

Expected result:

- active and recently used items remain intact
- `always_allow` policy survives optimization
- stale entries are summarized/decayed appropriately

## 15. Cost and Observability Tests

## 15.1 AI usage tracking

Verify in `llm_usage_events`:

- provider
- model
- operation
- tokens
- latency
- estimated cost
- workflow key

## 15.2 Aggregates

Verify in `llm_cost_daily_aggregates`:

- total requests
- prompt tokens
- completion tokens
- total cost
- actions created
- successful actions
- cost per action
- cost per successful action
- cost per workflow

## 15.3 Activity feed and logs

Verify:

- `agent_activity_feed` updates
- `agent_logs` capture errors and key lifecycle events
- dashboard and agent pages surface grouped workflow value

## 16. Frontend Stability Tests

Validate across all authenticated pages:

- route loads without console errors
- loading state is clear
- empty state is clear
- processing state is clear
- transient API failures surface useful messages
- refresh does not lose session unexpectedly

Pages to test explicitly:

- `/dashboard`
- `/tasks`
- `/deadlines`
- `/opportunities`
- `/inbox`
- `/agent`
- `/settings`

Also test:

- `/`
- `/auth/callback`

## 17. Security and Abuse Tests

### Auth and session

- protected route access without cookie
- stale bearer token fallback
- logout behavior
- invalid JWT issuer/audience

### OAuth

- invalid state
- reused callback URL
- provider denial flow

### Write endpoints

- invalid payloads on `/actions`, `/agent/preview/*`, `/preferences`, `/feedback`, `/agent/intent`, `/agent/goals`
- ownership enforcement on action IDs and workflow IDs

### Tool misuse

- invalid folder names
- invalid label names
- forged email/message targets
- repeated preview approval calls

### Webhooks

- invalid `clientState`
- unknown subscription IDs
- excessive webhook request bursts

## 18. Performance and Scale Tests

## 18.1 List scale

Test with:

- thousands of emails
- thousands of tasks
- many recent agent actions

Verify:

- paginated endpoints remain responsive
- filters return correct totals
- frontend paging remains stable

## 18.2 Worker load

Test with:

- many users queued for sync
- many users queued for agent runs
- repeated provider latency spikes

Verify:

- queues drain predictably
- no catastrophic planner duplication
- timeouts are visible and recoverable

## 18.3 Cost under load

Verify:

- heavy planner invocation rate stays reasonable
- state skip rate remains meaningful
- cost per action does not spike unexpectedly

## 19. Deployment and Migration Testing

Before a production rollout:

1. apply migrations to staging
2. run full auth + sync + dashboard smoke tests
3. validate previews and recovery
4. validate provider actions for enabled providers
5. confirm frontend and backend builds
6. confirm worker starts on new code
7. confirm rollback path exists for deploy and schema

## 20. Recommended Manual Smoke Test Script

This is the fastest practical end-to-end release check:

1. load `/`
2. submit the waitlist form
3. authenticate with Gmail or Microsoft
4. land on `/dashboard`
5. trigger `Sync Now`
6. confirm inbox rows appear
7. confirm at least one task is created or visible
8. open `/agent` and inspect action history
9. approve a previewable action if one exists
10. verify action result in provider system
11. refresh the app and confirm session persists
12. logout and confirm internal routes are blocked

## 21. Release Sign-Off Checklist

Ship only when all of these are true:

- builds pass
- env is correct
- OAuth works for enabled providers
- sync works
- dashboard and inbox are populated
- preview approval works
- guarded actions remain guarded
- undo/rollback behave as expected
- cost tracking records real activity
- no critical console or backend errors remain

## 22. Known Gaps To Keep In Mind

These are not reasons to panic, but they are reasons to stay disciplined:

- there is no full automated test suite yet
- much of release safety currently depends on manual validation
- provider behavior differs and must be tested separately
- the system is asynchronous, so UI timing issues can easily look like logic bugs if you do not inspect workers and DB state together
