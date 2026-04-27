import { describe, expect, it, vi } from 'vitest';
import {
  executeForLoop,
  executeForEachLoop,
  executeWhileLoop,
  executeIfStatement,
  executeMatch,
} from '../control-flow';
import type { ControlFlowContext } from '../control-flow';

function makeCtx(overrides: Partial<ControlFlowContext> = {}): ControlFlowContext {
  return {
    evaluateExpression: vi.fn().mockImplementation((expr: string) => expr),
    evaluateCondition: vi.fn().mockReturnValue(false),
    executeNode: vi.fn().mockResolvedValue({ success: true, output: 'done' }),
    variables: new Map(),
    ...overrides,
  };
}

describe('executeForLoop', () => {
  it('iterates over an array', async () => {
    const items = [1, 2, 3];
    const ctx = makeCtx({
      evaluateExpression: vi.fn().mockReturnValue(items),
    });
    const result = await executeForLoop(
      { variable: '_item', iterable: 'items', body: [{ type: 'noop' } as any] },
      ctx,
    );
    expect(result.success).toBe(true);
    expect(ctx.variables.has('_item')).toBe(false); // deleted after loop
    expect(ctx.executeNode).toHaveBeenCalledTimes(3);
  });

  it('iterates over a plain object (key/value entries)', async () => {
    const obj = { a: 1, b: 2 };
    const ctx = makeCtx({
      evaluateExpression: vi.fn().mockReturnValue(obj),
    });
    const result = await executeForLoop(
      { variable: '_entry', iterable: 'obj', body: [{ type: 'noop' } as any] },
      ctx,
    );
    expect(result.success).toBe(true);
    expect(ctx.executeNode).toHaveBeenCalledTimes(2);
  });

  it('binds loop variable before body execution', async () => {
    const captured: unknown[] = [];
    const ctx = makeCtx({
      evaluateExpression: vi.fn().mockReturnValue(['a', 'b']),
      executeNode: vi.fn().mockImplementation(async () => {
        captured.push(ctx.variables.get('_x'));
        return { success: true, output: null };
      }),
    });
    await executeForLoop(
      { variable: '_x', iterable: 'arr', body: [{ type: 'body' } as any] },
      ctx,
    );
    expect(captured).toEqual(['a', 'b']);
  });

  it('deletes variable after loop', async () => {
    const ctx = makeCtx({
      evaluateExpression: vi.fn().mockReturnValue([1]),
    });
    await executeForLoop(
      { variable: '_v', iterable: 'arr', body: [] },
      ctx,
    );
    expect(ctx.variables.has('_v')).toBe(false);
  });

  it('returns error for non-iterable', async () => {
    const ctx = makeCtx({
      evaluateExpression: vi.fn().mockReturnValue(42),
    });
    const result = await executeForLoop(
      { variable: '_x', iterable: 'num', body: [] },
      ctx,
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain('non-iterable');
  });

  it('breaks out of loop early on failed body node but still returns success', async () => {
    const ctx = makeCtx({
      evaluateExpression: vi.fn().mockReturnValue([1, 2, 3]),
      executeNode: vi.fn().mockResolvedValue({ success: false, error: 'boom' }),
    });
    const result = await executeForLoop(
      { variable: '_i', iterable: 'arr', body: [{ type: 'fail' } as any] },
      ctx,
    );
    // Loop breaks on first failure but still returns success: true
    expect(result.success).toBe(true);
    expect(ctx.executeNode).toHaveBeenCalledTimes(1); // stopped after first
  });

  it('returns success and empty output for empty array', async () => {
    const ctx = makeCtx({
      evaluateExpression: vi.fn().mockReturnValue([]),
    });
    const result = await executeForLoop(
      { variable: '_x', iterable: 'arr', body: [] },
      ctx,
    );
    expect(result.success).toBe(true);
  });
});

describe('executeForEachLoop', () => {
  it('delegates to for-loop semantics', async () => {
    const items = ['x', 'y'];
    const ctx = makeCtx({
      evaluateExpression: vi.fn().mockReturnValue(items),
    });
    const result = await executeForEachLoop(
      { variable: '_e', collection: 'list', body: [{ type: 'noop' } as any] },
      ctx,
    );
    expect(result.success).toBe(true);
    expect(ctx.executeNode).toHaveBeenCalledTimes(2);
  });
});

describe('executeWhileLoop', () => {
  it('executes body while condition is true', async () => {
    let count = 0;
    const ctx = makeCtx({
      evaluateCondition: vi.fn().mockImplementation(() => count < 3),
      executeNode: vi.fn().mockImplementation(async () => {
        count++;
        return { success: true, output: count };
      }),
    });
    const result = await executeWhileLoop(
      { condition: 'count < 3', body: [{ type: 'inc' } as any] },
      ctx,
    );
    expect(result.success).toBe(true);
    expect(count).toBe(3);
  });

  it('does not execute body when condition is initially false', async () => {
    const ctx = makeCtx({
      evaluateCondition: vi.fn().mockReturnValue(false),
    });
    const result = await executeWhileLoop(
      { condition: 'false', body: [{ type: 'noop' } as any] },
      ctx,
    );
    expect(result.success).toBe(true);
    expect(ctx.executeNode).not.toHaveBeenCalled();
  });

  it('stops after 10000 iterations and returns error', async () => {
    const ctx = makeCtx({
      evaluateCondition: vi.fn().mockReturnValue(true),
      executeNode: vi.fn().mockResolvedValue({ success: true, output: null }),
    });
    const result = await executeWhileLoop(
      { condition: 'true', body: [{ type: 'noop' } as any] },
      ctx,
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain('10000');
  });

  it('breaks out of loop early on failed body node but still returns success', async () => {
    let count = 0;
    const ctx = makeCtx({
      evaluateCondition: vi.fn().mockReturnValue(true),
      executeNode: vi.fn().mockImplementation(async () => {
        count++;
        return { success: false, error: 'bad node' };
      }),
    });
    const result = await executeWhileLoop(
      { condition: 'true', body: [{ type: 'fail' } as any] },
      ctx,
    );
    // While loop breaks on body failure but still returns success: true
    expect(result.success).toBe(true);
    expect(count).toBe(1); // stopped after first failure
  });
});

describe('executeIfStatement', () => {
  it('executes body when condition is true', async () => {
    const ctx = makeCtx({
      evaluateCondition: vi.fn().mockReturnValue(true),
    });
    const result = await executeIfStatement(
      { condition: 'true', body: [{ type: 'then' } as any] },
      ctx,
    );
    expect(result.success).toBe(true);
    expect(ctx.executeNode).toHaveBeenCalled();
  });

  it('executes elseBody when condition is false', async () => {
    const executedNodes: string[] = [];
    const ctx = makeCtx({
      evaluateCondition: vi.fn().mockReturnValue(false),
      executeNode: vi.fn().mockImplementation(async (node: any) => {
        executedNodes.push(node.type);
        return { success: true, output: null };
      }),
    });
    await executeIfStatement(
      {
        condition: 'false',
        body: [{ type: 'then' } as any],
        elseBody: [{ type: 'else' } as any],
      },
      ctx,
    );
    expect(executedNodes).toEqual(['else']);
  });

  it('executes nothing when condition is false and no elseBody', async () => {
    const ctx = makeCtx({
      evaluateCondition: vi.fn().mockReturnValue(false),
    });
    const result = await executeIfStatement(
      { condition: 'false', body: [{ type: 'then' } as any] },
      ctx,
    );
    expect(result.success).toBe(true);
    expect(ctx.executeNode).not.toHaveBeenCalled();
  });
});

describe('executeMatch', () => {
  it('matches and executes body when pattern matches', async () => {
    const ctx = makeCtx({
      evaluateExpression: vi.fn()
        .mockReturnValueOnce('foo') // subject
        .mockReturnValueOnce('foo') // pattern
        .mockReturnValueOnce('result-value'), // body expression
    });
    const result = await executeMatch(
      {
        subject: 'myVal',
        cases: [{ pattern: 'foo', body: 'result-value' }],
      },
      ctx,
    );
    expect(result.success).toBe(true);
    expect(result.output).toBe('result-value');
  });

  it('executes array body nodes when matched', async () => {
    const ctx = makeCtx({
      evaluateExpression: vi.fn()
        .mockReturnValueOnce(42) // subject
        .mockReturnValueOnce(42), // pattern
    });
    const result = await executeMatch(
      {
        subject: 'n',
        cases: [{ pattern: '42', body: [{ type: 'exec' } as any] }],
      },
      ctx,
    );
    expect(result.success).toBe(true);
    expect(ctx.executeNode).toHaveBeenCalled();
  });

  it('skips non-matching patterns', async () => {
    const ctx = makeCtx({
      evaluateExpression: vi.fn()
        .mockReturnValueOnce('bar') // subject
        .mockReturnValueOnce('foo'), // pattern (no match)
    });
    const result = await executeMatch(
      {
        subject: 'val',
        cases: [{ pattern: 'foo', body: 'x' }],
      },
      ctx,
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain('No pattern matched');
  });

  it('uses wildcard _ to match anything', async () => {
    const ctx = makeCtx({
      evaluateExpression: vi.fn()
        .mockReturnValueOnce('anything') // subject
        .mockReturnValueOnce('_') // pattern (wildcard)
        .mockReturnValueOnce('caught'), // body expression
    });
    const result = await executeMatch(
      {
        subject: 'x',
        cases: [{ pattern: '_', body: 'caught' }],
      },
      ctx,
    );
    expect(result.success).toBe(true);
  });

  it('skips case when guard fails', async () => {
    const ctx = makeCtx({
      evaluateExpression: vi.fn()
        .mockReturnValueOnce('foo') // subject
        .mockReturnValueOnce('foo'), // pattern
      evaluateCondition: vi.fn().mockReturnValue(false), // guard fails
    });
    const result = await executeMatch(
      {
        subject: 'v',
        cases: [{ pattern: 'foo', guard: 'false', body: 'hit' }],
      },
      ctx,
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain('No pattern matched');
  });

  it('returns error when no cases match', async () => {
    const ctx = makeCtx({
      evaluateExpression: vi.fn().mockReturnValue('x'),
    });
    const result = await executeMatch(
      { subject: 'val', cases: [] },
      ctx,
    );
    expect(result.success).toBe(false);
  });
});
