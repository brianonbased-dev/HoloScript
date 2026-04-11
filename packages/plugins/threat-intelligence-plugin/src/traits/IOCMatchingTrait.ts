import type { TraitHandler, HSPlusNode, TraitContext, TraitEvent, ThreatSeverity } from './types';

export interface IOCMatchingConfig {
  profileId: string;
  minConfidence: number;
  severity: ThreatSeverity;
  indicators: string[];
}

const matchStore = new Map<string, number>();

export const iocMatchingHandler: TraitHandler<IOCMatchingConfig> = {
  name: 'ioc_matching',
  defaultConfig: {
    profileId: '',
    minConfidence: 70,
    severity: 'medium',
    indicators: [],
  },
  onAttach(node: HSPlusNode, _config: IOCMatchingConfig, _ctx: TraitContext): void {
    matchStore.set(node.id ?? 'unknown', 0);
  },
  onEvent(node: HSPlusNode, config: IOCMatchingConfig, ctx: TraitContext, event: TraitEvent): void {
    const id = node.id ?? 'unknown';
    if (event.type === 'ioc_matching:scan_complete') {
      const matches = Number(event.payload?.matches ?? 0);
      matchStore.set(id, matches);
      ctx.emit?.('ioc_matching:matches', {
        nodeId: id,
        profileId: config.profileId,
        matches,
        minConfidence: config.minConfidence,
      });
    }
  },
};

export const IOC_MATCHING_TRAIT = {
  name: 'ioc_matching',
  category: 'threat-intelligence',
  description: 'Matches indicators of compromise across telemetry and logs.',
};
