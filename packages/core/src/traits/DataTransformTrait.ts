/**
 * DataTransformTrait — v5.1
 * Data transformation / mapping.
 */
import type { TraitHandler, HSPlusNode, TraitContext, TraitEvent } from './TraitTypes';
export interface DataTransformConfig {
  strict: boolean;
}
export const dataTransformHandler: TraitHandler<DataTransformConfig> = {
  name: 'data_transform',
  defaultConfig: { strict: false },
  onAttach(node: HSPlusNode): void {
    node.__dtState = { transforms: 0 };
  },
  onDetach(node: HSPlusNode): void {
    delete node.__dtState;
  },
  onUpdate(): void {},
  onEvent(
    node: HSPlusNode,
    _config: DataTransformConfig,
    context: TraitContext,
    event: TraitEvent
  ): void {
    const state = node.__dtState as { transforms: number } | undefined;
    if (!state) return;
    if ((typeof event === 'string' ? event : event.type) === 'transform:apply') {
      state.transforms++;
      context.emit?.('transform:applied', { mapping: event.mapping, count: state.transforms });
    }
  },
};
export default dataTransformHandler;
