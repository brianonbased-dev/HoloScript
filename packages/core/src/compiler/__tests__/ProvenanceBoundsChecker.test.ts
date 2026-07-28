/**
 * @fileoverview Tests for ProvenanceBoundsChecker
 * @module @holoscript/core/compiler
 */

import { describe, it, expect } from 'vitest';
import { ProvenanceBoundsChecker, createProvenanceBoundsChecker } from '../ProvenanceBoundsChecker';
import type { HoloComposition } from '../../parser/HoloCompositionTypes';
import type {
  HoloObjectTrait,
  HoloAbility,
  HoloLootTable,
  HoloGameTrigger,
  HoloSpawnPoint,
  HoloNPC,
} from '../../parser/HoloCompositionTypes';

// =============================================================================
// FIXTURE HELPERS
// =============================================================================

/** Minimal valid HoloComposition with no game constructs. */
function makeComposition(overrides: Partial<HoloComposition> = {}): HoloComposition {
  return {
    type: 'Composition',
    name: 'TestComposition',
    templates: [],
    objects: [],
    spatialGroups: [],
    lights: [],
    imports: [],
    timelines: [],
    audio: [],
    zones: [],
    transitions: [],
    conditionals: [],
    iterators: [],
    npcs: [],
    quests: [],
    abilities: [],
    dialogues: [],
    stateMachines: [],
    achievements: [],
    talentTrees: [],
    shapes: [],
    traits: [],
    ...overrides,
  } as HoloComposition;
}

function makeTrait(name: string): HoloObjectTrait {
  return {
    type: 'ObjectTrait',
    name,
    config: {},
  } as HoloObjectTrait;
}

function makeAbility(name: string, range = 0): HoloAbility {
  return {
    type: 'Ability',
    name,
    abilityType: 'spell',
    stats: {
      type: 'AbilityStats',
      range,
    },
    effects: {
      type: 'AbilityEffects',
    },
  } as HoloAbility;
}

function makeLootTable(name: string): HoloLootTable {
  return {
    type: 'LootTable',
    name,
    entries: [],
    properties: {},
  } as HoloLootTable;
}

function makeCombatTrigger(name: string): HoloGameTrigger {
  return {
    type: 'GameTrigger',
    name,
    radius: 5,
    properties: {},
  } as HoloGameTrigger;
}

function makeSpawnPoint(name: string): HoloSpawnPoint {
  return {
    type: 'SpawnPoint',
    name,
    properties: {},
  } as HoloSpawnPoint;
}

function makeNPC(name: string): HoloNPC {
  return {
    type: 'NPC',
    name,
    behaviors: [],
    dialogues: [],
    stats: { type: 'NPCStats', health: 100, level: 1 },
  } as unknown as HoloNPC;
}

// =============================================================================
// TEST (a): Moving world with NO @movement_contract → speedhack unmet
// =============================================================================

describe('ProvenanceBoundsChecker — speedhack obligation', () => {
  it('(a) moving world without @movement_contract → speedhack unmet, provablyBounded false', () => {
    const composition = makeComposition({
      spawnPoints: [makeSpawnPoint('spawn_1')],
      traits: [makeTrait('@provably_bounded')],
    });

    const checker = createProvenanceBoundsChecker();
    const report = checker.check(composition);

    const speedhack = report.obligations.find((o) => o.exploitClass === 'speedhack');
    expect(speedhack).toBeDefined();
    expect(speedhack!.status).toBe('unmet');
    expect(report.provablyBounded).toBe(false);
    expect(report.strict).toBe(true);
    expect(report.unmet).toBeGreaterThan(0);
    expect(report.summary).toMatch(/NOT BOUNDED/);
  });

  it('(b) moving world WITH @movement_contract + @provably_bounded → speedhack satisfied', () => {
    const composition = makeComposition({
      spawnPoints: [makeSpawnPoint('spawn_1')],
      traits: [makeTrait('@provably_bounded'), makeTrait('@movement_contract')],
    });

    const checker = createProvenanceBoundsChecker();
    const report = checker.check(composition);

    const speedhack = report.obligations.find((o) => o.exploitClass === 'speedhack');
    expect(speedhack).toBeDefined();
    expect(speedhack!.status).toBe('satisfied');
    expect(report.strict).toBe(true);
  });

  it('static composition (no spawn/NPC/logic) → speedhack not_applicable', () => {
    const composition = makeComposition({
      traits: [makeTrait('@provably_bounded')],
    });

    const checker = createProvenanceBoundsChecker();
    const report = checker.check(composition);

    const speedhack = report.obligations.find((o) => o.exploitClass === 'speedhack');
    expect(speedhack!.status).toBe('not_applicable');
  });
});

// =============================================================================
// TEST (c): @provably_bounded + all obligations satisfied → provablyBounded true
// =============================================================================

describe('ProvenanceBoundsChecker — full provability', () => {
  it('(c) @provably_bounded + movement_contract + receipt_on, no loot/abilities → provablyBounded true', () => {
    // A moving world with the required annotations and no additional constructs
    // that could introduce unmet obligations.
    const composition = makeComposition({
      spawnPoints: [makeSpawnPoint('spawn_1')],
      traits: [
        makeTrait('@provably_bounded'),
        makeTrait('@movement_contract'),
        makeTrait('@receipt_on'),
      ],
    });

    const checker = createProvenanceBoundsChecker();
    const report = checker.check(composition);

    expect(report.strict).toBe(true);
    expect(report.unmet).toBe(0);
    expect(report.provablyBounded).toBe(true);
    expect(report.summary).toMatch(/PROVABLY BOUNDED/);
  });

  it('(c) all constructs present + all required traits → provablyBounded true', () => {
    // Fully annotated composition: movement + abilities + loot + combat events + receipt
    const composition = makeComposition({
      spawnPoints: [makeSpawnPoint('spawn_1')],
      npcs: [makeNPC('guard_1')],
      abilities: [makeAbility('fireball', 10)],
      lootTables: [makeLootTable('chest_loot')],
      triggers: [makeCombatTrigger('combat_start')],
      traits: [
        makeTrait('@provably_bounded'),
        makeTrait('@movement_contract'),
        makeTrait('@receipt_on'),
      ],
    });

    const checker = createProvenanceBoundsChecker();
    const report = checker.check(composition);

    expect(report.strict).toBe(true);
    expect(report.provablyBounded).toBe(true);
    expect(report.unmet).toBe(0);

    // Speedhack: satisfied (has movement_contract)
    expect(report.obligations.find((o) => o.exploitClass === 'speedhack')!.status).toBe(
      'satisfied'
    );
    // Ability spam: satisfied (abilities present, server default)
    expect(report.obligations.find((o) => o.exploitClass === 'ability_spam')!.status).toBe(
      'satisfied'
    );
    // Dupe: satisfied (loot tables present)
    expect(report.obligations.find((o) => o.exploitClass === 'dupe')!.status).toBe('satisfied');
    // Unaudited event: satisfied (receipt_on present + combat trigger)
    expect(report.obligations.find((o) => o.exploitClass === 'unaudited_event')!.status).toBe(
      'satisfied'
    );
    // Range exploit: satisfied (ranged ability present)
    expect(report.obligations.find((o) => o.exploitClass === 'range_exploit')!.status).toBe(
      'satisfied'
    );
  });
});

// =============================================================================
// TEST (d): Empty/static composition → mostly not_applicable
// =============================================================================

describe('ProvenanceBoundsChecker — static/empty composition', () => {
  it('(d) empty composition without @provably_bounded → not strict, obligations mostly not_applicable', () => {
    const composition = makeComposition();

    const checker = createProvenanceBoundsChecker();
    const report = checker.check(composition);

    expect(report.strict).toBe(false);
    expect(report.provablyBounded).toBe(false);

    // No game constructs → speedhack, ability_spam, dupe, unaudited_event all not_applicable
    expect(report.obligations.find((o) => o.exploitClass === 'speedhack')!.status).toBe(
      'not_applicable'
    );
    expect(report.obligations.find((o) => o.exploitClass === 'ability_spam')!.status).toBe(
      'not_applicable'
    );
    expect(report.obligations.find((o) => o.exploitClass === 'dupe')!.status).toBe(
      'not_applicable'
    );
    expect(report.obligations.find((o) => o.exploitClass === 'unaudited_event')!.status).toBe(
      'not_applicable'
    );
    expect(report.obligations.find((o) => o.exploitClass === 'range_exploit')!.status).toBe(
      'not_applicable'
    );
    expect(report.obligations.find((o) => o.exploitClass === 'info_leak')!.status).toBe(
      'not_applicable'
    );

    expect(report.summary).toMatch(/AUDIT ONLY/);
  });

  it('(d) assumeStrict config flag treats composition as strict even without @provably_bounded', () => {
    const composition = makeComposition();

    const checker = createProvenanceBoundsChecker({ assumeStrict: true });
    const report = checker.check(composition);

    expect(report.strict).toBe(true);
    // No unmet obligations → provablyBounded true
    expect(report.provablyBounded).toBe(true);
    expect(report.summary).toMatch(/PROVABLY BOUNDED/);
  });
});

// =============================================================================
// TEST (e): Abilities present → cast obligation evaluated
// =============================================================================

describe('ProvenanceBoundsChecker — abilities', () => {
  it('(e) abilities present → ability_spam obligation evaluated (satisfied, server-default)', () => {
    const composition = makeComposition({
      abilities: [makeAbility('frostbolt'), makeAbility('fireball')],
    });

    const checker = createProvenanceBoundsChecker();
    const report = checker.check(composition);

    const abilitySpam = report.obligations.find((o) => o.exploitClass === 'ability_spam');
    expect(abilitySpam).toBeDefined();
    expect(abilitySpam!.status).toBe('satisfied');
    expect(abilitySpam!.evidence).toMatch(/frostbolt/);

    const unvalidatedCast = report.obligations.find((o) => o.exploitClass === 'unvalidated_cast');
    expect(unvalidatedCast).toBeDefined();
    expect(unvalidatedCast!.status).toBe('satisfied');
  });

  it('(e) ranged ability (range > 0) → range_exploit obligation satisfied', () => {
    const composition = makeComposition({
      abilities: [makeAbility('longshot', 30)],
    });

    const checker = createProvenanceBoundsChecker();
    const report = checker.check(composition);

    const rangeExploit = report.obligations.find((o) => o.exploitClass === 'range_exploit');
    expect(rangeExploit).toBeDefined();
    expect(rangeExploit!.status).toBe('satisfied');
    expect(rangeExploit!.evidence).toMatch(/longshot.*range=30/);
  });

  it('(e) melee-only ability (range = 0) → range_exploit not_applicable', () => {
    const composition = makeComposition({
      abilities: [makeAbility('slash', 0)],
    });

    const checker = createProvenanceBoundsChecker();
    const report = checker.check(composition);

    const rangeExploit = report.obligations.find((o) => o.exploitClass === 'range_exploit');
    expect(rangeExploit!.status).toBe('not_applicable');
  });
});

// =============================================================================
// ADDITIONAL EDGE CASES
// =============================================================================

describe('ProvenanceBoundsChecker — edge cases', () => {
  it('@receipt_on trait without leading @ also satisfies unaudited_event', () => {
    // Trait stored without @ prefix — checker strips it
    const composition = makeComposition({
      triggers: [makeCombatTrigger('death_zone')],
      traits: [
        makeTrait('provably_bounded'), // no @
        makeTrait('movement_contract'), // no @
        makeTrait('receipt_on'), // no @
      ],
    });

    const checker = createProvenanceBoundsChecker();
    const report = checker.check(composition);

    expect(report.strict).toBe(true);
    expect(report.obligations.find((o) => o.exploitClass === 'unaudited_event')!.status).toBe(
      'satisfied'
    );
  });

  it('NPC-only world (no spawnPoints) still triggers speedhack obligation', () => {
    const composition = makeComposition({
      npcs: [makeNPC('merchant')],
      traits: [makeTrait('@provably_bounded')],
    });

    const checker = createProvenanceBoundsChecker();
    const report = checker.check(composition);

    const speedhack = report.obligations.find((o) => o.exploitClass === 'speedhack');
    expect(speedhack!.status).toBe('unmet');
  });

  it('@server_side trait → info_leak satisfied', () => {
    const composition = makeComposition({
      traits: [makeTrait('@server_side')],
    });

    const checker = createProvenanceBoundsChecker();
    const report = checker.check(composition);

    const infoLeak = report.obligations.find((o) => o.exploitClass === 'info_leak');
    expect(infoLeak!.status).toBe('satisfied');
  });

  it('report contains all 7 exploit classes', () => {
    const composition = makeComposition();
    const checker = createProvenanceBoundsChecker();
    const report = checker.check(composition);

    const exploitClasses = report.obligations.map((o) => o.exploitClass);
    expect(exploitClasses).toContain('speedhack');
    expect(exploitClasses).toContain('ability_spam');
    expect(exploitClasses).toContain('unvalidated_cast');
    expect(exploitClasses).toContain('range_exploit');
    expect(exploitClasses).toContain('dupe');
    expect(exploitClasses).toContain('unaudited_event');
    expect(exploitClasses).toContain('info_leak');
    expect(report.obligations).toHaveLength(7);
  });

  it('satisfied + unmet counts match obligation statuses', () => {
    const composition = makeComposition({
      spawnPoints: [makeSpawnPoint('spawn_1')],
      triggers: [makeCombatTrigger('death')],
      traits: [makeTrait('@provably_bounded')], // missing movement_contract + receipt_on
    });

    const checker = createProvenanceBoundsChecker();
    const report = checker.check(composition);

    const actualSatisfied = report.obligations.filter((o) => o.status === 'satisfied').length;
    const actualUnmet = report.obligations.filter((o) => o.status === 'unmet').length;

    expect(report.satisfied).toBe(actualSatisfied);
    expect(report.unmet).toBe(actualUnmet);
  });
});
