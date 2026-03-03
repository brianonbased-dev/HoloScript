/**
 * R3FCompiler — Production Test Suite
 *
 * Covers: compile() from HSPlusAST, compileComposition() from HoloComposition,
 * compileNode() for raw AST nodes, MATERIAL_PRESETS (PBR properties),
 * ENVIRONMENT_PRESETS (lighting configs), lights, camera, spatial groups,
 * traits, options, and default lighting injection.
 */
import { describe, it, expect, beforeEach, vi} from 'vitest';
import { R3FCompiler, MATERIAL_PRESETS, ENVIRONMENT_PRESETS } from '../R3FCompiler';

vi.mock('../identity/AgentRBAC', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getRBAC: () => ({ checkAccess: () => ({ allowed: true }) }),
  };
});


// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeComp(overrides: Record<string, any> = {}) {
  return { name: 'TestScene', objects: [], ...overrides } as any;
}

function makeObj(name: string, geometry = 'box', traits: any[] = []) {
  return { name, properties: [{ key: 'geometry', value: geometry }], traits } as any;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('R3FCompiler — Production', () => {
  let compiler: R3FCompiler;

  beforeEach(() => {
    compiler = new R3FCompiler();
  });

  // ─── Constructor ───────────────────────────────────────────────────────────
  describe('constructor', () => {
    it('instantiates without arguments', () => {
      expect(compiler).toBeDefined();
    });

    it('instantiates with options', () => {
      const c = new R3FCompiler({ defaultLighting: false });
      expect(c).toBeDefined();
    });
  });

  // ─── compile() — HSPlusAST path ────────────────────────────────────────────
  describe('compile()', () => {
    it('compiles a minimal HSPlusAST', () => {
      const ast = { root: { type: 'scene', children: [] } } as any;
      const result = compiler.compile(ast, 'test-token');
      expect(result).toBeDefined();
      expect(result.type).toBeDefined();
    });

    it('returns a node with children array', () => {
      const ast = { root: { type: 'scene', children: [] } } as any;
      const result = compiler.compile(ast, 'test-token');
      expect(Array.isArray(result.children)).toBe(true);
    });

    it('compiles AST with a child node', () => {
      const ast = {
        root: {
          type: 'scene',
          children: [{ type: 'cube', properties: {}, children: [] }],
        },
      } as any;
      const result = compiler.compile(ast, 'test-token');
      expect(result).toBeDefined();
    });
  });

  // ─── compileComposition() ─────────────────────────────────────────────────
  describe('compileComposition()', () => {
    it('returns a group node with the scene name as id', () => {
      const result = compiler.compileComposition(makeComp({ name: 'MyScene' }));
      expect(result.type).toBe('group');
      expect(result.id).toBe('MyScene');
    });

    it('children array is defined on empty scene', () => {
      const result = compiler.compileComposition(makeComp());
      expect(Array.isArray(result.children)).toBe(true);
    });

    it('injects default lighting when no lights provided', () => {
      const result = compiler.compileComposition(makeComp());
      const hasLight = result.children!.some(c =>
        c.type.toLowerCase().includes('light')
      );
      expect(hasLight).toBe(true);
    });

    it('compiles a single object into a child node', () => {
      const result = compiler.compileComposition(
        makeComp({ objects: [makeObj('cube')] })
      );
      expect(result.children!.length).toBeGreaterThan(0);
    });

    it('compiled object preserves name as id', () => {
      const result = compiler.compileComposition(
        makeComp({ objects: [makeObj('myBox')] })
      );
      const objNode = result.children!.find(c => c.id === 'myBox');
      expect(objNode).toBeDefined();
    });

    it('compiles multiple objects', () => {
      const result = compiler.compileComposition(
        makeComp({ objects: [makeObj('a'), makeObj('b')] })
      );
      const children = result.children!.filter(c => c.id === 'a' || c.id === 'b');
      expect(children.length).toBe(2);
    });

    it('compiles sphere geometry', () => {
      const result = compiler.compileComposition(
        makeComp({ objects: [makeObj('ball', 'sphere')] })
      );
      expect(result.children!.some(c => c.id === 'ball')).toBe(true);
    });

    // ─── Lights ────────────────────────────────────────────────────────────
    it('compiles a directional light', () => {
      const result = compiler.compileComposition(
        makeComp({
          lights: [{ name: 'sun', lightType: 'directional', properties: [{ key: 'intensity', value: 1.5 }] }],
        })
      );
      const light = result.children!.find(c => c.type === 'directionalLight');
      expect(light).toBeDefined();
      expect(light!.props.intensity).toBe(1.5);
    });

    it('compiles a point light', () => {
      const result = compiler.compileComposition(
        makeComp({
          lights: [{ name: 'lamp', lightType: 'point', properties: [{ key: 'color', value: '#ff0000' }] }],
        })
      );
      const light = result.children!.find(c => c.type === 'pointLight');
      expect(light).toBeDefined();
    });

    it('compiles a spot light', () => {
      const result = compiler.compileComposition(
        makeComp({
          lights: [{ name: 'spot', lightType: 'spot', properties: [] }],
        })
      );
      const light = result.children!.find(c => c.type === 'spotLight');
      expect(light).toBeDefined();
    });

    // ─── Camera ─────────────────────────────────────────────────────────────
    it('compiles a perspective camera', () => {
      const result = compiler.compileComposition(
        makeComp({
          camera: { cameraType: 'perspective', properties: [{ key: 'fov', value: 75 }] },
        })
      );
      const cam = result.children!.find(c => c.type === 'Camera');
      expect(cam).toBeDefined();
      expect(cam!.props.fov).toBe(75);
    });

    // ─── Spatial groups ─────────────────────────────────────────────────────
    it('compiles spatial groups', () => {
      const result = compiler.compileComposition(
        makeComp({
          spatialGroups: [{
            name: 'grp1',
            objects: [makeObj('child')],
            properties: [],
          }],
        })
      );
      const grp = result.children!.find(c => c.id === 'grp1');
      expect(grp).toBeDefined();
    });

    it('nested objects inside group produce children', () => {
      const result = compiler.compileComposition(
        makeComp({
          spatialGroups: [{
            name: 'grp1',
            objects: [makeObj('inner')],
            properties: [],
          }],
        })
      );
      const grp = result.children!.find(c => c.id === 'grp1');
      expect(grp).toBeDefined();
      expect(Array.isArray(grp!.children)).toBe(true);
    });

    // ─── Environment ────────────────────────────────────────────────────────
    it('compiles with environment preset', () => {
      const result = compiler.compileComposition(
        makeComp({ environment: { preset: 'sunset' } })
      );
      expect(result).toBeDefined();
    });
  });

  // ─── compileNode() ─────────────────────────────────────────────────────────
  describe('compileNode()', () => {
    it('compiles a raw cube node', () => {
      const node = { type: 'cube', properties: { size: 2 }, children: [] };
      const result = compiler.compileNode(node as any);
      expect(result).toBeDefined();
      expect(result.type).toBeDefined();
    });

    it('compiles a raw sphere node', () => {
      const node = { type: 'sphere', properties: { radius: 1 }, children: [] };
      const result = compiler.compileNode(node as any);
      expect(result).toBeDefined();
    });
  });

  // ─── MATERIAL_PRESETS ─────────────────────────────────────────────────────
  describe('MATERIAL_PRESETS', () => {
    it('exports MATERIAL_PRESETS', () => {
      expect(MATERIAL_PRESETS).toBeDefined();
    });

    it('has more than 50 presets', () => {
      expect(Object.keys(MATERIAL_PRESETS).length).toBeGreaterThan(50);
    });

    it('includes standard presets: plastic, metal, glass', () => {
      expect(MATERIAL_PRESETS.plastic).toBeDefined();
      expect(MATERIAL_PRESETS.metal).toBeDefined();
      expect(MATERIAL_PRESETS.glass).toBeDefined();
    });

    it('plastic preset has PBR roughness and metalness numbers', () => {
      expect(typeof MATERIAL_PRESETS.plastic.roughness).toBe('number');
      expect(typeof MATERIAL_PRESETS.plastic.metalness).toBe('number');
    });

    it('metal preset has metalness near 1.0', () => {
      expect(MATERIAL_PRESETS.metal.metalness).toBeGreaterThanOrEqual(0.9);
    });

    it('chrome preset has very low roughness', () => {
      expect(MATERIAL_PRESETS.chrome.roughness).toBeLessThan(0.1);
    });

    it('wood preset exists', () => {
      expect(MATERIAL_PRESETS.wood).toBeDefined();
    });

    it('animated material presets have _animated metadata', () => {
      expect(MATERIAL_PRESETS.flowing_water._animated).toBeDefined();
      expect(MATERIAL_PRESETS.flowing_water._animated.pattern).toBe('flow');
    });

    it('volumetric material presets have _volumetric metadata', () => {
      expect(MATERIAL_PRESETS.fog._volumetric).toBeDefined();
      expect(MATERIAL_PRESETS.fog._volumetric.type).toBe('fog');
    });
  });

  // ─── ENVIRONMENT_PRESETS ──────────────────────────────────────────────────
  describe('ENVIRONMENT_PRESETS', () => {
    it('exports ENVIRONMENT_PRESETS', () => {
      expect(ENVIRONMENT_PRESETS).toBeDefined();
    });

    it('has at least one preset', () => {
      expect(Object.keys(ENVIRONMENT_PRESETS).length).toBeGreaterThan(0);
    });

    it('studio preset has lighting config', () => {
      const studio = ENVIRONMENT_PRESETS.studio;
      expect(studio).toBeDefined();
      expect(studio.lighting).toBeDefined();
      expect(studio.lighting.ambient).toBeDefined();
    });

    it('studio preset has directional lighting', () => {
      expect(ENVIRONMENT_PRESETS.studio.lighting.directional).toBeDefined();
    });

    it('forest_sunset preset has fog', () => {
      expect(ENVIRONMENT_PRESETS.forest_sunset.fog).toBeDefined();
    });

    it('underwater preset exists', () => {
      expect(ENVIRONMENT_PRESETS.underwater).toBeDefined();
    });
  });
});
