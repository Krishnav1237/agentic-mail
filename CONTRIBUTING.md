# Contributing

## Workflow

1. Create a feature branch from your current integration branch.
2. Keep changes scoped to a single concern when possible.
3. Run the relevant checks before asking for review.
4. Document behavior changes alongside code changes.

## Local Setup

1. Start infrastructure with `docker-compose up -d`.
2. Copy `backend/.env.example` to `backend/.env`.
3. Copy `frontend/.env.example` to `frontend/.env`.
4. Install dependencies in both `backend/` and `frontend/`.

## Quality Gates

Backend:

- `npm run test`
- `npm run build`
- `npm run lint`

Frontend:

- `npm run build`
- `npm run lint`

## Coding Standards

- TypeScript first.
- Prefer small, typed functions over broad untyped helpers.
- Validate request boundaries with Zod.
- Keep risky mailbox actions approval-gated unless the product policy explicitly allows otherwise.
- Avoid committing logs, secrets, build artifacts, or local-only utility output.

## Pull Request Notes

- Summarize user-facing impact.
- Call out schema, env, or operational changes explicitly.
- Include test/build status in the PR description.
- Mention any follow-up work that was intentionally deferred.
