/**
 * Structured Logger
 *
 * Uses pino for JSON-structured logging with request correlation.
 * SOC 2 CC7.2: Log security-relevant events with tamper-evident timestamps.
 */

import pino from 'pino';
import { config } from '../config.js';

export const logger = pino({
  level: config.logLevel,
  transport:
    config.env === 'development'
      ? {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'yyyy-mm-dd HH:MM:ss.l',
            ignore: 'pid,hostname',
          },
        }
      : undefined,
  // Production: JSON format with ISO timestamps
  timestamp: pino.stdTimeFunctions.isoTime,
  serializers: {
    err: pino.stdSerializers.err,
    req: pino.stdSerializers.req,
    res: pino.stdSerializers.res,
  },
  // Redact sensitive fields from logs (SOC 2 CC6.1)
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers["x-api-key"]',
      'body.source',
      'body.apiKey',
      'body.secret',
    ],
    censor: '[REDACTED]',
  },
});

/**
 * Create a child logger with request context.
 */
export function createRequestLogger(requestId: string, method: string, path: string) {
  return logger.child({ requestId, method, path });
}

/**
 * Log a security-relevant event (SOC 2 CC7.2).
 */
export function logSecurityEvent(
  event: string,
  details: Record<string, unknown>,
  level: 'info' | 'warn' | 'error' = 'info'
): void {
  logger[level]({ securityEvent: event, ...details }, `Security: ${event}`);
}
