import { describe, it, expect, beforeEach } from 'vitest';
import { factionHandler } from '../FactionTrait';
import { createMockContext, createMockNode, attachTrait, sendEvent, updateTrait, getEventCount, getLastEvent } from './traitTestHelpers';

describe('FactionTrait', () => {
  let node: Record<string, unknown>;
  let ctx: ReturnType<typeof createMockContext>;
  const cfg = {
    faction_id: 'player_faction',
    reputation: { orcs: -50, elves: 60 } as Record<string, number>,
    hostile_factions: ['demons'] as string[],
    allied_factions: ['angels'] as string[],
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

  it('registers faction on attach', () => {
    expect(getEventCount(ctx, 'faction_registered')).toBe(1);
    expect((node as any).__factionState).toBeDefined();
  });

  it('initializes relations from config', () => {
    const state = (node as any).__factionState;
    expect(state.relations.get('orcs')).toBeDefined();
    expect(state.relations.get('orcs').standing).toBe(-50);
    expect(state.relations.get('elves').standing).toBe(60);
  });

  it('locked hostile factions default to -100', () => {
    const state = (node as any).__factionState;
    expect(state.relations.get('demons').standing).toBe(-100);
    expect(state.relations.get('demons').locked).toBe(true);
  });

  it('locked allied factions default to 100', () => {
    const state = (node as any).__factionState;
    expect(state.relations.get('angels').standing).toBe(100);
    expect(state.relations.get('angels').locked).toBe(true);
  });

  it('reputation_change updates standing', () => {
    sendEvent(factionHandler, node, cfg, ctx, {
      type: 'reputation_change',
      factionId: 'orcs',
      amount: 30,
      reason: 'helped orc',
    });
    const state = (node as any).__factionState;
    expect(state.relations.get('orcs').standing).toBe(-20);
    expect(getEventCount(ctx, 'reputation_updated')).toBe(1);
  });

  it('reputation_change for locked faction is ignored', () => {
    sendEvent(factionHandler, node, cfg, ctx, {
      type: 'reputation_change',
      factionId: 'demons',
      amount: 50,
    });
    expect((node as any).__factionState.relations.get('demons').standing).toBe(-100);
  });

  it('reputation_change emits relation_changed on threshold cross', () => {
    sendEvent(factionHandler, node, cfg, ctx, {
      type: 'reputation_change',
      factionId: 'orcs',
      amount: 80,
      reason: 'alliance',
    });
    expect(getEventCount(ctx, 'faction_relation_changed')).toBe(1);
  });

  it('get_relation returns relation info', () => {
    sendEvent(factionHandler, node, cfg, ctx, { type: 'get_relation', factionId: 'elves', queryId: 'q1' });
    const result = getLastEvent(ctx, 'relation_result');
    expect(result.factionId).toBe('elves');
    expect(result.standing).toBe(60);
  });

  it('check_hostile returns hostility', () => {
    sendEvent(factionHandler, node, cfg, ctx, { type: 'check_hostile', factionId: 'demons', queryId: 'q2' });
    const result = getLastEvent(ctx, 'hostility_result');
    expect(result.isHostile).toBe(true);
  });

  it('history is recorded', () => {
    sendEvent(factionHandler, node, cfg, ctx, {
      type: 'reputation_change',
      factionId: 'orcs',
      amount: 10,
      reason: 'trade',
    });
    const state = (node as any).__factionState;
    expect(state.history).toHaveLength(1);
  });

  it('detach unregisters', () => {
    factionHandler.onDetach?.(node as any, cfg as any, ctx as any);
    expect(getEventCount(ctx, 'faction_unregistered')).toBe(1);
    expect((node as any).__factionState).toBeUndefined();
  });
});
