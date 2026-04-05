/**
 * RagdollSystem — Production Test Suite
 *
 * Covers: createRagdoll, createHumanoid, createQuadruped, removeRagdoll,
 * getRagdoll, getTotalMass, bone chain and constraint generation.
 */
import { describe, it, expect } from 'vitest';
import { RagdollSystem, HUMANOID_PRESET, QUADRUPED_PRESET } from '../RagdollSystem';

describe('RagdollSystem — Production', () => {
  const origin = { x: 0, y: 5, z: 0 };

  // ─── Humanoid ─────────────────────────────────────────────────────
  it('createHumanoid generates correct bone count', () => {
    const rs = new RagdollSystem();
    const ragdoll = rs.createHumanoid('hero', origin);
    expect(ragdoll.bodies.length).toBe(HUMANOID_PRESET.length);
  });

  it('humanoid has constraints for each non-root bone', () => {
    const rs = new RagdollSystem();
    const ragdoll = rs.createHumanoid('hero', origin);
    const childBones = HUMANOID_PRESET.filter((b) => b.parentBone);
    expect(ragdoll.constraints.length).toBe(childBones.length);
  });

  it('humanoid root position is set', () => {
    const rs = new RagdollSystem();
    const ragdoll = rs.createHumanoid('hero', { x: 1, y: 2, z: 3 });
    expect(ragdoll.rootPosition).toEqual({ x: 1, y: 2, z: 3 });
  });

  // ─── Quadruped ────────────────────────────────────────────────────
  it('createQuadruped generates correct bone count', () => {
    const rs = new RagdollSystem();
    const ragdoll = rs.createQuadruped('dog', origin);
    expect(ragdoll.bodies.length).toBe(QUADRUPED_PRESET.length);
  });

  it('quadruped has constraints for each non-root bone', () => {
    const rs = new RagdollSystem();
    const ragdoll = rs.createQuadruped('dog', origin);
    const childBones = QUADRUPED_PRESET.filter((b) => b.parentBone);
    expect(ragdoll.constraints.length).toBe(childBones.length);
  });

  // ─── Get / Remove ─────────────────────────────────────────────────
  it('getRagdoll returns created ragdoll', () => {
    const rs = new RagdollSystem();
    rs.createHumanoid('hero', origin);
    expect(rs.getRagdoll('hero')).toBeDefined();
    expect(rs.getRagdoll('villain')).toBeUndefined();
  });

  it('removeRagdoll cleans up', () => {
    const rs = new RagdollSystem();
    rs.createHumanoid('hero', origin);
    expect(rs.removeRagdoll('hero')).toBe(true);
    expect(rs.getRagdoll('hero')).toBeUndefined();
  });

  it('removeRagdoll returns false for missing', () => {
    const rs = new RagdollSystem();
    expect(rs.removeRagdoll('ghost')).toBe(false);
  });

  // ─── Total Mass ───────────────────────────────────────────────────
  it('getTotalMass sums all bone masses', () => {
    const rs = new RagdollSystem();
    rs.createHumanoid('hero', origin);
    const expected = HUMANOID_PRESET.reduce((sum, b) => sum + b.mass, 0);
    expect(rs.getTotalMass('hero')).toBeCloseTo(expected, 1);
  });

  it('getTotalMass returns 0 for missing ragdoll', () => {
    const rs = new RagdollSystem();
    expect(rs.getTotalMass('ghost')).toBe(0);
  });

  // ─── Constraint Types ─────────────────────────────────────────────
  it('humanoid includes both cone and hinge constraints', () => {
    const rs = new RagdollSystem();
    const ragdoll = rs.createHumanoid('hero', origin);
    const types = new Set(ragdoll.constraints.map((c) => c.type));
    expect(types.has('cone')).toBe(true);
    expect(types.has('hinge')).toBe(true);
  });
});
