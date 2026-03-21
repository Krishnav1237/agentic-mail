import { createApp } from './app.js';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { dbPing } from './config/db.js';

const start = async () => {
  try {
    await dbPing();
    const app = createApp();
    app.listen(env.port, () => {
      logger.info(`API listening on ${env.port}`);
    });
  } catch (error) {
    logger.error(error, 'Failed to start server');
    process.exit(1);
  }
};

start();
