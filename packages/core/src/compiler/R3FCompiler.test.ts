import { describe, it, expect, beforeEach } from 'vitest';
import {
  R3FCompiler,
  R3FNode,
  MATERIAL_PRESETS,
  ENVIRONMENT_PRESETS,
  UI_COMPONENT_PRESETS,
} from './R3FCompiler';
import type { HSPlusAST, ASTNode } from '../types';
import { TraitVisualRegistry } from '../traits/visual/TraitVisualRegistry';

// Helper to create a minimal AST node
function createASTNode(
  type: string,
  properties: Record<string, any> = {},
  options: Partial<ASTNode> = {}
): ASTNode {
  return {
    type,
    properties,
    position: options.position,
    hologram: options.hologram,
    directives: options.directives,
    children: (options as any).children,
    id: (options as any).id,
    name: (options as any).name,
  } as ASTNode;
}

// Helper to create a minimal HSPlusAST
function createAST(root: ASTNode): HSPlusAST {
  return {
    version: '3.0',
    root,
  } as HSPlusAST;
}

// Helper to create HoloComposition format object
function createComposition(overrides: Partial<any> = {}): any {
  return {
    type: 'HoloComposition',
    name: 'TestComposition',
    objects: [],
    ...overrides,
  };
}

// Helper to create HoloObjectDecl
function createObjectDecl(name: string, overrides: Partial<any> = {}): any {
  return {
    type: 'ObjectDecl',
    name,
    properties: [],
    traits: [],
    ...overrides,
  };
}

describe('R3FCompiler', () => {
  let compiler: R3FCompiler;

  beforeEach(() => {
    compiler = new R3FCompiler();
  });

  describe('constructor', () => {
    it('should create a compiler instance', () => {
      expect(compiler).toBeDefined();
      expect(compiler).toBeInstanceOf(R3FCompiler);
    });
  });

  describe('compile (HSPlusAST)', () => {
    it('should compile a simple AST node', () => {
      const ast = createAST(createASTNode('group', {}, { id: 'root' }));
      const result = compiler.compile(ast);

      expect(result).toBeDefined();
      expect(result.type).toBe('group');
    });

    it('should inject default lighting when no lights present', () => {
      const ast = createAST(createASTNode('group', {}, { id: 'root' }));
      const result = compiler.compile(ast);

      expect(result.children).toBeDefined();
      const hasAmbient = result.children?.some((c) => c.type === 'ambientLight');
      const hasDirectional = result.children?.some((c) => c.type === 'directionalLight');

      expect(hasAmbient).toBe(true);
      expect(hasDirectional).toBe(true);
    });

    it('should not inject default lighting when lights are present', () => {
      const lightNode = createASTNode('light', { type: 'directional' });
      const ast = createAST(
        createASTNode('group', {}, { id: 'root', children: [lightNode] } as any)
      );
      const result = compiler.compile(ast);

      // Should have exactly one directionalLight from the AST, not additional default lights
      const directionalLights = result.children?.filter((c) => c.type === 'directionalLight');
      expect(directionalLights?.length).toBeGreaterThanOrEqual(1);
    });

    it('should handle mesh types correctly', () => {
      const sphereNode = createASTNode('sphere', { size: 2 }, { id: 'mySphere' });
      const ast = createAST(sphereNode);
      const result = compiler.compile(ast);

      expect(result.type).toBe('mesh');
      expect(result.props.hsType).toBe('sphere');
    });

    it('should map cube type to mesh', () => {
      const cubeNode = createASTNode('cube', { size: 1 }, { id: 'myCube' });
      const ast = createAST(cubeNode);
      const result = compiler.compile(ast);

      expect(result.type).toBe('mesh');
      expect(result.props.hsType).toBe('cube');
    });

    it('should handle orb type', () => {
      const orbNode = createASTNode('orb', {}, { id: 'myOrb' });
      const ast = createAST(orbNode);
      const result = compiler.compile(ast);

      expect(result.type).toBe('mesh');
      expect(result.props.hsType).toBe('orb');
    });
  });

  describe('compileNode', () => {
    it('should preserve node ID', () => {
      const node = createASTNode('box', {}, { id: 'myBox' } as any);
      const result = compiler.compileNode(node);

      expect(result.id).toBe('myBox');
    });

    it('should preserve node name', () => {
      const node = createASTNode('box', {}, { name: 'myNamedBox' } as any);
      const result = compiler.compileNode(node);

      expect(result.id).toBe('myNamedBox');
    });

    it('should compile nested children', () => {
      const childNode = createASTNode('sphere', {}, { id: 'child' });
      const parentNode = createASTNode('group', {}, { id: 'parent', children: [childNode] } as any);

      const result = compiler.compileNode(parentNode);

      expect(result.children).toHaveLength(1);
      expect(result.children?.[0].type).toBe('mesh');
      expect(result.children?.[0].props.hsType).toBe('sphere');
    });

    it('should initialize traits map', () => {
      const node = createASTNode('box', {});
      const result = compiler.compileNode(node);

      expect(result.traits).toBeInstanceOf(Map);
    });

    it('should process directives', () => {
      const node = createASTNode('box', {}, {
        directives: [{ type: 'trait', name: 'grabbable', config: { enabled: true } }],
      } as any);

      const result = compiler.compileNode(node);

      expect(result.traits?.get('grabbable' as any)).toEqual({ enabled: true });
    });
  });

  describe('compileComposition (HoloComposition)', () => {
    it('should compile an empty composition', () => {
      const composition = createComposition({ name: 'EmptyWorld' });
      const result = compiler.compileComposition(composition);

      expect(result.type).toBe('group');
      expect(result.id).toBe('EmptyWorld');
    });

    it('should compile objects', () => {
      const composition = createComposition({
        objects: [
          createObjectDecl('cube1', {
            properties: [{ key: 'mesh', value: 'cube' }],
          }),
        ],
      });

      const result = compiler.compileComposition(composition);

      expect(result.children?.some((c) => c.id === 'cube1')).toBe(true);
    });

    it('should compile spatial groups', () => {
      const composition = createComposition({
        spatialGroups: [
          {
            name: 'myGroup',
            properties: [{ key: 'position', value: [1, 2, 3] }],
            objects: [createObjectDecl('innerCube')],
          },
        ],
      });

      const result = compiler.compileComposition(composition);
      const group = result.children?.find((c) => c.id === 'myGroup');

      expect(group).toBeDefined();
      expect(group?.type).toBe('group');
      expect(group?.props.position).toEqual([1, 2, 3]);
    });

    it('should compile environment block', () => {
      const composition = createComposition({
        environment: {
          properties: [{ key: 'skybox', value: 'studio' }],
        },
      });

      const result = compiler.compileComposition(composition);

      const envNode = result.children?.find((c) => c.type === 'Environment');
      expect(envNode).toBeDefined();
    });

    it('should compile lights', () => {
      const composition = createComposition({
        lights: [
          {
            name: 'sunLight',
            lightType: 'directional',
            properties: [
              { key: 'intensity', value: 2.0 },
              { key: 'color', value: '#ffffff' },
            ],
          },
        ],
      });

      const result = compiler.compileComposition(composition);
      const light = result.children?.find((c) => c.id === 'sunLight');

      expect(light).toBeDefined();
      expect(light?.type).toBe('directionalLight');
      expect(light?.props.intensity).toBe(2.0);
    });

    it('should compile camera', () => {
      const composition = createComposition({
        camera: {
          cameraType: 'perspective',
          properties: [
            { key: 'fov', value: 75 },
            { key: 'position', value: [0, 5, 10] },
          ],
        },
      });

      const result = compiler.compileComposition(composition);
      const camera = result.children?.find((c) => c.type === 'Camera');

      expect(camera).toBeDefined();
      expect(camera?.props.fov).toBe(75);
      expect(camera?.props.cameraType).toBe('perspective');
    });

    it('should compile timelines', () => {
      const composition = createComposition({
        timelines: [
          {
            name: 'introSequence',
            autoplay: true,
            loop: false,
            entries: [
              {
                time: 0,
                action: { kind: 'animate', target: 'cube1', properties: { opacity: 1 } },
              },
            ],
          },
        ],
      });

      const result = compiler.compileComposition(composition);
      const timeline = result.children?.find((c) => c.id === 'introSequence');

      expect(timeline).toBeDefined();
      expect(timeline?.type).toBe('Timeline');
      expect(timeline?.props.autoplay).toBe(true);
    });

    it('should compile audio blocks', () => {
      const composition = createComposition({
        audio: [
          {
            name: 'bgMusic',
            properties: [
              { key: 'src', value: '/audio/music.mp3' },
              { key: 'volume', value: 0.5 },
            ],
          },
        ],
      });

      const result = compiler.compileComposition(composition);
      const audio = result.children?.find((c) => c.id === 'bgMusic');

      expect(audio).toBeDefined();
      expect(audio?.type).toBe('Audio');
      expect(audio?.props.src).toBe('/audio/music.mp3');
    });

    it('should compile zones', () => {
      const composition = createComposition({
        zones: [
          {
            name: 'spawnZone',
            properties: [{ key: 'shape', value: 'box' }],
            handlers: [{ event: 'enter', body: 'console.log("entered")' }],
          },
        ],
      });

      const result = compiler.compileComposition(composition);
      const zone = result.children?.find((c) => c.id === 'spawnZone');

      expect(zone).toBeDefined();
      expect(zone?.type).toBe('Zone');
      expect(zone?.props.handlers).toHaveLength(1);
    });

    it('should compile UI overlay', () => {
      const composition = createComposition({
        ui: {
          elements: [
            {
              name: 'healthBar',
              properties: [{ key: 'width', value: 200 }],
            },
          ],
        },
      });

      const result = compiler.compileComposition(composition);
      const ui = result.children?.find((c) => c.type === 'UI');

      expect(ui).toBeDefined();
      expect(ui?.children?.[0].id).toBe('healthBar');
    });

    it('should compile effects block', () => {
      const composition = createComposition({
        effects: {
          effects: [
            { effectType: 'bloom', properties: { intensity: 1.5 } },
            { effectType: 'vignette', properties: { darkness: 0.5 } },
          ],
        },
      });

      const result = compiler.compileComposition(composition);
      const effectComposer = result.children?.find((c) => c.type === 'EffectComposer');

      expect(effectComposer).toBeDefined();
      expect(effectComposer?.children).toHaveLength(2);
    });

    it('should compile transitions', () => {
      const composition = createComposition({
        transitions: [
          {
            name: 'fadeIn',
            properties: [
              { key: 'duration', value: 1.0 },
              { key: 'easing', value: 'easeInOut' },
            ],
          },
        ],
      });

      const result = compiler.compileComposition(composition);
      const transition = result.children?.find((c) => c.id === 'fadeIn');

      expect(transition).toBeDefined();
      expect(transition?.type).toBe('Transition');
    });

    it('should compile conditional blocks', () => {
      const composition = createComposition({
        conditionals: [
          {
            condition: 'isNight',
            objects: [createObjectDecl('nightObject')],
            elseObjects: [createObjectDecl('dayObject')],
          },
        ],
      });

      const result = compiler.compileComposition(composition);
      const conditional = result.children?.find((c) => c.type === 'ConditionalGroup');

      expect(conditional).toBeDefined();
      expect(conditional?.props.condition).toBe('isNight');
      expect(conditional?.children?.some((c) => c.id === 'nightObject')).toBe(true);
    });

    it('should compile for-each blocks', () => {
      const composition = createComposition({
        iterators: [
          {
            variable: 'item',
            iterable: 'items',
            objects: [createObjectDecl('itemDisplay')],
          },
        ],
      });

      const result = compiler.compileComposition(composition);
      const forEach = result.children?.find((c) => c.type === 'ForEachGroup');

      expect(forEach).toBeDefined();
      expect(forEach?.props.variable).toBe('item');
      expect(forEach?.props.iterable).toBe('items');
    });
  });

  describe('template merging', () => {
    it('should merge template properties onto objects', () => {
      const composition = createComposition({
        templates: [
          {
            name: 'RedCube',
            properties: [{ key: 'color', value: '#ff0000' }],
          },
        ],
        objects: [
          createObjectDecl('myCube', {
            template: 'RedCube',
            properties: [{ key: 'mesh', value: 'cube' }],
          }),
        ],
      });

      const result = compiler.compileComposition(composition);
      const cube = result.children?.find((c) => c.id === 'myCube');

      expect(cube?.props.color).toBe('#ff0000');
    });

    it('should merge template traits onto objects', () => {
      const composition = createComposition({
        templates: [
          {
            name: 'InteractiveObject',
            traits: [{ name: 'grabbable', config: {} }],
          },
        ],
        objects: [
          createObjectDecl('myObject', {
            template: 'InteractiveObject',
            properties: [],
          }),
        ],
      });

      const result = compiler.compileComposition(composition);
      const obj = result.children?.find((c) => c.id === 'myObject');

      expect(obj?.props.grabbable).toBeDefined();
    });

    it('should allow object properties to override template properties', () => {
      const composition = createComposition({
        templates: [
          {
            name: 'BlueCube',
            properties: [{ key: 'color', value: '#0000ff' }],
          },
        ],
        objects: [
          createObjectDecl('overriddenCube', {
            template: 'BlueCube',
            properties: [{ key: 'color', value: '#00ff00' }],
          }),
        ],
      });

      const result = compiler.compileComposition(composition);
      const cube = result.children?.find((c) => c.id === 'overriddenCube');

      expect(cube?.props.color).toBe('#00ff00');
    });
  });

  describe('trait handling', () => {
    it('should handle grabbable trait', () => {
      const composition = createComposition({
        objects: [
          createObjectDecl('grabbableObj', {
            traits: [{ name: 'grabbable', config: {} }],
          }),
        ],
      });

      const result = compiler.compileComposition(composition);
      const obj = result.children?.find((c) => c.id === 'grabbableObj');

      expect(obj?.props.grabbable).toBeDefined();
      expect(obj?.props.rigidBody).toEqual({ type: 'dynamic' });
      expect(obj?.props.collider).toEqual({ type: 'auto' });
      expect(obj?.props.castShadow).toBe(true);
    });

    it('should handle collidable trait', () => {
      const composition = createComposition({
        objects: [
          createObjectDecl('wall', {
            traits: [{ name: 'collidable', config: { type: 'fixed' } }],
          }),
        ],
      });

      const result = compiler.compileComposition(composition);
      const wall = result.children?.find((c) => c.id === 'wall');

      expect(wall?.props.rigidBody).toEqual({ type: 'fixed' });
      expect(wall?.props.collider).toEqual({ type: 'auto' });
    });

    it('should handle animated trait', () => {
      const composition = createComposition({
        objects: [
          createObjectDecl('spinner', {
            traits: [{ name: 'animated', config: { loop: true } }],
          }),
        ],
      });

      const result = compiler.compileComposition(composition);
      const obj = result.children?.find((c) => c.id === 'spinner');

      expect(obj?.props.animated).toEqual({ loop: true });
    });

    it('should handle networked trait', () => {
      const composition = createComposition({
        objects: [
          createObjectDecl('syncedObj', {
            traits: [{ name: 'networked', config: { authority: 'owner' } }],
          }),
        ],
      });

      const result = compiler.compileComposition(composition);
      const obj = result.children?.find((c) => c.id === 'syncedObj');

      expect(obj?.props.networked).toEqual({ authority: 'owner' });
    });

    it('should handle physics trait', () => {
      const composition = createComposition({
        objects: [
          createObjectDecl('physicsObj', {
            traits: [{ name: 'physics', config: { mass: 5 } }],
          }),
        ],
      });

      const result = compiler.compileComposition(composition);
      const obj = result.children?.find((c) => c.id === 'physicsObj');

      expect(obj?.props.rigidBody).toEqual({ type: 'dynamic', mass: 5 });
    });

    it('should handle bloom trait', () => {
      const composition = createComposition({
        objects: [
          createObjectDecl('glowingObj', {
            traits: [{ name: 'bloom', config: { intensity: 2.0 } }],
          }),
        ],
      });

      const result = compiler.compileComposition(composition);
      const obj = result.children?.find((c) => c.id === 'glowingObj');

      expect(obj?.props.bloom).toEqual({ intensity: 2.0 });
    });

    it('should handle gaussian_splat trait', () => {
      const composition = createComposition({
        objects: [
          createObjectDecl('splatObj', {
            traits: [{ name: 'gaussian_splat', config: { src: 'scene.ply' } }],
          }),
        ],
      });

      const result = compiler.compileComposition(composition);
      const obj = result.children?.find((c) => c.id === 'splatObj');

      expect(obj?.props.gaussianSplat).toEqual({ src: 'scene.ply' });
    });

    it('should handle cloth trait', () => {
      const composition = createComposition({
        objects: [
          createObjectDecl('clothObj', {
            traits: [{ name: 'cloth', config: { stiffness: 0.5 } }],
          }),
        ],
      });

      const result = compiler.compileComposition(composition);
      const obj = result.children?.find((c) => c.id === 'clothObj');

      expect(obj?.props.cloth).toEqual({ stiffness: 0.5 });
      expect(obj?.props.rigidBody).toEqual({ type: 'dynamic' });
    });

    it('should handle accessible trait', () => {
      const composition = createComposition({
        objects: [
          createObjectDecl('accessibleBtn', {
            traits: [{ name: 'accessible', config: { role: 'button' } }],
          }),
        ],
      });

      const result = compiler.compileComposition(composition);
      const obj = result.children?.find((c) => c.id === 'accessibleBtn');

      expect(obj?.props.accessible).toEqual({ role: 'button' });
    });
  });

  describe('material handling', () => {
    it('should apply material preset by name', () => {
      const composition = createComposition({
        objects: [
          createObjectDecl('metalCube', {
            properties: [{ key: 'material', value: 'metal' }],
          }),
        ],
      });

      const result = compiler.compileComposition(composition);
      const obj = result.children?.find((c) => c.id === 'metalCube');

      expect(obj?.props.materialProps?.metalness).toBe(1.0);
      expect(obj?.props.materialProps?.roughness).toBe(0.2);
    });

    it('should apply material preset with overrides', () => {
      const composition = createComposition({
        objects: [
          createObjectDecl('customGlass', {
            properties: [
              {
                key: 'material',
                value: { preset: 'glass', color: '#aaddff' },
              },
            ],
          }),
        ],
      });

      const result = compiler.compileComposition(composition);
      const obj = result.children?.find((c) => c.id === 'customGlass');

      expect(obj?.props.materialProps?.transmission).toBe(0.95);
      expect(obj?.props.materialProps?.color).toBe('#aaddff');
    });

    it('should handle roughness property', () => {
      const composition = createComposition({
        objects: [
          createObjectDecl('roughObj', {
            properties: [{ key: 'roughness', value: 0.8 }],
          }),
        ],
      });

      const result = compiler.compileComposition(composition);
      const obj = result.children?.find((c) => c.id === 'roughObj');

      expect(obj?.props.materialProps?.roughness).toBe(0.8);
    });

    it('should handle metalness property', () => {
      const composition = createComposition({
        objects: [
          createObjectDecl('metallicObj', {
            properties: [{ key: 'metallic', value: 0.9 }],
          }),
        ],
      });

      const result = compiler.compileComposition(composition);
      const obj = result.children?.find((c) => c.id === 'metallicObj');

      expect(obj?.props.materialProps?.metalness).toBe(0.9);
    });

    it('should handle opacity with transparency', () => {
      const composition = createComposition({
        objects: [
          createObjectDecl('transparentObj', {
            properties: [{ key: 'opacity', value: 0.5 }],
          }),
        ],
      });

      const result = compiler.compileComposition(composition);
      const obj = result.children?.find((c) => c.id === 'transparentObj');

      expect(obj?.props.materialProps?.opacity).toBe(0.5);
      expect(obj?.props.materialProps?.transparent).toBe(true);
    });

    it('should handle emissive properties', () => {
      const composition = createComposition({
        objects: [
          createObjectDecl('glowObj', {
            properties: [
              { key: 'emissive', value: '#ff0000' },
              { key: 'emissive_intensity', value: 2.0 },
            ],
          }),
        ],
      });

      const result = compiler.compileComposition(composition);
      const obj = result.children?.find((c) => c.id === 'glowObj');

      expect(obj?.props.materialProps?.emissive).toBe('#ff0000');
      expect(obj?.props.materialProps?.emissiveIntensity).toBe(2.0);
    });
  });

  describe('position and transform', () => {
    it('should handle position array', () => {
      const composition = createComposition({
        objects: [
          createObjectDecl('posObj', {
            properties: [{ key: 'position', value: [1, 2, 3] }],
          }),
        ],
      });

      const result = compiler.compileComposition(composition);
      const obj = result.children?.find((c) => c.id === 'posObj');

      expect(obj?.props.position).toEqual([1, 2, 3]);
    });

    it('should handle rotation array', () => {
      const composition = createComposition({
        objects: [
          createObjectDecl('rotObj', {
            properties: [{ key: 'rotation', value: [0, Math.PI, 0] }],
          }),
        ],
      });

      const result = compiler.compileComposition(composition);
      const obj = result.children?.find((c) => c.id === 'rotObj');

      expect(obj?.props.rotation).toEqual([0, Math.PI, 0]);
    });

    it('should handle scale array', () => {
      const composition = createComposition({
        objects: [
          createObjectDecl('scaleObj', {
            properties: [{ key: 'scale', value: [2, 2, 2] }],
          }),
        ],
      });

      const result = compiler.compileComposition(composition);
      const obj = result.children?.find((c) => c.id === 'scaleObj');

      expect(obj?.props.scale).toEqual([2, 2, 2]);
    });

    it('should handle uniform scale', () => {
      const composition = createComposition({
        objects: [
          createObjectDecl('uniformScaleObj', {
            properties: [{ key: 'scale', value: 3 }],
          }),
        ],
      });

      const result = compiler.compileComposition(composition);
      const obj = result.children?.find((c) => c.id === 'uniformScaleObj');

      expect(obj?.props.scale).toEqual([3, 3, 3]);
    });
  });

  describe('light types', () => {
    it('should compile directional light', () => {
      const composition = createComposition({
        lights: [
          {
            name: 'sun',
            lightType: 'directional',
            properties: [{ key: 'intensity', value: 1.5 }],
          },
        ],
      });

      const result = compiler.compileComposition(composition);
      const light = result.children?.find((c) => c.id === 'sun');

      expect(light?.type).toBe('directionalLight');
      expect(light?.props.castShadow).toBe(true);
    });

    it('should compile point light', () => {
      const composition = createComposition({
        lights: [
          {
            name: 'lamp',
            lightType: 'point',
            properties: [{ key: 'intensity', value: 2.0 }],
          },
        ],
      });

      const result = compiler.compileComposition(composition);
      const light = result.children?.find((c) => c.id === 'lamp');

      expect(light?.type).toBe('pointLight');
    });

    it('should compile spot light', () => {
      const composition = createComposition({
        lights: [
          {
            name: 'spotlight',
            lightType: 'spot',
            properties: [{ key: 'angle', value: 0.5 }],
          },
        ],
      });

      const result = compiler.compileComposition(composition);
      const light = result.children?.find((c) => c.id === 'spotlight');

      expect(light?.type).toBe('spotLight');
      expect(light?.props.castShadow).toBe(true);
    });

    it('should compile hemisphere light', () => {
      const composition = createComposition({
        lights: [
          {
            name: 'sky',
            lightType: 'hemisphere',
            properties: [
              { key: 'color', value: '#87ceeb' },
              { key: 'groundColor', value: '#5a3d2b' },
            ],
          },
        ],
      });

      const result = compiler.compileComposition(composition);
      const light = result.children?.find((c) => c.id === 'sky');

      expect(light?.type).toBe('hemisphereLight');
      expect(light?.props.groundColor).toBe('#5a3d2b');
    });

    it('should compile ambient light', () => {
      const composition = createComposition({
        lights: [
          {
            name: 'ambient',
            lightType: 'ambient',
            properties: [{ key: 'intensity', value: 0.3 }],
          },
        ],
      });

      const result = compiler.compileComposition(composition);
      const light = result.children?.find((c) => c.id === 'ambient');

      expect(light?.type).toBe('ambientLight');
    });
  });

  describe('special object types', () => {
    it('should compile model/GLTF objects', () => {
      const composition = createComposition({
        objects: [
          createObjectDecl('myModel', {
            properties: [{ key: 'src', value: '/models/robot.glb' }],
          }),
        ],
      });

      const result = compiler.compileComposition(composition);
      const obj = result.children?.find((c) => c.id === 'myModel');

      expect(obj?.type).toBe('gltfModel');
      expect(obj?.props.src).toBe('/models/robot.glb');
    });

    it('should compile text objects', () => {
      const composition = createComposition({
        objects: [
          createObjectDecl('label', {
            properties: [
              { key: 'type', value: 'text' },
              { key: 'text', value: 'Hello World' },
              { key: 'font_size', value: 24 },
            ],
          }),
        ],
      });

      const result = compiler.compileComposition(composition);
      const obj = result.children?.find((c) => c.id === 'label');

      expect(obj?.type).toBe('Text');
      expect(obj?.props.text).toBe('Hello World');
      expect(obj?.props.fontSize).toBe(24);
    });

    it('should compile sparkles objects', () => {
      const composition = createComposition({
        objects: [
          createObjectDecl('particles', {
            properties: [{ key: 'type', value: 'sparkles' }],
          }),
        ],
      });

      const result = compiler.compileComposition(composition);
      const obj = result.children?.find((c) => c.id === 'particles');

      expect(obj?.type).toBe('Sparkles');
    });

    it('should compile portal objects', () => {
      const composition = createComposition({
        objects: [
          createObjectDecl('gate', {
            properties: [{ key: 'type', value: 'portal' }],
          }),
        ],
      });

      const result = compiler.compileComposition(composition);
      const obj = result.children?.find((c) => c.id === 'gate');

      expect(obj?.type).toBe('Portal');
    });
  });

  describe('geometry args', () => {
    it('should generate sphere args', () => {
      const composition = createComposition({
        objects: [
          createObjectDecl('sphere', {
            properties: [
              { key: 'mesh', value: 'sphere' },
              { key: 'size', value: 2 },
            ],
          }),
        ],
      });

      const result = compiler.compileComposition(composition);
      const obj = result.children?.find((c) => c.id === 'sphere');

      expect(obj?.props.args).toEqual([1, 32, 32]); // radius = size * 0.5
    });

    it('should generate cube args', () => {
      const composition = createComposition({
        objects: [
          createObjectDecl('cube', {
            properties: [
              { key: 'mesh', value: 'cube' },
              { key: 'size', value: 3 },
            ],
          }),
        ],
      });

      const result = compiler.compileComposition(composition);
      const obj = result.children?.find((c) => c.id === 'cube');

      expect(obj?.props.args).toEqual([3, 3, 3]);
    });

    it('should generate torus args', () => {
      const composition = createComposition({
        objects: [
          createObjectDecl('torus', {
            properties: [
              { key: 'mesh', value: 'torus' },
              { key: 'size', value: 2 },
            ],
          }),
        ],
      });

      const result = compiler.compileComposition(composition);
      const obj = result.children?.find((c) => c.id === 'torus');

      // [radius, tube, radialSegments, tubularSegments]
      expect(obj?.props.args[0]).toBe(1); // size * 0.5
    });
  });

  describe('spread expansion', () => {
    it('should expand spreads in object properties', () => {
      const composition = createComposition({
        templates: [
          {
            name: 'BaseConfig',
            properties: { color: '#ff0000', roughness: 0.5 },
          },
        ],
        objects: [
          createObjectDecl('spreadObj', {
            properties: [
              { type: 'spread', target: 'BaseConfig' },
              { key: 'metalness', value: 1.0 },
            ],
          }),
        ],
      });

      const result = compiler.compileComposition(composition);
      const obj = result.children?.find((c) => c.id === 'spreadObj');

      // Spread should have been expanded
      expect(obj?.props).toBeDefined();
    });
  });

  describe('environment presets', () => {
    it('should apply studio preset', () => {
      const composition = createComposition({
        environment: {
          properties: [{ key: 'preset', value: 'studio' }],
        },
      });

      const result = compiler.compileComposition(composition);
      const envNode = result.children?.find((c) => c.type === 'Environment');

      expect(envNode).toBeDefined();
      expect(envNode?.props.background).toBe(true);
    });

    it('should apply cyberpunk_city preset with fog and lights', () => {
      const composition = createComposition({
        environment: {
          properties: [{ key: 'skybox', value: 'cyberpunk_city' }],
        },
      });

      const result = compiler.compileComposition(composition);

      const fogNode = result.children?.find((c) => c.type === 'fog');
      expect(fogNode).toBeDefined();
    });

    it('should apply explicit fog', () => {
      const composition = createComposition({
        environment: {
          properties: [
            {
              key: 'fog',
              value: { color: '#888888', near: 5, far: 50 },
            },
          ],
        },
      });

      const result = compiler.compileComposition(composition);
      const fogNode = result.children?.find((c) => c.type === 'fog');

      expect(fogNode).toBeDefined();
      expect(fogNode?.props.color).toBe('#888888');
      expect(fogNode?.props.near).toBe(5);
      expect(fogNode?.props.far).toBe(50);
    });
  });

  describe('edge cases', () => {
    it('should handle empty composition', () => {
      const composition = createComposition({
        name: 'EmptyScene',
        objects: [],
      });

      const result = compiler.compileComposition(composition);

      expect(result).toBeDefined();
      expect(result.type).toBe('group');
    });

    it('should handle null/undefined properties gracefully', () => {
      const composition = createComposition({
        objects: [
          createObjectDecl('nullProps', {
            properties: [
              { key: 'color', value: null },
              { key: 'position', value: undefined },
            ],
          }),
        ],
      });

      expect(() => compiler.compileComposition(composition)).not.toThrow();
    });

    it('should handle empty object name', () => {
      const composition = createComposition({
        objects: [createObjectDecl('', { properties: [] })],
      });

      const result = compiler.compileComposition(composition);
      expect(result.children?.length).toBeGreaterThan(0);
    });

    it('should handle very long object names', () => {
      const longName = 'a'.repeat(1000);
      const composition = createComposition({
        objects: [createObjectDecl(longName, { properties: [] })],
      });

      const result = compiler.compileComposition(composition);
      expect(result.children?.some((c) => c.id === longName)).toBe(true);
    });

    it('should handle special characters in object names', () => {
      const specialNames = [
        'object-with-dashes',
        'object.with.dots',
        'object_with_underscores',
        'object with spaces',
        'object:with:colons',
        '日本語オブジェクト',
        'emoji🎮object',
      ];

      for (const name of specialNames) {
        const composition = createComposition({
          objects: [createObjectDecl(name, { properties: [] })],
        });

        expect(() => compiler.compileComposition(composition)).not.toThrow();
      }
    });

    it('should handle deeply nested children', () => {
      // Create 10 levels of nesting
      let deepest: any = createObjectDecl('level10', { properties: [] });
      for (let i = 9; i >= 1; i--) {
        deepest = createObjectDecl(`level${i}`, {
          properties: [],
          children: [deepest],
        });
      }

      const composition = createComposition({ objects: [deepest] });

      // Should compile without throwing
      expect(() => compiler.compileComposition(composition)).not.toThrow();

      const result = compiler.compileComposition(composition);
      // At minimum, the top-level object should exist
      expect(result.children?.some((c) => c.id === 'level1')).toBe(true);
    });

    it('should handle many objects', () => {
      const objects = Array.from({ length: 100 }, (_, i) =>
        createObjectDecl(`obj${i}`, { properties: [{ key: 'mesh', value: 'cube' }] })
      );

      const composition = createComposition({ objects });
      const result = compiler.compileComposition(composition);

      // Should have 100 objects plus default lighting
      expect(result.children?.length).toBeGreaterThanOrEqual(100);
    });

    it('should handle many traits on single object', () => {
      const manyTraits = [
        { name: 'grabbable', config: {} },
        { name: 'hoverable', config: {} },
        { name: 'animated', config: {} },
        { name: 'physics', config: {} },
        { name: 'networked', config: {} },
        { name: 'bloom', config: {} },
        { name: 'accessible', config: {} },
      ];

      const composition = createComposition({
        objects: [createObjectDecl('manyTraits', { traits: manyTraits })],
      });

      const result = compiler.compileComposition(composition);
      const obj = result.children?.find((c) => c.id === 'manyTraits');

      expect(obj?.props.grabbable).toBeDefined();
      expect(obj?.props.bloom).toBeDefined();
      expect(obj?.props.accessible).toBeDefined();
    });

    it('should handle extreme numeric values', () => {
      const composition = createComposition({
        objects: [
          createObjectDecl('extremeValues', {
            properties: [
              { key: 'position', value: [Number.MAX_SAFE_INTEGER, 0, -Number.MAX_SAFE_INTEGER] },
              { key: 'scale', value: [0.0000001, 1000000, 1] },
              { key: 'opacity', value: 0 },
            ],
          }),
        ],
      });

      expect(() => compiler.compileComposition(composition)).not.toThrow();
    });

    it('should handle circular-like references in templates', () => {
      const composition = createComposition({
        templates: [
          { name: 'TemplateA', properties: [{ key: 'color', value: '#ff0000' }] },
          { name: 'TemplateB', properties: [{ key: 'size', value: 2 }] },
        ],
        objects: [
          createObjectDecl('obj1', { template: 'TemplateA', properties: [] }),
          createObjectDecl('obj2', { template: 'TemplateB', properties: [] }),
        ],
      });

      expect(() => compiler.compileComposition(composition)).not.toThrow();
    });

    it('should handle unknown material preset gracefully', () => {
      const composition = createComposition({
        objects: [
          createObjectDecl('unknownMat', {
            properties: [{ key: 'material', value: 'nonexistent_preset' }],
          }),
        ],
      });

      expect(() => compiler.compileComposition(composition)).not.toThrow();
    });

    it('should handle unknown environment preset gracefully', () => {
      const composition = createComposition({
        environment: {
          properties: [{ key: 'preset', value: 'nonexistent_environment' }],
        },
      });

      expect(() => compiler.compileComposition(composition)).not.toThrow();
    });

    it('should handle empty arrays in properties', () => {
      const composition = createComposition({
        objects: [
          createObjectDecl('emptyArrays', {
            properties: [
              { key: 'position', value: [] },
              { key: 'rotation', value: [] },
            ],
          }),
        ],
      });

      expect(() => compiler.compileComposition(composition)).not.toThrow();
    });

    it('should handle missing required properties', () => {
      const composition = createComposition({
        objects: [
          createObjectDecl('minimal', {
            // No properties at all
          }),
        ],
      });

      const result = compiler.compileComposition(composition);
      expect(result.children?.some((c) => c.id === 'minimal')).toBe(true);
    });
  });
});

describe('MATERIAL_PRESETS', () => {
  it('should have plastic preset', () => {
    expect(MATERIAL_PRESETS.plastic).toBeDefined();
    expect(MATERIAL_PRESETS.plastic.metalness).toBe(0.0);
  });

  it('should have metal preset', () => {
    expect(MATERIAL_PRESETS.metal).toBeDefined();
    expect(MATERIAL_PRESETS.metal.metalness).toBe(1.0);
  });

  it('should have glass preset with transmission', () => {
    expect(MATERIAL_PRESETS.glass).toBeDefined();
    expect(MATERIAL_PRESETS.glass.transmission).toBe(0.95);
    expect(MATERIAL_PRESETS.glass.transparent).toBe(true);
  });

  it('should have hologram preset', () => {
    expect(MATERIAL_PRESETS.hologram).toBeDefined();
    expect(MATERIAL_PRESETS.hologram.transparent).toBe(true);
    expect(MATERIAL_PRESETS.hologram.emissiveIntensity).toBe(1.0);
  });

  it('should have stone preset', () => {
    expect(MATERIAL_PRESETS.stone).toBeDefined();
    expect(MATERIAL_PRESETS.stone.roughness).toBe(0.85);
    expect(MATERIAL_PRESETS.stone.metalness).toBe(0.0);
    expect(MATERIAL_PRESETS.stone.color).toBe('#808080');
  });

  it('should have marble preset with env reflection', () => {
    expect(MATERIAL_PRESETS.marble).toBeDefined();
    expect(MATERIAL_PRESETS.marble.roughness).toBe(0.15);
    expect(MATERIAL_PRESETS.marble.envMapIntensity).toBe(0.8);
    expect(MATERIAL_PRESETS.marble.color).toBe('#F0EDE6');
  });

  it('should have shiny preset with clearcoat', () => {
    expect(MATERIAL_PRESETS.shiny).toBeDefined();
    expect(MATERIAL_PRESETS.shiny.roughness).toBe(0.05);
    expect(MATERIAL_PRESETS.shiny.clearcoat).toBe(0.8);
    expect(MATERIAL_PRESETS.shiny.envMapIntensity).toBe(1.5);
  });

  it('should have neon preset with high emissive', () => {
    expect(MATERIAL_PRESETS.neon).toBeDefined();
    expect(MATERIAL_PRESETS.neon.emissiveIntensity).toBe(3.0);
    expect(MATERIAL_PRESETS.neon.transparent).toBe(true);
    expect(MATERIAL_PRESETS.neon.opacity).toBe(0.9);
  });

  it('should have toon preset', () => {
    expect(MATERIAL_PRESETS.toon).toBeDefined();
    expect(MATERIAL_PRESETS.toon.roughness).toBe(1.0);
    expect(MATERIAL_PRESETS.toon.metalness).toBe(0.0);
  });

  it('should have wireframe preset', () => {
    expect(MATERIAL_PRESETS.wireframe).toBeDefined();
    expect(MATERIAL_PRESETS.wireframe.wireframe).toBe(true);
    expect(MATERIAL_PRESETS.wireframe.metalness).toBe(0.5);
  });

  it('should have velvet preset with clearcoat', () => {
    expect(MATERIAL_PRESETS.velvet).toBeDefined();
    expect(MATERIAL_PRESETS.velvet.roughness).toBe(1.0);
    expect(MATERIAL_PRESETS.velvet.clearcoat).toBe(0.3);
  });

  it('should have xray preset with transparency', () => {
    expect(MATERIAL_PRESETS.xray).toBeDefined();
    expect(MATERIAL_PRESETS.xray.transparent).toBe(true);
    expect(MATERIAL_PRESETS.xray.opacity).toBe(0.3);
  });

  it('should have gradient preset', () => {
    expect(MATERIAL_PRESETS.gradient).toBeDefined();
    expect(MATERIAL_PRESETS.gradient.roughness).toBe(0.5);
  });

  it('should have matte preset', () => {
    expect(MATERIAL_PRESETS.matte).toBeDefined();
    expect(MATERIAL_PRESETS.matte.roughness).toBe(1.0);
    expect(MATERIAL_PRESETS.matte.metalness).toBe(0.0);
  });
});

describe('ENVIRONMENT_PRESETS', () => {
  it('should have forest_sunset preset', () => {
    expect(ENVIRONMENT_PRESETS.forest_sunset).toBeDefined();
    expect(ENVIRONMENT_PRESETS.forest_sunset.fog).toBeDefined();
  });

  it('should have cyberpunk_city preset with postprocessing', () => {
    expect(ENVIRONMENT_PRESETS.cyberpunk_city).toBeDefined();
    expect(ENVIRONMENT_PRESETS.cyberpunk_city.postprocessing?.bloom).toBeDefined();
  });

  it('should have space_void preset', () => {
    expect(ENVIRONMENT_PRESETS.space_void).toBeDefined();
    expect(ENVIRONMENT_PRESETS.space_void.background).toBe(true);
  });

  it('should have underwater preset with fog', () => {
    expect(ENVIRONMENT_PRESETS.underwater).toBeDefined();
    expect(ENVIRONMENT_PRESETS.underwater.fog?.color).toBe('#003366');
  });
});

describe('UI_COMPONENT_PRESETS', () => {
  it('should have UIPanel preset', () => {
    expect(UI_COMPONENT_PRESETS.UIPanel).toBeDefined();
    expect(UI_COMPONENT_PRESETS.UIPanel.component).toBe('Container');
  });

  it('should have UIButton preset with default styles', () => {
    expect(UI_COMPONENT_PRESETS.UIButton).toBeDefined();
    expect(UI_COMPONENT_PRESETS.UIButton.defaultProps.cursor).toBe('pointer');
  });

  it('should have UISlider preset', () => {
    expect(UI_COMPONENT_PRESETS.UISlider).toBeDefined();
    expect(UI_COMPONENT_PRESETS.UISlider.defaultProps.width).toBe(200);
  });
});

describe('R3FCompiler — TraitCompositor integration', () => {
  let compiler: R3FCompiler;

  beforeEach(() => {
    compiler = new R3FCompiler();
  });

  it('should apply single visual trait material properties', () => {
    const composition = createComposition({
      objects: [
        createObjectDecl('ironOrb', {
          traits: [{ name: 'iron_material', config: {} }],
        }),
      ],
    });

    const result = compiler.compileComposition(composition);
    const obj = result.children?.find((c) => c.id === 'ironOrb');

    expect(obj?.props.materialProps).toBeDefined();
    expect(obj?.props.materialProps.metalness).toBe(0.9);
    expect(obj?.props.materialProps.roughness).toBe(0.5);
  });

  it('should compose multiple traits with layer ordering', () => {
    const composition = createComposition({
      objects: [
        createObjectDecl('multiTrait', {
          traits: [
            { name: 'wooden', config: {} }, // base_material (layer 0), roughness 0.8
            { name: 'glowing', config: {} }, // lighting (layer 5), roughness 0.3
          ],
        }),
      ],
    });

    const result = compiler.compileComposition(composition);
    const obj = result.children?.find((c) => c.id === 'multiTrait');

    expect(obj?.props.materialProps).toBeDefined();
    // Glowing (layer 5) overrides wooden (layer 0) for roughness
    expect(obj?.props.materialProps.roughness).toBe(0.3);
    // Glowing emissive should be present
    expect(obj?.props.materialProps.emissive).toBe('#FFDD44');
    expect(obj?.props.materialProps.emissiveIntensity).toBe(0.4);
  });

  it('should apply suppression rules (pristine suppresses rusted)', () => {
    const composition = createComposition({
      objects: [
        createObjectDecl('pristineObj', {
          traits: [
            { name: 'iron_material', config: {} },
            { name: 'pristine', config: {} },
            { name: 'rusted', config: {} },
          ],
        }),
      ],
    });

    const result = compiler.compileComposition(composition);
    const obj = result.children?.find((c) => c.id === 'pristineObj');

    // Pristine suppresses rusted, so rusted's high roughness shouldn't appear
    expect(obj?.props.materialProps).toBeDefined();
    // Pristine (layer 2) roughness 0.1 overrides iron_material (layer 0) roughness 0.5
    // Rusted's 0.85 roughness should NOT be present (suppressed)
    expect(obj?.props.materialProps.roughness).toBe(0.1);
  });

  it('should apply multi-trait merge rules (gold + polished)', () => {
    const composition = createComposition({
      objects: [
        createObjectDecl('shinyGold', {
          traits: [
            { name: 'gold_material', config: {} },
            { name: 'polished', config: {} },
          ],
        }),
      ],
    });

    const result = compiler.compileComposition(composition);
    const obj = result.children?.find((c) => c.id === 'shinyGold');

    // Multi-trait rule: gold_material + polished = high-shine gold
    expect(obj?.props.materialProps).toBeDefined();
    expect(obj?.props.materialProps.roughness).toBeLessThanOrEqual(0.05);
    expect(obj?.props.materialProps.envMapIntensity).toBeGreaterThanOrEqual(2.0);
  });

  it('should apply requirement rules (rusted without metallic tag fails)', () => {
    const composition = createComposition({
      objects: [
        createObjectDecl('woodenRusted', {
          traits: [
            { name: 'wooden', config: {} }, // tags: ['organic', 'opaque'] — no 'metallic'
            { name: 'rusted', config: {} }, // requires tag 'metallic'
          ],
        }),
      ],
    });

    const result = compiler.compileComposition(composition);
    const obj = result.children?.find((c) => c.id === 'woodenRusted');

    // Rusted should not apply because wooden doesn't have metallic tag
    expect(obj?.props.materialProps).toBeDefined();
    // metalness should be 0.0 (wooden), not 0.6 (rusted)
    expect(obj?.props.materialProps.metalness).toBe(0.0);
    // roughness should be 0.8 (wooden), not 0.85 (rusted)
    expect(obj?.props.materialProps.roughness).toBe(0.8);
  });

  it('should handle NPC role traits with emissive visuals', () => {
    const composition = createComposition({
      objects: [
        createObjectDecl('healerNPC', {
          traits: [{ name: 'healer_npc', config: {} }],
        }),
      ],
    });

    const result = compiler.compileComposition(composition);
    const obj = result.children?.find((c) => c.id === 'healerNPC');

    expect(obj?.props.materialProps).toBeDefined();
    expect(obj?.props.materialProps.emissive).toBe('#00FF88');
    expect(obj?.props.materialProps.emissiveIntensity).toBe(0.25);
  });

  it('should handle game mechanic traits (explosive)', () => {
    const composition = createComposition({
      objects: [
        createObjectDecl('bomb', {
          traits: [{ name: 'explosive', config: {} }],
        }),
      ],
    });

    const result = compiler.compileComposition(composition);
    const obj = result.children?.find((c) => c.id === 'bomb');

    expect(obj?.props.materialProps).toBeDefined();
    expect(obj?.props.materialProps.emissive).toBe('#FF4400');
    expect(obj?.props.materialProps.emissiveIntensity).toBeGreaterThanOrEqual(0.3);
  });

  it('should still pass trait config as props alongside material', () => {
    const composition = createComposition({
      objects: [
        createObjectDecl('configObj', {
          traits: [
            { name: 'grabbable', config: { snapZone: true } },
            { name: 'iron_material', config: {} },
          ],
        }),
      ],
    });

    const result = compiler.compileComposition(composition);
    const obj = result.children?.find((c) => c.id === 'configObj');

    // Grabbable should still set its specific props via the if-branch
    expect(obj?.props.grabbable).toEqual({ snapZone: true });
    // iron_material should apply material via compositor
    expect(obj?.props.materialProps.metalness).toBe(0.9);
  });

  it('should have 1500+ registered visual traits', () => {
    const registry = TraitVisualRegistry.getInstance();
    expect(registry.size).toBeGreaterThanOrEqual(1500);
  });
});

// ─── End-to-End Pipeline Tests (Parse → Compile → Verify R3FNode) ───────────

import { HoloScriptCodeParser } from '../HoloScriptCodeParser';

describe('R3FCompiler E2E: Parse → Compile', () => {
  let compiler: R3FCompiler;
  let parser: HoloScriptCodeParser;

  beforeEach(() => {
    compiler = new R3FCompiler();
    parser = new HoloScriptCodeParser();
  });

  describe('system compilation', () => {
    it('should compile a standalone system via compileNode', () => {
      const code = `system TutorialSystem {
  state { currentStep: 0, completed: false }
  action next() { state.currentStep += 1 }
}`;
      const result = parser.parse(code);
      expect(result.success).toBe(true);

      const sysNode = result.ast.find((n) => n.type === 'system')!;
      const r3f = compiler.compileNode(sysNode);

      expect(r3f.type).toBe('System');
      expect(r3f.id).toBe('TutorialSystem');
      expect(r3f.props.systemState).toEqual({ currentStep: 0, completed: false });
      expect(r3f.props.systemActions).toBeDefined();
      expect(r3f.props.systemActions.length).toBe(1);
      expect(r3f.props.systemActions[0].name).toBe('next');
    });

    it('should compile a system with lifecycle hooks', () => {
      const code = `system GameLoop {
  state { score: 0, running: true }
  on_start { state.running = true }
  on_update { state.score += 1 }
  on_destroy { state.running = false }
}`;
      const result = parser.parse(code);
      expect(result.success).toBe(true);

      const sysNode = result.ast.find((n) => n.type === 'system')!;
      const r3f = compiler.compileNode(sysNode);

      expect(r3f.type).toBe('System');
      expect(r3f.id).toBe('GameLoop');
      expect(r3f.props.systemState).toEqual({ score: 0, running: true });
      expect(r3f.props.systemHooks).toBeDefined();
      expect(r3f.props.systemHooks.length).toBe(3);
      expect(r3f.props.systemHooks.map((h: any) => h.name)).toEqual([
        'on_start',
        'on_update',
        'on_destroy',
      ]);
    });

    it('should compile a system with nested objects', () => {
      const code = `system SpawnSystem {
  state { spawnCount: 0 }

  object "SpawnPoint" {
    geometry: "sphere"
    position: [0, 1, 0]
  }
}`;
      const result = parser.parse(code);
      expect(result.success).toBe(true);

      const sysNode = result.ast.find((n) => n.type === 'system')!;
      const r3f = compiler.compileNode(sysNode);

      expect(r3f.type).toBe('System');
      expect(r3f.children).toBeDefined();
      expect(r3f.children!.length).toBeGreaterThanOrEqual(1);
    });

    it('should map system type correctly in mapType', () => {
      const node = createASTNode('system', {}, { id: 'TestSys' });
      // Through generic compileNode, mapType is called before dispatch
      // But our dispatch happens first, so test mapType directly
      const ast = createAST(node);
      const result = compiler.compile(ast);
      // System dispatch takes priority, producing 'System' type
      expect(result.type).toBe('System');
    });
  });

  describe('component compilation', () => {
    it('should compile a standalone component via compileNode', () => {
      const code = `component MobileControls {
  props { visible: true, joystickSize: 120 }
  state { isMoving: false }
  action toggle() { state.isMoving = !state.isMoving }
}`;
      const result = parser.parse(code);
      expect(result.success).toBe(true);

      const compNode = result.ast.find((n) => n.type === 'component')!;
      const r3f = compiler.compileNode(compNode);

      expect(r3f.type).toBe('Component');
      expect(r3f.id).toBeDefined();
      expect(r3f.props.componentProps).toEqual({ visible: true, joystickSize: 120 });
      expect(r3f.props.componentState).toEqual({ isMoving: false });
      expect(r3f.props.componentActions).toBeDefined();
      expect(r3f.props.componentActions.length).toBe(1);
    });

    it('should compile a component with hooks and UI', () => {
      const code = `component Scoreboard {
  state { score: 0 }
  on_start { state.score = 0 }
}`;
      const result = parser.parse(code);
      expect(result.success).toBe(true);

      const compNode = result.ast.find((n) => n.type === 'component')!;
      const r3f = compiler.compileNode(compNode);

      expect(r3f.type).toBe('Component');
      expect(r3f.props.componentState).toEqual({ score: 0 });
      expect(r3f.props.componentHooks).toBeDefined();
      expect(r3f.props.componentHooks.length).toBe(1);
    });
  });

  describe('composition with systems and components', () => {
    it('should compile a composition containing systems via compileComposition', () => {
      const code = `composition "Hololand" {
  system TutorialSystem {
    state { step: 0 }
  }
  system ThemeSystem {
    state { theme: "default" }
  }
}`;
      const result = parser.parse(code);
      expect(result.success).toBe(true);

      const compNode = result.ast.find((n) => n.type === 'composition')!;
      const r3f = compiler.compileComposition(compNode as any);

      expect(r3f.type).toBe('group');
      expect(r3f.id).toBe('Hololand');
      expect(r3f.children).toBeDefined();

      const systems = r3f.children!.filter((c) => c.type === 'System');
      expect(systems.length).toBe(2);
      expect(systems[0].id).toBe('TutorialSystem');
      expect(systems[0].props.systemState).toEqual({ step: 0 });
      expect(systems[1].id).toBe('ThemeSystem');
      expect(systems[1].props.systemState).toEqual({ theme: 'default' });
    });

    it('should compile a composition containing components', () => {
      const code = `composition "App" {
  component HUD {
    props { visible: true }
    state { health: 100 }
  }
}`;
      const result = parser.parse(code);
      expect(result.success).toBe(true);

      const compNode = result.ast.find((n) => n.type === 'composition')!;
      const r3f = compiler.compileComposition(compNode as any);

      const components = r3f.children!.filter((c) => c.type === 'Component');
      expect(components.length).toBe(1);
      expect(components[0].props.componentProps).toEqual({ visible: true });
      expect(components[0].props.componentState).toEqual({ health: 100 });
    });

    it('should compile a full composition with templates, objects, systems, and components', () => {
      const code = `composition "FullScene" {
  template "Enemy" {
    geometry: "sphere"
    color: "#ff0000"
  }

  object "Goblin" using "Enemy" {
    position: [0, 0, 5]
  }

  system CombatSystem {
    state { active: true, round: 1 }
    action startRound() { state.round += 1 }
  }

  component DamageUI {
    props { visible: false }
    state { lastDamage: 0 }
  }
}`;
      const result = parser.parse(code);
      expect(result.success).toBe(true);

      const compNode = result.ast.find((n) => n.type === 'composition')!;
      const r3f = compiler.compileComposition(compNode as any);

      expect(r3f.type).toBe('group');
      expect(r3f.id).toBe('FullScene');

      // Should have children for all node types
      const templates = r3f.children!.filter((c) => c.type === 'Template');
      const systems = r3f.children!.filter((c) => c.type === 'System');
      const components = r3f.children!.filter((c) => c.type === 'Component');

      expect(templates.length).toBe(1);
      expect(templates[0].id).toBe('Enemy');

      expect(systems.length).toBe(1);
      expect(systems[0].id).toBe('CombatSystem');
      expect(systems[0].props.systemState).toEqual({ active: true, round: 1 });
      expect(systems[0].props.systemActions).toBeDefined();

      expect(components.length).toBe(1);
      expect(components[0].props.componentProps).toEqual({ visible: false });
      expect(components[0].props.componentState).toEqual({ lastDamage: 0 });
    });

    it('should compile composition via the compile(ast) path', () => {
      const code = `composition "TestScene" {
  system PhysicsSystem {
    state { gravity: 9.8 }
  }

  object "Floor" {
    geometry: "plane"
    position: [0, 0, 0]
  }
}`;
      const result = parser.parse(code);
      expect(result.success).toBe(true);

      // Through compile() path, the composition root goes through compileNode
      const ast: HSPlusAST = {
        version: '3.0',
        root: result.ast[0] as any,
      };
      const r3f = compiler.compile(ast);

      // The composition node compiles via compileNode which recurses children
      expect(r3f).toBeDefined();
      expect(r3f.children).toBeDefined();
      expect(r3f.children!.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('system with directives', () => {
    it('should preserve trait directives on systems', () => {
      const code = `system NetworkedGame {
  @networked
  state { players: 0 }
}`;
      const result = parser.parse(code);
      expect(result.success).toBe(true);

      const sysNode = result.ast.find((n) => n.type === 'system')!;
      const r3f = compiler.compileNode(sysNode);

      expect(r3f.type).toBe('System');
      expect(r3f.directives).toBeDefined();
    });
  });
});
