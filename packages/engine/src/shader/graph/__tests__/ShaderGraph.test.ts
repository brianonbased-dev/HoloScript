/**
 * Shader Graph Tests
 *
 * Tests for the shader graph system including node creation, connections,
 * validation, and WGSL compilation
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ShaderGraph } from '../ShaderGraph';
import { ShaderGraphCompiler, compileShaderGraph } from '../ShaderGraphCompiler';
import {
  INPUT_NODES,
  MATH_NODES,
  VECTOR_NODES,
  COLOR_NODES,
  OUTPUT_NODES,
  TEXTURE_NODES,
  UTILITY_NODES,
  TRIG_NODES,
  areTypesCompatible,
  getTypeConversion,
  TYPE_SIZES,
  getNodeTemplate,
} from '../ShaderGraphTypes';

describe('ShaderGraphTypes', () => {
  describe('TYPE_SIZES', () => {
    it('should define correct sizes for scalar types', () => {
      expect(TYPE_SIZES.float).toBe(1);
      expect(TYPE_SIZES.int).toBe(1);
      expect(TYPE_SIZES.bool).toBe(1);
    });

    it('should define correct sizes for vector types', () => {
      expect(TYPE_SIZES.vec2).toBe(2);
      expect(TYPE_SIZES.vec3).toBe(3);
      expect(TYPE_SIZES.vec4).toBe(4);
      expect(TYPE_SIZES.ivec2).toBe(2);
      expect(TYPE_SIZES.ivec3).toBe(3);
      expect(TYPE_SIZES.ivec4).toBe(4);
    });

    it('should define correct sizes for matrix types', () => {
      expect(TYPE_SIZES.mat2).toBe(4);
      expect(TYPE_SIZES.mat3).toBe(9);
      expect(TYPE_SIZES.mat4).toBe(16);
    });
  });

  describe('areTypesCompatible', () => {
    it('should return true for identical types', () => {
      expect(areTypesCompatible('float', 'float')).toBe(true);
      expect(areTypesCompatible('vec3', 'vec3')).toBe(true);
      expect(areTypesCompatible('mat4', 'mat4')).toBe(true);
    });

    it('should allow float to vec promotions', () => {
      expect(areTypesCompatible('float', 'vec2')).toBe(true);
      expect(areTypesCompatible('float', 'vec3')).toBe(true);
      expect(areTypesCompatible('float', 'vec4')).toBe(true);
    });

    it('should allow int to float conversion', () => {
      expect(areTypesCompatible('int', 'float')).toBe(true);
    });

    it('should reject incompatible types', () => {
      expect(areTypesCompatible('sampler2D', 'float')).toBe(false);
      expect(areTypesCompatible('mat4', 'vec4')).toBe(false);
    });
  });

  describe('getTypeConversion', () => {
    it('should return identity for same types', () => {
      expect(getTypeConversion('float', 'float', 'x')).toBe('x');
      expect(getTypeConversion('vec3', 'vec3', 'x')).toBe('x');
    });

    it('should splat float to vec3', () => {
      const result = getTypeConversion('float', 'vec3', 'x');
      expect(result).toBe('vec3<f32>(x)');
    });

    it('should convert int to float', () => {
      const result = getTypeConversion('int', 'float', 'x');
      expect(result).toBe('f32(x)');
    });

    it('should extend vec3 to vec4', () => {
      const result = getTypeConversion('vec3', 'vec4', 'x');
      expect(result).toContain('vec4');
    });
  });

  describe('getNodeTemplate', () => {
    it('should find input nodes', () => {
      expect(getNodeTemplate('input_position')).toBeDefined();
      expect(getNodeTemplate('input_normal')).toBeDefined();
      expect(getNodeTemplate('input_uv')).toBeDefined();
      expect(getNodeTemplate('input_time')).toBeDefined();
    });

    it('should find math nodes', () => {
      expect(getNodeTemplate('math_add')).toBeDefined();
      expect(getNodeTemplate('math_subtract')).toBeDefined();
      expect(getNodeTemplate('math_multiply')).toBeDefined();
      expect(getNodeTemplate('math_divide')).toBeDefined();
    });

    it('should find trig nodes', () => {
      expect(getNodeTemplate('trig_sin')).toBeDefined();
      expect(getNodeTemplate('trig_cos')).toBeDefined();
    });

    it('should find vector nodes', () => {
      expect(getNodeTemplate('vector_make_vec3')).toBeDefined();
      expect(getNodeTemplate('vector_normalize')).toBeDefined();
      expect(getNodeTemplate('vector_dot')).toBeDefined();
    });

    it('should find constant nodes', () => {
      expect(getNodeTemplate('constant_float')).toBeDefined();
      expect(getNodeTemplate('constant_color')).toBeDefined();
      expect(getNodeTemplate('constant_vec3')).toBeDefined();
    });

    it('should find output nodes', () => {
      expect(getNodeTemplate('output_surface')).toBeDefined();
      expect(getNodeTemplate('output_unlit')).toBeDefined();
    });

    it('should return undefined for unknown nodes', () => {
      expect(getNodeTemplate('unknown_node')).toBeUndefined();
    });
  });

  describe('Node Templates', () => {
    it('should have correct number of input nodes', () => {
      expect(INPUT_NODES.length).toBeGreaterThanOrEqual(10);
    });

    it('should have correct number of math nodes', () => {
      expect(MATH_NODES.length).toBeGreaterThanOrEqual(10);
    });

    it('should have correct number of trig nodes', () => {
      expect(TRIG_NODES.length).toBeGreaterThanOrEqual(5);
    });

    it('should have correct number of vector nodes', () => {
      expect(VECTOR_NODES.length).toBeGreaterThanOrEqual(10);
    });

    it('should have correct number of color nodes', () => {
      expect(COLOR_NODES.length).toBeGreaterThanOrEqual(5);
    });

    it('should have correct number of output nodes', () => {
      expect(OUTPUT_NODES.length).toBeGreaterThanOrEqual(2);
    });

    it('should have generateCode functions', () => {
      for (const template of INPUT_NODES) {
        expect(typeof template.generateCode).toBe('function');
      }
      for (const template of MATH_NODES) {
        expect(typeof template.generateCode).toBe('function');
      }
      for (const template of TRIG_NODES) {
        expect(typeof template.generateCode).toBe('function');
      }
    });
  });
});

describe('ShaderGraph', () => {
  let graph: ShaderGraph;

  beforeEach(() => {
    graph = new ShaderGraph('TestGraph');
  });

  describe('constructor', () => {
    it('should create graph with name', () => {
      expect(graph.name).toBe('TestGraph');
    });

    it('should have unique id', () => {
      const graph2 = new ShaderGraph('TestGraph2');
      expect(graph.id).not.toBe(graph2.id);
    });

    it('should start with empty nodes and connections', () => {
      expect(graph.nodes.size).toBe(0);
      expect(graph.connections).toHaveLength(0);
    });
  });

  describe('createNode', () => {
    it('should create node from template', () => {
      const node = graph.createNode('input_position');
      expect(node).toBeDefined();
      expect(node!.type).toBe('input_position');
      expect(node!.name).toBe('World Position');
    });

    it('should create node at specified position', () => {
      const node = graph.createNode('input_normal', { x: 100, y: 200 });
      expect(node!.position).toEqual({ x: 100, y: 200 });
    });

    it('should add node to graph', () => {
      graph.createNode('input_position');
      expect(graph.nodes.size).toBe(1);
    });

    it('should return null for unknown node type', () => {
      const node = graph.createNode('unknown_type');
      expect(node).toBeNull();
    });

    it('should create unique node IDs', () => {
      const node1 = graph.createNode('input_position');
      const node2 = graph.createNode('input_normal');
      expect(node1!.id).not.toBe(node2!.id);
    });
  });

  describe('getNode', () => {
    it('should get node by id', () => {
      const node = graph.createNode('input_position');
      expect(graph.getNode(node!.id)).toBe(node);
    });

    it('should return undefined for unknown id', () => {
      expect(graph.getNode('unknown')).toBeUndefined();
    });
  });

  describe('removeNode', () => {
    it('should remove node from graph', () => {
      const node = graph.createNode('input_position');
      expect(graph.removeNode(node!.id)).toBe(true);
      expect(graph.nodes.size).toBe(0);
    });

    it('should remove connections to/from node', () => {
      const input = graph.createNode('input_position');
      const output = graph.createNode('output_surface');
      graph.connect(input!.id, 'position', output!.id, 'normal');

      graph.removeNode(input!.id);
      expect(graph.connections).toHaveLength(0);
    });
  });

  describe('connect', () => {
    it('should create connection between nodes', () => {
      const input = graph.createNode('input_position');
      const output = graph.createNode('output_surface');

      const conn = graph.connect(input!.id, 'position', output!.id, 'normal');
      expect(conn).toBeDefined();
      expect(graph.connections).toHaveLength(1);
    });

    it('should return null for connection to non-existent node', () => {
      const input = graph.createNode('input_position');
      const conn = graph.connect(input!.id, 'position', 'unknown', 'normal');
      expect(conn).toBeNull();
    });

    it('should return null for connection to non-existent port', () => {
      const input = graph.createNode('input_position');
      const output = graph.createNode('output_surface');
      const conn = graph.connect(input!.id, 'unknown', output!.id, 'normal');
      expect(conn).toBeNull();
    });

    it('should return null for incompatible types', () => {
      // vec3 cannot convert to float (the reverse is allowed via splatting)
      const normal = graph.createNode('input_normal');
      const output = graph.createNode('output_surface');
      // normal outputs vec3, metallic expects float - this should fail
      const conn = graph.connect(normal!.id, 'normal', output!.id, 'metallic');
      expect(conn).toBeNull();
    });

    it('should return null for connections that create cycles', () => {
      const add1 = graph.createNode('math_add');
      const add2 = graph.createNode('math_add');

      graph.connect(add1!.id, 'result', add2!.id, 'a');
      const cycleConn = graph.connect(add2!.id, 'result', add1!.id, 'a');
      expect(cycleConn).toBeNull();
    });

    it('should replace existing connection to input port', () => {
      const pos = graph.createNode('input_position');
      const norm = graph.createNode('input_normal');
      const output = graph.createNode('output_surface');

      graph.connect(pos!.id, 'position', output!.id, 'normal');
      graph.connect(norm!.id, 'normal', output!.id, 'normal');

      expect(graph.connections).toHaveLength(1);
      expect(graph.connections[0].fromNode).toBe(norm!.id);
    });
  });

  describe('disconnectPort', () => {
    it('should remove connections from port', () => {
      const input = graph.createNode('input_position');
      const output = graph.createNode('output_surface');
      graph.connect(input!.id, 'position', output!.id, 'normal');

      expect(graph.disconnectPort(output!.id, 'normal')).toBe(true);
      expect(graph.connections).toHaveLength(0);
    });

    it('should return false if no connections', () => {
      const output = graph.createNode('output_surface');
      expect(graph.disconnectPort(output!.id, 'normal')).toBe(false);
    });
  });

  describe('getTopologicalOrder', () => {
    it('should return all nodes', () => {
      graph.createNode('input_position');
      graph.createNode('output_surface');

      const order = graph.getTopologicalOrder();
      expect(order.length).toBe(2);
    });
  });

  describe('validate', () => {
    it('should pass for graph with output node', () => {
      const color = graph.createNode('constant_color');
      const output = graph.createNode('output_surface');
      graph.connect(color!.id, 'color', output!.id, 'baseColor');

      const result = graph.validate();
      expect(result.valid).toBe(true);
    });

    it('should fail for graph without output node', () => {
      graph.createNode('input_position');

      const result = graph.validate();
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('output'))).toBe(true);
    });
  });

  describe('duplicateNode', () => {
    it('should create copy of node', () => {
      const original = graph.createNode('input_position', { x: 100, y: 100 });
      const copy = graph.duplicateNode(original!.id);

      expect(copy).toBeDefined();
      expect(copy!.id).not.toBe(original!.id);
      expect(copy!.type).toBe(original!.type);
    });
  });

  describe('serialization', () => {
    it('should serialize to object', () => {
      graph.createNode('input_position');
      const json = graph.toJSON();

      expect(json).toBeDefined();
      expect(typeof json).toBe('object');
    });

    it('should deserialize from JSON', () => {
      const input = graph.createNode('input_position');
      const output = graph.createNode('output_surface');
      graph.connect(input!.id, 'position', output!.id, 'normal');

      const json = graph.toJSON();
      const restored = ShaderGraph.fromJSON(json);

      expect(restored.name).toBe(graph.name);
      expect(restored.nodes.size).toBe(2);
      expect(restored.connections).toHaveLength(1);
    });
  });
});

describe('ShaderGraphCompiler', () => {
  let graph: ShaderGraph;

  beforeEach(() => {
    graph = new ShaderGraph('TestShader');
  });

  describe('compile', () => {
    it('should compile simple graph', () => {
      const color = graph.createNode('constant_color');
      const output = graph.createNode('output_surface');
      graph.connect(color!.id, 'color', output!.id, 'baseColor');

      const result = compileShaderGraph(graph);
      expect(result.vertexCode).toContain('fn main');
      expect(result.fragmentCode).toContain('fn main');
    });

    it('should generate valid WGSL vertex shader', () => {
      const color = graph.createNode('constant_color');
      const output = graph.createNode('output_surface');
      graph.connect(color!.id, 'color', output!.id, 'baseColor');

      const result = compileShaderGraph(graph);

      expect(result.vertexCode).toContain('struct VertexInput');
      expect(result.vertexCode).toContain('struct VertexOutput');
      expect(result.vertexCode).toContain('@vertex');
    });

    it('should generate valid WGSL fragment shader', () => {
      const color = graph.createNode('constant_color');
      const output = graph.createNode('output_surface');
      graph.connect(color!.id, 'color', output!.id, 'baseColor');

      const result = compileShaderGraph(graph);

      expect(result.fragmentCode).toContain('struct FragmentInput');
      expect(result.fragmentCode).toContain('@fragment');
      expect(result.fragmentCode).toContain('@location(0) vec4<f32>');
    });

    it('should include PBR lighting in fragment shader', () => {
      const color = graph.createNode('constant_color');
      const output = graph.createNode('output_surface');
      graph.connect(color!.id, 'color', output!.id, 'baseColor');

      const result = compileShaderGraph(graph);

      expect(result.fragmentCode).toContain('distributionGGX');
      expect(result.fragmentCode).toContain('geometrySmith');
      expect(result.fragmentCode).toContain('fresnelSchlick');
    });

    it('should return errors for invalid graph', () => {
      const result = compileShaderGraph(graph);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should include graph name in output', () => {
      const color = graph.createNode('constant_color');
      const output = graph.createNode('output_surface');
      graph.connect(color!.id, 'color', output!.id, 'baseColor');

      const result = compileShaderGraph(graph);
      expect(result.vertexCode).toContain('TestShader');
      expect(result.fragmentCode).toContain('TestShader');
    });
  });

  describe('math nodes compilation', () => {
    it('should compile add node', () => {
      const a = graph.createNode('constant_float');
      const b = graph.createNode('constant_float');
      const add = graph.createNode('math_add');
      const output = graph.createNode('output_surface');

      graph.connect(a!.id, 'value', add!.id, 'a');
      graph.connect(b!.id, 'value', add!.id, 'b');
      graph.connect(add!.id, 'result', output!.id, 'metallic');

      const result = compileShaderGraph(graph);
      expect(result.errors).toHaveLength(0);
    });

    it('should compile multiply node', () => {
      const color = graph.createNode('constant_color');
      const scalar = graph.createNode('constant_float');
      const mul = graph.createNode('math_multiply');
      const output = graph.createNode('output_surface');

      graph.connect(color!.id, 'color', mul!.id, 'a');
      graph.connect(scalar!.id, 'value', mul!.id, 'b');
      graph.connect(mul!.id, 'result', output!.id, 'baseColor');

      const result = compileShaderGraph(graph);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('vector nodes compilation', () => {
    it('should compile normalize node', () => {
      const pos = graph.createNode('input_position');
      const norm = graph.createNode('vector_normalize');
      const output = graph.createNode('output_surface');

      graph.connect(pos!.id, 'position', norm!.id, 'vector');
      graph.connect(norm!.id, 'normalized', output!.id, 'normal');

      const result = compileShaderGraph(graph);
      expect(result.errors).toHaveLength(0);
    });

    it('should compile dot product node', () => {
      const pos = graph.createNode('input_position');
      const norm = graph.createNode('input_normal');
      const dot = graph.createNode('vector_dot');
      const output = graph.createNode('output_surface');

      graph.connect(pos!.id, 'position', dot!.id, 'a');
      graph.connect(norm!.id, 'normal', dot!.id, 'b');
      graph.connect(dot!.id, 'result', output!.id, 'metallic');

      const result = compileShaderGraph(graph);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('utility nodes compilation', () => {
    it('should compile fresnel node', () => {
      const fresnel = graph.createNode('utility_fresnel');
      const output = graph.createNode('output_surface');

      graph.connect(fresnel!.id, 'fresnel', output!.id, 'metallic');

      const result = compileShaderGraph(graph);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('debug mode', () => {
    it('should include node comments in debug mode', () => {
      const color = graph.createNode('constant_color');
      const output = graph.createNode('output_surface');
      graph.connect(color!.id, 'color', output!.id, 'baseColor');

      const result = compileShaderGraph(graph, { debug: true });
      expect(result.fragmentCode).toContain('//');
    });
  });
});

describe('Node Template Code Generation', () => {
  it('should generate valid code for input_position', () => {
    const template = getNodeTemplate('input_position');
    expect(template).toBeDefined();

    const node = { id: 'test', type: 'input_position', inputs: [], outputs: [] } as any;
    const code = template!.generateCode(node, {});
    expect(code).toBe('in.worldPosition');
  });

  it('should generate valid code for input_normal', () => {
    const template = getNodeTemplate('input_normal');
    const node = { id: 'test', type: 'input_normal', inputs: [], outputs: [] } as any;
    const code = template!.generateCode(node, {});
    expect(code).toBe('in.worldNormal');
  });

  it('should generate valid code for input_uv', () => {
    const template = getNodeTemplate('input_uv');
    const node = { id: 'test', type: 'input_uv', inputs: [], outputs: [] } as any;
    const code = template!.generateCode(node, {});
    expect(code).toBe('in.uv');
  });

  it('should generate valid code for input_time', () => {
    const template = getNodeTemplate('input_time');
    const node = { id: 'test', type: 'input_time', inputs: [], outputs: [] } as any;
    const code = template!.generateCode(node, {});
    expect(code).toBe('scene.time');
  });

  it('should generate valid code for math_add', () => {
    const template = getNodeTemplate('math_add');
    const node = { id: 'test', type: 'math_add', inputs: [], outputs: [] } as any;
    const code = template!.generateCode(node, { a: 'x', b: 'y' });
    expect(code).toContain('x');
    expect(code).toContain('y');
  });

  it('should generate valid code for trig_sin', () => {
    const template = getNodeTemplate('trig_sin');
    expect(template).toBeDefined();
    const node = { id: 'test', type: 'trig_sin', inputs: [], outputs: [] } as any;
    const code = template!.generateCode(node, { angle: 'x' });
    expect(code).toBe('sin(x)');
  });

  it('should generate valid code for vector_normalize', () => {
    const template = getNodeTemplate('vector_normalize');
    const node = { id: 'test', type: 'vector_normalize', inputs: [], outputs: [] } as any;
    const code = template!.generateCode(node, { vector: 'v' });
    expect(code).toBe('normalize(v)');
  });

  it('should generate valid code for color_blend', () => {
    const template = getNodeTemplate('color_blend');
    const node = { id: 'test', type: 'color_blend', inputs: [], outputs: [] } as any;
    const code = template!.generateCode(node, { a: 'c1', b: 'c2', factor: 'f' });
    expect(code).toBe('mix(c1, c2, f)');
  });

  it('should generate valid code for utility_remap', () => {
    const template = getNodeTemplate('utility_remap');
    const node = { id: 'test', type: 'utility_remap', inputs: [], outputs: [] } as any;
    const code = template!.generateCode(node, {
      value: 'v',
      inMin: '0.0',
      inMax: '1.0',
      outMin: '0.0',
      outMax: '10.0',
    });
    expect(code).toContain('v');
    expect(code).toContain('0.0');
    expect(code).toContain('1.0');
    expect(code).toContain('10.0');
  });
});
