import { app } from './app.js';
import { env } from './config/env.js';

const server = app.listen(env.PORT, () => {
  console.log(`[Obligo Backend] Server running on http://localhost:${env.PORT} (${env.NODE_ENV})`);
});

const gracefulShutdown = (signal: string) => {
  console.log(`[Obligo Backend] ${signal} received. Closing HTTP server...`);
  server.close(() => {
    console.log('[Obligo Backend] HTTP server closed.');
    process.exit(0);
  });
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
