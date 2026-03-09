import { describe, it, expect, beforeEach } from 'vitest';
import { BarkManager, type BarkDefinition } from '../BarkManager';

const bark1: BarkDefinition = {
  id: 'b1',
  context: 'combat_start',
  lines: ['Fight!', 'En garde!'],
  priority: 5,
  cooldown: 2,
  maxRange: 0,
};
const bark2: BarkDefinition = {
  id: 'b2',
  context: 'combat_start',
  lines: ['Attack!'],
  priority: 10,
  cooldown: 1,
  maxRange: 50,
};

describe('BarkManager', () => {
  let mgr: BarkManager;

  beforeEach(() => {
    mgr = new BarkManager();
    mgr.registerBark(bark1);
    mgr.registerBark(bark2);
  });

  it('trigger returns bark for matching context', () => {
    const bark = mgr.trigger('combat_start', 'npc1');
    expect(bark).not.toBeNull();
    expect(bark!.speakerId).toBe('npc1');
  });

  it('trigger returns null for unknown context', () => {
    expect(mgr.trigger('idle', 'npc1')).toBeNull();
  });

  it('selects highest priority bark', () => {
    // bark2 has priority 10 and maxRange 50, pass within range
    const bark = mgr.trigger('combat_start', 'npc1', 0, 0, 10, 0);
    expect(bark!.definitionId).toBe('b2');
  });

  it('filters by range', () => {
    // bark2 maxRange=50, speaker at 100 away → filtered out, bark1 has maxRange=0 (no check)
    const bark = mgr.trigger('combat_start', 'npc1', 100, 0, 0, 0);
    expect(bark!.definitionId).toBe('b1');
  });

  it('respects cooldown', () => {
    mgr.tick(0);
    // Trigger far from listener so only bark1 fires (maxRange=0 means no check)
    mgr.trigger('combat_start', 'npc1', 0, 0, 100, 0); // plays bark1 at t=0
    mgr.tick(1); // only 1s passed, bark1 cooldown is 2s
    const b = mgr.trigger('combat_start', 'npc1', 0, 0, 100, 0);
    expect(b).toBeNull(); // bark1 on cooldown, bark2 out of range
  });

  it('cooldown expires after enough time', () => {
    mgr.tick(0);
    mgr.trigger('combat_start', 'npc1', 0, 0, 100, 0); // bark1
    mgr.tick(3); // 3s > 2s cooldown
    const bark = mgr.trigger('combat_start', 'npc1', 0, 0, 100, 0);
    expect(bark).not.toBeNull();
  });

  it('isOnCooldown returns correct state', () => {
    mgr.tick(0);
    // Trigger far away so only bark1 (maxRange=0) fires
    mgr.trigger('combat_start', 'npc1', 0, 0, 100, 0);
    expect(mgr.isOnCooldown('b1')).toBe(true);
    mgr.tick(3);
    expect(mgr.isOnCooldown('b1')).toBe(false);
  });

  it('queue limits to maxQueue', () => {
    mgr.tick(0);
    mgr.trigger('combat_start', 'a');
    mgr.tick(3);
    mgr.trigger('combat_start', 'b');
    mgr.tick(6);
    mgr.trigger('combat_start', 'c');
    mgr.tick(9);
    mgr.trigger('combat_start', 'd');
    expect(mgr.getQueueLength()).toBe(3); // maxQueue = 3
  });

  it('clearQueue empties the queue', () => {
    mgr.trigger('combat_start', 'npc1');
    mgr.clearQueue();
    expect(mgr.getQueueLength()).toBe(0);
  });

  it('getQueue returns copy', () => {
    mgr.trigger('combat_start', 'npc1');
    const q = mgr.getQueue();
    q.pop();
    expect(mgr.getQueueLength()).toBe(1);
  });
});
