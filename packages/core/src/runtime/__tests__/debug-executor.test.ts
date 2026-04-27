import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DEBUG_HOLOGRAM, executeDebug } from '../debug-executor.js';

// ── helpers ─────────────────────────────────────────────────────────────────

function makeCtx(overrides: Partial<{
  scopeVariables: Map<string, unknown>;
  contextVariables: Map<string, unknown>;
  functions: Map<string, unknown>;
  connections: unknown[];
  callStack: string[];
  uiElements: Map<string, unknown>;
  animations: Map<string, unknown>;
  executionHistory: { success: boolean; output: unknown }[];
  setHologramState: ReturnType<typeof vi.fn>;
  logInfo: ReturnType<typeof vi.fn>;
}> = {}) {
  return {
    scopeVariables: overrides.scopeVariables ?? new Map([['x', 1], ['y', 2]]),
    contextVariables: overrides.contextVariables ?? new Map([['$time', '10:00']]),
    functions: overrides.functions ?? new Map([['greet', vi.fn()], ['add', vi.fn()]]),
    connections: overrides.connections ?? ['conn-a', 'conn-b', 'conn-c'],
    callStack: overrides.callStack ?? ['main', 'inner'],
    uiElements: overrides.uiElements ?? new Map([['btn', {}], ['input', {}]]),
    animations: overrides.animations ?? new Map([['spin', {}]]),
    executionHistory: overrides.executionHistory ?? [{ success: true, output: 'ok' }],
    setHologramState: overrides.setHologramState ?? vi.fn(),
    logInfo: overrides.logInfo ?? vi.fn(),
  };
}

// ── DEBUG_HOLOGRAM ───────────────────────────────────────────────────────────

describe('DEBUG_HOLOGRAM', () => {
  it('is a pyramid shape', () => {
    expect(DEBUG_HOLOGRAM.shape).toBe('pyramid');
  });

  it('has the correct debug color', () => {
    expect(DEBUG_HOLOGRAM.color).toBe('#ff1493');
  });

  it('has size 0.8', () => {
    expect(DEBUG_HOLOGRAM.size).toBe(0.8);
  });

  it('has glow enabled', () => {
    expect(DEBUG_HOLOGRAM.glow).toBe(true);
  });

  it('is interactive', () => {
    expect(DEBUG_HOLOGRAM.interactive).toBe(true);
  });
});

// ── executeDebug ─────────────────────────────────────────────────────────────

describe('executeDebug', () => {
  let ctx: ReturnType<typeof makeCtx>;

  beforeEach(() => {
    ctx = makeCtx();
  });

  // return value ──────────────────────────────────────────────────────────────

  it('always returns success:true', async () => {
    const result = await executeDebug({ type: 'debug' }, ctx);
    expect(result.success).toBe(true);
  });

  it('attaches a hologram to the result', async () => {
    const result = await executeDebug({ type: 'debug' }, ctx);
    expect(result.hologram).toBeDefined();
    expect(result.hologram!.shape).toBe('pyramid');
  });

  // snapshot fields ───────────────────────────────────────────────────────────

  it('includes scopeVariables as plain object in output', async () => {
    const result = await executeDebug({ type: 'debug' }, ctx);
    expect((result.output as Record<string, unknown>).variables).toMatchObject({ x: 1, y: 2 });
  });

  it('includes contextVariables as plain object in output', async () => {
    const result = await executeDebug({ type: 'debug' }, ctx);
    expect((result.output as Record<string, unknown>).contextVariables).toMatchObject({ '$time': '10:00' });
  });

  it('includes function keys as an array in output', async () => {
    const result = await executeDebug({ type: 'debug' }, ctx);
    expect((result.output as Record<string, unknown>).functions).toEqual(expect.arrayContaining(['greet', 'add']));
  });

  it('reports connection count (not the array itself)', async () => {
    const result = await executeDebug({ type: 'debug' }, ctx);
    expect((result.output as Record<string, unknown>).connections).toBe(3);
  });

  it('includes a copy of the call stack', async () => {
    const result = await executeDebug({ type: 'debug' }, ctx);
    expect((result.output as Record<string, unknown>).callStack).toEqual(['main', 'inner']);
  });

  it('includes uiElement keys as an array', async () => {
    const result = await executeDebug({ type: 'debug' }, ctx);
    expect((result.output as Record<string, unknown>).uiElements).toEqual(expect.arrayContaining(['btn', 'input']));
  });

  it('includes animation keys as an array', async () => {
    const result = await executeDebug({ type: 'debug' }, ctx);
    expect((result.output as Record<string, unknown>).animations).toEqual(['spin']);
  });

  it('limits executionHistory to last 10 entries', async () => {
    const history = Array.from({ length: 15 }, (_, i) => ({ success: true, output: i }));
    const ctx15 = makeCtx({ executionHistory: history });
    const result = await executeDebug({ type: 'debug' }, ctx15);
    const snap = (result.output as Record<string, unknown>).executionHistory as unknown[];
    expect(snap).toHaveLength(10);
    // last 10 — entries 5..14
    expect((snap[0] as Record<string, unknown>).output).toBe(5);
  });

  it('includes all history when fewer than 10 entries', async () => {
    const result = await executeDebug({ type: 'debug' }, ctx);
    const snap = (result.output as Record<string, unknown>).executionHistory as unknown[];
    expect(snap).toHaveLength(1);
  });

  // hologram key ──────────────────────────────────────────────────────────────

  it('calls setHologramState with key "debug_program" when target absent', async () => {
    await executeDebug({ type: 'debug' }, ctx);
    expect(ctx.setHologramState).toHaveBeenCalledWith('debug_program', expect.objectContaining({ shape: 'pyramid' }));
  });

  it('calls setHologramState with key "debug_<target>" when target provided', async () => {
    await executeDebug({ type: 'debug', target: 'hero' }, ctx);
    expect(ctx.setHologramState).toHaveBeenCalledWith('debug_hero', expect.any(Object));
  });

  it('calls setHologramState exactly once', async () => {
    await executeDebug({ type: 'debug' }, ctx);
    expect(ctx.setHologramState).toHaveBeenCalledTimes(1);
  });

  // logging ───────────────────────────────────────────────────────────────────

  it('calls logInfo with "Debug info"', async () => {
    await executeDebug({ type: 'debug' }, ctx);
    expect(ctx.logInfo).toHaveBeenCalledWith('Debug info', expect.any(Object));
  });

  it('calls logInfo exactly once', async () => {
    await executeDebug({ type: 'debug' }, ctx);
    expect(ctx.logInfo).toHaveBeenCalledTimes(1);
  });

  // immutability of DEBUG_HOLOGRAM ────────────────────────────────────────────

  it('does not mutate the module-level DEBUG_HOLOGRAM constant', async () => {
    const originalShape = DEBUG_HOLOGRAM.shape;
    await executeDebug({ type: 'debug' }, ctx);
    const passedHologram = ctx.setHologramState.mock.calls[0][1] as Record<string, unknown>;
    // mutate what was passed — the constant must be unaffected
    passedHologram.shape = 'mutated';
    expect(DEBUG_HOLOGRAM.shape).toBe(originalShape);
  });

  // empty state edge cases ────────────────────────────────────────────────────

  it('handles empty maps and arrays gracefully', async () => {
    const empty = makeCtx({
      scopeVariables: new Map(),
      contextVariables: new Map(),
      functions: new Map(),
      connections: [],
      callStack: [],
      uiElements: new Map(),
      animations: new Map(),
      executionHistory: [],
    });
    const result = await executeDebug({ type: 'debug' }, empty);
    expect(result.success).toBe(true);
    expect((result.output as Record<string, unknown>).connections).toBe(0);
  });
});
