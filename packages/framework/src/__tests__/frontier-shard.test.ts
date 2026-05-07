/**
 * Frontier Shard 0 primitive tests.
 *
 * Discipline:
 * - G.GOLD.013: every "validates X" case is paired with a "rejects bad X"
 *   case so the validator is proven to actually fire.
 * - G.GOLD.015: cover the failure categories we expect at runtime —
 *   missing required fields, unsupported enums, kind/discriminator
 *   coupling (skill-other needs rarityLabel, item-other needs
 *   categoryLabel, encounter-other needs triggerLabel, biome-other
 *   needs biomeLabel), paired-field rules (item.hash + hashAlgorithm,
 *   loot entry exclusive itemId/skillId), cross-reference integrity
 *   (encounter.zoneId + lootTableId, quest.requiresSkillId +
 *   rewardItemIds, loot.itemId + skillId), and clone-deep-copy
 *   isolation. Same shapes as `hololand-receipts.test.ts`.
 * - F.043 verified: each kind/discriminator coupling test was run
 *   with the coupling check disabled in the validator first to
 *   confirm it actually fails (not a no-op assertion).
 *
 * task_1778186605462_2mlp
 */

import { describe, expect, it } from 'vitest';
import {
  ENCOUNTER_TRIGGER_KINDS,
  ITEM_CATEGORIES,
  SKILL_RARITIES,
  ZONE_BIOMES,
  cloneEncounter,
  cloneItem,
  cloneLootTable,
  cloneQuest,
  cloneShard,
  cloneShardReceipt,
  cloneSkill,
  cloneZone,
  isSupportedEncounterTrigger,
  isSupportedItemCategory,
  isSupportedShardReceiptStatus,
  isSupportedSkillRarity,
  isSupportedZoneBiome,
  validateEncounter,
  validateItem,
  validateLootTable,
  validateQuest,
  validateShard,
  validateShardReceipt,
  validateSkill,
  validateZone,
  type Encounter,
  type Item,
  type LootTable,
  type Quest,
  type Shard,
  type ShardReceipt,
  type Skill,
  type Zone,
} from '../board/frontier-shard';
import {
  validateValidationReceipt,
  cloneValidationReceipt,
  type ValidationReceipt,
} from '../board/hololand-receipts';

// ── Fixtures ──

function makeSkill(overrides: Partial<Skill> = {}): Skill {
  return {
    id: 'skill_lockpick_basic',
    name: 'Lockpick (Basic)',
    rarity: 'common',
    description: 'Open mundane locks.',
    ...overrides,
  };
}

function makeItem(overrides: Partial<Item> = {}): Item {
  return {
    id: 'item_compass_brass_001',
    name: 'Brass Compass',
    category: 'artifact',
    description: 'A weathered compass.',
    ...overrides,
  };
}

function makeLootTable(overrides: Partial<LootTable> = {}): LootTable {
  return {
    id: 'loot_chest_common_001',
    name: 'Common Chest',
    entries: [
      { id: 'lte_compass', itemId: 'item_compass_brass_001', weight: 1 },
      { id: 'lte_skill_pick', skillId: 'skill_lockpick_basic', weight: 0.25 },
    ],
    ...overrides,
  };
}

function makeEncounter(overrides: Partial<Encounter> = {}): Encounter {
  return {
    id: 'enc_camp_ambush_001',
    name: 'Camp Ambush',
    trigger: 'on-enter',
    zoneId: 'zone_market_square',
    lootTableId: 'loot_chest_common_001',
    ...overrides,
  };
}

function makeQuest(overrides: Partial<Quest> = {}): Quest {
  return {
    id: 'quest_oasis_first_breath',
    name: 'First Breath of the Oasis',
    steps: [
      {
        id: 'qstep_1',
        objective: 'Reach the market square.',
        encounterIds: ['enc_camp_ambush_001'],
        requiresSkillId: 'skill_lockpick_basic',
        rewardItemIds: ['item_compass_brass_001'],
      },
    ],
    ...overrides,
  };
}

function makeZone(overrides: Partial<Zone> = {}): Zone {
  return {
    id: 'zone_market_square',
    name: 'Market Square',
    biome: 'urban',
    encounterIds: ['enc_camp_ambush_001'],
    ...overrides,
  };
}

function makeShard(overrides: Partial<Shard> = {}): Shard {
  return {
    id: 'shard_oasis_0',
    name: 'Oasis Shard 0',
    schemaVersion: 0,
    hash: 'a'.repeat(64),
    hashAlgorithm: 'sha256',
    zones: [makeZone()],
    encounters: [makeEncounter()],
    quests: [makeQuest()],
    items: [makeItem()],
    skills: [makeSkill()],
    lootTables: [makeLootTable()],
    ...overrides,
  };
}

function makeShardReceipt(overrides: Partial<ShardReceipt> = {}): ShardReceipt {
  return {
    id: 'srcpt_oasis_0_20260507',
    shardId: 'shard_oasis_0',
    status: 'authored',
    sealedAt: '2026-05-07T00:00:00Z',
    hash: 'b'.repeat(64),
    hashAlgorithm: 'sha256',
    ...overrides,
  };
}

// ── Skill ──

describe('Frontier Skill', () => {
  it('accepts every supported rarity', () => {
    for (const rarity of SKILL_RARITIES) {
      const skill =
        rarity === 'skill-other'
          ? makeSkill({ rarity, rarityLabel: 'mythic' })
          : makeSkill({ rarity });
      expect(validateSkill(skill)).toEqual([]);
    }
  });

  it('rejects unsupported rarity', () => {
    const skill = makeSkill({ rarity: 'godlike' as Skill['rarity'] });
    expect(validateSkill(skill)).toContain('Skill.rarity is unsupported: godlike.');
  });

  it('rejects skill-other without rarityLabel (kind/discriminator coupling)', () => {
    const skill = makeSkill({ rarity: 'skill-other' });
    expect(validateSkill(skill)).toContain(
      `Skill ${skill.id} rarity=skill-other requires rarityLabel.`,
    );
  });

  it('rejects when required fields are missing (G.GOLD.015)', () => {
    const skill: Skill = {
      id: '',
      name: '',
      rarity: 'common',
    };
    const errors = validateSkill(skill);
    expect(errors).toContain('Skill.id is required.');
    expect(errors).toContain('Skill <unknown>.name is required.');
  });

  it('clones deeply (mutating clone does not mutate original)', () => {
    const skill = makeSkill({ prerequisites: ['skill_a'], metadata: { tier: 1 } });
    const cloned = cloneSkill(skill);
    cloned.prerequisites!.push('skill_b');
    (cloned.metadata as Record<string, unknown>).tier = 99;
    expect(skill.prerequisites).toEqual(['skill_a']);
    expect(skill.metadata).toEqual({ tier: 1 });
  });
});

// ── Item ──

describe('Frontier Item', () => {
  it('accepts every supported category', () => {
    for (const category of ITEM_CATEGORIES) {
      const item =
        category === 'item-other'
          ? makeItem({ category, categoryLabel: 'mystery' })
          : makeItem({ category });
      expect(validateItem(item)).toEqual([]);
    }
  });

  it('rejects unsupported category', () => {
    const item = makeItem({ category: 'macguffin' as Item['category'] });
    expect(validateItem(item)).toContain('Item.category is unsupported: macguffin.');
  });

  it('rejects item-other without categoryLabel (kind/discriminator coupling)', () => {
    const item = makeItem({ category: 'item-other' });
    expect(validateItem(item)).toContain(
      `Item ${item.id} category=item-other requires categoryLabel.`,
    );
  });

  it('rejects hash without hashAlgorithm (paired-field rule)', () => {
    const item = makeItem({ hash: 'c'.repeat(64) });
    expect(validateItem(item)).toContain(
      `Item ${item.id}.hashAlgorithm is required when hash is set.`,
    );
  });

  it('rejects bogus stackSize values (G.GOLD.015 paired bad-input check)', () => {
    expect(validateItem(makeItem({ stackSize: 0 }))).toContain(
      `Item item_compass_brass_001.stackSize must be a finite number >= 1.`,
    );
    expect(validateItem(makeItem({ stackSize: Number.NaN }))).toContain(
      `Item item_compass_brass_001.stackSize must be a finite number >= 1.`,
    );
    expect(validateItem(makeItem({ stackSize: -3 }))).toContain(
      `Item item_compass_brass_001.stackSize must be a finite number >= 1.`,
    );
  });

  it('clones deeply', () => {
    const item = makeItem({ metadata: { weight: 0.5 } });
    const cloned = cloneItem(item);
    (cloned.metadata as Record<string, unknown>).weight = 9.9;
    expect(item.metadata).toEqual({ weight: 0.5 });
  });
});

// ── LootTable ──

describe('Frontier LootTable', () => {
  it('accepts a well-formed table', () => {
    expect(validateLootTable(makeLootTable())).toEqual([]);
  });

  it('rejects empty entries (G.GOLD.015 missing-required-field)', () => {
    expect(validateLootTable(makeLootTable({ entries: [] }))).toContain(
      'LootTable loot_chest_common_001.entries must be a non-empty array.',
    );
  });

  it('rejects entry that references both itemId and skillId (mutual exclusion)', () => {
    const table = makeLootTable({
      entries: [
        { id: 'lte_bad', itemId: 'item_x', skillId: 'skill_x', weight: 1 },
      ],
    });
    const errors = validateLootTable(table);
    expect(errors.some((e) => e.includes('mutually exclusive'))).toBe(true);
  });

  it('rejects entry that references neither itemId nor skillId', () => {
    const table = makeLootTable({
      entries: [{ id: 'lte_empty', weight: 1 }],
    });
    const errors = validateLootTable(table);
    expect(errors.some((e) => e.includes('must reference either itemId or skillId'))).toBe(true);
  });

  it('rejects negative or non-finite weights', () => {
    const negative = makeLootTable({
      entries: [{ id: 'lte_neg', itemId: 'i', weight: -1 }],
    });
    expect(validateLootTable(negative).some((e) => e.includes('weight must be a non-negative finite number'))).toBe(true);

    const nan = makeLootTable({
      entries: [{ id: 'lte_nan', itemId: 'i', weight: Number.NaN }],
    });
    expect(validateLootTable(nan).some((e) => e.includes('weight must be a non-negative finite number'))).toBe(true);
  });

  it('rejects rollsPerInvocation < 1', () => {
    expect(
      validateLootTable(makeLootTable({ rollsPerInvocation: 0 })).some((e) =>
        e.includes('rollsPerInvocation must be a finite number >= 1'),
      ),
    ).toBe(true);
  });

  it('clones deeply (mutating cloned entries does not mutate original)', () => {
    const table = makeLootTable();
    const cloned = cloneLootTable(table);
    cloned.entries[0].weight = 99;
    cloned.entries.push({ id: 'lte_extra', itemId: 'item_compass_brass_001', weight: 5 });
    expect(table.entries[0].weight).toBe(1);
    expect(table.entries.length).toBe(2);
  });
});

// ── Encounter ──

describe('Frontier Encounter', () => {
  it('accepts every supported trigger', () => {
    for (const trigger of ENCOUNTER_TRIGGER_KINDS) {
      const encounter =
        trigger === 'encounter-other'
          ? makeEncounter({ trigger, triggerLabel: 'on-spell-cast' })
          : makeEncounter({ trigger });
      expect(validateEncounter(encounter)).toEqual([]);
    }
  });

  it('rejects unsupported trigger', () => {
    const encounter = makeEncounter({ trigger: 'on-vibe' as Encounter['trigger'] });
    expect(validateEncounter(encounter)).toContain(
      'Encounter.trigger is unsupported: on-vibe.',
    );
  });

  it('rejects encounter-other without triggerLabel (kind/discriminator coupling)', () => {
    const encounter = makeEncounter({ trigger: 'encounter-other' });
    expect(validateEncounter(encounter)).toContain(
      `Encounter ${encounter.id} trigger=encounter-other requires triggerLabel.`,
    );
  });

  it('rejects when required fields are missing', () => {
    const encounter: Encounter = {
      id: '',
      name: '',
      trigger: 'on-enter',
      zoneId: '',
    };
    const errors = validateEncounter(encounter);
    expect(errors).toContain('Encounter.id is required.');
    expect(errors).toContain('Encounter <unknown>.name is required.');
    expect(errors).toContain('Encounter .zoneId is required.');
  });

  it('clones deeply', () => {
    const encounter = makeEncounter({ metadata: { difficulty: 2 } });
    const cloned = cloneEncounter(encounter);
    (cloned.metadata as Record<string, unknown>).difficulty = 99;
    expect(encounter.metadata).toEqual({ difficulty: 2 });
  });
});

// ── Quest ──

describe('Frontier Quest', () => {
  it('accepts a well-formed quest with skill gate and rewards', () => {
    expect(validateQuest(makeQuest())).toEqual([]);
  });

  it('rejects empty steps', () => {
    expect(validateQuest(makeQuest({ steps: [] }))).toContain(
      'Quest quest_oasis_first_breath.steps must be a non-empty array.',
    );
  });

  it('rejects step missing objective', () => {
    const quest = makeQuest({
      steps: [{ id: 'qstep_bad', objective: '' }],
    });
    expect(validateQuest(quest).some((e) => e.includes('objective is required'))).toBe(true);
  });

  it('rejects step missing id', () => {
    const quest = makeQuest({
      steps: [{ id: '', objective: 'do something' }],
    });
    expect(validateQuest(quest).some((e) => e.includes('QuestStep.id is required'))).toBe(true);
  });

  it('clones deeply (mutating cloned steps does not mutate original)', () => {
    const quest = makeQuest();
    const cloned = cloneQuest(quest);
    cloned.steps[0].encounterIds!.push('enc_extra');
    cloned.steps[0].rewardItemIds!.push('item_extra');
    expect(quest.steps[0].encounterIds).toEqual(['enc_camp_ambush_001']);
    expect(quest.steps[0].rewardItemIds).toEqual(['item_compass_brass_001']);
  });
});

// ── Zone ──

describe('Frontier Zone', () => {
  it('accepts every supported biome', () => {
    for (const biome of ZONE_BIOMES) {
      const zone =
        biome === 'biome-other'
          ? makeZone({ biome, biomeLabel: 'glacier' })
          : makeZone({ biome });
      expect(validateZone(zone)).toEqual([]);
    }
  });

  it('rejects unsupported biome', () => {
    const zone = makeZone({ biome: 'cyberspace' as Zone['biome'] });
    expect(validateZone(zone)).toContain('Zone.biome is unsupported: cyberspace.');
  });

  it('rejects biome-other without biomeLabel (kind/discriminator coupling)', () => {
    const zone = makeZone({ biome: 'biome-other' });
    expect(validateZone(zone)).toContain(
      `Zone ${zone.id} biome=biome-other requires biomeLabel.`,
    );
  });

  it('rejects when required fields are missing', () => {
    const zone: Zone = { id: '', name: '', biome: 'urban' };
    const errors = validateZone(zone);
    expect(errors).toContain('Zone.id is required.');
    expect(errors).toContain('Zone <unknown>.name is required.');
  });

  it('clones deeply', () => {
    const zone = makeZone();
    const cloned = cloneZone(zone);
    cloned.encounterIds!.push('enc_extra');
    expect(zone.encounterIds).toEqual(['enc_camp_ambush_001']);
  });
});

// ── Shard envelope ──

describe('Frontier Shard envelope', () => {
  it('accepts a well-formed shard with all primitives wired', () => {
    expect(validateShard(makeShard())).toEqual([]);
  });

  it('rejects when required envelope fields are missing', () => {
    const shard: Shard = {
      id: '',
      name: '',
      schemaVersion: -1,
      hash: '',
      hashAlgorithm: '' as Shard['hashAlgorithm'],
      zones: [],
      encounters: [],
      quests: [],
      items: [],
      skills: [],
      lootTables: [],
    };
    const errors = validateShard(shard);
    expect(errors).toContain('Shard.id is required.');
    expect(errors).toContain('Shard <unknown>.name is required.');
    expect(errors).toContain('Shard .schemaVersion must be a non-negative finite number.');
    expect(errors).toContain('Shard .hash is required.');
    expect(errors).toContain('Shard .hashAlgorithm is required.');
  });

  it('rejects encounter referencing unknown zone (cross-reference)', () => {
    const shard = makeShard({
      encounters: [makeEncounter({ zoneId: 'zone_does_not_exist' })],
    });
    expect(
      validateShard(shard).some((e) => e.includes('references unknown Zone: zone_does_not_exist')),
    ).toBe(true);
  });

  it('rejects encounter referencing unknown loot table (cross-reference)', () => {
    const shard = makeShard({
      encounters: [makeEncounter({ lootTableId: 'loot_does_not_exist' })],
    });
    expect(
      validateShard(shard).some((e) => e.includes('references unknown LootTable: loot_does_not_exist')),
    ).toBe(true);
  });

  it('rejects loot entry referencing unknown item (cross-reference)', () => {
    const shard = makeShard({
      lootTables: [
        makeLootTable({
          entries: [{ id: 'lte_bad_item', itemId: 'item_does_not_exist', weight: 1 }],
        }),
      ],
    });
    expect(
      validateShard(shard).some((e) => e.includes('references unknown Item: item_does_not_exist')),
    ).toBe(true);
  });

  it('rejects loot entry referencing unknown skill (cross-reference)', () => {
    const shard = makeShard({
      lootTables: [
        makeLootTable({
          entries: [{ id: 'lte_bad_skill', skillId: 'skill_does_not_exist', weight: 1 }],
        }),
      ],
    });
    expect(
      validateShard(shard).some((e) => e.includes('references unknown Skill: skill_does_not_exist')),
    ).toBe(true);
  });

  it('rejects quest step referencing unknown skill (cross-reference)', () => {
    const shard = makeShard({
      quests: [
        makeQuest({
          steps: [{ id: 'qstep_x', objective: 'go', requiresSkillId: 'skill_ghost' }],
        }),
      ],
    });
    expect(
      validateShard(shard).some((e) => e.includes('references unknown Skill: skill_ghost')),
    ).toBe(true);
  });

  it('rejects quest step rewardItemIds referencing unknown item (cross-reference)', () => {
    const shard = makeShard({
      quests: [
        makeQuest({
          steps: [{ id: 'qstep_y', objective: 'go', rewardItemIds: ['item_ghost'] }],
        }),
      ],
    });
    expect(
      validateShard(shard).some((e) => e.includes('references unknown Item: item_ghost')),
    ).toBe(true);
  });

  it('propagates nested-primitive errors with grep-friendly prefixes', () => {
    const shard = makeShard({
      skills: [makeSkill({ rarity: 'godlike' as Skill['rarity'] })],
    });
    const errors = validateShard(shard);
    expect(errors.some((e) => e.startsWith('Shard shard_oasis_0.skills['))).toBe(true);
    expect(errors.some((e) => e.includes('Skill.rarity is unsupported: godlike'))).toBe(true);
  });

  it('clones deeply across every primitive class', () => {
    const shard = makeShard();
    const cloned = cloneShard(shard);
    cloned.zones[0].encounterIds!.push('enc_extra');
    cloned.encounters[0].lootTableId = 'loot_other';
    cloned.quests[0].steps[0].objective = 'mutated';
    cloned.items[0].name = 'mutated';
    cloned.skills[0].rarity = 'epic';
    cloned.lootTables[0].entries[0].weight = 99;
    expect(shard.zones[0].encounterIds).toEqual(['enc_camp_ambush_001']);
    expect(shard.encounters[0].lootTableId).toBe('loot_chest_common_001');
    expect(shard.quests[0].steps[0].objective).toBe('Reach the market square.');
    expect(shard.items[0].name).toBe('Brass Compass');
    expect(shard.skills[0].rarity).toBe('common');
    expect(shard.lootTables[0].entries[0].weight).toBe(1);
  });
});

// ── ShardReceipt envelope ──

describe('Frontier ShardReceipt envelope', () => {
  it('accepts a minimal receipt', () => {
    expect(validateShardReceipt(makeShardReceipt(), validateValidationReceipt)).toEqual([]);
  });

  it('accepts a receipt with nested ValidationReceipts', () => {
    const validation: ValidationReceipt = {
      id: 'val_001',
      scenarioId: 'scen_001',
      validatedAt: '2026-05-07T00:00:01Z',
      status: 'passed',
      hash: 'd'.repeat(64),
      hashAlgorithm: 'sha256',
    };
    const receipt = makeShardReceipt({ validationReceipts: [validation] });
    expect(validateShardReceipt(receipt, validateValidationReceipt)).toEqual([]);
  });

  it('rejects unsupported status', () => {
    const receipt = makeShardReceipt({ status: 'speculative' as ShardReceipt['status'] });
    expect(
      validateShardReceipt(receipt, validateValidationReceipt),
    ).toContain('ShardReceipt.status is unsupported: speculative.');
  });

  it('rejects when required fields are missing', () => {
    const receipt: ShardReceipt = {
      id: '',
      shardId: '',
      status: 'authored',
      sealedAt: '',
      hash: '',
      hashAlgorithm: '' as ShardReceipt['hashAlgorithm'],
    };
    const errors = validateShardReceipt(receipt, validateValidationReceipt);
    expect(errors).toContain('ShardReceipt.id is required.');
    expect(errors).toContain('ShardReceipt.shardId is required.');
    expect(errors).toContain('ShardReceipt.hash is required.');
    expect(errors).toContain('ShardReceipt.hashAlgorithm is required.');
    expect(errors).toContain('ShardReceipt.sealedAt is required.');
  });

  it('propagates nested ValidationReceipt errors with grep-friendly prefixes', () => {
    const validation: ValidationReceipt = {
      id: 'val_bad',
      scenarioId: '',
      validatedAt: '',
      status: 'broken' as ValidationReceipt['status'],
      hash: '',
      hashAlgorithm: '' as ValidationReceipt['hashAlgorithm'],
    };
    const receipt = makeShardReceipt({ validationReceipts: [validation] });
    const errors = validateShardReceipt(receipt, validateValidationReceipt);
    expect(errors.some((e) => e.startsWith('validationReceipts[val_bad]: '))).toBe(true);
  });

  it('rejects verification command without command text', () => {
    const receipt = makeShardReceipt({
      verificationCommands: [{ command: '' }],
    });
    expect(
      validateShardReceipt(receipt, validateValidationReceipt).some((e) =>
        e.includes('verification command without command text'),
      ),
    ).toBe(true);
  });

  it('clones deeply across nested ValidationReceipts', () => {
    const validation: ValidationReceipt = {
      id: 'val_001',
      scenarioId: 'scen_001',
      validatedAt: '2026-05-07T00:00:01Z',
      status: 'passed',
      hash: 'd'.repeat(64),
      hashAlgorithm: 'sha256',
      metadata: { reviewed: true },
    };
    const receipt = makeShardReceipt({
      validationReceipts: [validation],
      metadata: { reviewer: 'agent_a' },
    });
    const cloned = cloneShardReceipt(receipt, cloneValidationReceipt);
    (cloned.metadata as Record<string, unknown>).reviewer = 'mutated';
    cloned.validationReceipts![0].metadata!.reviewed = false;
    expect(receipt.metadata).toEqual({ reviewer: 'agent_a' });
    expect(receipt.validationReceipts![0].metadata).toEqual({ reviewed: true });
  });
});

// ── Type guards ──

describe('Frontier type guards', () => {
  it('isSupportedSkillRarity matches the registered list and rejects others', () => {
    for (const r of SKILL_RARITIES) expect(isSupportedSkillRarity(r)).toBe(true);
    expect(isSupportedSkillRarity('godlike')).toBe(false);
    expect(isSupportedSkillRarity('')).toBe(false);
  });

  it('isSupportedItemCategory matches the registered list and rejects others', () => {
    for (const c of ITEM_CATEGORIES) expect(isSupportedItemCategory(c)).toBe(true);
    expect(isSupportedItemCategory('macguffin')).toBe(false);
  });

  it('isSupportedEncounterTrigger matches the registered list and rejects others', () => {
    for (const t of ENCOUNTER_TRIGGER_KINDS) expect(isSupportedEncounterTrigger(t)).toBe(true);
    expect(isSupportedEncounterTrigger('on-vibe')).toBe(false);
  });

  it('isSupportedZoneBiome matches the registered list and rejects others', () => {
    for (const b of ZONE_BIOMES) expect(isSupportedZoneBiome(b)).toBe(true);
    expect(isSupportedZoneBiome('cyberspace')).toBe(false);
  });

  it('isSupportedShardReceiptStatus accepts the four statuses and rejects others', () => {
    expect(isSupportedShardReceiptStatus('authored')).toBe(true);
    expect(isSupportedShardReceiptStatus('validated')).toBe(true);
    expect(isSupportedShardReceiptStatus('rejected')).toBe(true);
    expect(isSupportedShardReceiptStatus('inconclusive')).toBe(true);
    expect(isSupportedShardReceiptStatus('speculative')).toBe(false);
  });
});
