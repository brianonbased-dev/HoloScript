import { describe, it, expect, beforeEach } from 'vitest';
import { RagdollSystem, HUMANOID_PRESET, QUADRUPED_PRESET } from '@holoscript/core';

describe('RagdollSystem', () => {
  let sys: RagdollSystem;

  beforeEach(() => {
    sys = new RagdollSystem();
  });

  it('creates humanoid ragdoll with correct bone count', () => {
    const rd = sys.createHumanoid('h1', { x: 0, y: 5, z: 0 });
    expect(rd.id).toBe('h1');
    expect(rd.bodies.length).toBe(HUMANOID_PRESET.length);
    expect(rd.rootPosition).toEqual({ x: 0, y: 5, z: 0 });
  });

  it('creates quadruped ragdoll', () => {
    const rd = sys.createQuadruped('q1', { x: 0, y: 2, z: 0 });
    expect(rd.bodies.length).toBe(QUADRUPED_PRESET.length);
  });

  it('getRagdoll retrieves by ID', () => {
    sys.createHumanoid('h2', { x: 0, y: 0, z: 0 });
    expect(sys.getRagdoll('h2')).toBeDefined();
    expect(sys.getRagdoll('missing')).toBeUndefined();
  });

  it('removeRagdoll deletes ragdoll', () => {
    sys.createHumanoid('h3', { x: 0, y: 0, z: 0 });
    expect(sys.removeRagdoll('h3')).toBe(true);
    expect(sys.getRagdoll('h3')).toBeUndefined();
  });

  it('removeRagdoll returns false for missing', () => {
    expect(sys.removeRagdoll('ghost')).toBe(false);
  });

  it('getTotalMass sums bone masses', () => {
    sys.createHumanoid('h4', { x: 0, y: 0, z: 0 });
    const mass = sys.getTotalMass('h4');
    const expectedMass = HUMANOID_PRESET.reduce((sum, b) => sum + b.mass, 0);
    expect(mass).toBeCloseTo(expectedMass, 0);
  });

  it('humanoid has constraints linking child to parent', () => {
    const rd = sys.createHumanoid('h5', { x: 0, y: 0, z: 0 });
    // bones with parents should have constraints
    const bonesWithParents = HUMANOID_PRESET.filter((b) => b.parentBone);
    expect(rd.constraints.length).toBe(bonesWithParents.length);
  });

  it('custom ragdoll definition works', () => {
    const rd = sys.createRagdoll(
      {
        id: 'custom',
        bones: [
          {
            id: 'torso',
            length: 0.5,
            radius: 0.1,
            mass: 10,
            localOffset: { x: 0, y: 0, z: 0 },
            jointType: 'cone' as const,
          },
          {
            id: 'head',
            parentBone: 'torso',
            length: 0.2,
            radius: 0.08,
            mass: 3,
            localOffset: { x: 0, y: 0.5, z: 0 },
            jointType: 'cone' as const,
          },
        ],
      },
      { x: 0, y: 0, z: 0 }
    );
    expect(rd.bodies.length).toBe(2);
    expect(rd.constraints.length).toBe(1);
  });
});

