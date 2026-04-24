/**
 * Unit tests for graph-executors — BUILD-mode module coverage.
 *
 * Slice 20 — four graph-node executors (Function, Connection, Gate,
 * Stream). Fat-context pattern with 14 fields; each executor uses a
 * subset. Tests lock dispatch semantics, bidirectional-connection
 * event wiring, gate return-bubbling, stream pipeline ordering.
 *
 * **See**: packages/core/src/runtime/graph-executors.ts (slice 20)
 */

import { describe, it, expect, vi } from 'vitest';
import {
  executeFunction,
  executeConnection,
  executeGate,
  executeStream,
  type GraphExecutorContext,
} from './graph-executors';
import type {
  ConnectionNode,
  ExecutionResult,
  GateNode,
  HologramProperties,
  HoloScriptValue,
  MethodNode,
  SpatialPosition,
  StreamNode,
} from '../types';

function makeCtx(overrides: Partial<GraphExecutorContext> = {}): GraphExecutorContext {
  return {
    functions: new Map<string, MethodNode>(),
    connections: [] as ConnectionNode[],
    hologramState: new Map<string, HologramProperties>(),
    spatialMemory: new Map<string, SpatialPosition>(),
    on: vi.fn(),
    emit: vi.fn(),
    getVariable: vi.fn(() => undefined),
    setVariable: vi.fn(),
    createConnectionStream: vi.fn(),
    createFlowingStream: vi.fn(),
    getDataTypeColor: vi.fn(() => '#ffffff'),
    evaluateCondition: vi.fn(() => true),
    executeProgram: vi.fn(async () => [] as ExecutionResult[]),
    callStackDepth: vi.fn(() => 0),
    applyTransformation: vi.fn(async (data: unknown) => data as HoloScriptValue),
    ...overrides,
  };
}

// ──────────────────────────────────────────────────────────────────
// executeFunction
// ──────────────────────────────────────────────────────────────────

describe('executeFunction', () => {
  it('registers function in the functions map', async () => {
    const ctx = makeCtx();
    const node = {
      type: 'method',
      name: 'foo',
      parameters: [{ name: 'x' }, { name: 'y' }],
    } as unknown as MethodNode;
    await executeFunction(node, ctx);
    expect(ctx.functions.get('foo')).toBe(node);
  });

  it('writes hologram state with defaults (cube #ff6b35 size 1.5)', async () => {
    const ctx = makeCtx();
    await executeFunction(
      { type: 'method', name: 'f', parameters: [] } as unknown as MethodNode,
      ctx,
    );
    const holo = ctx.hologramState.get('f');
    expect(holo).toMatchObject({
      shape: 'cube',
      color: '#ff6b35',
      size: 1.5,
    });
  });

  it('node.hologram overrides defaults (spread wins)', async () => {
    const ctx = makeCtx();
    await executeFunction(
      {
        type: 'method',
        name: 'f',
        parameters: [],
        hologram: { color: '#ff0000', size: 9 },
      } as unknown as MethodNode,
      ctx,
    );
    expect(ctx.hologramState.get('f')!.color).toBe('#ff0000');
    expect(ctx.hologramState.get('f')!.size).toBe(9);
  });

  it('output message includes parameter count', async () => {
    const ctx = makeCtx();
    const result = await executeFunction(
      {
        type: 'method',
        name: 'bar',
        parameters: [{ name: 'a' }, { name: 'b' }, { name: 'c' }],
      } as unknown as MethodNode,
      ctx,
    );
    expect(result.output).toBe("Function 'bar' defined with 3 parameter(s)");
  });
});

// ──────────────────────────────────────────────────────────────────
// executeConnection
// ──────────────────────────────────────────────────────────────────

describe('executeConnection', () => {
  it('pushes connection to ctx.connections', async () => {
    const ctx = makeCtx();
    const node = { type: 'connection', from: 'a', to: 'b', dataType: 'number' } as ConnectionNode;
    await executeConnection(node, ctx);
    expect(ctx.connections).toHaveLength(1);
    expect(ctx.connections[0]).toBe(node);
  });

  it('creates particle stream when both endpoints have positions', async () => {
    const ctx = makeCtx();
    ctx.spatialMemory.set('a', [0, 0, 0]);
    ctx.spatialMemory.set('b', [10, 0, 0]);
    await executeConnection(
      { type: 'connection', from: 'a', to: 'b', dataType: 'number' } as ConnectionNode,
      ctx,
    );
    expect(ctx.createConnectionStream).toHaveBeenCalledWith(
      'a', 'b', [0, 0, 0], [10, 0, 0], 'number',
    );
  });

  it('skips particle stream when either endpoint is unpositioned', async () => {
    const ctx = makeCtx();
    ctx.spatialMemory.set('a', [0, 0, 0]);
    // 'b' has no position
    await executeConnection(
      { type: 'connection', from: 'a', to: 'b', dataType: 'x' } as ConnectionNode,
      ctx,
    );
    expect(ctx.createConnectionStream).not.toHaveBeenCalled();
  });

  it('non-bidirectional connection does NOT register on/emit handlers', async () => {
    const ctx = makeCtx();
    await executeConnection(
      { type: 'connection', from: 'a', to: 'b', dataType: 'x' } as ConnectionNode,
      ctx,
    );
    expect(ctx.on).not.toHaveBeenCalled();
  });

  it('bidirectional connection registers 2 handlers (one each direction)', async () => {
    const ctx = makeCtx();
    await executeConnection(
      {
        type: 'connection',
        from: 'a',
        to: 'b',
        dataType: 'x',
        bidirectional: true,
      } as ConnectionNode,
      ctx,
    );
    expect(ctx.on).toHaveBeenCalledTimes(2);
    expect((ctx.on as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe('a.changed');
    expect((ctx.on as ReturnType<typeof vi.fn>).mock.calls[1][0]).toBe('b.changed');
  });

  it('bidirectional reactive binding: a.changed fires setVariable(b) + emit(b.changed)', async () => {
    const ctx = makeCtx();
    await executeConnection(
      {
        type: 'connection', from: 'a', to: 'b', dataType: 'x', bidirectional: true,
      } as ConnectionNode,
      ctx,
    );
    const [, aChangedHandler] = (ctx.on as ReturnType<typeof vi.fn>).mock.calls[0];
    await aChangedHandler({ new: 42 });
    expect(ctx.setVariable).toHaveBeenCalledWith('b', { new: 42 });
    expect(ctx.emit).toHaveBeenCalledWith('b.changed', { new: 42 });
  });

  it('returns cylinder hologram with dataType-derived color', async () => {
    const ctx = makeCtx({ getDataTypeColor: vi.fn(() => '#4ecdc4') });
    const result = await executeConnection(
      { type: 'connection', from: 'a', to: 'b', dataType: 'number' } as ConnectionNode,
      ctx,
    );
    expect(result.hologram).toMatchObject({
      shape: 'cylinder',
      color: '#4ecdc4',
      size: 0.1,
    });
  });
});

// ──────────────────────────────────────────────────────────────────
// executeGate
// ──────────────────────────────────────────────────────────────────

describe('executeGate', () => {
  it('true condition picks truePath', async () => {
    const ctx = makeCtx({
      evaluateCondition: vi.fn(() => true),
      executeProgram: vi.fn(async () => [{ success: true, output: 'from-true' }]),
    });
    const result = await executeGate(
      {
        type: 'gate',
        condition: 'cond',
        truePath: [{ type: 'a' }],
        falsePath: [{ type: 'b' }],
      } as unknown as GateNode,
      ctx,
    );
    expect(result.output).toContain('took true path');
    // Hologram color for true = green
    expect((result.hologram as HologramProperties).color).toBe('#00ff00');
  });

  it('false condition picks falsePath + red hologram', async () => {
    const ctx = makeCtx({
      evaluateCondition: vi.fn(() => false),
      executeProgram: vi.fn(async () => [{ success: true }]),
    });
    const result = await executeGate(
      {
        type: 'gate',
        condition: 'x',
        truePath: [{ type: 'a' }],
        falsePath: [{ type: 'b' }],
      } as unknown as GateNode,
      ctx,
    );
    expect(result.output).toContain('took false path');
    expect((result.hologram as HologramProperties).color).toBe('#ff0000');
  });

  it('empty chosen path returns envelope without invoking executeProgram', async () => {
    const ctx = makeCtx({ evaluateCondition: vi.fn(() => true) });
    const result = await executeGate(
      {
        type: 'gate', condition: 'x', truePath: [], falsePath: [{ type: 'b' }],
      } as unknown as GateNode,
      ctx,
    );
    expect(ctx.executeProgram).not.toHaveBeenCalled();
    expect(result.success).toBe(true);
  });

  it('return-bubbling: when selected path contains a return node, bubble lastResult up', async () => {
    const bubble = { success: true, output: 'BUBBLE' };
    const ctx = makeCtx({
      evaluateCondition: vi.fn(() => true),
      executeProgram: vi.fn(async () => [{ success: true }, bubble]),
    });
    const result = await executeGate(
      {
        type: 'gate',
        condition: 'cond',
        truePath: [{ type: 'exec' }, { type: 'return' }],
        falsePath: [],
      } as unknown as GateNode,
      ctx,
    );
    // The sub-program's last result bubbled up (not the gate's envelope)
    expect(result).toBe(bubble);
  });

  it('catches evaluator exception and returns failure envelope', async () => {
    const ctx = makeCtx({
      evaluateCondition: vi.fn(() => {
        throw new Error('cond-error');
      }),
    });
    const result = await executeGate(
      {
        type: 'gate', condition: 'c', truePath: [], falsePath: [],
      } as unknown as GateNode,
      ctx,
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain('Gate execution failed');
  });

  it('calls executeProgram with callStackDepth + 1', async () => {
    const ctx = makeCtx({
      evaluateCondition: vi.fn(() => true),
      callStackDepth: vi.fn(() => 5),
      executeProgram: vi.fn(async () => []),
    });
    await executeGate(
      {
        type: 'gate', condition: 'c', truePath: [{ type: 's' }], falsePath: [],
      } as unknown as GateNode,
      ctx,
    );
    expect(ctx.executeProgram).toHaveBeenCalled();
    expect((ctx.executeProgram as ReturnType<typeof vi.fn>).mock.calls[0][1]).toBe(6);
  });
});

// ──────────────────────────────────────────────────────────────────
// executeStream
// ──────────────────────────────────────────────────────────────────

describe('executeStream', () => {
  it('reads source via getVariable', async () => {
    const ctx = makeCtx({ getVariable: vi.fn(() => [1, 2, 3]) });
    await executeStream(
      {
        type: 'stream', name: 's', source: 'input', transformations: [],
      } as unknown as StreamNode,
      ctx,
    );
    expect(ctx.getVariable).toHaveBeenCalledWith('input');
  });

  it('applies transformations in order (pipeline)', async () => {
    const callOrder: unknown[] = [];
    const ctx = makeCtx({
      getVariable: vi.fn(() => [1, 2, 3]),
      applyTransformation: vi.fn(async (data: unknown, t: unknown) => {
        callOrder.push(t);
        return ['transformed', data] as unknown as HoloScriptValue;
      }),
    });
    const transforms = [
      { type: 'transformation', operation: 'first' },
      { type: 'transformation', operation: 'second' },
      { type: 'transformation', operation: 'third' },
    ];
    await executeStream(
      {
        type: 'stream', name: 'p', source: 'i', transformations: transforms,
      } as unknown as StreamNode,
      ctx,
    );
    expect(callOrder).toHaveLength(3);
    expect((callOrder[0] as { operation: string }).operation).toBe('first');
    expect((callOrder[2] as { operation: string }).operation).toBe('third');
  });

  it('writes final data under "<name>_result"', async () => {
    const ctx = makeCtx({
      getVariable: vi.fn(() => 'input-data'),
      applyTransformation: vi.fn(async () => 'transformed' as HoloScriptValue),
    });
    await executeStream(
      {
        type: 'stream', name: 'myStream', source: 'src',
        transformations: [{ type: 'transformation', operation: 'x' }],
      } as unknown as StreamNode,
      ctx,
    );
    expect(ctx.setVariable).toHaveBeenCalledWith('myStream_result', 'transformed');
  });

  it('creates flowing-stream particle effect at node.position', async () => {
    const ctx = makeCtx({ getVariable: vi.fn(() => [1, 2]) });
    await executeStream(
      {
        type: 'stream', name: 'st', source: 's', transformations: [],
        position: [10, 20, 30],
      } as unknown as StreamNode,
      ctx,
    );
    expect(ctx.createFlowingStream).toHaveBeenCalledWith('st', [10, 20, 30], [1, 2]);
  });

  it('defaults position to [0,0,0] when absent', async () => {
    const ctx = makeCtx({ getVariable: vi.fn(() => null) });
    await executeStream(
      {
        type: 'stream', name: 's', source: 'x', transformations: [],
      } as unknown as StreamNode,
      ctx,
    );
    expect((ctx.createFlowingStream as ReturnType<typeof vi.fn>).mock.calls[0][1]).toEqual([0, 0, 0]);
  });

  it('output message reports item count for arrays', async () => {
    const ctx = makeCtx({
      getVariable: vi.fn(() => 'x'),
      applyTransformation: vi.fn(async () => [10, 20, 30] as unknown as HoloScriptValue),
    });
    const result = await executeStream(
      {
        type: 'stream', name: 's', source: 'i',
        transformations: [{ type: 'transformation' }],
      } as unknown as StreamNode,
      ctx,
    );
    expect(result.output).toContain('3 item(s)');
  });

  it('output message reports "1 item(s)" for non-array', async () => {
    const ctx = makeCtx({ getVariable: vi.fn(() => 42) });
    const result = await executeStream(
      {
        type: 'stream', name: 's', source: 'i', transformations: [],
      } as unknown as StreamNode,
      ctx,
    );
    expect(result.output).toContain('1 item(s)');
  });
});
