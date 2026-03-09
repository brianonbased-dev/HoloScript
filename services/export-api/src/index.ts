/**
 * @holoscript/export-api - Entry Point
 *
 * REST API for HoloScript compilation and export.
 * Starts the Express server with SOC 2 compliance foundations.
 */

import { createApp } from './app.js';
import { config } from './config.js';
import { logger } from './utils/logger.js';

const app = createApp();

const server = app.listen(config.port, config.host, () => {
  logger.info(
    {
      port: config.port,
      host: config.host,
      env: config.env,
      apiPrefix: config.apiPrefix,
    },
    `@holoscript/export-api started on ${config.host}:${config.port}`
  );
});

// Graceful shutdown
const shutdown = (signal: string) => {
  logger.info({ signal }, 'Shutdown signal received, closing server...');
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });

  // Force close after 30s
  setTimeout(() => {
    logger.error('Forced shutdown after 30s timeout');
    process.exit(1);
  }, 30_000);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('unhandledRejection', (reason, promise) => {
  logger.error({ reason, promise }, 'Unhandled rejection');
});

process.on('uncaughtException', (error) => {
  logger.fatal({ error }, 'Uncaught exception - shutting down');
  process.exit(1);
});

export { app };
