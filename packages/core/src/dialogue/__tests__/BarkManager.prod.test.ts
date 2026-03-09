/**
 * BarkManager — Production Test Suite
 *
 * Covers: registration, trigger by context, cooldowns,
 * range filtering, priority selection, queue management, queries.
 */
import { describe, it, expect } from 'vitest';
import { BarkManager, type BarkDefinition } from '../BarkManager';

const COMBAT_BARK: BarkDefinition = {
  id: 'combat_taunt',
  context: 'combat_start',
  lines: ['Fight!', 'En garde!', 'Have at thee!'],
  priority: 5,
  cooldown: 2,
  maxRange: 0,
};

const IDLE_BARK: BarkDefinition = {
  id: 'idle_mutter',
  context: 'idle',
  lines: ['Nice weather...', 'Hmm...'],
  priority: 1,
  cooldown: 5,
  maxRange: 0,
};

describe('BarkManager — Production', () => {
  // ─── Registration & Trigger ───────────────────────────────────────
  it('trigger returns bark for matching context', () => {
    const bm = new BarkManager();
    bm.registerBark(COMBAT_BARK);
    const bark = bm.trigger('combat_start', 'warrior');
    expect(bark).not.toBeNull();
    expect(COMBAT_BARK.lines).toContain(bark!.line);
    expect(bark!.speakerId).toBe('warrior');
  });

  it('trigger returns null for unregistered context', () => {
    const bm = new BarkManager();
    bm.registerBark(COMBAT_BARK);
    expect(bm.trigger('nonexistent', 'npc')).toBeNull();
  });

  // ─── Cooldowns ────────────────────────────────────────────────────
  it('cooldown blocks repeat triggers', () => {
    const bm = new BarkManager();
    bm.registerBark(COMBAT_BARK); // cooldown=2
    bm.tick(0);
    bm.trigger('combat_start', 'npc');
    expect(bm.isOnCooldown('combat_taunt')).toBe(true);
    bm.tick(1);
    expect(bm.trigger('combat_start', 'npc')).toBeNull();
  });

  it('cooldown expires allowing re-trigger', () => {
    const bm = new BarkManager();
    bm.registerBark(COMBAT_BARK);
    bm.tick(0);
    bm.trigger('combat_start', 'npc');
    bm.tick(3); // past 2s cooldown
    const bark = bm.trigger('combat_start', 'npc');
    expect(bark).not.toBeNull();
  });

  // ─── Range Filtering ──────────────────────────────────────────────
  it('range check filters distant speakers', () => {
    const bm = new BarkManager();
    const ranged: BarkDefinition = { ...IDLE_BARK, maxRange: 5 };
    bm.registerBark(ranged);
    // speaker at (100,100), listener at (0,0) → distance > 5
    expect(bm.trigger('idle', 'npc', 100, 100, 0, 0)).toBeNull();
  });

  it('range check passes for nearby', () => {
    const bm = new BarkManager();
    const ranged: BarkDefinition = { ...IDLE_BARK, id: 'close_idle', maxRange: 10 };
    bm.registerBark(ranged);
    expect(bm.trigger('idle', 'npc', 3, 4, 0, 0)).not.toBeNull();
  });

  // ─── Priority Selection ───────────────────────────────────────────
  it('higher priority bark is chosen', () => {
    const bm = new BarkManager();
    const low: BarkDefinition = {
      id: 'low',
      context: 'test',
      lines: ['low'],
      priority: 1,
      cooldown: 0,
      maxRange: 0,
    };
    const high: BarkDefinition = {
      id: 'high',
      context: 'test',
      lines: ['high'],
      priority: 10,
      cooldown: 0,
      maxRange: 0,
    };
    bm.registerBark(low);
    bm.registerBark(high);
    const bark = bm.trigger('test', 'npc');
    expect(bark!.line).toBe('high');
  });

  // ─── Queue ────────────────────────────────────────────────────────
  it('queue builds up and caps at maxQueue', () => {
    const bm = new BarkManager();
    const def: BarkDefinition = {
      id: 'q',
      context: 'q',
      lines: ['a'],
      priority: 1,
      cooldown: 0,
      maxRange: 0,
    };
    bm.registerBark(def);
    for (let i = 0; i < 5; i++) bm.trigger('q', 'npc');
    expect(bm.getQueueLength()).toBe(3); // maxQueue=3
  });

  it('clearQueue empties', () => {
    const bm = new BarkManager();
    bm.registerBark(COMBAT_BARK);
    bm.trigger('combat_start', 'npc');
    bm.clearQueue();
    expect(bm.getQueueLength()).toBe(0);
  });
});
