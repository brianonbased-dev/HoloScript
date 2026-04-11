/**
 * @connectome Trait — Brain connectivity mapping
 * @trait connectome
 */
import type { TraitHandler, HSPlusNode, TraitContext, TraitEvent } from './types';

export type VisualizationMode = 'graph' | 'matrix' | '3d_surface' | 'connectogram';
export interface ConnectomeEdge { source: string; target: string; weight: number; tractName?: string; }
export interface ConnectomeConfig { nodes: string[]; edges: ConnectomeEdge[]; visualizationMode: VisualizationMode; directed: boolean; }

const defaultConfig: ConnectomeConfig = { nodes: [], edges: [], visualizationMode: 'graph', directed: false };

export function createConnectomeHandler(): TraitHandler<ConnectomeConfig> {
  return {
    name: 'connectome',
    defaultConfig,
    onAttach(node: HSPlusNode, config: ConnectomeConfig, ctx: TraitContext) {
      const n = config.nodes.length;
      const matrix = Array.from({ length: n }, () => new Array(n).fill(0));
      for (const edge of config.edges) {
        const i = config.nodes.indexOf(edge.source);
        const j = config.nodes.indexOf(edge.target);
        if (i >= 0 && j >= 0) { matrix[i][j] = edge.weight; if (!config.directed) matrix[j][i] = edge.weight; }
      }
      node.__connectomeState = { adjacencyMatrix: matrix, nodeCount: n, edgeCount: config.edges.length };
      ctx.emit?.('connectome:attached', { nodes: n, edges: config.edges.length });
    },
    onDetach(node: HSPlusNode, _c: ConnectomeConfig, ctx: TraitContext) { delete node.__connectomeState; ctx.emit?.('connectome:detached'); },
    onUpdate() {},
    onEvent(_n: HSPlusNode, config: ConnectomeConfig, ctx: TraitContext, event: TraitEvent) {
      if (event.type === 'connectome:query_path') {
        const from = event.payload?.from as string;
        const to = event.payload?.to as string;
        ctx.emit?.('connectome:path_result', { from, to, connected: config.edges.some(e => e.source === from && e.target === to) });
      }
    },
  };
}
