/**
 * @holoscript/export-api - Entry Point
 *
 * REST API for HoloScript compilation and export.
 * Starts the Express server with SOC 2 compliance foundations.
 */

import { createApp } from './app.js';
import { config } from './config.js';
import { logger } from './utils/logger.js';
import { pathToFileURL } from 'node:url';

const app = createApp();

function isDirectRun(): boolean {
  return process.argv[1] != null && import.meta.url === pathToFileURL(process.argv[1]).href;
}

export function startExportApiServer() {
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

  const shutdown = (signal: string) => {
    logger.info({ signal }, 'Shutdown signal received, closing server...');
    server.close(() => {
      logger.info('Server closed');
      process.exit(0);
    });

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

  return server;
}

if (isDirectRun()) {
  startExportApiServer();
}

export { app };
