/**
 * Mesh-local logger.
 *
 * Previously mesh imported `logger` from `@holoscript/core`, which forced
 * `@holoscript/core` to be a runtime dependency of the published `@holoscript/mesh`
 * package even though core is externalized by tsup — breaking cold external
 * consumption (a consumer installing only `@holoscript/mesh` could not resolve
 * `@holoscript/core`). This zero-dependency console-backed logger removes that
 * runtime edge, keeping mesh standalone. (W.667 / cold-consume chain, task spvc.)
 */

export interface MeshLogger {
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
  debug: (...args: unknown[]) => void;
}

const noop = (..._args: unknown[]): void => {};

/**
 * Default mesh logger. Routes to the host `console` when available, otherwise
 * no-ops (e.g. constrained runtimes). Consumers needing structured logging can
 * ignore this and wire their own; mesh only calls info/warn/error/debug.
 */
export const logger: MeshLogger =
  typeof console !== 'undefined'
    ? {
        info: (...args: unknown[]) => console.info(...args),
        warn: (...args: unknown[]) => console.warn(...args),
        error: (...args: unknown[]) => console.error(...args),
        debug: (...args: unknown[]) => (console.debug ?? console.log)(...args),
      }
    : { info: noop, warn: noop, error: noop, debug: noop };
