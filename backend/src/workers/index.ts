import { startAiWorker } from './aiProcessor.js';
import { startIngestionWorker } from './ingestionWorker.js';
import { startProductWorker } from './productWorker.js';
import { logger } from '../config/logger.js';
import { ingestionQueue, agentQueue, productQueue } from '../queues/index.js';

process.on('unhandledRejection', (reason) => {
  logger.error(reason, 'Worker: unhandled promise rejection');
});

process.on('uncaughtException', (error) => {
  logger.fatal(error, 'Worker: uncaught exception — shutting down');
  process.exit(1);
});

const bootstrap = async () => {
  startIngestionWorker();
  startAiWorker();
  startProductWorker();

  await ingestionQueue.add(
    'sync-active',
    {},
    { repeat: { every: 5 * 60 * 1000 }, jobId: 'sync-active' }
  );
  await ingestionQueue.add(
    'sync-backfill',
    {},
    { repeat: { every: 60 * 60 * 1000 }, jobId: 'sync-backfill' }
  );
  await ingestionQueue.add(
    'renew-graph-subscriptions',
    {},
    {
      repeat: { every: 30 * 60 * 1000 },
      jobId: 'renew-graph-subscriptions',
    }
  );
  await ingestionQueue.add(
    'purge-retention',
    {},
    {
      repeat: { every: 12 * 60 * 60 * 1000 },
      jobId: 'purge-retention',
    }
  );
  await agentQueue.add(
    'run-active',
    {},
    { repeat: { every: 5 * 60 * 1000 }, jobId: 'agent-core-active' }
  );
  await agentQueue.add(
    'run-backfill',
    {},
    { repeat: { every: 30 * 60 * 1000 }, jobId: 'agent-core-backfill' }
  );
  await productQueue.add(
    'must-act-active',
    {},
    { repeat: { every: 15 * 60 * 1000 }, jobId: 'must-act-active' }
  );
  await productQueue.add(
    'followups-active',
    {},
    { repeat: { every: 15 * 60 * 1000 }, jobId: 'followups-active' }
  );

  logger.info('Workers started');
};

bootstrap().catch((error) => {
  logger.error(error, 'Worker bootstrap failed');
  process.exit(1);
});
