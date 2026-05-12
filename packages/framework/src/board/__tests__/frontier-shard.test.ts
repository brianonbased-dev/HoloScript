/**
 * Frontier Shard tests — focused on SLF integration.
 *
 * Full Shard/Zone/Encounter/Quest/Item/Skill/LootTable validators are
 * already exercised implicitly through validateShard; this file adds
 * explicit SLF cross-reference and clone coverage.
 */

import { describe, it, expect } from 'vitest';
import {
  validateShard,
  cloneShard,
} from '../frontier-shard';
import type { Shard } from '../frontier-shard';

function makeMinimalShard(overrides?: Partial<Shard>): Shard {
  return {
    id: 'shard_test',
    name: 'Test Shard',
    schemaVersion: 1,
    hash: 'abc123',
    hashAlgorithm: 'sha256',
    zones: [],
    encounters: [],
    quests: [],
    items: [],
    skills: [],
    lootTables: [],
    ...overrides,
  };
}

describe('Shard spatialRules validation', () => {
  it('accepts shard without spatialRules', () => {
    const shard = makeMinimalShard();
    expect(validateShard(shard)).toEqual([]);
  });

  it('accepts valid spatialRules', () => {
    const shard = makeMinimalShard({
      zones: [{ id: 'z1', name: 'Zone 1', biome: 'urban' }],
      items: [{ id: 'item_key', name: 'Key', category: 'consumable' }],
      spatialRules: [
        {
          id: 'rule_unlock',
          name: 'Unlock inner gate',
          predicates: [{ id: 'p1', kind: 'has_item', targetId: 'item_key' }],
          actions: [{ id: 'a1', kind: 'unlock_zone', targetId: 'z1' }],
        },
      ],
    });
    expect(validateShard(shard)).toEqual([]);
  });

  it('rejects spatialRules that are not an array', () => {
    const shard = makeMinimalShard({
      spatialRules: 'nope' as any,
    });
    expect(validateShard(shard)).toContain(
      'Shard shard_test.spatialRules must be an array.',
    );
  });

  it('rejects spatialRules with unknown zoneId reference', () => {
    const shard = makeMinimalShard({
      zones: [{ id: 'z1', name: 'Zone 1', biome: 'urban' }],
      spatialRules: [
        {
          id: 'rule_bad',
          name: 'Bad Rule',
          predicates: [],
          actions: [{ id: 'a1', kind: 'unlock_zone', targetId: 'z1' }],
          zoneId: 'z_missing',
        },
      ],
    });
    expect(validateShard(shard)).toContain(
      'Shard shard_test.spatialRules[rule_bad].zoneId references unknown Zone: z_missing.',
    );
  });

  it('propagates nested predicate errors through validateShard', () => {
    const shard = makeMinimalShard({
      spatialRules: [
        {
          id: 'rule_bad',
          name: 'Bad Rule',
          predicates: [{ id: 'p1', kind: 'unknown' as any }],
          actions: [{ id: 'a1', kind: 'broadcast_event', targetId: 'evt' }],
        },
      ],
    });
    expect(validateShard(shard)).toContain(
      'Shard shard_test.spatialRules[rule_bad]: SpatialRule rule_bad.predicates[p1]: SpatialPredicate.kind is unsupported: unknown.',
    );
  });

  it('propagates nested action errors through validateShard', () => {
    const shard = makeMinimalShard({
      spatialRules: [
        {
          id: 'rule_bad',
          name: 'Bad Rule',
          predicates: [],
          actions: [{ id: 'a1', kind: 'unknown' as any }],
        },
      ],
    });
    expect(validateShard(shard)).toContain(
      'Shard shard_test.spatialRules[rule_bad]: SpatialRule rule_bad.actions[a1]: SpatialAction.kind is unsupported: unknown.',
    );
  });
});

describe('Shard clone with spatialRules', () => {
  it('deep-clones spatialRules arrays and tuples', () => {
    const shard = makeMinimalShard({
      zones: [{ id: 'z1', name: 'Zone 1', biome: 'urban' }],
      spatialRules: [
        {
          id: 'r1',
          name: 'Rule 1',
          predicates: [
            {
              id: 'p1',
              kind: 'entity_near',
              position: [1, 2, 3],
              targetId: 'z1',
            },
          ],
          actions: [
            {
              id: 'a1',
              kind: 'spawn_entity',
              spawnPosition: [4, 5, 6],
            },
          ],
        },
      ],
    });
    const cloned = cloneShard(shard);
    expect(cloned).toEqual(shard);
    expect(cloned.spatialRules).not.toBe(shard.spatialRules);
    expect(cloned.spatialRules![0].predicates).not.toBe(shard.spatialRules![0].predicates);
    expect(cloned.spatialRules![0].actions).not.toBe(shard.spatialRules![0].actions);
    expect(cloned.spatialRules![0].predicates[0].position).not.toBe(
      shard.spatialRules![0].predicates[0].position,
    );
    expect(cloned.spatialRules![0].actions[0].spawnPosition).not.toBe(
      shard.spatialRules![0].actions[0].spawnPosition,
    );
  });

  it('clones shard without spatialRules safely', () => {
    const shard = makeMinimalShard();
    const cloned = cloneShard(shard);
    expect(cloned.spatialRules).toBeUndefined();
  });
});
