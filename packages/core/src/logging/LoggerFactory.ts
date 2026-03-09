/**
 * LoggerFactory — Named logger creation and global configuration
 *
 * Provides a centralized factory for creating named loggers,
 * with global log level control and formatter configuration.
 *
 * @version 1.0.0
 */

import { HoloLogger, type LogLevel } from './HoloLogger';

// =============================================================================
// TYPES
// =============================================================================

export interface LogFormatter {
  name: string;
  format(entry: {
    level: LogLevel;
    message: string;
    logger: string;
    timestamp: number;
    context?: Record<string, any>;
  }): string;
}

// =============================================================================
// BUILT-IN FORMATTERS
// =============================================================================

export const SimpleFormatter: LogFormatter = {
  name: 'simple',
  format(entry) {
    return `[${entry.level.toUpperCase()}] ${entry.logger}: ${entry.message}`;
  },
};

export const DetailedFormatter: LogFormatter = {
  name: 'detailed',
  format(entry) {
    const time = new Date(entry.timestamp).toISOString();
    const ctx = entry.context ? ` ${JSON.stringify(entry.context)}` : '';
    return `${time} [${entry.level.toUpperCase()}] ${entry.logger}: ${entry.message}${ctx}`;
  },
};

export const JsonFormatter: LogFormatter = {
  name: 'json',
  format(entry) {
    return JSON.stringify(entry);
  },
};

// =============================================================================
// LOGGER FACTORY
// =============================================================================

export class LoggerFactory {
  private loggers: Map<string, HoloLogger> = new Map();
  private globalLevel: LogLevel = 'info';
  private formatter: LogFormatter = SimpleFormatter;
  private maxEntriesPerLogger: number = 500;

  /**
   * Get or create a named logger
   */
  getLogger(name: string): HoloLogger {
    if (this.loggers.has(name)) {
      return this.loggers.get(name)!;
    }

    const logger = new HoloLogger(name, this.globalLevel, this.maxEntriesPerLogger);
    this.loggers.set(name, logger);
    return logger;
  }

  /**
   * Set global log level (affects new loggers and updates existing)
   */
  setGlobalLevel(level: LogLevel): void {
    this.globalLevel = level;
    for (const logger of this.loggers.values()) {
      logger.setLevel(level);
    }
  }

  /**
   * Get global log level
   */
  getGlobalLevel(): LogLevel {
    return this.globalLevel;
  }

  /**
   * Set the active formatter
   */
  setFormatter(formatter: LogFormatter): void {
    this.formatter = formatter;
  }

  /**
   * Get current formatter
   */
  getFormatter(): LogFormatter {
    return this.formatter;
  }

  /**
   * Format a log entry using the active formatter
   */
  format(entry: {
    level: LogLevel;
    message: string;
    logger: string;
    timestamp: number;
    context?: Record<string, any>;
  }): string {
    return this.formatter.format(entry);
  }

  /**
   * Get all logger names
   */
  getLoggerNames(): string[] {
    return [...this.loggers.keys()];
  }

  /**
   * Get total logger count
   */
  getLoggerCount(): number {
    return this.loggers.size;
  }

  /**
   * Clear all loggers
   */
  reset(): void {
    this.loggers.clear();
  }

  /**
   * Set max entries per logger
   */
  setMaxEntries(max: number): void {
    this.maxEntriesPerLogger = max;
  }
}
