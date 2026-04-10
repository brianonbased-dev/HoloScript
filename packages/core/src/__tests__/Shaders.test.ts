import { describe, it, expect } from 'vitest';
import { ShaderGraph, SHADER_NODES } from '../rendering/ShaderGraph';
import { MaterialLibrary, MATERIAL_PRESETS } from '../rendering/MaterialLibrary';
import { PostProcessingStack, PP_PRESETS } from '../rendering/PostProcessing';

describe('Cycle 114: Shader & Materials', () => {
  // -------------------------------------------------------------------------
  // ShaderGraph
  // -------------------------------------------------------------------------

  it('should add nodes and connect them', () => {
    const graph = new ShaderGraph();
    const color = graph.addNode('Color');
    const output = graph.addNode('Output');
    expect(color).not.toBeNull();
    expect(output).not.toBeNull();

    const conn = graph.connect(color!.id, 'rgba', output!.id, 'albedo');
    expect(conn).not.toBeNull();
    expect(graph.getNodeCount()).toBe(2);
    expect(graph.getConnections()).toHaveLength(1);
  });

  it('should compile a shader graph to GLSL', () => {
    const graph = new ShaderGraph();
    const color = graph.addNode('Color', 0, 0, { color: [1, 0, 0, 1] });
    const output = graph.addNode('Output');
    graph.connect(color!.id, 'rgba', output!.id, 'albedo');

    const compiled = graph.compile();
    expect(compiled.vertexCode).toContain('gl_Position');
    expect(compiled.fragmentCode).toContain('void main()');
    expect(compiled.nodeCount).toBe(2);
  });

  it('should generate uniforms for unconnected inputs', () => {
    const graph = new ShaderGraph();
    const output = graph.addNode('Output');
    const compiled = graph.compile();

    // Unconnected inputs should generate uniforms
    expect(compiled.uniforms.length).toBeGreaterThan(0);
  });

  it('should reject unknown node types', () => {
    const graph = new ShaderGraph();
    const node = graph.addNode('NonExistent');
    expect(node).toBeNull();
  });

  // -------------------------------------------------------------------------
  // MaterialLibrary
  // -------------------------------------------------------------------------

  it('should register and retrieve materials', () => {
    const lib = new MaterialLibrary();
    lib.registerPreset('metal', 'my_metal');
    const mat = lib.getMaterial('my_metal');

    expect(mat).toBeDefined();
    expect(mat!.metallic).toBe(0.9);
    expect(mat!.roughness).toBe(0.2);
  });

  it('should create material instances with overrides', () => {
    const lib = new MaterialLibrary();
    lib.registerPreset('wood');

    const instance = lib.createInstance('wood', { roughness: 0.9 });
    expect(instance).not.toBeNull();

    const resolved = lib.resolveInstance(instance!.id);
    expect(resolved).not.toBeNull();
    expect(resolved!.roughness).toBe(0.9); // Overridden
    expect(resolved!.metallic).toBe(0); // From base
  });

  it('should set texture slots', () => {
    const lib = new MaterialLibrary();
    lib.registerPreset('ground');

    const success = lib.setTexture('ground', 'albedoMap', 'tex_grass');
    expect(success).toBe(true);

    const mat = lib.getMaterial('ground');
    expect(mat!.albedoMap).toBeDefined();
    expect(mat!.albedoMap!.textureId).toBe('tex_grass');
  });

  // -------------------------------------------------------------------------
  // PostProcessing
  // -------------------------------------------------------------------------

  it('should load and activate profiles', () => {
    const pp = new PostProcessingStack();
    const profile = pp.loadPreset('cinematic');
    expect(profile).not.toBeNull();
    expect(profile!.bloom.enabled).toBe(true);

    pp.setActive(profile!.id);
    const active = pp.getActive();
    expect(active).not.toBeNull();
    expect(active!.id).toBe('cinematic');
  });

  it('should toggle individual effects', () => {
    const pp = new PostProcessingStack();
    pp.loadPreset('sciFi');
    pp.setEffectEnabled('sciFi', 'bloom', false);

    const profile = pp.getProfile('sciFi');
    expect(profile!.bloom.enabled).toBe(false);
  });

  it('should blend between profiles', () => {
    const pp = new PostProcessingStack();
    pp.loadPreset('cinematic');
    pp.loadPreset('retro');

    const blended = pp.blendProfiles('cinematic', 'retro', 0.5);
    expect(blended).not.toBeNull();
    // Temperature should be halfway between 10 (cinematic) and 30 (retro)
    expect(blended!.colorGrading.temperature).toBeCloseTo(20, 1);
    // Bloom intensity halfway between 0.6 (cinematic) and default 0.5 (retro baseline)
    expect(blended!.bloom.intensity).toBeGreaterThan(0);
  });
});
