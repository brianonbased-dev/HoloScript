import type { TraitHandler, HSPlusNode, TraitContext, TraitEvent, ThreatSeverity } from './types';

export interface AttackGraphConfig {
  graphId: string;
  nodeCount: number;
  edgeCount: number;
  severity: ThreatSeverity;
  campaignId?: string;
}

const riskScores = new Map<string, number>();

export const attackGraphHandler: TraitHandler<AttackGraphConfig> = {
  name: 'attack_graph',
  defaultConfig: {
    graphId: '',
    nodeCount: 0,
    edgeCount: 0,
    severity: 'medium',
  },
  onAttach(node: HSPlusNode, config: AttackGraphConfig, ctx: TraitContext): void {
    const id = node.id ?? config.graphId ?? 'unknown';
    riskScores.set(id, 0);
    ctx.emit?.('attack_graph:attached', { nodeId: id, graphId: config.graphId });
  },
  onEvent(node: HSPlusNode, config: AttackGraphConfig, ctx: TraitContext, event: TraitEvent): void {
    const id = node.id ?? config.graphId ?? 'unknown';
    if (event.type === 'attack_graph:update') {
      const payload = event.payload;
      if (!payload || typeof payload !== 'object') return;

      const score = Number(payload.riskScore ?? 0);
      riskScores.set(id, score);
      
      ctx.emit?.('attack_graph:updated', {
        nodeId: id,
        graphId: config.graphId,
        riskScore: score,
        nodes: config.nodeCount,
        edges: config.edgeCount,
      });
    }
  },
};

export const ATTACK_GRAPH_TRAIT = {
  name: 'attack_graph',
  category: 'threat-intelligence',
  description: 'Represents adversary paths and risk propagation as attack graphs.',
};
