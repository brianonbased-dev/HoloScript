/**
 * AndroidXRCompiler — Production Test Suite
 *
 * Covers: Kotlin output, Jetpack Compose XR, Activity class, ARCore session,
 * objects, lights, camera, timelines, audio, UI, zones, effects, transitions.
 */
import { describe, it, expect, beforeEach, vi} from 'vitest';
import { AndroidXRCompiler } from '../AndroidXRCompiler';
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

describe('AndroidXRCompiler — Production', () => {
  let compiler: AndroidXRCompiler;

  beforeEach(() => {
    compiler = new AndroidXRCompiler();
  });

  // ─── Construction ────────────────────────────────────────────────────
  it('constructs with default options', () => {
    expect(compiler).toBeDefined();
  });

  it('constructs with custom options', () => {
    const c = new AndroidXRCompiler({ packageName: 'com.example.app', activityName: 'MainActivity', useARCore: true });
    expect(c).toBeDefined();
  });

  // ─── compile() ────────────────────────────────────────────────────────
  it('compile returns a non-empty string', () => {
    const out = compiler.compile(makeComp(), 'test-token');
    expect(typeof out).toBe('string');
    expect(out.length).toBeGreaterThan(0);
  });

  it('empty composition compiles without error', () => {
    expect(() => compiler.compile(makeComp(), 'test-token')).not.toThrow();
  });

  // ─── Kotlin structure ─────────────────────────────────────────────────
  it('output contains package declaration', () => {
    const out = compiler.compile(makeComp(), 'test-token');
    expect(out).toContain('package');
  });

  it('output contains import statements', () => {
    const out = compiler.compile(makeComp(), 'test-token');
    expect(out).toContain('import');
  });

  it('output contains Activity class', () => {
    const out = compiler.compile(makeComp(), 'test-token');
    expect(out).toContain('Activity');
  });

  it('output contains Composable annotation', () => {
    const out = compiler.compile(makeComp(), 'test-token');
    expect(out).toContain('@Composable');
  });

  // ─── ARCore session ───────────────────────────────────────────────────
  it('useARCore generates AR session setup', () => {
    const c = new AndroidXRCompiler({ useARCore: true });
    const out = c.compile(makeComp(), 'test-token');
    expect(out.toLowerCase()).toContain('session');
  });

  // ─── Objects ─────────────────────────────────────────────────────────
  it('compiles a cube object', () => {
    const obj = makeObj('MyCube', [{ key: 'mesh', value: 'cube' }]);
    const out = compiler.compile(makeComp({ objects: [obj] }), 'test-token');
    expect(out).toContain('MyCube');
  });

  it('compiles a sphere object', () => {
    const obj = makeObj('Ball', [{ key: 'mesh', value: 'sphere' }]);
    const out = compiler.compile(makeComp({ objects: [obj] }), 'test-token');
    expect(out).toContain('Ball');
  });

  it('compiles object with position', () => {
    const obj = makeObj('Box', [
      { key: 'mesh', value: 'box' },
      { key: 'position', value: [0, 1, -2] },
    ]);
    const out = compiler.compile(makeComp({ objects: [obj] }), 'test-token');
    expect(out).toBeDefined();
  });

  // ─── Lights ──────────────────────────────────────────────────────────
  it('compiles a point light', () => {
    const out = compiler.compile(makeComp({
      lights: [{ name: 'KeyLight', lightType: 'point', properties: [{ key: 'intensity', value: 1000 }, { key: 'color', value: '#ffffff' }] }] as any,
    }), 'test-token');
    expect(out).toContain('KeyLight');
  });

  it('compiles a directional light', () => {
    const out = compiler.compile(makeComp({
      lights: [{ name: 'Sun', lightType: 'directional', properties: [{ key: 'intensity', value: 5 }, { key: 'color', value: '#fff8e7' }] }] as any,
    }), 'test-token');
    expect(out).toBeDefined();
  });

  // ─── Camera ───────────────────────────────────────────────────────────
  it('compiles camera configuration', () => {
    const out = compiler.compile(makeComp({
      camera: { cameraType: 'perspective', properties: [{ key: 'fov', value: 75 }, { key: 'near', value: 0.1 }, { key: 'far', value: 500 }] },
    } as any), 'test-token');
    expect(out).toBeDefined();
  });

  // ─── Timelines ───────────────────────────────────────────────────────
  it('compiles a timeline', () => {
    const out = compiler.compile(makeComp({
      timelines: [{ name: 'FadeIn', duration: 1.5, entries: [] }] as any,
    }), 'test-token');
    expect(out).toContain('FadeIn');
  });

  // ─── Audio ───────────────────────────────────────────────────────────
  it('compiles audio', () => {
    const out = compiler.compile(makeComp({
      audio: [{ name: 'BgMusic', properties: [{ key: 'src', value: 'music.mp3' }, { key: 'loop', value: true }, { key: 'volume', value: 0.7 }] }],
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

  // ─── Zones ───────────────────────────────────────────────────────────
  it('compiles trigger zones', () => {
    const out = compiler.compile(makeComp({
      zones: [{ name: 'SafeZone', properties: [{ key: 'shape', value: 'sphere' }, { key: 'radius', value: 3 }] }],
    } as any), 'test-token');
    expect(out).toBeDefined();
  });

  // ─── Transitions ─────────────────────────────────────────────────────
  it('compiles transitions', () => {
    const out = compiler.compile(makeComp({
      transitions: [{ name: 'FadeOut', properties: [{ key: 'target', value: 'B' }, { key: 'duration', value: 0.8 }] }],
    } as any), 'test-token');
    expect(out).toContain('FadeOut');
  });

  // ─── Multiple objects ─────────────────────────────────────────────────
  it('compiles multiple objects', () => {
    const objs = [makeObj('Obj1'), makeObj('Obj2'), makeObj('Obj3')];
    const out = compiler.compile(makeComp({ objects: objs }), 'test-token');
    expect(out).toContain('Obj1');
    expect(out).toContain('Obj2');
  });

  // ─── Package name ─────────────────────────────────────────────────────
  it('custom package name appears in output', () => {
    const c = new AndroidXRCompiler({ packageName: 'com.mygame.xr' });
    const out = c.compile(makeComp(), 'test-token');
    expect(out).toContain('com.mygame.xr');
  });
});
