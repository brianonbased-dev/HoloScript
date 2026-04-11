/** @runway_choreography Trait — Fashion show runway planning. @trait runway_choreography */
import type { TraitHandler, HSPlusNode, TraitContext, TraitEvent } from './types';

export interface RunwaySegment { modelId: string; garmentIds: string[]; walkDurationS: number; pauseAtEndS: number; music: string; lightingCue: string; }
export interface RunwayChoreographyConfig { segments: RunwaySegment[]; runwayLengthM: number; totalDurationS: number; musicPlaylist: string[]; }
export interface RunwayChoreographyState { currentSegment: number; isRunning: boolean; elapsedS: number; }

const defaultConfig: RunwayChoreographyConfig = { segments: [], runwayLengthM: 20, totalDurationS: 600, musicPlaylist: [] };

export function createRunwayChoreographyHandler(): TraitHandler<RunwayChoreographyConfig> {
  return { name: 'runway_choreography', defaultConfig,
    onAttach(n: HSPlusNode, c: RunwayChoreographyConfig, ctx: TraitContext) { n.__runwayState = { currentSegment: 0, isRunning: false, elapsedS: 0 }; ctx.emit?.('runway:ready', { segments: c.segments.length }); },
    onDetach(n: HSPlusNode, _c: RunwayChoreographyConfig, ctx: TraitContext) { delete n.__runwayState; ctx.emit?.('runway:ended'); },
    onUpdate(n: HSPlusNode, c: RunwayChoreographyConfig, ctx: TraitContext, delta: number) {
      const s = n.__runwayState as RunwayChoreographyState | undefined; if (!s?.isRunning) return;
      s.elapsedS += delta / 1000;
      const seg = c.segments[s.currentSegment];
      if (seg && s.elapsedS >= seg.walkDurationS + seg.pauseAtEndS) { s.currentSegment++; s.elapsedS = 0;
        if (s.currentSegment >= c.segments.length) { s.isRunning = false; ctx.emit?.('runway:show_complete'); }
        else ctx.emit?.('runway:next_model', { segment: s.currentSegment, model: c.segments[s.currentSegment]?.modelId });
      }
    },
    onEvent(n: HSPlusNode, _c: RunwayChoreographyConfig, ctx: TraitContext, e: TraitEvent) {
      const s = n.__runwayState as RunwayChoreographyState | undefined; if (!s) return;
      if (e.type === 'runway:start') { s.isRunning = true; s.currentSegment = 0; s.elapsedS = 0; ctx.emit?.('runway:started'); }
    },
  };
}
