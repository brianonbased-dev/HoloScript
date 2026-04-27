/**
 * ShellTrait — comprehensive test suite
 * Tests onAttach, onDetach, onUpdate, and all onEvent handlers:
 *   shell:exec (capabilities path + spawn path), shell:kill, shell:get_status
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'node:events';
import { shellHandler } from '../ShellTrait';
import type { ShellConfig, ShellState } from '../ShellTrait';
import type { HSPlusNode } from '../../types';
import type { TraitContext } from '../../types/TraitContext';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeNode(): HSPlusNode {
  return {} as HSPlusNode;
}

type Emitted = Array<{ type: string; payload: unknown }>;

function makeCtx(extra?: Partial<TraitContext>): { ctx: TraitContext; emitted: Emitted } {
  const emitted: Emitted = [];
  const ctx = {
    emit: vi.fn((type: string, payload?: unknown) => {
      emitted.push({ type, payload });
      return 0;
    }),
    ...extra,
  } as unknown as TraitContext;
  return { ctx, emitted };
}

const cfg = shellHandler.defaultConfig as ShellConfig;

/** Attach and return node + ctx pair ready for event testing */
function attachedNode(ctxExtra?: Partial<TraitContext>) {
  const node = makeNode();
  const { ctx, emitted } = makeCtx(ctxExtra);
  shellHandler.onAttach!(node, cfg, ctx);
  return { node, ctx, emitted };
}

function getState(node: HSPlusNode): ShellState {
  return (node as Record<string, unknown>).__shellState as ShellState;
}

// ── Local async polling helper ───────────────────────────────────────────────

async function waitFor(fn: () => void, options: { timeout?: number } = {}): Promise<void> {
  const timeout = options.timeout ?? 5000;
  const interval = 50;
  const start = Date.now();
  while (true) {
    try {
      fn();
      return;
    } catch (e) {
      if (Date.now() - start > timeout) throw e;
      await new Promise((r) => setTimeout(r, interval));
    }
  }
}

// ── Reset mocks before each test ─────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

// ─────────────────────────────────────────────────────────────────────────────
// onAttach
// ─────────────────────────────────────────────────────────────────────────────

describe('onAttach', () => {
  it('initialises __shellState on the node', () => {
    const { node } = attachedNode();
    expect((node as Record<string, unknown>).__shellState).toBeDefined();
  });

  it('creates an empty activeProcesses Map', () => {
    const { node } = attachedNode();
    expect(getState(node).activeProcesses).toBeInstanceOf(Map);
    expect(getState(node).activeProcesses.size).toBe(0);
  });

  it('creates an empty history array', () => {
    const { node } = attachedNode();
    expect(getState(node).history).toEqual([]);
  });

  it('sets totalExecutions to 0', () => {
    const { node } = attachedNode();
    expect(getState(node).totalExecutions).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// onDetach
// ─────────────────────────────────────────────────────────────────────────────

describe('onDetach', () => {
  it('removes __shellState from the node', () => {
    const { node, ctx } = attachedNode();
    shellHandler.onDetach!(node, cfg, ctx);
    expect((node as Record<string, unknown>).__shellState).toBeUndefined();
  });

  it('clears timers for active processes', () => {
    const { node, ctx } = attachedNode();
    const state = getState(node);
    const timer = setTimeout(() => {}, 99999);
    state.activeProcesses.set(1234, {
      pid: 1234,
      command: 'sleep',
      startedAt: Date.now(),
      stdout: '',
      stderr: '',
      timer,
    });
    // Should not throw and should clear cleanly
    expect(() => shellHandler.onDetach!(node, cfg, ctx)).not.toThrow();
    expect((node as Record<string, unknown>).__shellState).toBeUndefined();
  });

  it('is safe to call when no state is present', () => {
    const node = makeNode();
    const { ctx } = makeCtx();
    expect(() => shellHandler.onDetach!(node, cfg, ctx)).not.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// onUpdate
// ─────────────────────────────────────────────────────────────────────────────

describe('onUpdate', () => {
  it('is a no-op', () => {
    const { node, ctx } = attachedNode();
    expect(() => shellHandler.onUpdate!(node, cfg, ctx, 0.016)).not.toThrow();
  });

  it('does not emit any events', () => {
    const { node, ctx, emitted } = attachedNode();
    shellHandler.onUpdate!(node, cfg, ctx, 0.016);
    expect(emitted).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// onEvent – missing state guard
// ─────────────────────────────────────────────────────────────────────────────

describe('onEvent – no state', () => {
  it('silently returns when __shellState is missing', () => {
    const node = makeNode();
    const { ctx } = makeCtx();
    expect(() =>
      shellHandler.onEvent!(node, cfg, ctx, { type: 'shell:exec', payload: {} }),
    ).not.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// onEvent – shell:exec – no command
// ─────────────────────────────────────────────────────────────────────────────

describe('onEvent – shell:exec – no command', () => {
  const noCmdCfg: ShellConfig = { ...cfg, command: '' };

  it('emits shell:error when no command in config or payload', () => {
    const { node, ctx, emitted } = attachedNode();
    shellHandler.onEvent!(node, noCmdCfg, ctx, { type: 'shell:exec', payload: {} });
    expect(emitted.some((e) => e.type === 'shell:error')).toBe(true);
  });

  it('error payload contains descriptive message', () => {
    const { node, ctx, emitted } = attachedNode();
    shellHandler.onEvent!(node, noCmdCfg, ctx, { type: 'shell:exec', payload: {} });
    const err = emitted.find((e) => e.type === 'shell:error')!.payload as Record<string, unknown>;
    expect(typeof err.error).toBe('string');
    expect((err.error as string).length).toBeGreaterThan(0);
  });

  it('does not increment totalExecutions on error', () => {
    const { node, ctx } = attachedNode();
    shellHandler.onEvent!(node, noCmdCfg, ctx, { type: 'shell:exec', payload: {} });
    expect(getState(node).totalExecutions).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// onEvent – shell:exec – capabilities path
// ─────────────────────────────────────────────────────────────────────────────

describe('onEvent – shell:exec – capabilities path', () => {
  function makeCapCtx(
    result: unknown = { stdout: 'ok', stderr: '', code: 0, signal: null },
    rejectWith?: Error,
  ) {
    const emitted: Emitted = [];
    const exec = rejectWith
      ? vi.fn(() => Promise.reject(rejectWith))
      : vi.fn(() => Promise.resolve(result));
    const ctx = {
      emit: vi.fn((type: string, payload?: unknown) => {
        emitted.push({ type, payload });
        return 0;
      }),
      hostCapabilities: { process: { exec } },
    } as unknown as TraitContext;
    return { ctx, emitted, exec };
  }

  it('emits shell:start synchronously', () => {
    const { node } = attachedNode();
    const { ctx, emitted } = makeCapCtx();
    shellHandler.onEvent!(node, { ...cfg, command: 'echo' }, ctx, {
      type: 'shell:exec',
      payload: {},
    });
    expect(emitted.some((e) => e.type === 'shell:start')).toBe(true);
  });

  it('increments totalExecutions synchronously', () => {
    const { node } = attachedNode();
    const { ctx } = makeCapCtx();
    shellHandler.onEvent!(node, { ...cfg, command: 'echo' }, ctx, {
      type: 'shell:exec',
      payload: {},
    });
    expect(getState(node).totalExecutions).toBe(1);
  });

  it('emits shell:stdout after resolve when stdout is non-empty', async () => {
    const { node } = attachedNode();
    const { ctx, emitted } = makeCapCtx({ stdout: 'hello', stderr: '', code: 0, signal: null });
    shellHandler.onEvent!(node, { ...cfg, command: 'echo' }, ctx, {
      type: 'shell:exec',
      payload: {},
    });
    await new Promise((r) => setTimeout(r, 20));
    expect(emitted.some((e) => e.type === 'shell:stdout')).toBe(true);
    const out = emitted.find((e) => e.type === 'shell:stdout')!.payload as Record<string, unknown>;
    expect(out.data).toBe('hello');
  });

  it('emits shell:stderr after resolve when stderr is non-empty', async () => {
    const { node } = attachedNode();
    const { ctx, emitted } = makeCapCtx({ stdout: '', stderr: 'warn', code: 1, signal: null });
    shellHandler.onEvent!(node, { ...cfg, command: 'echo' }, ctx, {
      type: 'shell:exec',
      payload: {},
    });
    await new Promise((r) => setTimeout(r, 20));
    expect(emitted.some((e) => e.type === 'shell:stderr')).toBe(true);
  });

  it('does not emit shell:stdout when stdout is empty', async () => {
    const { node } = attachedNode();
    const { ctx, emitted } = makeCapCtx({ stdout: '', stderr: '', code: 0, signal: null });
    shellHandler.onEvent!(node, { ...cfg, command: 'echo' }, ctx, {
      type: 'shell:exec',
      payload: {},
    });
    await new Promise((r) => setTimeout(r, 20));
    expect(emitted.some((e) => e.type === 'shell:stdout')).toBe(false);
  });

  it('emits shell:exit with correct code after resolve', async () => {
    const { node } = attachedNode();
    const { ctx, emitted } = makeCapCtx({ stdout: '', stderr: '', code: 0, signal: null });
    shellHandler.onEvent!(node, { ...cfg, command: 'echo' }, ctx, {
      type: 'shell:exec',
      payload: {},
    });
    await new Promise((r) => setTimeout(r, 20));
    const exitEvt = emitted.find((e) => e.type === 'shell:exit')!.payload as Record<string, unknown>;
    expect(exitEvt.code).toBe(0);
    expect(typeof exitEvt.elapsed).toBe('number');
  });

  it('emits shell:error on promise rejection', async () => {
    const { node } = attachedNode();
    const { ctx, emitted } = makeCapCtx(undefined, new Error('exec failed'));
    shellHandler.onEvent!(node, { ...cfg, command: 'bad' }, ctx, {
      type: 'shell:exec',
      payload: {},
    });
    await new Promise((r) => setTimeout(r, 20));
    expect(emitted.some((e) => e.type === 'shell:error')).toBe(true);
  });

  it('adds a history entry after resolve', async () => {
    const { node } = attachedNode();
    const { ctx } = makeCapCtx({ stdout: '', stderr: '', code: 0, signal: null });
    shellHandler.onEvent!(node, { ...cfg, command: 'ls' }, ctx, {
      type: 'shell:exec',
      payload: {},
    });
    await new Promise((r) => setTimeout(r, 20));
    const state = getState(node);
    expect(state.history.length).toBe(1);
    expect(state.history[0].exitCode).toBe(0);
  });

  it('prefers payload.command over config.command', () => {
    const { node } = attachedNode();
    const { ctx, exec } = makeCapCtx();
    shellHandler.onEvent!(node, { ...cfg, command: 'config-cmd' }, ctx, {
      type: 'shell:exec',
      payload: { command: 'payload-cmd' },
    });
    expect(exec).toHaveBeenCalledWith('payload-cmd', expect.anything(), expect.anything());
  });

  it('passes merged env from config and payload', () => {
    const { node } = attachedNode();
    const { ctx, exec } = makeCapCtx();
    const envCfg: ShellConfig = { ...cfg, command: 'env', env: { CFG_VAR: '1' } };
    shellHandler.onEvent!(node, envCfg, ctx, {
      type: 'shell:exec',
      payload: { env: { PAYLOAD_VAR: '2' } },
    });
    const callOptions = exec.mock.calls[0][2] as Record<string, unknown>;
    const callEnv = callOptions.env as Record<string, string>;
    expect(callEnv.CFG_VAR).toBe('1');
    expect(callEnv.PAYLOAD_VAR).toBe('2');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// onEvent – shell:exec – spawn (child_process) path
// ─────────────────────────────────────────────────────────────────────────────

describe('onEvent – shell:exec – spawn path', () => {
  // No hostCapabilities → falls through to real child_process.spawn.
  // These tests run actual child processes; async variants use waitFor.

  it('emits shell:start with a valid process id', () => {
    const { node, ctx, emitted } = attachedNode();
    shellHandler.onEvent!(node, { ...cfg, command: 'echo' }, ctx, {
      type: 'shell:exec',
      payload: {},
    });
    expect(emitted.some((e) => e.type === 'shell:start')).toBe(true);
    const start = emitted.find((e) => e.type === 'shell:start')!.payload as Record<string, unknown>;
    expect(typeof start.pid).toBe('number');
    expect((start.pid as number) > 0).toBe(true);
    expect(start.command).toBe('echo');
  });

  it('increments totalExecutions', () => {
    const { node, ctx } = attachedNode();
    shellHandler.onEvent!(node, { ...cfg, command: 'echo' }, ctx, {
      type: 'shell:exec',
      payload: {},
    });
    expect(getState(node).totalExecutions).toBe(1);
  });

  it('adds process to activeProcesses', () => {
    const { node, ctx, emitted } = attachedNode();
    shellHandler.onEvent!(node, { ...cfg, command: 'echo' }, ctx, {
      type: 'shell:exec',
      payload: {},
    });
    const state = getState(node);
    expect(state.activeProcesses.size).toBe(1);
    const start = emitted.find((e) => e.type === 'shell:start')!.payload as Record<string, unknown>;
    expect(state.activeProcesses.has(start.pid as number)).toBe(true);
  });

  it('emits shell:stdout when stdout data arrives', async () => {
    const { node, ctx, emitted } = attachedNode();
    shellHandler.onEvent!(node, { ...cfg, command: 'echo', args: ['holoscript-out'] }, ctx, {
      type: 'shell:exec',
      payload: {},
    });
    await waitFor(() => expect(emitted.some((e) => e.type === 'shell:stdout')).toBe(true), {
      timeout: 5000,
    });
    const outEvt = emitted.find((e) => e.type === 'shell:stdout')!.payload as Record<string, unknown>;
    expect(String(outEvt.data)).toContain('holoscript-out');
    expect(typeof outEvt.pid).toBe('number');
  });

  it('emits shell:stderr when stderr data arrives', async () => {
    const { node, ctx, emitted } = attachedNode();
    shellHandler.onEvent!(
      node,
      { ...cfg, command: 'node', args: ['-e', "process.stderr.write('holoscript-err')"] },
      ctx,
      { type: 'shell:exec', payload: {} },
    );
    await waitFor(() => expect(emitted.some((e) => e.type === 'shell:stderr')).toBe(true), {
      timeout: 5000,
    });
    const errEvt = emitted.find((e) => e.type === 'shell:stderr')!.payload as Record<string, unknown>;
    expect(String(errEvt.data)).toContain('holoscript-err');
  });

  it('does not emit shell:stdout when capture_output is false', async () => {
    const { node, ctx, emitted } = attachedNode();
    const noCap: ShellConfig = { ...cfg, command: 'echo', args: ['ignored'], capture_output: false };
    shellHandler.onEvent!(node, noCap, ctx, { type: 'shell:exec', payload: {} });
    await waitFor(() => expect(getState(node).activeProcesses.size).toBe(0), { timeout: 5000 });
    expect(emitted.some((e) => e.type === 'shell:stdout')).toBe(false);
  });

  it('emits shell:exit on process close', async () => {
    const { node, ctx, emitted } = attachedNode();
    shellHandler.onEvent!(node, { ...cfg, command: 'echo', args: ['hello'] }, ctx, {
      type: 'shell:exec',
      payload: {},
    });
    await waitFor(() => expect(emitted.some((e) => e.type === 'shell:exit')).toBe(true), {
      timeout: 5000,
    });
    const exitEvt = emitted.find((e) => e.type === 'shell:exit')!.payload as Record<string, unknown>;
    expect(typeof exitEvt.pid).toBe('number');
    expect(exitEvt.code).toBe(0);
    expect(exitEvt.signal).toBeNull();
    expect(typeof exitEvt.elapsed).toBe('number');
  });

  it('removes process from activeProcesses on close', async () => {
    const { node, ctx } = attachedNode();
    shellHandler.onEvent!(node, { ...cfg, command: 'echo', args: ['hello'] }, ctx, {
      type: 'shell:exec',
      payload: {},
    });
    expect(getState(node).activeProcesses.size).toBe(1);
    await waitFor(() => expect(getState(node).activeProcesses.size).toBe(0), { timeout: 5000 });
  });

  it('adds history entry on close', async () => {
    const { node, ctx } = attachedNode();
    shellHandler.onEvent!(node, { ...cfg, command: 'echo', args: ['test'] }, ctx, {
      type: 'shell:exec',
      payload: {},
    });
    await waitFor(() => expect(getState(node).history.length).toBe(1), { timeout: 5000 });
    const entry = getState(node).history[0];
    expect(entry.exitCode).toBe(0);
    expect(entry.command).toContain('echo');
  });

  it('emits shell:error when spawn throws (invalid cwd)', async () => {
    const { node, ctx, emitted } = attachedNode();
    const badCfg: ShellConfig = {
      ...cfg,
      command: 'echo',
      cwd: '/zzz-holoscript-nonexistent-path-xyz-9999-abc',
    };
    shellHandler.onEvent!(node, badCfg, ctx, { type: 'shell:exec', payload: {} });
    await waitFor(() => expect(emitted.some((e) => e.type === 'shell:error')).toBe(true), {
      timeout: 5000,
    });
  });

  it('removes process from activeProcesses after spawn error', async () => {
    const { node, ctx } = attachedNode();
    const badCfg: ShellConfig = {
      ...cfg,
      command: 'echo',
      cwd: '/zzz-holoscript-nonexistent-path-xyz-9999-abc',
    };
    shellHandler.onEvent!(node, badCfg, ctx, { type: 'shell:exec', payload: {} });
    await waitFor(() => expect(getState(node).activeProcesses.size).toBe(0), { timeout: 5000 });
  });

  it('does not attach a timer when timeout_ms is 0', () => {
    const { node, ctx, emitted } = attachedNode();
    const noTimeoutCfg: ShellConfig = { ...cfg, command: 'echo', timeout_ms: 0 };
    shellHandler.onEvent!(node, noTimeoutCfg, ctx, { type: 'shell:exec', payload: {} });
    const start = emitted.find((e) => e.type === 'shell:start')!.payload as Record<string, unknown>;
    const proc = getState(node).activeProcesses.get(start.pid as number)!;
    expect(proc.timer).toBeNull();
  });

  it('emits shell:stdout events when max_output_bytes is set', async () => {
    const { node, ctx, emitted } = attachedNode();
    const limitCfg: ShellConfig = { ...cfg, command: 'echo', args: ['hello'], max_output_bytes: 1024 };
    shellHandler.onEvent!(node, limitCfg, ctx, { type: 'shell:exec', payload: {} });
    await waitFor(() => expect(emitted.some((e) => e.type === 'shell:stdout')).toBe(true), {
      timeout: 5000,
    });
    const outEvt = emitted.find((e) => e.type === 'shell:stdout')!.payload as Record<string, unknown>;
    expect(typeof outEvt.data).toBe('string');
  });

  it('caps history at 50 entries', async () => {
    const { node, ctx } = attachedNode();
    const state = getState(node);
    for (let i = 0; i < 50; i++) {
      state.history.push({ command: `cmd${i}`, exitCode: 0, elapsed: 1, timestamp: Date.now() });
    }
    expect(state.history.length).toBe(50);
    shellHandler.onEvent!(node, { ...cfg, command: 'echo' }, ctx, {
      type: 'shell:exec',
      payload: {},
    });
    await waitFor(() => expect(getState(node).activeProcesses.size).toBe(0), { timeout: 5000 });
    expect(state.history.length).toBe(50);
  });

  it('accumulates totalExecutions across multiple execs', () => {
    const { node, ctx } = attachedNode();
    const cmdCfg = { ...cfg, command: 'echo' };
    shellHandler.onEvent!(node, cmdCfg, ctx, { type: 'shell:exec', payload: {} });
    shellHandler.onEvent!(node, cmdCfg, ctx, { type: 'shell:exec', payload: {} });
    shellHandler.onEvent!(node, cmdCfg, ctx, { type: 'shell:exec', payload: {} });
    expect(getState(node).totalExecutions).toBe(3);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// onEvent – shell:get_status
// ─────────────────────────────────────────────────────────────────────────────

describe('onEvent – shell:get_status', () => {
  it('emits shell:status event', () => {
    const { node, ctx, emitted } = attachedNode();
    shellHandler.onEvent!(node, cfg, ctx, { type: 'shell:get_status', payload: {} });
    expect(emitted.some((e) => e.type === 'shell:status')).toBe(true);
  });

  it('reports zero active and zero executions on fresh node', () => {
    const { node, ctx, emitted } = attachedNode();
    shellHandler.onEvent!(node, cfg, ctx, { type: 'shell:get_status', payload: {} });
    const status = emitted.find((e) => e.type === 'shell:status')!.payload as Record<string, unknown>;
    expect(status.active).toBe(0);
    expect(status.totalExecutions).toBe(0);
    expect(status.history).toEqual([]);
  });

  it('reports correct totalExecutions after executions', () => {
    const { node, ctx, emitted } = attachedNode();
    // Two execs
    shellHandler.onEvent!(node, { ...cfg, command: 'echo' }, ctx, {
      type: 'shell:exec',
      payload: {},
    });
    shellHandler.onEvent!(node, { ...cfg, command: 'echo' }, ctx, {
      type: 'shell:exec',
      payload: {},
    });
    shellHandler.onEvent!(node, cfg, ctx, { type: 'shell:get_status', payload: {} });
    const status = emitted.find((e) => e.type === 'shell:status')!.payload as Record<string, unknown>;
    expect(status.totalExecutions).toBe(2);
  });

  it('returns only last 10 history entries', () => {
    const { node, ctx, emitted } = attachedNode();
    const state = getState(node);
    for (let i = 0; i < 15; i++) {
      state.history.push({ command: `cmd${i}`, exitCode: 0, elapsed: 1, timestamp: Date.now() });
    }
    shellHandler.onEvent!(node, cfg, ctx, { type: 'shell:get_status', payload: {} });
    const status = emitted.find((e) => e.type === 'shell:status')!.payload as Record<string, unknown>;
    expect((status.history as unknown[]).length).toBe(10);
  });

  it('reports correct active process count', () => {
    const { node, ctx, emitted } = attachedNode();
    shellHandler.onEvent!(node, { ...cfg, command: 'echo' }, ctx, {
      type: 'shell:exec',
      payload: {},
    });
    // Process is still active (no close event)
    shellHandler.onEvent!(node, cfg, ctx, { type: 'shell:get_status', payload: {} });
    const status = emitted.find((e) => e.type === 'shell:status')!.payload as Record<string, unknown>;
    expect(status.active).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// onEvent – shell:kill
// ─────────────────────────────────────────────────────────────────────────────

describe('onEvent – shell:kill', () => {
  it('does not throw for an unknown pid', () => {
    const { node, ctx } = attachedNode();
    expect(() =>
      shellHandler.onEvent!(node, cfg, ctx, {
        type: 'shell:kill',
        payload: { pid: 9999 },
      }),
    ).not.toThrow();
  });

  it('calls process.kill with SIGTERM for a known process', () => {
    const { node, ctx } = attachedNode();
    const state = getState(node);
    state.activeProcesses.set(100, {
      pid: 100,
      command: 'sleep',
      startedAt: Date.now(),
      stdout: '',
      stderr: '',
      timer: null,
    });
    const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => true as never);
    shellHandler.onEvent!(node, cfg, ctx, {
      type: 'shell:kill',
      payload: { pid: 100 },
    });
    expect(killSpy).toHaveBeenCalledWith(100, 'SIGTERM');
    killSpy.mockRestore();
  });

  it('uses a custom signal when provided', () => {
    const { node, ctx } = attachedNode();
    const state = getState(node);
    state.activeProcesses.set(200, {
      pid: 200,
      command: 'sleep',
      startedAt: Date.now(),
      stdout: '',
      stderr: '',
      timer: null,
    });
    const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => true as never);
    shellHandler.onEvent!(node, cfg, ctx, {
      type: 'shell:kill',
      payload: { pid: 200, signal: 'SIGKILL' },
    });
    expect(killSpy).toHaveBeenCalledWith(200, 'SIGKILL');
    killSpy.mockRestore();
  });

  it('clears the timer for the killed process', () => {
    const { node, ctx } = attachedNode();
    const state = getState(node);
    const timer = setTimeout(() => {}, 99999);
    state.activeProcesses.set(300, {
      pid: 300,
      command: 'sleep',
      startedAt: Date.now(),
      stdout: '',
      stderr: '',
      timer,
    });
    vi.spyOn(process, 'kill').mockImplementation(() => true as never);
    // Should not throw even when clearTimeout is called
    expect(() =>
      shellHandler.onEvent!(node, cfg, ctx, {
        type: 'shell:kill',
        payload: { pid: 300 },
      }),
    ).not.toThrow();
    vi.restoreAllMocks();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// defaultConfig
// ─────────────────────────────────────────────────────────────────────────────

describe('defaultConfig', () => {
  it('has the expected defaults', () => {
    const dc = shellHandler.defaultConfig!;
    expect(dc.timeout_ms).toBe(30000);
    expect(dc.capture_output).toBe(true);
    expect(dc.max_output_bytes).toBe(1024 * 1024);
    expect(dc.args).toEqual([]);
    expect(dc.env).toEqual({});
    expect(dc.command).toBe('');
  });

  it('handler name is "shell"', () => {
    expect(shellHandler.name).toBe('shell');
  });
});
