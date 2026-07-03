import { describe, it, expect, vi } from 'vitest';

vi.mock('../holo-reconstruct-sessions', () => ({
  mcpStartReconstructFromVideo: vi.fn(
    async (_videoUrl: string, config?: Record<string, unknown>) => ({
      sessionId: 'sess-1',
      replayFingerprint: 'fp-1',
      framesIngested: 0,
      ingestMode: 'none',
      captureProfile:
        config?.captureProfile === 'face' || config?.scanKind === 'face' ? 'face' : 'room',
      videoBytes: 0,
      ingestWarning: undefined,
    })
  ),
  mcpReconstructStep: vi.fn(async () => ({ ok: true, kind: 'step' })),
  mcpReconstructAnchor: vi.fn(async () => ({ ok: true, kind: 'anchor' })),
  mcpReconstructExport: vi.fn(async () => ({ ok: true, kind: 'export' })),
}));

import { holoMapToolDefinitions, isHoloMapToolName, handleHoloMapTool } from '../holomap-mcp-tools';
import { mcpReconstructStep, mcpStartReconstructFromVideo } from '../holo-reconstruct-sessions';

describe('holomap mcp tools', () => {
  const publicConsent = {
    captureContext: 'public',
    bystanderMitigation: 'face_blur',
    consent: {
      tosAccepted: true,
      bystanderPrivacyAccepted: true,
      mediaRightsConfirmed: true,
    },
  };

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
    expect(result.captureProfile).toBe('room');
  });

  it('rejects public from_video capture without consent before opening a session', async () => {
    const callsBefore = vi.mocked(mcpStartReconstructFromVideo).mock.calls.length;

    await expect(
      handleHoloMapTool('holo_reconstruct_from_video', {
        videoUrl: 'file:///tmp/public-room.mp4',
        privacy: { captureContext: 'public' },
      })
    ).rejects.toThrow(/public HoloMap video capture requires privacy\.consent/);

    expect(vi.mocked(mcpStartReconstructFromVideo).mock.calls).toHaveLength(callsBefore);
  });

  it('accepts public from_video capture with consent and mitigation receipt', async () => {
    const result = (await handleHoloMapTool('holo_reconstruct_from_video', {
      videoUrl: 'file:///tmp/public-room-consented.mp4',
      config: { ingestVideo: false },
      privacy: publicConsent,
    })) as Record<string, unknown>;

    expect(result.ok).toBe(true);
    expect(vi.mocked(mcpStartReconstructFromVideo)).toHaveBeenLastCalledWith(
      'file:///tmp/public-room-consented.mp4',
      { ingestVideo: false }
    );
  });

  it('rejects public frame streaming without consent before reconstruction step', async () => {
    const callsBefore = vi.mocked(mcpReconstructStep).mock.calls.length;

    await expect(
      handleHoloMapTool('holo_reconstruct_step', {
        sessionId: 'sess-1',
        frameBase64: 'AAAA',
        frameIndex: 0,
        width: 1,
        height: 1,
        privacy: { captureContext: 'public' },
      } as Record<string, unknown>)
    ).rejects.toThrow(/public HoloMap frame capture requires privacy\.consent/);

    expect(vi.mocked(mcpReconstructStep).mock.calls).toHaveLength(callsBefore);
  });

  it('passes face capture profile through from_video config', async () => {
    const result = (await handleHoloMapTool('holo_reconstruct_from_video', {
      videoUrl: 'file:///tmp/face.mp4',
      config: { ingestVideo: false, captureProfile: 'face' },
    })) as Record<string, unknown>;

    expect(result.captureProfile).toBe('face');
    expect(vi.mocked(mcpStartReconstructFromVideo)).toHaveBeenLastCalledWith(
      'file:///tmp/face.mp4',
      { ingestVideo: false, captureProfile: 'face' }
    );
  });
});
