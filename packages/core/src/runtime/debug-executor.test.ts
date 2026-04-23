/**
 * Unit tests for runtime/debug-executor.ts (W1-T4 slice 31).
 *
 * Covers the snapshot-building contract + pyramid-hologram write +
 * logger call + ExecutionResult shape. Runtime mutable state is
 * supplied via a structural DebugExecutorContext — no HoloScriptRuntime
 * dependency.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  executeDebug,
  DEBUG_HOLOGRAM,
  type DebugExecutorContext,
} from './debug-executor';
import type { HologramProperties, HoloScriptValue, ExecutionResult } from '../types';

function mkCtx(overrides: Partial<DebugExecutorContext> = {}): DebugExecutorContext & {
  __writes: Array<{ key: string; hologram: HologramProperties }>;
  __logs: Array<{ message: string; payload: Record<string, unknown> }>;
} {
  const writes: Array<{ key: string; hologram: HologramProperties }> = [];
  const logs: Array<{ message: string; payload: Record<string, unknown> }> = [];
  return {
    scopeVariables: new Map(),
    contextVariables: new Map(),
    functions: new Map(),
    connections: [],
    callStack: [],
    uiElements: new Map(),
    animations: new Map(),
    executionHistory: [],
    setHologramState: (key, hologram) => {
      writes.push({ key, hologram });
    },
    logInfo: (message, payload) => {
      logs.push({ message, payload });
    },
    ...overrides,
    __writes: writes,
    __logs: logs,
  } as DebugExecutorContext & {
    __writes: typeof writes;
    __logs: typeof logs;
  };
}

describe('runtime/debug-executor', () => {
  describe('DEBUG_HOLOGRAM constant', () => {
    it('has the canonical pyramid marker shape', () => {
      expect(DEBUG_HOLOGRAM.shape).toBe('pyramid');
      expect(DEBUG_HOLOGRAM.color).toBe('#ff1493');
      expect(DEBUG_HOLOGRAM.size).toBe(0.8);
      expect(DEBUG_HOLOGRAM.glow).toBe(true);
      expect(DEBUG_HOLOGRAM.interactive).toBe(true);
    });
  });

  describe('executeDebug', () => {
    it('returns ExecutionResult.success=true always (advisory, not gate)', async () => {
      const ctx = mkCtx();
      const res = await executeDebug({ type: 'debug' } as never, ctx);
      expect(res.success).toBe(true);
    });

    it('snapshots scopeVariables as {k:v} object in output.variables', async () => {
      const ctx = mkCtx({
        scopeVariables: new Map<string, HoloScriptValue>([
          ['x', 42],
          ['name', 'alice'],
        ]),
      });
      const res = await executeDebug({ type: 'debug' } as never, ctx);
      const info = res.output as unknown as { variables: Record<string, unknown> };
      expect(info.variables).toEqual({ x: 42, name: 'alice' });
    });

    it('snapshots contextVariables separately from scopeVariables', async () => {
      const ctx = mkCtx({
        scopeVariables: new Map([['local', 1]]),
        contextVariables: new Map([['global', 2]]),
      });
      const res = await executeDebug({ type: 'debug' } as never, ctx);
      const info = res.output as unknown as {
        variables: Record<string, unknown>;
        contextVariables: Record<string, unknown>;
      };
      expect(info.variables).toEqual({ local: 1 });
      expect(info.contextVariables).toEqual({ global: 2 });
    });

    it('reports functions as name array (not the values)', async () => {
      const ctx = mkCtx({
        functions: new Map<string, unknown>([
          ['f1', () => 1],
          ['f2', () => 2],
        ]),
      });
      const res = await executeDebug({ type: 'debug' } as never, ctx);
      const info = res.output as unknown as { functions: string[] };
      expect(info.functions).toEqual(['f1', 'f2']);
    });

    it('reports connections as a count, not the array itself', async () => {
      const ctx = mkCtx({ connections: [{}, {}, {}, {}] });
      const res = await executeDebug({ type: 'debug' } as never, ctx);
      const info = res.output as unknown as { connections: number };
      expect(info.connections).toBe(4);
    });

    it('clones callStack (snapshot semantics)', async () => {
      const stack = ['main', 'helper'];
      const ctx = mkCtx({ callStack: stack });
      const res = await executeDebug({ type: 'debug' } as never, ctx);
      const info = res.output as unknown as { callStack: string[] };
      expect(info.callStack).toEqual(['main', 'helper']);
      // Mutating afterwards must not affect the snapshot (proves we cloned).
      stack.push('later');
      expect(info.callStack).toEqual(['main', 'helper']);
    });

    it('truncates executionHistory to last 10 entries', async () => {
      const history = Array.from({ length: 25 }, (_, i) => ({
        success: true,
        output: i as unknown as HoloScriptValue,
      }));
      const ctx = mkCtx({ executionHistory: history as ExecutionResult[] });
      const res = await executeDebug({ type: 'debug' } as never, ctx);
      const info = res.output as unknown as { executionHistory: ExecutionResult[] };
      expect(info.executionHistory).toHaveLength(10);
      expect(info.executionHistory[0].output).toBe(15); // last 10 means indices 15..24
      expect(info.executionHistory[9].output).toBe(24);
    });

    it('writes hologram under debug_<target> key', async () => {
      const ctx = mkCtx();
      await executeDebug({ type: 'debug', target: 'my-fn' } as never, ctx);
      expect(ctx.__writes).toHaveLength(1);
      expect(ctx.__writes[0].key).toBe('debug_my-fn');
    });

    it("writes under debug_program when target is missing", async () => {
      const ctx = mkCtx();
      await executeDebug({ type: 'debug' } as never, ctx);
      expect(ctx.__writes[0].key).toBe('debug_program');
    });

    it('written hologram is a CLONE of DEBUG_HOLOGRAM (no shared mutation)', async () => {
      const ctx = mkCtx();
      await executeDebug({ type: 'debug' } as never, ctx);
      const written = ctx.__writes[0].hologram;
      expect(written).toEqual(DEBUG_HOLOGRAM);
      expect(written).not.toBe(DEBUG_HOLOGRAM); // different reference
      // Mutating the written copy must not touch DEBUG_HOLOGRAM.
      (written as Record<string, unknown>).size = 999;
      expect(DEBUG_HOLOGRAM.size).toBe(0.8);
    });

    it('passed hologram is also returned on ExecutionResult.hologram', async () => {
      const ctx = mkCtx();
      const res = await executeDebug({ type: 'debug' } as never, ctx);
      expect(res.hologram).toBeDefined();
      expect((res.hologram as HologramProperties).shape).toBe('pyramid');
      // It's the SAME object passed to setHologramState (not re-cloned per call).
      expect(res.hologram).toBe(ctx.__writes[0].hologram);
    });

    it('logs "Debug info" + full snapshot payload via logInfo sink', async () => {
      const ctx = mkCtx({
        callStack: ['main'],
        uiElements: new Map([['btn1', {}]]),
      });
      await executeDebug({ type: 'debug' } as never, ctx);
      expect(ctx.__logs).toHaveLength(1);
      expect(ctx.__logs[0].message).toBe('Debug info');
      expect(ctx.__logs[0].payload).toMatchObject({
        callStack: ['main'],
        uiElements: ['btn1'],
      });
    });
  });
});
