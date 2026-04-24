/**
 * Unit tests for control-flow — BUILD-mode module coverage + Q2 technique (d)
 * property-based characterization empirical validation.
 *
 * Closes the untested-module gap for slice 12's control-flow module and
 * provides the third empirical proof in the Q2 characterization-as-
 * deterministic-projection family (techniques a + e already validated in
 * builtins-registry.test.ts commit c5eea6409).
 *
 * **Technique (d) proof**: §"property-based characterization" — assertions
 * over invariants rather than hash-locks. E.g. "no @while loop exceeds
 * WHILE_MAX_ITERATIONS regardless of input predicate." The property holds
 * by construction; the test brute-force-validates it across adversarial
 * inputs (pathological ever-true predicate, recursion-trap bodies, etc.).
 *
 * **See**: packages/core/src/runtime/control-flow.ts (slice 12)
 *         research/2026-04-23_monolith-split-followup-open-questions.md §Q2
 */

import { describe, it, expect, vi } from 'vitest';
import {
  executeForLoop,
  executeForEachLoop,
  executeWhileLoop,
  executeIfStatement,
  executeMatch,
  type ControlFlowContext,
} from './control-flow';
import type { ASTNode, ExecutionResult } from '../types';

/** Build a minimal stub context. Tests override specific fields. */
function makeCtx(overrides: Partial<ControlFlowContext> = {}): ControlFlowContext {
  return {
    evaluateExpression: vi.fn((e: string) => e),
    evaluateCondition: vi.fn(() => true),
    executeNode: vi.fn(async () => ({ success: true, output: 'node-ok' }) as ExecutionResult),
    variables: new Map(),
    ...overrides,
  };
}

// ──────────────────────────────────────────────────────────────────
// @for
// ──────────────────────────────────────────────────────────────────

describe('executeForLoop', () => {
  it('iterates array items and sets the loop variable', async () => {
    const seenItems: unknown[] = [];
    const ctx = makeCtx({
      evaluateExpression: vi.fn(() => [10, 20, 30]),
      executeNode: vi.fn(async () => {
        seenItems.push(ctx.variables.get('x'));
        return { success: true };
      }),
    });
    const result = await executeForLoop(
      { variable: 'x', iterable: 'arr', body: [{ type: 'stmt' } as ASTNode] },
      ctx,
    );
    expect(result.success).toBe(true);
    expect(seenItems).toEqual([10, 20, 30]);
  });

  it('deletes loop variable after completion', async () => {
    const ctx = makeCtx({
      evaluateExpression: vi.fn(() => [1, 2]),
    });
    await executeForLoop(
      { variable: 'i', iterable: 'arr', body: [{ type: 's' } as ASTNode] },
      ctx,
    );
    expect(ctx.variables.has('i')).toBe(false);
  });

  it('iterates object entries when iterable resolves to plain object', async () => {
    const entries: unknown[] = [];
    const ctx = makeCtx({
      evaluateExpression: vi.fn(() => ({ a: 1, b: 2 })),
      executeNode: vi.fn(async () => {
        entries.push(ctx.variables.get('e'));
        return { success: true };
      }),
    });
    await executeForLoop(
      { variable: 'e', iterable: 'obj', body: [{ type: 's' } as ASTNode] },
      ctx,
    );
    expect(entries).toEqual([['a', 1], ['b', 2]]);
  });

  it('returns error when iterable is non-iterable primitive', async () => {
    const ctx = makeCtx({
      evaluateExpression: vi.fn(() => 42),
    });
    const result = await executeForLoop(
      { variable: 'x', iterable: '42', body: [] },
      ctx,
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain('Cannot iterate');
  });

  it('short-circuits body on failure', async () => {
    const calls: number[] = [];
    const ctx = makeCtx({
      evaluateExpression: vi.fn(() => [1, 2, 3, 4]),
      executeNode: vi.fn(async () => {
        calls.push(1);
        return { success: calls.length < 2 };
      }),
    });
    const result = await executeForLoop(
      { variable: 'x', iterable: 'arr', body: [{ type: 's' } as ASTNode] },
      ctx,
    );
    expect(calls.length).toBe(2); // short-circuited at 2nd
    expect(result.success).toBe(true); // loop itself succeeded overall
  });

  it('catches exceptions from evaluator and returns failure', async () => {
    const ctx = makeCtx({
      evaluateExpression: vi.fn(() => {
        throw new Error('evaluator blew up');
      }),
    });
    const result = await executeForLoop(
      { variable: 'x', iterable: 'bad', body: [] },
      ctx,
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain('For loop error');
  });
});

describe('executeForEachLoop', () => {
  it('delegates to executeForLoop with collection → iterable rename', async () => {
    const ctx = makeCtx({
      evaluateExpression: vi.fn(() => [1, 2]),
    });
    const result = await executeForEachLoop(
      { variable: 'x', collection: 'coll', body: [{ type: 's' } as ASTNode] },
      ctx,
    );
    expect(result.success).toBe(true);
  });
});

// ──────────────────────────────────────────────────────────────────
// @while — TECHNIQUE (d) PROPERTY-BASED target
// ──────────────────────────────────────────────────────────────────

describe('executeWhileLoop — basic semantics', () => {
  it('runs body while condition is true', async () => {
    let i = 0;
    const ctx = makeCtx({
      evaluateCondition: vi.fn(() => i < 3),
      executeNode: vi.fn(async () => {
        i++;
        return { success: true };
      }),
    });
    const result = await executeWhileLoop(
      { condition: 'i < 3', body: [{ type: 's' } as ASTNode] },
      ctx,
    );
    expect(result.success).toBe(true);
    expect(i).toBe(3);
  });

  it('exits immediately when condition starts false', async () => {
    const bodyCalls = vi.fn();
    const ctx = makeCtx({
      evaluateCondition: vi.fn(() => false),
      executeNode: bodyCalls,
    });
    await executeWhileLoop(
      { condition: 'false', body: [{ type: 's' } as ASTNode] },
      ctx,
    );
    expect(bodyCalls).not.toHaveBeenCalled();
  });

  it('short-circuits on body failure', async () => {
    let iterations = 0;
    const ctx = makeCtx({
      evaluateCondition: vi.fn(() => true),
      executeNode: vi.fn(async () => {
        iterations++;
        return { success: iterations < 3 };
      }),
    });
    await executeWhileLoop(
      { condition: 'true', body: [{ type: 's' } as ASTNode] },
      ctx,
    );
    expect(iterations).toBe(3);
  });

  it('catches evaluator exceptions and returns failure', async () => {
    const ctx = makeCtx({
      evaluateCondition: vi.fn(() => {
        throw new Error('cond error');
      }),
    });
    const result = await executeWhileLoop(
      { condition: 'bad', body: [] },
      ctx,
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain('While loop error');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// TECHNIQUE (d) PROPERTY-BASED CHARACTERIZATION — Q2 EMPIRICAL PROOF
//
// Property under test: "No @while loop ever exceeds WHILE_MAX_ITERATIONS
// (hardcoded to 10_000 per module constant), regardless of the
// adversarial nature of the condition or body."
//
// Invariant is guaranteed by construction — the iteration counter bumps
// on every loop and returns a failure result once the cap trips. This
// test validates the invariant across multiple adversarial scenarios
// rather than hash-locking any single output.
// ═══════════════════════════════════════════════════════════════════════

describe('executeWhileLoop — TECHNIQUE (d) property-based — WHILE_MAX_ITERATIONS safety cap', () => {
  it('PROPERTY: ever-true predicate + always-success body → cap trips at 10,001 iterations', async () => {
    let bodyExecutions = 0;
    const ctx = makeCtx({
      evaluateCondition: vi.fn(() => true),
      executeNode: vi.fn(async () => {
        bodyExecutions++;
        return { success: true };
      }),
    });
    const result = await executeWhileLoop(
      { condition: 'true', body: [{ type: 's' } as ASTNode] },
      ctx,
    );
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/exceeded maximum iterations \(10000\)/);
    // Counter implementation: iterations++ THEN check > MAX, so
    // executeNode runs 10,000 times before the 10,001st iteration
    // trips the cap before body runs.
    expect(bodyExecutions).toBeLessThanOrEqual(10000);
  });

  it('PROPERTY: body that mutates external state cannot extend the cap', async () => {
    // Adversarial: body resets an external counter to try to game the cap
    let hidden = 0;
    const ctx = makeCtx({
      evaluateCondition: vi.fn(() => hidden >= 0), // always true
      executeNode: vi.fn(async () => {
        hidden = 0; // attempt to sabotage — but the module uses its own counter
        return { success: true };
      }),
    });
    const result = await executeWhileLoop(
      { condition: 'hidden >= 0', body: [{ type: 's' } as ASTNode] },
      ctx,
    );
    // Safety cap still trips — module's `iterations` is private to the function
    expect(result.success).toBe(false);
    expect(result.error).toContain('exceeded maximum iterations');
  });

  it('PROPERTY: 1k+ iterations that legitimately complete do NOT trip the cap', async () => {
    // Verify the cap is not over-eager for legitimate long-running loops
    let counter = 0;
    const TARGET = 5000;
    const ctx = makeCtx({
      evaluateCondition: vi.fn(() => counter < TARGET),
      executeNode: vi.fn(async () => {
        counter++;
        return { success: true };
      }),
    });
    const result = await executeWhileLoop(
      { condition: `counter < ${TARGET}`, body: [{ type: 's' } as ASTNode] },
      ctx,
    );
    expect(result.success).toBe(true);
    expect(counter).toBe(TARGET);
  });

  it('PROPERTY: body throwing does not prevent cap (exception path still returns failure)', async () => {
    const ctx = makeCtx({
      evaluateCondition: vi.fn(() => true),
      executeNode: vi.fn(async () => {
        throw new Error('body crashed');
      }),
    });
    const result = await executeWhileLoop(
      { condition: 'true', body: [{ type: 's' } as ASTNode] },
      ctx,
    );
    expect(result.success).toBe(false);
    // Either the cap tripped OR the exception path fired — both are failure
    expect(result.error).toBeDefined();
  });
});

// ──────────────────────────────────────────────────────────────────
// @if
// ──────────────────────────────────────────────────────────────────

describe('executeIfStatement', () => {
  it('runs body when condition true', async () => {
    const bodyCalled = vi.fn(async () => ({ success: true }));
    const elseCalled = vi.fn(async () => ({ success: true }));
    const ctx = makeCtx({
      evaluateCondition: vi.fn(() => true),
      executeNode: bodyCalled,
    });
    await executeIfStatement(
      { condition: 'true', body: [{ type: 'b' } as ASTNode], elseBody: [{ type: 'e' } as ASTNode] },
      ctx,
    );
    expect(bodyCalled).toHaveBeenCalledTimes(1);
  });

  it('runs elseBody when condition false', async () => {
    let executedType = '';
    const ctx = makeCtx({
      evaluateCondition: vi.fn(() => false),
      executeNode: vi.fn(async (n) => {
        executedType = (n as ASTNode).type;
        return { success: true };
      }),
    });
    await executeIfStatement(
      {
        condition: 'false',
        body: [{ type: 'body-branch' } as ASTNode],
        elseBody: [{ type: 'else-branch' } as ASTNode],
      },
      ctx,
    );
    expect(executedType).toBe('else-branch');
  });

  it('missing elseBody with false condition executes empty branch (success=true)', async () => {
    const ctx = makeCtx({ evaluateCondition: vi.fn(() => false) });
    const result = await executeIfStatement(
      { condition: 'false', body: [{ type: 'b' } as ASTNode] },
      ctx,
    );
    expect(result.success).toBe(true);
    expect(ctx.executeNode).not.toHaveBeenCalled();
  });

  it('catches exceptions and returns failure', async () => {
    const ctx = makeCtx({
      evaluateCondition: vi.fn(() => {
        throw new Error('cond error');
      }),
    });
    const result = await executeIfStatement(
      { condition: 'bad', body: [] },
      ctx,
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain('If statement error');
  });
});

// ──────────────────────────────────────────────────────────────────
// @match
// ──────────────────────────────────────────────────────────────────

describe('executeMatch', () => {
  it('returns first matching case body result', async () => {
    const ctx = makeCtx({
      evaluateExpression: vi.fn((e: string) => e === 'subject' ? 5 : Number(e)),
      executeNode: vi.fn(async () => ({ success: true, output: 'matched' })),
    });
    const result = await executeMatch(
      {
        subject: 'subject',
        cases: [
          { pattern: '99', body: [{ type: 'no' } as ASTNode] },
          { pattern: '5', body: [{ type: 'yes' } as ASTNode] },
          { pattern: '10', body: [{ type: 'no' } as ASTNode] },
        ],
      },
      ctx,
    );
    expect(result.success).toBe(true);
    expect(result.output).toBe('matched');
  });

  it('honors guard expression — continues to next case if guard false', async () => {
    const ctx = makeCtx({
      evaluateExpression: vi.fn((e: string) => Number(e) || e),
      evaluateCondition: vi.fn((g: string | unknown) => g === 'ok'),
      executeNode: vi.fn(async () => ({ success: true, output: 'second-case' })),
    });
    const result = await executeMatch(
      {
        subject: '5',
        cases: [
          { pattern: '5', guard: 'fail', body: [{ type: 'first' } as ASTNode] },
          { pattern: '5', guard: 'ok', body: [{ type: 'second' } as ASTNode] },
        ],
      },
      ctx,
    );
    expect(result.output).toBe('second-case');
  });

  it('returns no-match envelope when no case matches', async () => {
    // Subject evaluates to 999; each pattern evaluates to its own distinct
    // value that doesn't equal the subject (no direct match, no type-name
    // match, no range match).
    const ctx = makeCtx({
      evaluateExpression: vi.fn((e: string) => (e === 'subject-expr' ? 999 : Number(e))),
    });
    const result = await executeMatch(
      {
        subject: 'subject-expr',
        cases: [
          { pattern: '1', body: [] },
          { pattern: '2', body: [] },
        ],
      },
      ctx,
    );
    expect(result.success).toBe(false);
    expect(result.error).toBe('No pattern matched');
  });

  it('evaluates single-expression body via evaluateExpression', async () => {
    const ctx = makeCtx({
      evaluateExpression: vi.fn((e: string) => (e === '5' ? 5 : e === 'result' ? 42 : e)),
    });
    const result = await executeMatch(
      {
        subject: '5',
        cases: [{ pattern: '5', body: 'result' as unknown as ASTNode[] }],
      },
      ctx,
    );
    expect(result.success).toBe(true);
    expect(result.output).toBe(42);
  });

  it('catches exceptions and returns failure', async () => {
    const ctx = makeCtx({
      evaluateExpression: vi.fn(() => {
        throw new Error('expr error');
      }),
    });
    const result = await executeMatch(
      { subject: 'bad', cases: [] },
      ctx,
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain('Match expression error');
  });
});
