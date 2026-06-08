import { describe, it, expect } from 'vitest';
import { Canvas2DGameCompiler, normalizeHoloComposition } from '../Canvas2DGameCompilerTarget';
import {
  isValidCompilerName,
  getDomainForCompiler,
  getRiskTierForCompiler,
  COMPILER_ANS_MAP,
} from '../identity/ANSNamespace';

describe('ANS registration — canvas2d-game is a first-class compiler', () => {
  it('is a valid compiler name', () => {
    expect(isValidCompilerName('canvas2d-game')).toBe(true);
  });
  it('belongs to the gamedev domain', () => {
    expect(getDomainForCompiler('canvas2d-game')).toBe('gamedev');
  });
  it('is STANDARD risk (self-contained HTML, no device access)', () => {
    expect(getRiskTierForCompiler('canvas2d-game')).toBe('STANDARD');
  });
  it('maps to the /compile/gamedev/canvas2d-game capability path', () => {
    expect(COMPILER_ANS_MAP['canvas2d-game']).toBe('/compile/gamedev/canvas2d-game');
  });
});

// Parser-shaped composition: positions/colors live in `properties`, traits on
// templates, gravity in environment.properties — exactly what parseHolo emits.
const rawComposition = {
  name: 'GOLD — The Vault',
  templates: [
    { name: 'HumanCurator', traits: [{ name: 'controllable' }, { name: 'collidable' }] },
    { name: 'KnowledgeEntry', traits: [{ name: 'grabbable' }] },
    { name: 'VaultCollision', traits: [{ name: 'collidable' }] },
    { name: 'Archivist', traits: [{ name: 'dialogue' }] },
  ],
  spatialGroups: [
    {
      name: 'BronzeValley',
      properties: [{ key: 'origin', value: [0, 0, 0] }],
      objects: [
        {
          name: 'Player',
          template: 'HumanCurator',
          properties: [
            { key: 'position', value: [0, 1, 0] },
            { key: 'color', value: '#3a6ea5' },
          ],
        },
        {
          name: 'Entry1',
          template: 'KnowledgeEntry',
          properties: [
            { key: 'position', value: [-1, 0.5, 1] },
            { key: 'color', value: '#cd7f32' },
          ],
        },
        {
          name: 'Guardian',
          template: 'VaultCollision',
          properties: [{ key: 'position', value: [1, 0.5, 2] }],
        },
      ],
    },
    {
      name: 'DiamondPeak',
      properties: [{ key: 'origin', value: [0, 9, -16] }],
      objects: [
        {
          name: 'TheArchivist',
          template: 'Archivist',
          properties: [{ key: 'position', value: [-2, 0, 1] }],
        },
      ],
    },
  ],
  environment: { properties: [{ key: 'gravity', value: [0, -9.81, 0] }] },
};

describe('normalizeHoloComposition — parser AST → flat CG2D', () => {
  const norm = normalizeHoloComposition(rawComposition);
  it('flattens object position/color out of properties', () => {
    const player = norm.spatialGroups![0].objects![0];
    expect(player.position).toEqual([0, 1, 0]);
    expect(player.color).toBe('#3a6ea5');
  });
  it('resolves group origin from properties', () => {
    expect(norm.spatialGroups![1].origin).toEqual([0, 9, -16]);
  });
  it('keeps template traits', () => {
    expect(norm.templates![0].traits!.map((t) => t.name)).toContain('controllable');
  });
  it('extracts gravity from environment.properties', () => {
    expect(norm.environment!.gravity).toEqual([0, -9.81, 0]);
  });
});

describe('Canvas2DGameCompiler.compile — standard compiler interface', () => {
  const compiler = new Canvas2DGameCompiler();
  // No token → RBAC validation is a no-op (dev/test), like the rest of the family.
  const html = compiler.compile(rawComposition as never);

  it('returns a self-contained HTML game string', () => {
    expect(typeof html).toBe('string');
    expect(html).toMatch(/<canvas/);
  });
  it('embeds SCENE + ships keyboard input (verifier contracts)', () => {
    expect(html).toMatch(/SCENE\s*=/);
    expect(html).toMatch(/keydown/);
  });
  it('is a pixelated retro canvas with no WebGL', () => {
    expect(html).toMatch(/image-rendering\s*:\s*pixelated/);
    expect(html).not.toMatch(/WebGLRenderer/);
  });
  it('classified the scene from traits (player spawn, gem, hazard, goal present in GAME)', () => {
    // GAME is injected as a JSON literal; assert the derived spec made it in.
    const m = html.match(/const GAME = (\{.*?\});/);
    expect(m).not.toBeNull();
    const game = JSON.parse(m![1]);
    expect(game.collectibles).toHaveLength(1);
    expect(game.hazards).toHaveLength(1);
    expect(game.goal).not.toBeNull();
    expect(game.tiers).toHaveLength(2);
  });
});
