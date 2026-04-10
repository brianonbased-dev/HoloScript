/**
 * EtlTrait — v5.1
 * Extract-Transform-Load pipeline orchestration.
 */
import type { TraitHandler, HSPlusNode, TraitContext, TraitEvent } from './TraitTypes';
export interface EtlConfig {
  max_batch_size: number;
}
export const etlHandler: TraitHandler<EtlConfig> = {
  name: 'etl',
  defaultConfig: { max_batch_size: 10000 },
  onAttach(node: HSPlusNode): void {
    node.__etlState = { pipelines: new Map<string, { phase: string; records: number }>() };
  },
  onDetach(node: HSPlusNode): void {
    delete node.__etlState;
  },
  onUpdate(): void {},
  onEvent(node: HSPlusNode, _config: EtlConfig, context: TraitContext, event: TraitEvent): void {
    const state = node.__etlState as { pipelines: Map<string, any> } | undefined;
    if (!state) return;
    const t = typeof event === 'string' ? event : event.type;
    switch (t) {
      case 'etl:extract':
        state.pipelines.set(event.pipelineId as string, {
          phase: 'extract',
          records: (event.records as number) ?? 0,
        });
        context.emit?.('etl:extracted', { pipelineId: event.pipelineId });
        break;
      case 'etl:transform': {
        const p = state.pipelines.get(event.pipelineId as string);
        if (p) p.phase = 'transform';
        context.emit?.('etl:transformed', { pipelineId: event.pipelineId });
        break;
      }
      case 'etl:load': {
        const p = state.pipelines.get(event.pipelineId as string);
        if (p) p.phase = 'loaded';
        context.emit?.('etl:loaded', { pipelineId: event.pipelineId, records: p?.records });
        break;
      }
    }
  },
};
export default etlHandler;
