import { describe, it, expect, vi, beforeEach } from 'vitest';
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
} from '../simple-executors.js';

// Mock the logger so logger.info calls don't throw
vi.mock('../../logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// ── context helper ────────────────────────────────────────────────────────────

function makeCtx(overrides: Record<string, unknown> = {}) {
  return {
    stateMachines: new Map(),
    templates: new Map(),
    getEnvironment: vi.fn(() => ({ fog: 'none' })),
    setEnvironment: vi.fn(),
    focusHistory: [] as string[],
    executionStackDepth: vi.fn(() => 0),
    evaluateExpression: vi.fn((expr: unknown) => expr),
    callFunction: vi.fn(async () => ({ success: true, output: 'called' })),
    setVariable: vi.fn(),
    setScale: vi.fn(),
    getScale: vi.fn(() => ({ multiplier: 1, magnitude: 'x1' })),
    emit: vi.fn(),
    executeProgram: vi.fn(async () => [{ success: true, output: 'ok' }]),
    ...overrides,
  };
}

// ── executeStateMachine ───────────────────────────────────────────────────────

describe('executeStateMachine', () => {
  it('registers the node in the stateMachines map', async () => {
    const ctx = makeCtx();
    const node = { type: 'stateMachine', name: 'auth', states: [] } as unknown as Parameters<typeof executeStateMachine>[0];
    await executeStateMachine(node, ctx);
    expect(ctx.stateMachines.get('auth')).toBe(node);
  });

  it('returns success:true', async () => {
    const ctx = makeCtx();
    const node = { type: 'stateMachine', name: 'login', states: [] } as unknown as Parameters<typeof executeStateMachine>[0];
    const result = await executeStateMachine(node, ctx);
    expect(result.success).toBe(true);
  });

  it('returns registered name in output', async () => {
    const ctx = makeCtx();
    const node = { type: 'stateMachine', name: 'myFSM', states: [] } as unknown as Parameters<typeof executeStateMachine>[0];
    const result = await executeStateMachine(node, ctx);
    expect(result.output).toMatchObject({ registered: 'myFSM' });
  });
});

// ── executeExpressionStatement ────────────────────────────────────────────────

describe('executeExpressionStatement', () => {
  it('calls evaluateExpression with node.expression', async () => {
    const ctx = makeCtx();
    await executeExpressionStatement({ expression: 'x + 1' }, ctx);
    expect(ctx.evaluateExpression).toHaveBeenCalledWith('x + 1');
  });

  it('returns the evaluated value as output', async () => {
    const ctx = makeCtx({ evaluateExpression: vi.fn(() => 42) });
    const result = await executeExpressionStatement({ expression: '6 * 7' }, ctx);
    expect(result.output).toBe(42);
  });

  it('returns success:true', async () => {
    const ctx = makeCtx();
    const result = await executeExpressionStatement({ expression: 'foo' }, ctx);
    expect(result.success).toBe(true);
  });
});

// ── executeCall ───────────────────────────────────────────────────────────────

describe('executeCall', () => {
  it('calls callFunction with the target name', async () => {
    const ctx = makeCtx();
    await executeCall({ type: 'call', target: 'greet' }, ctx);
    expect(ctx.callFunction).toHaveBeenCalledWith('greet', []);
  });

  it('passes args to callFunction', async () => {
    const ctx = makeCtx();
    await executeCall({ type: 'call', target: 'add', args: [1, 2] }, ctx);
    expect(ctx.callFunction).toHaveBeenCalledWith('add', [1, 2]);
  });

  it('defaults to empty string target when target absent', async () => {
    const ctx = makeCtx();
    await executeCall({ type: 'call' }, ctx);
    expect(ctx.callFunction).toHaveBeenCalledWith('', []);
  });

  it('returns the callFunction result directly', async () => {
    const ctx = makeCtx({ callFunction: vi.fn(async () => ({ success: false, output: 'err' })) });
    const result = await executeCall({ type: 'call', target: 'fn' }, ctx);
    expect(result).toEqual({ success: false, output: 'err' });
  });
});

// ── executeEnvironment ────────────────────────────────────────────────────────

describe('executeEnvironment', () => {
  it('merges node.settings into current environment', async () => {
    const ctx = makeCtx({ getEnvironment: vi.fn(() => ({ fog: 'light' })) });
    await executeEnvironment({ type: 'environment', settings: { skybox: 'night' } } as unknown as Parameters<typeof executeEnvironment>[0], ctx);
    expect(ctx.setEnvironment).toHaveBeenCalledWith({ fog: 'light', skybox: 'night' });
  });

  it('preserves existing environment keys not in settings', async () => {
    const ctx = makeCtx({ getEnvironment: vi.fn(() => ({ fog: 'heavy', ambient: 0.5 })) });
    await executeEnvironment({ type: 'environment', settings: { gravity: 9.8 } } as unknown as Parameters<typeof executeEnvironment>[0], ctx);
    const arg = (ctx.setEnvironment as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(arg).toMatchObject({ fog: 'heavy', ambient: 0.5, gravity: 9.8 });
  });

  it('returns success:true', async () => {
    const ctx = makeCtx();
    const result = await executeEnvironment({ type: 'environment', settings: {} } as unknown as Parameters<typeof executeEnvironment>[0], ctx);
    expect(result.success).toBe(true);
  });

  it('returns "Environment updated" as output', async () => {
    const ctx = makeCtx();
    const result = await executeEnvironment({ type: 'environment', settings: {} } as unknown as Parameters<typeof executeEnvironment>[0], ctx);
    expect(result.output).toBe('Environment updated');
  });
});

// ── executeHoloTemplate ───────────────────────────────────────────────────────

describe('executeHoloTemplate', () => {
  it('registers the node by name in the templates map', async () => {
    const ctx = makeCtx();
    const node = { name: 'robot', geometry: 'cube' };
    await executeHoloTemplate(node, ctx);
    expect(ctx.templates.get('robot')).toBe(node);
  });

  it('returns success:true', async () => {
    const ctx = makeCtx();
    const result = await executeHoloTemplate({ name: 'hero' }, ctx);
    expect(result.success).toBe(true);
  });

  it('returns "Template <name> registered" as output', async () => {
    const ctx = makeCtx();
    const result = await executeHoloTemplate({ name: 'spaceship' }, ctx);
    expect(result.output).toBe('Template spaceship registered');
  });
});

// ── executeStructure ──────────────────────────────────────────────────────────

describe('executeStructure', () => {
  it('returns success:true', async () => {
    const result = await executeStructure({ type: 'nexus' } as unknown as Parameters<typeof executeStructure>[0]);
    expect(result.success).toBe(true);
  });

  it('includes node.type and created:true in output', async () => {
    const result = await executeStructure({ type: 'tower' } as unknown as Parameters<typeof executeStructure>[0]);
    expect(result.output).toMatchObject({ type: 'tower', created: true });
  });

  it('uses sphere hologram for nexus type', async () => {
    const result = await executeStructure({ type: 'nexus' } as unknown as Parameters<typeof executeStructure>[0]);
    expect(result.hologram!.shape).toBe('sphere');
    expect(result.hologram!.color).toBe('#9b59b6');
    expect(result.hologram!.size).toBe(3);
  });

  it('uses cube hologram for non-nexus types', async () => {
    const result = await executeStructure({ type: 'building' } as unknown as Parameters<typeof executeStructure>[0]);
    expect(result.hologram!.shape).toBe('cube');
    expect(result.hologram!.color).toBe('#e74c3c');
  });

  it('uses custom node.hologram when provided', async () => {
    const custom = { shape: 'torus', color: '#abcdef', size: 7, glow: false, interactive: false };
    const result = await executeStructure({ type: 'nexus', hologram: custom } as unknown as Parameters<typeof executeStructure>[0]);
    expect(result.hologram).toBe(custom);
  });

  it('passes node.position as spatialPosition', async () => {
    const position = [1, 2, 3];
    const result = await executeStructure({ type: 'nexus', position } as unknown as Parameters<typeof executeStructure>[0]);
    expect(result.spatialPosition).toBe(position);
  });
});

// ── executeAssignment ─────────────────────────────────────────────────────────

describe('executeAssignment', () => {
  it('evaluates the value expression', async () => {
    const ctx = makeCtx({ evaluateExpression: vi.fn(() => 99) });
    await executeAssignment({ type: 'assignment', name: 'counter', value: '99' } as unknown as Parameters<typeof executeAssignment>[0], ctx);
    expect(ctx.evaluateExpression).toHaveBeenCalledWith('99');
  });

  it('calls setVariable with the evaluated value', async () => {
    const ctx = makeCtx({ evaluateExpression: vi.fn(() => 'hello') });
    await executeAssignment({ type: 'assignment', name: 'msg', value: 'hello' } as unknown as Parameters<typeof executeAssignment>[0], ctx);
    expect(ctx.setVariable).toHaveBeenCalledWith('msg', 'hello');
  });

  it('returns success:true', async () => {
    const ctx = makeCtx();
    const result = await executeAssignment({ type: 'assignment', name: 'x', value: '1' } as unknown as Parameters<typeof executeAssignment>[0], ctx);
    expect(result.success).toBe(true);
  });

  it('includes assigned name and value in output', async () => {
    const ctx = makeCtx({ evaluateExpression: vi.fn(() => 42) });
    const result = await executeAssignment({ type: 'assignment', name: 'score', value: '42' } as unknown as Parameters<typeof executeAssignment>[0], ctx);
    expect(result.output).toMatchObject({ assigned: 'score', value: 42 });
  });
});

// ── executeReturn ─────────────────────────────────────────────────────────────

describe('executeReturn', () => {
  it('evaluates node.value when present', async () => {
    const ctx = makeCtx({ evaluateExpression: vi.fn(() => 10) });
    await executeReturn({ type: 'return', value: 10 } as unknown as Parameters<typeof executeReturn>[0], ctx);
    expect(ctx.evaluateExpression).toHaveBeenCalledWith('10');
  });

  it('falls back to node.expression when value is absent', async () => {
    const ctx = makeCtx({ evaluateExpression: vi.fn((e: unknown) => e) });
    await executeReturn({ type: 'return', expression: 'x * 2' } as unknown as Parameters<typeof executeReturn>[0], ctx);
    expect(ctx.evaluateExpression).toHaveBeenCalledWith('x * 2');
  });

  it('evaluates empty string when both value and expression absent', async () => {
    const ctx = makeCtx();
    await executeReturn({ type: 'return' } as unknown as Parameters<typeof executeReturn>[0], ctx);
    expect(ctx.evaluateExpression).toHaveBeenCalledWith('');
  });

  it('returns success:true', async () => {
    const ctx = makeCtx();
    const result = await executeReturn({ type: 'return', value: 1 } as unknown as Parameters<typeof executeReturn>[0], ctx);
    expect(result.success).toBe(true);
  });

  it('returns the evaluated value as output', async () => {
    const ctx = makeCtx({ evaluateExpression: vi.fn(() => 'result') });
    const result = await executeReturn({ type: 'return', value: 'x' } as unknown as Parameters<typeof executeReturn>[0], ctx);
    expect(result.output).toBe('result');
  });
});

// ── executeScale ──────────────────────────────────────────────────────────────

describe('executeScale', () => {
  it('sets scale to parent * node.multiplier', async () => {
    const ctx = makeCtx({ getScale: vi.fn(() => ({ multiplier: 2, magnitude: 'x2' })) });
    await executeScale({ type: 'scale', multiplier: 3, magnitude: 'x6', body: [] } as unknown as Parameters<typeof executeScale>[0], ctx);
    expect(ctx.setScale).toHaveBeenCalledWith(6, 'x6');
  });

  it('emits scale:change on entry with new scale values', async () => {
    const ctx = makeCtx({ getScale: vi.fn(() => ({ multiplier: 1, magnitude: 'x1' })) });
    await executeScale({ type: 'scale', multiplier: 4, magnitude: 'x4', body: [] } as unknown as Parameters<typeof executeScale>[0], ctx);
    expect(ctx.emit).toHaveBeenCalledWith('scale:change', expect.objectContaining({ multiplier: 4, magnitude: 'x4' }));
  });

  it('executes the body program', async () => {
    const ctx = makeCtx();
    const body = [{ type: 'print' }];
    await executeScale({ type: 'scale', multiplier: 1, magnitude: 'x1', body } as unknown as Parameters<typeof executeScale>[0], ctx);
    expect(ctx.executeProgram).toHaveBeenCalledWith(body, expect.any(Number));
  });

  it('restores parent scale after body execution', async () => {
    const parent = { multiplier: 2, magnitude: 'x2' };
    const ctx = makeCtx({ getScale: vi.fn(() => parent) });
    await executeScale({ type: 'scale', multiplier: 3, magnitude: 'x6', body: [] } as unknown as Parameters<typeof executeScale>[0], ctx);
    const calls = (ctx.setScale as ReturnType<typeof vi.fn>).mock.calls;
    const lastSetScale = calls[calls.length - 1];
    expect(lastSetScale).toEqual([2, 'x2']);
  });

  it('emits scale:change on exit with parent multiplier', async () => {
    const ctx = makeCtx({ getScale: vi.fn(() => ({ multiplier: 1, magnitude: 'x1' })) });
    await executeScale({ type: 'scale', multiplier: 2, magnitude: 'x2', body: [] } as unknown as Parameters<typeof executeScale>[0], ctx);
    const emitCalls = (ctx.emit as ReturnType<typeof vi.fn>).mock.calls;
    const exitEmit = emitCalls[emitCalls.length - 1];
    expect(exitEmit[1]).toMatchObject({ multiplier: 1 });
  });

  it('returns success:true when all body results succeed', async () => {
    const ctx = makeCtx({ executeProgram: vi.fn(async () => [{ success: true }, { success: true }]) });
    const result = await executeScale({ type: 'scale', multiplier: 1, magnitude: 'x1', body: [] } as unknown as Parameters<typeof executeScale>[0], ctx);
    expect(result.success).toBe(true);
  });

  it('returns success:false when any body result fails', async () => {
    const ctx = makeCtx({ executeProgram: vi.fn(async () => [{ success: true }, { success: false }]) });
    const result = await executeScale({ type: 'scale', multiplier: 1, magnitude: 'x1', body: [] } as unknown as Parameters<typeof executeScale>[0], ctx);
    expect(result.success).toBe(false);
  });

  it('output describes the scale magnitude', async () => {
    const ctx = makeCtx();
    const result = await executeScale({ type: 'scale', multiplier: 5, magnitude: 'x5', body: [] } as unknown as Parameters<typeof executeScale>[0], ctx);
    expect(result.output).toBe('Executed scale block: x5');
  });
});

// ── executeComposition ────────────────────────────────────────────────────────

describe('executeComposition', () => {
  it('executes flat children when no body', async () => {
    const ctx = makeCtx();
    const children = [{ type: 'print' }];
    await executeComposition({ type: 'composition', name: 'test', children } as unknown as Parameters<typeof executeComposition>[0], ctx);
    expect(ctx.executeProgram).toHaveBeenCalledWith(children, expect.any(Number));
  });

  it('executes body.systems, body.configs, body.children when body present', async () => {
    const ctx = makeCtx();
    const body = { systems: [{ type: 'sys' }], configs: [{ type: 'cfg' }], children: [{ type: 'child' }] };
    await executeComposition({ type: 'composition', name: 'app', body } as unknown as Parameters<typeof executeComposition>[0], ctx);
    expect(ctx.executeProgram).toHaveBeenCalledTimes(3);
  });

  it('returns success:true when all results pass (body path)', async () => {
    const ctx = makeCtx({ executeProgram: vi.fn(async () => [{ success: true }]) });
    const result = await executeComposition({ type: 'composition', name: 'c', body: { systems: [], configs: [], children: [] } } as unknown as Parameters<typeof executeComposition>[0], ctx);
    expect(result.success).toBe(true);
  });

  it('returns success:false when any result fails (body path)', async () => {
    let call = 0;
    const ctx = makeCtx({ executeProgram: vi.fn(async () => call++ === 1 ? [{ success: false }] : [{ success: true }]) });
    const result = await executeComposition({ type: 'composition', name: 'c', body: { systems: [{}], configs: [{}], children: [] } } as unknown as Parameters<typeof executeComposition>[0], ctx);
    expect(result.success).toBe(false);
  });

  it('returns success:true for flat children when all pass', async () => {
    const ctx = makeCtx({ executeProgram: vi.fn(async () => [{ success: true }]) });
    const result = await executeComposition({ type: 'composition', name: 'flat', children: [{}] } as unknown as Parameters<typeof executeComposition>[0], ctx);
    expect(result.success).toBe(true);
  });
});

// ── executeFocus ──────────────────────────────────────────────────────────────

describe('executeFocus', () => {
  it('pushes the focus target onto focusHistory', async () => {
    const ctx = makeCtx();
    await executeFocus({ type: 'focus', target: 'hero', body: [] } as unknown as Parameters<typeof executeFocus>[0], ctx);
    expect(ctx.focusHistory).toContain('hero');
  });

  it('executes the body program', async () => {
    const ctx = makeCtx();
    const body = [{ type: 'move' }];
    await executeFocus({ type: 'focus', target: 'hero', body } as unknown as Parameters<typeof executeFocus>[0], ctx);
    expect(ctx.executeProgram).toHaveBeenCalledWith(body, expect.any(Number));
  });

  it('returns success:true when all body results pass', async () => {
    const ctx = makeCtx({ executeProgram: vi.fn(async () => [{ success: true }]) });
    const result = await executeFocus({ type: 'focus', target: 'hero', body: [] } as unknown as Parameters<typeof executeFocus>[0], ctx);
    expect(result.success).toBe(true);
  });

  it('returns success:false when any body result fails', async () => {
    const ctx = makeCtx({ executeProgram: vi.fn(async () => [{ success: false }]) });
    const result = await executeFocus({ type: 'focus', target: 'hero', body: [] } as unknown as Parameters<typeof executeFocus>[0], ctx);
    expect(result.success).toBe(false);
  });

  it('output mentions the focus target', async () => {
    const ctx = makeCtx();
    const result = await executeFocus({ type: 'focus', target: 'dragon', body: [] } as unknown as Parameters<typeof executeFocus>[0], ctx);
    expect(result.output).toBe('Focused on dragon');
  });
});
