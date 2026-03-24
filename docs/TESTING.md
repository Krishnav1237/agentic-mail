# Testing Guide

This is the production validation checklist for Student Intelligence Layer. Use it before onboarding real users, before enabling higher autopilot levels, and before every major release.

## How To Use This Document

Test in this order:

1. Core infrastructure and auth
2. Provider integrations
3. Product workflows
4. Agent autonomy and safety
5. Recovery and rollback
6. Security and abuse cases
7. Performance, scale, and cost

Run tests in both:

- Gmail-connected accounts
- Outlook-connected accounts

Where provider behavior differs, test both explicitly.

## Test Environments

Use at least three environments:

- local development
- staging with real provider credentials
- production-like environment with realistic data volume

Use at least three mailbox personas:

- heavy academic inbox
- internship and recruiter-heavy inbox
- noisy promotional inbox

## 1. Infrastructure and Startup

### What to test

- backend boots with valid env
- worker boots with valid env
- frontend boots and talks to backend
- Postgres connection succeeds
- Redis connection succeeds
- migrations apply cleanly in order
- production builds succeed

### Expected result

- no boot-time crashes
- no missing env surprises
- worker connects to BullMQ and Redis cleanly
- dashboard loads without API errors

## 2. Authentication and Session Flows

### Gmail OAuth

Test:

- connect Gmail account
- reject consent flow
- reconnect existing Gmail user
- token refresh path
- session survives page refresh
- logout clears session

Verify:

- user record updated correctly
- tokens stored and encrypted
- `/auth/session` reflects login state
- landing page and dashboard redirect correctly

### Outlook OAuth

Test:

- connect Outlook account
- reconnect existing Outlook user
- Graph subscription creation if webhook URL is configured
- logout and reconnect

Verify:

- Graph subscription is persisted
- session cookie is set
- redirect lands on `/auth/callback`

### Auth edge cases

Test:

- invalid OAuth state
- expired cookie
- expired bearer token
- issuer/audience mismatch
- unauthenticated access to protected routes

Expected result:

- graceful failure
- no silent partial login state
- no protected data leakage

## 3. Inbox Sync and Ingestion

### What to test

- `POST /emails/sync` queues work
- worker ingests recent emails
- duplicate syncs do not create duplicate emails
- noisy inboxes still process
- large inbox batches respect limits
- provider API failures trigger retries

### Verify in depth

- `emails` table contents
- sender metadata correctness
- thread IDs are stored consistently
- status transitions from pending to processed
- sync latency under repeated runs

### Failure scenarios

- provider rate limiting
- revoked provider token
- bad message payload from provider
- worker restart mid-sync

Expected result:

- retries happen
- failures are logged
- no permanent duplicate spam in the database

## 4. Email Intelligence and Extraction

### Classification

Test these classes thoroughly:

- assignment
- internship
- event
- academic
- personal
- spam
- other

### Extraction

Verify:

- deadlines extracted accurately
- tasks extracted accurately
- links preserved
- relevant entities captured
- malformed or low-signal emails do not generate junk tasks

### Prompt robustness cases

Test:

- forwarded emails
- reply chains
- newsletters
- professor emails with vague dates
- recruiter outreach with scheduling intent
- emails with no deadline but clear action
- emails with multiple tasks

### Expected result

- structured JSON remains valid
- retries happen on invalid model outputs
- extraction errors do not crash ingestion

## 5. Task System and Dashboard Integrity

### Task generation

Test:

- one email creates one task
- one email creates multiple tasks
- due dates map correctly
- priority scores are populated
- category is correct

### Task actions

Test:

- mark task completed
- snooze task
- create calendar event from task
- direct task updates reflect immediately in UI

### Dashboard

Verify:

- `criticalToday` is correct
- `upcomingDeadlines` is correct
- `opportunities` is correct
- `lowPriority` is correct
- `groupedActions`, `workflowSummaries`, and `impact` are populated sensibly

### Pagination and filters

Test:

- large task counts
- high offset values
- search text
- category filters
- due-date filters
- sort order stability

Expected result:

- counts remain correct
- filters are consistent with server state
- no broken pagination when data changes

## 6. Inbox UI and Email Operations

### Inbox list

Test:

- pagination
- classification filters
- search
- rendering with long subjects and senders
- empty state behavior

### Direct actions

Test:

- mark important
- draft reply
- snooze from related task
- add to calendar where context exists

### Provider-specific behavior

Gmail:

- labels update correctly
- archive removes from inbox
- draft appears in Gmail drafts

Outlook:

- importance/category changes apply
- folder movement behaves correctly
- draft exists in Outlook mailbox

## 7. Agent Planning and Autonomy

### State-aware skip behavior

This needs careful validation.

Test:

- same semantic inbox state twice
- same inbox with changed timestamps only
- same inbox with reordered thread messages
- changed goals
- changed intent
- changed strategist output
- changed recent actions

Verify:

- unchanged semantic state skips heavy planning
- semantic changes trigger replanning
- normalized threads hash stably

### Fast planner

Test rule modules independently:

- recruiter rules
- scheduling rules
- cleanup rules

Verify:

- deterministic outputs
- correct workflow labels
- no cross-rule dependency bugs

### Heavy planner fallback

Test:

- no fast-plan output
- partial fast-plan output
- low remaining loop budget

Expected result:

- heavy planner runs only when needed
- low budget forces fast-planner-only path

## 8. Preview, Approval, and Workflow UX

### Preview generation

Test:

- preview created for each suggested step
- workflow preview summary created
- preview includes risk and estimated time saved

### Approval actions

Test:

- approve one action
- modify one action
- cancel one action
- approve all actions in a workflow

Verify:

- approved action executes once
- modified payload is what executes
- cancelled action never executes
- workflow ordering is preserved

### UI expectations

Test:

- approval queue renders pending previews
- grouped workflow cards feel coherent
- after approval, feed reflects execution quickly

## 9. Execution, Idempotency, and Dedupe

### Dedupe

Test:

- same step produced by fast and heavy planners
- same step produced on rapid consecutive runs
- same target with differently ordered input fields

Verify:

- only one persisted action remains
- highest-confidence action wins
- ties keep earliest order

### Idempotency

Test:

- worker restart during execution
- retry after network timeout
- repeated approval click

Expected result:

- no duplicate side effects
- same execution key reused
- action status converges correctly

## 10. Tool-by-Tool Validation

### `create_task`

Test:

- valid task creation
- duplicate avoidance
- undo path

### `create_calendar_event`

Test:

- Gmail calendar event creation
- Outlook calendar event creation
- undo path

### `draft_reply`

Test:

- draft generation quality
- provider draft creation
- undo path

### `send_reply`

Test:

- never auto-executes
- requires approval
- risky outcome logging exists

### `snooze`

Test:

- task snooze
- notification updates
- undo path

### `mark_important`

Test:

- Gmail important/starred handling
- Outlook importance reset on undo

### `archive_email`

Test:

- Gmail archive
- Outlook move to archive
- undo returns to inbox

### `delete_email`

Test:

- approval required
- Gmail trash
- Outlook move to deleted items
- undo path
- risky outcome signal

### `move_to_folder`

Test:

- allowlisted destination only
- Outlook folder resolution
- undo behavior

### `label_email`

Test:

- allowed labels only
- Gmail label add/remove
- Outlook category add/remove

## 11. Feedback, Policy, and Learning

### Feedback system

Test:

- approve
- reject
- always_allow
- modify
- cancel

Verify:

- feedback is stored
- confidence changes over time
- workflow and tool policy updates are reflected
- `always_allow` persists across future similar actions

### Contextual learning

Test:

- repeated approvals improve action confidence
- repeated rejections lower confidence
- stale behavior decays toward neutral

## 12. Memory and Reflection

### Reflection

Test:

- successful execution reflection
- failed execution reflection
- partial workflow reflection

Verify:

- reflection records exist
- suggestions are reasonable
- future planning changes after repeated outcomes

### Memory optimization

Test:

- old episodic memory summarization
- active workflow markers remain intact
- recent signals are preserved
- always-allow policy survives optimization

## 13. Cost Tracking and Observability

### LLM usage events

Test:

- classification call logs tokens
- extraction call logs tokens
- planning call logs tokens
- reflection call logs tokens
- strategist call logs tokens

Verify:

- rows appear in `llm_usage_events`
- provider/model are correct
- latency and token counts are plausible

### Aggregates

Test:

- daily per-user cost aggregation
- per-workflow aggregation
- cost per action
- cost per successful action

Verify:

- Redis and Postgres aggregates stay in sync enough for reads
- no negative or impossible cost values

## 14. Security and Abuse Testing

### Input validation

Test all write endpoints with:

- wrong types
- missing required fields
- oversized strings
- invalid enums
- malicious nested payloads

### Authorization

Test:

- user A trying to access user B data
- invalid action ID on approve/undo
- invalid workflow ID on approve-all/rollback

### Rate limits

Test:

- burst auth attempts
- burst sync requests
- burst webhook traffic

### Expected result

- safe rejection
- no cross-user leakage
- no stack trace leakage

## 15. Performance and Scale

### Data scale tests

Test with:

- 10k emails
- 50k emails
- 100k+ tasks and actions in staging if possible

Watch:

- `/emails` pagination latency
- `/tasks` pagination latency
- `/agent/actions` latency
- dashboard cache hit rate
- queue backlog growth

### Agent efficiency tests

Test:

- repeated loop runs against mostly unchanged data
- large noisy inboxes
- recruiter-heavy inboxes

Expected result:

- skip rate rises on unchanged state
- heavy planner usage remains controlled
- cost per action stays reasonable

## 16. UX Quality and Product Trust

This product is not only about correctness. It has to feel trustworthy.

Test:

- landing page clarity
- dashboard clarity with real data
- agent page explanation of what happened
- preview wording
- approval button confidence
- visibility of undo/rollback
- empty states
- loading states
- error states

Ask during testing:

- does the user understand what the agent did?
- does the user understand why it did it?
- does the user know what can be undone?
- does the UI feel stable when the dataset grows?

## 17. Release Gate

Before shipping to real users, do not skip these:

1. Gmail OAuth end-to-end
2. Outlook OAuth end-to-end
3. Inbox sync and extraction on real mailboxes
4. Preview and approve-all workflow tests
5. High-risk action gating for `delete_email` and `send_reply`
6. Undo and rollback tests
7. State-aware skip validation
8. Cost aggregate validation
9. Security negative tests
10. Full frontend and backend production builds

## Suggested Test Artifacts

Keep:

- screenshots of each core page
- sample inbox fixtures
- provider-specific test accounts
- query results for `agent_actions`, `agent_plans`, `agent_reflections`, `llm_usage_events`
- logs from failure drills

If you want a single source of truth for ongoing QA, this is the document to operationalize into a release checklist or test management tool.

