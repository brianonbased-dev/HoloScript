/**
 * AiCameraTrait — v5.1
 * AI-driven camera director.
 */
import type { TraitHandler, TraitContext, TraitEvent } from './TraitTypes';
import type { HSPlusNode } from '../types/HoloScriptPlus';
export interface AiCameraConfig { tracking_speed: number; }
export const aiCameraHandler: TraitHandler<AiCameraConfig> = {
  name: 'ai_camera', defaultConfig: { tracking_speed: 1.0 },
  onAttach(node: HSPlusNode): void { node.__camState = { mode: 'static', target: null as string | null, shots: 0 }; },
  onDetach(node: HSPlusNode): void { delete node.__camState; },
  onUpdate(): void {},
  onEvent(node: HSPlusNode, config: AiCameraConfig, context: TraitContext, event: TraitEvent): void {
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
