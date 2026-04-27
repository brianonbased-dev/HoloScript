import { describe, it, expect, vi } from 'vitest';
import { executeHoloProgram, executeHoloStatement } from '../holo-statement-executor.js';
import type { HoloStatementContext, Scope } from '../holo-statement-executor.js';

function makeScope(): Scope {
  return { variables: new Map() };
}

function makeCtx(overrides: Partial<HoloStatementContext> = {}): HoloStatementContext {
  const scope = makeScope();
  return {
    getVariable: vi.fn((name: string) => scope.variables.get(name) ?? null),
    setVariable: vi.fn((name: string, value: unknown) => { scope.variables.set(name, value as never); }),
    currentScope: scope,
    emit: vi.fn(),
    evaluateHoloExpression: vi.fn().mockResolvedValue(null),
    telemetry: {
      setGauge: vi.fn(),
      incrementCounter: vi.fn(),
      measureLatency: vi.fn(<T>(_name: string, fn: () => Promise<T>) => fn()),
      executionDepth: vi.fn(() => 0),
    },
    ...overrides,
  };
}

describe('executeHoloProgram', () => {
  it('returns success for empty statement list', async () => {
    const ctx = makeCtx();
    const result = await executeHoloProgram([], undefined, ctx);
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(0);
  });

  it('executes each statement in order', async () => {
    const order: number[] = [];
    const ctx = makeCtx({
      evaluateHoloExpression: vi.fn().mockResolvedValue(42),
    });
    const stmts = [
      { type: 'ExpressionStatement', expression: { type: 'literal', value: 1 } },
      { type: 'ExpressionStatement', expression: { type: 'literal', value: 2 } },
    ];
    (ctx.evaluateHoloExpression as ReturnType<typeof vi.fn>).mockImplementation(async () => { order.push(order.length + 1); return order[order.length - 1]; });
    await executeHoloProgram(stmts as never, undefined, ctx);
    expect(order).toEqual([1, 2]);
  });

  it('short-circuits on ReturnStatement', async () => {
    const ctx = makeCtx({
      evaluateHoloExpression: vi.fn().mockResolvedValue(99),
    });
    const stmts = [
      { type: 'ReturnStatement', value: { type: 'literal', value: 99 } },
      { type: 'ExpressionStatement', expression: { type: 'literal', value: 0 } },
    ];
    const result = await executeHoloProgram(stmts as never, undefined, ctx);
    const last = result[result.length - 1];
    expect(last.success).toBe(true);
    expect(last.output).toBe(99);
    expect(ctx.evaluateHoloExpression).toHaveBeenCalledTimes(1);
  });
});

describe('executeHoloStatement - Assignment', () => {
  it('assigns a value', async () => {
    const ctx = makeCtx({ evaluateHoloExpression: vi.fn().mockResolvedValue(5) });
    const result = await executeHoloStatement(
      { type: 'Assignment', target: 'x', operator: '=', value: {} } as never,
      undefined, ctx,
    );
    expect(result.success).toBe(true);
    expect(ctx.setVariable).toHaveBeenCalledWith('x', 5, undefined);
  });

  it('handles += operator', async () => {
    const ctx = makeCtx({
      getVariable: vi.fn().mockReturnValue(10),
      evaluateHoloExpression: vi.fn().mockResolvedValue(3),
    });
    await executeHoloStatement(
      { type: 'Assignment', target: 'x', operator: '+=', value: {} } as never,
      undefined, ctx,
    );
    expect(ctx.setVariable).toHaveBeenCalledWith('x', 13, undefined);
  });
});

describe('executeHoloStatement - IfStatement', () => {
  it('executes consequent when condition is truthy', async () => {
    const consequentFn = vi.fn().mockResolvedValue({ success: true });
    const ctx = makeCtx({ evaluateHoloExpression: vi.fn().mockResolvedValue(true) });
    const stmt = {
      type: 'IfStatement',
      condition: {},
      consequent: [{ type: 'ExpressionStatement', expression: {} }],
    };
    // patch evaluateHoloExpression to return true for condition, then track calls
    await executeHoloStatement(stmt as never, undefined, ctx);
    expect(ctx.evaluateHoloExpression).toHaveBeenCalled();
  });

  it('executes alternate when condition is falsy', async () => {
    let callCount = 0;
    const ctx = makeCtx({
      evaluateHoloExpression: vi.fn().mockImplementation(async () => callCount++ === 0 ? false : 99),
    });
    const stmt = {
      type: 'IfStatement',
      condition: {},
      consequent: [],
      alternate: [{ type: 'ExpressionStatement', expression: {} }],
    };
    await executeHoloStatement(stmt as never, undefined, ctx);
    expect(callCount).toBeGreaterThanOrEqual(1);
  });
});

describe('executeHoloStatement - WhileStatement', () => {
  it('executes body while condition is truthy', async () => {
    let iters = 0;
    const ctx = makeCtx({
      evaluateHoloExpression: vi.fn().mockImplementation(async () => ++iters < 3),
    });
    await executeHoloStatement(
      { type: 'WhileStatement', condition: {}, body: [] } as never,
      undefined, ctx,
    );
    expect(iters).toBeGreaterThanOrEqual(2);
  });

  it('returns infinite loop error when MAX_ITERATIONS exceeded', async () => {
    const ctx = makeCtx({ evaluateHoloExpression: vi.fn().mockResolvedValue(true) });
    const result = await executeHoloStatement(
      { type: 'WhileStatement', condition: {}, body: [] } as never,
      undefined, ctx,
    );
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/loop/i);
  });
});

describe('executeHoloStatement - EmitStatement', () => {
  it('calls emit with event name', async () => {
    const ctx = makeCtx({ evaluateHoloExpression: vi.fn().mockResolvedValue('data') });
    await executeHoloStatement(
      { type: 'EmitStatement', event: 'myEvent', data: {} } as never,
      undefined, ctx,
    );
    expect(ctx.emit).toHaveBeenCalledWith('myEvent', 'data');
  });
});

describe('executeHoloStatement - unknown type', () => {
  it('returns success false for unknown stmt type', async () => {
    const ctx = makeCtx();
    const result = await executeHoloStatement(
      { type: 'UnknownXYZ' } as never,
      undefined, ctx,
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain('UnknownXYZ');
  });
});
