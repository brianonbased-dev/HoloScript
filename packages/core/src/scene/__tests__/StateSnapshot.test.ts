/**
 * StateSnapshot Unit Tests
 *
 * Tests StateSnapshotCapture with various subsystem inputs.
 */

import { describe, it, expect } from 'vitest';
import { StateSnapshotCapture } from '../StateSnapshot';

describe('StateSnapshotCapture', () => {
  it('should produce a snapshot with defaults when called empty', () => {
    const cap = new StateSnapshotCapture();
    const snap = cap.capture({});
    expect(snap.timestamp).toBeTruthy();
    expect(snap.animation.activeClipIds).toEqual([]);
    expect(snap.particles).toEqual([]);
    expect(snap.ui.focusedInputId).toBeNull();
    expect(snap.custom).toEqual({});
  });

  it('should capture animation engine active IDs', () => {
    const cap = new StateSnapshotCapture();
    const snap = cap.capture({
      animationEngine: { getActiveIds: () => ['walk', 'run'] },
    });
    expect(snap.animation.activeClipIds).toEqual(['walk', 'run']);
  });

  it('should capture particle systems', () => {
    const cap = new StateSnapshotCapture();
    const snap = cap.capture({
      particleSystems: [
        { id: 'fire', isEmitting: () => true, getActiveCount: () => 100 },
        { id: 'smoke', isEmitting: () => false, getActiveCount: () => 0 },
      ],
    });
    expect(snap.particles).toHaveLength(2);
    expect(snap.particles[0].emitterId).toBe('fire');
    expect(snap.particles[0].isEmitting).toBe(true);
    expect(snap.particles[0].activeCount).toBe(100);
    expect(snap.particles[1].isEmitting).toBe(false);
  });

  it('should capture keyboard/UI state', () => {
    const cap = new StateSnapshotCapture();
    const snap = cap.capture({
      keyboardSystem: { focusedInputId: 'search-box', cursorIndex: 5 },
      scrollOffsets: { 'panel-1': 120 },
    });
    expect(snap.ui.focusedInputId).toBe('search-box');
    expect(snap.ui.cursorIndex).toBe(5);
    expect(snap.ui.scrollOffsets['panel-1']).toBe(120);
  });

  it('should capture custom data', () => {
    const cap = new StateSnapshotCapture();
    const snap = cap.capture({ custom: { score: 42, level: 'boss' } });
    expect(snap.custom.score).toBe(42);
    expect(snap.custom.level).toBe('boss');
  });

  it('should produce ISO timestamp', () => {
    const cap = new StateSnapshotCapture();
    const snap = cap.capture({});
    expect(() => new Date(snap.timestamp)).not.toThrow();
  });
});
