import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock logger
vi.mock('../logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { loadSkill, isAgent, applyDirectives, updateTraits } from '../skills-directives.js';
import type {
  LoadSkillContext,
  ApplyDirectivesContext,
  UpdateTraitsContext,
} from '../skills-directives.js';

// ──────────────────────────────────────────────────────────────────
// loadSkill
// ──────────────────────────────────────────────────────────────────

function makeLoadSkillCtx(): LoadSkillContext {
  return {
    proceduralSkills: new Map(),
    broadcastSkill: vi.fn(),
  };
}

function makeSkill(id: string, name: string, successRate = 0.8) {
  return { id, name, successRate };
}

describe('loadSkill', () => {
  it('adds a new skill to the map', () => {
    const ctx = makeLoadSkillCtx();
    const skill = makeSkill('skill-1', 'Jump');
    loadSkill(skill, ctx);
    expect(ctx.proceduralSkills.has('skill-1')).toBe(true);
    expect(ctx.proceduralSkills.get('skill-1')).toBe(skill);
  });

  it('broadcasts the skill after registering', () => {
    const ctx = makeLoadSkillCtx();
    const skill = makeSkill('skill-1', 'Jump');
    loadSkill(skill, ctx);
    expect(ctx.broadcastSkill).toHaveBeenCalledWith(skill);
  });

  it('averages successRate when skill already exists', () => {
    const ctx = makeLoadSkillCtx();
    const existing = makeSkill('skill-1', 'Jump', 0.6);
    loadSkill(existing, ctx);
    const updated = makeSkill('skill-1', 'Jump', 1.0);
    loadSkill(updated, ctx);
    // (0.6 + 1.0) / 2 = 0.8
    expect(updated.successRate).toBeCloseTo(0.8);
  });

  it('sets successRate to 0 for new skill with undefined successRate', () => {
    const ctx = makeLoadSkillCtx();
    const skill = { id: 'sk', name: 'Test' } as ReturnType<typeof makeSkill>;
    loadSkill(skill, ctx);
    expect(skill.successRate).toBe(0);
  });

  it('broadcasts updated skill even on duplicate', () => {
    const ctx = makeLoadSkillCtx();
    loadSkill(makeSkill('s', 'A', 0.5), ctx);
    loadSkill(makeSkill('s', 'A', 0.5), ctx);
    expect(ctx.broadcastSkill).toHaveBeenCalledTimes(2);
  });
});

// ──────────────────────────────────────────────────────────────────
// isAgent
// ──────────────────────────────────────────────────────────────────

function makeOrbWith(traitNames: string[]) {
  return {
    type: 'orb',
    name: 'test',
    directives: traitNames.map((n) => ({ type: 'trait', name: n })),
  };
}

describe('isAgent', () => {
  it('returns true for llm_agent trait', () => {
    expect(isAgent(makeOrbWith(['llm_agent']) as never)).toBe(true);
  });

  it('returns true for agent trait', () => {
    expect(isAgent(makeOrbWith(['agent']) as never)).toBe(true);
  });

  it('returns true for companion trait', () => {
    expect(isAgent(makeOrbWith(['companion']) as never)).toBe(true);
  });

  it('returns false for unrelated traits', () => {
    expect(isAgent(makeOrbWith(['physics', 'grabbable']) as never)).toBe(false);
  });

  it('returns false for node without directives', () => {
    expect(isAgent({ type: 'orb', name: 'x' } as never)).toBe(false);
  });

  it('returns false for empty directives array', () => {
    expect(isAgent(makeOrbWith([]) as never)).toBe(false);
  });

  it('returns true when agent trait is mixed with others', () => {
    expect(isAgent(makeOrbWith(['physics', 'llm_agent', 'grabbable']) as never)).toBe(true);
  });
});

// ──────────────────────────────────────────────────────────────────
// applyDirectives
// ──────────────────────────────────────────────────────────────────

function makeApplyCtx(): ApplyDirectivesContext {
  return {
    traitHandlers: new Map(),
    emit: vi.fn(),
    getCurrentScale: vi.fn().mockReturnValue(1),
    state: { update: vi.fn() } as never,
    evaluateExpression: vi.fn().mockReturnValue('eval-result'),
  };
}

describe('applyDirectives', () => {
  it('is a no-op when directives is absent', () => {
    const ctx = makeApplyCtx();
    const node = { type: 'orb', name: 'x' };
    expect(() => applyDirectives(node as never, ctx)).not.toThrow();
    expect(ctx.emit).not.toHaveBeenCalled();
  });

  it('calls handler.onAttach for a trait directive', () => {
    const ctx = makeApplyCtx();
    const onAttach = vi.fn();
    ctx.traitHandlers.set('physics' as never, { onAttach } as never);
    const node = {
      type: 'orb', name: 'ball',
      directives: [{ type: 'trait', name: 'physics', config: { mass: 2 } }],
    };
    applyDirectives(node as never, ctx);
    expect(onAttach).toHaveBeenCalledTimes(1);
    const [passedNode, passedConfig] = onAttach.mock.calls[0];
    expect(passedNode).toBe(node);
    expect(passedConfig).toEqual({ mass: 2 });
  });

  it('does not throw when trait handler is absent', () => {
    const ctx = makeApplyCtx();
    const node = {
      type: 'orb', name: 'x',
      directives: [{ type: 'trait', name: 'nonexistent' }],
    };
    expect(() => applyDirectives(node as never, ctx)).not.toThrow();
  });

  it('emits show-chat for chat trait', () => {
    const ctx = makeApplyCtx();
    const node = {
      type: 'orb', name: 'npc',
      directives: [{ type: 'trait', name: 'chat', config: { channel: 'main' } }],
    };
    applyDirectives(node as never, ctx);
    expect(ctx.emit).toHaveBeenCalledWith('show-chat', { channel: 'main' });
  });

  it('calls state.update for a state directive', () => {
    const ctx = makeApplyCtx();
    const node = {
      type: 'orb', name: 'x',
      directives: [{ type: 'state', body: { health: 100 } }],
    };
    applyDirectives(node as never, ctx);
    expect(ctx.state.update).toHaveBeenCalledWith({ health: 100 });
  });

  it('evaluates expression for on_mount lifecycle hook', () => {
    const ctx = makeApplyCtx();
    const node = {
      type: 'orb', name: 'x',
      directives: [{ type: 'lifecycle', hook: 'on_mount', body: 'init()' }],
    };
    applyDirectives(node as never, ctx);
    expect(ctx.evaluateExpression).toHaveBeenCalledWith('init()');
  });

  it('evaluates expression for mount lifecycle hook', () => {
    const ctx = makeApplyCtx();
    const node = {
      type: 'orb', name: 'x',
      directives: [{ type: 'lifecycle', hook: 'mount', body: 'setup()' }],
    };
    applyDirectives(node as never, ctx);
    expect(ctx.evaluateExpression).toHaveBeenCalledWith('setup()');
  });

  it('does not evaluate expression for non-mount lifecycle hooks', () => {
    const ctx = makeApplyCtx();
    const node = {
      type: 'orb', name: 'x',
      directives: [{ type: 'lifecycle', hook: 'on_destroy', body: 'cleanup()' }],
    };
    applyDirectives(node as never, ctx);
    expect(ctx.evaluateExpression).not.toHaveBeenCalled();
  });

  it('processes multiple directives in sequence', () => {
    const ctx = makeApplyCtx();
    const onAttach = vi.fn();
    ctx.traitHandlers.set('grabbable' as never, { onAttach } as never);
    const node = {
      type: 'orb', name: 'item',
      directives: [
        { type: 'trait', name: 'grabbable' },
        { type: 'state', body: { color: 'red' } },
        { type: 'lifecycle', hook: 'on_mount', body: 'init()' },
      ],
    };
    applyDirectives(node as never, ctx);
    expect(onAttach).toHaveBeenCalledTimes(1);
    expect(ctx.state.update).toHaveBeenCalledWith({ color: 'red' });
    expect(ctx.evaluateExpression).toHaveBeenCalledWith('init()');
  });
});

// ──────────────────────────────────────────────────────────────────
// updateTraits
// ──────────────────────────────────────────────────────────────────

function makeUpdateCtx(): UpdateTraitsContext {
  return {
    variables: new Map(),
    traitHandlers: new Map(),
    emit: vi.fn(),
    getCurrentScale: vi.fn().mockReturnValue(1),
    setOrbPosition: vi.fn(),
    getState: vi.fn().mockReturnValue({}),
    setState: vi.fn(),
  };
}

function makeOrbValue(directives: unknown[]) {
  return {
    __type: 'orb',
    name: 'testOrb',
    directives,
  };
}

describe('updateTraits', () => {
  it('calls handler.onUpdate for each orb with a trait directive', () => {
    const ctx = makeUpdateCtx();
    const onUpdate = vi.fn();
    ctx.traitHandlers.set('physics' as never, { onUpdate } as never);
    ctx.variables.set('ball', makeOrbValue([{ type: 'trait', name: 'physics', config: {} }]) as never);
    updateTraits(2451545.0, ctx);
    expect(onUpdate).toHaveBeenCalledTimes(1);
  });

  it('passes delta in seconds (~1/60)', () => {
    const ctx = makeUpdateCtx();
    const onUpdate = vi.fn();
    ctx.traitHandlers.set('physics' as never, { onUpdate } as never);
    ctx.variables.set('ball', makeOrbValue([{ type: 'trait', name: 'physics' }]) as never);
    updateTraits(2451545.0, ctx);
    const delta = onUpdate.mock.calls[0][3];
    expect(delta).toBeCloseTo(1 / 60, 5);
  });

  it('skips non-orb variables', () => {
    const ctx = makeUpdateCtx();
    const onUpdate = vi.fn();
    ctx.traitHandlers.set('physics' as never, { onUpdate } as never);
    ctx.variables.set('counter', 42 as never);
    ctx.variables.set('label', 'hello' as never);
    updateTraits(2451545.0, ctx);
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it('skips orbs without directives', () => {
    const ctx = makeUpdateCtx();
    const onUpdate = vi.fn();
    ctx.traitHandlers.set('physics' as never, { onUpdate } as never);
    ctx.variables.set('bare', { __type: 'orb', name: 'bare' } as never);
    updateTraits(2451545.0, ctx);
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it('skips directives that are not type=trait', () => {
    const ctx = makeUpdateCtx();
    const onUpdate = vi.fn();
    ctx.traitHandlers.set('physics' as never, { onUpdate } as never);
    ctx.variables.set('x', makeOrbValue([{ type: 'state', body: {} }]) as never);
    updateTraits(2451545.0, ctx);
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it('skips trait when handler is not registered', () => {
    const ctx = makeUpdateCtx();
    // no handler registered
    ctx.variables.set('x', makeOrbValue([{ type: 'trait', name: 'unknown' }]) as never);
    expect(() => updateTraits(2451545.0, ctx)).not.toThrow();
  });

  it('routes position_update events through setOrbPosition', () => {
    const ctx = makeUpdateCtx();
    const onUpdate = vi.fn().mockImplementation((_node, _cfg, traitCtx) => {
      traitCtx.emit('position_update', { position: [1, 2, 3] });
    });
    ctx.traitHandlers.set('move' as never, { onUpdate } as never);
    ctx.variables.set('ship', makeOrbValue([{ type: 'trait', name: 'move' }]) as never);
    updateTraits(2451545.0, ctx);
    expect(ctx.setOrbPosition).toHaveBeenCalledWith('ship', [1, 2, 3]);
  });

  it('forwards non-position_update events to ctx.emit', () => {
    const ctx = makeUpdateCtx();
    const onUpdate = vi.fn().mockImplementation((_node, _cfg, traitCtx) => {
      traitCtx.emit('custom-event', { data: 42 });
    });
    ctx.traitHandlers.set('custom' as never, { onUpdate } as never);
    ctx.variables.set('x', makeOrbValue([{ type: 'trait', name: 'custom' }]) as never);
    updateTraits(2451545.0, ctx);
    expect(ctx.emit).toHaveBeenCalledWith('custom-event', { data: 42 });
  });

  it('provides getState/setState on trait context', () => {
    const ctx = makeUpdateCtx();
    ctx.getState.mockReturnValue({ score: 10 });
    let capturedCtx: Record<string, unknown> | undefined;
    const onUpdate = vi.fn().mockImplementation((_n, _c, tc) => { capturedCtx = tc; });
    ctx.traitHandlers.set('state-trait' as never, { onUpdate } as never);
    ctx.variables.set('x', makeOrbValue([{ type: 'trait', name: 'state-trait' }]) as never);
    updateTraits(2451545.0, ctx);
    expect(typeof capturedCtx?.getState).toBe('function');
    expect(typeof capturedCtx?.setState).toBe('function');
    expect((capturedCtx?.getState as () => unknown)()).toEqual({ score: 10 });
  });

  it('handles multiple orbs with multiple traits', () => {
    const ctx = makeUpdateCtx();
    const onUpdatePhysics = vi.fn();
    const onUpdateGlow = vi.fn();
    ctx.traitHandlers.set('physics' as never, { onUpdate: onUpdatePhysics } as never);
    ctx.traitHandlers.set('glow' as never, { onUpdate: onUpdateGlow } as never);
    ctx.variables.set('a', makeOrbValue([
      { type: 'trait', name: 'physics' },
      { type: 'trait', name: 'glow' },
    ]) as never);
    ctx.variables.set('b', makeOrbValue([{ type: 'trait', name: 'physics' }]) as never);
    updateTraits(2451545.0, ctx);
    expect(onUpdatePhysics).toHaveBeenCalledTimes(2);
    expect(onUpdateGlow).toHaveBeenCalledTimes(1);
  });
});
