/**
 * ConsoleLogger.ts
 *
 * Structured logging: severity levels, tag filters,
 * formatted output, and log history with search.
 *
 * @module debug
 */

// =============================================================================
// TYPES
// =============================================================================

export enum LogLevel {
  TRACE = 0,
  DEBUG = 1,
  INFO = 2,
  WARN = 3,
  ERROR = 4,
  FATAL = 5,
  NONE = 99,
}

export interface LogEntry {
  id: number;
  level: LogLevel;
  message: string;
  tag: string;
  timestamp: number;
  data?: Record<string, unknown>;
}

export interface LogFilter {
  minLevel?: LogLevel;
  tags?: string[];
  search?: string;
}

// =============================================================================
// LEVEL NAMES
// =============================================================================

const LEVEL_NAMES: Record<LogLevel, string> = {
  [LogLevel.TRACE]: 'TRACE',
  [LogLevel.DEBUG]: 'DEBUG',
  [LogLevel.INFO]: 'INFO ',
  [LogLevel.WARN]: 'WARN ',
  [LogLevel.ERROR]: 'ERROR',
  [LogLevel.FATAL]: 'FATAL',
  [LogLevel.NONE]: 'NONE ',
};

// =============================================================================
// CONSOLE LOGGER
// =============================================================================

let _logId = 0;

export class ConsoleLogger {
  private history: LogEntry[] = [];
  private maxHistory = 1000;
  private minLevel: LogLevel = LogLevel.DEBUG;
  private enabledTags: Set<string> | null = null; // null = all tags
  private disabledTags: Set<string> = new Set();
  private listeners: Array<(entry: LogEntry) => void> = [];

  // ---------------------------------------------------------------------------
  // Logging Methods
  // ---------------------------------------------------------------------------

  trace(tag: string, message: string, data?: Record<string, unknown>): void {
    this.log(LogLevel.TRACE, tag, message, data);
  }

  debug(tag: string, message: string, data?: Record<string, unknown>): void {
    this.log(LogLevel.DEBUG, tag, message, data);
  }

  info(tag: string, message: string, data?: Record<string, unknown>): void {
    this.log(LogLevel.INFO, tag, message, data);
  }

  warn(tag: string, message: string, data?: Record<string, unknown>): void {
    this.log(LogLevel.WARN, tag, message, data);
  }

  error(tag: string, message: string, data?: Record<string, unknown>): void {
    this.log(LogLevel.ERROR, tag, message, data);
  }

  fatal(tag: string, message: string, data?: Record<string, unknown>): void {
    this.log(LogLevel.FATAL, tag, message, data);
  }

  private log(level: LogLevel, tag: string, message: string, data?: Record<string, unknown>): void {
    if (level < this.minLevel) return;
    if (this.enabledTags && !this.enabledTags.has(tag)) return;
    if (this.disabledTags.has(tag)) return;

    const entry: LogEntry = {
      id: _logId++,
      level,
      message,
      tag,
      timestamp: Date.now(),
      data,
    };

    this.history.push(entry);
    if (this.history.length > this.maxHistory) this.history.shift();

    for (const listener of this.listeners) {
      listener(entry);
    }
  }

  // ---------------------------------------------------------------------------
  // Filtering
  // ---------------------------------------------------------------------------

  setMinLevel(level: LogLevel): void {
    this.minLevel = level;
  }
  getMinLevel(): LogLevel {
    return this.minLevel;
  }

  enableTag(tag: string): void {
    if (!this.enabledTags) this.enabledTags = new Set();
    this.enabledTags.add(tag);
    this.disabledTags.delete(tag);
  }

  disableTag(tag: string): void {
    this.disabledTags.add(tag);
    this.enabledTags?.delete(tag);
  }

  resetFilters(): void {
    this.enabledTags = null;
    this.disabledTags.clear();
  }

  // ---------------------------------------------------------------------------
  // History & Search
  // ---------------------------------------------------------------------------

  getHistory(filter?: LogFilter): LogEntry[] {
    let entries = [...this.history];
    if (filter) {
      if (filter.minLevel !== undefined) {
        entries = entries.filter((e) => e.level >= filter.minLevel!);
      }
      if (filter.tags && filter.tags.length > 0) {
        entries = entries.filter((e) => filter.tags!.includes(e.tag));
      }
      if (filter.search) {
        const s = filter.search.toLowerCase();
        entries = entries.filter((e) => e.message.toLowerCase().includes(s));
      }
    }
    return entries;
  }

  getRecentEntries(count: number): LogEntry[] {
    return this.history.slice(-count);
  }

  getEntryCount(): number {
    return this.history.length;
  }

  getCountByLevel(): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const entry of this.history) {
      const name = LEVEL_NAMES[entry.level] ?? 'UNKNOWN';
      counts[name] = (counts[name] ?? 0) + 1;
    }
    return counts;
  }

  // ---------------------------------------------------------------------------
  // Formatting
  // ---------------------------------------------------------------------------

  format(entry: LogEntry): string {
    const ts = new Date(entry.timestamp).toISOString().replace('T', ' ').replace('Z', '');
    const level = LEVEL_NAMES[entry.level] ?? '???  ';
    const dataStr = entry.data ? ` ${JSON.stringify(entry.data)}` : '';
    return `[${ts}] ${level} [${entry.tag}] ${entry.message}${dataStr}`;
  }

  // ---------------------------------------------------------------------------
  // Listeners
  // ---------------------------------------------------------------------------

  addListener(listener: (entry: LogEntry) => void): void {
    this.listeners.push(listener);
  }

  removeListener(listener: (entry: LogEntry) => void): void {
    const idx = this.listeners.indexOf(listener);
    if (idx >= 0) this.listeners.splice(idx, 1);
  }

  // ---------------------------------------------------------------------------
  // Control
  // ---------------------------------------------------------------------------

  clear(): void {
    this.history = [];
  }
  setMaxHistory(max: number): void {
    this.maxHistory = max;
  }
}
