# Operations & Deployment

## Services

- **API**: `/backend` (Express)
- **Worker**: `/backend` (BullMQ)
- **Frontend**: `/frontend` (Vite build)

## Run Locally

```bash
cd /Users/HP/outlook-bot/backend
npm run dev
```

Worker:

```bash
cd /Users/HP/outlook-bot/backend
npm run worker
```

Frontend:

```bash
cd /Users/HP/outlook-bot/frontend
npm run dev
```

## Production Build

```bash
cd /Users/HP/outlook-bot/backend
npm run build

cd /Users/HP/outlook-bot/frontend
npm run build
```

## Environment

Use `/backend/.env.example` and `/frontend/.env.example` as templates.

## Webhooks

If you enable Graph webhooks, expose:

```
POST /webhooks/graph
```

`MS_WEBHOOK_NOTIFICATION_URL` must be publicly reachable over HTTPS.

## Scaling Notes

- API is stateless; scale horizontally.
- Workers can be scaled independently.
- Redis is required for BullMQ queues.
- PostgreSQL needs indexes for large datasets.

## Recommended Monitoring

- Log auth failures and rate limit hits.
- Monitor queue latency and job failures.
- Track DB query time on tasks/emails list endpoints.

