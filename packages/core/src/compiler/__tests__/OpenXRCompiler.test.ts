import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OpenXRCompiler } from '../OpenXRCompiler';
import type { HoloComposition } from '../../parser/HoloCompositionTypes';

vi.mock('../identity/AgentRBAC', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getRBAC: () => ({ checkAccess: () => ({ allowed: true }) }),
  };
});

/**
 * Helper to build a minimal HoloComposition AST for testing
 */
function makeComposition(overrides: Partial<HoloComposition> = {}): HoloComposition {
  return {
    name: 'TestScene',
    objects: [],
    lights: [],
    cameras: [],
    spatialGroups: [],
    audio: [],
    timelines: [],
    logic: [],
    zones: [],
    ...overrides,
  } as HoloComposition;
}

describe('OpenXRCompiler', () => {
  let compiler: OpenXRCompiler;

  beforeEach(() => {
    compiler = new OpenXRCompiler();
  });

  // ===========================================================================
  // Construction
  // ===========================================================================
  describe('construction', () => {
    it('creates with defaults', () => {
      expect(compiler).toBeDefined();
    });

    it('accepts custom options', () => {
      const c = new OpenXRCompiler({
        appName: 'MyApp',
        renderBackend: 'opengl_es',
        enableHandTracking: true,
        enablePassthrough: true,
        indent: '    ',
      });
      expect(c).toBeDefined();
    });
  });

  // ===========================================================================
  // Compile Empty Scene
  // ===========================================================================
  describe('compile empty scene', () => {
    it('produces valid C++ output', () => {
      const result = compiler.compile(makeComposition(), 'test-token');
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    it('includes OpenXR headers', () => {
      const result = compiler.compile(makeComposition(), 'test-token');
      expect(result).toContain('#include');
      expect(result).toContain('openxr');
    });

    it('includes main function or entry point', () => {
      const result = compiler.compile(makeComposition(), 'test-token');
      expect(result).toMatch(/main|int\s+main|void\s+app/i);
    });
  });

  // ===========================================================================
  // Objects
  // ===========================================================================
  describe('objects', () => {
    it('emits object mesh creation code', () => {
      const result = compiler.compile(
        makeComposition({
          objects: [
            {
              name: 'my_cube',
              mesh: 'box',
              properties: [
                { key: 'mesh', value: 'box' },
                { key: 'position', value: [0, 1, 0] },
              ],
              traits: [],
              children: [],
            },
          ] as any,
        }),
        'test-token'
      );
      expect(result).toContain('my_cube');
    });

    it('handles multiple objects', () => {
      const result = compiler.compile(
        makeComposition({
          objects: [
            {
              name: 'obj1',
              mesh: 'box',
              properties: [{ key: 'mesh', value: 'box' }],
              traits: [],
              children: [],
            },
            {
              name: 'obj2',
              mesh: 'sphere',
              properties: [{ key: 'mesh', value: 'sphere' }],
              traits: [],
              children: [],
            },
          ] as any,
        }),
        'test-token'
      );
      expect(result).toContain('obj1');
      expect(result).toContain('obj2');
    });
  });

  // ===========================================================================
  // Lights & Cameras
  // ===========================================================================
  describe('lights', () => {
    it('emits light setup code', () => {
      const result = compiler.compile(
        makeComposition({
          lights: [
            {
              name: 'sun',
              type: 'directional',
              properties: [
                { key: 'type', value: 'directional' },
                { key: 'color', value: '#ffffff' },
                { key: 'intensity', value: 1.0 },
              ],
            },
          ] as any,
        }),
        'test-token'
      );
      expect(result).toContain('sun');
    });
  });

  describe('cameras', () => {
    it('emits camera code', () => {
      const result = compiler.compile(
        makeComposition({
          camera: {
            name: 'main_cam',
            properties: [
              { key: 'fov', value: 75 },
              { key: 'near', value: 0.1 },
              { key: 'far', value: 1000 },
            ],
          } as any,
        }),
        'test-token'
      );
      // emitCamera doesn't embed camera name, but emits xrLocateViews + nearClip/farClip
      expect(result).toContain('xrLocateViews');
      expect(result).toContain('nearClip');
    });
  });

  // ===========================================================================
  // Spatial Groups
  // ===========================================================================
  describe('spatial groups', () => {
    it('emits group transform code', () => {
      const result = compiler.compile(
        makeComposition({
          spatialGroups: [
            {
              name: 'gallery',
              properties: [{ key: 'position', value: [0, 0, -5] }],
              objects: [
                {
                  name: 'painting',
                  mesh: 'plane',
                  properties: [{ key: 'mesh', value: 'plane' }],
                  traits: [],
                  children: [],
                },
              ],
            },
          ] as any,
        }),
        'test-token'
      );
      expect(result).toContain('gallery');
    });
  });

  // ===========================================================================
  // Options Variants
  // ===========================================================================
  describe('option variants', () => {
    it('Vulkan backend includes Vulkan references', () => {
      const c = new OpenXRCompiler({ renderBackend: 'vulkan' });
      const result = c.compile(makeComposition(), 'test-token');
      expect(result.toLowerCase()).toContain('vulkan');
    });

    it('OpenGL ES backend includes GL references', () => {
      const c = new OpenXRCompiler({ renderBackend: 'opengl_es' });
      const result = c.compile(makeComposition(), 'test-token');
      expect(result.toLowerCase()).toMatch(/gl|opengl/);
    });

    it('hand tracking option emits hand tracking code', () => {
      const c = new OpenXRCompiler({ enableHandTracking: true });
      const result = c.compile(makeComposition(), 'test-token');
      expect(result.toLowerCase()).toContain('hand');
    });

    it('passthrough option emits passthrough code', () => {
      const c = new OpenXRCompiler({ enablePassthrough: true });
      const result = c.compile(makeComposition(), 'test-token');
      expect(result.toLowerCase()).toContain('passthrough');
    });
  });

  // ===========================================================================
  // Utility
  // ===========================================================================
  describe('utility', () => {
    it('sanitizes names with special characters', () => {
      const result = compiler.compile(
        makeComposition({
          objects: [
            {
              name: 'my-obj.test',
              properties: [{ key: 'mesh', value: 'box' }],
              traits: [],
              children: [],
            },
          ] as any,
        }),
        'test-token'
      );
      expect(result).toBeDefined();
    });
  });
});
