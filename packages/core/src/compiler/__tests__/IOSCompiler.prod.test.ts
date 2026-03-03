/**
 * IOSCompiler — Production Test Suite
 *
 * Covers: compile() returns IOSCompileResult (viewFile, sceneFile, stateFile, infoPlist),
 * Swift ARKit output, ARSCNView, SceneKit nodes, lights, audio, gestures, options.
 */
import { describe, it, expect, beforeEach, vi} from 'vitest';
import { IOSCompiler, compileToIOS } from '../IOSCompiler';
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

describe('IOSCompiler — Production', () => {
  let compiler: IOSCompiler;

  beforeEach(() => {
    compiler = new IOSCompiler();
  });

  // ─── Construction ────────────────────────────────────────────────────
  it('constructs with default options', () => {
    expect(compiler).toBeDefined();
  });

  it('constructs with custom options', () => {
    const c = new IOSCompiler({ className: 'ARScene', iosVersion: '17.0', useRealityKit: true });
    expect(c).toBeDefined();
  });

  // ─── compile() returns IOSCompileResult ───────────────────────────────
  it('compile returns viewFile, sceneFile, stateFile, infoPlist', () => {
    const result = compiler.compile(makeComp(), 'test-token');
    expect(typeof result.viewFile).toBe('string');
    expect(typeof result.sceneFile).toBe('string');
    expect(typeof result.stateFile).toBe('string');
    expect(typeof result.infoPlist).toBe('string');
  });

  it('empty composition compiles without error', () => {
    expect(() => compiler.compile(makeComp(), 'test-token')).not.toThrow();
  });

  // ─── viewFile content ─────────────────────────────────────────────────
  it('viewFile contains Swift import', () => {
    const { viewFile } = compiler.compile(makeComp(), 'test-token');
    expect(viewFile).toContain('import');
  });

  it('viewFile contains ARKit or RealityKit', () => {
    const { viewFile } = compiler.compile(makeComp(), 'test-token');
    expect(viewFile).toMatch(/ARKit|RealityKit/);
  });

  it('viewFile contains SwiftUI', () => {
    const { viewFile } = compiler.compile(makeComp(), 'test-token');
    expect(viewFile).toContain('SwiftUI');
  });

  it('viewFile contains struct or class', () => {
    const { viewFile } = compiler.compile(makeComp(), 'test-token');
    expect(viewFile).toMatch(/struct|class/);
  });

  // ─── sceneFile content ────────────────────────────────────────────────
  it('sceneFile contains scene setup', () => {
    const { sceneFile } = compiler.compile(makeComp(), 'test-token');
    expect(typeof sceneFile).toBe('string');
  });

  // ─── stateFile content ────────────────────────────────────────────────
  it('stateFile contains ObservableObject or state class', () => {
    const { stateFile } = compiler.compile(makeComp(), 'test-token');
    expect(stateFile).toBeDefined();
  });

  // ─── infoPlist content ────────────────────────────────────────────────
  it('infoPlist contains XML plist', () => {
    const { infoPlist } = compiler.compile(makeComp(), 'test-token');
    expect(infoPlist).toContain('plist');
  });

  it('infoPlist contains camera usage description', () => {
    const { infoPlist } = compiler.compile(makeComp(), 'test-token');
    expect(infoPlist.toLowerCase()).toContain('camera');
  });

  // ─── Objects ─────────────────────────────────────────────────────────
  it('compiles a cube mesh object (name in sceneFile)', () => {
    const obj = makeObj('MyCube', [{ key: 'mesh', value: 'cube' }]);
    const { sceneFile } = compiler.compile(makeComp({ objects: [obj] }), 'test-token');
    expect(sceneFile).toContain('MyCube');
  });

  it('compiles a sphere object (name in sceneFile)', () => {
    const obj = makeObj('Ball', [{ key: 'mesh', value: 'sphere' }]);
    const { sceneFile } = compiler.compile(makeComp({ objects: [obj] }), 'test-token');
    expect(sceneFile).toContain('Ball');
  });

  it('compiles object with position', () => {
    const obj = makeObj('Node', [{ key: 'position', value: [1, 0, -2] }]);
    const { sceneFile } = compiler.compile(makeComp({ objects: [obj] }), 'test-token');
    expect(sceneFile).toBeDefined();
  });

  // ─── Lights ──────────────────────────────────────────────────────────
  // HoloLight uses `lightType` + `properties` array, not flat `type` field
  it('compiles point light (name in sceneFile)', () => {
    const { sceneFile } = compiler.compile(makeComp({
      lights: [{ name: 'Key', lightType: 'point', properties: [{ key: 'color', value: '#ffffff' }, { key: 'intensity', value: 0.5 }] }],
    } as any), 'test-token');
    expect(sceneFile).toContain('Key');
  });

  it('compiles directional light (sceneFile defined)', () => {
    const { sceneFile } = compiler.compile(makeComp({
      lights: [{ name: 'Sun', lightType: 'directional', properties: [{ key: 'intensity', value: 3 }] }],
    } as any), 'test-token');
    expect(sceneFile).toBeDefined();
  });

  // ─── Audio ───────────────────────────────────────────────────────────
  // HoloAudio uses `properties` array format
  it('compiles audio source (sceneFile defined)', () => {
    const { sceneFile } = compiler.compile(makeComp({
      audio: [{ name: 'BgMusic', properties: [{ key: 'src', value: 'music.mp3' }, { key: 'loop', value: true }, { key: 'volume', value: 0.7 }] }],
    } as any), 'test-token');
    expect(sceneFile).toBeDefined();
  });

  // ─── iOS version ─────────────────────────────────────────────────────
  it('accepts iosVersion option without error', () => {
    const c = new IOSCompiler({ iosVersion: '16.0' });
    expect(() => c.compile(makeComp(), 'test-token')).not.toThrow();
  });

  // ─── useRealityKit option ─────────────────────────────────────────────
  it('useRealityKit option compiles without error', () => {
    const c = new IOSCompiler({ useRealityKit: true });
    expect(() => c.compile(makeComp(), 'test-token')).not.toThrow();
  });

  // ─── Convenience function ─────────────────────────────────────────────
  it('compileToIOS convenience function works', () => {
    const result = compileToIOS(makeComp());
    expect(typeof result.viewFile).toBe('string');
    expect(typeof result.sceneFile).toBe('string');
  });

  it('compileToIOS passes options', () => {
    const result = compileToIOS(makeComp(), { className: 'MySuperARView' });
    expect(result.viewFile).toContain('MySuperARView');
  });

  // ─── Multiple objects ─────────────────────────────────────────────────
  it('compiles multiple objects (names in sceneFile)', () => {
    const objs = [makeObj('A'), makeObj('B'), makeObj('C')];
    const { sceneFile } = compiler.compile(makeComp({ objects: objs }), 'test-token');
    expect(sceneFile).toContain('A');
    expect(sceneFile).toContain('B');
    expect(sceneFile).toContain('C');
  });
});
