import { startIngestionWorker } from './ingestionWorker.js';

console.log('[Obligo Worker Process] Starting background workers...');
const ingestionWorker = startIngestionWorker();

const gracefulShutdown = async (signal: string) => {
  console.log(`[Obligo Worker Process] ${signal} received. Closing workers...`);
  await ingestionWorker.close();
  console.log('[Obligo Worker Process] Workers shut down gracefully.');
  process.exit(0);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
