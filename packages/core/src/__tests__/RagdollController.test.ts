import { describe, it, expect, beforeEach } from 'vitest';
import { RagdollController } from '@holoscript/engine/physics/RagdollController';

// =============================================================================
// C268 — Ragdoll Controller
// =============================================================================

describe('RagdollController', () => {
  let rag: RagdollController;
  beforeEach(() => {
    rag = new RagdollController();
  });

  it('addBone creates bone', () => {
    rag.addBone('spine', null, 5, 1);
    expect(rag.getBone('spine')).toBeDefined();
    expect(rag.getBoneCount()).toBe(1);
  });

  it('first parentless bone becomes root', () => {
    rag.addBone('spine', null, 5, 1);
    expect(rag.getRootBone()!.id).toBe('spine');
  });

  it('removeBone deletes bone', () => {
    rag.addBone('spine', null, 5, 1);
    expect(rag.removeBone('spine')).toBe(true);
    expect(rag.getBoneCount()).toBe(0);
  });

  it('getChildren returns child bones', () => {
    rag.addBone('spine', null, 5, 1);
    rag.addBone('head', 'spine', 3, 0.5);
    rag.addBone('arm_l', 'spine', 2, 0.8);
    expect(rag.getChildren('spine')).toHaveLength(2);
  });

  it('default state is active', () => {
    expect(rag.getState()).toBe('active');
  });

  it('goRagdoll changes state', () => {
    rag.goRagdoll();
    expect(rag.getState()).toBe('ragdoll');
    expect(rag.getBlendFactor()).toBe(1);
  });

  it('activate resets to active', () => {
    rag.goRagdoll();
    rag.activate();
    expect(rag.getState()).toBe('active');
    expect(rag.getBlendFactor()).toBe(0);
  });

  it('startBlend transitions to ragdoll', () => {
    rag.startBlend(true);
    expect(rag.getState()).toBe('blending');
    rag.update(1); // blendSpeed=2, dt=1 → blendFactor >= 1
    expect(rag.getState()).toBe('ragdoll');
  });

  it('update in active state does not move bones', () => {
    rag.addBone('spine', null, 5, 1);
    const before = { ...rag.getBone('spine')!.position };
    rag.update(0.016);
    expect(rag.getBone('spine')!.position).toEqual(before);
  });

  it('ragdoll state applies gravity', () => {
    rag.addBone('spine', null, 5, 1);
    rag.goRagdoll();
    rag.update(0.1);
    expect(rag.getBone('spine')!.position[1]).toBeLessThan(0);
  });

  it('applyImpulse changes velocity inversely with mass', () => {
    rag.addBone('spine', null, 10, 1);
    rag.applyImpulse('spine', [100, 0, 0]);
    expect(rag.getBone('spine')!.velocity[0]).toBe(10); // 100/10
  });

  it('constraint solving maintains bone distance', () => {
    rag.addBone('spine', null, 5, 1);
    rag.addBone('head', 'spine', 3, 0.5);
    rag.goRagdoll();
    // Apply large impulse to head only
    rag.applyImpulse('head', [0, 100, 0]);
    rag.update(0.1);
    const spine = rag.getBone('spine')!.position;
    const head = rag.getBone('head')!.position;
    const dist = Math.sqrt(
      (head[0] - spine[0]) ** 2 + (head[1] - spine[1]) ** 2 + (head[2] - spine[2]) ** 2
    );
    // Distance should be constrained close to bone length (0.5)
    expect(dist).toBeCloseTo(0.5, 0);
  });
});
