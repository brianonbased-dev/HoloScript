/**
 * HoloMap MCP tools — Sprint 1 validation stubs (no reconstruction implementation).
 *
 * Surfaces tool contracts for agents; returns structured stub responses after
 * validating required arguments. See `packages/core/src/reconstruction/RFC-HoloMap.md`.
 */

import type { Tool } from '@modelcontextprotocol/sdk/types.js';

export const holoMapToolDefinitions: Tool[] = [
  {
    name: 'holo_reconstruct_from_video',
    description:
      'Run HoloMap feed-forward 3D reconstruction on a video URL (WebGPU). Sprint 1: validates args only; implementation lands Sprint 2.',
    inputSchema: {
      type: 'object',
      properties: {
        videoUrl: { type: 'string', description: 'HTTPS URL or file URI to input video' },
        config: {
          type: 'object',
          description: 'Optional HoloMapConfig fields (inputResolution, targetFPS, seed, modelHash, …)',
        },
      },
      required: ['videoUrl'],
    },
  },
  {
    name: 'holo_reconstruct_step',
    description:
      'Stream one RGB frame into an active HoloMap session. Sprint 1: stub — use in Sprint 2 for chunked capture.',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: 'Opaque session id from future session API' },
        frameBase64: { type: 'string', description: 'Base64-encoded RGB/RGBA frame bytes' },
        frameIndex: { type: 'number', description: 'Monotonic frame index' },
        width: { type: 'number' },
        height: { type: 'number' },
      },
      required: ['sessionId', 'frameBase64', 'frameIndex', 'width', 'height'],
    },
  },
  {
    name: 'holo_reconstruct_anchor',
    description:
      'Return current AnchorContext state for a HoloMap session. Sprint 1: stub.',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string' },
      },
      required: ['sessionId'],
    },
  },
  {
    name: 'holo_reconstruct_export',
    description:
      'Export reconstruction manifest / compile to a target (r3f, unity, usd, …). Sprint 1: stub.',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string' },
        target: {
          type: 'string',
          description: 'Compile target id (e.g. r3f, unity, godot, usd-physics)',
        },
      },
      required: ['sessionId', 'target'],
    },
  },
  {
    name: 'holo_map_paper_ingest_probe',
    description:
      'Run the dual-path paper harness ingest probe (Marble compatibility vs HoloMap native). Returns markdown comparison + fingerprint rows for Paper #2 / #4 workflows.',
    inputSchema: {
      type: 'object',
      properties: {
        paperId: {
          type: 'string',
          description: 'Identifier e.g. paper-2-snn-navigation or paper-4-adversarial-holo',
        },
        ingestPath: {
          type: 'string',
          enum: ['marble', 'holomap', 'both'],
          description: 'Scene source mode (default marble if omitted — uses process env when not passed)',
        },
      },
      required: [],
    },
  },
];

const HOLOMAP_NAMES = new Set(holoMapToolDefinitions.map((t) => t.name));

export function isHoloMapToolName(name: string): boolean {
  return HOLOMAP_NAMES.has(name);
}

export async function handleHoloMapPaperIngestProbe(
  args: Record<string, unknown>,
): Promise<unknown> {
  const { runPaperHarnessIngestProbe, resolveIngestPath } = await import('@holoscript/holomap');
  const paperId =
    typeof args.paperId === 'string' && args.paperId.trim()
      ? args.paperId.trim()
      : 'mcp-paper-probe';
  let ingestPath = resolveIngestPath(process);
  if (typeof args.ingestPath === 'string') {
    const s = args.ingestPath.trim().toLowerCase();
    if (s === 'marble' || s === 'holomap' || s === 'both') {
      ingestPath = s;
    }
  }
  return runPaperHarnessIngestProbe({ paperId, ingestPath });
}

export function handleHoloMapTool(name: string, args: Record<string, unknown>): unknown {
  const sprint = 'Sprint 1';
  const doc = 'packages/core/src/reconstruction/RFC-HoloMap.md';

  switch (name) {
    case 'holo_reconstruct_from_video': {
      const videoUrl = args.videoUrl;
      if (typeof videoUrl !== 'string' || !videoUrl.trim()) {
        throw new Error('holo_reconstruct_from_video: videoUrl (non-empty string) is required');
      }
      return {
        ok: false,
        status: 'NOT_IMPLEMENTED',
        sprint,
        message: `HoloMap reconstruction is not implemented yet (${sprint} stub). See ${doc}.`,
        validated: { videoUrl: videoUrl.slice(0, 200), hasConfig: args.config != null },
      };
    }
    case 'holo_reconstruct_step': {
      const sessionId = args.sessionId;
      const frameBase64 = args.frameBase64;
      if (typeof sessionId !== 'string' || !sessionId.trim()) {
        throw new Error('holo_reconstruct_step: sessionId is required');
      }
      if (typeof frameBase64 !== 'string' || !frameBase64.trim()) {
        throw new Error('holo_reconstruct_step: frameBase64 is required');
      }
      for (const k of ['frameIndex', 'width', 'height'] as const) {
        if (typeof args[k] !== 'number' || !Number.isFinite(args[k] as number)) {
          throw new Error(`holo_reconstruct_step: ${k} must be a finite number`);
        }
      }
      return {
        ok: false,
        status: 'NOT_IMPLEMENTED',
        sprint,
        message: `HoloMap streaming step is not implemented yet (${sprint} stub). See ${doc}.`,
        validated: {
          sessionId,
          frameIndex: args.frameIndex,
          width: args.width,
          height: args.height,
          frameBase64Length: frameBase64.length,
        },
      };
    }
    case 'holo_reconstruct_anchor': {
      const sessionId = args.sessionId;
      if (typeof sessionId !== 'string' || !sessionId.trim()) {
        throw new Error('holo_reconstruct_anchor: sessionId is required');
      }
      return {
        ok: false,
        status: 'NOT_IMPLEMENTED',
        sprint,
        message: `HoloMap anchor export is not implemented yet (${sprint} stub). See ${doc}.`,
        validated: { sessionId },
      };
    }
    case 'holo_reconstruct_export': {
      const sessionId = args.sessionId;
      const target = args.target;
      if (typeof sessionId !== 'string' || !sessionId.trim()) {
        throw new Error('holo_reconstruct_export: sessionId is required');
      }
      if (typeof target !== 'string' || !target.trim()) {
        throw new Error('holo_reconstruct_export: target is required');
      }
      return {
        ok: false,
        status: 'NOT_IMPLEMENTED',
        sprint,
        message: `HoloMap export is not implemented yet (${sprint} stub). See ${doc}.`,
        validated: { sessionId, target },
      };
    }
    default:
      return undefined;
  }
}
