import { startIngestionWorker } from './ingestionWorker.js';

console.log('[IIL Worker Process] Starting background workers...');
const ingestionWorker = startIngestionWorker();

const gracefulShutdown = async (signal: string) => {
  console.log(`[IIL Worker Process] ${signal} received. Closing workers...`);
  await ingestionWorker.close();
  console.log('[IIL Worker Process] Workers shut down gracefully.');
  process.exit(0);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
