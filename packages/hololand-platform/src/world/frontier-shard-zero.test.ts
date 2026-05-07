/**
 * Frontier Shard 0 — HoloLand consumption tests.
 *
 * Proves task_1778186605462_2mlp's verify gate:
 *   1. HoloScript validation passes for the canonical Shard 0
 *   2. HoloLand imports/consumes at least one upstream primitive
 *      (the shard pulls Shard, Zone, Encounter, Quest, Item, Skill,
 *      LootTable from `@holoscript/framework`).
 *
 * Discipline (G.GOLD.013): the "validates clean" assertion is paired
 * with deliberately-broken shard variants that the validator must
 * reject. Without the pairs, the clean assertion is just `[].length
 * === 0` which would also pass on a no-op validator.
 *
 * task_1778186605462_2mlp
 */

import { describe, expect, it } from 'vitest';
import {
  ENCOUNTER_TRIGGER_KINDS,
  ITEM_CATEGORIES,
  SKILL_RARITIES,
  ZONE_BIOMES,
  validateShard,
} from '@holoscript/framework';
import {
  buildFrontierShardZero,
  validateFrontierShardZero,
} from './frontier-shard-zero';

describe('Frontier Shard 0 — HoloLand consumption', () => {
  it('builds and validates clean against framework validators', () => {
    const errors = validateFrontierShardZero();
    expect(errors).toEqual([]);
  });

  it('consumes Shard envelope + every required primitive class', () => {
    const shard = buildFrontierShardZero();
    expect(shard.id).toBe('shard_oasis_0');
    expect(shard.zones.length).toBeGreaterThanOrEqual(1);
    expect(shard.encounters.length).toBeGreaterThanOrEqual(1);
    expect(shard.quests.length).toBeGreaterThanOrEqual(1);
    expect(shard.items.length).toBeGreaterThanOrEqual(1);
    expect(shard.skills.length).toBeGreaterThanOrEqual(1);
    expect(shard.lootTables.length).toBeGreaterThanOrEqual(1);
  });

  it('uses only registered enum values from upstream primitives', () => {
    const shard = buildFrontierShardZero();
    for (const zone of shard.zones) {
      expect(ZONE_BIOMES as readonly string[]).toContain(zone.biome);
    }
    for (const encounter of shard.encounters) {
      expect(ENCOUNTER_TRIGGER_KINDS as readonly string[]).toContain(encounter.trigger);
    }
    for (const item of shard.items) {
      expect(ITEM_CATEGORIES as readonly string[]).toContain(item.category);
    }
    for (const skill of shard.skills) {
      expect(SKILL_RARITIES as readonly string[]).toContain(skill.rarity);
    }
  });

  it('returns a fresh deep-clone every call (caller mutation safety)', () => {
    const a = buildFrontierShardZero();
    const b = buildFrontierShardZero();
    a.items[0].name = 'mutated';
    a.zones[0].encounterIds!.push('enc_extra');
    expect(b.items[0].name).toBe('Brass Compass');
    expect(b.zones[0].encounterIds).toEqual(['enc_oasis_first_breath']);
  });

  // ── G.GOLD.013 false-case pairs ──

  it('rejects a shard whose encounter zoneId is unhooked (cross-ref)', () => {
    const shard = buildFrontierShardZero();
    shard.encounters[0].zoneId = 'zone_does_not_exist';
    const errors = validateShard(shard);
    expect(errors.some((e) => e.includes('references unknown Zone'))).toBe(true);
  });

  it('rejects a shard whose loot entry references unknown item (cross-ref)', () => {
    const shard = buildFrontierShardZero();
    shard.lootTables[0].entries[0].itemId = 'item_does_not_exist';
    const errors = validateShard(shard);
    expect(errors.some((e) => e.includes('references unknown Item'))).toBe(true);
  });

  it('rejects a shard whose quest step gates on unknown skill (cross-ref)', () => {
    const shard = buildFrontierShardZero();
    shard.quests[0].steps[0].requiresSkillId = 'skill_does_not_exist';
    const errors = validateShard(shard);
    expect(errors.some((e) => e.includes('references unknown Skill'))).toBe(true);
  });

  it('rejects a shard with drifted enum value (G.GOLD.015 enum-drift category)', () => {
    const shard = buildFrontierShardZero();
    // Cast through unknown to bypass compile-time gate — we explicitly want
    // to prove the runtime validator catches this.
    shard.skills[0].rarity = 'godlike' as unknown as typeof shard.skills[0]['rarity'];
    const errors = validateShard(shard);
    expect(errors.some((e) => e.includes('Skill.rarity is unsupported: godlike'))).toBe(true);
  });
});
