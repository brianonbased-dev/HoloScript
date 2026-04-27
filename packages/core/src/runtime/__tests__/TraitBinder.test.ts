import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock TraitComposer
const { mockCompose } = vi.hoisted(() => ({ mockCompose: vi.fn() }));
vi.mock('../../compiler/TraitComposer.js', () => ({
  TraitComposer: vi.fn(function() { return { compose: mockCompose }; }),
}));

import { TraitBinder } from '../TraitBinder.js';

// ──────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────

function makeHandler(name = 'testHandler') {
  return {
    name,
    onAttach: vi.fn(),
    onDetach: vi.fn(),
    onUpdate: vi.fn(),
  };
}

// ──────────────────────────────────────────────────────────────────
// register / has / resolve
// ──────────────────────────────────────────────────────────────────

describe('TraitBinder — register / has / resolve', () => {
  let binder: TraitBinder;
  beforeEach(() => {
    binder = new TraitBinder();
  });

  it('has() returns false for unknown trait', () => {
    expect(binder.has('unknown')).toBe(false);
  });

  it('has() returns true after register()', () => {
    binder.register('grabbable', makeHandler() as never);
    expect(binder.has('grabbable')).toBe(true);
  });

  it('resolve() returns undefined for unknown trait', () => {
    expect(binder.resolve('unknown')).toBeUndefined();
  });

  it('resolve() returns the registered handler', () => {
    const h = makeHandler();
    binder.register('physics', h as never);
    expect(binder.resolve('physics')).toBe(h);
  });

  it('register() overwrites an existing handler', () => {
    const h1 = makeHandler('h1');
    const h2 = makeHandler('h2');
    binder.register('collidable', h1 as never);
    binder.register('collidable', h2 as never);
    expect(binder.resolve('collidable')).toBe(h2);
  });

  it('multiple traits can be registered independently', () => {
    const hA = makeHandler('A');
    const hB = makeHandler('B');
    binder.register('traitA', hA as never);
    binder.register('traitB', hB as never);
    expect(binder.resolve('traitA')).toBe(hA);
    expect(binder.resolve('traitB')).toBe(hB);
  });
});

// ──────────────────────────────────────────────────────────────────
// registerComposed
// ──────────────────────────────────────────────────────────────────

describe('TraitBinder — registerComposed', () => {
  let binder: TraitBinder;
  beforeEach(() => {
    binder = new TraitBinder();
    mockCompose.mockReset();
  });

  it('calls composer.compose with (name, handlers map, sources)', () => {
    const composedHandler = makeHandler('composed');
    mockCompose.mockReturnValue({ handler: composedHandler, warnings: [], conflicts: [] });
    binder.register('src1', makeHandler() as never);
    binder.registerComposed('myTrait', ['src1']);
    expect(mockCompose).toHaveBeenCalledTimes(1);
    const [calledName, calledHandlers, calledSources] = mockCompose.mock.calls[0];
    expect(calledName).toBe('myTrait');
    expect(calledHandlers).toBeInstanceOf(Map);
    expect(calledSources).toEqual(['src1']);
  });

  it('stores the composed handler under the given name', () => {
    const composedHandler = makeHandler('composed');
    mockCompose.mockReturnValue({ handler: composedHandler, warnings: [], conflicts: [] });
    binder.registerComposed('myTrait', []);
    expect(binder.has('myTrait')).toBe(true);
    expect(binder.resolve('myTrait')).toBe(composedHandler);
  });

  it('returns warnings from composer.compose', () => {
    mockCompose.mockReturnValue({
      handler: makeHandler() as never,
      warnings: ['conflict in onUpdate', 'missing onAttach'],
      conflicts: [],
    });
    const warnings = binder.registerComposed('myTrait', []);
    expect(warnings).toEqual(['conflict in onUpdate', 'missing onAttach']);
  });

  it('returns empty array when there are no warnings', () => {
    mockCompose.mockReturnValue({ handler: makeHandler() as never, warnings: [], conflicts: [] });
    const warnings = binder.registerComposed('myTrait', []);
    expect(warnings).toEqual([]);
  });

  it('includes all currently registered handlers in the map passed to compose', () => {
    const h1 = makeHandler('h1');
    const h2 = makeHandler('h2');
    binder.register('a', h1 as never);
    binder.register('b', h2 as never);
    mockCompose.mockReturnValue({ handler: makeHandler() as never, warnings: [], conflicts: [] });
    binder.registerComposed('composed', ['a', 'b']);
    const calledHandlers: Map<string, unknown> = mockCompose.mock.calls[0][1];
    expect(calledHandlers.get('a')).toBe(h1);
    expect(calledHandlers.get('b')).toBe(h2);
  });
});
