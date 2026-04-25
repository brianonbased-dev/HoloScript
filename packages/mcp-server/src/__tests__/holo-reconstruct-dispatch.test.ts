/**
 * Sprint-3 Phase 2 dispatch table — task_p0gl.
 *
 * Verifies that decorator combinations on a `.holo` Node resolve to the
 * correct MCP session shape. Acceptance criterion: dispatch table covers
 * all 3 decorator combinations (single + trio).
 */
import { describe, it, expect } from 'vitest';
import { dispatchReconstructionFromDecorators } from '../holo-reconstruct-sessions';

describe('dispatchReconstructionFromDecorators — Sprint-3 trait→MCP wiring', () => {
  it('@reconstruction_source alone → video session, trajectory only', () => {
    const d = dispatchReconstructionFromDecorators(['reconstruction_source']);
    expect(d.kind).toBe('video-session');
    if (d.kind !== 'video-session') return;
    expect(d.sessionConstructor).toBe('mcpStartReconstructFromVideo');
    expect(d.sessionFlags).toEqual({
      emitTrajectory: true,
      emitSplatOutput: false,
      applyDriftCorrection: false,
    });
    expect(d.resolvedTraits).toEqual([
      'holomap_reconstruct',
      'holomap_camera_trajectory',
      'holomap_anchor_context',
    ]);
  });

  it('@acceptance_video alone → video session, splat output only', () => {
    const d = dispatchReconstructionFromDecorators(['acceptance_video']);
    expect(d.kind).toBe('video-session');
    if (d.kind !== 'video-session') return;
    expect(d.sessionFlags).toEqual({
      emitTrajectory: false,
      emitSplatOutput: true,
      applyDriftCorrection: false,
    });
    expect(d.resolvedTraits).toEqual(['holomap_reconstruct', 'holomap_splat_output']);
  });

  it('@drift_corrected alone → no-session (drift is post-processing only)', () => {
    const d = dispatchReconstructionFromDecorators(['drift_corrected']);
    expect(d.kind).toBe('no-session');
    if (d.kind !== 'no-session') return;
    expect(d.reason).toBe('drift-only-needs-source');
    expect(d.resolvedTraits).toEqual(['holomap_drift_correction']);
  });

  it('full decorator trio → video session with all flags', () => {
    const d = dispatchReconstructionFromDecorators([
      'reconstruction_source',
      'acceptance_video',
      'drift_corrected',
    ]);
    expect(d.kind).toBe('video-session');
    if (d.kind !== 'video-session') return;
    expect(d.sessionFlags).toEqual({
      emitTrajectory: true,
      emitSplatOutput: true,
      applyDriftCorrection: true,
    });
    expect(d.resolvedTraits).toEqual([
      'holomap_reconstruct',
      'holomap_camera_trajectory',
      'holomap_anchor_context',
      'holomap_splat_output',
      'holomap_drift_correction',
    ]);
  });

  it('@reconstruction_source + @drift_corrected → video session with drift', () => {
    const d = dispatchReconstructionFromDecorators([
      'reconstruction_source',
      'drift_corrected',
    ]);
    expect(d.kind).toBe('video-session');
    if (d.kind !== 'video-session') return;
    expect(d.sessionFlags).toEqual({
      emitTrajectory: true,
      emitSplatOutput: false,
      applyDriftCorrection: true,
    });
  });

  it('@-prefixed decorator names are accepted (parser may emit either form)', () => {
    const d = dispatchReconstructionFromDecorators(['@reconstruction_source', '@drift_corrected']);
    expect(d.kind).toBe('video-session');
    if (d.kind !== 'video-session') return;
    expect(d.sessionFlags.emitTrajectory).toBe(true);
    expect(d.sessionFlags.applyDriftCorrection).toBe(true);
  });

  it('empty decorator list → no-session', () => {
    const d = dispatchReconstructionFromDecorators([]);
    expect(d.kind).toBe('no-session');
    if (d.kind !== 'no-session') return;
    expect(d.reason).toBe('no-decorators');
  });

  it('non-HoloMap decorators are silently filtered', () => {
    const d = dispatchReconstructionFromDecorators([
      'reconstruction_source',
      'physics_rigidbody',
      'audio_source',
    ]);
    expect(d.kind).toBe('video-session');
    if (d.kind !== 'video-session') return;
    expect(d.sessionFlags.emitTrajectory).toBe(true);
    // Non-HoloMap decorators contribute zero traits.
    expect(d.resolvedTraits).toEqual([
      'holomap_reconstruct',
      'holomap_camera_trajectory',
      'holomap_anchor_context',
    ]);
  });

  it('only non-HoloMap decorators → no-session (filtered to empty)', () => {
    const d = dispatchReconstructionFromDecorators(['physics_rigidbody', 'audio_source']);
    expect(d.kind).toBe('no-session');
    if (d.kind !== 'no-session') return;
    expect(d.reason).toBe('no-decorators');
  });
});
