import { describe, it, expect, beforeEach } from 'vitest';
import {
  __resetHoloReconstructSessionsForTests,
  mcpStartReconstructFromVideo,
  mcpReconstructStep,
  mcpReconstructAnchor,
  mcpReconstructExport,
} from '../holo-reconstruct-sessions';

describe('holo reconstruct MCP sessions', () => {
  beforeEach(() => {
    __resetHoloReconstructSessionsForTests();
  });

  it('opens a session, runs one step, reads anchor, exports manifest', async () => {
    const { sessionId, replayFingerprint } = await mcpStartReconstructFromVideo(
      'https://example.com/e2e.mp4',
      { weightStrategy: 'distill' },
    );
    expect(sessionId.length).toBeGreaterThan(10);
    expect(replayFingerprint.length).toBeGreaterThan(8);

    const w = 2;
    const h = 2;
    const rgb = Buffer.alloc(w * h * 3, 42);
    const step = await mcpReconstructStep(sessionId, rgb.toString('base64'), 0, w, h);
    expect(step.ok).toBe(true);
    expect(step.pointCount).toBeGreaterThan(0);

    const anchor = mcpReconstructAnchor(sessionId);
    expect(anchor.ok).toBe(true);
    expect(Array.isArray(anchor.anchor.anchorDescriptor)).toBe(true);

    const exp = await mcpReconstructExport(sessionId, 'r3f');
    expect(exp.ok).toBe(true);
    expect(exp.manifest.version).toBe('1.0.0');
    expect(exp.manifest.simulationContract).toBeDefined();
  });

  it('rejects step for unknown session', async () => {
    const rgb = Buffer.alloc(12, 1);
    await expect(
      mcpReconstructStep('not-a-real-session', rgb.toString('base64'), 0, 2, 2),
    ).rejects.toThrow(/unknown sessionId/);
  });
});
