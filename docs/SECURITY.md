# Security

This document describes the security posture of Inbox Intelligence Layer and the operational safeguards expected in production.

## Security Goals

- Protect mailbox and calendar data
- Prevent unauthorized account access
- Prevent unsafe autonomous actions
- Make all agent activity traceable
- Limit blast radius when components fail

## Implemented Controls

## Authentication and Session Management

Implemented:

- JWT signing with `AUTH_JWT_SECRET`
- issuer validation via `AUTH_JWT_ISSUER`
- audience validation via `AUTH_JWT_AUDIENCE`
- HttpOnly auth cookie support
- bearer token support for compatibility
- short-lived OAuth state cookies

Relevant files:

- `backend/src/routes/auth.ts`
- `backend/src/middleware/auth.ts`

Recommended production settings:

- use HTTPS only
- keep `secure` cookies enabled in production
- rotate JWT secrets with a planned cutover
- avoid exposing bearer tokens in browser-visible storage for new clients

## OAuth and Provider Tokens

Implemented:

- Google OAuth
- Microsoft OAuth
- encrypted token storage at rest using `TOKEN_ENC_KEY`
- provider token refresh support
- session establishment after successful OAuth

Operational guidance:

- store OAuth secrets in a real secret manager
- limit redirect URIs to known domains
- keep Google and Azure app permissions minimal
- review granted scopes quarterly

## API Hardening

Implemented:

- Zod validation on public request bodies and query strings
- Helmet middleware
- `x-powered-by` disabled
- `no-referrer` policy
- route-level and global rate limiting
- cookie parsing with explicit auth handling

Relevant files:

- `backend/src/app.ts`
- `backend/src/middleware/validate.ts`

## Autonomous Action Safety

The agent is autonomous, but not unconstrained.

Implemented:

- tool-level risk classification
- approval requirements for risky tools
- never auto-send guarded email actions
- action previews before user-approved execution
- workflow-level preview approval
- idempotent action records
- rollback and undo support where possible
- action and decision trace persistence

Relevant files:

- `backend/src/agent/executor.ts`
- `backend/src/agent/preview.ts`
- `backend/src/agent/recovery.ts`
- `backend/src/agent/decisionTrace.ts`
- `backend/src/tools/types.ts`

## Tool Risk Model

Current high-level posture:

- low risk: safe organizational actions such as labeling and archiving
- medium risk: mailbox movement and similar structural changes
- high risk: destructive or irreversible actions

Examples:

- `label_email` - low risk
- `archive_email` - low risk
- `move_to_folder` - medium risk
- `delete_email` - high risk, never auto-executed
- `send_reply` - human approval required

## Data Protection

Sensitive data in this product includes:

- email content and metadata
- task content
- calendar details
- OAuth access tokens
- user behavior and feedback signals

Current protections:

- provider tokens encrypted at rest
- scoped provider access
- auth-protected product endpoints
- database-backed auditability of actions and reflections

Recommended additions for a production deployment:

- database encryption at rest
- encrypted backups
- row-level audit export pipeline
- environment-specific secret rotation policy

## Traceability and Auditability

Implemented stores:

- `agent_actions`
- `agent_logs`
- `agent_reflections`
- decision trace records
- `llm_usage_events`
- daily cost aggregates

This gives the product a concrete audit trail from:

```text
input -> reasoning -> decision -> preview/approval -> execution -> result -> reflection
```

## State-Aware Safety

The system avoids unnecessary replanning and excess AI usage by hashing normalized, decision-relevant state.

Benefits:

- lower cost
- reduced accidental thrash
- more stable automation behavior

Relevant file:

- `backend/src/agent/stateManager.ts`

## Memory Safety

Memory can influence future decisions, so it is treated carefully.

Implemented safeguards:

- active patterns are not compressed away
- `always_allow` rules are preserved
- stale signals decay toward neutral
- only inactive episodic memory is summarized

Relevant file:

- `backend/src/memory/optimizer.ts`

## Cost and Abuse Monitoring

Implemented:

- token usage tracking
- request cost estimation
- daily cost aggregates
- workflow-level cost visibility

Relevant file:

- `backend/src/observability/costTracker.ts`

Why this matters:

- helps detect runaway loops
- helps detect prompt or planner regressions
- supports per-user and per-workflow spend analysis

## Security Headers and Disclosure

Implemented:

- Helmet security headers
- `/.well-known/security.txt`

Relevant file:

- `backend/src/app.ts`

## Production Security Checklist

Before launch:

1. Use managed secrets, not plaintext env files on shared infrastructure
2. Enforce HTTPS and HSTS at the edge
3. Restrict CORS to production domains only
4. Restrict OAuth redirect URIs to exact trusted URLs
5. Use separate Google/Azure apps for staging and production
6. Rotate `AUTH_JWT_SECRET` and provider credentials on a schedule
7. Protect Postgres and Redis with network-level isolation
8. Enable centralized log aggregation with access controls
9. Monitor auth failures, preview cancellations, undo frequency, and rate-limit spikes
10. Keep `delete_email` and `send_reply` human-gated until live behavior is proven

## What To Pen-Test

High-value security test areas:

- session fixation and cookie handling
- bearer vs cookie auth precedence
- OAuth state validation
- rate-limit bypass attempts
- validation bypass attempts on all write endpoints
- replay of preview approval requests
- duplicate action creation under concurrent plan execution
- unauthorized rollback/undo attempts
- mailbox tool abuse through crafted inputs

For full product validation coverage, use `docs/TESTING.md`.
