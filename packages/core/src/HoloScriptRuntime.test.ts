/**
 * HoloScript Runtime Tests
 *
 * Comprehensive test suite for the HoloScript runtime engine.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { HoloScriptRuntime } from './HoloScriptRuntime';
import { HoloScriptCodeParser } from './HoloScriptCodeParser';
import type { OrbNode, MethodNode, ConnectionNode, GateNode, StreamNode } from './types';

describe('HoloScriptRuntime', () => {
  let runtime: HoloScriptRuntime;
  let parser: HoloScriptCodeParser;

  beforeEach(() => {
    runtime = new HoloScriptRuntime();
    parser = new HoloScriptCodeParser();
  });

  describe('Basic Execution', () => {
    it('should create an orb', async () => {
      const orbNode: OrbNode = {
        type: 'orb',
        name: 'testOrb',
        properties: { message: 'Hello World' },
        methods: [],
        position: { x: 1, y: 2, z: 3 },
        hologram: { shape: 'orb', color: '#00ffff', size: 1, glow: true, interactive: true },
      };

      const result = await runtime.executeNode(orbNode);

      expect(result.success).toBe(true);
      expect(result.output).toBeDefined();
      expect(result.spatialPosition).toEqual({ x: 1, y: 2, z: 3 });
    });

    it('should define a function', async () => {
      const funcNode: MethodNode = {
        type: 'method',
        name: 'testFunc',
        parameters: [{ type: 'parameter', name: 'x', dataType: 'number' }],
        body: [],
        position: { x: 0, y: 0, z: 0 },
      };

      const result = await runtime.executeNode(funcNode);

      expect(result.success).toBe(true);
      expect(result.output).toContain('testFunc');
    });

    it('should create a connection', async () => {
      // First create two orbs
      const orb1: OrbNode = {
        type: 'orb',
        name: 'source',
        properties: {},
        methods: [],
        position: { x: 0, y: 0, z: 0 },
      };
      const orb2: OrbNode = {
        type: 'orb',
        name: 'target',
        properties: {},
        methods: [],
        position: { x: 5, y: 0, z: 0 },
      };

      await runtime.executeNode(orb1);
      await runtime.executeNode(orb2);

      const connNode: ConnectionNode = {
        type: 'connection',
        from: 'source',
        to: 'target',
        dataType: 'number',
        bidirectional: false,
      };

      const result = await runtime.executeNode(connNode);

      expect(result.success).toBe(true);
      expect(result.output).toContain('source');
      expect(result.output).toContain('target');
    });
  });

  describe('Expression Evaluation', () => {
    it('should evaluate number literals', () => {
      expect(runtime.evaluateExpression('42')).toBe(42);
      expect(runtime.evaluateExpression('-3.14')).toBe(-3.14);
      expect(runtime.evaluateExpression('0')).toBe(0);
    });

    it('should evaluate string literals', () => {
      expect(runtime.evaluateExpression('"hello"')).toBe('hello');
      expect(runtime.evaluateExpression("'world'")).toBe('world');
    });

    it('should evaluate boolean literals', () => {
      expect(runtime.evaluateExpression('true')).toBe(true);
      expect(runtime.evaluateExpression('false')).toBe(false);
    });

    it('should evaluate array literals', () => {
      expect(runtime.evaluateExpression('[]')).toEqual([]);
      expect(runtime.evaluateExpression('[1, 2, 3]')).toEqual([1, 2, 3]);
      expect(runtime.evaluateExpression('["a", "b"]')).toEqual(['a', 'b']);
    });

    it('should evaluate object literals', () => {
      expect(runtime.evaluateExpression('{}')).toEqual({});
      expect(runtime.evaluateExpression('{x: 1, y: 2}')).toEqual({ x: 1, y: 2 });
    });

    it('should evaluate arithmetic operations', () => {
      runtime.setVariable('a', 10);
      runtime.setVariable('b', 3);

      expect(runtime.evaluateExpression('a + b')).toBe(13);
      expect(runtime.evaluateExpression('a - b')).toBe(7);
      expect(runtime.evaluateExpression('a * b')).toBe(30);
      expect(runtime.evaluateExpression('a / b')).toBeCloseTo(3.33, 1);
    });
  });

  describe('Built-in Functions', () => {
    it('should execute math functions', async () => {
      const result1 = await runtime.callFunction('add', [5, 3]);
      expect(result1.success).toBe(true);
      expect(result1.output).toBe(8);

      const result2 = await runtime.callFunction('multiply', [4, 7]);
      expect(result2.success).toBe(true);
      expect(result2.output).toBe(28);

      const result3 = await runtime.callFunction('abs', [-42]);
      expect(result3.success).toBe(true);
      expect(result3.output).toBe(42);
    });

    it('should execute string functions', async () => {
      const result1 = await runtime.callFunction('concat', ['Hello', ' ', 'World']);
      expect(result1.success).toBe(true);
      expect(result1.output).toBe('Hello World');

      const result2 = await runtime.callFunction('uppercase', ['test']);
      expect(result2.success).toBe(true);
      expect(result2.output).toBe('TEST');

      const result3 = await runtime.callFunction('length', ['hello']);
      expect(result3.success).toBe(true);
      expect(result3.output).toBe(5);
    });

    it('should execute array functions', async () => {
      const arr = [1, 2, 3];

      const result1 = await runtime.callFunction('push', [arr, 4]);
      expect(result1.success).toBe(true);
      expect(result1.output).toEqual([1, 2, 3, 4]);

      const result2 = await runtime.callFunction('length', [[1, 2, 3, 4, 5]]);
      expect(result2.success).toBe(true);
      expect(result2.output).toBe(5);
    });

    it('should execute type checking functions', async () => {
      expect((await runtime.callFunction('isNumber', [42])).output).toBe(true);
      expect((await runtime.callFunction('isNumber', ['hello'])).output).toBe(false);
      expect((await runtime.callFunction('isString', ['hello'])).output).toBe(true);
      expect((await runtime.callFunction('isArray', [[1, 2, 3]])).output).toBe(true);
    });
  });

  describe('Variable Scoping', () => {
    it('should set and get variables', () => {
      runtime.setVariable('x', 100);
      expect(runtime.getVariable('x')).toBe(100);

      runtime.setVariable('y', 'hello');
      expect(runtime.getVariable('y')).toBe('hello');
    });

    it('should handle nested property access', () => {
      runtime.setVariable('obj', { nested: { value: 42 } });
      expect(runtime.getVariable('obj.nested.value')).toBe(42);
    });

    it('should set nested properties', () => {
      runtime.setVariable('data.x', 10);
      runtime.setVariable('data.y', 20);
      expect(runtime.getVariable('data')).toEqual({ x: 10, y: 20 });
    });
  });

  describe('Gate Execution', () => {
    it('should execute true path when condition is true', async () => {
      runtime.setVariable('value', 10);

      const gateNode: GateNode = {
        type: 'gate',
        condition: 'value > 5',
        truePath: [],
        falsePath: [],
        position: { x: 0, y: 0, z: 0 },
      };

      const result = await runtime.executeNode(gateNode);

      expect(result.success).toBe(true);
      expect(result.output).toContain('true');
    });

    it('should execute false path when condition is false', async () => {
      runtime.setVariable('value', 3);

      const gateNode: GateNode = {
        type: 'gate',
        condition: 'value > 5',
        truePath: [],
        falsePath: [],
        position: { x: 0, y: 0, z: 0 },
      };

      const result = await runtime.executeNode(gateNode);

      expect(result.success).toBe(true);
      expect(result.output).toContain('false');
    });

    it('should handle boolean literals in conditions', async () => {
      const trueGate: GateNode = {
        type: 'gate',
        condition: 'true',
        truePath: [],
        falsePath: [],
      };

      const falseGate: GateNode = {
        type: 'gate',
        condition: 'false',
        truePath: [],
        falsePath: [],
      };

      const result1 = await runtime.executeNode(trueGate);
      expect(result1.output).toContain('true');

      const result2 = await runtime.executeNode(falseGate);
      expect(result2.output).toContain('false');
    });

    it('should handle comparison operators', async () => {
      runtime.setVariable('a', 5);
      runtime.setVariable('b', 5);

      const tests = [
        { condition: 'a == b', expected: true },
        { condition: 'a != b', expected: false },
        { condition: 'a >= b', expected: true },
        { condition: 'a <= b', expected: true },
        { condition: 'a > b', expected: false },
        { condition: 'a < b', expected: false },
      ];

      for (const { condition, expected } of tests) {
        const gate: GateNode = { type: 'gate', condition, truePath: [], falsePath: [] };
        const result = await runtime.executeNode(gate);
        expect(result.output).toContain(expected ? 'true' : 'false');
      }
    });
  });

  describe('Stream Execution', () => {
    it('should process stream with transformations', async () => {
      runtime.setVariable('numbers', [1, 2, 3, 4, 5]);

      const streamNode: StreamNode = {
        type: 'stream',
        name: 'testStream',
        source: 'numbers',
        transformations: [{ type: 'transformation', operation: 'sum', parameters: {} }],
        position: { x: 0, y: 0, z: 0 },
      };

      const result = await runtime.executeNode(streamNode);

      expect(result.success).toBe(true);
      expect(runtime.getVariable('testStream_result')).toBe(15);
    });

    it('should handle multiple transformations', async () => {
      runtime.setVariable('data', [5, 3, 8, 1, 9]);

      const streamNode: StreamNode = {
        type: 'stream',
        name: 'multiStream',
        source: 'data',
        transformations: [
          { type: 'transformation', operation: 'sort', parameters: {} },
          { type: 'transformation', operation: 'take', parameters: { count: 3 } },
        ],
        position: { x: 0, y: 0, z: 0 },
      };

      const result = await runtime.executeNode(streamNode);

      expect(result.success).toBe(true);
      expect(runtime.getVariable('multiStream_result')).toEqual([1, 3, 5]);
    });
  });

  describe('Event System', () => {
    it('should register and emit events', async () => {
      let eventFired = false;
      let eventData: unknown = null;

      runtime.on('test.event', (data) => {
        eventFired = true;
        eventData = data;
      });

      await runtime.emit('test.event', { value: 42 });

      expect(eventFired).toBe(true);
      expect(eventData).toEqual({ value: 42 });
    });

    it('should remove event handlers', async () => {
      let count = 0;
      const handler = () => {
        count++;
      };

      runtime.on('counter', handler);
      await runtime.emit('counter');
      expect(count).toBe(1);

      runtime.off('counter', handler);
      await runtime.emit('counter');
      expect(count).toBe(1); // Should not increment
    });
  });

  describe('Code Parser Integration', () => {
    it('should parse and execute orb declaration', async () => {
      const code = `
        orb greeting {
          message: "Hello"
          color: "#ff0000"
        }
      `;

      const parseResult = parser.parse(code);
      expect(parseResult.success).toBe(true);
      expect(parseResult.ast.length).toBe(1);

      const results = await runtime.executeProgram(parseResult.ast);
      expect(results[0].success).toBe(true);
    });

    it('should parse and execute function declaration', async () => {
      const code = `
        function greet(name: string): string {
          return name
        }
      `;

      const parseResult = parser.parse(code);
      expect(parseResult.success).toBe(true);

      const results = await runtime.executeProgram(parseResult.ast);
      expect(results[0].success).toBe(true);

      const context = runtime.getContext();
      expect(context.functions.has('greet')).toBe(true);
    });

    it('should parse and execute connection', async () => {
      const code = `
        orb source { value: 10 }
        orb target { value: 0 }
        connect source to target as "number"
      `;

      const parseResult = parser.parse(code);
      expect(parseResult.success).toBe(true);
      expect(parseResult.ast.length).toBe(3);

      const results = await runtime.executeProgram(parseResult.ast);
      expect(results.every((r) => r.success)).toBe(true);

      const context = runtime.getContext();
      expect(context.connections.length).toBe(1);
    });
  });

  describe('Security', () => {
    it('should block suspicious keywords in expressions', () => {
      expect(runtime.evaluateExpression('eval("1+1")')).toBeUndefined();
      expect(runtime.evaluateExpression('process.exit()')).toBeUndefined();
      expect(runtime.evaluateExpression('require("fs")')).toBeUndefined();
    });

    it('should respect execution limits', async () => {
      // Create a very deep recursion scenario
      const nodes = Array(2000)
        .fill(null)
        .map(
          (_, i) =>
            ({
              type: 'orb',
              name: `orb${i}`,
              properties: {},
              methods: [],
            }) as OrbNode
        );

      const results = await runtime.executeProgram(nodes);

      // Should have stopped before completing all
      const lastResult = results[results.length - 1];
      expect(lastResult.error).toContain('Max total nodes exceeded');
    });
  });

  describe('Reset', () => {
    it('should clear all state on reset', async () => {
      // Set up some state
      runtime.setVariable('x', 100);
      await runtime.executeNode({
        type: 'orb',
        name: 'testOrb',
        properties: {},
        methods: [],
      } as OrbNode);

      runtime.on('test', () => {});

      // Reset
      runtime.reset();

      // Verify state is cleared
      expect(runtime.getVariable('x')).toBeUndefined();
      expect(runtime.getContext().variables.size).toBe(0);
      expect(runtime.getContext().functions.size).toBe(0);
      expect(runtime.getExecutionHistory()).toHaveLength(0);
    });
  });
});
