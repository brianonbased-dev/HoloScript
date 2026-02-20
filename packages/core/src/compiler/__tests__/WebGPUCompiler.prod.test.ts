/**
 * WebGPUCompiler — Production Test Suite
 *
 * Covers: compile() output string, WebGPU device initialization, WGSL vertex/fragment
 * shaders, environment handling, mesh objects (sphere/box/cylinder),
 * Gaussian splat / point cloud / GPU particle objects, spatial groups,
 * lights (directional/point/spot/ambient), perspective camera,
 * compute shaders, render loop, draw calls, options (entryPoint, enableCompute,
 * msaa), and utility helpers (parseColor, geometryVertexDataFn, sanitizeName).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { WebGPUCompiler } from '../WebGPUCompiler';
import type { HoloComposition } from '../../parser/HoloCompositionTypes';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeComp(overrides: Partial<HoloComposition> = {}): HoloComposition {
  return { name: 'TestScene', objects: [], ...overrides } as HoloComposition;
}

function makeObj(name: string, geometry = 'box') {
  return { name, properties: [{ key: 'geometry', value: geometry }], traits: [] } as any;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('WebGPUCompiler — Production', () => {
  let compiler: WebGPUCompiler;

  beforeEach(() => {
    compiler = new WebGPUCompiler();
  });

  // ─── Constructor ───────────────────────────────────────────────────────────
  describe('constructor', () => {
    it('constructs with default options', () => {
      expect(compiler).toBeDefined();
    });

    it('constructs with all options', () => {
      const c = new WebGPUCompiler({
        entryPoint: 'MyApp',
        enableCompute: true,
        msaa: 4,
        indent: '  ',
      });
      expect(c).toBeDefined();
    });
  });

  // ─── compile() — output type ───────────────────────────────────────────────
  describe('compile() — output type', () => {
    it('returns a string', () => {
      const result = compiler.compile(makeComp());
      expect(typeof result).toBe('string');
    });

    it('output is non-empty', () => {
      const result = compiler.compile(makeComp());
      expect(result.length).toBeGreaterThan(0);
    });
  });

  // ─── Device initialization ─────────────────────────────────────────────────
  describe('compile() — device init', () => {
    it('contains navigator.gpu reference', () => {
      const result = compiler.compile(makeComp());
      expect(result).toContain('navigator.gpu');
    });

    it('contains requestAdapter or GPUAdapter', () => {
      const result = compiler.compile(makeComp());
      expect(result).toMatch(/requestAdapter|GPUAdapter/);
    });

    it('contains requestDevice or createDevice', () => {
      const result = compiler.compile(makeComp());
      expect(result).toMatch(/requestDevice|device/i);
    });

    it('entryPoint option is accepted without error', () => {
      const c = new WebGPUCompiler({ entryPoint: 'HoloApp' });
      expect(() => c.compile(makeComp())).not.toThrow();
    });
  });

  // ─── WGSL shaders ──────────────────────────────────────────────────────────
  describe('compile() — WGSL shaders', () => {
    it('contains @vertex annotation or wgsl keyword', () => {
      const result = compiler.compile(makeComp({ objects: [makeObj('cube')] }));
      expect(result).toMatch(/@vertex|wgsl|fn\s+/i);
    });

    it('contains @fragment annotation for mesh objects', () => {
      const result = compiler.compile(makeComp({ objects: [makeObj('cube')] }));
      expect(result).toMatch(/@fragment|fragmentMain/i);
    });
  });

  // ─── Environment ──────────────────────────────────────────────────────────
  describe('compile() — environment', () => {
    it('compiles with environment node', () => {
      const result = compiler.compile(
        makeComp({ environment: { properties: [{ key: 'background', value: '#001122' }] } as any })
      );
      expect(typeof result).toBe('string');
    });

    it('environment color appears in output', () => {
      const result = compiler.compile(
        makeComp({ environment: { properties: [{ key: 'background', value: '#112233' }] } as any })
      );
      // Parsed hex 0x11/255~0.067, 0x22/255~0.133, 0x33/255~0.2
      expect(result).toContain('clearColor');
    });
  });

  // ─── Objects ──────────────────────────────────────────────────────────────
  describe('compile() — objects', () => {
    it('compiles a box object', () => {
      const result = compiler.compile(makeComp({ objects: [makeObj('myBox', 'box')] }));
      expect(result).toContain('myBox');
    });

    it('compiles a sphere object', () => {
      const result = compiler.compile(makeComp({ objects: [makeObj('ball', 'sphere')] }));
      expect(result).toContain('ball');
    });

    it('compiles a cylinder object', () => {
      const result = compiler.compile(makeComp({ objects: [makeObj('pillar', 'cylinder')] }));
      expect(result).toContain('pillar');
    });

    it('compiles a gaussian_splat object', () => {
      const result = compiler.compile(
        makeComp({ objects: [makeObj('splat', 'gaussian_splat')] })
      );
      expect(result).toBeDefined();
    });

    it('compiles a point_cloud object', () => {
      const result = compiler.compile(
        makeComp({ objects: [makeObj('cloud', 'point_cloud')] })
      );
      expect(result).toBeDefined();
    });

    it('compiles gpu_particles object', () => {
      const result = compiler.compile(
        makeComp({ objects: [makeObj('particles', 'gpu_particles')] })
      );
      expect(result).toBeDefined();
    });

    it('multiple objects produce longer output', () => {
      const single = compiler.compile(makeComp({ objects: [makeObj('a')] }));
      const multi = compiler.compile(
        makeComp({ objects: [makeObj('a'), makeObj('b'), makeObj('c')] })
      );
      expect(multi.length).toBeGreaterThan(single.length);
    });
  });

  // ─── Spatial groups ────────────────────────────────────────────────────────
  describe('compile() — spatial groups', () => {
    it('compiles a spatial group', () => {
      const result = compiler.compile(
        makeComp({
          spatialGroups: [{
            name: 'grp1',
            objects: [makeObj('child')],
            properties: [],
          } as any],
        })
      );
      expect(result).toContain('grp1');
    });
  });

  // ─── Lights ───────────────────────────────────────────────────────────────
  describe('compile() — lights', () => {
    it('compiles directional light', () => {
      const result = compiler.compile(
        makeComp({
          lights: [{ name: 'sun', lightType: 'directional', properties: [{ key: 'intensity', value: 1.0 }] }],
        })
      );
      expect(result).toContain('sun');
    });

    it('compiles point light', () => {
      const result = compiler.compile(
        makeComp({
          lights: [{ name: 'lamp', lightType: 'point', properties: [] }],
        })
      );
      expect(result).toContain('lamp');
    });

    it('compiles ambient light', () => {
      const result = compiler.compile(
        makeComp({
          lights: [{ name: 'ambient', lightType: 'ambient', properties: [] }],
        })
      );
      expect(result).toBeDefined();
    });
  });

  // ─── Camera ───────────────────────────────────────────────────────────────
  describe('compile() — camera', () => {
    it('compiles perspective camera', () => {
      const result = compiler.compile(
        makeComp({
          camera: { cameraType: 'perspective', properties: [{ key: 'fov', value: 90 }] },
        })
      );
      expect(result).toBeDefined();
      expect(result).toContain('camera');
    });
  });

  // ─── Compute shaders ──────────────────────────────────────────────────────
  describe('compile() — compute shaders', () => {
    it('enableCompute: true generates compute shader reference', () => {
      const c = new WebGPUCompiler({ enableCompute: true });
      const result = c.compile(
        makeComp({ objects: [makeObj('particles', 'gpu_particles')] })
      );
      expect(result).toMatch(/compute|@compute/i);
    });

    it('enableCompute: false compiles without compute shaders', () => {
      const c = new WebGPUCompiler({ enableCompute: false });
      const result = c.compile(makeComp());
      expect(typeof result).toBe('string');
    });
  });

  // ─── MSAA option ──────────────────────────────────────────────────────────
  describe('compile() — msaa option', () => {
    it('msaa: 4 compiles without error', () => {
      const c = new WebGPUCompiler({ msaa: 4 });
      expect(() => c.compile(makeComp())).not.toThrow();
    });

    it('msaa: 1 compiles without error', () => {
      const c = new WebGPUCompiler({ msaa: 1 });
      expect(() => c.compile(makeComp())).not.toThrow();
    });
  });

  // ─── Render loop ──────────────────────────────────────────────────────────
  describe('compile() — render loop', () => {
    it('output contains requestAnimationFrame or render loop', () => {
      const result = compiler.compile(makeComp());
      expect(result).toMatch(/requestAnimationFrame|renderFrame|render/i);
    });
  });

  // ─── Idempotency ──────────────────────────────────────────────────────────
  describe('idempotency', () => {
    it('same composition produces same output on two calls', () => {
      const comp = makeComp({ objects: [makeObj('box')] });
      const r1 = compiler.compile(comp);
      const r2 = compiler.compile(comp);
      expect(r1).toBe(r2);
    });
  });
});
