import type { TraitHandler, HSPlusNode, TraitContext, TraitEvent } from './types';

export interface ConnectomeEdge { from: string; to: string; weight: number }
export interface ConnectomeConfig { graphId: string; nodes: string[]; edges: ConnectomeEdge[]; directed: boolean }

export const connectomeHandler: TraitHandler<ConnectomeConfig> = {
  name: 'connectome',
  defaultConfig: { graphId: '', nodes: [], edges: [], directed: false },
  onAttach(node: HSPlusNode, config: ConnectomeConfig, ctx: TraitContext): void {
    ctx.emit?.('connectome:attached', { nodeId: node.id, graphId: config.graphId, nodeCount: config.nodes.length, edgeCount: config.edges.length });
  },
  onEvent(node: HSPlusNode, config: ConnectomeConfig, ctx: TraitContext, event: TraitEvent): void {
    if (event.type === 'connectome:add_edge') {
      const from = String(event.payload?.from ?? '');
      const to = String(event.payload?.to ?? '');
      const weight = Number(event.payload?.weight ?? 0);
      if (from && to) {
        config.edges.push({ from, to, weight });
        ctx.emit?.('connectome:edge_added', { nodeId: node.id, graphId: config.graphId, from, to, weight });
      }
    }
  },
};

export const CONNECTOME_TRAIT = {
  name: 'connectome',
  category: 'neuroscience',
  description: 'Tracks network connectivity edges between brain regions.',
};
