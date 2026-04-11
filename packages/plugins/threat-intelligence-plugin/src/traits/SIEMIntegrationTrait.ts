import type { TraitHandler, HSPlusNode, TraitContext, TraitEvent } from './types';

export interface SIEMIntegrationConfig {
  connectorId: string;
  platform: 'splunk' | 'sentinel' | 'elastic' | 'custom';
  indexName: string;
  enabled: boolean;
}

export const siemIntegrationHandler: TraitHandler<SIEMIntegrationConfig> = {
  name: 'siem_integration',
  defaultConfig: {
    connectorId: '',
    platform: 'custom',
    indexName: 'threat-events',
    enabled: true,
  },
  onAttach(node: HSPlusNode, config: SIEMIntegrationConfig, ctx: TraitContext): void {
    ctx.emit?.('siem_integration:attached', {
      nodeId: node.id,
      connectorId: config.connectorId,
      platform: config.platform,
      indexName: config.indexName,
    });
  },
  onEvent(node: HSPlusNode, config: SIEMIntegrationConfig, ctx: TraitContext, event: TraitEvent): void {
    if (event.type === 'siem_integration:push') {
      ctx.emit?.('siem_integration:pushed', {
        nodeId: node.id,
        connectorId: config.connectorId,
        records: event.payload?.records ?? 0,
      });
    }
  },
};

export const SIEM_INTEGRATION_TRAIT = {
  name: 'siem_integration',
  category: 'threat-intelligence',
  description: 'Bridges alerts/events into SIEM platforms and pipelines.',
};
