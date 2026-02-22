/**
 * FactionTrait — Production Test Suite
 */
import { describe, it, expect, vi } from 'vitest';
import { factionHandler } from '../FactionTrait';

function makeNode() { return { id: 'faction_node' }; }
function makeCtx() { return { emit: vi.fn() }; }
function attach(cfg: any = {}) {
  const node = makeNode();
  const ctx = makeCtx();
  const config = { ...factionHandler.defaultConfig!, ...cfg };
  factionHandler.onAttach!(node, config, ctx);
  return { node: node as any, ctx, config };
}

// ─── defaultConfig ─────────────────────────────────────────────────────────────

describe('factionHandler.defaultConfig', () => {
  const d = factionHandler.defaultConfig!;
  it('faction_id=""', () => expect(d.faction_id).toBe(''));
  it('reputation={}', () => expect(d.reputation).toEqual({}));
  it('hostile_factions=[]', () => expect(d.hostile_factions).toHaveLength(0));
  it('allied_factions=[]', () => expect(d.allied_factions).toHaveLength(0));
  it('neutral_threshold=25', () => expect(d.neutral_threshold).toBe(25));
  it('friendly_threshold=50', () => expect(d.friendly_threshold).toBe(50));
  it('allied_threshold=75', () => expect(d.allied_threshold).toBe(75));
  it('reputation_decay=0.01', () => expect(d.reputation_decay).toBe(0.01));
  it('decay_interval=60', () => expect(d.decay_interval).toBe(60));
  it('history_limit=100', () => expect(d.history_limit).toBe(100));
});

// ─── onAttach ─────────────────────────────────────────────────────────────────

describe('factionHandler.onAttach', () => {
  it('creates __factionState', () => expect(attach().node.__factionState).toBeDefined());
  it('relations Map starts empty for default config', () => expect(attach().node.__factionState.relations.size).toBe(0));
  it('history starts empty', () => expect(attach().node.__factionState.history).toHaveLength(0));
  it('decayTimer=0', () => expect(attach().node.__factionState.decayTimer).toBe(0));
  it('emits faction_registered', () => {
    const { ctx } = attach({ faction_id: 'elves' });
    expect(ctx.emit).toHaveBeenCalledWith('faction_registered', expect.objectContaining({ factionId: 'elves' }));
  });
  it('initializes relations from config.reputation', () => {
    const { node } = attach({ reputation: { orcs: -50, humans: 30 } });
    expect(node.__factionState.relations.has('orcs')).toBe(true);
    expect(node.__factionState.relations.has('humans')).toBe(true);
  });
  it('reputation standing is stored correctly', () => {
    const { node } = attach({ reputation: { orcs: -50 } });
    expect(node.__factionState.relations.get('orcs').standing).toBe(-50);
  });
  it('hostile_factions get standing=-100 and locked=true', () => {
    const { node } = attach({ hostile_factions: ['undead'] });
    const r = node.__factionState.relations.get('undead');
    expect(r.standing).toBe(-100);
    expect(r.locked).toBe(true);
    expect(r.type).toBe('hostile');
  });
  it('allied_factions get standing=100 and locked=true', () => {
    const { node } = attach({ allied_factions: ['rangers'] });
    const r = node.__factionState.relations.get('rangers');
    expect(r.standing).toBe(100);
    expect(r.locked).toBe(true);
    expect(r.type).toBe('allied');
  });
  it('faction in hostile_factions AND reputation is locked', () => {
    const { node } = attach({ reputation: { demons: -20 }, hostile_factions: ['demons'] });
    expect(node.__factionState.relations.get('demons').locked).toBe(true);
  });
});

// ─── onDetach ─────────────────────────────────────────────────────────────────

describe('factionHandler.onDetach', () => {
  it('removes __factionState', () => {
    const { node, config, ctx } = attach();
    factionHandler.onDetach!(node, config, ctx);
    expect(node.__factionState).toBeUndefined();
  });
  it('emits faction_unregistered', () => {
    const { node, config, ctx } = attach({ faction_id: 'dwarves' });
    ctx.emit.mockClear();
    factionHandler.onDetach!(node, config, ctx);
    expect(ctx.emit).toHaveBeenCalledWith('faction_unregistered', expect.objectContaining({ factionId: 'dwarves' }));
  });
});

// ─── onEvent — reputation_change ─────────────────────────────────────────────

describe('factionHandler.onEvent — reputation_change', () => {
  it('creates new relation when unknown faction', () => {
    const { node, ctx, config } = attach();
    factionHandler.onEvent!(node, config, ctx, { type: 'reputation_change', factionId: 'gnomes', amount: 10, reason: 'quest' });
    expect(node.__factionState.relations.has('gnomes')).toBe(true);
  });
  it('increases standing', () => {
    const { node, ctx, config } = attach({ reputation: { gnomes: 20 } });
    factionHandler.onEvent!(node, config, ctx, { type: 'reputation_change', factionId: 'gnomes', amount: 15 });
    expect(node.__factionState.relations.get('gnomes').standing).toBe(35);
  });
  it('decreases standing', () => {
    const { node, ctx, config } = attach({ reputation: { gnomes: 30 } });
    factionHandler.onEvent!(node, config, ctx, { type: 'reputation_change', factionId: 'gnomes', amount: -20 });
    expect(node.__factionState.relations.get('gnomes').standing).toBe(10);
  });
  it('clamps standing at +100', () => {
    const { node, ctx, config } = attach({ reputation: { gnomes: 90 } });
    factionHandler.onEvent!(node, config, ctx, { type: 'reputation_change', factionId: 'gnomes', amount: 50 });
    expect(node.__factionState.relations.get('gnomes').standing).toBe(100);
  });
  it('clamps standing at -100', () => {
    const { node, ctx, config } = attach({ reputation: { gnomes: -90 } });
    factionHandler.onEvent!(node, config, ctx, { type: 'reputation_change', factionId: 'gnomes', amount: -50 });
    expect(node.__factionState.relations.get('gnomes').standing).toBe(-100);
  });
  it('locked faction ignores reputation change', () => {
    const { node, ctx, config } = attach({ hostile_factions: ['undead'] });
    factionHandler.onEvent!(node, config, ctx, { type: 'reputation_change', factionId: 'undead', amount: 200 });
    expect(node.__factionState.relations.get('undead').standing).toBe(-100);
  });
  it('records history entry', () => {
    const { node, ctx, config } = attach();
    factionHandler.onEvent!(node, config, ctx, { type: 'reputation_change', factionId: 'elves', amount: 10, reason: 'trade', sourceId: 'quest_01' });
    expect(node.__factionState.history).toHaveLength(1);
    expect(node.__factionState.history[0].factionId).toBe('elves');
    expect(node.__factionState.history[0].reason).toBe('trade');
  });
  it('history limited by history_limit', () => {
    const { node, ctx, config } = attach({ history_limit: 3 });
    for (let i = 0; i < 5; i++) {
      factionHandler.onEvent!(node, config, ctx, { type: 'reputation_change', factionId: 'elves', amount: 1 });
    }
    expect(node.__factionState.history).toHaveLength(3);
  });
  it('emits reputation_updated', () => {
    const { node, ctx, config } = attach();
    ctx.emit.mockClear();
    factionHandler.onEvent!(node, config, ctx, { type: 'reputation_change', factionId: 'orcs', amount: 5, reason: 'trade' });
    expect(ctx.emit).toHaveBeenCalledWith('reputation_updated', expect.objectContaining({ factionId: 'orcs', change: 5, reason: 'trade' }));
  });
  it('emits faction_relation_changed when type transitions', () => {
    // neutral → friendly: need standing > 50 (friendly_threshold). Start at 0, add 60.
    const { node, ctx, config } = attach();
    ctx.emit.mockClear();
    factionHandler.onEvent!(node, config, ctx, { type: 'reputation_change', factionId: 'merchants', amount: 60 });
    expect(ctx.emit).toHaveBeenCalledWith('faction_relation_changed', expect.objectContaining({ factionId: 'merchants', from: 'neutral', to: 'friendly' }));
  });
  it('no faction_relation_changed when type stays same', () => {
    const { node, ctx, config } = attach({ reputation: { elves: 10 } });
    ctx.emit.mockClear();
    factionHandler.onEvent!(node, config, ctx, { type: 'reputation_change', factionId: 'elves', amount: 5 }); // stays neutral
    expect(ctx.emit).not.toHaveBeenCalledWith('faction_relation_changed', expect.anything());
  });
  it('standing=-100 maps to hostile relation type', () => {
    const { node, ctx, config } = attach();
    factionHandler.onEvent!(node, config, ctx, { type: 'reputation_change', factionId: 'orcs', amount: -100 });
    expect(node.__factionState.relations.get('orcs').type).toBe('hostile');
  });
  it('standing > allied_threshold maps to allied relation type', () => {
    const { node, ctx, config } = attach({ allied_threshold: 75 });
    factionHandler.onEvent!(node, config, ctx, { type: 'reputation_change', factionId: 'rangers', amount: 80 });
    expect(node.__factionState.relations.get('rangers').type).toBe('allied');
  });
});

// ─── onEvent — get_relation ───────────────────────────────────────────────────

describe('factionHandler.onEvent — get_relation', () => {
  it('returns relation type and standing', () => {
    const { node, ctx, config } = attach({ reputation: { orcs: -50 } });
    ctx.emit.mockClear();
    factionHandler.onEvent!(node, config, ctx, { type: 'get_relation', factionId: 'orcs', queryId: 'r1' });
    expect(ctx.emit).toHaveBeenCalledWith('relation_result', expect.objectContaining({ queryId: 'r1', factionId: 'orcs', standing: -50 }));
  });
  it('returns neutral/0 for unknown faction', () => {
    const { node, ctx, config } = attach();
    factionHandler.onEvent!(node, config, ctx, { type: 'get_relation', factionId: 'goblins', queryId: 'r2' });
    const call = ctx.emit.mock.calls.find((c: any[]) => c[0] === 'relation_result')!;
    expect(call[1].relation).toBe('neutral');
    expect(call[1].standing).toBe(0);
  });
});

// ─── onEvent — check_hostile ──────────────────────────────────────────────────

describe('factionHandler.onEvent — check_hostile', () => {
  it('isHostile=true for hostile faction', () => {
    const { node, ctx, config } = attach({ hostile_factions: ['undead'] });
    ctx.emit.mockClear();
    factionHandler.onEvent!(node, config, ctx, { type: 'check_hostile', factionId: 'undead', queryId: 'h1' });
    const call = ctx.emit.mock.calls.find((c: any[]) => c[0] === 'hostility_result')!;
    expect(call[1].isHostile).toBe(true);
  });
  it('isHostile=true for unfriendly standing', () => {
    // standing between -25*0.4=-10 and -25: unfriendly. use -15
    const { node, ctx, config } = attach({ reputation: { gnomes: -15 } });
    ctx.emit.mockClear();
    factionHandler.onEvent!(node, config, ctx, { type: 'check_hostile', factionId: 'gnomes' });
    const call = ctx.emit.mock.calls.find((c: any[]) => c[0] === 'hostility_result')!;
    expect(call[1].isHostile).toBe(true);
  });
  it('isHostile=false for friendly faction', () => {
    const { node, ctx, config } = attach({ reputation: { humans: 60 } });
    factionHandler.onEvent!(node, config, ctx, { type: 'check_hostile', factionId: 'humans' });
    const call = ctx.emit.mock.calls.find((c: any[]) => c[0] === 'hostility_result')!;
    expect(call[1].isHostile).toBe(false);
  });
  it('isHostile=false for unknown faction', () => {
    const { node, ctx, config } = attach();
    factionHandler.onEvent!(node, config, ctx, { type: 'check_hostile', factionId: 'unknowns' });
    const call = ctx.emit.mock.calls.find((c: any[]) => c[0] === 'hostility_result')!;
    expect(call[1].isHostile).toBe(false);
  });
});

// ─── onUpdate — decay ─────────────────────────────────────────────────────────

describe('factionHandler.onUpdate — decay', () => {
  it('accumulates decayTimer', () => {
    const { node, ctx, config } = attach();
    factionHandler.onUpdate!(node, config, ctx, 10);
    expect(node.__factionState.decayTimer).toBe(10);
  });
  it('resets decayTimer after decay_interval', () => {
    const { node, ctx, config } = attach({ decay_interval: 5 });
    factionHandler.onUpdate!(node, config, ctx, 6);
    expect(node.__factionState.decayTimer).toBe(0);
  });
  it('positive standing decays toward 0', () => {
    const { node, ctx, config } = attach({ reputation: { elves: 50 }, reputation_decay: 5, decay_interval: 1 });
    factionHandler.onUpdate!(node, config, ctx, 2);
    expect(node.__factionState.relations.get('elves').standing).toBe(45);
  });
  it('negative standing decays toward 0', () => {
    const { node, ctx, config } = attach({ reputation: { orcs: -50 }, reputation_decay: 5, decay_interval: 1 });
    factionHandler.onUpdate!(node, config, ctx, 2);
    expect(node.__factionState.relations.get('orcs').standing).toBe(-45);
  });
  it('locked relations do not decay', () => {
    const { node, ctx, config } = attach({ hostile_factions: ['undead'], reputation_decay: 20, decay_interval: 1 });
    factionHandler.onUpdate!(node, config, ctx, 2);
    expect(node.__factionState.relations.get('undead').standing).toBe(-100);
  });
  it('emits faction_relation_changed when decay crosses threshold', () => {
    // Start at 51 (friendly, > friendly_threshold=50), decay by 5 → 46 (neutral)
    const { node, ctx, config } = attach({ reputation: { merchants: 51 }, reputation_decay: 5, decay_interval: 1, friendly_threshold: 50 });
    ctx.emit.mockClear();
    factionHandler.onUpdate!(node, config, ctx, 2);
    expect(ctx.emit).toHaveBeenCalledWith('faction_relation_changed', expect.objectContaining({ factionId: 'merchants', from: 'friendly' }));
  });
});
