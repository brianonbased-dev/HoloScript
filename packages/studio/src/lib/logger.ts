export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

class StudioLogger {
  private level: LogLevel = 'info';

  constructor() {
    if (typeof process !== 'undefined' && process.env.NODE_ENV === 'development') {
      this.level = 'debug';
    }
  }

  setLevel(level: LogLevel) {
    this.level = level;
  }

  private shouldLog(level: LogLevel): boolean {
    const levels: LogLevel[] = ['debug', 'info', 'warn', 'error'];
    return levels.indexOf(level) >= levels.indexOf(this.level);
  }

  debug(message: string, ...args: any[]) {
    if (this.shouldLog('debug')) {
      console.debug(`[Studio:DEBUG] ${message}`, ...args);
    }
  }

  info(message: string, ...args: any[]) {
    if (this.shouldLog('info')) {
      console.info(`[Studio:INFO] ${message}`, ...args);
    }
  }

  warn(message: string, ...args: any[]) {
    if (this.shouldLog('warn')) {
      console.warn(`[Studio:WARN] ${message}`, ...args);
    }
  }

  error(message: string, ...args: any[]) {
    if (this.shouldLog('error')) {
      console.error(`[Studio:ERROR] ${message}`, ...args);
    }
  }
}

export const logger = new StudioLogger();
