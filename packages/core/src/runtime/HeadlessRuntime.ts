import {
  createHeadlessRuntime as createEngineHeadlessRuntime,
  getProfile,
  HEADLESS_PROFILE,
  type ActionHandler,
} from '@holoscript/engine/runtime';

export { getProfile, HEADLESS_PROFILE, type ActionHandler };

export function createHeadlessRuntime(ast: unknown, options?: Record<string, unknown>) {
  const runtime = createEngineHeadlessRuntime(ast as never, options as never) as {
    tick?: (...args: unknown[]) => unknown;
    getStats?: () => Record<string, unknown>;
    [key: string]: unknown;
  };

  let localTickCount = 0;

  if (typeof runtime.tick === 'function') {
    const originalTick = runtime.tick.bind(runtime);
    runtime.tick = (...args: unknown[]) => {
      localTickCount++;
      return originalTick(...args);
    };
  }

  if (typeof runtime.getStats === 'function') {
    const originalGetStats = runtime.getStats.bind(runtime);
    runtime.getStats = () => {
      const stats = originalGetStats();
      return {
        ...stats,
        tickCount:
          typeof stats.tickCount === 'number'
            ? stats.tickCount
            : typeof stats.updateCount === 'number'
              ? stats.updateCount
              : localTickCount,
      };
    };
  }

  return runtime;
}
