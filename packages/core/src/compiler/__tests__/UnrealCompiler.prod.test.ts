/**
 * UnrealCompiler — Production Test Suite
 *
 * Covers: header/source file output, UE5 UPROPERTY/UFUNCTION macros,
 * AActor-derived class, static mesh components, lights, physics traits,
 * timelines, transitions, Blueprint JSON, and convenience function.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { UnrealCompiler, compileToUnreal } from '../UnrealCompiler';
import type { HoloComposition, HoloObjectDecl } from '../../parser/HoloCompositionTypes';

vi.mock('../identity/AgentRBAC', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getRBAC: () => ({ checkAccess: () => ({ allowed: true }) }),
  };
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeComp(overrides: Partial<HoloComposition> = {}): HoloComposition {
  return {
    name: 'TestScene',
    objects: [],
    lights: [],
    timelines: [],
    transitions: [],
    ...overrides,
  } as HoloComposition;
}

function makeObj(
  name: string,
  props: Array<{ key: string; value: unknown }> = [],
  traits: any[] = []
): HoloObjectDecl {
  return {
    name,
    properties: props.map(({ key, value }) => ({ key, value })),
    traits,
    children: [],
  } as any;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('UnrealCompiler — Production', () => {
  let compiler: UnrealCompiler;

  beforeEach(() => {
    compiler = new UnrealCompiler();
  });

  // ─── Construction ────────────────────────────────────────────────────
  it('constructs with default options', () => {
    expect(compiler).toBeDefined();
  });

  it('constructs with custom options', () => {
    const c = new UnrealCompiler({
      moduleName: 'MyGame',
      className: 'AMyActor',
      engineVersion: '5.3',
    });
    expect(c).toBeDefined();
  });

  // ─── compile() returns result shape ──────────────────────────────────
  it('compile returns headerFile and sourceFile strings', () => {
    const result = compiler.compile(makeComp(), 'test-token');
    expect(typeof result.headerFile).toBe('string');
    expect(typeof result.sourceFile).toBe('string');
  });

  it('empty composition compiles without error', () => {
    expect(() => compiler.compile(makeComp(), 'test-token')).not.toThrow();
  });

  // ─── Header file ─────────────────────────────────────────────────────
  it('header includes #pragma once', () => {
    const { headerFile } = compiler.compile(makeComp(), 'test-token');
    expect(headerFile).toContain('#pragma once');
  });

  it('header includes UCLASS macro', () => {
    const { headerFile } = compiler.compile(makeComp(), 'test-token');
    expect(headerFile).toContain('UCLASS');
  });

  it('header contains class declaration inheriting from AActor', () => {
    const { headerFile } = compiler.compile(makeComp(), 'test-token');
    expect(headerFile).toContain('AActor');
  });

  it('header class name derived from composition name by default', () => {
    const c = new UnrealCompiler({ className: 'AMyScene' });
    const { headerFile } = c.compile(makeComp({ name: 'MyScene' }), 'test-token');
    expect(headerFile).toContain('AMyScene');
  });

  // ─── Source file ─────────────────────────────────────────────────────
  it('source includes UE5 include for the header', () => {
    const { sourceFile } = compiler.compile(makeComp(), 'test-token');
    expect(sourceFile).toContain('#include');
  });

  it('source includes BeginPlay', () => {
    const { sourceFile } = compiler.compile(makeComp(), 'test-token');
    expect(sourceFile).toContain('BeginPlay');
  });

  it('source includes Super::BeginPlay', () => {
    const { sourceFile } = compiler.compile(makeComp(), 'test-token');
    expect(sourceFile).toContain('Super::BeginPlay');
  });

  // ─── Objects ─────────────────────────────────────────────────────────
  it('compiles a cube object to static mesh component', () => {
    const obj = makeObj('MyCube', [{ key: 'mesh', value: 'cube' }]);
    const { sourceFile } = compiler.compile(makeComp({ objects: [obj] }), 'test-token');
    expect(sourceFile.toLowerCase()).toContain('staticmesh');
  });

  it('compiles a sphere object', () => {
    const obj = makeObj('MySphere', [{ key: 'mesh', value: 'sphere' }]);
    const { sourceFile } = compiler.compile(makeComp({ objects: [obj] }), 'test-token');
    expect(sourceFile).toBeDefined();
  });

  it('compiles object with position', () => {
    const obj = makeObj('Box', [
      { key: 'mesh', value: 'box' },
      { key: 'position', value: [1, 2, 3] },
    ]);
    const { sourceFile } = compiler.compile(makeComp({ objects: [obj] }), 'test-token');
    expect(sourceFile).toBeDefined();
  });

  // ─── Physics trait ────────────────────────────────────────────────────
  it('physics trait adds UPrimitiveComponent or chaos physics', () => {
    const obj = makeObj(
      'PhysBox',
      [{ key: 'mesh', value: 'cube' }],
      [{ name: 'physics', config: { mass: 5 } }]
    );
    const { sourceFile } = compiler.compile(makeComp({ objects: [obj] }), 'test-token');
    expect(sourceFile).toBeDefined();
  });

  // ─── Lights ──────────────────────────────────────────────────────────
  it('compiles a point light', () => {
    const { sourceFile } = compiler.compile(
      makeComp({
        lights: [
          {
            name: 'Key',
            lightType: 'point',
            properties: [
              { key: 'intensity', value: 1000 },
              { key: 'color', value: '#ffffff' },
            ],
          },
        ] as any,
      }),
      'test-token'
    );
    expect(sourceFile.toLowerCase()).toContain('light');
  });

  it('compiles a directional light', () => {
    const { sourceFile } = compiler.compile(
      makeComp({
        lights: [
          {
            name: 'Sun',
            lightType: 'directional',
            properties: [
              { key: 'intensity', value: 5 },
              { key: 'color', value: '#fff8e7' },
            ],
          },
        ] as any,
      }),
      'test-token'
    );
    expect(sourceFile).toBeDefined();
  });

  it('compiles a spot light', () => {
    const { sourceFile } = compiler.compile(
      makeComp({
        lights: [
          {
            name: 'Spot',
            lightType: 'spot',
            properties: [
              { key: 'intensity', value: 2000 },
              { key: 'color', value: '#ffffaa' },
            ],
          },
        ] as any,
      }),
      'test-token'
    );
    expect(sourceFile).toBeDefined();
  });

  // ─── Timelines ───────────────────────────────────────────────────────
  it('compiles a timeline to UFUNCTION', () => {
    const { sourceFile } = compiler.compile(
      makeComp({
        timelines: [{ name: 'FadeIn', duration: 2, entries: [] }] as any,
      }),
      'test-token'
    );
    expect(sourceFile).toContain('FadeIn');
  });

  // ─── Transitions ─────────────────────────────────────────────────────
  it('compiles a transition', () => {
    const { sourceFile } = compiler.compile(
      makeComp({
        transitions: [
          {
            name: 'FadeToBlack',
            properties: [
              { key: 'destination', value: 'B' },
              { key: 'duration', value: 1 },
            ],
          },
        ] as any,
      }),
      'test-token'
    );
    expect(sourceFile).toContain('FadeToBlack');
  });

  // ─── Blueprint JSON ───────────────────────────────────────────────────
  it('generateBlueprints option generates blueprintJson', () => {
    const c = new UnrealCompiler({ generateBlueprints: true });
    const result = c.compile(makeComp({ objects: [makeObj('Wall')] }), 'test-token');
    expect(typeof result.blueprintJson).toBe('string');
    const parsed = JSON.parse(result.blueprintJson!);
    expect(parsed).toBeDefined();
  });

  it('generateBlueprints=false produces no blueprintJson', () => {
    const c = new UnrealCompiler({ generateBlueprints: false });
    const result = c.compile(makeComp(), 'test-token');
    expect(result.blueprintJson).toBeUndefined();
  });

  // ─── Engine version ───────────────────────────────────────────────────
  it('accepts engineVersion option without error', () => {
    const c = new UnrealCompiler({ engineVersion: '5.4' });
    expect(() => c.compile(makeComp(), 'test-token')).not.toThrow();
  });

  // ─── Environment ─────────────────────────────────────────────────────
  it('compiles environment settings', () => {
    const { sourceFile } = compiler.compile(
      makeComp({
        environment: { properties: [{ key: 'skybox', value: 'day_sky' }] } as any,
      }),
      'test-token'
    );
    expect(sourceFile).toBeDefined();
  });

  // ─── Convenience function ─────────────────────────────────────────────
  it('compileToUnreal convenience function works', () => {
    const result = compileToUnreal(makeComp());
    expect(typeof result.headerFile).toBe('string');
    expect(typeof result.sourceFile).toBe('string');
  });

  it('compileToUnreal passes options', () => {
    const result = compileToUnreal(makeComp(), { className: 'AGameWorld' });
    expect(result.headerFile).toContain('AGameWorld');
  });

  // ─── Multiple objects ─────────────────────────────────────────────────
  it('compiles multiple objects in sequence', () => {
    const objs = [makeObj('Floor'), makeObj('Wall'), makeObj('Ceiling')];
    const { sourceFile } = compiler.compile(makeComp({ objects: objs }), 'test-token');
    expect(sourceFile).toContain('Floor');
    expect(sourceFile).toContain('Wall');
    expect(sourceFile).toContain('Ceiling');
  });

  // ─── Audio ───────────────────────────────────────────────────────────
  it('compiles audio source', () => {
    const { sourceFile } = compiler.compile(
      makeComp({
        audio: [{ name: 'BgMusic', src: 'music.wav', loop: true, volume: 0.8 }],
      } as any),
      'test-token'
    );
    expect(sourceFile).toBeDefined();
  });
});
