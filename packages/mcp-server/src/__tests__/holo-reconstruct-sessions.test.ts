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

  it('opens a session, runs one step, reads anchor, exports manifest + compile attempt', async () => {
    const started = await mcpStartReconstructFromVideo('https://example.com/e2e.mp4', {
      weightStrategy: 'distill',
      ingestVideo: false,
    });
    expect(started.sessionId.length).toBeGreaterThan(10);
    expect(started.replayFingerprint.length).toBeGreaterThan(8);
    expect(started.ingestMode).toBe('none');

    const w = 2;
    const h = 2;
    const rgb = Buffer.alloc(w * h * 3, 42);
    const step = await mcpReconstructStep(started.sessionId, rgb.toString('base64'), 0, w, h);
    expect(step.ok).toBe(true);
    expect(step.pointCount).toBeGreaterThan(0);

    const anchor = mcpReconstructAnchor(started.sessionId);
    expect(anchor.ok).toBe(true);
    expect(Array.isArray(anchor.anchor.anchorDescriptor)).toBe(true);

    const exp = await mcpReconstructExport(started.sessionId, 'r3f');
    expect(exp.ok).toBe(true);
    expect(exp.manifest.version).toBe('1.0.0');
    expect(exp.manifest.simulationContract).toBeDefined();
    expect(exp.exportPointCount).toBeGreaterThan(0);
    expect(exp.pointCloudPly).toContain('ply');
    expect(exp.pointCloudPly).toContain('element vertex');
    expect(exp.trajectoryJson).toContain('"poses"');
    expect(exp.compileStatus === 'COMPILED' || exp.compileStatus === 'COMPILE_FAILED').toBe(true);
    if (exp.compileStatus === 'COMPILED') {
      expect(typeof exp.compiledOutput).toBe('string');
      expect((exp.compiledOutput ?? '').length).toBeGreaterThan(0);
      expect(exp.compiledOutput).toContain('holomapPointCloud');
    }
  });

  it('rejects step for unknown session', async () => {
    const rgb = Buffer.alloc(12, 1);
    await expect(
      mcpReconstructStep('not-a-real-session', rgb.toString('base64'), 0, 2, 2),
    ).rejects.toThrow(/unknown sessionId/);
  });
});
