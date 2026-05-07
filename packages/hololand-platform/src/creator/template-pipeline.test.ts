/**
 * Creator Template Pipeline — tests.
 *
 * Proves task_1778186605462_muzd's verify gate:
 *   1. compileTemplateToChallenge generates a PlayableChallenge from a template
 *   2. Playable challenge passes playability gates and receives `playable` status
 *   3. Rejected template (fails gates) receives `rejected` status
 *   4. submitForReview creates a pending PublishReview
 *   5. approveChallenge flips challenge to `published` and review to `approved`
 *   6. rejectChallenge flips review to `rejected`, challenge stays `playable`
 *   7. listPublishedChallenges / getKioskSlice only surface published challenges
 *   8. Deliberately-broken variants throw or return null (G.GOLD.013 discipline)
 *
 * task_1778186605462_muzd
 */

import { describe, expect, it, beforeEach } from 'vitest';
import {
  compileTemplateToChallenge,
  submitForReview,
  approveChallenge,
  rejectChallenge,
  listPublishedChallenges,
  getPublishedChallenge,
  getKioskSlice,
  resetCreatorRegistry,
  getCreatorRegistry,
} from './template-pipeline';
import { buildFrontierShardZero } from '../world/frontier-shard-zero';
import type { CreatorTemplate, PlayableChallenge, ValidationReceipt } from '@holoscript/framework';
import { DEFAULT_PLAYABILITY_REQUIREMENTS } from '@holoscript/framework';

function makeValidTemplate(): CreatorTemplate {
  return {
    id: 'tmpl_test_pipeline',
    name: 'Pipeline Test Template',
    description: 'A template for pipeline testing.',
    templateKind: 'challenge',
    baseShard: buildFrontierShardZero(),
    parameters: [],
    playabilityRequirements: DEFAULT_PLAYABILITY_REQUIREMENTS,
  };
}

function makeCustomValidationReceipt(challengeId: string): ValidationReceipt {
  return {
    id: `val_custom_${challengeId}`,
    scenarioId: 'custom_scenario',
    validatedAt: '2026-05-07T12:00:00Z',
    status: 'passed',
    hash: 'deadbeef',
    hashAlgorithm: 'sha256',
  };
}

describe('compileTemplateToChallenge', () => {
  beforeEach(() => {
    resetCreatorRegistry();
  });

  it('compiles a valid template to a playable challenge', () => {
    const template = makeValidTemplate();
    const challenge = compileTemplateToChallenge(template, { creatorId: 'creator_a' });

    expect(challenge.id).toMatch(/^chal_tmpl_test_pipeline_/);
    expect(challenge.name).toBe('Pipeline Test Template');
    expect(challenge.creatorId).toBe('creator_a');
    expect(challenge.status).toBe('playable');
    expect(challenge.playabilityScore).toBe(1.0);
    expect(challenge.generatedShard.id).toMatch(/^shard_chal_tmpl_test_pipeline_/);
    expect(challenge.generatedShard.name).toBe('Pipeline Test Template — creator_a');
    expect(challenge.validationReceipt.id).toMatch(/^val_chal_tmpl_test_pipeline_/);
  });

  it('uses a custom validation receipt generator when provided', () => {
    const template = makeValidTemplate();
    const challenge = compileTemplateToChallenge(template, {
      creatorId: 'creator_b',
      makeValidationReceipt: makeCustomValidationReceipt,
    });

    expect(challenge.validationReceipt.id).toMatch(/^val_custom_chal_tmpl_test_pipeline_/);
    expect(challenge.validationReceipt.scenarioId).toBe('custom_scenario');
  });

  it('rejects a template that fails playability gates', () => {
    const template = makeValidTemplate();
    template.baseShard.encounters = [];
    template.baseShard.quests = [];
    template.baseShard.items = [];
    template.baseShard.skills = [];
    template.baseShard.lootTables = [];

    const challenge = compileTemplateToChallenge(template, { creatorId: 'creator_c' });

    expect(challenge.status).toBe('rejected');
    expect(challenge.playabilityScore).toBeLessThan(1.0);
  });

  it('throws for an invalid template', () => {
    const template = makeValidTemplate();
    template.id = '';
    expect(() => compileTemplateToChallenge(template, { creatorId: 'creator_d' })).toThrow(
      'Invalid CreatorTemplate',
    );
  });

  it('registers the challenge in the in-memory registry', () => {
    const template = makeValidTemplate();
    const challenge = compileTemplateToChallenge(template, { creatorId: 'creator_e' });
    const registry = getCreatorRegistry();
    expect(registry.challenges.has(challenge.id)).toBe(true);
    expect(registry.challenges.get(challenge.id)?.status).toBe('playable');
  });
});

describe('submitForReview', () => {
  beforeEach(() => {
    resetCreatorRegistry();
  });

  it('submits a playable challenge for review', () => {
    const template = makeValidTemplate();
    const challenge = compileTemplateToChallenge(template, { creatorId: 'creator_f' });
    const review = submitForReview(challenge);

    expect(review.challengeId).toBe(challenge.id);
    expect(review.status).toBe('pending');
    expect(review.id).toBe(`rev_${challenge.id}`);
  });

  it('throws when challenge status is not playable', () => {
    const template = makeValidTemplate();
    template.baseShard.encounters = [];
    const challenge = compileTemplateToChallenge(template, { creatorId: 'creator_g' });
    expect(challenge.status).toBe('rejected');
    expect(() => submitForReview(challenge)).toThrow('status is rejected');
  });

  it('throws for an invalid challenge', () => {
    const badChallenge = { id: '', name: '', status: 'playable' } as unknown as PlayableChallenge;
    expect(() => submitForReview(badChallenge)).toThrow('Invalid PlayableChallenge');
  });

  it('registers the review in the in-memory registry', () => {
    const template = makeValidTemplate();
    const challenge = compileTemplateToChallenge(template, { creatorId: 'creator_h' });
    const review = submitForReview(challenge);
    const registry = getCreatorRegistry();
    expect(registry.reviews.has(review.id)).toBe(true);
  });
});

describe('approveChallenge', () => {
  beforeEach(() => {
    resetCreatorRegistry();
  });

  it('approves a pending review and publishes the challenge', () => {
    const template = makeValidTemplate();
    const challenge = compileTemplateToChallenge(template, { creatorId: 'creator_i' });
    const review = submitForReview(challenge);

    const published = approveChallenge(review, 'reviewer_1', 'Looks good!');

    expect(published.status).toBe('published');
    expect(published.id).toBe(challenge.id);

    const registry = getCreatorRegistry();
    const storedReview = registry.reviews.get(review.id);
    expect(storedReview?.status).toBe('approved');
    expect(storedReview?.reviewerId).toBe('reviewer_1');
    expect(storedReview?.notes).toBe('Looks good!');
  });

  it('throws when review status is not pending', () => {
    const template = makeValidTemplate();
    const challenge = compileTemplateToChallenge(template, { creatorId: 'creator_j' });
    const review = submitForReview(challenge);
    approveChallenge(review, 'reviewer_1');

    // Re-fetch the now-approved review from registry
    const registry = getCreatorRegistry();
    const approvedReview = registry.reviews.get(review.id)!;
    expect(() => approveChallenge(approvedReview, 'reviewer_2')).toThrow('status is approved');
  });

  it('throws when challenge is missing from registry', () => {
    const orphanReview = {
      id: 'rev_orphan',
      challengeId: 'chal_nonexistent',
      status: 'pending',
    } as ReturnType<typeof submitForReview>;
    expect(() => approveChallenge(orphanReview, 'reviewer_1')).toThrow(
      'Challenge chal_nonexistent not found',
    );
  });
});

describe('rejectChallenge', () => {
  beforeEach(() => {
    resetCreatorRegistry();
  });

  it('rejects a pending review and leaves challenge playable', () => {
    const template = makeValidTemplate();
    const challenge = compileTemplateToChallenge(template, { creatorId: 'creator_k' });
    const review = submitForReview(challenge);

    const result = rejectChallenge(review, 'reviewer_2', 'Needs more loot.');

    expect(result.status).toBe('playable');
    expect(result.id).toBe(challenge.id);

    const registry = getCreatorRegistry();
    const storedReview = registry.reviews.get(review.id);
    expect(storedReview?.status).toBe('rejected');
    expect(storedReview?.reviewerId).toBe('reviewer_2');
    expect(storedReview?.notes).toBe('Needs more loot.');
  });

  it('throws when review status is not pending', () => {
    const template = makeValidTemplate();
    const challenge = compileTemplateToChallenge(template, { creatorId: 'creator_l' });
    const review = submitForReview(challenge);
    rejectChallenge(review, 'reviewer_1');

    const registry = getCreatorRegistry();
    const rejectedReview = registry.reviews.get(review.id)!;
    expect(() => rejectChallenge(rejectedReview, 'reviewer_2')).toThrow('status is rejected');
  });
});

describe('Kiosk consumption', () => {
  beforeEach(() => {
    resetCreatorRegistry();
  });

  it('lists only published challenges', () => {
    const template = makeValidTemplate();
    const c1 = compileTemplateToChallenge(template, { creatorId: 'creator_m' });
    const c2 = compileTemplateToChallenge(
      { ...template, id: 'tmpl_test_pipeline_2', name: 'Second Template' },
      { creatorId: 'creator_n' },
    );

    submitForReview(c1);
    const r1 = getCreatorRegistry().reviews.get(`rev_${c1.id}`)!;
    approveChallenge(r1, 'reviewer_1');

    // c2 stays playable — not published
    const published = listPublishedChallenges();
    expect(published.length).toBe(1);
    expect(published[0].id).toBe(c1.id);
  });

  it('filters by creatorId', () => {
    const template = makeValidTemplate();
    const c1 = compileTemplateToChallenge(template, { creatorId: 'alice' });
    const c2 = compileTemplateToChallenge(
      { ...template, id: 'tmpl_test_pipeline_2', name: 'Second Template' },
      { creatorId: 'bob' },
    );

    submitForReview(c1);
    const r1 = getCreatorRegistry().reviews.get(`rev_${c1.id}`)!;
    approveChallenge(r1, 'reviewer_1');

    submitForReview(c2);
    const r2 = getCreatorRegistry().reviews.get(`rev_${c2.id}`)!;
    approveChallenge(r2, 'reviewer_1');

    expect(listPublishedChallenges({ creatorId: 'alice' }).length).toBe(1);
    expect(listPublishedChallenges({ creatorId: 'alice' })[0].creatorId).toBe('alice');
  });

  it('filters by search term', () => {
    const template = makeValidTemplate();
    const c1 = compileTemplateToChallenge(template, { creatorId: 'creator_o' });
    const c2 = compileTemplateToChallenge(
      { ...template, id: 'tmpl_test_pipeline_2', name: 'Desert Raid', description: 'Hot and sandy' },
      { creatorId: 'creator_p' },
    );

    submitForReview(c1);
    const r1 = getCreatorRegistry().reviews.get(`rev_${c1.id}`)!;
    approveChallenge(r1, 'reviewer_1');

    submitForReview(c2);
    const r2 = getCreatorRegistry().reviews.get(`rev_${c2.id}`)!;
    approveChallenge(r2, 'reviewer_1');

    const results = listPublishedChallenges({ search: 'desert' });
    expect(results.length).toBe(1);
    expect(results[0].name).toBe('Desert Raid');
  });

  it('respects limit', () => {
    const template = makeValidTemplate();
    for (let i = 0; i < 5; i++) {
      const c = compileTemplateToChallenge(
        { ...template, id: `tmpl_${i}`, name: `Template ${i}` },
        { creatorId: `creator_${i}` },
      );
      submitForReview(c);
      const r = getCreatorRegistry().reviews.get(`rev_${c.id}`)!;
      approveChallenge(r, 'reviewer_1');
    }
    expect(listPublishedChallenges({ limit: 2 }).length).toBe(2);
  });

  it('returns null for unpublished challenge via getPublishedChallenge', () => {
    const template = makeValidTemplate();
    const challenge = compileTemplateToChallenge(template, { creatorId: 'creator_q' });
    expect(getPublishedChallenge(challenge.id)).toBeNull();
  });

  it('returns null for missing challenge via getPublishedChallenge', () => {
    expect(getPublishedChallenge('chal_nonexistent')).toBeNull();
  });

  it('returns a kiosk slice for a published challenge', () => {
    const template = makeValidTemplate();
    const challenge = compileTemplateToChallenge(template, { creatorId: 'creator_r' });
    submitForReview(challenge);
    const r = getCreatorRegistry().reviews.get(`rev_${challenge.id}`)!;
    approveChallenge(r, 'reviewer_1');

    const slice = getKioskSlice(challenge.id);
    expect(slice).not.toBeNull();
    expect(slice!.challengeId).toBe(challenge.id);
    expect(slice!.name).toBe(challenge.name);
    expect(slice!.creatorId).toBe('creator_r');
    expect(slice!.shard.id).toBe(challenge.generatedShard.id);
    expect(slice!.playabilityScore).toBe(challenge.playabilityScore);
  });

  it('returns null for an unpublished challenge via getKioskSlice', () => {
    const template = makeValidTemplate();
    const challenge = compileTemplateToChallenge(template, { creatorId: 'creator_s' });
    expect(getKioskSlice(challenge.id)).toBeNull();
  });
});
