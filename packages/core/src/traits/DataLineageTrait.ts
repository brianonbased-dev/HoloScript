/**
 * DataLineageTrait — v5.1
 * Data origin and transformation lineage.
 */
import type { TraitHandler, HSPlusNode, TraitContext, TraitEvent } from './TraitTypes';
export interface DataLineageConfig {
  max_depth: number;
}
export const dataLineageHandler: TraitHandler<DataLineageConfig> = {
  name: 'data_lineage',
  defaultConfig: { max_depth: 50 },
  onAttach(node: HSPlusNode): void {
    node.__lineageState = { graph: new Map<string, { source: string; transforms: string[] }>() };
  },
  onDetach(node: HSPlusNode): void {
    delete node.__lineageState;
  },
  onUpdate(): void {},
  onEvent(
    node: HSPlusNode,
    _config: DataLineageConfig,
    context: TraitContext,
    event: TraitEvent
  ): void {
    const state = node.__lineageState as
      | { graph: Map<string, { source: string; transforms: string[] }> }
      | undefined;
    if (!state) return;
    const t = typeof event === 'string' ? event : event.type;
    switch (t) {
      case 'lineage:register':
        state.graph.set(event.datasetId as string, {
          source: (event.source as string) ?? 'unknown',
          transforms: [],
        });
        context.emit?.('lineage:registered', { datasetId: event.datasetId });
        break;
      case 'lineage:transform': {
        const entry = state.graph.get(event.datasetId as string);
        if (entry) {
          entry.transforms.push(event.transform as string);
          context.emit?.('lineage:updated', {
            datasetId: event.datasetId,
            depth: entry.transforms.length,
          });
        }
        break;
      }
      case 'lineage:trace': {
        const entry = state.graph.get(event.datasetId as string);
        context.emit?.('lineage:traced', {
          datasetId: event.datasetId,
          source: entry?.source,
          transforms: entry?.transforms ?? [],
          exists: !!entry,
        });
        break;
      }
    }
  },
};
export default dataLineageHandler;
