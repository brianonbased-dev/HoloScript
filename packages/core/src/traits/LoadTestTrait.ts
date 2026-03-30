/**
 * LoadTestTrait — v5.1
 * Load / stress test runner with concurrency tracking.
 */
import type { TraitHandler } from './TraitTypes';

export interface LoadTestConfig {
  max_vus: number;
  default_duration_ms: number;
}

export const loadTestHandler: TraitHandler<LoadTestConfig> = {
  name: 'load_test',
  defaultConfig: { max_vus: 100, default_duration_ms: 30000 },
  onAttach(node: any): void {
    node.__loadState = { running: false, vus: 0, requests: 0, errors: 0 };
  },
  onDetach(node: any): void {
    delete node.__loadState;
  },
  onUpdate(): void {},
  onEvent(node: any, config: LoadTestConfig, context: any, event: any): void {
    const state = node.__loadState as
      | { running: boolean; vus: number; requests: number; errors: number }
      | undefined;
    if (!state) return;
    const t = typeof event === 'string' ? event : event.type;
    switch (t) {
      case 'load:start':
        state.running = true;
        state.vus = Math.min((event.vus as number) ?? 10, config.max_vus);
        state.requests = 0;
        state.errors = 0;
        context.emit?.('load:started', { vus: state.vus, duration: config.default_duration_ms });
        break;
      case 'load:request':
        state.requests++;
        if (event.error) state.errors++;
        context.emit?.('load:progress', { requests: state.requests, errors: state.errors });
        break;
      case 'load:stop':
        state.running = false;
        context.emit?.('load:completed', {
          requests: state.requests,
          errors: state.errors,
          errorRate: state.requests > 0 ? state.errors / state.requests : 0,
        });
        break;
    }
  },
};
export default loadTestHandler;
