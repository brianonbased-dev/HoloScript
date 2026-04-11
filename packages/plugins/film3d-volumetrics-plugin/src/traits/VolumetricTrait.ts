/** @volumetric Trait — Volumetric video capture and playback. @trait volumetric */
import type { TraitHandler, HSPlusNode, TraitContext, TraitEvent } from './types';

export type VolumetricFormat = 'point_cloud' | 'voxel' | 'mesh_sequence' | 'depth_map' | 'holographic';
export interface VolumetricConfig { format: VolumetricFormat; resolution: number; frameRate: number; compressionLevel: number; streamingEnabled: boolean; boundingBoxM: [number, number, number]; colorDepth: 8 | 10 | 12; }

const defaultConfig: VolumetricConfig = { format: 'point_cloud', resolution: 1024, frameRate: 30, compressionLevel: 5, streamingEnabled: false, boundingBoxM: [2, 2, 2], colorDepth: 8 };

export function createVolumetricHandler(): TraitHandler<VolumetricConfig> {
  return { name: 'volumetric', defaultConfig,
    onAttach(n: HSPlusNode, c: VolumetricConfig, ctx: TraitContext) { n.__volState = { isPlaying: false, currentFrame: 0, totalFrames: 0, loadedPercent: 0 }; ctx.emit?.('volumetric:loaded', { format: c.format, resolution: c.resolution }); },
    onDetach(n: HSPlusNode, _c: VolumetricConfig, ctx: TraitContext) { delete n.__volState; ctx.emit?.('volumetric:unloaded'); },
    onUpdate(n: HSPlusNode, c: VolumetricConfig, ctx: TraitContext, delta: number) {
      const s = n.__volState as Record<string, unknown> | undefined; if (!s || !s.isPlaying) return;
      (s.currentFrame as number) += c.frameRate * (delta / 1000);
      if ((s.currentFrame as number) >= (s.totalFrames as number)) { s.currentFrame = 0; ctx.emit?.('volumetric:loop'); }
    },
    onEvent(n: HSPlusNode, _c: VolumetricConfig, ctx: TraitContext, e: TraitEvent) {
      const s = n.__volState as Record<string, unknown> | undefined; if (!s) return;
      if (e.type === 'volumetric:play') { s.isPlaying = true; ctx.emit?.('volumetric:playing'); }
      if (e.type === 'volumetric:pause') { s.isPlaying = false; ctx.emit?.('volumetric:paused'); }
    },
  };
}
