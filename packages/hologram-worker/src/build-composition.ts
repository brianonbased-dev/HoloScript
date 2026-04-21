/**
 * Minimal Holo composition builder for QuiltCompiler / MVHEVCCompiler (mirrors MCP helper).
 */

export type HoloMediaType = 'image' | 'gif' | 'video';

type HoloTrait = { name: string; config?: Record<string, unknown> };
type HoloObjectDecl = { traits?: HoloTrait[]; properties: Array<{ key: string; value: unknown }> };
export type HoloComposition = { name?: string; objects: HoloObjectDecl[] };

function getMediaTraits(mediaType: HoloMediaType, source: string): HoloTrait[] {
  if (mediaType === 'image') {
    return [
      { name: 'image', config: { src: source } },
      { name: 'depth_estimation', config: { model: 'depth-anything-v2-small', backend: 'webgpu' } },
      { name: 'displacement', config: { scale: 0.3, segments: 128 } },
      { name: 'depth_to_normal' },
    ];
  }
  if (mediaType === 'gif') {
    return [
      { name: 'animated_texture', config: { src: source, fps: 24, max_frames: 500 } },
      { name: 'segment', config: { model: 'rembg', remove_background: true } },
      {
        name: 'depth_estimation',
        config: { model: 'depth-anything-v2-small', backend: 'webgpu', temporal_smoothing: 0.8 },
      },
      { name: 'holographic_sprite', config: { depth_scale: 0.5, render_mode: 'displacement' } },
      { name: 'billboard', config: { mode: 'camera-facing' } },
    ];
  }
  return [
    { name: 'video', config: { src: source, autoplay: true, loop: true, muted: true } },
    {
      name: 'depth_estimation',
      config: { model: 'depth-anything-v2-small', backend: 'webgpu', temporal_smoothing: 0.8 },
    },
    { name: 'displacement', config: { scale: 0.25, segments: 64 } },
  ];
}

export function buildComposition(mediaType: HoloMediaType, source: string, name?: string): HoloComposition {
  const objectName = (name && name.trim()) || 'HologramMedia';
  const traits = getMediaTraits(mediaType, source);
  return {
    name: `Hologram - ${objectName}`,
    objects: [
      {
        traits,
        properties: [
          { key: 'geometry', value: 'plane' },
          { key: 'position', value: [0, 1.5, -3] },
          { key: 'scale', value: mediaType === 'video' ? [3, 1.7, 1] : [2, 1.5, 1] },
          { key: 'color', value: '#ffffff' },
        ],
      },
    ],
  };
}
