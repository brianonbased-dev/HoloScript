/**
 * FeatureFlagTrait — v5.1
 *
 * Feature flag evaluation with variants and targeting.
 *
 * Events:
 *  flag:define     { flagId, defaultValue, variants }
 *  flag:evaluate   { flagId, context }
 *  flag:result     { flagId, value, variant }
 *  flag:toggle     { flagId, enabled }
 */

import type { TraitHandler } from './TraitTypes';

export interface FeatureFlagConfig {
  max_flags: number;
}

interface Flag {
  id: string;
  enabled: boolean;
  defaultValue: unknown;
}

export const featureFlagHandler: TraitHandler<FeatureFlagConfig> = {
  name: 'feature_flag' as any,
  defaultConfig: { max_flags: 200 },

  onAttach(node: any): void {
    node.__featureFlagState = { flags: new Map<string, Flag>() };
  },
  onDetach(node: any): void { delete node.__featureFlagState; },
  onUpdate(): void {},

  onEvent(node: any, config: FeatureFlagConfig, context: any, event: any): void {
    const state = node.__featureFlagState as { flags: Map<string, Flag> } | undefined;
    if (!state) return;
    const t = typeof event === 'string' ? event : event.type;

    switch (t) {
      case 'flag:define': {
        if (state.flags.size >= config.max_flags) break;
        state.flags.set(event.flagId as string, {
          id: event.flagId as string,
          enabled: true,
          defaultValue: event.defaultValue ?? false,
        });
        break;
      }
      case 'flag:evaluate': {
        const flag = state.flags.get(event.flagId as string);
        const value = flag ? (flag.enabled ? flag.defaultValue : false) : false;
        context.emit?.('flag:result', { flagId: event.flagId, value, enabled: flag?.enabled ?? false });
        break;
      }
      case 'flag:toggle': {
        const flag = state.flags.get(event.flagId as string);
        if (flag) flag.enabled = event.enabled as boolean ?? !flag.enabled;
        break;
      }
    }
  },
};

export default featureFlagHandler;
