/**
 * Unit tests for simple-executors — BUILD-mode module coverage.
 *
 * Slices 17 + 19 + 21 — 11 small executors sharing a single
 * SimpleExecutorContext. Largest shared-context module in the runtime/
 * namespace. Tests lock envelope shapes + state-mutation side effects
 * for each executor; most use only 1-2 context fields.
 *
 * **See**: packages/core/src/runtime/simple-executors.ts (slices 17, 19, 21)
 */

import { describe, it, expect, vi } from 'vitest';
import {
  executeStateMachine,
  executeExpressionStatement,
  executeCall,
  executeEnvironment,
  executeHoloTemplate,
  executeStructure,
  executeAssignment,
  executeReturn,
  executeScale,
  executeComposition,
  executeFocus,
  type SimpleExecutorContext,
} from './simple-executors';
import type {
  ASTNode,
  CompositionNode,
  EnvironmentNode,
  ExecutionResult,
  FocusNode,
  HoloScriptValue,
  ScaleNode,
  StateMachineNode,
} from '../types';

function makeCtx(overrides: Partial<SimpleExecutorContext> = {}): SimpleExecutorContext {
  const envRef: { current: Record<string, unknown> } = { current: {} };
  const scaleRef: { current: { multiplier: number; magnitude: string } } = {
    current: { multiplier: 1, magnitude: 'standard' },
  };
  return {
    stateMachines: new Map<string, StateMachineNode>(),
    templates: new Map<string, unknown>(),
    getEnvironment: () => envRef.current,
    setEnvironment: (env) => { envRef.current = env; },
    focusHistory: [] as string[],
    executionStackDepth: () => 0,
    evaluateExpression: vi.fn((e: string) => e as HoloScriptValue),
    callFunction: vi.fn(async () => ({ success: true }) as ExecutionResult),
    setVariable: vi.fn(),
    setScale: (mul, mag) => { scaleRef.current = { multiplier: mul, magnitude: mag }; },
    getScale: () => scaleRef.current,
    emit: vi.fn(),
    executeProgram: vi.fn(async () => [] as ExecutionResult[]),
    ...overrides,
  };
}

// ──────────────────────────────────────────────────────────────────
// executeStateMachine
// ──────────────────────────────────────────────────────────────────

describe('executeStateMachine', () => {
  it('registers state machine by name in the stateMachines map', async () => {
    const ctx = makeCtx();
    const node = { type: 'stateMachine', name: 'sm1' } as StateMachineNode;
    const result = await executeStateMachine(node, ctx);
    expect(ctx.stateMachines.get('sm1')).toBe(node);
    expect(result.success).toBe(true);
    expect(result.output).toEqual({ registered: 'sm1' });
  });

  it('overwrites existing registration with same name', async () => {
    const ctx = makeCtx();
    const sm1 = { type: 'stateMachine', name: 's' } as StateMachineNode;
    const sm2 = { type: 'stateMachine', name: 's' } as StateMachineNode;
    await executeStateMachine(sm1, ctx);
    await executeStateMachine(sm2, ctx);
    expect(ctx.stateMachines.get('s')).toBe(sm2);
  });
});

// ──────────────────────────────────────────────────────────────────
// executeExpressionStatement
// ──────────────────────────────────────────────────────────────────

describe('executeExpressionStatement', () => {
  it('evaluates expression via evaluator and returns value in envelope', async () => {
    const ctx = makeCtx({
      evaluateExpression: vi.fn(() => 42 as HoloScriptValue),
    });
    const result = await executeExpressionStatement({ expression: 'x + y' }, ctx);
    expect(ctx.evaluateExpression).toHaveBeenCalledWith('x + y');
    expect(result.output).toBe(42);
  });

  it('forwards evaluator exceptions (no internal catch)', async () => {
    const ctx = makeCtx({
      evaluateExpression: vi.fn(() => {
        throw new Error('bad-expr');
      }),
    });
    await expect(
      executeExpressionStatement({ expression: 'broken' }, ctx),
    ).rejects.toThrow('bad-expr');
  });
});

// ──────────────────────────────────────────────────────────────────
// executeCall
// ──────────────────────────────────────────────────────────────────

describe('executeCall', () => {
  it('delegates to callFunction with target + args', async () => {
    const ctx = makeCtx({
      callFunction: vi.fn(async () => ({ success: true, output: 'callResult' }) as ExecutionResult),
    });
    const result = await executeCall(
      { type: 'call', target: 'myFn', args: ['a', 'b'] } as ASTNode & { target?: string; args?: unknown[] },
      ctx,
    );
    expect(ctx.callFunction).toHaveBeenCalledWith('myFn', ['a', 'b']);
    expect(result.output).toBe('callResult');
  });

  it('defaults target to empty string when absent', async () => {
    const ctx = makeCtx();
    await executeCall({ type: 'call' } as ASTNode & { target?: string; args?: unknown[] }, ctx);
    expect(ctx.callFunction).toHaveBeenCalledWith('', []);
  });

  it('defaults args to empty array', async () => {
    const ctx = makeCtx();
    await executeCall({ type: 'call', target: 'f' } as ASTNode & { target?: string; args?: unknown[] }, ctx);
    expect(ctx.callFunction).toHaveBeenCalledWith('f', []);
  });
});

// ──────────────────────────────────────────────────────────────────
// executeEnvironment — by-reference mutation via setEnvironment
// ──────────────────────────────────────────────────────────────────

describe('executeEnvironment', () => {
  it('merges settings into existing environment via setter', async () => {
    const envRef: { current: Record<string, unknown> } = { current: { existing: 'keep' } };
    const ctx = makeCtx({
      getEnvironment: () => envRef.current,
      setEnvironment: (env) => { envRef.current = env; },
    });
    const result = await executeEnvironment(
      { type: 'environment', settings: { newKey: 'added' } } as unknown as EnvironmentNode,
      ctx,
    );
    expect(envRef.current).toEqual({ existing: 'keep', newKey: 'added' });
    expect(result.output).toBe('Environment updated');
  });

  it('new settings override existing keys', async () => {
    const envRef: { current: Record<string, unknown> } = { current: { shared: 'old' } };
    const ctx = makeCtx({
      getEnvironment: () => envRef.current,
      setEnvironment: (env) => { envRef.current = env; },
    });
    await executeEnvironment(
      { type: 'environment', settings: { shared: 'new' } } as unknown as EnvironmentNode,
      ctx,
    );
    expect(envRef.current.shared).toBe('new');
  });
});

// ──────────────────────────────────────────────────────────────────
// executeHoloTemplate
// ──────────────────────────────────────────────────────────────────

describe('executeHoloTemplate', () => {
  it('registers template in templates map', async () => {
    const ctx = makeCtx();
    const node = { name: 'myTpl', kind: 'orb' } as { name: string } & Record<string, unknown>;
    const result = await executeHoloTemplate(node, ctx);
    expect(ctx.templates.get('myTpl')).toBe(node);
    expect(result.output).toBe('Template myTpl registered');
  });

  it('replaces existing template with the same name', async () => {
    const ctx = makeCtx();
    const t1 = { name: 't' } as { name: string } & Record<string, unknown>;
    const t2 = { name: 't' } as { name: string } & Record<string, unknown>;
    await executeHoloTemplate(t1, ctx);
    await executeHoloTemplate(t2, ctx);
    expect(ctx.templates.get('t')).toBe(t2);
  });
});

// ──────────────────────────────────────────────────────────────────
// executeStructure — pure (no ctx needed)
// ──────────────────────────────────────────────────────────────────

describe('executeStructure', () => {
  it('nexus node gets NEXUS_HOLOGRAM defaults (sphere, purple, size 3)', async () => {
    const result = await executeStructure({ type: 'nexus' } as ASTNode);
    expect(result.hologram).toMatchObject({
      shape: 'sphere',
      color: '#9b59b6',
      size: 3,
    });
  });

  it('other types get STRUCTURE_HOLOGRAM defaults (cube, red, size 4)', async () => {
    const result = await executeStructure({ type: 'building' } as ASTNode);
    expect(result.hologram).toMatchObject({
      shape: 'cube',
      color: '#e74c3c',
      size: 4,
    });
  });

  it('node.hologram overrides defaults when present', async () => {
    const result = await executeStructure({
      type: 'nexus',
      hologram: { shape: 'pyramid', color: '#000', size: 7 },
    } as ASTNode);
    expect(result.hologram).toMatchObject({
      shape: 'pyramid',
      color: '#000',
      size: 7,
    });
  });

  it('output includes type + created flag', async () => {
    const result = await executeStructure({ type: 'nexus' } as ASTNode);
    expect(result.output).toEqual({ type: 'nexus', created: true });
  });

  it('spatialPosition is carried through from node.position', async () => {
    const result = await executeStructure({
      type: 'nexus', position: [1, 2, 3],
    } as ASTNode);
    expect(result.spatialPosition).toEqual([1, 2, 3]);
  });
});

// ──────────────────────────────────────────────────────────────────
// executeAssignment
// ──────────────────────────────────────────────────────────────────

describe('executeAssignment', () => {
  it('evaluates RHS and writes via setVariable', async () => {
    const ctx = makeCtx({
      evaluateExpression: vi.fn(() => 42 as HoloScriptValue),
    });
    const result = await executeAssignment(
      { type: 'assignment', name: 'x', value: 'expr' } as ASTNode & { name: string; value: unknown },
      ctx,
    );
    expect(ctx.evaluateExpression).toHaveBeenCalledWith('expr');
    expect(ctx.setVariable).toHaveBeenCalledWith('x', 42);
    expect(result.output).toEqual({ assigned: 'x', value: 42 });
  });

  it('coerces value to string before passing to evaluator', async () => {
    const ctx = makeCtx();
    await executeAssignment(
      { type: 'assignment', name: 'x', value: 100 } as ASTNode & { name: string; value: unknown },
      ctx,
    );
    expect(ctx.evaluateExpression).toHaveBeenCalledWith('100');
  });
});

// ──────────────────────────────────────────────────────────────────
// executeReturn
// ──────────────────────────────────────────────────────────────────

describe('executeReturn', () => {
  it('evaluates node.value and returns result', async () => {
    const ctx = makeCtx({ evaluateExpression: vi.fn(() => 'returned' as HoloScriptValue) });
    const result = await executeReturn(
      { type: 'return', value: 'x' } as ASTNode & { value?: unknown },
      ctx,
    );
    expect(ctx.evaluateExpression).toHaveBeenCalledWith('x');
    expect(result.output).toBe('returned');
  });

  it('falls back to node.expression when value absent', async () => {
    const ctx = makeCtx();
    await executeReturn(
      { type: 'return', expression: 'expr-val' } as ASTNode & { expression?: string },
      ctx,
    );
    expect(ctx.evaluateExpression).toHaveBeenCalledWith('expr-val');
  });

  it('empty string when both absent', async () => {
    const ctx = makeCtx();
    await executeReturn({ type: 'return' } as ASTNode, ctx);
    expect(ctx.evaluateExpression).toHaveBeenCalledWith('');
  });
});

// ──────────────────────────────────────────────────────────────────
// executeScale
// ──────────────────────────────────────────────────────────────────

describe('executeScale', () => {
  it('multiplies parent scale + calls setScale for entry', async () => {
    const scaleRef = { current: { multiplier: 2, magnitude: 'standard' } };
    const setScale = vi.fn((mul, mag) => {
      scaleRef.current = { multiplier: mul, magnitude: mag };
    });
    const ctx = makeCtx({
      getScale: () => scaleRef.current,
      setScale,
    });
    await executeScale(
      { type: 'scale', multiplier: 5, magnitude: 'cosmic', body: [] } as unknown as ScaleNode,
      ctx,
    );
    // First call enters: 2 * 5 = 10
    expect(setScale.mock.calls[0]).toEqual([10, 'cosmic']);
    // Last call restores parent (2, 'standard')
    expect(setScale.mock.calls[setScale.mock.calls.length - 1]).toEqual([2, 'standard']);
  });

  it('emits scale:change on entry and exit', async () => {
    const ctx = makeCtx();
    await executeScale(
      { type: 'scale', multiplier: 3, magnitude: 'macro', body: [] } as unknown as ScaleNode,
      ctx,
    );
    // Two emit calls: enter + exit
    expect((ctx.emit as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe('scale:change');
    expect((ctx.emit as ReturnType<typeof vi.fn>).mock.calls[1][0]).toBe('scale:change');
  });

  it('restores parent scale after body execution', async () => {
    const scaleRef = { current: { multiplier: 1, magnitude: 'standard' } };
    const ctx = makeCtx({
      getScale: () => scaleRef.current,
      setScale: (mul, mag) => {
        scaleRef.current = { multiplier: mul, magnitude: mag };
      },
    });
    await executeScale(
      { type: 'scale', multiplier: 10, magnitude: 'micro', body: [] } as unknown as ScaleNode,
      ctx,
    );
    // After scale block completes, parent (1, 'standard') is restored
    expect(scaleRef.current).toEqual({ multiplier: 1, magnitude: 'standard' });
  });

  it('output reflects the magnitude entered', async () => {
    const ctx = makeCtx();
    const result = await executeScale(
      { type: 'scale', multiplier: 2, magnitude: 'atomic', body: [] } as unknown as ScaleNode,
      ctx,
    );
    expect(result.output).toBe('Executed scale block: atomic');
  });
});

// ──────────────────────────────────────────────────────────────────
// executeComposition
// ──────────────────────────────────────────────────────────────────

describe('executeComposition', () => {
  it('with body.systems/configs/children — executes each in order', async () => {
    const callOrder: ASTNode[][] = [];
    const ctx = makeCtx({
      executeProgram: vi.fn(async (nodes: ASTNode[]) => {
        callOrder.push(nodes);
        return [{ success: true }];
      }),
    });
    await executeComposition(
      {
        type: 'composition', name: 'c',
        body: {
          systems: [{ type: 's1' } as ASTNode],
          configs: [{ type: 'c1' } as ASTNode],
          children: [{ type: 'ch1' } as ASTNode],
        },
      } as unknown as CompositionNode,
      ctx,
    );
    expect(callOrder).toHaveLength(3);
    expect(callOrder[0][0].type).toBe('s1'); // systems first
    expect(callOrder[1][0].type).toBe('c1'); // configs second
    expect(callOrder[2][0].type).toBe('ch1'); // children third
  });

  it('with body → success only if all 3 programs succeeded', async () => {
    const ctx = makeCtx({
      executeProgram: vi.fn(async () => [{ success: true }, { success: false }]),
    });
    const result = await executeComposition(
      {
        type: 'composition', name: 'c',
        body: { systems: [], configs: [], children: [] },
      } as unknown as CompositionNode,
      ctx,
    );
    expect(result.success).toBe(false);
    expect(result.output).toContain('specialized blocks');
  });

  it('without body — fallback to node.children flat execution', async () => {
    const ctx = makeCtx({
      executeProgram: vi.fn(async () => [{ success: true }]),
    });
    const result = await executeComposition(
      {
        type: 'composition', name: 'flat',
        children: [{ type: 'a' } as ASTNode, { type: 'b' } as ASTNode],
      } as unknown as CompositionNode,
      ctx,
    );
    expect(ctx.executeProgram).toHaveBeenCalledTimes(1);
    expect(result.output).toBe('Composition flat executed');
  });
});

// ──────────────────────────────────────────────────────────────────
// executeFocus
// ──────────────────────────────────────────────────────────────────

describe('executeFocus', () => {
  it('pushes target onto focusHistory stack', async () => {
    const ctx = makeCtx();
    await executeFocus(
      { type: 'focus', target: 'player-1', body: [] } as unknown as FocusNode,
      ctx,
    );
    expect(ctx.focusHistory).toEqual(['player-1']);
  });

  it('executes body with current executionStackDepth', async () => {
    const depthSpy = vi.fn(() => 7);
    const ctx = makeCtx({ executionStackDepth: depthSpy });
    await executeFocus(
      { type: 'focus', target: 't', body: [{ type: 'b' } as ASTNode] } as unknown as FocusNode,
      ctx,
    );
    expect(ctx.executeProgram).toHaveBeenCalled();
    // Second arg is the stack depth
    expect((ctx.executeProgram as ReturnType<typeof vi.fn>).mock.calls[0][1]).toBe(7);
  });

  it('returns success when all body statements succeed', async () => {
    const ctx = makeCtx({
      executeProgram: vi.fn(async () => [{ success: true }, { success: true }]),
    });
    const result = await executeFocus(
      { type: 'focus', target: 't', body: [{ type: 's' } as ASTNode] } as unknown as FocusNode,
      ctx,
    );
    expect(result.success).toBe(true);
    expect(result.output).toBe('Focused on t');
  });

  it('returns failure if any body statement failed', async () => {
    const ctx = makeCtx({
      executeProgram: vi.fn(async () => [{ success: true }, { success: false }]),
    });
    const result = await executeFocus(
      { type: 'focus', target: 'x', body: [{ type: 's' } as ASTNode] } as unknown as FocusNode,
      ctx,
    );
    expect(result.success).toBe(false);
  });

  it('empty body returns success (every() on empty array is true)', async () => {
    const ctx = makeCtx({ executeProgram: vi.fn(async () => []) });
    const result = await executeFocus(
      { type: 'focus', target: 'x', body: [] } as unknown as FocusNode,
      ctx,
    );
    expect(result.success).toBe(true);
  });
});
