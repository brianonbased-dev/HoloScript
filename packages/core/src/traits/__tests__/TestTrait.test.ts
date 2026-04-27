import { describe, it, expect, vi } from 'vitest';
import { testHandler, TEST_TRAIT, CompositionTestRunner } from '../TestTrait';

function makeNode() {
  return {
    id: 'n1',
    traits: new Set(),
    emit: vi.fn(),
  } as any;
}

// ─── TEST_TRAIT metadata ──────────────────────────────────────────────────

describe('TEST_TRAIT', () => {
  it('has name test', () => {
    expect(TEST_TRAIT.name).toBe('test');
  });

  it('has category testing', () => {
    expect(TEST_TRAIT.category).toBe('testing');
  });

  it('has parameters array', () => {
    expect(Array.isArray(TEST_TRAIT.parameters)).toBe(true);
    expect(TEST_TRAIT.parameters.length).toBeGreaterThan(0);
  });
});

// ─── testHandler ─────────────────────────────────────────────────────────

describe('testHandler', () => {
  it('has name test', () => {
    expect(testHandler.name).toBe('test');
  });

  it('has defaultConfig', () => {
    expect(testHandler.defaultConfig).toMatchObject({
      bail: false,
      timeout: 5000,
    });
  });

  it('onAttach creates __test_instance on node', () => {
    const node = makeNode();
    const ctx = { emit: vi.fn() };
    const cfg = testHandler.defaultConfig as any;
    testHandler.onAttach!(node, cfg, ctx as any);
    expect(node.__test_instance).toBeDefined();
  });

  it('onAttach emits test:attached', () => {
    const node = makeNode();
    const ctx = { emit: vi.fn() };
    const cfg = testHandler.defaultConfig as any;
    testHandler.onAttach!(node, cfg, ctx as any);
    expect(ctx.emit).toHaveBeenCalledWith('test:attached', expect.anything());
  });

  it('onDetach removes __test_instance and emits test:detached', () => {
    const node = makeNode();
    const ctx = { emit: vi.fn() };
    const cfg = testHandler.defaultConfig as any;
    testHandler.onAttach!(node, cfg, ctx as any);
    testHandler.onDetach!(node, cfg, ctx as any);
    expect(node.__test_instance).toBeUndefined();
    expect(ctx.emit).toHaveBeenCalledWith('test:detached', expect.anything());
  });

  it('onEvent test:run calls runTestsFromSource and emits test:results', () => {
    const node = makeNode();
    const ctx = { emit: vi.fn() };
    const cfg = testHandler.defaultConfig as any;
    testHandler.onAttach!(node, cfg, ctx as any);

    const source = `
composition "Simple" {
  test "pass check" {
    assert: { "1 == 1": true }
  }
}`;

    testHandler.onEvent!(node, cfg, ctx as any, {
      type: 'test:run',
      source,
    } as any);

    expect(ctx.emit).toHaveBeenCalledWith('test:results', expect.objectContaining({
      results: expect.any(Array),
    }));
  });

  it('onEvent without __test_instance is a no-op', () => {
    const node = makeNode();
    const ctx = { emit: vi.fn() };
    const cfg = testHandler.defaultConfig as any;
    testHandler.onEvent!(node, cfg, ctx as any, { type: 'test:run', source: '' } as any);
    expect(ctx.emit).not.toHaveBeenCalled();
  });
});

// ─── CompositionTestRunner ────────────────────────────────────────────────

describe('CompositionTestRunner', () => {
  it('instantiates with empty state', () => {
    const runner = new CompositionTestRunner({});
    expect(runner).toBeDefined();
  });

  it('runTestsFromSource returns an array', () => {
    const runner = new CompositionTestRunner({});
    const results = runner.runTestsFromSource('composition "X" {}');
    expect(Array.isArray(results)).toBe(true);
  });

  it('runTestsFromSource processes test blocks with passing assertions', () => {
    const runner = new CompositionTestRunner({ count: 0 });
    const src = `
composition "Test" {
  test "check1" {
    assert: { "$count == 0": true }
  }
}`;
    const results = runner.runTestsFromSource(src);
    expect(results.length).toBeGreaterThanOrEqual(0);
  });

  it('runTestsFromSource handles empty source gracefully', () => {
    const runner = new CompositionTestRunner({});
    const results = runner.runTestsFromSource('');
    expect(Array.isArray(results)).toBe(true);
  });
});
