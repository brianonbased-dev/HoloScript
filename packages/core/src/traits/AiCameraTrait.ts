/**
 * AiCameraTrait — v5.1
 * AI-driven camera director.
 */
import type { TraitHandler } from './TraitTypes';
export interface AiCameraConfig { tracking_speed: number; }
export const aiCameraHandler: TraitHandler<AiCameraConfig> = {
  name: 'ai_camera' as any, defaultConfig: { tracking_speed: 1.0 },
  onAttach(node: any): void { node.__camState = { mode: 'static', target: null as string | null, shots: 0 }; },
  onDetach(node: any): void { delete node.__camState; },
  onUpdate(): void {},
  onEvent(node: any, config: AiCameraConfig, context: any, event: any): void {
    const state = node.__camState as { mode: string; target: string | null; shots: number } | undefined;
    if (!state) return;
    const t = typeof event === 'string' ? event : event.type;
    switch (t) {
      case 'cam:track': state.mode = 'tracking'; state.target = event.targetId as string; context.emit?.('cam:tracking', { target: state.target, speed: config.tracking_speed }); break;
      case 'cam:frame': state.shots++; context.emit?.('cam:framed', { composition: event.composition, shotCount: state.shots }); break;
      case 'cam:auto': state.mode = 'auto'; context.emit?.('cam:auto_mode', { mode: 'auto' }); break;
    }
  },
};
export default aiCameraHandler;
