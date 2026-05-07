/**
 * Frontier Shard 0 — HoloLand consumption example.
 *
 * The bootstrap shard for HoloLand. Imports the canonical Frontier
 * primitives from `@holoscript/framework` and wires them into a
 * minimal but valid Shard envelope that:
 *   - has one Zone (urban biome — the Oasis market square)
 *   - has one Encounter (on-enter ambush) bound to that Zone
 *   - has one Quest (single step, gated by a Skill, rewarding an Item)
 *   - has one Item, one Skill, one LootTable
 * Validates clean against `validateShard` (cross-references resolve,
 * no missing required fields, no enum drift).
 *
 * This file is the proof that the upstream primitives are usable
 * end-to-end from a HoloLand consumer. Test coverage in
 * `__tests__/frontier-shard-zero.test.ts` enforces the validation
 * contract — if a future primitive change breaks shard authoring,
 * the test fails before the shard ever boots.
 *
 * task_1778186605462_2mlp (P1 holoscript-upstream)
 */

import {
  cloneShard,
  validateShard,
  type Shard,
} from '@holoscript/framework';

/**
 * Build the canonical Frontier Shard 0 — the Oasis bootstrap shard.
 *
 * Returns a fresh deep-clone every call so consumers can mutate the
 * shard without affecting the canonical reference (e.g. swapping in
 * a different LootTable for an A/B test).
 */
export function buildFrontierShardZero(): Shard {
  const shard: Shard = {
    id: 'shard_oasis_0',
    name: 'Oasis Shard 0',
    schemaVersion: 0,
    hash: '0000000000000000000000000000000000000000000000000000000000000000',
    hashAlgorithm: 'sha256',
    zones: [
      {
        id: 'zone_oasis_market',
        name: 'Oasis Market',
        biome: 'urban',
        encounterIds: ['enc_oasis_first_breath'],
      },
    ],
    encounters: [
      {
        id: 'enc_oasis_first_breath',
        name: 'First Breath of the Oasis',
        trigger: 'on-enter',
        zoneId: 'zone_oasis_market',
        lootTableId: 'loot_oasis_welcome',
        questStepRef: 'quest_oasis_first_breath:qstep_arrive',
      },
    ],
    quests: [
      {
        id: 'quest_oasis_first_breath',
        name: 'First Breath of the Oasis',
        steps: [
          {
            id: 'qstep_arrive',
            objective: 'Reach the Oasis Market and inhale.',
            requiresSkillId: 'skill_breath_basic',
            encounterIds: ['enc_oasis_first_breath'],
            rewardItemIds: ['item_compass_brass'],
          },
        ],
        rewardLootTableId: 'loot_oasis_welcome',
      },
    ],
    items: [
      {
        id: 'item_compass_brass',
        name: 'Brass Compass',
        category: 'artifact',
        description: 'A weathered compass that always points home.',
      },
    ],
    skills: [
      {
        id: 'skill_breath_basic',
        name: 'Breath (Basic)',
        rarity: 'common',
        description: 'The first capability every steward picks up — inhale and orient.',
      },
    ],
    lootTables: [
      {
        id: 'loot_oasis_welcome',
        name: 'Oasis Welcome Cache',
        rollsPerInvocation: 1,
        entries: [
          {
            id: 'lte_compass',
            itemId: 'item_compass_brass',
            weight: 1,
          },
          {
            id: 'lte_breath_extra',
            skillId: 'skill_breath_basic',
            weight: 0.25,
            condition: 'first-visit',
          },
        ],
      },
    ],
    provenance: {
      taskId: 'task_1778186605462_2mlp',
      source: 'hololand-platform/src/world/frontier-shard-zero.ts',
    },
  };

  // Clone before returning so callers can mutate freely.
  return cloneShard(shard);
}

/**
 * Validate the canonical Shard 0. Returns the framework's validator
 * error array (empty when the shard is structurally valid). HoloLand
 * runtime callers can use this as a gate before booting the shard.
 */
export function validateFrontierShardZero(shard: Shard = buildFrontierShardZero()): string[] {
  return validateShard(shard);
}
