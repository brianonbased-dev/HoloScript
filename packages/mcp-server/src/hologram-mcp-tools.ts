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
import { renderHologramBundle } from './hologram-renderer';
import { callHologramWorkerRender, isHologramWorkerConfigured } from './hologram-worker-client';
import { sendHologramTeamMessage } from './hologram-holomesh-send';

type HologramMediaType = 'image' | 'gif' | 'video';
type HologramTarget = 'quilt' | 'mvhevc' | 'parallax';

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
          description: 'Media path, file URL, or remote URL (optional if sourceUrl or sourceBase64 is set).',
        },
        sourceUrl: {
          type: 'string',
          description: 'Remote URL for media (optional alternative to source).',
        },
        sourceBase64: {
          type: 'string',
          description: 'Base64-encoded media bytes (optional alternative to source).',
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
      required: ['mediaType'],
    },
  },
  {
    name: 'holo_hologram_compile_quilt',
    description:
      'Compile a hologram composition to Looking Glass quilt metadata and renderer code. When HOLOGRAM_WORKER_URL is set, also runs worker render for quilt and returns share URLs.',
    inputSchema: {
      type: 'object',
      properties: {
        mediaType: {
          type: 'string',
          enum: ['image', 'gif', 'video'],
        },
        source: { type: 'string', description: 'Path or URL (optional if sourceUrl or sourceBase64).' },
        sourceUrl: { type: 'string' },
        sourceBase64: { type: 'string' },
        name: { type: 'string' },
        skipStudioUpload: {
          type: 'boolean',
          description: 'If true, worker skips Studio upload (local/testing).',
        },
        quiltConfig: {
          type: 'object',
          description:
            'Optional QuiltConfig overrides (views, columns, rows, resolution, baseline, device, focusDistance).',
        },
      },
      required: ['mediaType'],
    },
  },
  {
    name: 'holo_hologram_compile_mvhevc',
    description:
      'Compile a hologram composition to MV-HEVC (Vision Pro) stereo metadata, Swift scaffold, and mux command. When HOLOGRAM_WORKER_URL is set, also runs worker render for MV-HEVC and returns share URLs.',
    inputSchema: {
      type: 'object',
      properties: {
        mediaType: {
          type: 'string',
          enum: ['image', 'gif', 'video'],
        },
        source: { type: 'string', description: 'Path or URL (optional if sourceUrl or sourceBase64).' },
        sourceUrl: { type: 'string' },
        sourceBase64: { type: 'string' },
        name: { type: 'string' },
        skipStudioUpload: {
          type: 'boolean',
          description: 'If true, worker skips Studio upload (local/testing).',
        },
        mvhevcConfig: {
          type: 'object',
          description:
            'Optional MVHEVCConfig overrides (ipd, resolution, fps, convergenceDistance, fovDegrees, quality, container, disparityScale).',
        },
      },
      required: ['mediaType'],
    },
  },
  {
    name: 'holo_hologram_render',
    description:
      'Render a content-addressed hologram bundle with preview/quilt/stereo artifacts. When HOLOGRAM_WORKER_URL is set and includeBase64 is false, calls the hologram worker for hash and share URLs. Set includeBase64 true to render locally for byte payloads.',
    inputSchema: {
      type: 'object',
      properties: {
        mediaType: {
          type: 'string',
          enum: ['image', 'gif', 'video'],
        },
        source: { type: 'string', description: 'Path or URL (optional if sourceUrl or sourceBase64).' },
        sourceUrl: { type: 'string' },
        sourceBase64: { type: 'string' },
        name: { type: 'string' },
        targets: {
          type: 'array',
          items: { type: 'string', enum: ['quilt', 'mvhevc', 'parallax'] },
          description: 'Worker render targets (ignored for local-only render).',
        },
        skipStudioUpload: {
          type: 'boolean',
          description: 'If true, worker skips Studio upload (local/testing).',
        },
        quiltConfig: {
          type: 'object',
          description:
            'Optional QuiltConfig overrides (views, columns, rows, resolution, baseline, device, focusDistance).',
        },
        mvhevcConfig: {
          type: 'object',
          description:
            'Optional MVHEVCConfig overrides (ipd, resolution, fps, convergenceDistance, fovDegrees, quality, container, disparityScale).',
        },
        includeBase64: {
          type: 'boolean',
          description:
            'Include base64 payloads for PNG artifacts. Forces local Playwright render when true.',
        },
        durationSeconds: {
          type: 'number',
          description: 'Stereo preview video duration for local render. Defaults to 2 seconds.',
        },
      },
      required: ['mediaType'],
    },
  },
  {
    name: 'holo_hologram_send',
    description:
      'Post a hologram share link to a HoloMesh team room for a specific teammate. Validates recipient membership via HoloMesh API (HOLOMESH_API_KEY). Rate-limited per API key.',
    inputSchema: {
      type: 'object',
      properties: {
        hash: { type: 'string', description: 'Content hash from worker or local bundle.' },
        shareUrl: { type: 'string', description: 'Public share URL for the hologram asset.' },
        recipientAgentId: { type: 'string', description: 'Teammate agent id (must be on the team).' },
        teamId: {
          type: 'string',
          description: 'HoloMesh team id. Defaults to HOLOMESH_TEAM_ID when omitted.',
        },
        note: { type: 'string', description: 'Optional short note included in the message payload.' },
      },
      required: ['hash', 'shareUrl', 'recipientAgentId'],
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

function resolveCompositionSource(args: Record<string, unknown>, mediaType: HologramMediaType): string {
  const s = typeof args.source === 'string' ? args.source.trim() : '';
  const u = typeof args.sourceUrl === 'string' ? args.sourceUrl.trim() : '';
  const b64 = typeof args.sourceBase64 === 'string' ? args.sourceBase64.trim() : '';
  if (s) return s;
  if (u) return u;
  if (b64) {
    const mime =
      mediaType === 'image' ? 'image/png' : mediaType === 'gif' ? 'image/gif' : 'video/mp4';
    return `data:${mime};base64,${b64}`;
  }
  throw new Error('hologram: one of source, sourceUrl, or sourceBase64 is required');
}

async function buildWorkerMediaPayload(
  args: Record<string, unknown>,
  mediaType: HologramMediaType,
): Promise<{ sourceUrl?: string; sourceBase64?: string }> {
  const b64Field = typeof args.sourceBase64 === 'string' ? args.sourceBase64.trim() : '';
  if (b64Field) return { sourceBase64: b64Field };

  const u = typeof args.sourceUrl === 'string' ? args.sourceUrl.trim() : '';
  if (u) return { sourceUrl: u };

  const s = typeof args.source === 'string' ? args.source.trim() : '';
  if (!s) throw new Error('hologram: source media required for worker render');

  if (/^https?:\/\//i.test(s)) return { sourceUrl: s };

  if (/^data:/i.test(s)) {
    const m = /^data:[^;]+;base64,(.+)$/i.exec(s);
    if (m) return { sourceBase64: m[1] };
  }

  const { readFile } = await import('node:fs/promises');
  const { isAbsolute, resolve } = await import('node:path');
  const fullPath = isAbsolute(s) ? s : resolve(process.cwd(), s);
  const buf = await readFile(fullPath);
  return { sourceBase64: buf.toString('base64') };
}

function parseRenderTargets(args: Record<string, unknown>): HologramTarget[] {
  const raw = args.targets;
  const fallback: HologramTarget[] = ['quilt', 'mvhevc', 'parallax'];
  if (!Array.isArray(raw) || raw.length === 0) return fallback;
  const out: HologramTarget[] = [];
  for (const t of raw) {
    const s = String(t).toLowerCase();
    if (s === 'quilt' || s === 'mvhevc' || s === 'parallax') out.push(s);
  }
  return out.length ? out : fallback;
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

export function buildComposition(mediaType: HologramMediaType, source: string, name?: string): HoloComposition {
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

export function toHoloCode(mediaType: HologramMediaType, source: string, name?: string): string {
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
  if (name === 'holo_hologram_send') {
    const hash = typeof args.hash === 'string' ? args.hash.trim() : '';
    const shareUrl = typeof args.shareUrl === 'string' ? args.shareUrl.trim() : '';
    const recipientAgentId = typeof args.recipientAgentId === 'string' ? args.recipientAgentId.trim() : '';
    const teamIdRaw = typeof args.teamId === 'string' ? args.teamId.trim() : '';
    const teamId = teamIdRaw || process.env.HOLOMESH_TEAM_ID?.trim() || '';
    const note = typeof args.note === 'string' ? args.note : undefined;
    if (!hash || !shareUrl || !recipientAgentId) {
      throw new Error('hologram send: hash, shareUrl, and recipientAgentId are required');
    }
    if (!teamId) {
      throw new Error('hologram send: teamId is required (or set HOLOMESH_TEAM_ID)');
    }
    const apiKey = process.env.HOLOMESH_API_KEY?.trim() || '';
    const holomesh = await sendHologramTeamMessage({
      teamId,
      apiKey,
      hash,
      shareUrl,
      recipientAgentId,
      note,
    });
    return { ok: true, teamId, recipientAgentId, holomesh };
  }

  const mediaType = assertMediaType(args.mediaType);
  const compositionSource = resolveCompositionSource(args, mediaType);
  const objectName = typeof args.name === 'string' ? args.name : undefined;

  const composition = buildComposition(mediaType, compositionSource, objectName);
  const holoCode = toHoloCode(mediaType, compositionSource, objectName);

  switch (name) {
    case 'holo_hologram_from_media': {
      return {
        ok: true,
        mediaType,
        source: compositionSource,
        holoCode,
        traits: composition.objects[0]?.traits?.map((t) => t.name) ?? [],
      };
    }

    case 'holo_hologram_compile_quilt': {
      const compiler = new QuiltCompiler();
      const quiltConfig = (args.quiltConfig ?? undefined) as Partial<QuiltConfig> | undefined;
      const result = compiler.compileQuilt(composition, quiltConfig);
      const out: Record<string, unknown> = {
        ok: true,
        mediaType,
        source: compositionSource,
        quilt: result,
      };
      if (isHologramWorkerConfigured()) {
        try {
          const mediaPayload = await buildWorkerMediaPayload(args, mediaType);
          const wr = await callHologramWorkerRender({
            ...mediaPayload,
            mediaType,
            targets: ['quilt'],
            skipUpload: args.skipStudioUpload === true,
          });
          out.hash = wr.hash;
          out.shareUrl = wr.shareUrl;
          out.quiltUrl = wr.quiltUrl;
          out.mvhevcUrl = wr.mvhevcUrl;
        } catch (e) {
          out.workerError = e instanceof Error ? e.message : String(e);
        }
      }
      return out;
    }

    case 'holo_hologram_compile_mvhevc': {
      const compiler = new MVHEVCCompiler();
      const mvhevcConfig = (args.mvhevcConfig ?? undefined) as Partial<MVHEVCConfig> | undefined;
      const result = compiler.compileMVHEVC(composition, mvhevcConfig);
      const out: Record<string, unknown> = {
        ok: true,
        mediaType,
        source: compositionSource,
        mvhevc: result,
      };
      if (isHologramWorkerConfigured()) {
        try {
          const mediaPayload = await buildWorkerMediaPayload(args, mediaType);
          const wr = await callHologramWorkerRender({
            ...mediaPayload,
            mediaType,
            targets: ['mvhevc'],
            skipUpload: args.skipStudioUpload === true,
          });
          out.hash = wr.hash;
          out.shareUrl = wr.shareUrl;
          out.quiltUrl = wr.quiltUrl;
          out.mvhevcUrl = wr.mvhevcUrl;
        } catch (e) {
          out.workerError = e instanceof Error ? e.message : String(e);
        }
      }
      return out;
    }

    case 'holo_hologram_render': {
      const quiltCompiler = new QuiltCompiler();
      const mvhevcCompiler = new MVHEVCCompiler();
      const quiltConfig = (args.quiltConfig ?? undefined) as Partial<QuiltConfig> | undefined;
      const mvhevcConfig = (args.mvhevcConfig ?? undefined) as Partial<MVHEVCConfig> | undefined;

      const quilt = quiltCompiler.compileQuilt(composition, quiltConfig);
      const mvhevc = mvhevcCompiler.compileMVHEVC(composition, mvhevcConfig);

      const useWorker = isHologramWorkerConfigured() && args.includeBase64 !== true;
      if (useWorker) {
        const mediaPayload = await buildWorkerMediaPayload(args, mediaType);
        const workerResult = await callHologramWorkerRender({
          ...mediaPayload,
          mediaType,
          targets: parseRenderTargets(args),
          skipUpload: args.skipStudioUpload === true,
        });
        return {
          ok: true,
          mediaType,
          source: compositionSource,
          holoCode,
          quilt,
          mvhevc,
          worker: workerResult,
        };
      }

      const bundle = await renderHologramBundle({
        mediaType,
        source: compositionSource,
        name: objectName ?? 'HologramMedia',
        holoCode,
        quilt,
        mvhevc,
        includeBase64: args.includeBase64 === true,
        durationSeconds: typeof args.durationSeconds === 'number' ? args.durationSeconds : 2,
      });

      return {
        ok: true,
        mediaType,
        source: compositionSource,
        holoCode,
        bundle,
      };
    }

    default:
      return undefined;
  }
}
