/**
 * CinematicSeqTrait — v5.1
 * Cinematic sequencing / timeline.
 */
import type { TraitHandler, TraitContext, TraitEvent } from './TraitTypes';
import type { HSPlusNode } from '../types/HoloScriptPlus';
export interface CinematicSeqConfig { fps: number; }
export const cinematicSeqHandler: TraitHandler<CinematicSeqConfig> = {
  name: 'cinematic_seq', defaultConfig: { fps: 24 },
  onAttach(node: HSPlusNode): void { node.__cinState = { clips: [] as Array<{ name: string; startFrame: number; endFrame: number }>, currentFrame: 0, playing: false }; },
  onDetach(node: HSPlusNode): void { delete node.__cinState; },
  onUpdate(): void {},
  onEvent(node: HSPlusNode, _config: CinematicSeqConfig, context: TraitContext, event: TraitEvent): void {
    const state = node.__cinState as { clips: any[]; currentFrame: number; playing: boolean } | undefined;
    if (!state) return;
    const t = typeof event === 'string' ? event : event.type;
    switch (t) {
      case 'cin:add_clip': state.clips.push({ name: event.clipName as string, startFrame: (event.startFrame as number) ?? 0, endFrame: (event.endFrame as number) ?? 0 }); context.emit?.('cin:clip_added', { clipName: event.clipName, total: state.clips.length }); break;
      case 'cin:play': state.playing = true; context.emit?.('cin:playing', { frame: state.currentFrame }); break;
      case 'cin:seek': state.currentFrame = (event.frame as number) ?? 0; context.emit?.('cin:seeked', { frame: state.currentFrame }); break;
      case 'cin:stop': state.playing = false; context.emit?.('cin:stopped', { frame: state.currentFrame }); break;
    }
  },
};
export default cinematicSeqHandler;
