/**
 * FactionTrait — Production Tests
 *
 * Tests: initial relation setup from config, locked hostile/allied factions,
 * reputation_change events (clamping to ±100, relation type transitions, history),
 * reputation decay toward neutral on update, get_relation and check_hostile queries.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { factionHandler } from '../FactionTrait';

// ─── Helpers ───────────────────────────────────────────────────────────────────

function makeNode() {
  return {} as any;
}

function makeCtx() {
  return { emit: vi.fn() };
}

function cfg(overrides: Record<string, unknown> = {}) {
  return { ...factionHandler.defaultConfig, ...overrides };
}

function attach(node: any, config: any, ctx: any) {
  factionHandler.onAttach!(node, config, ctx);
}
function update(node: any, config: any, ctx: any, delta: number) {
  factionHandler.onUpdate!(node, config, ctx, delta);
}
function dispatch(node: any, config: any, ctx: any, evt: Record<string, unknown>) {
  factionHandler.onEvent!(node, config, ctx, evt as any);
}

function state(node: any) {
  return (node as any).__factionState;
}

// ─── defaultConfig ─────────────────────────────────────────────────────────────

describe('FactionTrait — defaultConfig', () => {
  it('faction_id defaults to empty string', () => expect(factionHandler.defaultConfig.faction_id).toBe(''));
  it('neutral_threshold defaults to 25', () => expect(factionHandler.defaultConfig.neutral_threshold).toBe(25));
  it('friendly_threshold defaults to 50', () => expect(factionHandler.defaultConfig.friendly_threshold).toBe(50));
  it('allied_threshold defaults to 75', () => expect(factionHandler.defaultConfig.allied_threshold).toBe(75));
  it('reputation_decay defaults to 0.01', () => expect(factionHandler.defaultConfig.reputation_decay).toBe(0.01));
  it('decay_interval defaults to 60', () => expect(factionHandler.defaultConfig.decay_interval).toBe(60));
});

// ─── onAttach ─────────────────────────────────────────────────────────────────

describe('FactionTrait — onAttach', () => {
  it('creates __factionState on node', () => {
    const n = makeNode();
    attach(n, cfg({ faction_id: 'heroes', reputation: {} }), makeCtx());
    expect(state(n)).toBeDefined();
  });

  it('initialises relations from reputation map', () => {
    const n = makeNode();
    attach(n, cfg({ reputation: { bandits: -60, merchants: 40 } }), makeCtx());
    const rel = state(n).relations;
    expect(rel.get('bandits').standing).toBe(-60);
    expect(rel.get('merchants').standing).toBe(40);
  });

  it('hostile_factions get standing -100 and are locked', () => {
    const n = makeNode();
    attach(n, cfg({ hostile_factions: ['wolves'] }), makeCtx());
    const rel = state(n).relations.get('wolves');
    expect(rel.standing).toBe(-100);
    expect(rel.locked).toBe(true);
    expect(rel.type).toBe('hostile');
  });

  it('allied_factions get standing 100 and are locked', () => {
    const n = makeNode();
    attach(n, cfg({ allied_factions: ['knights'] }), makeCtx());
    const rel = state(n).relations.get('knights');
    expect(rel.standing).toBe(100);
    expect(rel.locked).toBe(true);
    expect(rel.type).toBe('allied');
  });

  it('emits faction_registered', () => {
    const n = makeNode();
    const ctx = makeCtx();
    attach(n, cfg({ faction_id: 'guilds' }), ctx);
    expect(ctx.emit).toHaveBeenCalledWith('faction_registered', expect.objectContaining({ factionId: 'guilds' }));
  });
});

// ─── onDetach ─────────────────────────────────────────────────────────────────

describe('FactionTrait — onDetach', () => {
  it('removes __factionState', () => {
    const n = makeNode();
    const config = cfg({ faction_id: 'test' });
    const ctx = makeCtx();
    attach(n, config, ctx);
    factionHandler.onDetach!(n, config, ctx);
    expect(state(n)).toBeUndefined();
  });
  it('emits faction_unregistered', () => {
    const n = makeNode();
    const config = cfg({ faction_id: 'alliance' });
    const ctx = makeCtx();
    attach(n, config, ctx);
    ctx.emit.mockClear();
    factionHandler.onDetach!(n, config, ctx);
    expect(ctx.emit).toHaveBeenCalledWith('faction_unregistered', expect.objectContaining({ factionId: 'alliance' }));
  });
});

// ─── Relation type classification ─────────────────────────────────────────────

describe('FactionTrait — relation type classification', () => {
  function attachWithStanding(standing: number, factionId = 'test') {
    const n = makeNode();
    const config = cfg({ reputation: { [factionId]: standing } });
    attach(n, config, makeCtx());
    return state(n).relations.get(factionId);
  }

  it('standing = -100 → hostile', () => expect(attachWithStanding(-100).type).toBe('hostile'));
  it('standing = -30 → hostile (below -neutral_threshold=25)', () => expect(attachWithStanding(-30).type).toBe('hostile'));
  it('standing = -11 → unfriendly (just below -neutral_threshold*0.4=-10)', () => expect(attachWithStanding(-11).type).toBe('unfriendly'));
  it('standing = 0 → neutral', () => expect(attachWithStanding(0).type).toBe('neutral'));
  it('standing = 60 → friendly', () => expect(attachWithStanding(60).type).toBe('friendly'));
  it('standing = 80 → allied', () => expect(attachWithStanding(80).type).toBe('allied'));
  it('standing = 100 → allied', () => expect(attachWithStanding(100).type).toBe('allied'));

  it('hostile_factions override positive standing', () => {
    const n = makeNode();
    const config = cfg({ reputation: { orcs: 90 }, hostile_factions: ['orcs'] });
    attach(n, config, makeCtx());
    expect(state(n).relations.get('orcs').type).toBe('hostile');
  });

  it('allied_factions override negative standing', () => {
    const n = makeNode();
    const config = cfg({ reputation: { elves: -50 }, allied_factions: ['elves'] });
    attach(n, config, makeCtx());
    expect(state(n).relations.get('elves').type).toBe('allied');
  });
});

// ─── reputation_change event ──────────────────────────────────────────────────

describe('FactionTrait — reputation_change event', () => {
  it('increases standing by amount', () => {
    const n = makeNode();
    const config = cfg({ reputation: { goblins: 0 } });
    const ctx = makeCtx();
    attach(n, config, ctx);
    dispatch(n, config, ctx, { type: 'reputation_change', factionId: 'goblins', amount: 30, reason: 'quest' });
    expect(state(n).relations.get('goblins').standing).toBe(30);
  });

  it('decreases standing by amount', () => {
    const n = makeNode();
    const config = cfg({ reputation: { goblins: 50 } });
    const ctx = makeCtx();
    attach(n, config, ctx);
    dispatch(n, config, ctx, { type: 'reputation_change', factionId: 'goblins', amount: -80, reason: 'attack' });
    expect(state(n).relations.get('goblins').standing).toBe(-30);
  });

  it('clamps standing to max 100', () => {
    const n = makeNode();
    const config = cfg({ reputation: { nobles: 90 } });
    const ctx = makeCtx();
    attach(n, config, ctx);
    dispatch(n, config, ctx, { type: 'reputation_change', factionId: 'nobles', amount: 50, reason: 'gift' });
    expect(state(n).relations.get('nobles').standing).toBe(100);
  });

  it('clamps standing to min -100', () => {
    const n = makeNode();
    const config = cfg({ reputation: { bandits: -80 } });
    const ctx = makeCtx();
    attach(n, config, ctx);
    dispatch(n, config, ctx, { type: 'reputation_change', factionId: 'bandits', amount: -50, reason: 'raid' });
    expect(state(n).relations.get('bandits').standing).toBe(-100);
  });

  it('creates new relation for unknown faction (starts at 0)', () => {
    const n = makeNode();
    const config = cfg();
    const ctx = makeCtx();
    attach(n, config, ctx);
    dispatch(n, config, ctx, { type: 'reputation_change', factionId: 'newclan', amount: 25, reason: 'trade' });
    expect(state(n).relations.get('newclan').standing).toBe(25);
  });

  it('does NOT change locked relations', () => {
    const n = makeNode();
    const config = cfg({ hostile_factions: ['darkfaction'] });
    const ctx = makeCtx();
    attach(n, config, ctx);
    const beforeStanding = state(n).relations.get('darkfaction').standing;
    dispatch(n, config, ctx, { type: 'reputation_change', factionId: 'darkfaction', amount: 200, reason: 'cheat' });
    expect(state(n).relations.get('darkfaction').standing).toBe(beforeStanding);
  });

  it('emits reputation_updated event', () => {
    const n = makeNode();
    const config = cfg();
    const ctx = makeCtx();
    attach(n, config, ctx);
    ctx.emit.mockClear();
    dispatch(n, config, ctx, { type: 'reputation_change', factionId: 'traders', amount: 10, reason: 'deal' });
    expect(ctx.emit).toHaveBeenCalledWith('reputation_updated', expect.objectContaining({
      factionId: 'traders',
      standing: 10,
      change: 10,
    }));
  });

  it('emits faction_relation_changed when type changes', () => {
    const n = makeNode();
    const config = cfg({ reputation: { enemies: -10 } }); // unfriendly
    const ctx = makeCtx();
    attach(n, config, ctx);
    ctx.emit.mockClear();
    // Push standing to 60 → friendly
    dispatch(n, config, ctx, { type: 'reputation_change', factionId: 'enemies', amount: 70, reason: 'peace' });
    expect(ctx.emit).toHaveBeenCalledWith('faction_relation_changed', expect.objectContaining({
      factionId: 'enemies',
    }));
  });

  it('does NOT emit faction_relation_changed when type stays same', () => {
    const n = makeNode();
    const config = cfg({ reputation: { friends: 60 } }); // friendly
    const ctx = makeCtx();
    attach(n, config, ctx);
    ctx.emit.mockClear();
    // Small positive change — still friendly
    dispatch(n, config, ctx, { type: 'reputation_change', factionId: 'friends', amount: 5, reason: 'gift' });
    expect(ctx.emit).not.toHaveBeenCalledWith('faction_relation_changed', expect.anything());
  });

  it('records history entry', () => {
    const n = makeNode();
    const config = cfg();
    const ctx = makeCtx();
    attach(n, config, ctx);
    dispatch(n, config, ctx, { type: 'reputation_change', factionId: 'pirates', amount: -20, reason: 'raid', sourceId: 'player' });
    const hist = state(n).history;
    expect(hist).toHaveLength(1);
    expect(hist[0].reason).toBe('raid');
    expect(hist[0].sourceId).toBe('player');
  });

  it('trims history to history_limit', () => {
    const n = makeNode();
    const config = cfg({ history_limit: 3 });
    const ctx = makeCtx();
    attach(n, config, ctx);
    for (let i = 0; i < 5; i++) {
      dispatch(n, config, ctx, { type: 'reputation_change', factionId: 'x', amount: 1, reason: `r${i}` });
    }
    expect(state(n).history.length).toBeLessThanOrEqual(3);
  });
});

// ─── get_relation event ───────────────────────────────────────────────────────

describe('FactionTrait — get_relation event', () => {
  it('emits relation_result for known faction', () => {
    const n = makeNode();
    const config = cfg({ reputation: { scholars: 70 } });
    const ctx = makeCtx();
    attach(n, config, ctx);
    ctx.emit.mockClear();
    dispatch(n, config, ctx, { type: 'get_relation', factionId: 'scholars', queryId: 'q1' });
    expect(ctx.emit).toHaveBeenCalledWith('relation_result', expect.objectContaining({
      queryId: 'q1',
      factionId: 'scholars',
      relation: 'friendly',
    }));
  });

  it('emits neutral relation for unknown faction', () => {
    const n = makeNode();
    const config = cfg();
    const ctx = makeCtx();
    attach(n, config, ctx);
    dispatch(n, config, ctx, { type: 'get_relation', factionId: 'unknown_faction', queryId: 'q2' });
    expect(ctx.emit).toHaveBeenCalledWith('relation_result', expect.objectContaining({
      relation: 'neutral',
      standing: 0,
    }));
  });
});

// ─── check_hostile event ──────────────────────────────────────────────────────

describe('FactionTrait — check_hostile event', () => {
  it('isHostile=true for hostile relation', () => {
    const n = makeNode();
    const config = cfg({ hostile_factions: ['bandits'] });
    const ctx = makeCtx();
    attach(n, config, ctx);
    dispatch(n, config, ctx, { type: 'check_hostile', factionId: 'bandits', queryId: 'q3' });
    expect(ctx.emit).toHaveBeenCalledWith('hostility_result', expect.objectContaining({ isHostile: true }));
  });

  it('isHostile=true for unfriendly relation', () => {
    const n = makeNode();
    const config = cfg({ reputation: { orcs: -11 } }); // unfriendly (needs < -10 strictly)
    const ctx = makeCtx();
    attach(n, config, ctx);
    dispatch(n, config, ctx, { type: 'check_hostile', factionId: 'orcs', queryId: 'q4' });
    expect(ctx.emit).toHaveBeenCalledWith('hostility_result', expect.objectContaining({ isHostile: true }));
  });

  it('isHostile=false for neutral relation', () => {
    const n = makeNode();
    const config = cfg({ reputation: { traders: 0 } });
    const ctx = makeCtx();
    attach(n, config, ctx);
    dispatch(n, config, ctx, { type: 'check_hostile', factionId: 'traders', queryId: 'q5' });
    expect(ctx.emit).toHaveBeenCalledWith('hostility_result', expect.objectContaining({ isHostile: false }));
  });

  it('isHostile=false for unknown (defaults to neutral)', () => {
    const n = makeNode();
    const config = cfg();
    const ctx = makeCtx();
    attach(n, config, ctx);
    dispatch(n, config, ctx, { type: 'check_hostile', factionId: 'aliens', queryId: 'q6' });
    expect(ctx.emit).toHaveBeenCalledWith('hostility_result', expect.objectContaining({ isHostile: false }));
  });
});

// ─── Reputation decay (onUpdate) ─────────────────────────────────────────────

describe('FactionTrait — reputation decay (onUpdate)', () => {
  it('decays positive standing toward 0 after decay_interval', () => {
    const n = makeNode();
    const config = cfg({
      reputation: { merchants: 80 },
      reputation_decay: 5,
      decay_interval: 1, // 1 second for fast testing
    });
    const ctx = makeCtx();
    attach(n, config, ctx);
    update(n, config, ctx, 1.5); // > 1s interval
    const rel = state(n).relations.get('merchants');
    expect(rel.standing).toBeLessThan(80);
  });

  it('decays negative standing toward 0 after decay_interval', () => {
    const n = makeNode();
    const config = cfg({
      reputation: { enemies: -80 },
      reputation_decay: 5,
      decay_interval: 1,
    });
    const ctx = makeCtx();
    attach(n, config, ctx);
    update(n, config, ctx, 1.5);
    const rel = state(n).relations.get('enemies');
    expect(rel.standing).toBeGreaterThan(-80);
  });

  it('does NOT decay locked relations', () => {
    const n = makeNode();
    const config = cfg({
      hostile_factions: ['darkones'],
      reputation_decay: 50,
      decay_interval: 0.1,
    });
    const ctx = makeCtx();
    attach(n, config, ctx);
    update(n, config, ctx, 1.0);
    // Locked hostile stays at -100
    expect(state(n).relations.get('darkones').standing).toBe(-100);
  });

  it('does not decay before decay_interval elapses', () => {
    const n = makeNode();
    const config = cfg({
      reputation: { shops: 50 },
      reputation_decay: 10,
      decay_interval: 60,
    });
    const ctx = makeCtx();
    attach(n, config, ctx);
    update(n, config, ctx, 0.5); // <<< 60s
    expect(state(n).relations.get('shops').standing).toBe(50);
  });

  it('emits faction_relation_changed when relation type changes during decay', () => {
    const n = makeNode();
    // Standing starts at 26 (friendly threshold=50, so it's in neutral territory actually),
    // use allied_threshold=75: start at 76 → decay enough to drop below
    const config = cfg({
      reputation: { elves: 76 },
      reputation_decay: 10,
      decay_interval: 1,
      allied_threshold: 75,
    });
    const ctx = makeCtx();
    attach(n, config, ctx);
    ctx.emit.mockClear();
    update(n, config, ctx, 1.1);
    // 76 - 10 = 66 < 75 allied_threshold → drops from allied to friendly
    expect(ctx.emit).toHaveBeenCalledWith('faction_relation_changed', expect.any(Object));
  });
});
