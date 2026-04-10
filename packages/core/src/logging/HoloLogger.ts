/**
 * HoloLogger — Unified logger implementing @infinitus/shared Logger interface
 *
 * Console-backed logger with log levels, structured context,
 * and performance tracking.
 *
 * @version 1.0.0
 */

// =============================================================================
// TYPES (mirrors @infinitus/shared Logger interface)
// =============================================================================

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';

export interface Logger {
  error(message: string, context?: Record<string, unknown>): void;
  fatal(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  debug(message: string, context?: Record<string, unknown>): void;
  build(message: string, buildId: string, stage?: string, context?: Record<string, unknown>): void;
  request(message: string, requestId: string, context?: Record<string, unknown>): void;
  performance(message: string, durationMs: number, context?: Record<string, unknown>): void;
  readonly isDebugEnabled: boolean;
}

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  fatal: 4,
};

export interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: number;
  logger: string;
  context?: Record<string, unknown>;
}

// =============================================================================
// HOLO LOGGER
// =============================================================================

export class HoloLogger implements Logger {
  private name: string;
  private level: LogLevel;
  private entries: LogEntry[] = [];
  private maxEntries: number;
  private parent?: HoloLogger;

  constructor(name: string, level: LogLevel = 'info', maxEntries: number = 500) {
    this.name = name;
    this.level = level;
    this.maxEntries = maxEntries;
  }

  get isDebugEnabled(): boolean {
    return this.shouldLog('debug');
  }

  error(message: string, context?: Record<string, unknown>): void {
    this.log('error', message, context);
  }

  fatal(message: string, context?: Record<string, unknown>): void {
    this.log('fatal', message, context);
  }

  warn(message: string, context?: Record<string, unknown>): void {
    this.log('warn', message, context);
  }

  info(message: string, context?: Record<string, unknown>): void {
    this.log('info', message, context);
  }

  debug(message: string, context?: Record<string, unknown>): void {
    this.log('debug', message, context);
  }

  build(message: string, buildId: string, stage?: string, context?: Record<string, unknown>): void {
    this.log('info', message, { ...context, buildId, stage, type: 'build' });
  }

  request(message: string, requestId: string, context?: Record<string, unknown>): void {
    this.log('info', message, { ...context, requestId, type: 'request' });
  }

  performance(message: string, durationMs: number, context?: Record<string, unknown>): void {
    this.log('info', message, { ...context, durationMs, type: 'performance' });
  }

  /**
   * Create a child logger with the same config
   */
  child(childName: string): HoloLogger {
    const child = new HoloLogger(`${this.name}.${childName}`, this.level, this.maxEntries);
    child.parent = this;
    return child;
  }

  /**
   * Set log level
   */
  setLevel(level: LogLevel): void {
    this.level = level;
  }

  /**
   * Get current log level
   */
  getLevel(): LogLevel {
    return this.level;
  }

  /**
   * Get logger name
   */
  getName(): string {
    return this.name;
  }

  /**
   * Get stored entries
   */
  getEntries(): LogEntry[] {
    return [...this.entries];
  }

  /**
   * Get entries filtered by level
   */
  getEntriesByLevel(level: LogLevel): LogEntry[] {
    return this.entries.filter((e) => e.level === level);
  }

  /**
   * Clear stored entries
   */
  clear(): void {
    this.entries = [];
  }

  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[this.level];
  }

  private log(level: LogLevel, message: string, context?: Record<string, unknown>): void {
    if (!this.shouldLog(level)) return;

    const entry: LogEntry = {
      level,
      message,
      timestamp: Date.now(),
      logger: this.name,
      context,
    };

    this.entries.push(entry);
    if (this.entries.length > this.maxEntries) {
      this.entries.shift();
    }

    // Propagate to parent
    if (this.parent) {
      this.parent.entries.push(entry);
    }
  }
}
