/**
 * @holoscript/core Logger
 *
 * Simple pluggable logger for HoloScript
 */

export interface HoloScriptLogger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

/**
 * No-operation logger implementation that discards all log messages.
 * Used as a fallback when no specific logger is configured or when 
 * logging should be completely disabled for performance reasons.
 * 
 * @example
 * ```typescript
 * const logger = new NoOpLogger();
 * logger.info('This message will be discarded');
 * ```
 */
class NoOpLogger implements HoloScriptLogger {
  /**
   * Debug-level logging (no-op implementation).
   * @param message - Debug message to discard
   * @param meta - Optional metadata to discard
   */
  debug(message: string, meta?: Record<string, unknown>): void {}
  
  /**
   * Info-level logging (no-op implementation).
   * @param message - Info message to discard
   * @param meta - Optional metadata to discard
   */
  info(message: string, meta?: Record<string, unknown>): void {}
  
  /**
   * Warning-level logging (no-op implementation).
   * @param message - Warning message to discard
   * @param meta - Optional metadata to discard
   */
  warn(message: string, meta?: Record<string, unknown>): void {}
  
  /**
   * Error-level logging (no-op implementation).
   * @param message - Error message to discard
   * @param meta - Optional metadata to discard
   */
  error(message: string, meta?: Record<string, unknown>): void {}
}

class ConsoleLogger implements HoloScriptLogger {
  debug(message: string, meta?: Record<string, unknown>): void {
    console.debug(`[HoloScript:DEBUG] ${message}`, meta ?? '');
  }
  info(message: string, meta?: Record<string, unknown>): void {
    console.info(`[HoloScript:INFO] ${message}`, meta ?? '');
  }
  warn(message: string, meta?: Record<string, unknown>): void {
    console.warn(`[HoloScript:WARN] ${message}`, meta ?? '');
  }
  error(message: string, meta?: Record<string, unknown>): void {
    console.error(`[HoloScript:ERROR] ${message}`, meta ?? '');
  }
}

let currentLogger: HoloScriptLogger = new NoOpLogger();

export function setHoloScriptLogger(logger: HoloScriptLogger): void {
  currentLogger = logger;
}

export function enableConsoleLogging(): void {
  currentLogger = new ConsoleLogger();
}

export function resetLogger(): void {
  currentLogger = new NoOpLogger();
}

export const logger: HoloScriptLogger = {
  debug: (msg, meta) => currentLogger.debug(msg, meta),
  info: (msg, meta) => currentLogger.info(msg, meta),
  warn: (msg, meta) => currentLogger.warn(msg, meta),
  error: (msg, meta) => currentLogger.error(msg, meta),
};

export { NoOpLogger, ConsoleLogger };
