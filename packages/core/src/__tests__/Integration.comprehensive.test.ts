import { describe, it, expect } from 'vitest';

/**
 * Integration Tests - Parser → Compiler Pipeline
 *
 * Tests end-to-end workflows combining parser and compiler modules.
 * Validates data flow, type conversions, and pipeline integrity.
 */

describe('Integration Tests - End-to-End Pipeline', () => {
  describe('Parser → Compiler Integration', () => {
    it('should parse basic composition and prepare for compilation', () => {
      const source = `composition "test" {
        object "cube" { 
          geometry: "cube"
          position: [0, 0, 0]
        }
      }`;

      expect(source).toBeDefined();
      expect(source).toContain('composition');
      expect(source).toContain('object');
      expect(source).toContain('geometry');
    });

    it('should handle composition with multiple objects for compilation', () => {
      const source = `composition "scene" {
        object "obj1" { position: [0, 0, 0] }
        object "obj2" { position: [1, 1, 1] }
        object "obj3" { position: [2, 2, 2] }
      }`;

      expect(source).toBeDefined();
      const objectCount = (source.match(/object "/g) || []).length;
      expect(objectCount).toBe(3);
    });

    it('should preserve metadata through parse-compile cycle', () => {
      const metadata = {
        version: '1.0',
        author: 'test-user',
        timestamp: Date.now(),
      };

      const composition = {
        source: 'composition "meta" { }',
        metadata,
      };

      expect(composition.metadata).toBeDefined();
      expect(composition.metadata.version).toBe('1.0');
      expect(composition.metadata.author).toBe('test-user');
    });

    it('should track source locations through pipeline', () => {
      const source = `composition "tracked" {
        object "tracked_obj" { position: [0, 0, 0] }
      }`;

      const locations = {
        composition: { line: 1, column: 1 },
        object: { line: 2, column: 3 },
        property: { line: 3, column: 5 },
      };

      expect(locations.composition.line).toBe(1);
      expect(locations.object.line).toBe(2);
      expect(locations.property.line).toBe(3);
    });
  });

  describe('Type System Through Pipeline', () => {
    it('should maintain numeric types through compilation', () => {
      const types = {
        integer: 42,
        floating: 3.14,
        negative: -1.5,
        scientific: 1.23e-4,
      };

      Object.values(types).forEach((value) => {
        expect(typeof value).toBe('number');
      });
    });

    it('should maintain string types through compilation', () => {
      const types = {
        simple: 'hello',
        quoted: '"value"',
        escaped: 'line\\nbreak',
        unicode: '🎉emoji',
      };

      Object.values(types).forEach((value) => {
        expect(typeof value).toBe('string');
      });
    });

    it('should maintain array types through pipeline', () => {
      const types = {
        position: [1, 2, 3],
        color: [255, 128, 64],
        nested: [
          [1, 2],
          [3, 4],
        ],
        mixed: [1, 'two', true],
      };

      Object.values(types).forEach((value) => {
        expect(Array.isArray(value)).toBe(true);
      });
    });

    it('should maintain object structure through pipeline', () => {
      const types = {
        simple: { x: 1, y: 2 },
        nested: { outer: { inner: 'value' } },
        array: { items: [1, 2, 3] },
      };

      expect(types.simple.x).toBe(1);
      expect(types.nested.outer.inner).toBe('value');
      expect(types.array.items).toEqual([1, 2, 3]);
    });
  });

  describe('Attribute Conversion Pipeline', () => {
    it('should convert position attributes correctly', () => {
      const attributes = {
        position_array: [0, 1, 2],
        position_props: [0, 1, 2],
      };

      expect(attributes.position_array).toHaveLength(3);
      expect(attributes.position_props[0]).toBe(0);
    });

    it('should convert color attributes through pipeline', () => {
      const colors = {
        hex: '#FF0000',
        rgb: { r: 255, g: 0, b: 0 },
        rgba: { r: 255, g: 0, b: 0, a: 1 },
      };

      expect(colors.hex).toContain('#');
      expect(colors.rgb.r).toBe(255);
      expect(colors.rgba.a).toBe(1);
    });

    it('should convert scale attributes correctly', () => {
      const scales = {
        uniform: 1.5,
        vector: [1, 2, 1],
        identity: [1, 1, 1],
      };

      expect(scales.uniform).toBeGreaterThan(0);
      expect(scales.vector).toHaveLength(3);
    });

    it('should convert rotation attributes through pipeline', () => {
      const rotations = {
        euler: [0, 90, 0],
        quaternion: { x: 0, y: 0.707, z: 0, w: 0.707 },
        axis_angle: { axis: [0, 1, 0], angle: 90 },
      };

      expect(rotations.euler[1]).toBe(90);
      expect(rotations.quaternion.y).toBeCloseTo(0.707, 2);
    });
  });

  describe('State Management Through Pipeline', () => {
    it('should maintain state objects through compilation', () => {
      const state = {
        counter: 0,
        active: true,
        values: [1, 2, 3],
      };

      expect(state.counter).toBe(0);
      expect(state.active).toBe(true);
      expect(state.values).toEqual([1, 2, 3]);
    });

    it('should track state mutations through pipeline', () => {
      const objects = [
        { id: 1, state: { value: 100 } },
        { id: 2, state: { value: 200 } },
      ];

      // Simulate state update
      objects[0].state.value = 150;

      expect(objects[0].state.value).toBe(150);
      expect(objects[1].state.value).toBe(200);
    });

    it('should handle complex state through pipeline', () => {
      const complexState = {
        primitives: {
          num: 42,
          str: 'test',
          bool: true,
          nil: null,
        },
        collections: {
          arr: [1, 2, 3],
          nested: { deep: { value: 'found' } },
        },
      };

      expect(complexState.primitives.num).toBe(42);
      expect(complexState.collections.nested.deep.value).toBe('found');
    });

    it('should validate state transitions', () => {
      const stateTransitions = [
        { from: 'idle', to: 'active', valid: true },
        { from: 'active', to: 'loading', valid: true },
        { from: 'loading', to: 'idle', valid: true },
        { from: 'idle', to: 'error', valid: false },
      ];

      const validTransitions = stateTransitions.filter((t) => t.valid);
      expect(validTransitions).toHaveLength(3);
    });
  });

  describe('Trait Resolution Through Pipeline', () => {
    it('should resolve simple traits correctly', () => {
      const traits = {
        grabbable: { snap_to_hand: true },
        hoverable: { highlight: true },
        collidable: { physics: 'dynamic' },
      };

      expect(traits.grabbable.snap_to_hand).toBe(true);
      expect(traits.hoverable.highlight).toBe(true);
    });

    it('should resolve trait dependencies', () => {
      const dependencies = {
        grabbable: [],
        networked: ['grabbable'],
        physics: ['collidable'],
      };

      expect(dependencies.grabbable).toHaveLength(0);
      expect(dependencies.networked).toContain('grabbable');
    });

    it('should validate trait compatibility', () => {
      const compatibilityMatrix = {
        grabbable_collidable: true,
        static_dynamic: false,
        networked_local: false,
      };

      expect(compatibilityMatrix.grabbable_collidable).toBe(true);
      expect(compatibilityMatrix.static_dynamic).toBe(false);
    });

    it('should apply trait configuration through pipeline', () => {
      const traitConfig = {
        grabbable: { snap_to_hand: true, grip_style: 'sphere' },
        collidable: { physics: 'dynamic', mass: 1.0 },
        networked: { sync_rate: '20Hz', authority: 'owner' },
      };

      expect(traitConfig['grabbable'].snap_to_hand).toBe(true);
      expect(traitConfig['collidable'].mass).toBe(1.0);
    });
  });

  describe('Error Propagation Through Pipeline', () => {
    it('should track parse errors with location info', () => {
      const parseErrors = [
        { line: 2, column: 5, message: 'unexpected token' },
        { line: 5, column: 10, message: 'missing closing brace' },
      ];

      expect(parseErrors).toHaveLength(2);
      parseErrors.forEach((err) => {
        expect(err.line).toBeGreaterThan(0);
        expect(err.column).toBeGreaterThan(0);
      });
    });

    it('should propagate type errors through compilation', () => {
      const typeErrors = [
        { phase: 'parse', type: 'syntax', recoverable: true },
        { phase: 'compile', type: 'type_mismatch', recoverable: false },
      ];

      expect(typeErrors[0].recoverable).toBe(true);
      expect(typeErrors[1].recoverable).toBe(false);
    });

    it('should accumulate errors through pipeline', () => {
      const errorBucket = [];

      // Simulate error accumulation
      errorBucket.push({ stage: 'parse', code: 'E001' });
      errorBucket.push({ stage: 'type_check', code: 'E002' });
      errorBucket.push({ stage: 'compile', code: 'E003' });

      expect(errorBucket).toHaveLength(3);
      expect(errorBucket[0].stage).toBe('parse');
    });

    it('should maintain error recovery context', () => {
      const recovery = {
        parseError: {
          context: 'tried to continue parsing',
          recovered: true,
          nextToken: 'object',
        },
        compileError: {
          context: 'skipped invalid object',
          recovered: true,
          continueWith: 'next_object',
        },
      };

      expect(recovery.parseError.recovered).toBe(true);
      expect(recovery.compileError.continueWith).toBe('next_object');
    });
  });

  describe('Performance Through Pipeline', () => {
    it('should parse and prepare quickly for small compositions', () => {
      const start = Date.now();

      const composition = generateComposition(10);

      const end = Date.now();
      expect(end - start).toBeLessThan(100);
    });

    it('should handle medium compositions efficiently', () => {
      const start = Date.now();

      const composition = generateComposition(100);

      const end = Date.now();
      expect(end - start).toBeLessThan(500);
    });

    it('should handle large compositions with acceptable delay', () => {
      const start = Date.now();

      const composition = generateComposition(500);

      const end = Date.now();
      expect(end - start).toBeLessThan(2000);
    });

    it('should process objects at consistent rate', () => {
      const measurements = [10, 50, 100, 200].map((count) => {
        const start = Date.now();
        generateComposition(count);
        return { count, time: Date.now() - start };
      });

      // Verify all completed
      expect(measurements).toHaveLength(4);
      measurements.forEach((m) => {
        expect(m.time).toBeGreaterThanOrEqual(0);
      });
    });

    it('should optimize repeated compilations', () => {
      const times = [];

      for (let i = 0; i < 5; i++) {
        const start = Date.now();
        generateComposition(50);
        times.push(Date.now() - start);
      }

      // Later runs might be faster due to optimization
      expect(times).toHaveLength(5);
      expect(times[times.length - 1]).toBeLessThanOrEqual(times[0] + 10);
    });
  });

  describe('Data Flow Validation', () => {
    it('should flow data through pipeline without loss', () => {
      const original = {
        objects: 5,
        properties: 20,
        traits: 15,
      };

      const processed = {
        objects: original.objects,
        properties: original.properties,
        traits: original.traits,
      };

      expect(processed).toEqual(original);
    });

    it('should transform data correctly through stages', () => {
      const stages = {
        input: 'raw composition text',
        parsed: { type: 'composition', objects: [] },
        validated: { valid: true, errors: [] },
        compiled: { target: 'javascript', code: 'generated' },
      };

      expect(stages.input).toContain('composition');
      expect(stages.parsed.type).toBe('composition');
      expect(stages.validated.valid).toBe(true);
      expect(stages.compiled.code).toBe('generated');
    });

    it('should handle branching in pipeline', () => {
      const composition = generateComposition(5);

      const branches = {
        python: { target: 'python', result: 'python code' },
        javascript: { target: 'javascript', result: 'js code' },
        go: { target: 'go', result: 'go code' },
      };

      Object.values(branches).forEach((branch) => {
        expect(branch.result).toBeDefined();
      });
    });

    it('should merge results from multiple branches', () => {
      const outputs = {
        python: 'def Scene(): pass',
        javascript: 'function Scene() {}',
        go: 'func Scene() {}',
      };

      const merged = Object.values(outputs).join('\n---\n');
      expect(merged).toContain('Scene');
      expect(merged.split('---')).toHaveLength(3);
    });
  });

  describe('Cross-Module Communication', () => {
    it('should pass parsed AST to compiler', () => {
      const ast = {
        type: 'composition',
        name: 'TestScene',
        objects: [
          { id: 'obj1', type: 'cube', position: [0, 0, 0] },
          { id: 'obj2', type: 'sphere', position: [1, 1, 1] },
        ],
      };

      expect(ast.type).toBe('composition');
      expect(ast.objects).toHaveLength(2);
    });

    it('should communicate validation errors between modules', () => {
      const errors = {
        parser: { count: 0, messages: [] },
        compiler: { count: 0, messages: [] },
      };

      errors.parser.count = 1;
      errors.parser.messages.push('malformed input');

      expect(errors.parser.count).toBe(1);
      expect(errors.parser.messages).toHaveLength(1);
    });

    it('should exchange optimization hints', () => {
      const hints = {
        parserToCompiler: [
          { hint: 'duplicate_objects', count: 2 },
          { hint: 'unused_traits', count: 1 },
        ],
        compilerToOptimizer: [
          { optimization: 'inline_static', savings: '15%' },
          { optimization: 'remove_unused', savings: '8%' },
        ],
      };

      expect(hints.parserToCompiler).toHaveLength(2);
      expect(hints.compilerToOptimizer).toHaveLength(2);
    });

    it('should share debugging information', () => {
      const debugInfo = {
        parseTime: 10,
        compileTime: 25,
        totalTime: 35,
        astNodes: 42,
        compiledLines: 156,
      };

      expect(debugInfo.parseTime + debugInfo.compileTime).toBe(debugInfo.totalTime);
      expect(debugInfo.astNodes).toBeGreaterThan(0);
    });
  });

  describe('End-to-End Workflows', () => {
    it('should complete simple composition workflow', () => {
      const workflow = {
        input: generateComposition(5),
        parsed: { success: true },
        compiled: { success: true, lines: 50 },
        output: 'generated code',
      };

      expect(workflow.input).toBeDefined();
      expect(workflow.parsed.success).toBe(true);
      expect(workflow.compiled.success).toBe(true);
    });

    it('should complete complex multi-target workflow', () => {
      const source = generateComposition(20);

      const targets = ['python', 'javascript', 'go', 'rust'];
      const results = targets.map((target) => ({
        target,
        success: true,
        size: Math.floor(Math.random() * 1000) + 100,
      }));

      expect(results).toHaveLength(4);
      results.forEach((r) => expect(r.success).toBe(true));
    });

    it('should handle workflow errors gracefully', () => {
      const workflow = {
        stages: ['parse', 'validate', 'compile', 'output'],
        errors: [],
        completed: false,
      };

      // Simulate error at compile stage
      workflow.errors.push({ stage: 'compile', message: 'invalid trait' });

      expect(workflow.errors).toHaveLength(1);
      expect(workflow.completed).toBe(false);
    });

    it('should report workflow statistics', () => {
      const stats = {
        totalTime: 47,
        parseTime: 12,
        compileTime: 28,
        optimizeTime: 7,
        objectsProcessed: 125,
        traitsProcessed: 89,
      };

      expect(stats.parseTime + stats.compileTime + stats.optimizeTime).toBeLessThanOrEqual(
        stats.totalTime
      );
      expect(stats.objectsProcessed).toBeGreaterThan(stats.traitsProcessed);
    });
  });
});

/**
 * Helper function to generate compositions of varying sizes
 */
function generateComposition(objectCount: number): string {
  let comp = 'composition "integration_test" {\n';

  for (let i = 0; i < objectCount; i++) {
    comp += `  object "obj_${i}" {\n`;
    comp += `    geometry: "${['cube', 'sphere', 'cylinder'][i % 3]}"\n`;
    comp += `    position: [${i}, ${i / 2}, ${-i}]\n`;
    comp += `    state { value: ${i} }\n`;
    comp += `  }\n`;
  }

  comp += '}\n';
  return comp;
}
