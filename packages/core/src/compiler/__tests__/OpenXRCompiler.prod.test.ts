/**
 * OpenXRCompiler — Production Test Suite
 *
 * Covers: C++ output, OpenXR includes, XrInstance init, session init,
 * action sets, environment, objects, lights, camera, hand tracking.
 */
import { describe, it, expect, beforeEach, vi} from 'vitest';
import { OpenXRCompiler } from '../OpenXRCompiler';
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

function makeObj(name: string, props: Array<{ key: string; value: unknown }> = []): HoloObjectDecl {
  return {
    name,
    properties: props.map(({ key, value }) => ({ key, value })),
    traits: [],
    children: [],
  } as any;
}

describe('OpenXRCompiler — Production', () => {
  let compiler: OpenXRCompiler;

  beforeEach(() => {
    compiler = new OpenXRCompiler();
  });

  // ─── Construction ────────────────────────────────────────────────────
  it('constructs with default options', () => {
    expect(compiler).toBeDefined();
  });

  it('constructs with vulkan backend', () => {
    const c = new OpenXRCompiler({ renderBackend: 'vulkan', appName: 'MyXRApp' });
    expect(c).toBeDefined();
  });

  it('constructs with opengl_es backend', () => {
    const c = new OpenXRCompiler({ renderBackend: 'opengl_es' });
    expect(c).toBeDefined();
  });

  // ─── compile() ────────────────────────────────────────────────────────
  it('compile returns a string', () => {
    const out = compiler.compile(makeComp(), 'test-token');
    expect(typeof out).toBe('string');
    expect(out.length).toBeGreaterThan(0);
  });

  it('empty composition compiles without error', () => {
    expect(() => compiler.compile(makeComp(), 'test-token')).not.toThrow();
  });

  // ─── C++ structure ────────────────────────────────────────────────────
  it('output contains openxr include', () => {
    const out = compiler.compile(makeComp(), 'test-token');
    expect(out.toLowerCase()).toContain('openxr');
  });

  it('output contains #include directives', () => {
    const out = compiler.compile(makeComp(), 'test-token');
    expect(out).toContain('#include');
  });

  it('output contains XrInstance', () => {
    const out = compiler.compile(makeComp(), 'test-token');
    expect(out).toContain('XrInstance');
  });

  it('output contains XrSession', () => {
    const out = compiler.compile(makeComp(), 'test-token');
    expect(out).toContain('XrSession');
  });

  // ─── App name ─────────────────────────────────────────────────────────
  it('custom appName appears in output', () => {
    const c = new OpenXRCompiler({ appName: 'MyXRGame' });
    const out = c.compile(makeComp(), 'test-token');
    expect(out).toContain('MyXRGame');
  });

  // ─── Objects ─────────────────────────────────────────────────────────
  it('compiles a mesh object', () => {
    const obj = makeObj('Cube', [{ key: 'mesh', value: 'cube' }]);
    const out = compiler.compile(makeComp({ objects: [obj] }), 'test-token');
    expect(out).toContain('Cube');
  });

  it('compiles a sphere object', () => {
    const obj = makeObj('Orb', [{ key: 'mesh', value: 'sphere' }]);
    const out = compiler.compile(makeComp({ objects: [obj] }), 'test-token');
    expect(out).toContain('Orb');
  });

  it('compiles object with position', () => {
    const obj = makeObj('Wall', [{ key: 'position', value: [0, 0, -3] }]);
    const out = compiler.compile(makeComp({ objects: [obj] }), 'test-token');
    expect(out).toBeDefined();
  });

  // ─── Lights ──────────────────────────────────────────────────────────
  it('compiles a point light', () => {
    const out = compiler.compile(makeComp({
      lights: [{ name: 'Light1', lightType: 'point', properties: [{ key: 'intensity', value: 500 }, { key: 'color', value: '#ffffff' }] }] as any,
    }), 'test-token');
    expect(out).toContain('Light1');
  });

  it('compiles a directional light', () => {
    const out = compiler.compile(makeComp({
      lights: [{ name: 'Sun', lightType: 'directional', properties: [{ key: 'intensity', value: 3 }, { key: 'color', value: '#ffe4b5' }] }] as any,
    }), 'test-token');
    expect(out).toBeDefined();
  });

  // ─── Camera ───────────────────────────────────────────────────────────
  it('compiles camera', () => {
    const out = compiler.compile(makeComp({
      camera: { cameraType: 'perspective', properties: [{ key: 'fov', value: 90 }, { key: 'near', value: 0.01 }, { key: 'far', value: 1000 }] },
    } as any), 'test-token');
    expect(out).toBeDefined();
  });

  // ─── Hand tracking ────────────────────────────────────────────────────
  it('enableHandTracking generates hand tracking code', () => {
    const c = new OpenXRCompiler({ enableHandTracking: true });
    const out = c.compile(makeComp(), 'test-token');
    expect(out.toLowerCase()).toContain('hand');
  });

  // ─── Passthrough ─────────────────────────────────────────────────────
  it('enablePassthrough option compiles without error', () => {
    const c = new OpenXRCompiler({ enablePassthrough: true });
    expect(() => c.compile(makeComp(), 'test-token')).not.toThrow();
  });

  // ─── Environment ─────────────────────────────────────────────────────
  it('compiles environment settings', () => {
    const out = compiler.compile(makeComp({
      environment: { properties: [{ key: 'skybox', value: 'stars' }] },
    } as any), 'test-token');
    expect(out).toBeDefined();
  });

  // ─── Multiple objects ─────────────────────────────────────────────────
  it('compiles multiple objects', () => {
    const objs = [makeObj('A'), makeObj('B'), makeObj('C')];
    const out = compiler.compile(makeComp({ objects: objs }), 'test-token');
    expect(out).toContain('A');
    expect(out).toContain('B');
    expect(out).toContain('C');
  });

  // ─── Render loop ─────────────────────────────────────────────────────
  it('output contains render loop boilerplate', () => {
    const out = compiler.compile(makeComp(), 'test-token');
    // OpenXR render loop involves frame states
    expect(out.toLowerCase()).toContain('frame');
  });
});
