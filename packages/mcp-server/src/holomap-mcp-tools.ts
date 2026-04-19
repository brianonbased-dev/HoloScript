/**
 * HoloMap MCP tools — reconstruction sessions via HoloMapRuntime (CPU path in Node).
 *
 * `holo_map_paper_ingest_probe` runs paper harness ingest. See RFC-HoloMap.md.
 */

import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import {
  mcpReconstructAnchor,
  mcpReconstructExport,
  mcpStartReconstructFromVideo,
  mcpReconstructStep,
} from './holo-reconstruct-sessions';

export const holoMapToolDefinitions: Tool[] = [
  {
    name: 'holo_reconstruct_from_video',
    description:
      'Download a video (http(s) or file://), hash bytes for replay identity, optionally decode frames with ffmpeg (ingestVideo, default true), and run HoloMapRuntime.step per frame. Set config.ingestVideo false to only open a session (use holo_reconstruct_step for frames).',
    inputSchema: {
      type: 'object',
      properties: {
        videoUrl: { type: 'string', description: 'HTTPS URL or file:// path to input video' },
        config: {
          type: 'object',
          description:
            'HoloMapConfig fields plus ingestVideo?, maxIngestFrames?, weightCid? (content-addressed weights). Env: HOLOMAP_MCP_INGEST_VIDEO=0, HOLOMAP_MCP_MAX_VIDEO_BYTES, HOLOMAP_MCP_FETCH_VIDEO_TIMEOUT_MS, HOLOMAP_MCP_FFMPEG_ANALYZE_DURATION, HOLOMAP_MCP_FFMPEG_PROBE_SIZE, HOLOMAP_MCP_EXPORT_MAX_POINTS, FFPROBE_PATH, HOLOMAP_MCP_FFPROBE_TIMEOUT_MS.',
        },
      },
      required: ['videoUrl'],
    },
  },
  {
    name: 'holo_reconstruct_step',
    description:
      'Stream one RGB/RGBA frame (base64) into an active HoloMap session. Returns pose and point count for the step.',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: 'Session id from holo_reconstruct_from_video' },
        frameBase64: { type: 'string', description: 'Base64-encoded RGB (WxHx3) or RGBA (WxHx4) frame bytes' },
        frameIndex: { type: 'number', description: 'Monotonic frame index' },
        width: { type: 'number' },
        height: { type: 'number' },
      },
      required: ['sessionId', 'frameBase64', 'frameIndex', 'width', 'height'],
    },
  },
  {
    name: 'holo_reconstruct_anchor',
    description: 'Return AnchorContext state for the current (or last) step in a HoloMap session.',
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
      'Finalize the session, return the v1.0 ReconstructionManifest, compile a bounds/anchor .holo stub via ExportManager (r3f, unity, godot, usd, unreal, webgpu, vrr, …), and include pointCloudPly (ASCII PLY xyz+rgb) plus trajectoryJson when steps were aggregated.',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string' },
        target: {
          type: 'string',
          description: 'ExportTarget id or alias (r3f, unity, godot, usd / usd-physics, unreal, webgpu, vrr, …)',
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

export async function handleHoloMapTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  switch (name) {
       case 'holo_reconstruct_from_video': {
      const videoUrl = args.videoUrl;
      if (typeof videoUrl !== 'string' || !videoUrl.trim()) {
        throw new Error('holo_reconstruct_from_video: videoUrl (non-empty string) is required');
      }
      const started = await mcpStartReconstructFromVideo(videoUrl.trim(), args.config);
      return {
        ok: true,
        status: 'SESSION_OPEN',
        sessionId: started.sessionId,
        replayFingerprint: started.replayFingerprint,
        framesIngested: started.framesIngested,
        ingestMode: started.ingestMode,
        videoBytes: started.videoBytes,
        ingestWarning: started.ingestWarning,
        message:
          started.ingestMode === 'ffmpeg'
            ? `Ingested ${started.framesIngested} frame(s) via ffmpeg. Use holo_reconstruct_export or more holo_reconstruct_step as needed.`
            : 'Session opened without ffmpeg ingest; stream frames with holo_reconstruct_step or enable config.ingestVideo.',
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
      return mcpReconstructStep(
        sessionId.trim(),
        frameBase64.trim(),
        args.frameIndex as number,
        args.width as number,
        args.height as number,
      );
    }
    case 'holo_reconstruct_anchor': {
      const sessionId = args.sessionId;
      if (typeof sessionId !== 'string' || !sessionId.trim()) {
        throw new Error('holo_reconstruct_anchor: sessionId is required');
      }
      return mcpReconstructAnchor(sessionId.trim());
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
      return mcpReconstructExport(sessionId.trim(), target.trim());
    }
    default:
      return undefined;
  }
}
