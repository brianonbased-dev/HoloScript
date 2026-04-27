import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock logger
vi.mock('../logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { executeOrb } from '../orb-executor.js';
import type { OrbExecutorContext } from '../orb-executor.js';
import type { OrbNode, TemplateNode } from '../../types.js';

// ──────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────

function makeCtx(overrides: Partial<OrbExecutorContext> = {}): OrbExecutorContext {
  return {
    getCurrentScale: vi.fn().mockReturnValue(1),
    getVariable: vi.fn().mockReturnValue(undefined),
    setVariable: vi.fn(),
    setSpatialPosition: vi.fn(),
    evaluateExpression: vi.fn((v: unknown) => v),
    getTemplate: vi.fn().mockReturnValue(undefined),
    setHologramState: vi.fn(),
    executeMigrationBlock: vi.fn().mockResolvedValue(undefined),
    getBuiltinFunction: vi.fn().mockReturnValue(vi.fn()),
    applyDirectives: vi.fn(),
    isAgent: vi.fn().mockReturnValue(false),
    getAgentRuntime: vi.fn().mockReturnValue(undefined),
    setAgentRuntime: vi.fn(),
    acquireAgentRuntime: vi.fn().mockReturnValue({
      reset: vi.fn(),
      getState: vi.fn().mockReturnValue({ mode: 'idle' }),
      executeAction: vi.fn(),
    }),
    parentRuntime: {} as never,
    createParticleEffect: vi.fn(),
    broadcast: vi.fn(),
    ...overrides,
  };
}

function makeOrb(overrides: Partial<OrbNode> = {}): OrbNode {
  return {
    type: 'orb',
    name: 'testOrb',
    position: [1, 2, 3],
    properties: {},
    directives: [],
    ...overrides,
  } as OrbNode;
}

// ──────────────────────────────────────────────────────────────────
// Phase 1: state reconciliation
// ──────────────────────────────────────────────────────────────────

describe('executeOrb — Phase 1: state reconciliation', () => {
  it('creates a new orb when variable not found', async () => {
    const ctx = makeCtx();
    const orb = makeOrb({ name: 'ball' });
    const result = await executeOrb(orb, ctx);
    expect(result.success).toBe(true);
    expect(ctx.setVariable).toHaveBeenCalledWith(
      'ball',
      expect.objectContaining({ __type: 'orb', name: 'ball' }),
    );
  });

  it('creates a new orb when variable is not __type=orb', async () => {
    const ctx = makeCtx({ getVariable: vi.fn().mockReturnValue({ __type: 'other' }) });
    const result = await executeOrb(makeOrb(), ctx);
    expect(result.success).toBe(true);
    expect(ctx.setVariable).toHaveBeenCalled();
  });

  it('updates existing orb without calling setVariable again', async () => {
    const existing: Record<string, unknown> = { __type: 'orb', id: 'testOrb', name: 'testOrb' };
    const ctx = makeCtx({ getVariable: vi.fn().mockReturnValue(existing) });
    const result = await executeOrb(makeOrb(), ctx);
    expect(result.success).toBe(true);
    expect(ctx.setVariable).not.toHaveBeenCalled();
  });

  it('returns the existing orb reference (same object)', async () => {
    const existing: Record<string, unknown> = { __type: 'orb', id: 'testOrb', name: 'testOrb' };
    const ctx = makeCtx({ getVariable: vi.fn().mockReturnValue(existing) });
    const result = await executeOrb(makeOrb(), ctx);
    expect(result.output).toBe(existing);
  });
});

// ──────────────────────────────────────────────────────────────────
// Phase 2: position normalization
// ──────────────────────────────────────────────────────────────────

describe('executeOrb — Phase 2: position normalization', () => {
  it('normalizes array position and applies scale', async () => {
    const ctx = makeCtx({ getCurrentScale: vi.fn().mockReturnValue(2) });
    const orb = makeOrb({ position: [1, 2, 3] });
    await executeOrb(orb, ctx);
    expect(ctx.setSpatialPosition).toHaveBeenCalledWith('testOrb', [2, 4, 6]);
  });

  it('defaults missing components to 0', async () => {
    const ctx = makeCtx();
    const orb = makeOrb({ position: [5] as never });
    await executeOrb(orb, ctx);
    expect(ctx.setSpatialPosition).toHaveBeenCalledWith('testOrb', [5, 0, 0]);
  });

  it('skips setSpatialPosition when node.position is absent', async () => {
    const ctx = makeCtx();
    const orb = makeOrb({ position: undefined });
    await executeOrb(orb, ctx);
    expect(ctx.setSpatialPosition).not.toHaveBeenCalled();
  });

  it('includes scaled spatialPosition in return value', async () => {
    const ctx = makeCtx({ getCurrentScale: vi.fn().mockReturnValue(3) });
    const orb = makeOrb({ position: [1, 0, 0] });
    const result = await executeOrb(orb, ctx);
    expect((result as Record<string, unknown>).spatialPosition).toEqual([3, 0, 0]);
  });
});

// ──────────────────────────────────────────────────────────────────
// Phase 3: property evaluation
// ──────────────────────────────────────────────────────────────────

describe('executeOrb — Phase 3: property evaluation', () => {
  it('evaluates string property values', async () => {
    const evalFn = vi.fn().mockReturnValue('blue');
    const ctx = makeCtx({ evaluateExpression: evalFn });
    const orb = makeOrb({ properties: { color: 'props.color' } });
    await executeOrb(orb, ctx);
    expect(evalFn).toHaveBeenCalledWith('props.color');
  });

  it('passes non-string values through without evaluation', async () => {
    const evalFn = vi.fn();
    const ctx = makeCtx({ evaluateExpression: evalFn });
    const orb = makeOrb({ properties: { mass: 10, visible: true } });
    await executeOrb(orb, ctx);
    expect(evalFn).not.toHaveBeenCalled();
  });

  it('handles array-shape properties (HoloScript composition format)', async () => {
    const evalFn = vi.fn().mockReturnValue('eval');
    const ctx = makeCtx({ evaluateExpression: evalFn });
    const orb = makeOrb({
      properties: [
        { key: 'color', value: 'red' },
        { key: 'mass', value: 5 },
      ] as never,
    });
    await executeOrb(orb, ctx);
    expect(evalFn).toHaveBeenCalledWith('red');
    expect(evalFn).toHaveBeenCalledTimes(1); // non-string not evaluated
  });
});

// ──────────────────────────────────────────────────────────────────
// Phase 4: template merging
// ──────────────────────────────────────────────────────────────────

describe('executeOrb — Phase 4: template merging', () => {
  it('fills in missing properties from template', async () => {
    const tpl: Partial<TemplateNode> = {
      name: 'BaseShape',
      properties: { color: 'red', mass: 5 },
      directives: [],
    };
    const ctx = makeCtx({ getTemplate: vi.fn().mockReturnValue(tpl) });
    const orb = makeOrb({
      properties: { color: 'blue' }, // color already set
      directives: [],
    } as Partial<OrbNode> as never);
    (orb as OrbNode & { template: string }).template = 'BaseShape';
    await executeOrb(orb, ctx);
    // color should stay 'blue' (object-wins); mass filled from template
    const output = (await executeOrb(orb, ctx)).output as Record<string, unknown>;
    const props = (output as Record<string, unknown>).properties as Record<string, unknown>;
    expect(props.color).toBe('blue');
  });

  it('prepends template directives onto node.directives (MUTATES node)', async () => {
    const tplDirective = { type: 'trait', name: 'physics' };
    const tpl: Partial<TemplateNode> = {
      name: 'Base',
      properties: {},
      directives: [tplDirective],
    };
    const ctx = makeCtx({ getTemplate: vi.fn().mockReturnValue(tpl) });
    const orb = makeOrb({ directives: [{ type: 'trait', name: 'glowing' }] as never });
    (orb as OrbNode & { template: string }).template = 'Base';
    await executeOrb(orb, ctx);
    // node.directives should now start with physics (prepended)
    expect(orb.directives?.[0]).toEqual(tplDirective);
  });

  it('does nothing when no template is set', async () => {
    const ctx = makeCtx();
    const orb = makeOrb({ directives: [{ type: 'trait', name: 'glow' }] as never });
    await executeOrb(orb, ctx);
    expect(ctx.getTemplate).not.toHaveBeenCalled();
  });
});

// ──────────────────────────────────────────────────────────────────
// Phase 5: hologram construction
// ──────────────────────────────────────────────────────────────────

describe('executeOrb — Phase 5: hologram construction', () => {
  it('uses node.hologram when present and scales its size', async () => {
    const ctx = makeCtx({ getCurrentScale: vi.fn().mockReturnValue(2) });
    const orb = makeOrb({
      hologram: { color: '#ff0000', size: 3, shape: 'cube', glow: false, interactive: false },
    });
    const result = await executeOrb(orb, ctx);
    const h = (result as Record<string, unknown>).hologram as Record<string, unknown>;
    expect(h.color).toBe('#ff0000');
    expect(h.size).toBe(6); // 3 * scale(2)
  });

  it('derives hologram from properties when node.hologram is absent', async () => {
    const ctx = makeCtx();
    const orb = makeOrb({
      properties: { color: '#00ff00', geometry: 'cube' },
      hologram: undefined,
    });
    const result = await executeOrb(orb, ctx);
    const h = (result as Record<string, unknown>).hologram as Record<string, unknown>;
    expect(h.color).toBe('#00ff00');
    expect(h.shape).toBe('cube');
  });

  it('falls back to defaults when properties are empty', async () => {
    const ctx = makeCtx();
    const orb = makeOrb({ properties: {}, hologram: undefined });
    const result = await executeOrb(orb, ctx);
    const h = (result as Record<string, unknown>).hologram as Record<string, unknown>;
    expect(h.color).toBe('#ffffff');
    expect(h.size).toBe(1);
    expect(h.shape).toBe('sphere');
  });

  it('calls setHologramState with constructed hologram', async () => {
    const ctx = makeCtx();
    const orb = makeOrb({ properties: { color: '#abc' } });
    await executeOrb(orb, ctx);
    expect(ctx.setHologramState).toHaveBeenCalledWith(
      'testOrb',
      expect.objectContaining({ color: '#abc' }),
    );
  });
});

// ──────────────────────────────────────────────────────────────────
// Phase 6: migration logic
// ──────────────────────────────────────────────────────────────────

describe('executeOrb — Phase 6: migration logic', () => {
  it('runs migration when template version increased', async () => {
    const oldTpl = { name: 'T', version: 1 } as Partial<TemplateNode>;
    const newTpl = {
      name: 'T', version: 2,
      migrations: [{ fromVersion: 1, toVersion: 2, block: [] }],
    } as Partial<TemplateNode>;
    const existing: Record<string, unknown> = {
      __type: 'orb', id: 'testOrb', name: 'testOrb', _templateRef: oldTpl,
    };
    const ctx = makeCtx({
      getVariable: vi.fn().mockReturnValue(existing),
      getTemplate: vi.fn().mockReturnValue(newTpl),
    });
    const orb = makeOrb();
    (orb as OrbNode & { template: string }).template = 'T';
    await executeOrb(orb, ctx);
    expect(ctx.executeMigrationBlock).toHaveBeenCalledWith(
      existing,
      expect.objectContaining({ fromVersion: 1 }),
    );
  });

  it('does not run migration when version is the same', async () => {
    const tpl = { name: 'T', version: 1, migrations: [] } as Partial<TemplateNode>;
    const existing: Record<string, unknown> = {
      __type: 'orb', id: 'testOrb', name: 'testOrb', _templateRef: tpl,
    };
    const ctx = makeCtx({
      getVariable: vi.fn().mockReturnValue(existing),
      getTemplate: vi.fn().mockReturnValue(tpl),
    });
    const orb = makeOrb();
    (orb as OrbNode & { template: string }).template = 'T';
    await executeOrb(orb, ctx);
    expect(ctx.executeMigrationBlock).not.toHaveBeenCalled();
  });

  it('does not run migration on create path', async () => {
    const tpl = { name: 'T', version: 2, migrations: [] } as Partial<TemplateNode>;
    const ctx = makeCtx({ getTemplate: vi.fn().mockReturnValue(tpl) });
    const orb = makeOrb();
    (orb as OrbNode & { template: string }).template = 'T';
    await executeOrb(orb, ctx);
    expect(ctx.executeMigrationBlock).not.toHaveBeenCalled();
  });
});

// ──────────────────────────────────────────────────────────────────
// Phase 7: orbData build + mutation + apply + broadcast
// ──────────────────────────────────────────────────────────────────

describe('executeOrb — Phase 7: orbData build', () => {
  it('broadcasts orb_created on new orb', async () => {
    const ctx = makeCtx();
    await executeOrb(makeOrb(), ctx);
    expect(ctx.broadcast).toHaveBeenCalledWith('orb_created', expect.any(Object));
  });

  it('broadcasts orb_updated on existing orb', async () => {
    const existing = { __type: 'orb', id: 'testOrb', name: 'testOrb' };
    const ctx = makeCtx({ getVariable: vi.fn().mockReturnValue(existing) });
    await executeOrb(makeOrb(), ctx);
    expect(ctx.broadcast).toHaveBeenCalledWith('orb_updated', expect.any(Object));
  });

  it('calls createParticleEffect for new orb', async () => {
    const ctx = makeCtx();
    await executeOrb(makeOrb({ position: [0, 0, 0] }), ctx);
    expect(ctx.createParticleEffect).toHaveBeenCalledWith(
      'testOrb_creation',
      expect.any(Array),
      '#00ffff',
      20,
    );
  });

  it('does NOT call createParticleEffect for update', async () => {
    const existing = { __type: 'orb', id: 'testOrb', name: 'testOrb' };
    const ctx = makeCtx({ getVariable: vi.fn().mockReturnValue(existing) });
    await executeOrb(makeOrb(), ctx);
    expect(ctx.createParticleEffect).not.toHaveBeenCalled();
  });

  it('calls applyDirectives when directives present', async () => {
    const ctx = makeCtx();
    const orb = makeOrb({ directives: [{ type: 'trait', name: 'glowing' }] as never });
    await executeOrb(orb, ctx);
    expect(ctx.applyDirectives).toHaveBeenCalledTimes(1);
  });

  it('does not call applyDirectives when directives is undefined', async () => {
    const ctx = makeCtx();
    const orb = makeOrb({ directives: undefined });
    await executeOrb(orb, ctx);
    expect(ctx.applyDirectives).not.toHaveBeenCalled();
  });

  it('preserves existing properties on update', async () => {
    const existing: Record<string, unknown> = {
      __type: 'orb', id: 'testOrb', name: 'testOrb',
      properties: { score: 5 },
    };
    const ctx = makeCtx({ getVariable: vi.fn().mockReturnValue(existing) });
    const orb = makeOrb({ properties: { color: 'red' } });
    await executeOrb(orb, ctx);
    const props = (existing.properties as Record<string, unknown>);
    expect(props.score).toBe(5);
    expect(props.color).toBe('red');
  });

  it('new orbData has id, name, created, __type', async () => {
    const ctx = makeCtx();
    const result = await executeOrb(makeOrb({ name: 'myOrb' }), ctx);
    const orbData = result.output as Record<string, unknown>;
    expect(orbData.__type).toBe('orb');
    expect(orbData.id).toBe('myOrb');
    expect(orbData.name).toBe('myOrb');
    expect(typeof orbData.created).toBe('number');
  });

  it('broadcast payload includes traits list', async () => {
    const ctx = makeCtx();
    const orb = makeOrb({
      directives: [{ type: 'trait', name: 'glowing' }] as never,
    });
    await executeOrb(orb, ctx);
    expect(ctx.broadcast).toHaveBeenCalledWith(
      'orb_created',
      expect.objectContaining({
        orb: expect.objectContaining({
          traits: ['glowing'],
        }),
      }),
    );
  });
});

// ──────────────────────────────────────────────────────────────────
// Phase 7: agent initialization
// ──────────────────────────────────────────────────────────────────

describe('executeOrb — agent initialization', () => {
  it('acquires and resets agent runtime when isAgent returns true', async () => {
    const agentRuntime = {
      reset: vi.fn(),
      getState: vi.fn().mockReturnValue({ mode: 'active' }),
      executeAction: vi.fn(),
    };
    const ctx = makeCtx({
      isAgent: vi.fn().mockReturnValue(true),
      acquireAgentRuntime: vi.fn().mockReturnValue(agentRuntime),
    });
    await executeOrb(makeOrb(), ctx);
    expect(agentRuntime.reset).toHaveBeenCalledTimes(1);
    expect(ctx.setAgentRuntime).toHaveBeenCalledWith('testOrb', agentRuntime);
  });

  it('sets orb state from agentRuntime.getState()', async () => {
    const agentRuntime = {
      reset: vi.fn(),
      getState: vi.fn().mockReturnValue({ hp: 100 }),
      executeAction: vi.fn(),
    };
    const ctx = makeCtx({
      isAgent: vi.fn().mockReturnValue(true),
      acquireAgentRuntime: vi.fn().mockReturnValue(agentRuntime),
    });
    const result = await executeOrb(makeOrb(), ctx);
    const orbData = result.output as Record<string, unknown>;
    expect(orbData.state).toEqual({ hp: 100 });
  });

  it('reuses existing agent runtime on update', async () => {
    const existing = { __type: 'orb', id: 'testOrb', name: 'testOrb' };
    const existingAgent = { reset: vi.fn(), getState: vi.fn().mockReturnValue({}), executeAction: vi.fn() };
    const ctx = makeCtx({
      getVariable: vi.fn().mockReturnValue(existing),
      isAgent: vi.fn().mockReturnValue(true),
      getAgentRuntime: vi.fn().mockReturnValue(existingAgent),
    });
    await executeOrb(makeOrb(), ctx);
    expect(ctx.acquireAgentRuntime).not.toHaveBeenCalled();
    expect(existingAgent.reset).not.toHaveBeenCalled();
  });

  it('does not touch agent runtime when isAgent returns false', async () => {
    const ctx = makeCtx({ isAgent: vi.fn().mockReturnValue(false) });
    await executeOrb(makeOrb(), ctx);
    expect(ctx.acquireAgentRuntime).not.toHaveBeenCalled();
    expect(ctx.setAgentRuntime).not.toHaveBeenCalled();
  });

  it('binds method directives to agentRuntime.executeAction', async () => {
    const agentRuntime = {
      reset: vi.fn(),
      getState: vi.fn().mockReturnValue({}),
      executeAction: vi.fn().mockReturnValue('action-result'),
    };
    const ctx = makeCtx({
      isAgent: vi.fn().mockReturnValue(true),
      acquireAgentRuntime: vi.fn().mockReturnValue(agentRuntime),
    });
    const orb = makeOrb({
      directives: [{ type: 'method', name: 'speak' }] as never,
    });
    const result = await executeOrb(orb, ctx);
    const orbData = result.output as Record<string, unknown>;
    expect(typeof orbData['speak']).toBe('function');
    (orbData['speak'] as (...a: unknown[]) => unknown)('hello');
    expect(agentRuntime.executeAction).toHaveBeenCalledWith('speak', ['hello']);
  });
});
