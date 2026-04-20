/**
 * Hologram Media MCP tools — single-image/GIF/video -> 3D hologram pipeline.
 *
 * This surface intentionally targets the Hologram Media Pipeline in
 * `@holoscript/engine/hologram` (DepthEstimation/Quilt/MV-HEVC), not HoloMap.
 */

import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import {
  MVHEVCCompiler,
  QuiltCompiler,
  type MVHEVCConfig,
  type QuiltConfig,
} from '@holoscript/engine/hologram';

type HologramMediaType = 'image' | 'gif' | 'video';

type HoloProperty = { key: string; value: unknown };
type HoloTrait = { name: string; config?: Record<string, unknown> };
type HoloObjectDecl = { traits?: HoloTrait[]; properties: HoloProperty[] };
type HoloComposition = { name?: string; objects: HoloObjectDecl[] };

export const hologramToolDefinitions: Tool[] = [
  {
    name: 'holo_hologram_from_media',
    description:
      'Generate a HoloScript hologram composition from a single image, GIF, or video source. Returns .holo code and trait summary.',
    inputSchema: {
      type: 'object',
      properties: {
        mediaType: {
          type: 'string',
          enum: ['image', 'gif', 'video'],
          description: 'Input media kind.',
        },
        source: {
          type: 'string',
          description: 'Media source path or URL (e.g. media/photo.jpg).',
        },
        name: {
          type: 'string',
          description: 'Optional object name override.',
        },
        depthScale: {
          type: 'number',
          description: 'Displacement depth scale override.',
        },
        segments: {
          type: 'number',
          description: 'Displacement subdivision segments override.',
        },
      },
      required: ['mediaType', 'source'],
    },
  },
  {
    name: 'holo_hologram_compile_quilt',
    description:
      'Compile a hologram composition to Looking Glass quilt metadata and renderer code.',
    inputSchema: {
      type: 'object',
      properties: {
        mediaType: {
          type: 'string',
          enum: ['image', 'gif', 'video'],
        },
        source: { type: 'string' },
        name: { type: 'string' },
        quiltConfig: {
          type: 'object',
          description: 'Optional QuiltConfig overrides (views, columns, rows, resolution, baseline, device, focusDistance).',
        },
      },
      required: ['mediaType', 'source'],
    },
  },
  {
    name: 'holo_hologram_compile_mvhevc',
    description:
      'Compile a hologram composition to MV-HEVC (Vision Pro) stereo metadata, Swift scaffold, and mux command.',
    inputSchema: {
      type: 'object',
      properties: {
        mediaType: {
          type: 'string',
          enum: ['image', 'gif', 'video'],
        },
        source: { type: 'string' },
        name: { type: 'string' },
        mvhevcConfig: {
          type: 'object',
          description: 'Optional MVHEVCConfig overrides (ipd, resolution, fps, convergenceDistance, fovDegrees, quality, container, disparityScale).',
        },
      },
      required: ['mediaType', 'source'],
    },
  },
];

const HOLOGRAM_NAMES = new Set(hologramToolDefinitions.map((t) => t.name));

export function isHologramToolName(name: string): boolean {
  return HOLOGRAM_NAMES.has(name);
}

function assertMediaType(value: unknown): HologramMediaType {
  const s = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (s === 'image' || s === 'gif' || s === 'video') return s;
  throw new Error('hologram: mediaType must be one of image|gif|video');
}

function getMediaTraits(mediaType: HologramMediaType, source: string): HoloTrait[] {
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

function buildComposition(mediaType: HologramMediaType, source: string, name?: string): HoloComposition {
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

function toHoloCode(mediaType: HologramMediaType, source: string, name?: string): string {
  const objectName = (name && name.trim()) || 'HologramMedia';
  const header = `composition "Hologram - ${objectName}" {`;
  const base = [
    '  environment {',
    '    skybox: "night"',
    '    ambient_light: 0.2',
    '  }',
    '',
    `  object "${objectName}" {`,
  ];

  const body =
    mediaType === 'image'
      ? [
          `    @image src:"${source}"`,
          '    @depth_estimation { model: "depth-anything-v2-small", backend: "webgpu" }',
          '    @displacement { scale: 0.3, segments: 128 }',
          '    @depth_to_normal',
          '    geometry: "plane"',
          '    position: [0, 1.5, -3]',
          '    scale: [2, 1.5, 1]',
        ]
      : mediaType === 'gif'
        ? [
            `    @animated_texture { src: "${source}", fps: 24, max_frames: 500 }`,
            '    @segment { model: "rembg", remove_background: true }',
            '    @depth_estimation { model: "depth-anything-v2-small", backend: "webgpu", temporal_smoothing: 0.8 }',
            '    @holographic_sprite { depth_scale: 0.5, render_mode: "displacement" }',
            '    @billboard { mode: "camera-facing" }',
            '    position: [0, 1.5, -2]',
            '    scale: [2, 2, 1]',
          ]
        : [
            `    @video { src: "${source}", autoplay: true, loop: true, muted: true }`,
            '    @depth_estimation { model: "depth-anything-v2-small", backend: "webgpu", temporal_smoothing: 0.8 }',
            '    @displacement { scale: 0.25, segments: 64 }',
            '    geometry: "plane"',
            '    position: [0, 1.5, -3]',
            '    scale: [3, 1.7, 1]',
          ];

  return [header, ...base, ...body, '  }', '}'].join('\n');
}

export async function handleHologramTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  const mediaType = assertMediaType(args.mediaType);
  const source = typeof args.source === 'string' ? args.source.trim() : '';
  if (!source) throw new Error('hologram: source is required');
  const objectName = typeof args.name === 'string' ? args.name : undefined;

  const composition = buildComposition(mediaType, source, objectName);

  switch (name) {
    case 'holo_hologram_from_media': {
      return {
        ok: true,
        mediaType,
        source,
        holoCode: toHoloCode(mediaType, source, objectName),
        traits: composition.objects[0]?.traits?.map((t) => t.name) ?? [],
      };
    }

    case 'holo_hologram_compile_quilt': {
      const compiler = new QuiltCompiler();
      const quiltConfig = (args.quiltConfig ?? undefined) as Partial<QuiltConfig> | undefined;
      const result = compiler.compileQuilt(composition, quiltConfig);
      return { ok: true, mediaType, source, quilt: result };
    }

    case 'holo_hologram_compile_mvhevc': {
      const compiler = new MVHEVCCompiler();
      const mvhevcConfig = (args.mvhevcConfig ?? undefined) as Partial<MVHEVCConfig> | undefined;
      const result = compiler.compileMVHEVC(composition, mvhevcConfig);
      return { ok: true, mediaType, source, mvhevc: result };
    }

    default:
      return undefined;
  }
}
