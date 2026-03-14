/**
 * Draft-to-Mesh-to-Simulation Integration Test
 *
 * E2E test wiring DraftManager + PerformanceRegressionMonitor:
 * 1. Spawn a scene with multiple entities
 * 2. Set all entities to draft → verify collision shapes
 * 3. Simulate VR regression → verify auto-draft
 * 4. Simulate recovery → verify promotion back
 * 5. Verify circular pipeline: draft shapes ARE collision proxies
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { DraftManager } from '../DraftTrait';
import { PerformanceRegressionMonitor } from '../PerformanceRegressionMonitor';

// ── Mock Scene ──────────────────────────────────────────────────────────────

interface SceneEntity {
  id: string;
  type: string;
  maturity: 'draft' | 'mesh' | 'final';
  collisionShape: string | null;
}

function createMockScene(): SceneEntity[] {
  return [
    { id: 'building-01', type: 'box', maturity: 'mesh', collisionShape: null },
    { id: 'tree-01', type: 'cylinder', maturity: 'mesh', collisionShape: null },
    { id: 'rock-01', type: 'sphere', maturity: 'mesh', collisionShape: null },
    { id: 'bridge-01', type: 'box', maturity: 'mesh', collisionShape: null },
    { id: 'lamp-01', type: 'capsule', maturity: 'mesh', collisionShape: null },
  ];
}

// ── Integration Tests ───────────────────────────────────────────────────────

describe('Draft-to-Mesh-to-Simulation Integration', () => {
  let draftManager: DraftManager;
  let perfMonitor: PerformanceRegressionMonitor;
  let scene: SceneEntity[];

  beforeEach(() => {
    draftManager = new DraftManager();
    perfMonitor = new PerformanceRegressionMonitor({
      thresholdMs: 9.0,
      consecutiveFrames: 3,
      recoveryThresholdMs: 7.0,
      recoveryFrames: 3,
    });
    scene = createMockScene();
  });

  it('full pipeline: spawn → draft → collision → promote → recover', () => {
    // ── Phase 1: Spawn scene (all mesh maturity) ──
    expect(scene.every((e) => e.maturity === 'mesh')).toBe(true);
    expect(draftManager.count).toBe(0);

    // ── Phase 2: Set all to draft mode ──
    for (const entity of scene) {
      const config = draftManager.setDraft(entity.id, {
        shape: entity.type as any,
        collision: true,
      });
      entity.maturity = 'draft';
      entity.collisionShape = config.shape;
    }
    expect(draftManager.count).toBe(5);
    expect(scene.every((e) => e.maturity === 'draft')).toBe(true);

    // ── Phase 3: Verify collision shapes (circular pipeline) ──
    // Draft shapes ARE collision proxies — no separate collision mesh
    expect(draftManager.getCollisionShape('building-01')).toBe('box');
    expect(draftManager.getCollisionShape('tree-01')).toBe('cylinder');
    expect(draftManager.getCollisionShape('rock-01')).toBe('sphere');
    expect(draftManager.getCollisionShape('bridge-01')).toBe('box');
    expect(draftManager.getCollisionShape('lamp-01')).toBe('capsule');

    // ── Phase 4: Promote all to mesh ──
    for (const entity of scene) {
      const maturity = draftManager.promote(entity.id);
      entity.maturity = maturity;
      entity.collisionShape = null;
    }
    expect(draftManager.count).toBe(0);
    expect(scene.every((e) => e.maturity === 'mesh')).toBe(true);

    // ── Phase 5: Collision shapes gone after promotion ──
    expect(draftManager.getCollisionShape('building-01')).toBeNull();
    expect(draftManager.getCollisionShape('rock-01')).toBeNull();
  });

  it('VR performance regression → auto-draft → recovery', () => {
    const entityIds = scene.map((e) => e.id);

    // ── Good performance: no regression ──
    for (let i = 0; i < 5; i++) {
      perfMonitor.tick(5.0);
    }
    expect(perfMonitor.getState().isRegressed).toBe(false);

    // ── Bad performance: feed enough 12ms frames to push rolling average above 9ms ──
    // After 5 × 5ms, rolling avg needs enough 12ms to cross 9ms threshold for 3 consecutive
    for (let i = 0; i < 10; i++) {
      perfMonitor.tick(12.0);
    }
    expect(perfMonitor.getState().isRegressed).toBe(true);

    // ── Auto-demote all entities to draft ──
    draftManager.demoteAll(entityIds, 'box');
    for (const entity of scene) {
      entity.maturity = 'draft';
      entity.collisionShape = draftManager.getCollisionShape(entity.id);
    }
    expect(draftManager.count).toBe(5);
    expect(scene.every((e) => e.maturity === 'draft')).toBe(true);
    expect(scene.every((e) => e.collisionShape === 'box')).toBe(true);

    // ── Performance recovers ──
    // Feed enough low ticks for rolling avg to drop below 7ms and sustain 3 consecutive
    for (let i = 0; i < 15; i++) {
      perfMonitor.tick(2.0);
    }
    expect(perfMonitor.getState().isRegressed).toBe(false);

    // ── Re-promote all out of draft ──
    for (const entity of scene) {
      draftManager.promote(entity.id);
      entity.maturity = 'mesh';
      entity.collisionShape = null;
    }
    expect(draftManager.count).toBe(0);
    expect(perfMonitor.getState().recoveryCount).toBe(1);
  });

  it('mixed maturity scene: some draft, some mesh, some final', () => {
    // Set only specific entities to draft
    draftManager.setDraft('building-01', { shape: 'box', collision: true });
    draftManager.setDraft('rock-01', { shape: 'sphere', collision: true });

    expect(draftManager.isDraft('building-01')).toBe(true);
    expect(draftManager.isDraft('tree-01')).toBe(false);
    expect(draftManager.isDraft('rock-01')).toBe(true);

    // Collision only on draft entities
    expect(draftManager.getCollisionShape('building-01')).toBe('box');
    expect(draftManager.getCollisionShape('tree-01')).toBeNull();
    expect(draftManager.getCollisionShape('rock-01')).toBe('sphere');
  });

  it('emergency VR regression with force + immediate recovery', () => {
    const entityIds = scene.map((e) => e.id);

    // Force regression without frame analysis
    perfMonitor.forceRegress();
    expect(perfMonitor.getState().isRegressed).toBe(true);

    // Emergency demote all
    draftManager.demoteAll(entityIds);
    expect(draftManager.count).toBe(5);

    // Force recover
    perfMonitor.forceRecover();
    expect(perfMonitor.getState().isRegressed).toBe(false);

    // Clear all drafts
    draftManager.clear();
    expect(draftManager.count).toBe(0);
  });

  it('promote to final skips mesh stage', () => {
    draftManager.setDraft('building-01', {
      shape: 'box',
      collision: true,
      targetMaturity: 'final',
    });

    const maturity = draftManager.promote('building-01');
    expect(maturity).toBe('final');
    expect(draftManager.isDraft('building-01')).toBe(false);
  });

  it('regression count tracks total regression events', () => {
    const monitor = new PerformanceRegressionMonitor({
      thresholdMs: 9.0,
      consecutiveFrames: 1,
      recoveryThresholdMs: 7.0,
      recoveryFrames: 1,
    });

    // Regress
    monitor.tick(15.0);
    expect(monitor.getState().regressionCount).toBe(1);

    // Recover (need avg below 7.0 — fill window with low values)
    for (let i = 0; i < 10; i++) monitor.tick(1.0);
    expect(monitor.getState().isRegressed).toBe(false);

    // Regress again
    for (let i = 0; i < 10; i++) monitor.tick(15.0);
    expect(monitor.getState().regressionCount).toBe(2);
  });
});
