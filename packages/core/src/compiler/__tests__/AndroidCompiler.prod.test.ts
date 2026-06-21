/**
 * AndroidCompiler — Production Test Suite
 *
 * Covers: compile() returns AndroidCompileResult (activityFile, stateFile,
 * nodeFactoryFile, manifestFile, buildGradle), Kotlin/ARCore output,
 * objects, lights, audio, options, and compileToAndroid convenience fn.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AndroidCompiler, compileToAndroid } from '../AndroidCompiler';
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

describe('AndroidCompiler — Production', () => {
  let compiler: AndroidCompiler;

  beforeEach(() => {
    compiler = new AndroidCompiler();
  });

  // ─── Construction ────────────────────────────────────────────────────
  it('constructs with default options', () => {
    expect(compiler).toBeDefined();
  });

  it('constructs with custom options', () => {
    const c = new AndroidCompiler({
      packageName: 'com.example.ar',
      className: 'ARActivity',
      useJetpackCompose: true,
    });
    expect(c).toBeDefined();
  });

  // ─── compile() returns AndroidCompileResult ───────────────────────────
  it('compile returns all 5 output files', () => {
    const result = compiler.compile(makeComp(), 'test-token');
    expect(typeof result.activityFile).toBe('string');
    expect(typeof result.stateFile).toBe('string');
    expect(typeof result.nodeFactoryFile).toBe('string');
    expect(typeof result.manifestFile).toBe('string');
    expect(typeof result.buildGradle).toBe('string');
  });

  it('empty composition compiles without error', () => {
    expect(() => compiler.compile(makeComp(), 'test-token')).not.toThrow();
  });

  // ─── activityFile content ─────────────────────────────────────────────
  it('activityFile contains package declaration', () => {
    const { activityFile } = compiler.compile(makeComp(), 'test-token');
    expect(activityFile).toContain('package');
  });

  it('activityFile contains import statements', () => {
    const { activityFile } = compiler.compile(makeComp(), 'test-token');
    expect(activityFile).toContain('import');
  });

  it('activityFile contains Activity class', () => {
    const { activityFile } = compiler.compile(makeComp(), 'test-token');
    expect(activityFile).toContain('Activity');
  });

  // ─── manifestFile content ─────────────────────────────────────────────
  it('manifestFile contains XML manifest', () => {
    const { manifestFile } = compiler.compile(makeComp(), 'test-token');
    expect(manifestFile).toContain('<manifest');
  });

  it('manifestFile contains camera permission', () => {
    const { manifestFile } = compiler.compile(makeComp(), 'test-token');
    expect(manifestFile.toLowerCase()).toContain('camera');
  });

  // ─── buildGradle content ──────────────────────────────────────────────
  it('buildGradle contains android block', () => {
    const { buildGradle } = compiler.compile(makeComp(), 'test-token');
    expect(buildGradle).toContain('android');
  });

  it('buildGradle contains dependencies', () => {
    const { buildGradle } = compiler.compile(makeComp(), 'test-token');
    expect(buildGradle.toLowerCase()).toContain('dependencies');
  });

  // ─── Package name ─────────────────────────────────────────────────────
  it('custom package name appears in activityFile', () => {
    const c = new AndroidCompiler({ packageName: 'com.mygame.ar' });
    const { activityFile } = c.compile(makeComp(), 'test-token');
    expect(activityFile).toContain('com.mygame.ar');
  });

  // ─── Objects ─────────────────────────────────────────────────────────
  it('compiles a sphere object', () => {
    const obj = makeObj('Ball', [{ key: 'mesh', value: 'sphere' }]);
    const { nodeFactoryFile } = compiler.compile(makeComp({ objects: [obj] }), 'test-token');
    expect(nodeFactoryFile).toBeDefined();
  });

  it('compiles a cube object', () => {
    const obj = makeObj('Box', [{ key: 'mesh', value: 'cube' }]);
    const { nodeFactoryFile } = compiler.compile(makeComp({ objects: [obj] }), 'test-token');
    expect(nodeFactoryFile).toBeDefined();
  });

  // ─── Lights ──────────────────────────────────────────────────────────
  it('compiles a point light', () => {
    const { activityFile } = compiler.compile(
      makeComp({
        lights: [{ name: 'Key', type: 'point', intensity: 500, color: '#ffffff' }],
      }),
      'test-token'
    );
    expect(activityFile).toBeDefined();
  });

  // ─── Jetpack Compose ─────────────────────────────────────────────────
  it('useJetpackCompose option compiles without error', () => {
    const c = new AndroidCompiler({ useJetpackCompose: true });
    expect(() => c.compile(makeComp(), 'test-token')).not.toThrow();
  });

  // ─── SDK versions ─────────────────────────────────────────────────────
  it('minSdk appears verbatim; targetSdk floors at the SceneView 36 requirement', () => {
    const c = new AndroidCompiler({ minSdk: 26, targetSdk: 34 });
    const { buildGradle } = c.compile(makeComp(), 'test-token');
    expect(buildGradle).toContain('minSdk = 26');
    // targetSdk 34 is below SceneView 4.18.0's API-36 floor, so it is raised to 36.
    expect(buildGradle).toContain('targetSdk = 36');
  });

  // ─── Convenience function ─────────────────────────────────────────────
  it('compileToAndroid convenience function works', async () => {
    const result = await compileToAndroid(makeComp());
    expect(typeof result.activityFile).toBe('string');
    expect(typeof result.manifestFile).toBe('string');
  });

  it('compileToAndroid passes options', async () => {
    const result = await compileToAndroid(makeComp(), { packageName: 'com.foo.ar' });
    expect(result.activityFile).toContain('com.foo.ar');
  });

  // ─── Multiple objects ─────────────────────────────────────────────────
  it('compiles multiple objects into the declarative activity', () => {
    const objs = [makeObj('X'), makeObj('Y'), makeObj('Z')];
    const { activityFile } = compiler.compile(makeComp({ objects: objs }), 'test-token');
    expect(activityFile).toContain('X');
    expect(activityFile).toContain('Y');
  });
});
