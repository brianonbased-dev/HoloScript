/**
 * VisionOSCompiler — Production Test Suite
 *
 * Covers: Swift/RealityKit output, ImmersiveSpace, RealityView,
 * objects, lights, audio, zones, timelines, transitions, UI components.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { VisionOSCompiler } from '../VisionOSCompiler';
import type { HoloComposition, HoloObjectDecl } from '../../parser/HoloCompositionTypes';

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

function makeObj(name: string, props: Array<{ key: string; value: unknown }> = [], traits: any[] = []): HoloObjectDecl {
  return {
    name,
    properties: props.map(({ key, value }) => ({ key, value })),
    traits,
    children: [],
  } as any;
}

describe('VisionOSCompiler — Production', () => {
  let compiler: VisionOSCompiler;

  beforeEach(() => {
    compiler = new VisionOSCompiler();
  });

  // ─── Construction ────────────────────────────────────────────────────
  it('constructs with default options', () => {
    expect(compiler).toBeDefined();
  });

  it('constructs with custom options', () => {
    const c = new VisionOSCompiler({ structName: 'MyScene', useRealityComposerPro: true });
    expect(c).toBeDefined();
  });

  // ─── compile() ────────────────────────────────────────────────────────
  it('compile returns a string', () => {
    const out = compiler.compile(makeComp());
    expect(typeof out).toBe('string');
    expect(out.length).toBeGreaterThan(0);
  });

  it('empty composition compiles without error', () => {
    expect(() => compiler.compile(makeComp())).not.toThrow();
  });

  // ─── Swift/RealityKit structure ────────────────────────────────────────
  it('output contains import RealityKit', () => {
    const out = compiler.compile(makeComp());
    expect(out).toContain('RealityKit');
  });

  it('output contains SwiftUI import', () => {
    const out = compiler.compile(makeComp());
    expect(out).toContain('SwiftUI');
  });

  it('output contains struct definition', () => {
    const out = compiler.compile(makeComp());
    expect(out).toContain('struct');
  });

  it('output contains RealityView', () => {
    const out = compiler.compile(makeComp());
    expect(out).toContain('RealityView');
  });

  // ─── Struct name ───────────────────────────────────────────────────────
  it('custom structName appears in output', () => {
    const c = new VisionOSCompiler({ structName: 'MyImmersiveScene' });
    const out = c.compile(makeComp());
    expect(out).toContain('MyImmersiveScene');
  });

  // ─── Objects ─────────────────────────────────────────────────────────
  it('compiles a cube mesh object', () => {
    const obj = makeObj('MyCube', [{ key: 'mesh', value: 'cube' }]);
    const out = compiler.compile(makeComp({ objects: [obj] }));
    expect(out).toContain('MyCube');
  });

  it('compiles a sphere mesh object', () => {
    const obj = makeObj('Orb', [{ key: 'mesh', value: 'sphere' }]);
    const out = compiler.compile(makeComp({ objects: [obj] }));
    expect(out).toContain('Orb');
  });

  it('compiles object with position', () => {
    const obj = makeObj('Platform', [
      { key: 'mesh', value: 'plane' },
      { key: 'position', value: [0, -0.5, -2] },
    ]);
    const out = compiler.compile(makeComp({ objects: [obj] }));
    expect(out).toBeDefined();
  });

  it('compiles object with material', () => {
    const obj = makeObj('GoldBall', [
      { key: 'mesh', value: 'sphere' },
      { key: 'material', value: 'gold' },
    ]);
    const out = compiler.compile(makeComp({ objects: [obj] }));
    expect(out).toBeDefined();
  });

  // ─── Physics trait ────────────────────────────────────────────────────
  it('physics trait compiles without error', () => {
    const obj = makeObj('PhysBox', [{ key: 'mesh', value: 'cube' }], [{ name: 'physics', config: {} }]);
    const out = compiler.compile(makeComp({ objects: [obj] }));
    expect(out).toBeDefined();
  });

  // ─── Lights ──────────────────────────────────────────────────────────
  it('compiles point light', () => {
    const out = compiler.compile(makeComp({
      lights: [{ name: 'Key', type: 'point', intensity: 1000, color: '#ffffff' }],
    }));
    expect(out).toContain('Key');
  });

  it('compiles directional light', () => {
    const out = compiler.compile(makeComp({
      lights: [{ name: 'Sun', type: 'directional', intensity: 5, color: '#fff8e7' }],
    }));
    expect(out).toBeDefined();
  });

  it('compiles spot light', () => {
    const out = compiler.compile(makeComp({
      lights: [{ name: 'Spot', type: 'spot', intensity: 2000, color: '#ffd700' }],
    }));
    expect(out).toBeDefined();
  });

  // ─── Audio ───────────────────────────────────────────────────────────
  // HoloAudio.properties is an array of { key, value } pairs
  it('compiles spatial audio', () => {
    const out = compiler.compile(makeComp({
      audio: [{
        name: 'Ambient',
        properties: [
          { key: 'src', value: 'forest.mp3' },
          { key: 'loop', value: true },
          { key: 'volume', value: 0.5 },
        ],
      }],
    } as any));
    expect(out).toBeDefined();
  });

  // ─── Timelines ───────────────────────────────────────────────────────
  // HoloTimeline uses 'entries' not 'keyframes'
  it('compiles a timeline', () => {
    const out = compiler.compile(makeComp({
      timelines: [{ name: 'Pulse', duration: 1.5, entries: [] }],
    } as any));
    expect(out).toContain('Pulse');
  });

  // ─── Transitions ─────────────────────────────────────────────────────
  // HoloTransition.properties is a { key, value }[] array accessed via .find()
  it('compiles transitions', () => {
    const out = compiler.compile(makeComp({
      transitions: [{
        name: 'FadeIn',
        properties: [
          { key: 'target', value: 'SceneB' },
          { key: 'effect', value: 'fade' },
          { key: 'duration', value: 0.5 },
        ],
      }],
    } as any));
    expect(out).toContain('FadeIn');
  });

  // ─── Zones ───────────────────────────────────────────────────────────
  // HoloZone.properties is a { key, value }[] array accessed via .find()
  it('compiles trigger zones', () => {
    const out = compiler.compile(makeComp({
      zones: [{
        name: 'TriggerArea',
        properties: [
          { key: 'shape', value: 'sphere' },
          { key: 'radius', value: 2 },
        ],
        handlers: [],
      }],
    } as any));
    expect(out).toBeDefined();
  });

  // ─── Effects ─────────────────────────────────────────────────────────
  // HoloEffects uses .effects array (not .particles)
  it('compiles effects', () => {
    const out = compiler.compile(makeComp({
      effects: {
        effects: [
          { effectType: 'bloom', properties: [] },
          { effectType: 'dof', properties: [] },
        ],
      },
    } as any));
    expect(out).toBeDefined();
  });

  // ─── Multiple objects ─────────────────────────────────────────────────
  it('compiles multiple objects', () => {
    const objs = [makeObj('Alpha'), makeObj('Beta'), makeObj('Gamma')];
    const out = compiler.compile(makeComp({ objects: objs }));
    expect(out).toContain('Alpha');
    expect(out).toContain('Beta');
    expect(out).toContain('Gamma');
  });
});
