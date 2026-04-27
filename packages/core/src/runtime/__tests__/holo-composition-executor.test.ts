import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock executeHoloTemplate from simple-executors
vi.mock('../simple-executors.js', () => ({
  executeHoloTemplate: vi.fn().mockResolvedValue({ success: true, output: 'template ok' }),
}));

import { executeHoloComposition, type HoloCompositionContext } from '../holo-composition-executor.js';
import { executeHoloTemplate } from '../simple-executors.js';

// ──────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────

function makeCtx(overrides: Partial<HoloCompositionContext> = {}): HoloCompositionContext {
  let env: Record<string, unknown> = {};
  return {
    simpleExecutorContext: {} as never,
    executeHoloObject: vi.fn().mockResolvedValue({ success: true, output: 'obj ok' }),
    getEnvironment: vi.fn().mockImplementation(() => ({ ...env })),
    setEnvironment: vi.fn().mockImplementation((newEnv) => { env = newEnv; }),
    ...overrides,
  };
}

function makeNode(overrides: Record<string, unknown> = {}) {
  return {
    type: 'HoloComposition',
    name: 'TestComposition',
    templates: [],
    objects: [],
    environment: null,
    ...overrides,
  };
}

function makeValueProp(key: string, value: unknown) {
  return { key, value: { type: 'literal', value } };
}

// ──────────────────────────────────────────────────────────────────
// Phase 1: templates
// ──────────────────────────────────────────────────────────────────

describe('executeHoloComposition — templates (Phase 1)', () => {
  beforeEach(() => {
    vi.mocked(executeHoloTemplate).mockClear();
  });

  it('does not call executeHoloTemplate when templates is empty', async () => {
    const ctx = makeCtx();
    await executeHoloComposition(makeNode() as never, ctx);
    expect(executeHoloTemplate).not.toHaveBeenCalled();
  });

  it('calls executeHoloTemplate once per template', async () => {
    const t1 = { name: 'T1' };
    const t2 = { name: 'T2' };
    const ctx = makeCtx();
    await executeHoloComposition(makeNode({ templates: [t1, t2] }) as never, ctx);
    expect(executeHoloTemplate).toHaveBeenCalledTimes(2);
  });

  it('passes simpleExecutorContext to executeHoloTemplate', async () => {
    const simpleCtx = { special: true } as never;
    const ctx = makeCtx({ simpleExecutorContext: simpleCtx });
    const t1 = { name: 'T1' };
    await executeHoloComposition(makeNode({ templates: [t1] }) as never, ctx);
    expect(executeHoloTemplate).toHaveBeenCalledWith(t1, simpleCtx);
  });
});

// ──────────────────────────────────────────────────────────────────
// Phase 2: environment
// ──────────────────────────────────────────────────────────────────

describe('executeHoloComposition — environment (Phase 2)', () => {
  it('does not call setEnvironment when environment is null/absent', async () => {
    const ctx = makeCtx();
    await executeHoloComposition(makeNode() as never, ctx);
    expect(ctx.setEnvironment).not.toHaveBeenCalled();
  });

  it('sets environment from properties', async () => {
    const ctx = makeCtx();
    const node = makeNode({
      environment: {
        properties: [makeValueProp('skybox', 'sunset'), makeValueProp('fog', true)],
      },
    });
    await executeHoloComposition(node as never, ctx);
    expect(ctx.setEnvironment).toHaveBeenCalledTimes(1);
    const called = vi.mocked(ctx.setEnvironment).mock.calls[0][0];
    expect(called.skybox).toEqual({ type: 'literal', value: 'sunset' });
    expect(called.fog).toEqual({ type: 'literal', value: true });
  });

  it('merges new settings on top of existing environment', async () => {
    const existingEnv = { skybox: 'default', ambient: 0.5 };
    const ctx = makeCtx({
      getEnvironment: vi.fn().mockReturnValue(existingEnv),
      setEnvironment: vi.fn(),
    });
    const node = makeNode({
      environment: {
        properties: [makeValueProp('skybox', 'night')],
      },
    });
    await executeHoloComposition(node as never, ctx);
    const called = vi.mocked(ctx.setEnvironment).mock.calls[0][0];
    // new value wins; existing ambient preserved
    expect(called.skybox).toEqual({ type: 'literal', value: 'night' });
    expect(called.ambient).toBe(0.5);
  });
});

// ──────────────────────────────────────────────────────────────────
// Phase 3: objects
// ──────────────────────────────────────────────────────────────────

describe('executeHoloComposition — objects (Phase 3)', () => {
  it('does not call executeHoloObject when objects is empty', async () => {
    const ctx = makeCtx();
    await executeHoloComposition(makeNode() as never, ctx);
    expect(ctx.executeHoloObject).not.toHaveBeenCalled();
  });

  it('calls executeHoloObject once per object', async () => {
    const obj1 = { name: 'Ball' };
    const obj2 = { name: 'Cube' };
    const ctx = makeCtx();
    await executeHoloComposition(makeNode({ objects: [obj1, obj2] }) as never, ctx);
    expect(ctx.executeHoloObject).toHaveBeenCalledTimes(2);
    expect(ctx.executeHoloObject).toHaveBeenCalledWith(obj1);
    expect(ctx.executeHoloObject).toHaveBeenCalledWith(obj2);
  });

  it('returns success:true when all objects succeed', async () => {
    const ctx = makeCtx({
      executeHoloObject: vi.fn().mockResolvedValue({ success: true, output: 'ok' }),
    });
    const node = makeNode({ objects: [{ name: 'A' }, { name: 'B' }] });
    const result = await executeHoloComposition(node as never, ctx);
    expect(result.success).toBe(true);
  });

  it('returns success:false when any object fails', async () => {
    const ctx = makeCtx({
      executeHoloObject: vi
        .fn()
        .mockResolvedValueOnce({ success: true, output: 'ok' })
        .mockResolvedValueOnce({ success: false, output: 'fail' }),
    });
    const node = makeNode({ objects: [{ name: 'A' }, { name: 'B' }] });
    const result = await executeHoloComposition(node as never, ctx);
    expect(result.success).toBe(false);
  });
});

// ──────────────────────────────────────────────────────────────────
// Return value
// ──────────────────────────────────────────────────────────────────

describe('executeHoloComposition — return value', () => {
  it('returns success:true for empty composition', async () => {
    const ctx = makeCtx();
    const result = await executeHoloComposition(makeNode() as never, ctx);
    expect(result.success).toBe(true);
  });

  it('output includes the composition name', async () => {
    const ctx = makeCtx();
    const result = await executeHoloComposition(makeNode({ name: 'MyScene' }) as never, ctx);
    expect(result.output).toContain('MyScene');
  });
});
