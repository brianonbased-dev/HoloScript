import type { TraitHandler, HSPlusNode, TraitContext, TraitEvent, ThreatSeverity } from './types';

export interface ThreatFeedConfig {
  sourceId: string;
  provider: string;
  pollingIntervalSec: number;
  severityThreshold: ThreatSeverity;
  enabled: boolean;
}

export const threatFeedHandler: TraitHandler<ThreatFeedConfig> = {
  name: 'threat_feed',
  defaultConfig: {
    sourceId: '',
    provider: 'internal',
    pollingIntervalSec: 300,
    severityThreshold: 'medium',
    enabled: true,
  },
  onAttach(node: HSPlusNode, config: ThreatFeedConfig, ctx: TraitContext): void {
    ctx.emit?.('threat_feed:attached', { nodeId: node.id, sourceId: config.sourceId, provider: config.provider });
  },
  onEvent(node: HSPlusNode, config: ThreatFeedConfig, ctx: TraitContext, event: TraitEvent): void {
    if (event.type === 'threat_feed:ingest') {
      ctx.emit?.('threat_feed:ingested', { nodeId: node.id, sourceId: config.sourceId, count: event.payload?.count ?? 0 });
    }
  },
};

export const THREAT_FEED_TRAIT = {
  name: 'threat_feed',
  category: 'threat-intelligence',
  description: 'Ingests and normalizes threat feed entries from providers.',
};
