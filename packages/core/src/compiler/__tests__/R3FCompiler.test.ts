import { describe, it, expect, vi } from 'vitest';
import { R3FCompiler, MATERIAL_PRESETS, ENVIRONMENT_PRESETS } from '../R3FCompiler';

vi.mock('../identity/AgentRBAC', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getRBAC: () => ({ checkAccess: () => ({ allowed: true }) }),
  };
});

describe('R3FCompiler', () => {
  // =========== Constructor & compile ===========

  it('instantiates without arguments', () => {
    const compiler = new R3FCompiler();
    expect(compiler).toBeDefined();
  });

  it('compiles a minimal HSPlusAST', () => {
    const compiler = new R3FCompiler();
    const ast = {
      root: { type: 'scene', children: [] },
    } as any;
    const result = compiler.compile(ast, 'test-token');
    expect(result).toBeDefined();
    expect(result.type).toBeDefined();
  });

  // =========== compileComposition ===========

  it('compiles a minimal HoloComposition', () => {
    const compiler = new R3FCompiler();
    const result = compiler.compileComposition({ name: 'TestScene', objects: [] });
    expect(result.type).toBe('group');
    expect(result.id).toBe('TestScene');
    expect(result.children).toBeDefined();
  });

  it('compiles objects into R3F nodes', () => {
    const compiler = new R3FCompiler();
    const result = compiler.compileComposition({
      name: 'TestScene',
      objects: [{ name: 'cube', properties: [{ key: 'geometry', value: 'box' }], traits: [] }],
    });
    expect(result.children!.length).toBeGreaterThan(0);
  });

  it('compiles lights into R3F light nodes', () => {
    const compiler = new R3FCompiler();
    const result = compiler.compileComposition({
      name: 'TestScene',
      objects: [],
      lights: [
        { name: 'sun', lightType: 'directional', properties: [{ key: 'intensity', value: 1.5 }] },
      ],
    });
    const lightNode = result.children!.find((c) => c.type === 'directionalLight');
    expect(lightNode).toBeDefined();
    expect(lightNode!.props.intensity).toBe(1.5);
  });

  it('compiles point lights', () => {
    const compiler = new R3FCompiler();
    const result = compiler.compileComposition({
      name: 'TestScene',
      objects: [],
      lights: [
        { name: 'lamp', lightType: 'point', properties: [{ key: 'color', value: '#ff0000' }] },
      ],
    });
    const lightNode = result.children!.find((c) => c.type === 'pointLight');
    expect(lightNode).toBeDefined();
  });

  it('compiles camera', () => {
    const compiler = new R3FCompiler();
    const result = compiler.compileComposition({
      name: 'TestScene',
      objects: [],
      camera: { cameraType: 'perspective', properties: [{ key: 'fov', value: 75 }] },
    });
    const cameraNode = result.children!.find((c) => c.type === 'Camera');
    expect(cameraNode).toBeDefined();
    expect(cameraNode!.props.fov).toBe(75);
  });

  // =========== Default lighting injection ===========

  it('injects default lighting when no lights exist', () => {
    const compiler = new R3FCompiler();
    const result = compiler.compileComposition({ name: 'TestScene', objects: [] });
    const hasLight = result.children!.some((c) => c.type.toLowerCase().includes('light'));
    expect(hasLight).toBe(true);
  });

  // =========== Multiple objects ===========

  it('compiles multiple objects', () => {
    const compiler = new R3FCompiler();
    const result = compiler.compileComposition({
      name: 'TestScene',
      objects: [
        { name: 'a', properties: [{ key: 'geometry', value: 'box' }], traits: [] },
        { name: 'b', properties: [{ key: 'geometry', value: 'sphere' }], traits: [] },
      ],
    });
    const objectChildren = result.children!.filter((c) => c.id === 'a' || c.id === 'b');
    expect(objectChildren.length).toBe(2);
  });

  // =========== MATERIAL_PRESETS ===========

  it('exports MATERIAL_PRESETS with many presets', () => {
    expect(MATERIAL_PRESETS).toBeDefined();
    expect(Object.keys(MATERIAL_PRESETS).length).toBeGreaterThan(50);
    expect(MATERIAL_PRESETS.plastic).toBeDefined();
    expect(MATERIAL_PRESETS.metal).toBeDefined();
    expect(MATERIAL_PRESETS.glass).toBeDefined();
  });

  it('material presets have expected PBR properties', () => {
    const plastic = MATERIAL_PRESETS.plastic;
    expect(plastic.roughness).toBeTypeOf('number');
    expect(plastic.metalness).toBeTypeOf('number');
  });

  // =========== ENVIRONMENT_PRESETS ===========

  it('exports ENVIRONMENT_PRESETS', () => {
    expect(ENVIRONMENT_PRESETS).toBeDefined();
    expect(Object.keys(ENVIRONMENT_PRESETS).length).toBeGreaterThan(0);
  });

  it('environment presets include lighting config', () => {
    const studio = ENVIRONMENT_PRESETS.studio;
    expect(studio).toBeDefined();
    expect(studio.lighting).toBeDefined();
    expect(studio.lighting.ambient).toBeDefined();
  });

  // =========== compileNode ===========

  it('compiles a raw AST node', () => {
    const compiler = new R3FCompiler();
    const node = {
      type: 'cube',
      properties: { size: 2 },
      children: [],
    };
    const result = compiler.compileNode(node as any);
    expect(result).toBeDefined();
    expect(result.type).toBeDefined();
  });

  // =========== Spatial groups ===========

  it('compiles spatial groups in compositions', () => {
    const compiler = new R3FCompiler();
    const result = compiler.compileComposition({
      name: 'TestScene',
      objects: [],
      spatialGroups: [
        {
          name: 'grp1',
          objects: [{ name: 'child', properties: [{ key: 'geometry', value: 'box' }], traits: [] }],
          properties: [],
        },
      ],
    });
    const grp = result.children!.find((c) => c.id === 'grp1');
    expect(grp).toBeDefined();
  });

  // =========== @draft trait → assetMaturity ===========

  it('sets assetMaturity to draft when @draft trait is present', () => {
    const compiler = new R3FCompiler();
    const result = compiler.compileComposition({
      name: 'DraftScene',
      objects: [
        {
          name: 'building',
          properties: [{ key: 'geometry', value: 'box' }],
          traits: [{ name: 'draft', config: { shape: 'box', collision: true } }],
        },
      ],
    });
    const building = result.children!.find((c) => c.id === 'building');
    expect(building).toBeDefined();
    expect(building!.assetMaturity).toBe('draft');
    expect(building!.props.draftMode).toBe(true);
    expect(building!.props.draftShape).toBe('box');
  });

  it('@draft trait auto-adds collision proxy', () => {
    const compiler = new R3FCompiler();
    const result = compiler.compileComposition({
      name: 'DraftScene',
      objects: [
        {
          name: 'wall',
          properties: [{ key: 'geometry', value: 'box' }],
          traits: [{ name: 'draft' }],
        },
      ],
    });
    const wall = result.children!.find((c) => c.id === 'wall');
    expect(wall).toBeDefined();
    expect(wall!.props.rigidBody).toEqual({ type: 'fixed' });
    expect(wall!.props.collider).toEqual({ type: 'auto' });
  });

  it('@draft trait respects collision: false', () => {
    const compiler = new R3FCompiler();
    const result = compiler.compileComposition({
      name: 'DraftScene',
      objects: [
        {
          name: 'ghost',
          properties: [{ key: 'geometry', value: 'sphere' }],
          traits: [{ name: 'draft', config: { collision: false } }],
        },
      ],
    });
    const ghost = result.children!.find((c) => c.id === 'ghost');
    expect(ghost).toBeDefined();
    expect(ghost!.props.rigidBody).toBeUndefined();
    expect(ghost!.props.collider).toBeUndefined();
  });

  it('@draft uses default color and wireframe', () => {
    const compiler = new R3FCompiler();
    const result = compiler.compileComposition({
      name: 'DraftScene',
      objects: [
        {
          name: 'prop',
          properties: [{ key: 'geometry', value: 'cylinder' }],
          traits: [{ name: 'draft' }],
        },
      ],
    });
    const prop = result.children!.find((c) => c.id === 'prop');
    expect(prop!.props.draftColor).toBe('#88aaff');
    expect(prop!.props.draftWireframe).toBe(false);
    expect(prop!.props.draftOpacity).toBe(1.0);
  });

  // =========== maturity / promoteUrl / collisionShape properties ===========

  it('sets assetMaturity from explicit maturity property', () => {
    const compiler = new R3FCompiler();
    const result = compiler.compileComposition({
      name: 'MaturityScene',
      objects: [
        {
          name: 'tree',
          properties: [
            { key: 'geometry', value: 'cone' },
            { key: 'maturity', value: 'final' },
          ],
          traits: [],
        },
      ],
    });
    const tree = result.children!.find((c) => c.id === 'tree');
    expect(tree!.assetMaturity).toBe('final');
    expect(tree!.props.maturityOverride).toBeUndefined();
  });

  it('passes through promoteUrl property', () => {
    const compiler = new R3FCompiler();
    const result = compiler.compileComposition({
      name: 'PromoteScene',
      objects: [
        {
          name: 'building',
          properties: [
            { key: 'geometry', value: 'box' },
            { key: 'promoteUrl', value: '/assets/building.glb' },
          ],
          traits: [{ name: 'draft' }],
        },
      ],
    });
    const building = result.children!.find((c) => c.id === 'building');
    expect(building!.props.promoteUrl).toBe('/assets/building.glb');
    expect(building!.assetMaturity).toBe('draft');
  });

  it('passes through collisionShape property', () => {
    const compiler = new R3FCompiler();
    const result = compiler.compileComposition({
      name: 'CollisionScene',
      objects: [
        {
          name: 'rock',
          properties: [
            { key: 'geometry', value: 'sphere' },
            { key: 'collisionShape', value: 'capsule' },
          ],
          traits: [],
        },
      ],
    });
    const rock = result.children!.find((c) => c.id === 'rock');
    expect(rock!.props.collisionShape).toBe('capsule');
  });

  // =========== Pool reset clears assetMaturity ===========

  it('does not carry assetMaturity across unrelated objects', () => {
    const compiler = new R3FCompiler();
    const result = compiler.compileComposition({
      name: 'MixedScene',
      objects: [
        {
          name: 'draft_obj',
          properties: [{ key: 'geometry', value: 'box' }],
          traits: [{ name: 'draft' }],
        },
        {
          name: 'normal_obj',
          properties: [{ key: 'geometry', value: 'sphere' }],
          traits: [],
        },
      ],
    });
    const draftObj = result.children!.find((c) => c.id === 'draft_obj');
    const normalObj = result.children!.find((c) => c.id === 'normal_obj');
    expect(draftObj!.assetMaturity).toBe('draft');
    expect(normalObj!.assetMaturity).toBeUndefined();
  });
});
