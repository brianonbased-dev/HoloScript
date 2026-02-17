import { describe, it, expect, beforeEach } from 'vitest';
import { factionHandler } from '../FactionTrait';
import { createMockContext, createMockNode, attachTrait, sendEvent, updateTrait, getEventCount, getLastEvent } from './traitTestHelpers';

describe('FactionTrait', () => {
  let node: Record<string, unknown>;
  let ctx: ReturnType<typeof createMockContext>;
  const cfg = {
    faction_id: 'guards',
    reputation: { 'bandits': -60, 'merchants': 40 } as Record<string, number>,
    hostile_factions: ['demons'],
    allied_factions: ['knights'],
    neutral_threshold: 25,
    friendly_threshold: 50,
    allied_threshold: 75,
    reputation_decay: 0.01,
    decay_interval: 60,
    history_limit: 100,
  };

  beforeEach(() => {
    node = createMockNode('fac');
    ctx = createMockContext();
    attachTrait(factionHandler, node, cfg, ctx);
  });

  it('initializes relations from config', () => {
    expect(getEventCount(ctx, 'faction_registered')).toBe(1);
    const s = (node as any).__factionState;
    expect(s.relations.size).toBe(4); // bandits, merchants, demons, knights
  });

  it('hostile factions locked at hostile', () => {
    const s = (node as any).__factionState;
    const demon = s.relations.get('demons');
    expect(demon.type).toBe('hostile');
    expect(demon.locked).toBe(true);
  });

  it('allied factions locked at allied', () => {
    const s = (node as any).__factionState;
    const knight = s.relations.get('knights');
    expect(knight.type).toBe('allied');
    expect(knight.locked).toBe(true);
  });

  it('reputation_change modifies standing', () => {
    sendEvent(factionHandler, node, cfg, ctx, {
      type: 'reputation_change',
      factionId: 'merchants',
      amount: 20,
      reason: 'trade',
    });
    const s = (node as any).__factionState;
    expect(s.relations.get('merchants').standing).toBe(60);
    expect(getEventCount(ctx, 'reputation_updated')).toBe(1);
  });

  it('reputation clamped to -100..100', () => {
    sendEvent(factionHandler, node, cfg, ctx, {
      type: 'reputation_change',
      factionId: 'merchants',
      amount: 200,
      reason: 'extreme',
    });
    expect((node as any).__factionState.relations.get('merchants').standing).toBe(100);
  });

  it('locked factions ignore reputation changes', () => {
    sendEvent(factionHandler, node, cfg, ctx, {
      type: 'reputation_change',
      factionId: 'demons',
      amount: 100,
      reason: 'peace treaty',
    });
    expect((node as any).__factionState.relations.get('demons').standing).toBe(-100);
  });

  it('relation type changes emitted', () => {
    sendEvent(factionHandler, node, cfg, ctx, {
      type: 'reputation_change',
      factionId: 'merchants',
      amount: 40,
      reason: 'alliance',
    });
    // merchants: 40 + 40 = 80 => allied
    expect(getEventCount(ctx, 'faction_relation_changed')).toBe(1);
  });

  it('get_relation returns current standing', () => {
    sendEvent(factionHandler, node, cfg, ctx, { type: 'get_relation', factionId: 'bandits', queryId: 'q1' });
    expect(getEventCount(ctx, 'relation_result')).toBe(1);
  });

  it('check_hostile returns correct status', () => {
    sendEvent(factionHandler, node, cfg, ctx, { type: 'check_hostile', factionId: 'bandits', queryId: 'q2' });
    const ev = getLastEvent(ctx, 'hostility_result') as any;
    expect(ev.isHostile).toBe(true);
  });

  it('new faction starts at neutral', () => {
    sendEvent(factionHandler, node, cfg, ctx, {
      type: 'reputation_change',
      factionId: 'thieves',
      amount: -10,
      reason: 'theft',
    });
    expect((node as any).__factionState.relations.has('thieves')).toBe(true);
    expect((node as any).__factionState.relations.get('thieves').standing).toBe(-10);
  });

  it('detach cleans up', () => {
    factionHandler.onDetach?.(node as any, cfg as any, ctx as any);
    expect(getEventCount(ctx, 'faction_unregistered')).toBe(1);
    expect((node as any).__factionState).toBeUndefined();
  });
});
