import { createApp } from './app.js';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { dbPing } from './config/db.js';

process.on('unhandledRejection', (reason) => {
  logger.error(reason, 'Unhandled promise rejection');
});

process.on('uncaughtException', (error) => {
  logger.fatal(error, 'Uncaught exception — shutting down');
  process.exit(1);
});

const start = async () => {
  try {
    await dbPing();
    const app = createApp();
    app.listen(env.port, () => {
      logger.info(`API listening on ${env.port}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    logger.error({ err: error, message: error instanceof Error ? error.message : String(error) }, 'Failed to start server');
    process.exit(1);
  }
};

start();
