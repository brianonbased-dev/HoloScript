/**
 * Minimal logger stub for the learning module.
 */

export interface Logger {
  debug(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
}

const noop = (): void => { /* intentional no-op */ };

export const logger: Logger = {
  debug: noop,
  info: noop,
  warn: noop,
  error: noop,
};
