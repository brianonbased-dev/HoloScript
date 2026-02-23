/**
 * RuntimeRegistry Production Tests
 *
 * NOTE: RuntimeRegistry is a singleton — each test calls reg.clear() in
 * beforeEach to avoid cross-test contamination.
 *
 * Covers: register (stores runtime, warns on duplicate), unregister (returns
 * bool, removes entry), get/has, getAll/getIds, findByType (matches
 * supportedTypes), findByCapability (physics/particles/fluids/userInput),
 * findByTag, execute (null for unknown type, calls initialize for match),
 * getStatistics (totalRuntimes, runtimes array), clear.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RuntimeRegistry } from '../../runtime/RuntimeRegistry';
import type { RuntimeModule, RuntimeExecutor } from '../../runtime/RuntimeRegistry';

// ── fixture factory ────────────────────────────────────────────────────────────

function makeExecutor(): RuntimeExecutor {
  return {
    start: vi.fn(), stop: vi.fn(), pause: vi.fn(), resume: vi.fn(),
    update: vi.fn(), getStatistics: vi.fn(() => ({})), getState: vi.fn(() => ({})), reset: vi.fn(),
  };
}

function makeRuntime(id: string, types: string[] = ['scene'], tags: string[] = []): RuntimeModule {
  const executor = makeExecutor();
  return {
    id,
    name: `Runtime ${id}`,
    version: '1.0.0',
    supportedTypes: types,
    capabilities: {
      physics: { gravity: true, collision: true, constraints: true, softBody: false, fluids: false },
      rendering: { particles: true, lighting: true, shadows: true, postProcessing: false },
      interaction: { userInput: true, gestures: false, voice: false, haptics: false },
    },
    metadata: { tags },
    initialize: vi.fn(() => executor),
  };
}

beforeEach(() => {
  RuntimeRegistry.clear();
});

// ── register / unregister ─────────────────────────────────────────────────────

describe('RuntimeRegistry — register / unregister', () => {

  it('register stores runtime and has() returns true', () => {
    const rt = makeRuntime('r1');
    RuntimeRegistry.register(rt);
    expect(RuntimeRegistry.has('r1')).toBe(true);
  });

  it('get returns registered runtime', () => {
    const rt = makeRuntime('r2');
    RuntimeRegistry.register(rt);
    expect(RuntimeRegistry.get('r2')?.id).toBe('r2');
  });

  it('get returns undefined for unknown runtime', () => {
    expect(RuntimeRegistry.get('ghost')).toBeUndefined();
  });

  it('has returns false for unregistered runtime', () => {
    expect(RuntimeRegistry.has('ghost')).toBe(false);
  });

  it('registering duplicate id overwrites previous', () => {
    RuntimeRegistry.register(makeRuntime('dup', ['scene']));
    RuntimeRegistry.register(makeRuntime('dup', ['game']));
    const rt = RuntimeRegistry.get('dup')!;
    expect(rt.supportedTypes).toContain('game');
  });

  it('unregister removes runtime and returns true', () => {
    RuntimeRegistry.register(makeRuntime('r1'));
    expect(RuntimeRegistry.unregister('r1')).toBe(true);
    expect(RuntimeRegistry.has('r1')).toBe(false);
  });

  it('unregister returns false for unknown id', () => {
    expect(RuntimeRegistry.unregister('ghost')).toBe(false);
  });
});

// ── getAll / getIds ───────────────────────────────────────────────────────────

describe('RuntimeRegistry — getAll / getIds', () => {

  it('getAll returns all registered runtimes', () => {
    RuntimeRegistry.register(makeRuntime('a'));
    RuntimeRegistry.register(makeRuntime('b'));
    expect(RuntimeRegistry.getAll()).toHaveLength(2);
  });

  it('getIds returns all registered IDs', () => {
    RuntimeRegistry.register(makeRuntime('x'));
    RuntimeRegistry.register(makeRuntime('y'));
    const ids = RuntimeRegistry.getIds();
    expect(ids).toContain('x');
    expect(ids).toContain('y');
  });

  it('getAll returns empty array when nothing registered', () => {
    expect(RuntimeRegistry.getAll()).toHaveLength(0);
  });
});

// ── findByType ────────────────────────────────────────────────────────────────

describe('RuntimeRegistry — findByType', () => {

  it('returns runtimes supporting the given type', () => {
    RuntimeRegistry.register(makeRuntime('game', ['game', 'simulation']));
    RuntimeRegistry.register(makeRuntime('scene', ['scene']));
    const results = RuntimeRegistry.findByType('game');
    expect(results.some(r => r.id === 'game')).toBe(true);
    expect(results.some(r => r.id === 'scene')).toBe(false);
  });

  it('returns empty array for unknown type', () => {
    expect(RuntimeRegistry.findByType('unknown')).toHaveLength(0);
  });
});

// ── findByCapability ──────────────────────────────────────────────────────────

describe('RuntimeRegistry — findByCapability', () => {

  it('findByCapability("physics") returns runtimes with physics', () => {
    RuntimeRegistry.register(makeRuntime('phys'));
    const results = RuntimeRegistry.findByCapability('physics');
    expect(results.some(r => r.id === 'phys')).toBe(true);
  });

  it('findByCapability("particles") returns runtimes with rendering.particles', () => {
    RuntimeRegistry.register(makeRuntime('render'));
    const results = RuntimeRegistry.findByCapability('particles');
    expect(results.some(r => r.id === 'render')).toBe(true);
  });

  it('findByCapability("userInput") returns runtimes with interaction.userInput', () => {
    RuntimeRegistry.register(makeRuntime('input'));
    const results = RuntimeRegistry.findByCapability('userInput');
    expect(results.some(r => r.id === 'input')).toBe(true);
  });

  it('findByCapability("fluids") returns empty if no runtime has fluids', () => {
    RuntimeRegistry.register(makeRuntime('simple'));
    // makeRuntime sets physics.fluids=false
    expect(RuntimeRegistry.findByCapability('fluids')).toHaveLength(0);
  });

  it('returns empty for unknown capability key', () => {
    RuntimeRegistry.register(makeRuntime('r'));
    expect(RuntimeRegistry.findByCapability('hologram')).toHaveLength(0);
  });
});

// ── findByTag ─────────────────────────────────────────────────────────────────

describe('RuntimeRegistry — findByTag', () => {

  it('returns runtimes with matching tag', () => {
    RuntimeRegistry.register(makeRuntime('vr1', ['scene'], ['vr', '3d']));
    RuntimeRegistry.register(makeRuntime('web1', ['scene'], ['web']));
    const results = RuntimeRegistry.findByTag('vr');
    expect(results.some(r => r.id === 'vr1')).toBe(true);
    expect(results.some(r => r.id === 'web1')).toBe(false);
  });

  it('returns empty for tag not present', () => {
    RuntimeRegistry.register(makeRuntime('r', ['scene'], []));
    expect(RuntimeRegistry.findByTag('missing')).toHaveLength(0);
  });
});

// ── execute ───────────────────────────────────────────────────────────────────

describe('RuntimeRegistry — execute', () => {

  it('execute returns null when no runtime supports composition type', () => {
    const comp = { type: 'unknown', name: 'Test', objects: [] } as any;
    expect(RuntimeRegistry.execute(comp)).toBeNull();
  });

  it('execute calls initialize and returns executor for matching type', () => {
    const rt = makeRuntime('gameRt', ['game']);
    RuntimeRegistry.register(rt);
    const comp = { type: 'game', name: 'TestGame', objects: [] } as any;
    const executor = RuntimeRegistry.execute(comp);
    expect(executor).not.toBeNull();
    expect(rt.initialize).toHaveBeenCalledWith(comp, undefined);
  });
});

// ── getStatistics / clear ──────────────────────────────────────────────────────

describe('RuntimeRegistry — getStatistics / clear', () => {

  it('getStatistics returns totalRuntimes count', () => {
    RuntimeRegistry.register(makeRuntime('a'));
    RuntimeRegistry.register(makeRuntime('b'));
    expect(RuntimeRegistry.getStatistics().totalRuntimes).toBe(2);
  });

  it('getStatistics.runtimes includes id, name, version, types', () => {
    RuntimeRegistry.register(makeRuntime('myrt', ['scene']));
    const stats = RuntimeRegistry.getStatistics();
    const entry = stats.runtimes.find((r: any) => r.id === 'myrt');
    expect(entry).toBeDefined();
    expect(entry.version).toBe('1.0.0');
  });

  it('clear empties registry', () => {
    RuntimeRegistry.register(makeRuntime('a'));
    RuntimeRegistry.clear();
    expect(RuntimeRegistry.getAll()).toHaveLength(0);
  });
});
