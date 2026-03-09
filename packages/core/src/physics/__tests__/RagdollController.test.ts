import { describe, it, expect, beforeEach } from 'vitest';
import { RagdollController } from '../RagdollController';

describe('RagdollController', () => {
  let rc: RagdollController;

  beforeEach(() => {
    rc = new RagdollController();
  });

  // Bone management
  it('addBone creates bone', () => {
    const bone = rc.addBone('spine', null, 5, 0.5);
    expect(bone.id).toBe('spine');
    expect(bone.mass).toBe(5);
    expect(rc.getBoneCount()).toBe(1);
  });

  it('first bone with null parent becomes root', () => {
    rc.addBone('spine', null, 5, 0.5);
    expect(rc.getRootBone()?.id).toBe('spine');
  });

  it('removeBone deletes', () => {
    rc.addBone('spine', null, 5, 0.5);
    expect(rc.removeBone('spine')).toBe(true);
    expect(rc.getBoneCount()).toBe(0);
  });

  it('getBone returns undefined for missing', () => {
    expect(rc.getBone('nope')).toBeUndefined();
  });

  it('getChildren returns child bones', () => {
    rc.addBone('spine', null, 5, 0.5);
    rc.addBone('arm_l', 'spine', 2, 0.4);
    rc.addBone('arm_r', 'spine', 2, 0.4);
    expect(rc.getChildren('spine').length).toBe(2);
  });

  // State control
  it('starts in active state', () => {
    expect(rc.getState()).toBe('active');
    expect(rc.getBlendFactor()).toBe(0);
  });

  it('goRagdoll sets state and blend', () => {
    rc.goRagdoll();
    expect(rc.getState()).toBe('ragdoll');
    expect(rc.getBlendFactor()).toBe(1);
  });

  it('activate resets state', () => {
    rc.goRagdoll();
    rc.activate();
    expect(rc.getState()).toBe('active');
    expect(rc.getBlendFactor()).toBe(0);
  });

  it('startBlend sets blending state', () => {
    rc.startBlend(true);
    expect(rc.getState()).toBe('blending');
    expect(rc.getBlendFactor()).toBe(0);
  });

  // Physics update
  it('update in active state does nothing to bones', () => {
    rc.addBone('spine', null, 5, 0.5);
    rc.update(0.016);
    expect(rc.getBone('spine')!.position.y).toBe(0);
  });

  it('update in ragdoll applies gravity', () => {
    rc.addBone('spine', null, 5, 0.5);
    rc.goRagdoll();
    rc.update(0.1);
    expect(rc.getBone('spine')!.position.y).toBeLessThan(0);
  });

  it('blending transitions to ragdoll', () => {
    rc.addBone('spine', null, 5, 0.5);
    rc.startBlend(true);
    // Update enough to complete blend
    for (let i = 0; i < 100; i++) rc.update(0.016);
    expect(rc.getState()).toBe('ragdoll');
    expect(rc.getBlendFactor()).toBe(1);
  });

  it('damping reduces velocity', () => {
    rc.addBone('spine', null, 5, 0.5);
    rc.goRagdoll();
    rc.getBone('spine')!.velocity.x = 10;
    rc.update(0.016);
    expect(rc.getBone('spine')!.velocity.x).toBeLessThan(10);
  });

  // Constraint solving (parent-child distance)
  it('constraint keeps bones at bone length', () => {
    rc.addBone('spine', null, 5, 0.5);
    rc.addBone('head', 'spine', 2, 0.3);
    rc.goRagdoll();
    // Push head far away
    rc.getBone('head')!.position.y = 10;
    rc.update(0.016);
    // After solving, distance should be closer to bone length
    const dy = rc.getBone('head')!.position.y - rc.getBone('spine')!.position.y;
    expect(Math.abs(dy)).toBeLessThan(10);
  });

  // Impulse
  it('applyImpulse changes velocity', () => {
    rc.addBone('spine', null, 5, 0.5);
    rc.applyImpulse('spine', { x: 10, y: 0, z: 0 });
    expect(rc.getBone('spine')!.velocity.x).toBe(2); // 10/5
  });

  it('applyImpulse on unknown bone is no-op', () => {
    rc.applyImpulse('nope', { x: 10, y: 0, z: 0 }); // no throw
  });

  // Joint limits
  it('rotation clamped to joint limits', () => {
    rc.addBone('spine', null, 5, 0.5);
    rc.addBone('arm', 'spine', 2, 0.4, {
      min: { x: -0.5, y: -0.5, z: -0.5 },
      max: { x: 0.5, y: 0.5, z: 0.5 },
    });
    rc.goRagdoll();
    rc.getBone('arm')!.rotation.x = 10;
    rc.update(0.016);
    expect(rc.getBone('arm')!.rotation.x).toBeLessThanOrEqual(0.5);
  });

  // Config
  it('custom config', () => {
    const rc2 = new RagdollController({ gravity: -20, damping: 0.5 });
    rc2.addBone('spine', null, 5, 0.5);
    rc2.goRagdoll();
    rc2.update(0.1);
    // Stronger gravity = more fall
    expect(rc2.getBone('spine')!.position.y).toBeLessThanOrEqual(-0.1);
  });
});
