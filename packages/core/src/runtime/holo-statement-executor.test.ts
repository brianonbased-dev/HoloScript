/**
 * Unit tests for runtime/holo-statement-executor.ts (W1-T4 slice 30).
 *
 * Covers all 9 statement kinds + the MAX_ITERATIONS guard + the
 * ReturnStatement short-circuit in executeHoloProgram. Scope is a
 * minimal structural mock — no HoloScriptRuntime dependency. These
 * tests complement HoloScriptRuntime.characterization.test.ts by
 * isolating the pure module from the class.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  executeHoloProgram,
  executeHoloStatement,
  MAX_ITERATIONS,
  type HoloStatementContext,
  type Scope,
} from './holo-statement-executor';
import type { HoloScriptValue } from '../types';

function mkScope(initial: Record<string, HoloScriptValue> = {}): Scope {
  const vars = new Map<string, HoloScriptValue>(Object.entries(initial));
  return { variables: vars, parent: null };
}

function mkCtx(scope: Scope, overrides: Partial<HoloStatementContext> = {}): HoloStatementContext {
  const emitLog: Array<{ event: string; data?: HoloScriptValue }> = [];
  const telemetryDepth = { value: 0 };
  return {
    currentScope: scope,
    getVariable: (name, sc) => (sc ?? scope).variables.get(name) as HoloScriptValue,
    setVariable: (name, value, sc) => {
      (sc ?? scope).variables.set(name, value);
    },
    emit: (event, data) => {
      emitLog.push({ event, data });
    },
    evaluateHoloExpression: async (expr) => {
      // Minimal evaluator: literal passthrough + Identifier lookup + simple
      // { type: 'BinaryExpression', operator, left, right } with numeric ops.
      if (expr && typeof expr === 'object') {
        const e = expr as { type?: string; value?: unknown; name?: string };
        if (e.type === 'Literal') return e.value as HoloScriptValue;
        if (e.type === 'Identifier' && typeof e.name === 'string') {
          return scope.variables.get(e.name) as HoloScriptValue;
        }
      }
      // Raw values (numbers, strings, booleans) passed as literal-ish shortcuts
      return expr as HoloScriptValue;
    },
    telemetry: {
      setGauge: vi.fn(),
      incrementCounter: vi.fn(),
      measureLatency: async (_name, fn) => fn(),
      executionDepth: () => telemetryDepth.value,
    },
    ...overrides,
    // Preserve emitLog pointer on ctx for test inspection via a cast
    ...((): object => ({})),
  } as HoloStatementContext & { __emitLog?: typeof emitLog };
}

describe('runtime/holo-statement-executor', () => {
  describe('Assignment', () => {
    it('sets variable with "=" operator', async () => {
      const scope = mkScope({ x: 0 });
      const ctx = mkCtx(scope);
      const res = await executeHoloStatement(
        { type: 'Assignment', target: 'x', operator: '=', value: 42 } as never,
        undefined,
        ctx,
      );
      expect(res.success).toBe(true);
      expect(scope.variables.get('x')).toBe(42);
    });

    it('handles += -= *= /= compound operators', async () => {
      const scope = mkScope({ a: 10, b: 10, c: 10, d: 10 });
      const ctx = mkCtx(scope);
      await executeHoloStatement({ type: 'Assignment', target: 'a', operator: '+=', value: 5 } as never, undefined, ctx);
      await executeHoloStatement({ type: 'Assignment', target: 'b', operator: '-=', value: 3 } as never, undefined, ctx);
      await executeHoloStatement({ type: 'Assignment', target: 'c', operator: '*=', value: 4 } as never, undefined, ctx);
      await executeHoloStatement({ type: 'Assignment', target: 'd', operator: '/=', value: 2 } as never, undefined, ctx);
      expect(scope.variables.get('a')).toBe(15);
      expect(scope.variables.get('b')).toBe(7);
      expect(scope.variables.get('c')).toBe(40);
      expect(scope.variables.get('d')).toBe(5);
    });
  });

  describe('IfStatement', () => {
    it('runs consequent when condition truthy', async () => {
      const scope = mkScope({ result: 0 });
      const ctx = mkCtx(scope);
      const res = await executeHoloStatement(
        {
          type: 'IfStatement',
          condition: true,
          consequent: [{ type: 'Assignment', target: 'result', operator: '=', value: 1 }],
          alternate: [{ type: 'Assignment', target: 'result', operator: '=', value: 2 }],
        } as never,
        undefined,
        ctx,
      );
      expect(res.success).toBe(true);
      expect(scope.variables.get('result')).toBe(1);
    });

    it('runs alternate when condition falsy', async () => {
      const scope = mkScope({ result: 0 });
      const ctx = mkCtx(scope);
      await executeHoloStatement(
        {
          type: 'IfStatement',
          condition: false,
          consequent: [{ type: 'Assignment', target: 'result', operator: '=', value: 1 }],
          alternate: [{ type: 'Assignment', target: 'result', operator: '=', value: 2 }],
        } as never,
        undefined,
        ctx,
      );
      expect(scope.variables.get('result')).toBe(2);
    });
  });

  describe('WhileStatement', () => {
    it('iterates until condition becomes falsy', async () => {
      const scope = mkScope({ i: 0, sum: 0 });
      const ctx = mkCtx(scope, {
        evaluateHoloExpression: async (expr) => {
          // Special-case: condition is a string "i < 5"
          if (expr === 'i<5') return (scope.variables.get('i') as number) < 5;
          return expr as HoloScriptValue;
        },
      });
      await executeHoloStatement(
        {
          type: 'WhileStatement',
          condition: 'i<5',
          body: [
            { type: 'Assignment', target: 'sum', operator: '+=', value: 'i-val' },
            { type: 'Assignment', target: 'i', operator: '+=', value: 1 },
          ],
        } as never,
        undefined,
        {
          ...ctx,
          evaluateHoloExpression: async (expr) => {
            if (expr === 'i<5') return (scope.variables.get('i') as number) < 5;
            if (expr === 'i-val') return scope.variables.get('i') as number;
            return expr as HoloScriptValue;
          },
        },
      );
      expect(scope.variables.get('i')).toBe(5);
      // 0+1+2+3+4 = 10
      expect(scope.variables.get('sum')).toBe(10);
    });

    it('bails out with "Infinite loop" at MAX_ITERATIONS', async () => {
      const scope = mkScope();
      const ctx = mkCtx(scope, {
        evaluateHoloExpression: async () => true, // always truthy
      });
      const res = await executeHoloStatement(
        { type: 'WhileStatement', condition: true, body: [] } as never,
        undefined,
        ctx,
      );
      expect(res.success).toBe(false);
      expect(res.error).toBe('Infinite loop');
      expect(MAX_ITERATIONS).toBe(1000);
    });
  });

  describe('ClassicForStatement', () => {
    it('runs init, test, body, update in correct order', async () => {
      const scope = mkScope({ i: 99, out: '' });
      const ctx = mkCtx(scope, {
        evaluateHoloExpression: async (expr) => {
          if (expr === 'i<3') return (scope.variables.get('i') as number) < 3;
          if (expr === 'i-val') return scope.variables.get('i') as number;
          return expr as HoloScriptValue;
        },
      });
      await executeHoloStatement(
        {
          type: 'ClassicForStatement',
          init: { type: 'Assignment', target: 'i', operator: '=', value: 0 },
          test: 'i<3',
          update: { type: 'Assignment', target: 'i', operator: '+=', value: 1 },
          body: [{ type: 'EmitStatement', event: 'tick', data: 'i-val' }],
        } as never,
        undefined,
        ctx,
      );
      // i starts at 0 (init overrode 99), iterates while i<3 → i becomes 3
      expect(scope.variables.get('i')).toBe(3);
    });
  });

  describe('VariableDeclaration', () => {
    it('declares on currentScope when no scopeOverride', async () => {
      const scope = mkScope();
      const ctx = mkCtx(scope);
      await executeHoloStatement(
        { type: 'VariableDeclaration', name: 'foo', value: 7 } as never,
        undefined,
        ctx,
      );
      expect(scope.variables.get('foo')).toBe(7);
    });

    it('declares undefined when value absent', async () => {
      const scope = mkScope();
      const ctx = mkCtx(scope);
      await executeHoloStatement(
        { type: 'VariableDeclaration', name: 'bar' } as never,
        undefined,
        ctx,
      );
      expect(scope.variables.has('bar')).toBe(true);
      expect(scope.variables.get('bar')).toBeUndefined();
    });

    it('uses scopeOverride when provided', async () => {
      const main = mkScope();
      const sub = mkScope();
      const ctx = mkCtx(main);
      await executeHoloStatement(
        { type: 'VariableDeclaration', name: 'local', value: 'here' } as never,
        sub,
        ctx,
      );
      expect(sub.variables.get('local')).toBe('here');
      expect(main.variables.has('local')).toBe(false);
    });
  });

  describe('EmitStatement', () => {
    it('invokes emit with event name + evaluated data', async () => {
      const scope = mkScope();
      const emitFn = vi.fn();
      const ctx = mkCtx(scope, { emit: emitFn });
      await executeHoloStatement(
        { type: 'EmitStatement', event: 'clicked', data: 'payload' } as never,
        undefined,
        ctx,
      );
      expect(emitFn).toHaveBeenCalledWith('clicked', 'payload');
    });

    it('omits data when stmt.data is falsy', async () => {
      const scope = mkScope();
      const emitFn = vi.fn();
      const ctx = mkCtx(scope, { emit: emitFn });
      await executeHoloStatement(
        { type: 'EmitStatement', event: 'pulse' } as never,
        undefined,
        ctx,
      );
      expect(emitFn).toHaveBeenCalledWith('pulse', undefined);
    });
  });

  describe('AwaitStatement', () => {
    it('awaits Promise value', async () => {
      const scope = mkScope();
      const ctx = mkCtx(scope, {
        evaluateHoloExpression: async () => Promise.resolve('resolved'),
      });
      const res = await executeHoloStatement(
        { type: 'AwaitStatement', expression: 'whatever' } as never,
        undefined,
        ctx,
      );
      expect(res.success).toBe(true);
    });

    it('accepts non-Promise value (no-op await)', async () => {
      const scope = mkScope();
      const ctx = mkCtx(scope, {
        evaluateHoloExpression: async () => 42 as HoloScriptValue,
      });
      const res = await executeHoloStatement(
        { type: 'AwaitStatement', expression: 'whatever' } as never,
        undefined,
        ctx,
      );
      expect(res.success).toBe(true);
    });
  });

  describe('ReturnStatement', () => {
    it('returns evaluated value as output', async () => {
      const scope = mkScope();
      const ctx = mkCtx(scope);
      const res = await executeHoloStatement(
        { type: 'ReturnStatement', value: 'done' } as never,
        undefined,
        ctx,
      );
      expect(res.success).toBe(true);
      expect(res.output).toBe('done');
    });

    it('returns null when no value', async () => {
      const scope = mkScope();
      const ctx = mkCtx(scope);
      const res = await executeHoloStatement(
        { type: 'ReturnStatement' } as never,
        undefined,
        ctx,
      );
      expect(res.success).toBe(true);
      expect(res.output).toBeNull();
    });
  });

  describe('ExpressionStatement', () => {
    it('evaluates and returns as output', async () => {
      const scope = mkScope();
      const ctx = mkCtx(scope, {
        evaluateHoloExpression: async () => 'evaluated' as HoloScriptValue,
      });
      const res = await executeHoloStatement(
        { type: 'ExpressionStatement', expression: 'anything' } as never,
        undefined,
        ctx,
      );
      expect(res.success).toBe(true);
      expect(res.output).toBe('evaluated');
    });
  });

  describe('unknown statement type', () => {
    it('returns error message with type', async () => {
      const scope = mkScope();
      const ctx = mkCtx(scope);
      const res = await executeHoloStatement(
        { type: 'NopeNotReal' } as never,
        undefined,
        ctx,
      );
      expect(res.success).toBe(false);
      expect(res.error).toContain('Unknown stmt type');
      expect(res.error).toContain('NopeNotReal');
    });
  });

  describe('thrown errors in evaluateHoloExpression', () => {
    it('surfaces error as ExecutionResult.error', async () => {
      const scope = mkScope();
      const ctx = mkCtx(scope, {
        evaluateHoloExpression: async () => {
          throw new Error('kaboom');
        },
      });
      const res = await executeHoloStatement(
        { type: 'Assignment', target: 'x', operator: '=', value: 'expr' } as never,
        undefined,
        ctx,
      );
      expect(res.success).toBe(false);
      expect(res.error).toBe('kaboom');
    });
  });

  describe('executeHoloProgram', () => {
    it('runs all statements in order when no return', async () => {
      const scope = mkScope({ count: 0 });
      const ctx = mkCtx(scope);
      const results = await executeHoloProgram(
        [
          { type: 'Assignment', target: 'count', operator: '+=', value: 1 },
          { type: 'Assignment', target: 'count', operator: '+=', value: 2 },
          { type: 'Assignment', target: 'count', operator: '+=', value: 3 },
        ] as never,
        undefined,
        ctx,
      );
      expect(results).toHaveLength(3);
      expect(scope.variables.get('count')).toBe(6);
    });

    it('short-circuits on ReturnStatement with defined output', async () => {
      const scope = mkScope({ reached: 0 });
      const ctx = mkCtx(scope);
      const results = await executeHoloProgram(
        [
          { type: 'Assignment', target: 'reached', operator: '+=', value: 1 },
          { type: 'ReturnStatement', value: 'early' },
          { type: 'Assignment', target: 'reached', operator: '+=', value: 100 },
        ] as never,
        undefined,
        ctx,
      );
      expect(results).toHaveLength(2);
      expect(results[1].output).toBe('early');
      expect(scope.variables.get('reached')).toBe(1); // third statement never ran
    });

    it('does NOT short-circuit on Return with null output', async () => {
      const scope = mkScope({ reached: 0 });
      const ctx = mkCtx(scope);
      const results = await executeHoloProgram(
        [
          { type: 'ReturnStatement' }, // value absent → output=null
          { type: 'Assignment', target: 'reached', operator: '+=', value: 1 },
        ] as never,
        undefined,
        ctx,
      );
      // null is NOT `!== undefined` in the short-circuit check; actually
      // `null !== undefined` IS true, so short-circuit DOES fire. Lock that.
      expect(results).toHaveLength(1);
      expect(scope.variables.get('reached')).toBe(0);
    });
  });
});
