import { describe, it, expect } from 'vitest';
import {
  classifyRole,
  deriveGameSpec,
  compileCanvas2DGame,
  type CG2DComposition,
} from '../Canvas2DGameCompiler';

// A GOLD-like composition (player + collectibles + hazard + goal, three tiers).
const goldLike: CG2DComposition = {
  name: 'GOLD — The Vault',
  environment: { gravity: [0, -9.81, 0] },
  templates: [
    { name: 'HumanCurator', traits: [{ name: 'controllable' }, { name: 'physics' }, { name: 'collidable' }] },
    { name: 'AgentCurator', traits: [{ name: 'ai_agent' }, { name: 'physics' }, { name: 'collidable' }] },
    { name: 'KnowledgeEntry', traits: [{ name: 'grabbable' }, { name: 'interactive' }, { name: 'physics' }] },
    { name: 'Archivist', traits: [{ name: 'ai_agent' }, { name: 'dialogue' }, { name: 'collidable' }] },
    { name: 'VaultCollision', traits: [{ name: 'interactive' }, { name: 'collidable' }] },
  ],
  spatialGroups: [
    {
      name: 'BronzeValley',
      origin: [0, 0, 0],
      objects: [
        { name: 'Player', template: 'HumanCurator', position: [0, 1, 0], color: '#3a6ea5' },
        { name: 'Companion', template: 'AgentCurator', position: [2, 1, 0], color: '#a55a3a' },
        { name: 'Entry1', template: 'KnowledgeEntry', position: [-1, 0.5, 1], color: '#cd7f32' },
        { name: 'Guardian', template: 'VaultCollision', position: [1, 0.5, 2], color: '#8a2a2a' },
      ],
    },
    {
      name: 'GoldTerrace',
      origin: [0, 4, -8],
      objects: [{ name: 'Entry2', template: 'KnowledgeEntry', position: [-1, 0.5, 0], color: '#d4af37' }],
    },
    {
      name: 'DiamondPeak',
      origin: [0, 9, -16],
      objects: [{ name: 'Archivist', template: 'Archivist', position: [-2, 0, 1], color: '#7a5a8a' }],
    },
  ],
};

// A DELIBERATELY DIFFERENT composition: a single-tier "lab" with two players?
// No — exactly one controllable. Different names, different trait spread, more
// collectibles, two hazards, no goal NPC. If the compiler were a hardcode of the
// GOLD scene, this would misclassify or produce identical output.
const labLike: CG2DComposition = {
  name: 'Specimen Lab',
  environment: { gravity: [0, -3.0, 0] }, // low gravity → different physics
  templates: [
    { name: 'Scientist', traits: [{ name: 'controllable' }] },
    { name: 'Sample', traits: [{ name: 'grabbable' }] },
    { name: 'Drone', traits: [{ name: 'collidable' }] },
  ],
  spatialGroups: [
    {
      name: 'FloorA',
      origin: [0, 0, 0],
      objects: [
        { name: 'Doc', template: 'Scientist', position: [0, 1, 0], color: '#3a6ea5' },
        { name: 'S1', template: 'Sample', position: [1, 0.5, 0], color: '#2e5e3a' },
        { name: 'S2', template: 'Sample', position: [-1, 0.5, 0], color: '#2e5e3a' },
        { name: 'S3', template: 'Sample', position: [2, 0.5, 0], color: '#2e5e3a' },
        { name: 'D1', template: 'Drone', position: [1, 0.5, 1], color: '#8a2a2a' },
        { name: 'D2', template: 'Drone', position: [-2, 0.5, 1], color: '#8a2a2a' },
      ],
    },
    {
      name: 'Mezzanine',
      origin: [0, 5, -5],
      objects: [{ name: 'S4', template: 'Sample', position: [0, 0.5, 0], color: '#2e5e3a' }],
    },
  ],
};

describe('classifyRole — trait → game role (generic precedence)', () => {
  it('controllable wins → player', () => {
    expect(classifyRole(new Set(['controllable', 'physics', 'collidable']))).toBe('player');
  });
  it('dialogue → goal (even with ai_agent + collidable)', () => {
    expect(classifyRole(new Set(['ai_agent', 'dialogue', 'collidable']))).toBe('goal');
  });
  it('grabbable → collectible', () => {
    expect(classifyRole(new Set(['grabbable', 'interactive', 'physics']))).toBe('collectible');
  });
  it('ai_agent (no goal) → npc, NOT a hazard', () => {
    expect(classifyRole(new Set(['ai_agent', 'physics', 'collidable']))).toBe('npc');
  });
  it('collidable only → hazard', () => {
    expect(classifyRole(new Set(['interactive', 'collidable']))).toBe('hazard');
  });
  it('no gameplay traits → decor', () => {
    expect(classifyRole(new Set(['physics']))).toBe('decor');
  });
});

describe('deriveGameSpec — GOLD composition', () => {
  const g = deriveGameSpec(goldLike);
  it('finds exactly the 2 knowledge entries as collectibles', () => {
    expect(g.collectibles).toHaveLength(2);
  });
  it('classifies the VaultCollision as a hazard (companion is NOT a hazard)', () => {
    expect(g.hazards).toHaveLength(1);
    expect(g.npcs).toHaveLength(1); // the AgentCurator companion
  });
  it('finds the Archivist as the goal', () => {
    expect(g.goal).not.toBeNull();
  });
  it('maps three spatial groups to three tiers', () => {
    expect(g.tiers).toHaveLength(3);
  });
  it('derives gravity from environment (≈9.81 → ~0.5)', () => {
    expect(g.gravity).toBeGreaterThan(0.45);
    expect(g.gravity).toBeLessThanOrEqual(0.5);
  });
});

describe('deriveGameSpec — a DIFFERENT composition (proves genericity, not hardcode)', () => {
  const g = deriveGameSpec(labLike);
  it('finds 4 samples as collectibles', () => {
    expect(g.collectibles).toHaveLength(4);
  });
  it('finds 2 drones as hazards', () => {
    expect(g.hazards).toHaveLength(2);
  });
  it('has no goal NPC (no @dialogue entity present)', () => {
    expect(g.goal).toBeNull();
  });
  it('maps the two floors to two tiers', () => {
    expect(g.tiers).toHaveLength(2);
  });
  it('derives a DIFFERENT (lower) gravity than the GOLD scene', () => {
    expect(g.gravity).toBeLessThan(deriveGameSpec(goldLike).gravity);
  });
});

describe('compileCanvas2DGame — emitted HTML', () => {
  const html = compileCanvas2DGame(goldLike, { title: 'GOLD' }, '{"meshes":[],"regions":[]}');
  it('embeds SCENE (modality-verify contract)', () => {
    expect(html).toMatch(/SCENE\s*=/);
  });
  it('is a pixelated retro canvas with no WebGL (modality-verify)', () => {
    expect(html).toMatch(/image-rendering\s*:\s*pixelated/);
    expect(html).not.toMatch(/WebGLRenderer/);
  });
  it('ships keyboard input (gate-15 contract)', () => {
    expect(html).toMatch(/keydown/);
  });
  it('is deterministic (same input → byte-identical output)', () => {
    const a = compileCanvas2DGame(goldLike, { title: 'GOLD' }, '{"meshes":[],"regions":[]}');
    const b = compileCanvas2DGame(goldLike, { title: 'GOLD' }, '{"meshes":[],"regions":[]}');
    expect(a).toBe(b);
  });
  it('produces DIFFERENT output for a different composition', () => {
    const lab = compileCanvas2DGame(labLike, { title: 'Lab' }, '{"meshes":[],"regions":[]}');
    expect(lab).not.toBe(html);
  });
});
