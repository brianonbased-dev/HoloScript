/**
 * AndroidCompiler — Production Test Suite
 *
 * Covers: compile() returns AndroidCompileResult (activityFile, stateFile,
 * nodeFactoryFile, manifestFile, buildGradle), Kotlin/ARCore output,
 * objects, lights, audio, options, and compileToAndroid convenience fn.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { AndroidCompiler, compileToAndroid } from '../AndroidCompiler';
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
    const c = new AndroidCompiler({ packageName: 'com.example.ar', className: 'ARActivity', useJetpackCompose: true });
    expect(c).toBeDefined();
  });

  // ─── compile() returns AndroidCompileResult ───────────────────────────
  it('compile returns all 5 output files', () => {
    const result = compiler.compile(makeComp());
    expect(typeof result.activityFile).toBe('string');
    expect(typeof result.stateFile).toBe('string');
    expect(typeof result.nodeFactoryFile).toBe('string');
    expect(typeof result.manifestFile).toBe('string');
    expect(typeof result.buildGradle).toBe('string');
  });

  it('empty composition compiles without error', () => {
    expect(() => compiler.compile(makeComp())).not.toThrow();
  });

  // ─── activityFile content ─────────────────────────────────────────────
  it('activityFile contains package declaration', () => {
    const { activityFile } = compiler.compile(makeComp());
    expect(activityFile).toContain('package');
  });

  it('activityFile contains import statements', () => {
    const { activityFile } = compiler.compile(makeComp());
    expect(activityFile).toContain('import');
  });

  it('activityFile contains Activity class', () => {
    const { activityFile } = compiler.compile(makeComp());
    expect(activityFile).toContain('Activity');
  });

  // ─── manifestFile content ─────────────────────────────────────────────
  it('manifestFile contains XML manifest', () => {
    const { manifestFile } = compiler.compile(makeComp());
    expect(manifestFile).toContain('<manifest');
  });

  it('manifestFile contains camera permission', () => {
    const { manifestFile } = compiler.compile(makeComp());
    expect(manifestFile.toLowerCase()).toContain('camera');
  });

  // ─── buildGradle content ──────────────────────────────────────────────
  it('buildGradle contains android block', () => {
    const { buildGradle } = compiler.compile(makeComp());
    expect(buildGradle).toContain('android');
  });

  it('buildGradle contains dependencies', () => {
    const { buildGradle } = compiler.compile(makeComp());
    expect(buildGradle.toLowerCase()).toContain('dependencies');
  });

  // ─── Package name ─────────────────────────────────────────────────────
  it('custom package name appears in activityFile', () => {
    const c = new AndroidCompiler({ packageName: 'com.mygame.ar' });
    const { activityFile } = c.compile(makeComp());
    expect(activityFile).toContain('com.mygame.ar');
  });

  // ─── Objects ─────────────────────────────────────────────────────────
  it('compiles a sphere object', () => {
    const obj = makeObj('Ball', [{ key: 'mesh', value: 'sphere' }]);
    const { nodeFactoryFile } = compiler.compile(makeComp({ objects: [obj] }));
    expect(nodeFactoryFile).toBeDefined();
  });

  it('compiles a cube object', () => {
    const obj = makeObj('Box', [{ key: 'mesh', value: 'cube' }]);
    const { nodeFactoryFile } = compiler.compile(makeComp({ objects: [obj] }));
    expect(nodeFactoryFile).toBeDefined();
  });

  // ─── Lights ──────────────────────────────────────────────────────────
  it('compiles a point light', () => {
    const { activityFile } = compiler.compile(makeComp({
      lights: [{ name: 'Key', type: 'point', intensity: 500, color: '#ffffff' }],
    }));
    expect(activityFile).toBeDefined();
  });

  // ─── Jetpack Compose ─────────────────────────────────────────────────
  it('useJetpackCompose option compiles without error', () => {
    const c = new AndroidCompiler({ useJetpackCompose: true });
    expect(() => c.compile(makeComp())).not.toThrow();
  });

  // ─── SDK versions ─────────────────────────────────────────────────────
  it('minSdk and targetSdk appear in buildGradle', () => {
    const c = new AndroidCompiler({ minSdk: 26, targetSdk: 34 });
    const { buildGradle } = c.compile(makeComp());
    expect(buildGradle).toContain('26');
    expect(buildGradle).toContain('34');
  });

  // ─── Convenience function ─────────────────────────────────────────────
  it('compileToAndroid convenience function works', () => {
    const result = compileToAndroid(makeComp());
    expect(typeof result.activityFile).toBe('string');
    expect(typeof result.manifestFile).toBe('string');
  });

  it('compileToAndroid passes options', () => {
    const result = compileToAndroid(makeComp(), { packageName: 'com.foo.ar' });
    expect(result.activityFile).toContain('com.foo.ar');
  });

  // ─── Multiple objects ─────────────────────────────────────────────────
  it('compiles multiple objects', () => {
    const objs = [makeObj('X'), makeObj('Y'), makeObj('Z')];
    const { nodeFactoryFile } = compiler.compile(makeComp({ objects: objs }));
    expect(nodeFactoryFile).toContain('X');
    expect(nodeFactoryFile).toContain('Y');
  });
});
