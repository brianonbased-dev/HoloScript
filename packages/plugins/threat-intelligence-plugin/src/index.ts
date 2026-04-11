export { threatFeedHandler, THREAT_FEED_TRAIT } from './traits/ThreatFeedTrait';
export type { ThreatFeedConfig } from './traits/ThreatFeedTrait';

export { iocMatchingHandler, IOC_MATCHING_TRAIT } from './traits/IOCMatchingTrait';
export type { IOCMatchingConfig } from './traits/IOCMatchingTrait';

export { siemIntegrationHandler, SIEM_INTEGRATION_TRAIT } from './traits/SIEMIntegrationTrait';
export type { SIEMIntegrationConfig } from './traits/SIEMIntegrationTrait';

export { attackGraphHandler, ATTACK_GRAPH_TRAIT } from './traits/AttackGraphTrait';
export type { AttackGraphConfig } from './traits/AttackGraphTrait';

export type {
  HSPlusNode,
  TraitContext,
  TraitEvent,
  TraitHandler,
  ThreatSeverity,
} from './traits/types';

import { threatFeedHandler } from './traits/ThreatFeedTrait';
import { iocMatchingHandler } from './traits/IOCMatchingTrait';
import { siemIntegrationHandler } from './traits/SIEMIntegrationTrait';
import { attackGraphHandler } from './traits/AttackGraphTrait';
import type { TraitHandler } from './traits/types';

export const THREAT_INTELLIGENCE_TRAITS: TraitHandler<any>[] = [
  threatFeedHandler,
  iocMatchingHandler,
  siemIntegrationHandler,
  attackGraphHandler,
];

export function registerThreatIntelligencePlugin(runtime: unknown): void {
  const rt = runtime as { registerTrait?: (handler: TraitHandler<any>) => void };
  if (typeof rt.registerTrait !== 'function') {
    throw new Error('registerThreatIntelligencePlugin requires runtime.registerTrait(handler)');
  }
  for (const handler of THREAT_INTELLIGENCE_TRAITS) {
    rt.registerTrait(handler);
  }
}

export const THREAT_INTELLIGENCE_KEYWORDS = [
  { term: 'threat feed', traits: ['threat_feed'], spatialRole: 'feed' },
  { term: 'ioc', traits: ['ioc_matching'], spatialRole: 'indicator' },
  { term: 'siem', traits: ['siem_integration'], spatialRole: 'pipeline' },
  { term: 'attack graph', traits: ['attack_graph'], spatialRole: 'graph' },
  { term: 'threat intel', traits: ['threat_feed', 'ioc_matching', 'attack_graph'], spatialRole: 'analysis' },
];

export const VERSION = '1.0.0';
