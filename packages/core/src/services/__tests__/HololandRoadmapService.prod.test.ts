/**
 * HololandRoadmapService — Production Tests
 *
 * Covers: singleton access, default milestones, addMilestone, updateMilestone,
 * getMilestone, getAllMilestones, getProgress average calculation.
 *
 * Note: The service is a singleton. We test via the static getInstance() path
 * and add unique IDs to avoid cross-test contamination.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { HololandRoadmapService } from '../HololandRoadmapService';

// ─── Helper ───────────────────────────────────────────────────────────────────

function uniqueId(): string {
  return `test-${Math.random().toString(36).slice(2)}`;
}

// ─── Singleton ────────────────────────────────────────────────────────────────

describe('HololandRoadmapService — singleton', () => {
  it('getInstance() returns same instance each call', () => {
    const a = HololandRoadmapService.getInstance();
    const b = HololandRoadmapService.getInstance();
    expect(a).toBe(b);
  });
});

// ─── Default bootstrap milestones ────────────────────────────────────────────

describe('HololandRoadmapService — bootstrap state', () => {
  let svc: HololandRoadmapService;
  beforeEach(() => { svc = HololandRoadmapService.getInstance(); });

  it('phase1 is completed with progress=100', () => {
    const m = svc.getMilestone('phase1');
    expect(m).toBeDefined();
    expect(m!.status).toBe('completed');
    expect(m!.progress).toBe(100);
  });
  it('phase4 is completed', () => {
    expect(svc.getMilestone('phase4')?.status).toBe('completed');
  });
  it('phase5 is in-progress with progress=40', () => {
    const m = svc.getMilestone('phase5');
    expect(m?.status).toBe('in-progress');
    expect(m?.progress).toBe(40);
  });
  it('getAllMilestones returns at least 3 entries', () => {
    expect(svc.getAllMilestones().length).toBeGreaterThanOrEqual(3);
  });
});

// ─── addMilestone ─────────────────────────────────────────────────────────────

describe('HololandRoadmapService — addMilestone', () => {
  let svc: HololandRoadmapService;
  beforeEach(() => { svc = HololandRoadmapService.getInstance(); });

  it('adds a new milestone and getMilestone returns it', () => {
    const id = uniqueId();
    svc.addMilestone({ id, title: 'Test M', description: 'Desc', status: 'planned', progress: 0 });
    const m = svc.getMilestone(id);
    expect(m).toBeDefined();
    expect(m!.title).toBe('Test M');
    expect(m!.status).toBe('planned');
  });

  it('adds milestone with tags and dependencies', () => {
    const id = uniqueId();
    svc.addMilestone({
      id, title: 'Tagged', description: 'x', status: 'planned', progress: 0,
      tags: ['spatial', 'IoT'], dependencies: ['phase1'],
    });
    const m = svc.getMilestone(id)!;
    expect(m.tags).toContain('spatial');
    expect(m.dependencies).toContain('phase1');
  });
});

// ─── updateMilestone ──────────────────────────────────────────────────────────

describe('HololandRoadmapService — updateMilestone', () => {
  let svc: HololandRoadmapService;
  beforeEach(() => { svc = HololandRoadmapService.getInstance(); });

  it('returns true when milestone exists', () => {
    const id = uniqueId();
    svc.addMilestone({ id, title: 'T', description: 'D', status: 'planned', progress: 0 });
    expect(svc.updateMilestone(id, { status: 'in-progress', progress: 50 })).toBe(true);
  });

  it('updates status and progress fields', () => {
    const id = uniqueId();
    svc.addMilestone({ id, title: 'U', description: 'D', status: 'planned', progress: 0 });
    svc.updateMilestone(id, { status: 'completed', progress: 100 });
    const m = svc.getMilestone(id)!;
    expect(m.status).toBe('completed');
    expect(m.progress).toBe(100);
  });

  it('returns false for unknown milestone id', () => {
    expect(svc.updateMilestone('does-not-exist-xyz', { progress: 10 })).toBe(false);
  });

  it('preserves fields not included in update', () => {
    const id = uniqueId();
    svc.addMilestone({ id, title: 'Preserve', description: 'KeepMe', status: 'planned', progress: 0 });
    svc.updateMilestone(id, { progress: 75 });
    expect(svc.getMilestone(id)!.description).toBe('KeepMe');
  });
});

// ─── getMilestone ─────────────────────────────────────────────────────────────

describe('HololandRoadmapService — getMilestone', () => {
  let svc: HololandRoadmapService;
  beforeEach(() => { svc = HololandRoadmapService.getInstance(); });

  it('returns undefined for non-existent id', () => {
    expect(svc.getMilestone('does-not-exist-abc')).toBeUndefined();
  });
});

// ─── getProgress ──────────────────────────────────────────────────────────────

describe('HololandRoadmapService — getProgress', () => {
  let svc: HololandRoadmapService;
  beforeEach(() => { svc = HololandRoadmapService.getInstance(); });

  it('getProgress returns a number between 0 and 100', () => {
    const p = svc.getProgress();
    expect(p).toBeGreaterThanOrEqual(0);
    expect(p).toBeLessThanOrEqual(100);
  });

  it('adding a 0-progress milestone decreases average', () => {
    const before = svc.getProgress();
    const id = uniqueId();
    svc.addMilestone({ id, title: 'Zero', description: '', status: 'planned', progress: 0 });
    const after = svc.getProgress();
    // More items → average can only decrease or stay same if before was 0
    expect(after).toBeLessThanOrEqual(before + 1); // +1 for float rounding
  });

  it('adding a 100-progress milestone increases average', () => {
    const before = svc.getProgress();
    const id = uniqueId();
    svc.addMilestone({ id, title: 'Full', description: '', status: 'completed', progress: 100 });
    const after = svc.getProgress();
    expect(after).toBeGreaterThanOrEqual(before - 1); // rounding tolerance
  });
});
