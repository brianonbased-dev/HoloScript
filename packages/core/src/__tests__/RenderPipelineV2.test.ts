/**
 * RenderPipelineV2.test.ts — Cycle 191
 *
 * Tests for MaterialSystem and ShaderGraph (rendering pipeline).
 * PostProcessEffect is abstract with GPU deps — tested via MaterialSystem
 * and ShaderGraph which are fully testable without WebGPU.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { MaterialSystem } from '../rendering/MaterialSystem';
import { ShaderGraph } from '@holoscript/engine/shader';

describe('MaterialSystem', () => {
  let ms: MaterialSystem;
  beforeEach(() => {
    ms = new MaterialSystem();
  });

  it('registers and retrieves shaders', () => {
    ms.registerShader('s1', 'vert code', 'frag code');
    const s = ms.getShader('s1');
    expect(s).toBeDefined();
    expect(s!.vertexSrc).toBe('vert code');
  });

  it('creates materials with defaults', () => {
    ms.registerShader('pbr', 'v', 'f');
    const mat = ms.createMaterial('m1', 'Metal', 'pbr');
    expect(mat.id).toBe('m1');
    expect(mat.blendMode).toBe('opaque');
    expect(mat.cullMode).toBe('back');
    expect(mat.roughness).toBe(0.5);
  });

  it('get/remove material', () => {
    ms.registerShader('s', 'v', 'f');
    ms.createMaterial('m1', 'Test', 's');
    expect(ms.getMaterial('m1')).toBeDefined();
    ms.removeMaterial('m1');
    expect(ms.getMaterial('m1')).toBeUndefined();
  });

  it('sets and gets uniforms', () => {
    ms.registerShader('s', 'v', 'f');
    ms.createMaterial('m1', 'Mat', 's');
    ms.setUniform('m1', 'color', 'vec4', [1, 0, 0, 1]);
    const u = ms.getUniform('m1', 'color');
    expect(u).toBeDefined();
    expect(u!.type).toBe('vec4');
  });

  it('setPBR clamps values', () => {
    ms.registerShader('s', 'v', 'f');
    ms.createMaterial('m1', 'Mat', 's');
    ms.setPBR('m1', { metallic: 1.5, roughness: -0.2 });
    const mat = ms.getMaterial('m1')!;
    expect(mat.metallic).toBe(1);
    expect(mat.roughness).toBe(0);
  });

  it('blend and cull mode changes', () => {
    ms.registerShader('s', 'v', 'f');
    ms.createMaterial('m1', 'Glass', 's');
    ms.setBlendMode('m1', 'alpha');
    ms.setCullMode('m1', 'none');
    const mat = ms.getMaterial('m1')!;
    expect(mat.blendMode).toBe('alpha');
    expect(mat.cullMode).toBe('none');
  });

  it('sorted materials: opaque before transparent', () => {
    ms.registerShader('s', 'v', 'f');
    ms.createMaterial('glass', 'Glass', 's');
    ms.setBlendMode('glass', 'alpha');
    ms.createMaterial('wall', 'Wall', 's');
    const sorted = ms.getSortedMaterials();
    expect(sorted[0].id).toBe('wall');
    expect(sorted[1].id).toBe('glass');
  });

  it('clones materials independently', () => {
    ms.registerShader('s', 'v', 'f');
    ms.createMaterial('m1', 'Original', 's');
    ms.setPBR('m1', { metallic: 0.8 });
    const clone = ms.cloneMaterial('m1', 'm2', 'Clone')!;
    expect(clone.metallic).toBe(0.8);
    ms.setPBR('m1', { metallic: 0.1 });
    expect(ms.getMaterial('m2')!.metallic).toBe(0.8);
  });

  it('getMaterialCount tracks additions', () => {
    ms.registerShader('s', 'v', 'f');
    ms.createMaterial('a', 'A', 's');
    ms.createMaterial('b', 'B', 's');
    expect(ms.getMaterialCount()).toBe(2);
  });
});

describe('ShaderGraph', () => {
  let sg: ShaderGraph;
  beforeEach(() => {
    sg = new ShaderGraph('Test Graph');
  });

  it('creates with name and id', () => {
    expect(sg.name).toBe('Test Graph');
    expect(sg.id).toBeDefined();
  });

  it('creates nodes from templates', () => {
    const node = sg.createNode('math_add');
    expect(node).not.toBeNull();
    expect(node!.type).toBe('math_add');
    expect(sg.getNode(node!.id)).toBeDefined();
  });

  it('removes nodes and associated connections', () => {
    const a = sg.createNode('math_add')!;
    const b = sg.createNode('output_surface')!;
    sg.connect(a.id, 'result', b.id, 'color');
    sg.removeNode(a.id);
    expect(sg.getNode(a.id)).toBeUndefined();
    expect(sg.getNodeConnections(b.id)).toHaveLength(0);
  });

  it('connects ports', () => {
    const a = sg.createNode('constant_float')!;
    const b = sg.createNode('math_add')!;
    const conn = sg.connect(a.id, 'value', b.id, 'a');
    expect(conn).not.toBeNull();
    expect(sg.connections.length).toBe(1);
  });

  it('prevents cycles', () => {
    const a = sg.createNode('math_add')!;
    const b = sg.createNode('math_multiply')!;
    sg.connect(a.id, 'result', b.id, 'a');
    const cycle = sg.connect(b.id, 'result', a.id, 'a');
    expect(cycle).toBeNull();
  });

  it('disconnects ports', () => {
    const a = sg.createNode('constant_float')!;
    const b = sg.createNode('math_add')!;
    sg.connect(a.id, 'value', b.id, 'a');
    sg.disconnectPort(b.id, 'a');
    expect(sg.connections).toHaveLength(0);
  });

  it('topological sort produces valid order', () => {
    const a = sg.createNode('constant_float')!;
    const b = sg.createNode('math_add')!;
    sg.connect(a.id, 'value', b.id, 'a');
    const order = sg.getTopologicalOrder();
    const idxA = order.findIndex((n) => n.id === a.id);
    const idxB = order.findIndex((n) => n.id === b.id);
    expect(idxA).toBeLessThan(idxB);
  });

  it('validates graph', () => {
    const result = sg.validate();
    expect(result).toHaveProperty('valid');
    expect(result).toHaveProperty('errors');
  });

  it('serializes to JSON and back', () => {
    const a = sg.createNode('constant_float')!;
    sg.setNodeProperty(a.id, 'value', 42);
    const json = sg.toJSON();
    const restored = ShaderGraph.fromJSON(json);
    expect(restored.name).toBe('Test Graph');
  });

  it('duplicates nodes', () => {
    const a = sg.createNode('math_add')!;
    const dup = sg.duplicateNode(a.id);
    expect(dup).not.toBeNull();
    expect(dup!.id).not.toBe(a.id);
  });

  it('clear removes all nodes and connections', () => {
    sg.createNode('math_add');
    sg.createNode('constant_float');
    sg.clear();
    expect(sg.nodes.size).toBe(0);
    expect(sg.connections).toHaveLength(0);
  });
});
