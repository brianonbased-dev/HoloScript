/**
 * PlayCanvasCompiler — Production Test Suite
 *
 * Covers: pc.Application init, entity/component creation, lights, camera,
 * physics, audio, timelines, UI, zones, effects, transitions, XR setup.
 */
import { describe, it, expect, beforeEach, vi} from 'vitest';
import { PlayCanvasCompiler } from '../PlayCanvasCompiler';
import type { HoloComposition, HoloObjectDecl } from '../../parser/HoloCompositionTypes';

vi.mock('../identity/AgentRBAC', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getRBAC: () => ({ checkAccess: () => ({ allowed: true }) }),
  };
});


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

describe('PlayCanvasCompiler — Production', () => {
  let compiler: PlayCanvasCompiler;

  beforeEach(() => {
    compiler = new PlayCanvasCompiler();
  });

  // ─── Construction ────────────────────────────────────────────────────
  it('constructs with default options', () => {
    expect(compiler).toBeDefined();
  });

  it('constructs with options', () => {
    const c = new PlayCanvasCompiler({ className: 'MyScene', enablePhysics: true, enableXR: true });
    expect(c).toBeDefined();
  });

  // ─── compile() returns string ─────────────────────────────────────────
  it('compile returns a string', () => {
    const out = compiler.compile(makeComp(), 'test-token');
    expect(typeof out).toBe('string');
    expect(out.length).toBeGreaterThan(0);
  });

  it('empty composition compiles without error', () => {
    expect(() => compiler.compile(makeComp(), 'test-token')).not.toThrow();
  });

  // ─── App initialization ───────────────────────────────────────────────
  it('output contains pc.Application', () => {
    const out = compiler.compile(makeComp(), 'test-token');
    expect(out).toContain('pc.Application');
  });

  it('output contains app.start()', () => {
    const out = compiler.compile(makeComp(), 'test-token');
    expect(out).toContain('app.start');
  });

  // ─── Objects ─────────────────────────────────────────────────────────
  it('compiles a sphere object', () => {
    const obj = makeObj('Ball', [{ key: 'mesh', value: 'sphere' }]);
    const out = compiler.compile(makeComp({ objects: [obj] }), 'test-token');
    expect(out).toContain('Ball');
  });

  it('compiles a box/cube object', () => {
    const obj = makeObj('Crate', [{ key: 'mesh', value: 'cube' }]);
    const out = compiler.compile(makeComp({ objects: [obj] }), 'test-token');
    expect(out).toContain('Crate');
  });

  it('compiles object with render component', () => {
    const obj = makeObj('Plane', [{ key: 'mesh', value: 'plane' }]);
    const out = compiler.compile(makeComp({ objects: [obj] }), 'test-token');
    expect(out.toLowerCase()).toContain('render');
  });

  it('compiles object position', () => {
    const obj = makeObj('Box', [
      { key: 'mesh', value: 'box' },
      { key: 'position', value: [2, 0, -3] },
    ]);
    const out = compiler.compile(makeComp({ objects: [obj] }), 'test-token');
    expect(out).toContain('Box');
  });

  it('compiles object scale', () => {
    const obj = makeObj('BigBox', [
      { key: 'mesh', value: 'box' },
      { key: 'scale', value: [2, 2, 2] },
    ]);
    const out = compiler.compile(makeComp({ objects: [obj] }), 'test-token');
    expect(out).toContain('BigBox');
  });

  // ─── Physics trait ────────────────────────────────────────────────────
  it('physics trait adds rigidbody component', () => {
    const obj = makeObj('PhysBall', [{ key: 'mesh', value: 'sphere' }], [{ name: 'physics', config: { mass: 2 } }]);
    const out = compiler.compile(makeComp({ objects: [obj] }), 'test-token');
    expect(out.toLowerCase()).toContain('rigidbody');
  });

  // ─── Lights ──────────────────────────────────────────────────────────
  it('compiles a point light', () => {
    const out = compiler.compile(makeComp({
      lights: [{ name: 'PointA', lightType: 'point', properties: [{ key: 'intensity', value: 100 }, { key: 'color', value: '#ffffff' }] }] as any,
    }), 'test-token');
    expect(out.toLowerCase()).toContain('light');
  });

  it('compiles a directional light', () => {
    const out = compiler.compile(makeComp({
      lights: [{ name: 'Sun', lightType: 'directional', properties: [{ key: 'intensity', value: 2 }, { key: 'color', value: '#fff5e0' }] }] as any,
    }), 'test-token');
    expect(out).toContain('Sun');
  });

  it('compiles a spot light', () => {
    const out = compiler.compile(makeComp({
      lights: [{ name: 'Spot', lightType: 'spot', properties: [{ key: 'intensity', value: 500 }, { key: 'color', value: '#ffd700' }] }] as any,
    }), 'test-token');
    expect(out).toContain('Spot');
  });

  // ─── Camera ───────────────────────────────────────────────────────────
  it('compiles a camera', () => {
    const out = compiler.compile(makeComp({
      camera: { cameraType: 'perspective', properties: [{ key: 'fov', value: 60 }, { key: 'near', value: 0.1 }, { key: 'far', value: 1000 }] },
    } as any), 'test-token');
    expect(out.toLowerCase()).toContain('camera');
  });

  // ─── Audio ───────────────────────────────────────────────────────────
  it('compiles audio source', () => {
    const out = compiler.compile(makeComp({
      audio: [{ name: 'Ambient', properties: [{ key: 'src', value: 'ambient.mp3' }, { key: 'loop', value: true }, { key: 'volume', value: 0.5 }] }],
    } as any), 'test-token');
    expect(out).toBeDefined();
  });

  // ─── Timelines ───────────────────────────────────────────────────────
  it('compiles timeline with name', () => {
    const out = compiler.compile(makeComp({
      timelines: [{ name: 'Intro', duration: 3, entries: [] }] as any,
    }), 'test-token');
    expect(out).toContain('Intro');
  });

  // ─── Zones ───────────────────────────────────────────────────────────
  it('compiles a trigger zone', () => {
    const out = compiler.compile(makeComp({
      zones: [{ name: 'SafeZone', properties: [{ key: 'shape', value: 'box' }, { key: 'size', value: [4, 4, 4] }] }],
    } as any), 'test-token');
    expect(out).toBeDefined();
  });

  // ─── UI ──────────────────────────────────────────────────────────────
  it('compiles UI elements', () => {
    const out = compiler.compile(makeComp({
      ui: { elements: [{ name: 'HUD', properties: [{ key: 'type', value: 'panel' }] }] },
    } as any), 'test-token');
    expect(out).toBeDefined();
  });

  // ─── Transitions ─────────────────────────────────────────────────────
  it('compiles transitions', () => {
    const out = compiler.compile(makeComp({
      transitions: [{ name: 'SlideIn', properties: [{ key: 'target', value: 'B' }, { key: 'duration', value: 0.5 }] }] as any,
    }), 'test-token');
    expect(out).toContain('SlideIn');
  });

  // ─── XR setup ────────────────────────────────────────────────────────
  it('enableXR option adds XR initialization', () => {
    const c = new PlayCanvasCompiler({ enableXR: true });
    const out = c.compile(makeComp(), 'test-token');
    expect(out.toLowerCase()).toContain('xr');
  });

  // ─── Multiple objects ─────────────────────────────────────────────────
  it('compiles multiple objects', () => {
    const objs = [makeObj('A'), makeObj('B'), makeObj('C')];
    const out = compiler.compile(makeComp({ objects: objs }), 'test-token');
    expect(out).toContain('A');
    expect(out).toContain('B');
    expect(out).toContain('C');
  });

  // ─── Environment ─────────────────────────────────────────────────────
  it('compiles environment skybox', () => {
    const out = compiler.compile(makeComp({
      environment: { properties: [{ key: 'skybox', value: 'sky_day' }] } as any,
    }), 'test-token');
    expect(out).toBeDefined();
  });
});
