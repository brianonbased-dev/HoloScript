/**
 * Creator Playable-Template Pipeline — tests.
 *
 * Proves task_1778186605462_muzd's verify gate:
 *   1. CreatorTemplate validates clean
 *   2. PlayableChallenge validates clean
 *   3. PublishReview validates clean
 *   4. Playability gates score and reject appropriately
 *   5. Deliberately-broken variants are rejected (G.GOLD.013 discipline)
 *
 * task_1778186605462_muzd
 */

import { describe, expect, it } from 'vitest';
import {
  TEMPLATE_PARAMETER_KINDS,
  DEFAULT_PLAYABILITY_REQUIREMENTS,
  validateTemplateParameter,
  validatePlayabilityRequirements,
  validateCreatorTemplate,
  validatePlayableChallenge,
  validatePublishReview,
  checkPlayability,
  cloneCreatorTemplate,
  clonePlayableChallenge,
  clonePublishReview,
} from '../creator-template';
import type { Shard, CreatorTemplate, PlayableChallenge, PublishReview, ValidationReceipt } from '../creator-template';

/** Minimal valid Shard for framework-level testing (no hololand-platform dependency). */
function makeMinimalShard(): Shard {
  return {
    id: 'shard_test',
    name: 'Test Shard',
    schemaVersion: 0,
    hash: '0000000000000000000000000000000000000000000000000000000000000000',
    hashAlgorithm: 'sha256',
    zones: [
      {
        id: 'zone_test',
        name: 'Test Zone',
        biome: 'urban',
        encounterIds: ['enc_test'],
      },
    ],
    encounters: [
      {
        id: 'enc_test',
        name: 'Test Encounter',
        trigger: 'on-enter',
        zoneId: 'zone_test',
        lootTableId: 'loot_test',
      },
    ],
    quests: [
      {
        id: 'quest_test',
        name: 'Test Quest',
        steps: [
          {
            id: 'qstep_test',
            objective: 'Complete the test.',
            rewardItemIds: ['item_test'],
          },
        ],
      },
    ],
    items: [
      {
        id: 'item_test',
        name: 'Test Item',
        category: 'artifact',
      },
    ],
    skills: [
      {
        id: 'skill_test',
        name: 'Test Skill',
        rarity: 'common',
      },
    ],
    lootTables: [
      {
        id: 'loot_test',
        name: 'Test Loot',
        entries: [
          {
            id: 'lte_test',
            itemId: 'item_test',
            weight: 1,
          },
        ],
      },
    ],
  };
}

function makeValidTemplate(): CreatorTemplate {
  return {
    id: 'tmpl_test_001',
    name: 'Test Template',
    description: 'A template for testing.',
    templateKind: 'challenge',
    baseShard: makeMinimalShard(),
    parameters: [
      {
        id: 'param_difficulty',
        name: 'Difficulty',
        kind: 'number',
        defaultValue: 1,
        description: 'How hard the challenge is.',
      },
      {
        id: 'param_biome',
        name: 'Biome',
        kind: 'enum',
        defaultValue: 'urban',
        allowedValues: ['urban', 'wilderness'],
        description: 'Which biome to use.',
      },
    ],
    playabilityRequirements: DEFAULT_PLAYABILITY_REQUIREMENTS,
  };
}

function makeValidValidationReceipt(): ValidationReceipt {
  return {
    id: 'val_test_001',
    scenarioId: 'scenario_test',
    validatedAt: '2026-05-07T12:00:00Z',
    status: 'passed',
    hash: '0000000000000000000000000000000000000000000000000000000000000000',
    hashAlgorithm: 'sha256',
  };
}

function makeValidChallenge(): PlayableChallenge {
  return {
    id: 'chal_test_001',
    name: 'Test Challenge',
    generatedShard: makeMinimalShard(),
    playabilityScore: 1.0,
    validationReceipt: makeValidValidationReceipt(),
    status: 'playable',
    creatorId: 'creator_test',
    createdAt: '2026-05-07T12:00:00Z',
  };
}

function makeValidReview(): PublishReview {
  return {
    id: 'rev_test_001',
    challengeId: 'chal_test_001',
    status: 'pending',
  };
}

describe('CreatorTemplate — validation', () => {
  it('validates a clean template', () => {
    const template = makeValidTemplate();
    const errors = validateCreatorTemplate(template);
    expect(errors).toEqual([]);
  });

  it('rejects a template without id', () => {
    const template = makeValidTemplate();
    // @ts-expect-error — deliberate mutation for false-case testing
    template.id = '';
    const errors = validateCreatorTemplate(template);
    expect(errors.some((e) => e.includes('CreatorTemplate.id is required'))).toBe(true);
  });

  it('rejects a template without name', () => {
    const template = makeValidTemplate();
    // @ts-expect-error
    template.name = '';
    const errors = validateCreatorTemplate(template);
    expect(errors.some((e) => e.includes('.name is required'))).toBe(true);
  });

  it('rejects a template with invalid baseShard (missing id)', () => {
    const template = makeValidTemplate();
    template.baseShard = { ...template.baseShard, id: '' };
    const errors = validateCreatorTemplate(template);
    expect(errors.some((e) => e.includes('baseShard') && e.includes('Shard.id is required'))).toBe(true);
  });

  it('rejects a template parameter with unsupported kind', () => {
    const template = makeValidTemplate();
    template.parameters[0].kind = 'invalid-kind' as unknown as typeof template.parameters[0]['kind'];
    const errors = validateCreatorTemplate(template);
    expect(errors.some((e) => e.includes('kind is unsupported'))).toBe(true);
  });

  it('rejects an enum parameter without allowedValues', () => {
    const template = makeValidTemplate();
    template.parameters[1].allowedValues = undefined;
    const errors = validateCreatorTemplate(template);
    expect(errors.some((e) => e.includes('enum requires non-empty allowedValues'))).toBe(true);
  });

  it('rejects playability requirements with negative minQuests', () => {
    const template = makeValidTemplate();
    template.playabilityRequirements = { ...DEFAULT_PLAYABILITY_REQUIREMENTS, minQuests: -1 };
    const errors = validateCreatorTemplate(template);
    expect(errors.some((e) => e.includes('minQuests') && e.includes('non-negative'))).toBe(true);
  });

  it('clones a template without mutating the original', () => {
    const original = makeValidTemplate();
    const cloned = cloneCreatorTemplate(original);
    cloned.parameters[0].name = 'Mutated';
    cloned.baseShard.name = 'Mutated Shard';
    expect(original.parameters[0].name).toBe('Difficulty');
    expect(original.baseShard.name).toBe('Test Shard');
  });
});

describe('PlayableChallenge — validation', () => {
  it('validates a clean challenge', () => {
    const challenge = makeValidChallenge();
    const errors = validatePlayableChallenge(challenge);
    expect(errors).toEqual([]);
  });

  it('rejects a challenge without id', () => {
    const challenge = makeValidChallenge();
    // @ts-expect-error
    challenge.id = '';
    const errors = validatePlayableChallenge(challenge);
    expect(errors.some((e) => e.includes('PlayableChallenge.id is required'))).toBe(true);
  });

  it('rejects a challenge with playabilityScore out of range', () => {
    const challenge = makeValidChallenge();
    challenge.playabilityScore = 1.5;
    const errors = validatePlayableChallenge(challenge);
    expect(errors.some((e) => e.includes('playabilityScore must be in [0, 1]'))).toBe(true);
  });

  it('rejects a challenge with negative playabilityScore', () => {
    const challenge = makeValidChallenge();
    challenge.playabilityScore = -0.1;
    const errors = validatePlayableChallenge(challenge);
    expect(errors.some((e) => e.includes('playabilityScore must be in [0, 1]'))).toBe(true);
  });

  it('rejects a challenge with invalid status', () => {
    const challenge = makeValidChallenge();
    // @ts-expect-error
    challenge.status = 'archived';
    const errors = validatePlayableChallenge(challenge);
    expect(errors.some((e) => e.includes('status is unsupported'))).toBe(true);
  });

  it('rejects a challenge without creatorId', () => {
    const challenge = makeValidChallenge();
    // @ts-expect-error
    challenge.creatorId = '';
    const errors = validatePlayableChallenge(challenge);
    expect(errors.some((e) => e.includes('creatorId is required'))).toBe(true);
  });

  it('rejects a challenge without validationReceipt hash', () => {
    const challenge = makeValidChallenge();
    challenge.validationReceipt = { ...challenge.validationReceipt, hash: '' };
    const errors = validatePlayableChallenge(challenge);
    expect(errors.some((e) => e.includes('validationReceipt.hash is required'))).toBe(true);
  });

  it('clones a challenge without mutating the original', () => {
    const original = makeValidChallenge();
    const cloned = clonePlayableChallenge(original);
    cloned.generatedShard.name = 'Mutated';
    cloned.validationReceipt.status = 'failed';
    expect(original.generatedShard.name).toBe('Test Shard');
    expect(original.validationReceipt.status).toBe('passed');
  });
});

describe('PublishReview — validation', () => {
  it('validates a clean pending review', () => {
    const review = makeValidReview();
    const errors = validatePublishReview(review);
    expect(errors).toEqual([]);
  });

  it('rejects a review without id', () => {
    const review = makeValidReview();
    // @ts-expect-error
    review.id = '';
    const errors = validatePublishReview(review);
    expect(errors.some((e) => e.includes('PublishReview.id is required'))).toBe(true);
  });

  it('rejects a review without challengeId', () => {
    const review = makeValidReview();
    // @ts-expect-error
    review.challengeId = '';
    const errors = validatePublishReview(review);
    expect(errors.some((e) => e.includes('challengeId is required'))).toBe(true);
  });

  it('rejects an approved review without reviewerId', () => {
    const review = makeValidReview();
    review.status = 'approved';
    const errors = validatePublishReview(review);
    expect(errors.some((e) => e.includes('requires reviewerId'))).toBe(true);
  });

  it('rejects a rejected review without reviewedAt', () => {
    const review = makeValidReview();
    review.status = 'rejected';
    review.reviewerId = 'reviewer_test';
    const errors = validatePublishReview(review);
    expect(errors.some((e) => e.includes('requires reviewedAt'))).toBe(true);
  });

  it('rejects a review with invalid status', () => {
    const review = makeValidReview();
    // @ts-expect-error
    review.status = 'draft';
    const errors = validatePublishReview(review);
    expect(errors.some((e) => e.includes('status is unsupported'))).toBe(true);
  });

  it('clones a review without mutating the original', () => {
    const original = makeValidReview();
    const cloned = clonePublishReview(original);
    cloned.status = 'approved';
    expect(original.status).toBe('pending');
  });
});

describe('Playability gates', () => {
  it('passes for a valid frontier shard with default requirements', () => {
    const shard = makeMinimalShard();
    const result = checkPlayability(shard, DEFAULT_PLAYABILITY_REQUIREMENTS);
    expect(result.passed).toBe(true);
    expect(result.score).toBe(1.0);
    expect(result.violations).toEqual([]);
  });

  it('fails when encounters are below minimum', () => {
    const shard = makeMinimalShard();
    shard.encounters = [];
    const result = checkPlayability(shard, { ...DEFAULT_PLAYABILITY_REQUIREMENTS, minEncounters: 1 });
    expect(result.passed).toBe(false);
    expect(result.violations.some((v) => v.includes('encounters'))).toBe(true);
    expect(result.score).toBeLessThan(1.0);
  });

  it('fails when quests are below minimum', () => {
    const shard = makeMinimalShard();
    shard.quests = [];
    const result = checkPlayability(shard, { ...DEFAULT_PLAYABILITY_REQUIREMENTS, minQuests: 1 });
    expect(result.passed).toBe(false);
    expect(result.violations.some((v) => v.includes('quests'))).toBe(true);
  });

  it('fails when quest steps are below minimum', () => {
    const shard = makeMinimalShard();
    shard.quests[0].steps = [];
    const result = checkPlayability(shard, { ...DEFAULT_PLAYABILITY_REQUIREMENTS, minQuestSteps: 1 });
    expect(result.passed).toBe(false);
    expect(result.violations.some((v) => v.includes('questSteps'))).toBe(true);
  });

  it('fails when items are below minimum', () => {
    const shard = makeMinimalShard();
    shard.items = [];
    const result = checkPlayability(shard, { ...DEFAULT_PLAYABILITY_REQUIREMENTS, minItems: 1 });
    expect(result.passed).toBe(false);
    expect(result.violations.some((v) => v.includes('items'))).toBe(true);
  });

  it('fails when skills are below minimum', () => {
    const shard = makeMinimalShard();
    shard.skills = [];
    const result = checkPlayability(shard, { ...DEFAULT_PLAYABILITY_REQUIREMENTS, minSkills: 1 });
    expect(result.passed).toBe(false);
    expect(result.violations.some((v) => v.includes('skills'))).toBe(true);
  });

  it('fails when loot tables are below minimum', () => {
    const shard = makeMinimalShard();
    shard.lootTables = [];
    const result = checkPlayability(shard, { ...DEFAULT_PLAYABILITY_REQUIREMENTS, minLootTables: 1 });
    expect(result.passed).toBe(false);
    expect(result.violations.some((v) => v.includes('lootTables'))).toBe(true);
  });

  it('fails when cross-references are broken and required', () => {
    const shard = makeMinimalShard();
    shard.encounters[0].zoneId = 'zone_does_not_exist';
    const result = checkPlayability(shard, { ...DEFAULT_PLAYABILITY_REQUIREMENTS, requireCrossReferences: true });
    expect(result.passed).toBe(false);
    expect(result.violations.some((v) => v.includes('crossReferences'))).toBe(true);
  });

  it('passes cross-references when requirement is disabled', () => {
    const shard = makeMinimalShard();
    shard.encounters[0].zoneId = 'zone_does_not_exist';
    const result = checkPlayability(shard, { ...DEFAULT_PLAYABILITY_REQUIREMENTS, requireCrossReferences: false });
    expect(result.violations.some((v) => v.includes('crossReferences'))).toBe(false);
  });

  it('fails when reward path is missing and required', () => {
    const shard = makeMinimalShard();
    // Remove all reward paths
    shard.quests[0].steps[0].rewardItemIds = [];
    shard.lootTables = [];
    const result = checkPlayability(shard, { ...DEFAULT_PLAYABILITY_REQUIREMENTS, requireRewardPath: true });
    expect(result.passed).toBe(false);
    expect(result.violations.some((v) => v.includes('rewardPath'))).toBe(true);
  });

  it('passes reward path when requirement is disabled', () => {
    const shard = makeMinimalShard();
    shard.quests[0].steps[0].rewardItemIds = [];
    shard.lootTables = [];
    const result = checkPlayability(shard, { ...DEFAULT_PLAYABILITY_REQUIREMENTS, requireRewardPath: false });
    expect(result.violations.some((v) => v.includes('rewardPath'))).toBe(false);
  });

  it('scores < 1.0 when some but not all requirements are met', () => {
    const shard = makeMinimalShard();
    shard.encounters = [];
    shard.lootTables = [];
    const result = checkPlayability(shard, DEFAULT_PLAYABILITY_REQUIREMENTS);
    expect(result.score).toBeGreaterThan(0);
    expect(result.score).toBeLessThan(1.0);
    expect(result.passed).toBe(false);
  });

  it('scores 1.0 when all requirements are met with zero requirements', () => {
    const shard = makeMinimalShard();
    const result = checkPlayability(shard, {
      minEncounters: 0,
      minQuests: 0,
      minQuestSteps: 0,
      minItems: 0,
      minSkills: 0,
      minLootTables: 0,
      requireCrossReferences: false,
      requireRewardPath: false,
    });
    expect(result.score).toBe(1.0);
    expect(result.passed).toBe(true);
  });
});
