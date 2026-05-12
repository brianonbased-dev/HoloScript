import { describe, it, expect, beforeEach } from 'vitest';
import {
  statHandler,
  applyStatModifiers,
  type StatConfig,
  type StatModifier,
} from '../StatTrait';
import {
  createMockContext,
  createMockNode,
  attachTrait,
  sendEvent,
  getLastEvent,
  getEventCount,
} from './traitTestHelpers';

describe('StatTrait', () => {
  let node: Record<string, unknown>;
  let ctx: ReturnType<typeof createMockContext>;

  beforeEach(() => {
    node = createMockNode('stat-1');
    ctx = createMockContext();
  });

  // ---------------------------------------------------------------------------
  // onAttach
  // ---------------------------------------------------------------------------

  it('emits stat:ready on attach with effective value reflecting initial modifiers', () => {
    const cfg: Partial<StatConfig> = {
      name: 'strength',
      value: 10,
      modifiers: [{ source: 'gear:sword', delta: 3 }],
    };
    attachTrait(statHandler, node, cfg, ctx);
    const ev = getLastEvent(ctx, 'stat:ready') as {
      name: string;
      baseValue: number;
      effective: number;
    };
    expect(ev).toBeDefined();
    expect(ev.name).toBe('strength');
    expect(ev.baseValue).toBe(10);
    expect(ev.effective).toBe(13);
  });

  // ---------------------------------------------------------------------------
  // stat:set — FALSE + TRUE pairs per G.GOLD.013
  // ---------------------------------------------------------------------------

  it('FALSE: stat:set with non-numeric value emits no stat:changed', () => {
    attachTrait(statHandler, node, { name: 'agility', value: 5 }, ctx);
    sendEvent(statHandler, node, { name: 'agility', value: 5 }, ctx, {
      type: 'stat:set',
      value: 'not-a-number',
    });
    expect(getEventCount(ctx, 'stat:changed')).toBe(0);
  });

  it('TRUE: stat:set with numeric value updates baseValue and emits stat:changed', () => {
    const cfg: Partial<StatConfig> = { name: 'agility', value: 5 };
    attachTrait(statHandler, node, cfg, ctx);
    sendEvent(statHandler, node, cfg, ctx, { type: 'stat:set', value: 12 });
    const ev = getLastEvent(ctx, 'stat:changed') as {
      baseValue: number;
      effective: number;
      cause: string;
    };
    expect(ev.baseValue).toBe(12);
    expect(ev.effective).toBe(12);
    expect(ev.cause).toBe('set');
  });

  // ---------------------------------------------------------------------------
  // stat:modify — FALSE + TRUE pairs
  // ---------------------------------------------------------------------------

  it('FALSE: stat:modify without source string emits no stat:changed', () => {
    attachTrait(statHandler, node, { name: 'luck', value: 1 }, ctx);
    sendEvent(statHandler, node, { name: 'luck', value: 1 }, ctx, {
      type: 'stat:modify',
      delta: 2,
    });
    expect(getEventCount(ctx, 'stat:changed')).toBe(0);
  });

  it('TRUE: stat:modify with valid source+delta pushes modifier and shifts effective', () => {
    const cfg: Partial<StatConfig> = { name: 'luck', value: 1 };
    attachTrait(statHandler, node, cfg, ctx);
    sendEvent(statHandler, node, cfg, ctx, {
      type: 'stat:modify',
      source: 'amulet',
      delta: 4,
    });
    const ev = getLastEvent(ctx, 'stat:changed') as {
      effective: number;
      modifier: { source: string; delta: number };
    };
    expect(ev.effective).toBe(5);
    expect(ev.modifier.source).toBe('amulet');
    expect(ev.modifier.delta).toBe(4);
  });

  it('TRUE: clamps effective to [min, max] regardless of modifier magnitude', () => {
    const cfg: Partial<StatConfig> = {
      name: 'hp',
      value: 50,
      min: 0,
      max: 100,
      modifiers: [{ source: 'heal', delta: 9999 }],
    };
    attachTrait(statHandler, node, cfg, ctx);
    const ev = getLastEvent(ctx, 'stat:ready') as { effective: number };
    expect(ev.effective).toBe(100);
  });

  // ---------------------------------------------------------------------------
  // G.GOLD.015 — experienced-failure category: zero delta
  // ---------------------------------------------------------------------------

  it('G.GOLD.015 edge: stat:modify with delta=0 still emits stat:changed (no silent swallow)', () => {
    const cfg: Partial<StatConfig> = { name: 'mana', value: 30 };
    attachTrait(statHandler, node, cfg, ctx);
    sendEvent(statHandler, node, cfg, ctx, {
      type: 'stat:modify',
      source: 'placeholder',
      delta: 0,
    });
    expect(getEventCount(ctx, 'stat:changed')).toBe(1);
    const ev = getLastEvent(ctx, 'stat:changed') as { effective: number; modifier: StatModifier };
    expect(ev.effective).toBe(30);
    expect(ev.modifier.delta).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // stat:query reflects state
  // ---------------------------------------------------------------------------

  it('stat:query returns current snapshot including modifier list', () => {
    const cfg: Partial<StatConfig> = { name: 'def', value: 7 };
    attachTrait(statHandler, node, cfg, ctx);
    sendEvent(statHandler, node, cfg, ctx, { type: 'stat:modify', source: 'shield', delta: 3 });
    sendEvent(statHandler, node, cfg, ctx, { type: 'stat:query', queryId: 'q1' });
    const ev = getLastEvent(ctx, 'stat:value') as {
      queryId: string;
      baseValue: number;
      effective: number;
      modifiers: StatModifier[];
    };
    expect(ev.queryId).toBe('q1');
    expect(ev.baseValue).toBe(7);
    expect(ev.effective).toBe(10);
    expect(ev.modifiers).toEqual([{ source: 'shield', delta: 3 }]);
  });

  // ---------------------------------------------------------------------------
  // applyStatModifiers — pure helper (FALSE + TRUE per G.GOLD.013)
  // ---------------------------------------------------------------------------

  describe('applyStatModifiers (pure)', () => {
    it('FALSE: no modifiers returns base value unchanged', () => {
      expect(applyStatModifiers(10, [])).toBe(10);
    });

    it('TRUE: modifiers sum and clamp', () => {
      const mods: StatModifier[] = [
        { source: 'a', delta: 3 },
        { source: 'b', delta: -1 },
        { source: 'c', delta: 5 },
      ];
      expect(applyStatModifiers(0, mods)).toBe(7);
      expect(applyStatModifiers(0, mods, undefined, 5)).toBe(5);
      expect(applyStatModifiers(0, mods, 10, undefined)).toBe(10);
    });

    it('FALSE: min clamp without lower-bound breach returns sum', () => {
      expect(applyStatModifiers(5, [{ source: 'x', delta: 1 }], 0, 100)).toBe(6);
    });

    it('TRUE: min clamp engages when sum < min', () => {
      expect(applyStatModifiers(5, [{ source: 'x', delta: -50 }], 0, 100)).toBe(0);
    });
  });
});
