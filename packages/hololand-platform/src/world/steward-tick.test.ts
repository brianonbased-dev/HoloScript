import { describe, it, expect } from 'vitest';

import { stewardTick, stewardTickN, type RuntimeZoneState } from './steward-tick.js';

function makeEmptyZone(zoneId: string): RuntimeZoneState {
  return {
    zoneId,
    tick: 0,
    worldClock: 1000,
    playerCount: 0,
    npcSchedules: [],
  };
}

describe('stewardTick', () => {
  it('advances tick counter monotonically', () => {
    const zone = makeEmptyZone('zone_oasis_market');
    const { state } = stewardTick(zone);
    expect(state.tick).toBe(1);
    expect(state.worldClock).toBe(1001);
  });

  it('advances world clock', () => {
    const zone = makeEmptyZone('zone_castle');
    const { state, receipt } = stewardTick(zone);
    expect(state.worldClock).toBe(1001);
    expect(receipt.worldClock).toBe(1001);
    expect(receipt.events).toContain('world-clock-advanced:1001');
  });

  it('emits a runtime receipt per tick', () => {
    const zone = makeEmptyZone('zone_forest');
    const { receipt } = stewardTick(zone);
    expect(receipt.tick).toBe(1);
    expect(receipt.zoneId).toBe('zone_forest');
    expect(receipt.playerCount).toBe(0);
    expect(receipt.timestamp).toBeGreaterThan(0);
    expect(receipt.events.length).toBeGreaterThanOrEqual(1);
  });

  it('fires NPC schedules when tick threshold is reached', () => {
    const zone: RuntimeZoneState = {
      ...makeEmptyZone('zone_town'),
      npcSchedules: [
        { npcId: 'guard-01', nextTick: 3, interval: 5 },
        { npcId: 'merchant-01', nextTick: 1, interval: 10 },
      ],
    };

    // Tick 1: merchant fires, guard does not
    const r1 = stewardTick(zone);
    expect(r1.receipt.events).toContain('npc-action:merchant-01');
    expect(r1.receipt.events).not.toContain('npc-action:guard-01');
    expect(r1.state.npcSchedules.find((s) => s.npcId === 'merchant-01')!.nextTick).toBe(11);

    // Tick 2: nothing fires
    const r2 = stewardTick(r1.state);
    expect(r2.receipt.events).not.toContain('npc-action:guard-01');
    expect(r2.receipt.events).not.toContain('npc-action:merchant-01');

    // Tick 3: guard fires
    const r3 = stewardTick(r2.state);
    expect(r3.receipt.events).toContain('npc-action:guard-01');
    expect(r3.state.npcSchedules.find((s) => s.npcId === 'guard-01')!.nextTick).toBe(8);
  });

  it('fails if state is unchanged (negative guard)', () => {
    const zone = makeEmptyZone('zone_negative_guard');
    const { state, receipt } = stewardTick(zone);

    // The tick MUST have advanced; if it didn't, the implementation is broken.
    expect(state.tick).not.toBe(zone.tick);
    expect(state.worldClock).not.toBe(zone.worldClock);
    expect(receipt.events).toContain('world-clock-advanced:1001');
  });

  it('stewardTickN runs N ticks and returns N receipts', () => {
    const zone = makeEmptyZone('zone_batch');
    const { state, receipts } = stewardTickN(zone, 5);
    expect(state.tick).toBe(5);
    expect(state.worldClock).toBe(1005);
    expect(receipts).toHaveLength(5);
    for (let i = 0; i < 5; i++) {
      expect(receipts[i].tick).toBe(i + 1);
      expect(receipts[i].events).toContain(`world-clock-advanced:${1000 + i + 1}`);
    }
  });

  it('advances shard state with zero players present', () => {
    const zone: RuntimeZoneState = {
      zoneId: 'zone_no_players',
      tick: 0,
      worldClock: 0,
      playerCount: 0,
      npcSchedules: [{ npcId: 'steward-01', nextTick: 2, interval: 4 }],
    };

    const { state, receipts } = stewardTickN(zone, 4);

    // Shard state must have advanced
    expect(state.tick).toBe(4);
    expect(state.worldClock).toBe(4);

    // A runtime receipt must be captured for every tick
    expect(receipts).toHaveLength(4);
    for (const r of receipts) {
      expect(r.playerCount).toBe(0);
      expect(r.events).toContain(`world-clock-advanced:${r.worldClock}`);
    }

    // The steward NPC should have fired once at tick 2
    const actionReceipts = receipts.filter((r) =>
      r.events.some((e) => e.startsWith('npc-action:')),
    );
    expect(actionReceipts.length).toBeGreaterThanOrEqual(1);
  });
});
