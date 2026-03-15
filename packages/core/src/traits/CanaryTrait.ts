/**
 * CanaryTrait — v5.1
 *
 * Canary / blue-green release gating with traffic splitting.
 *
 * Events:
 *  canary:start    { version, percentage }
 *  canary:adjust   { percentage }
 *  canary:promote  (full rollout)
 *  canary:abort    (rollback canary)
 *  canary:status   { version, percentage, started }
 */

import type { TraitHandler } from './TraitTypes';

export interface CanaryConfig {
  initial_percentage: number;
  increment: number;
}

export const canaryHandler: TraitHandler<CanaryConfig> = {
  name: 'canary',
  defaultConfig: { initial_percentage: 5, increment: 10 },

  onAttach(node: any): void {
    node.__canaryState = { active: false, version: '', percentage: 0, started: 0 };
  },
  onDetach(node: any): void { delete node.__canaryState; },
  onUpdate(): void {},

  onEvent(node: any, config: CanaryConfig, context: any, event: any): void {
    const state = node.__canaryState as { active: boolean; version: string; percentage: number; started: number } | undefined;
    if (!state) return;
    const t = typeof event === 'string' ? event : event.type;

    switch (t) {
      case 'canary:start':
        state.active = true;
        state.version = (event.version as string) ?? '';
        state.percentage = (event.percentage as number) ?? config.initial_percentage;
        state.started = Date.now();
        context.emit?.('canary:status', { ...state });
        break;
      case 'canary:adjust':
        if (state.active) {
          state.percentage = Math.min(100, (event.percentage as number) ?? state.percentage + config.increment);
          context.emit?.('canary:status', { ...state });
        }
        break;
      case 'canary:promote':
        state.percentage = 100;
        state.active = false;
        context.emit?.('canary:status', { ...state, promoted: true });
        break;
      case 'canary:abort':
        state.active = false;
        state.percentage = 0;
        context.emit?.('canary:status', { ...state, aborted: true });
        break;
      case 'canary:get_status':
        context.emit?.('canary:status', { ...state });
        break;
    }
  },
};

export default canaryHandler;
