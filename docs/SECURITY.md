# Security & Trust

This system is built for production safety. The controls below are already implemented.

## Authentication

- JWTs are signed with `AUTH_JWT_SECRET`.
- Tokens are validated with **issuer** and **audience**.
- Session authentication supports **HttpOnly cookies** for production use.
- OAuth state cookies are short-lived and HTTP-only.

## Token Handling

- OAuth access/refresh tokens are encrypted at rest (`TOKEN_ENC_KEY`).
- OAuth callbacks establish a secure session cookie and then redirect to the frontend.
- Legacy bearer-token support remains for backwards compatibility, but the primary posture is cookie-based session auth.

## Request Hardening

- `helmet` headers enabled (no-referrer, cross-origin policy).
- `x-powered-by` disabled.
- Global rate limiting and stricter limits on `/auth` and `/webhooks`.
- Zod validation on all public endpoints.

## Permissions & Safety

- Auto-send emails are never executed without approval.
- Autopilot levels limit what can execute automatically.
- Actions are idempotent and recorded in `agent_actions`.

## Security.txt

A `/.well-known/security.txt` endpoint is included for disclosure readiness.

## Recommended Production Practices

- Store secrets in a managed vault (AWS Secrets Manager / GCP Secret Manager).
- Enable TLS termination at the edge.
- Configure CORS to only your production domains.
- Rotate OAuth client secrets regularly.
- Monitor rate limit spikes and auth failures.
