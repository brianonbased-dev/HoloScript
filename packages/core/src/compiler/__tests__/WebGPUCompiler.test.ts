import { describe, it, expect, beforeEach } from 'vitest';
import { WebGPUCompiler } from '../WebGPUCompiler';
import type { HoloComposition } from '../../parser/HoloCompositionTypes';

function makeComposition(overrides: Partial<HoloComposition> = {}): HoloComposition {
  return { name: 'TestScene', objects: [], ...overrides } as HoloComposition;
}

describe('WebGPUCompiler', () => {
  let compiler: WebGPUCompiler;

  beforeEach(() => {
    compiler = new WebGPUCompiler();
  });

  // =========== Constructor / defaults ===========

  it('compiles minimal composition', () => {
    const code = compiler.compile(makeComposition());
    expect(code).toContain('navigator.gpu');
  });

  it('emits device initialization', () => {
    const code = compiler.compile(makeComposition());
    expect(code).toContain('requestAdapter');
    expect(code).toContain('requestDevice');
  });

  // =========== Options ===========

  it('respects custom entry point', () => {
    const c = new WebGPUCompiler({ entryPoint: 'myMain' });
    const code = c.compile(makeComposition());
    expect(code).toBeDefined();
  });

  it('includes compute shaders when enabled', () => {
    const c = new WebGPUCompiler({ enableCompute: true });
    const comp = makeComposition({
      objects: [
        { name: 'particles', properties: [{ key: 'geometry', value: 'gpu_particles' }], traits: [] },
      ] as any,
    });
    const code = c.compile(comp);
    expect(code).toContain('compute');
  });

  // =========== Shader generation ===========

  it('emits WGSL vertex/fragment shaders', () => {
    const comp = makeComposition({
      objects: [
        { name: 'cube', properties: [{ key: 'geometry', value: 'box' }], traits: [] },
      ] as any,
    });
    const code = compiler.compile(comp);
    expect(code).toContain('@vertex');
    expect(code).toContain('@fragment');
  });

  // =========== Object compilation ===========

  it('compiles objects to render pipeline', () => {
    const comp = makeComposition({
      objects: [
        { name: 'mesh_obj', properties: [{ key: 'geometry', value: 'box' }], traits: [] },
      ] as any,
    });
    const code = compiler.compile(comp);
    expect(code).toContain('createRenderPipeline');
  });

  it('handles sphere geometry', () => {
    const comp = makeComposition({
      objects: [
        { name: 'ball', properties: [{ key: 'geometry', value: 'sphere' }], traits: [] },
      ] as any,
    });
    const code = compiler.compile(comp);
    expect(code).toContain('ball');
  });

  // =========== Camera ===========

  it('compiles camera', () => {
    const comp = makeComposition({
      camera: { position: [0, 2, 5], target: [0, 0, 0] } as any,
    });
    const code = compiler.compile(comp);
    expect(code).toContain('camera');
  });

  // =========== Environment ===========

  it('compiles environment clear color', () => {
    const comp = makeComposition({
      environment: { skybox: 'sunset' } as any,
    });
    const code = compiler.compile(comp);
    expect(code).toContain('clearValue');
  });

  // =========== Lights ===========

  it('compiles lights to uniform buffers', () => {
    const comp = makeComposition({
      lights: [{ type: 'directional', direction: [0, -1, 0], color: '#ffffff' }] as any,
    });
    const code = compiler.compile(comp);
    expect(code).toContain('light');
  });

  // =========== Spatial groups ===========

  it('compiles spatial groups', () => {
    const comp = makeComposition({
      spatialGroups: [
        {
          name: 'group_a',
          objects: [
            { name: 'child', properties: [{ key: 'geometry', value: 'box' }], traits: [] },
          ],
        },
      ] as any,
    });
    const code = compiler.compile(comp);
    expect(code).toContain('group_a');
  });

  // =========== Render loop ===========

  it('generates render loop', () => {
    const code = compiler.compile(makeComposition());
    expect(code).toContain('requestAnimationFrame');
  });

  // =========== Multiple objects ===========

  it('compiles multiple objects', () => {
    const comp = makeComposition({
      objects: [
        { name: 'obj_1', properties: [{ key: 'geometry', value: 'box' }], traits: [] },
        { name: 'obj_2', properties: [{ key: 'geometry', value: 'sphere' }], traits: [] },
      ] as any,
    });
    const code = compiler.compile(comp);
    expect(code).toContain('obj_1');
    expect(code).toContain('obj_2');
  });

  // =========== Name sanitization ===========

  it('sanitizes special characters', () => {
    const comp = makeComposition({
      objects: [
        { name: 'my cube!', properties: [{ key: 'geometry', value: 'box' }], traits: [] },
      ] as any,
    });
    const code = compiler.compile(comp);
    expect(code).not.toContain('!');
  });
});
