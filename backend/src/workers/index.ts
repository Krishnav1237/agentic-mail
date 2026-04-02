import { startAiWorker } from './aiProcessor.js';
import { startIngestionWorker } from './ingestionWorker.js';
import { logger } from '../config/logger.js';
import { ingestionQueue, agentQueue } from '../queues/index.js';

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

  await ingestionQueue.add(
    'sync-all',
    {},
    { repeat: { every: 5 * 60 * 1000 }, jobId: 'sync-all' }
  );
  await agentQueue.add(
    'run-all',
    {},
    { repeat: { every: 5 * 60 * 1000 }, jobId: 'agent-core-all' }
  );

  logger.info('Workers started');
};

bootstrap().catch((error) => {
  logger.error(error, 'Worker bootstrap failed');
  process.exit(1);
});
