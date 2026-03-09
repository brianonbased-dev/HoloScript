/**
 * StateSnapshotCapture — production test suite
 *
 * Tests capture with all subsystem options: animationEngine,
 * particleSystems, keyboardSystem, scrollOffsets, custom data,
 * and the null/empty default cases.
 */

import { describe, it, expect } from 'vitest';
import { StateSnapshotCapture } from '../StateSnapshot';

// ─── Suite ───────────────────────────────────────────────────────────────────

describe('StateSnapshotCapture: production', () => {
  let capture: StateSnapshotCapture;

  // ─── Empty capture ─────────────────────────────────────────────────────────
  describe('empty / default options', () => {
    it('returns a valid snapshot with no options', () => {
      capture = new StateSnapshotCapture();
      const snap = capture.capture({});
      expect(snap).toBeDefined();
      expect(snap.timestamp).toBeTruthy();
    });

    it('timestamp is an ISO 8601 string', () => {
      capture = new StateSnapshotCapture();
      const snap = capture.capture({});
      expect(() => new Date(snap.timestamp)).not.toThrow();
      expect(new Date(snap.timestamp).toISOString()).toBe(snap.timestamp);
    });

    it('animation defaults to empty activeClipIds', () => {
      const snap = new StateSnapshotCapture().capture({});
      expect(snap.animation.activeClipIds).toEqual([]);
    });

    it('particles defaults to empty array', () => {
      const snap = new StateSnapshotCapture().capture({});
      expect(snap.particles).toEqual([]);
    });

    it('ui defaults to null focus and zero cursor', () => {
      const snap = new StateSnapshotCapture().capture({});
      expect(snap.ui.focusedInputId).toBeNull();
      expect(snap.ui.cursorIndex).toBe(0);
      expect(snap.ui.scrollOffsets).toEqual({});
    });

    it('custom defaults to empty object', () => {
      const snap = new StateSnapshotCapture().capture({});
      expect(snap.custom).toEqual({});
    });
  });

  // ─── Animation engine ──────────────────────────────────────────────────────
  describe('animationEngine', () => {
    it('captures active clip IDs from animation engine', () => {
      const animationEngine = { getActiveIds: () => ['idle', 'walk'] };
      const snap = new StateSnapshotCapture().capture({ animationEngine });
      expect(snap.animation.activeClipIds).toEqual(['idle', 'walk']);
    });

    it('handles empty clip IDs from animation engine', () => {
      const animationEngine = { getActiveIds: () => [] };
      const snap = new StateSnapshotCapture().capture({ animationEngine });
      expect(snap.animation.activeClipIds).toEqual([]);
    });
  });

  // ─── Particle systems ──────────────────────────────────────────────────────
  describe('particleSystems', () => {
    it('captures emitter state for each particle system', () => {
      const particleSystems = [
        { id: 'fire-1', isEmitting: () => true, getActiveCount: () => 50 },
        { id: 'smoke-2', isEmitting: () => false, getActiveCount: () => 0 },
      ];
      const snap = new StateSnapshotCapture().capture({ particleSystems });
      expect(snap.particles).toHaveLength(2);
      expect(snap.particles[0]).toEqual({ emitterId: 'fire-1', isEmitting: true, activeCount: 50 });
      expect(snap.particles[1]).toEqual({
        emitterId: 'smoke-2',
        isEmitting: false,
        activeCount: 0,
      });
    });

    it('handles single particle system', () => {
      const particleSystems = [{ id: 'sparks', isEmitting: () => true, getActiveCount: () => 12 }];
      const snap = new StateSnapshotCapture().capture({ particleSystems });
      expect(snap.particles[0].emitterId).toBe('sparks');
      expect(snap.particles[0].activeCount).toBe(12);
    });
  });

  // ─── Keyboard / UI system ──────────────────────────────────────────────────
  describe('keyboardSystem', () => {
    it('captures focusedInputId and cursorIndex', () => {
      const keyboardSystem = { focusedInputId: 'input-name', cursorIndex: 5 };
      const snap = new StateSnapshotCapture().capture({ keyboardSystem });
      expect(snap.ui.focusedInputId).toBe('input-name');
      expect(snap.ui.cursorIndex).toBe(5);
    });

    it('handles null focusedInputId', () => {
      const keyboardSystem = { focusedInputId: null, cursorIndex: 0 };
      const snap = new StateSnapshotCapture().capture({ keyboardSystem });
      expect(snap.ui.focusedInputId).toBeNull();
    });
  });

  // ─── Scroll offsets ───────────────────────────────────────────────────────
  describe('scrollOffsets', () => {
    it('captures scroll offsets map', () => {
      const scrollOffsets = { sidebar: 120, main: 400 };
      const snap = new StateSnapshotCapture().capture({ scrollOffsets });
      expect(snap.ui.scrollOffsets).toEqual({ sidebar: 120, main: 400 });
    });
  });

  // ─── Custom data ─────────────────────────────────────────────────────────
  describe('custom', () => {
    it('captures arbitrary custom state', () => {
      const custom = { level: 5, hp: 100, boss: 'Dragon' };
      const snap = new StateSnapshotCapture().capture({ custom });
      expect(snap.custom).toEqual(custom);
    });
  });

  // ─── Full combined snapshot ───────────────────────────────────────────────
  describe('combined options', () => {
    it('combines all subsystems in a single snapshot', () => {
      const snap = new StateSnapshotCapture().capture({
        animationEngine: { getActiveIds: () => ['run'] },
        particleSystems: [{ id: 'dust', isEmitting: () => true, getActiveCount: () => 8 }],
        keyboardSystem: { focusedInputId: 'search-box', cursorIndex: 3 },
        scrollOffsets: { nav: 20 },
        custom: { score: 999 },
      });
      expect(snap.animation.activeClipIds).toContain('run');
      expect(snap.particles[0].emitterId).toBe('dust');
      expect(snap.ui.focusedInputId).toBe('search-box');
      expect(snap.ui.scrollOffsets).toEqual({ nav: 20 });
      expect(snap.custom['score']).toBe(999);
    });
  });
});
