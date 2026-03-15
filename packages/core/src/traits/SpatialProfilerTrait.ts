/**
 * SpatialProfilerTrait — v5.1
 * Spatial performance profiler.
 */
import type { TraitHandler } from './TraitTypes';
export interface SpatialProfilerConfig { sample_rate_ms: number; }
export const spatialProfilerHandler: TraitHandler<SpatialProfilerConfig> = {
  name: 'spatial_profiler' as any, defaultConfig: { sample_rate_ms: 16 },
  onAttach(node: any): void { node.__profState = { samples: [] as Array<{ ts: number; fps: number; drawCalls: number }>, recording: false }; },
  onDetach(node: any): void { delete node.__profState; },
  onUpdate(): void {},
  onEvent(node: any, _config: SpatialProfilerConfig, context: any, event: any): void {
    const state = node.__profState as { samples: any[]; recording: boolean } | undefined;
    if (!state) return;
    const t = typeof event === 'string' ? event : event.type;
    switch (t) {
      case 'prof:start': state.recording = true; state.samples = []; context.emit?.('prof:started', {}); break;
      case 'prof:sample': if (state.recording) { state.samples.push({ ts: Date.now(), fps: (event.fps as number) ?? 0, drawCalls: (event.drawCalls as number) ?? 0 }); context.emit?.('prof:sampled', { sampleCount: state.samples.length }); } break;
      case 'prof:stop': state.recording = false; context.emit?.('prof:report', { samples: state.samples.length, avgFps: state.samples.length ? state.samples.reduce((s: number, x: any) => s + x.fps, 0) / state.samples.length : 0 }); break;
    }
  },
};
export default spatialProfilerHandler;
