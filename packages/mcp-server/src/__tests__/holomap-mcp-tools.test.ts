import { describe, it, expect, vi } from 'vitest';

vi.mock('../holo-reconstruct-sessions', () => ({
  mcpStartReconstructFromVideo: vi.fn(async () => ({
    sessionId: 'sess-1',
    replayFingerprint: 'fp-1',
    framesIngested: 0,
    ingestMode: 'none',
    videoBytes: 0,
    ingestWarning: undefined,
  })),
  mcpReconstructStep: vi.fn(async () => ({ ok: true, kind: 'step' })),
  mcpReconstructAnchor: vi.fn(async () => ({ ok: true, kind: 'anchor' })),
  mcpReconstructExport: vi.fn(async () => ({ ok: true, kind: 'export' })),
}));

import {
  holoMapToolDefinitions,
  isHoloMapToolName,
  handleHoloMapTool,
} from '../holomap-mcp-tools';

describe('holomap mcp tools', () => {
  it('defines expected HoloMap tools', () => {
    const names = holoMapToolDefinitions.map((t) => t.name);
    expect(names).toContain('holo_reconstruct_from_video');
    expect(names).toContain('holo_reconstruct_step');
    expect(names).toContain('holo_reconstruct_anchor');
    expect(names).toContain('holo_reconstruct_export');
    expect(names).toContain('holo_map_paper_ingest_probe');
  });

  it('identifies HoloMap tool names', () => {
    expect(isHoloMapToolName('holo_reconstruct_from_video')).toBe(true);
    expect(isHoloMapToolName('holo_reconstruct_step')).toBe(true);
    expect(isHoloMapToolName('not_a_holomap_tool')).toBe(false);
  });

  it('rejects missing videoUrl for from_video', async () => {
    await expect(handleHoloMapTool('holo_reconstruct_from_video', {})).rejects.toThrow(
      'videoUrl (non-empty string) is required'
    );
  });

  it('rejects missing required fields for step', async () => {
    await expect(
      handleHoloMapTool('holo_reconstruct_step', {
        sessionId: 'sess-1',
        frameBase64: 'AA==',
        width: 32,
        height: 32,
      } as Record<string, unknown>)
    ).rejects.toThrow('frameIndex must be a finite number');
  });

  it('rejects missing sessionId for anchor/export', async () => {
    await expect(handleHoloMapTool('holo_reconstruct_anchor', {})).rejects.toThrow(
      'sessionId is required'
    );
    await expect(
      handleHoloMapTool('holo_reconstruct_export', { sessionId: '   ', target: 'r3f' })
    ).rejects.toThrow('sessionId is required');
  });

  it('returns undefined for unknown tool names', async () => {
    const result = await handleHoloMapTool('unknown_holomap_tool', {});
    expect(result).toBeUndefined();
  });

  it('returns SESSION_OPEN envelope for valid from_video input', async () => {
    const result = (await handleHoloMapTool('holo_reconstruct_from_video', {
      videoUrl: 'file:///tmp/video.mp4',
      config: { ingestVideo: false },
    })) as Record<string, unknown>;

    expect(result.ok).toBe(true);
    expect(result.status).toBe('SESSION_OPEN');
    expect(result.sessionId).toBe('sess-1');
  });
});
