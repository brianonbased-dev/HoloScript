import { describe, it, expect, beforeEach } from 'vitest';
import { factionHandler } from '../FactionTrait';
import { createMockContext, createMockNode, attachTrait, sendEvent, updateTrait, getLastEvent, getEventCount } from './traitTestHelpers';

describe('FactionTrait', () => {
  let node: Record<string, unknown>;
  let ctx: ReturnType<typeof createMockContext>;
  const cfg = {
    faction_id: 'humans',
    reputation: { elves: 60, orcs: -40 },
    hostile_factions: ['demons'],
    allied_factions: ['dwarves'],
    neutral_threshold: 25,
    friendly_threshold: 50,
    allied_threshold: 75,
    reputation_decay: 0.01,
    decay_interval: 60,
    history_limit: 100,
  };

  beforeEach(() => {
    node = createMockNode('faction-unit');
    ctx = createMockContext();
    attachTrait(factionHandler, node, cfg, ctx);
  });

  it('initializes relations from config', () => {
    const s = (node as any).__factionState;
    expect(s.relations.size).toBeGreaterThanOrEqual(4);
    expect(s.relations.get('elves').standing).toBe(60);
    expect(s.relations.get('orcs').standing).toBe(-40);
  });

  it('locks hostile factions', () => {
    const s = (node as any).__factionState;
    expect(s.relations.get('demons').type).toBe('hostile');
    expect(s.relations.get('demons').locked).toBe(true);
  });

  it('locks allied factions', () => {
    const s = (node as any).__factionState;
    expect(s.relations.get('dwarves').type).toBe('allied');
    expect(s.relations.get('dwarves').locked).toBe(true);
  });

  it('emits faction_registered on attach', () => {
    expect(getEventCount(ctx, 'faction_registered')).toBe(1);
  });

  it('handles reputation_change event', () => {
    sendEvent(factionHandler, node, cfg, ctx, { type: 'reputation_change', factionId: 'elves', amount: 20, reason: 'quest' });
    const s = (node as any).__factionState;
    expect(s.relations.get('elves').standing).toBe(80);
    expect(getEventCount(ctx, 'reputation_updated')).toBe(1);
  });

  it('clamps standing to [-100, 100]', () => {
    sendEvent(factionHandler, node, cfg, ctx, { type: 'reputation_change', factionId: 'elves', amount: 500 });
    expect((node as any).__factionState.relations.get('elves').standing).toBe(100);
  });

  it('emits faction_relation_changed on type transition', () => {
    // elves at 60 (friendly), push to 80 (allied)
    sendEvent(factionHandler, node, cfg, ctx, { type: 'reputation_change', factionId: 'elves', amount: 20 });
    expect(getEventCount(ctx, 'faction_relation_changed')).toBe(1);
    const ev = getLastEvent(ctx, 'faction_relation_changed') as any;
    expect(ev.from).toBe('friendly');
    expect(ev.to).toBe('allied');
  });

  it('ignores reputation changes to locked factions', () => {
    sendEvent(factionHandler, node, cfg, ctx, { type: 'reputation_change', factionId: 'demons', amount: 50 });
    expect((node as any).__factionState.relations.get('demons').standing).toBe(-100);
  });

  it('creates new relation for unknown faction', () => {
    sendEvent(factionHandler, node, cfg, ctx, { type: 'reputation_change', factionId: 'goblins', amount: -30 });
    const s = (node as any).__factionState;
    expect(s.relations.has('goblins')).toBe(true);
    expect(s.relations.get('goblins').standing).toBe(-30);
  });

  it('records history', () => {
    sendEvent(factionHandler, node, cfg, ctx, { type: 'reputation_change', factionId: 'orcs', amount: 10, reason: 'trade' });
    expect((node as any).__factionState.history.length).toBe(1);
  });

  it('get_relation returns relation info', () => {
    sendEvent(factionHandler, node, cfg, ctx, { type: 'get_relation', factionId: 'elves', queryId: 'q1' });
    const r = getLastEvent(ctx, 'relation_result') as any;
    expect(r.relation).toBe('friendly');
    expect(r.standing).toBe(60);
  });

  it('check_hostile returns hostility', () => {
    sendEvent(factionHandler, node, cfg, ctx, { type: 'check_hostile', factionId: 'demons', queryId: 'q2' });
    const r = getLastEvent(ctx, 'hostility_result') as any;
    expect(r.isHostile).toBe(true);
  });

  it('cleans up on detach', () => {
    factionHandler.onDetach?.(node as any, factionHandler.defaultConfig, ctx as any);
    expect((node as any).__factionState).toBeUndefined();
    expect(getEventCount(ctx, 'faction_unregistered')).toBe(1);
  });
});
