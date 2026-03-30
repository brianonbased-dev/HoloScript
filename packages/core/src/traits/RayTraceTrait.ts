/**
 * RayTraceTrait — v5.1
 * Ray-tracing integration.
 */
import type { TraitHandler, TraitContext, TraitEvent } from './TraitTypes';
import type { HSPlusNode } from '../types/HoloScriptPlus';
export interface RayTraceConfig {
  max_bounces: number;
  samples_per_pixel: number;
}
export const rayTraceHandler: TraitHandler<RayTraceConfig> = {
  name: 'ray_trace',
  defaultConfig: { max_bounces: 4, samples_per_pixel: 1 },
  onAttach(node: HSPlusNode): void {
    node.__rtState = { rays_cast: 0, hits: 0 };
  },
  onDetach(node: HSPlusNode): void {
    delete node.__rtState;
  },
  onUpdate(): void {},
  onEvent(
    node: HSPlusNode,
    config: RayTraceConfig,
    context: TraitContext,
    event: TraitEvent
  ): void {
    const state = node.__rtState as { rays_cast: number; hits: number } | undefined;
    if (!state) return;
    const t = typeof event === 'string' ? event : event.type;
    switch (t) {
      case 'rt:cast':
        state.rays_cast++;
        context.emit?.('rt:result', {
          origin: event.origin,
          direction: event.direction,
          maxBounces: config.max_bounces,
          raysCast: state.rays_cast,
        });
        break;
      case 'rt:hit':
        state.hits++;
        context.emit?.('rt:hit_result', {
          hitPoint: event.hitPoint,
          normal: event.normal,
          distance: event.distance,
          totalHits: state.hits,
        });
        break;
    }
  },
};
export default rayTraceHandler;
