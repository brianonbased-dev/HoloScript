/**
 * SpatialProfilerTrait — v5.1
 * Spatial performance profiler.
 */
import type { TraitHandler, TraitContext, TraitEvent } from './TraitTypes';
import type { HSPlusNode } from '../types/HoloScriptPlus';
export interface SpatialProfilerConfig {
  sample_rate_ms: number;
}
export const spatialProfilerHandler: TraitHandler<SpatialProfilerConfig> = {
  name: 'spatial_profiler',
  defaultConfig: { sample_rate_ms: 16 },
  onAttach(node: HSPlusNode): void {
    node.__profState = {
      samples: [] as Array<{ ts: number; fps: number; drawCalls: number }>,
      recording: false,
    };
  },
  onDetach(node: HSPlusNode): void {
    delete node.__profState;
  },
  onUpdate(): void {},
  onEvent(
    node: HSPlusNode,
    _config: SpatialProfilerConfig,
    context: TraitContext,
    event: TraitEvent
  ): void {
    const state = node.__profState as { samples: unknown[]; recording: boolean } | undefined;
    if (!state) return;
    const t = typeof event === 'string' ? event : event.type;
    switch (t) {
      case 'prof:start':
        state.recording = true;
        state.samples = [];
        context.emit?.('prof:started', {});
        break;
      case 'prof:sample':
        if (state.recording) {
          state.samples.push({
            ts: Date.now(),
            fps: (event.fps as number) ?? 0,
            drawCalls: (event.drawCalls as number) ?? 0,
          });
          context.emit?.('prof:sampled', { sampleCount: state.samples.length });
        }
        break;
      case 'prof:stop':
        state.recording = false;
        context.emit?.('prof:report', {
          samples: state.samples.length,
          avgFps: state.samples.length
            // @ts-expect-error
            ? state.samples.reduce((s: number, x: unknown) => s + x.fps, 0) / state.samples.length
            : 0,
        });
        break;
    }
  },
};
export default spatialProfilerHandler;
