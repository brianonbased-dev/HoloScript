/**
 * Golden-output snapshot regression tests for the 5 priority compiler targets:
 *   UnityCompiler, WebGPUCompiler, BabylonCompiler, URDFCompiler,
 *   SDFCompiler, WASMCompiler
 *
 * HOW THIS WORKS
 * ──────────────
 * 1. Each test compiles a canonical HoloComposition and calls toMatchSnapshot().
 * 2. The first run (or --update-snapshots) writes the .snap files next to this file.
 * 3. Every subsequent CI run diffs against those committed snapshot files.
 *    Any output drift fails the job.
 *
 * TO UPDATE SNAPSHOTS (after an intentional compiler change):
 *   pnpm --filter @holoscript/core exec vitest run --update-snapshots \
 *     src/compiler/__tests__/golden-output/golden.test.ts
 *
 * NEVER edit the .snap files by hand — regenerate them with the command above.
 */

import { describe, it, expect, vi } from 'vitest';
import { UnityCompiler } from '../../UnityCompiler';
import { WebGPUCompiler } from '../../WebGPUCompiler';
import { BabylonCompiler } from '../../BabylonCompiler';
import { URDFCompiler } from '../../URDFCompiler';
import SDFCompiler from '../../SDFCompiler';
import { WASMCompiler } from '../../WASMCompiler';
import type {
  HoloComposition,
  HoloObjectDecl,
  HoloObjectTrait,
} from '../../../parser/HoloCompositionTypes';

// Same RBAC mock used by all individual compiler tests
vi.mock('../../identity/AgentRBAC', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getRBAC: () => ({ checkAccess: () => ({ allowed: true }) }),
  };
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeTrait(name: string): HoloObjectTrait {
  return { type: 'ObjectTrait', name, config: {} };
}

function makeObject(
  name: string,
  geometry: string,
  traits: string[],
  extraProps: Array<{ key: string; value: unknown }> = [],
): HoloObjectDecl {
  return {
    type: 'Object',
    name,
    properties: [
      { key: 'geometry', value: geometry },
      ...extraProps,
    ] as any,
    traits: traits.map(makeTrait),
  } as HoloObjectDecl;
}

// ─── Canonical composition ────────────────────────────────────────────────────
//
// This is the single stable input used by every golden test.  It is intentionally
// rich enough to exercise meaningful compiler paths (state, traits, multiple objects,
// mixed geometry types) while staying deterministic.
//
// RULE: only ADD to this composition or create variant scenes — never mutate
// existing fields, as that would change ALL snapshot baselines at once.

const CANONICAL: HoloComposition = {
  type: 'Composition',
  name: 'GoldenScene',
  state: {
    type: 'State',
    properties: [
      { type: 'StateProperty', key: 'score', value: 0 },
      { type: 'StateProperty', key: 'lives', value: 3 },
      { type: 'StateProperty', key: 'active', value: true },
      { type: 'StateProperty', key: 'playerName', value: 'Hero' },
    ],
  } as any,
  objects: [
    makeObject('hero', 'humanoid', ['@grabbable', '@collidable', '@networked'], [
      { key: 'color', value: '#00ffcc' },
      { key: 'position', value: [0, 1.6, 0] },
    ]),
    makeObject('platform', 'cube', ['@collidable', '@physics'], [
      { key: 'scale', value: [5, 0.1, 5] },
      { key: 'position', value: [0, 0, 0] },
    ]),
    makeObject('collectible', 'sphere', ['@grabbable', '@glowing'], [
      { key: 'color', value: '#ffcc00' },
      { key: 'position', value: [2, 1, -3] },
    ]),
  ],
  templates: [],
  spatialGroups: [],
  lights: [],
  imports: [],
  timelines: [],
  audio: [],
  zones: [],
  transitions: [],
  conditionals: [],
  iterators: [],
  npcs: [],
  quests: [],
  abilities: [],
  dialogues: [],
  stateMachines: [],
  achievements: [],
  talentTrees: [],
  shapes: [],
} as HoloComposition;

// Fixed token — must never be undefined so RBAC paths are stable
const TOKEN = 'golden-test-token';

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Compiler golden-output regression', () => {
  // ── Unity ──────────────────────────────────────────────────────────────────
  it('Unity: canonical scene → C#', () => {
    const compiler = new UnityCompiler();
    const output = compiler.compile(CANONICAL, TOKEN);
    expect(typeof output).toBe('string');
    expect(output).toMatchSnapshot();
  });

  // ── WebGPU ─────────────────────────────────────────────────────────────────
  it('WebGPU: canonical scene → WebGPU JS', () => {
    const compiler = new WebGPUCompiler();
    const output = compiler.compile(CANONICAL, TOKEN);
    expect(typeof output).toBe('string');
    expect(output).toMatchSnapshot();
  });

  // ── Babylon ────────────────────────────────────────────────────────────────
  it('Babylon: canonical scene → Babylon.js', () => {
    const compiler = new BabylonCompiler();
    const output = compiler.compile(CANONICAL, TOKEN);
    expect(typeof output).toBe('string');
    expect(output).toMatchSnapshot();
  });

  // ── URDF ───────────────────────────────────────────────────────────────────
  it('URDF: canonical scene → URDF XML', () => {
    const compiler = new URDFCompiler();
    const output = compiler.compile(CANONICAL, TOKEN);
    expect(typeof output).toBe('string');
    // Confirm valid XML envelope before snapshot check
    expect(output).toContain('<?xml');
    expect(output).toContain('<robot');
    expect(output).toMatchSnapshot();
  });

  // ── SDF ────────────────────────────────────────────────────────────────────
  it('SDF: canonical scene → SDF XML', () => {
    const compiler = new SDFCompiler();
    const output = compiler.compile(CANONICAL, TOKEN);
    expect(typeof output).toBe('string');
    expect(output).toContain('<?xml');
    expect(output).toMatchSnapshot();
  });

  // ── WASM ───────────────────────────────────────────────────────────────────
  it('WASM: canonical scene → WAT source', () => {
    const compiler = new WASMCompiler();
    const result = compiler.compile(CANONICAL, TOKEN);
    // Confirm WAT structure before snapshot check
    expect(result.wat).toContain('(module');
    // Snapshot the WAT text — this is the primary regression artefact
    expect(result.wat).toMatchSnapshot();
    // Snapshot the exports list to catch API surface regressions
    expect(result.exports).toMatchSnapshot();
  });
});
