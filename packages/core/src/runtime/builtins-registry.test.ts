/**
 * Unit tests for builtins-registry — BUILD-mode validation of Q2
 * (characterization-as-deterministic-projection family).
 *
 * The addendum at research/2026-04-23_monolith-split-followup-open-questions.md §Q2
 * hypothesized that characterization-lock generalizes to async/stateful
 * subsystems as a FAMILY of 5 techniques, with HSR's harness being a
 * null-witness special case of technique (e) witness-based.
 *
 * This file provides BUILD-mode corroboration by writing characterization
 * tests on genuinely-async builtins — demonstrating technique (a)
 * deterministic scheduler (vitest fake-timers) and technique (e)
 * witness-based (log + replay semantics).
 *
 * Scope:
 *   - Sync builtins (math, string, array, type-check) — baseline coverage.
 *   - ASYNC builtins (wait, sleep, think) — Q2 technique validation.
 *   - spawn — async with template lookup + child executeOrb.
 *   - Registry structure: custom-function override, later-write-wins.
 *
 * **See**: packages/core/src/runtime/builtins-registry.ts (slice 28)
 *         research/2026-04-23_monolith-split-followup-open-questions.md §Q2
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createBuiltinsMap,
  type BuiltinsContext,
} from './builtins-registry';
import type {
  AgentRuntime,
  Animation,
  ExecutionResult,
  HoloScriptValue,
  HoloTemplate,
  HologramProperties,
  OrbNode,
  ParticleSystem,
  SpatialPosition,
  TemplateNode,
  UIElementState,
} from '../types';

// ──────────────────────────────────────────────────────────────────
// Test-context factory
// ──────────────────────────────────────────────────────────────────

function makeCtx(overrides: Partial<BuiltinsContext> = {}): BuiltinsContext {
  return {
    uiElements: new Map<string, UIElementState>(),
    hologramState: new Map<string, HologramProperties>(),
    spatialMemory: new Map<string, SpatialPosition>(),
    animations: new Map<string, Animation>(),
    variables: new Map<string, HoloScriptValue>(),
    templates: new Map<string, TemplateNode>(),
    executionStack: [],
    agentRuntimes: new Map<string, AgentRuntime>(),
    createParticleEffect: vi.fn(),
    createConnectionStream: vi.fn(),
    emit: vi.fn(),
    setVariable: vi.fn(),
    getVariable: vi.fn(() => undefined),
    executeOrb: vi.fn(async () => ({ success: true, output: 'stub-orb' }) as ExecutionResult),
    calculateArc: vi.fn((_args: HoloScriptValue[]) => [0, 0, 0] as HoloScriptValue),
    ...overrides,
  };
}

// ──────────────────────────────────────────────────────────────────
// Registry structure
// ──────────────────────────────────────────────────────────────────

describe('createBuiltinsMap — registry structure', () => {
  it('returns a Map of handler functions', () => {
    const builtins = createBuiltinsMap(makeCtx());
    expect(builtins).toBeInstanceOf(Map);
    expect(builtins.size).toBeGreaterThan(30);
  });

  it('custom functions are injected first (overridden by builtins on conflict)', () => {
    const customShow = vi.fn(() => 'custom' as HoloScriptValue);
    const builtins = createBuiltinsMap(makeCtx(), { show: customShow });
    // 'show' is a registered builtin — builtin wins (last-write).
    const handler = builtins.get('show')!;
    handler(['target']);
    expect(customShow).not.toHaveBeenCalled();
  });

  it('custom functions with non-conflicting names are registered', () => {
    const custom = vi.fn(() => 'unique' as HoloScriptValue);
    const builtins = createBuiltinsMap(makeCtx(), { 'my-custom': custom });
    const handler = builtins.get('my-custom')!;
    expect(handler([])).toBe('unique');
  });

  it('documented override: print has two registrations, last wins', () => {
    // builtins-registry.ts registers 'print' twice (L364 + L382). The
    // second wins — documented last-write-wins behavior.
    const builtins = createBuiltinsMap(makeCtx());
    const handler = builtins.get('print')!;
    const result = handler(['a', 'b']);
    // The second registration returns the joined message string, not
    // the { printed: '...' } envelope from the first.
    expect(typeof result).toBe('string');
    expect(result).toBe('a b');
  });
});

// ──────────────────────────────────────────────────────────────────
// Math / string / array — sync baseline
// ──────────────────────────────────────────────────────────────────

describe('math builtins', () => {
  it('add / subtract / multiply / divide / mod', () => {
    const b = createBuiltinsMap(makeCtx());
    expect(b.get('add')!([2, 3])).toBe(5);
    expect(b.get('subtract')!([10, 4])).toBe(6);
    expect(b.get('multiply')!([3, 4])).toBe(12);
    expect(b.get('divide')!([20, 5])).toBe(4);
    expect(b.get('mod')!([10, 3])).toBe(1);
  });

  it('divide by zero returns 0 (not Infinity)', () => {
    const b = createBuiltinsMap(makeCtx());
    expect(b.get('divide')!([5, 0])).toBe(0);
  });

  it('min / max accept spread arguments', () => {
    const b = createBuiltinsMap(makeCtx());
    expect(b.get('min')!([3, 1, 2, 5, 4])).toBe(1);
    expect(b.get('max')!([3, 1, 2, 5, 4])).toBe(5);
  });

  it('abs / floor / ceil / round', () => {
    const b = createBuiltinsMap(makeCtx());
    expect(b.get('abs')!([-5])).toBe(5);
    expect(b.get('floor')!([3.7])).toBe(3);
    expect(b.get('ceil')!([3.2])).toBe(4);
    expect(b.get('round')!([3.5])).toBe(4);
  });

  it('random returns [0,1) — type check only, not value', () => {
    const b = createBuiltinsMap(makeCtx());
    const r = b.get('random')!([]);
    expect(typeof r).toBe('number');
    expect(r).toBeGreaterThanOrEqual(0);
    expect(r).toBeLessThan(1);
  });
});

describe('string builtins', () => {
  it('concat joins string-coerced args', () => {
    const b = createBuiltinsMap(makeCtx());
    expect(b.get('concat')!(['a', 'b', 'c'])).toBe('abc');
    expect(b.get('concat')!([1, 2, 3])).toBe('123');
  });

  it('length of string vs array vs other', () => {
    const b = createBuiltinsMap(makeCtx());
    expect(b.get('length')!(['hello'])).toBe(5);
    expect(b.get('length')!([[1, 2, 3]])).toBe(3);
    expect(b.get('length')!([42])).toBe(0);
  });

  it('substring / uppercase / lowercase', () => {
    const b = createBuiltinsMap(makeCtx());
    expect(b.get('substring')!(['hello', 1, 4])).toBe('ell');
    expect(b.get('uppercase')!(['abc'])).toBe('ABC');
    expect(b.get('lowercase')!(['ABC'])).toBe('abc');
  });
});

describe('array builtins — push/pop/at', () => {
  it('push mutates array and returns it', () => {
    const b = createBuiltinsMap(makeCtx());
    const arr = [1, 2];
    const result = b.get('push')!([arr, 3]);
    expect(arr).toEqual([1, 2, 3]);
    expect(result).toBe(arr);
  });

  it('push on non-array returns new [first, second] pair', () => {
    const b = createBuiltinsMap(makeCtx());
    expect(b.get('push')!(['not-array', 'x'])).toEqual(['not-array', 'x']);
  });

  it('pop returns last element (mutates)', () => {
    const b = createBuiltinsMap(makeCtx());
    const arr = [1, 2, 3];
    expect(b.get('pop')!([arr])).toBe(3);
    expect(arr).toEqual([1, 2]);
  });

  it('at returns element at index', () => {
    const b = createBuiltinsMap(makeCtx());
    expect(b.get('at')!([[10, 20, 30], 1])).toBe(20);
  });
});

describe('type-check builtins', () => {
  it('typeof / isArray / isNumber / isString', () => {
    const b = createBuiltinsMap(makeCtx());
    expect(b.get('typeof')!([42])).toBe('number');
    expect(b.get('isArray')!([[1, 2]])).toBe(true);
    expect(b.get('isArray')!(['string'])).toBe(false);
    expect(b.get('isNumber')!([42])).toBe(true);
    expect(b.get('isNumber')!([NaN])).toBe(false); // NaN explicitly excluded
    expect(b.get('isString')!(['hi'])).toBe(true);
  });
});

// ──────────────────────────────────────────────────────────────────
// ASYNC BUILTINS — Q2 VALIDATION: technique (a) deterministic
// scheduler via vitest fake-timers.
// ──────────────────────────────────────────────────────────────────

describe('async builtins — technique (a) deterministic scheduler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('wait(ms) resolves after exactly ms elapsed on fake timer', async () => {
    const b = createBuiltinsMap(makeCtx());
    const promise = b.get('wait')!([500]);
    let resolved = false;
    (promise as Promise<HoloScriptValue>).then(() => {
      resolved = true;
    });

    // Before advancing: not resolved
    await vi.advanceTimersByTimeAsync(499);
    expect(resolved).toBe(false);

    // Advance past threshold: resolved
    await vi.advanceTimersByTimeAsync(1);
    expect(resolved).toBe(true);

    const result = await promise;
    expect(result).toEqual({ waited: 500 });
  });

  it('wait(0) resolves on next tick (edge case)', async () => {
    const b = createBuiltinsMap(makeCtx());
    const promise = b.get('wait')!([0]);
    await vi.advanceTimersByTimeAsync(0);
    expect(await promise).toEqual({ waited: 0 });
  });

  it('wait(non-numeric) coerces to 0', async () => {
    const b = createBuiltinsMap(makeCtx());
    const promise = b.get('wait')!(['not-a-number']);
    await vi.advanceTimersByTimeAsync(0);
    expect(await promise).toEqual({ waited: 0 });
  });

  it('sleep mirrors wait but returns undefined', async () => {
    const b = createBuiltinsMap(makeCtx());
    const promise = b.get('sleep')!([200]);
    let resolved = false;
    (promise as Promise<HoloScriptValue>).then(() => {
      resolved = true;
    });

    await vi.advanceTimersByTimeAsync(199);
    expect(resolved).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(resolved).toBe(true);
  });

  it('characterization: parallel waits resolve in duration order (deterministic under fake timers)', async () => {
    const b = createBuiltinsMap(makeCtx());
    const witness: string[] = [];

    // Three concurrent waits; record order of completion
    const w = (ms: number, label: string) =>
      (b.get('wait')!([ms]) as Promise<HoloScriptValue>).then(() => {
        witness.push(label);
      });

    void w(300, 'C');
    void w(100, 'A');
    void w(200, 'B');

    await vi.advanceTimersByTimeAsync(350);

    // Under real clock this order COULD flake. Under fake timers it's
    // deterministic: witness MUST be [A, B, C].
    expect(witness).toEqual(['A', 'B', 'C']);
  });
});

// ──────────────────────────────────────────────────────────────────
// ASYNC BUILTIN — Q2 VALIDATION: technique (e) witness-based for
// think(). The non-determinism is "which agentRuntime is returned";
// witness is the stack-top snapshot at invocation.
// ──────────────────────────────────────────────────────────────────

describe('think — technique (e) witness-based', () => {
  it('with no active node on stack → returns "No context"', async () => {
    const b = createBuiltinsMap(makeCtx({ executionStack: [] }));
    const result = await (b.get('think')!(['hello']) as Promise<HoloScriptValue>);
    expect(result).toBe('No context');
  });

  it('with active node but no agent runtime for that name → "Thinking only available for agents."', async () => {
    const ctx = makeCtx({
      executionStack: [{ name: 'NonAgent', type: 'orb' }],
      agentRuntimes: new Map(),
    });
    const b = createBuiltinsMap(ctx);
    const result = await (b.get('think')!(['prompt']) as Promise<HoloScriptValue>);
    expect(result).toBe('Thinking only available for agents.');
  });

  it('with active agent on stack → delegates to agentRuntime.think', async () => {
    const agentRuntime = { think: vi.fn(async (q: string) => `ANS: ${q}`) };
    const ctx = makeCtx({
      executionStack: [{ name: 'Alice', type: 'orb' }],
      agentRuntimes: new Map([['Alice', agentRuntime as unknown as AgentRuntime]]),
    });
    const b = createBuiltinsMap(ctx);
    const result = await (b.get('think')!(['what is time?']) as Promise<HoloScriptValue>);
    expect(agentRuntime.think).toHaveBeenCalledWith('what is time?');
    expect(result).toBe('ANS: what is time?');
  });

  it('witness-based replay — same stack + same agent produces same result', async () => {
    // Technique (e) proof: capture the witness (stack top + agent map),
    // replay twice, verify identical outputs.
    const agentRuntime = {
      think: vi.fn(async (q: string) => `deterministic-answer-to:${q}`),
    };
    const witness = {
      executionStack: [{ name: 'Echo', type: 'orb' }],
      agentRuntimes: new Map([['Echo', agentRuntime as unknown as AgentRuntime]]),
    };

    const b1 = createBuiltinsMap(makeCtx(witness));
    const b2 = createBuiltinsMap(makeCtx(witness));
    const r1 = await (b1.get('think')!(['ping']) as Promise<HoloScriptValue>);
    const r2 = await (b2.get('think')!(['ping']) as Promise<HoloScriptValue>);
    expect(r1).toBe(r2); // deterministic projection under witness
  });
});

// ──────────────────────────────────────────────────────────────────
// ASYNC BUILTIN — spawn (mitosis): combines template lookup, child
// orb construction, async executeOrb delegate, + optional mitosis events.
// ──────────────────────────────────────────────────────────────────

describe('spawn — async with template + child executeOrb', () => {
  it('legacy signature (name, position) creates particle effect + returns spawned record', async () => {
    const ctx = makeCtx();
    const b = createBuiltinsMap(ctx);
    const result = await (b.get('spawn')!([
      'enemy',
      [10, 0, 0],
    ]) as Promise<HoloScriptValue>);
    expect(ctx.spatialMemory.get('enemy')).toEqual([10, 0, 0]);
    expect(ctx.createParticleEffect).toHaveBeenCalledWith(
      'enemy_spawn', [10, 0, 0], '#00ff00', 25,
    );
    expect(result).toEqual({ spawned: 'enemy', at: [10, 0, 0] });
  });

  it('config signature — template not found returns error record', async () => {
    const ctx = makeCtx();
    const b = createBuiltinsMap(ctx);
    const result = await (b.get('spawn')!([
      { template: 'missing-tpl' },
    ]) as Promise<HoloScriptValue>);
    expect(result).toEqual({ error: 'Template missing-tpl not found' });
    expect(ctx.executeOrb).not.toHaveBeenCalled();
  });

  it('config signature — with parent emits mitosis_spawned events', async () => {
    const tpl = {
      name: 'child',
      children: [],
      traits: new Map(),
      directives: [],
      state: undefined,
      properties: [],
    } as unknown as HoloTemplate;
    const ctx = makeCtx();
    ctx.templates.set('child', tpl as unknown as TemplateNode);

    const b = createBuiltinsMap(ctx);
    await (b.get('spawn')!([
      { template: 'child', id: 'kid-1', parentId: 'parent-1' },
    ]) as Promise<HoloScriptValue>);

    // Child executeOrb called
    expect(ctx.executeOrb).toHaveBeenCalledTimes(1);
    // Mitosis event fired with parentId + childId
    expect(ctx.emit).toHaveBeenCalledWith('mitosis_spawned', {
      parentId: 'parent-1', childId: 'kid-1',
    });
    expect(ctx.emit).toHaveBeenCalledWith('parent-1.mitosis_spawned', {
      childId: 'kid-1',
    });
  });
});

describe('notifyParent — async mitosis event dispatch', () => {
  it('emits mitosis_child_complete with parent id + child result', async () => {
    const ctx = makeCtx();
    const b = createBuiltinsMap(ctx);
    await (b.get('notifyParent')!([
      'parent-A',
      { score: 42 },
      'child-B',
    ]) as Promise<HoloScriptValue>);
    expect(ctx.emit).toHaveBeenCalledWith('mitosis_child_complete', {
      parentId: 'parent-A', childId: 'child-B', result: { score: 42 },
    });
    expect(ctx.emit).toHaveBeenCalledWith('parent-A.mitosis_child_complete', {
      childId: 'child-B', result: { score: 42 },
    });
  });

  it('defaults childId to "unknown" when missing', async () => {
    const ctx = makeCtx();
    const b = createBuiltinsMap(ctx);
    await (b.get('notifyParent')!(['parent', {}]) as Promise<HoloScriptValue>);
    expect(ctx.emit).toHaveBeenCalledWith(
      'mitosis_child_complete',
      expect.objectContaining({ childId: 'unknown' }),
    );
  });
});

// ──────────────────────────────────────────────────────────────────
// Spatial + data builtins
// ──────────────────────────────────────────────────────────────────

describe('spatial builtins', () => {
  it('despawn removes from all 3 state maps + emits particle effect', () => {
    const ctx = makeCtx();
    ctx.hologramState.set('obj', { color: '#f00' } as HologramProperties);
    ctx.spatialMemory.set('obj', [1, 2, 3]);
    ctx.variables.set('obj', 'value');
    const b = createBuiltinsMap(ctx);
    const r = b.get('despawn')!(['obj']);
    expect(ctx.hologramState.has('obj')).toBe(false);
    expect(ctx.spatialMemory.has('obj')).toBe(false);
    expect(ctx.variables.has('obj')).toBe(false);
    expect(ctx.createParticleEffect).toHaveBeenCalledWith(
      'obj_despawn', [1, 2, 3], '#ff0000', 30,
    );
    expect(r).toEqual({ despawned: 'obj' });
  });

  it('despawn of non-existent target returns msg envelope', () => {
    const b = createBuiltinsMap(makeCtx());
    const r = b.get('despawn')!(['ghost']);
    expect(r).toEqual({ msg: 'Target not found', target: 'ghost' });
  });

  it('move writes new position + creates connection stream if prior position exists', () => {
    const ctx = makeCtx();
    ctx.spatialMemory.set('obj', [0, 0, 0]);
    const b = createBuiltinsMap(ctx);
    b.get('move')!(['obj', [5, 0, 0]]);
    expect(ctx.spatialMemory.get('obj')).toEqual([5, 0, 0]);
    expect(ctx.createConnectionStream).toHaveBeenCalledWith(
      'obj', 'obj_dest', [0, 0, 0], [5, 0, 0], 'move',
    );
  });
});

describe('data builtins', () => {
  it('set writes via setVariable callback', () => {
    const ctx = makeCtx();
    const b = createBuiltinsMap(ctx);
    b.get('set')!(['key', 'value']);
    expect(ctx.setVariable).toHaveBeenCalledWith('key', 'value');
  });

  it('get reads via getVariable callback', () => {
    const ctx = makeCtx({
      getVariable: vi.fn((_name: string) => 'read-value' as HoloScriptValue),
    });
    const b = createBuiltinsMap(ctx);
    expect(b.get('get')!(['anykey'])).toBe('read-value');
  });
});

// ──────────────────────────────────────────────────────────────────
// calculate_arc delegates to ctx
// ──────────────────────────────────────────────────────────────────

describe('calculate_arc — delegates to ctx.calculateArc', () => {
  it('passes args through to runtime handler', () => {
    const ctx = makeCtx({
      calculateArc: vi.fn((_args: HoloScriptValue[]) => [1, 2, 3] as HoloScriptValue),
    });
    const b = createBuiltinsMap(ctx);
    expect(b.get('calculate_arc')!([[0, 0, 0], [10, 10, 10], 5])).toEqual([1, 2, 3]);
    expect(ctx.calculateArc).toHaveBeenCalled();
  });
});
