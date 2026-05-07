/**
 * HoloLand Creator Kiosk — tests.
 *
 * Proves task_1778186605462_muzd's kiosk verify gate:
 *   1. buildKioskCard produces a valid KioskCard from a PlayableChallenge
 *   2. paginateKioskCards produces correct slices and boundary flags
 *   3. kioskSearch filters by name and description
 *   4. kioskFeatured sorts by score + encounter + quest
 *   5. Deliberately-broken inputs throw or return safe defaults (G.GOLD.013)
 *
 * task_1778186605462_muzd
 */

import { describe, expect, it } from 'vitest';
import {
  buildKioskCard,
  paginateKioskCards,
  kioskSearch,
  kioskFeatured,
} from './kiosk';
import type { PlayableChallenge, ValidationReceipt } from '@holoscript/framework';
import { buildFrontierShardZero } from '../world/frontier-shard-zero';

function makeValidChallenge(overrides?: Partial<PlayableChallenge>): PlayableChallenge {
  const shard = buildFrontierShardZero();
  const receipt: ValidationReceipt = {
    id: 'val_test',
    scenarioId: 'scenario_test',
    validatedAt: '2026-05-07T12:00:00Z',
    status: 'passed',
    hash: '0000000000000000000000000000000000000000000000000000000000000000',
    hashAlgorithm: 'sha256',
  };
  return {
    id: 'chal_test_001',
    name: 'Test Challenge',
    generatedShard: shard,
    playabilityScore: 1.0,
    validationReceipt: receipt,
    status: 'published',
    creatorId: 'creator_test',
    createdAt: '2026-05-07T12:00:00Z',
    ...overrides,
  };
}

describe('buildKioskCard', () => {
  it('builds a card from a valid challenge', () => {
    const challenge = makeValidChallenge();
    const card = buildKioskCard(challenge);

    expect(card.challengeId).toBe('chal_test_001');
    expect(card.name).toBe('Test Challenge');
    expect(card.creatorId).toBe('creator_test');
    expect(card.playabilityScore).toBe(1.0);
    expect(card.shardId).toBe(challenge.generatedShard.id);
    expect(card.encounterCount).toBe(challenge.generatedShard.encounters.length);
    expect(card.questCount).toBe(challenge.generatedShard.quests.length);
    expect(card.itemCount).toBe(challenge.generatedShard.items.length);
    expect(card.skillCount).toBe(challenge.generatedShard.skills.length);
    expect(card.difficultyLabel).toBe('Casual');
  });

  it('throws when generatedShard is missing', () => {
    const challenge = makeValidChallenge();
    // @ts-expect-error — deliberate false-case
    challenge.generatedShard = undefined;
    expect(() => buildKioskCard(challenge)).toThrow('generatedShard is required');
  });

  it('maps difficulty labels correctly', () => {
    expect(buildKioskCard(makeValidChallenge({ playabilityScore: 0.95 })).difficultyLabel).toBe('Casual');
    expect(buildKioskCard(makeValidChallenge({ playabilityScore: 0.8 })).difficultyLabel).toBe('Moderate');
    expect(buildKioskCard(makeValidChallenge({ playabilityScore: 0.6 })).difficultyLabel).toBe('Intense');
    expect(buildKioskCard(makeValidChallenge({ playabilityScore: 0.3 })).difficultyLabel).toBe('Extreme');
  });
});

describe('paginateKioskCards', () => {
  const cards = Array.from({ length: 10 }, (_, i) =>
    buildKioskCard(makeValidChallenge({ id: `chal_${i}`, name: `Challenge ${i}` })),
  );

  it('returns the first page', () => {
    const grid = paginateKioskCards(cards, 1, 3);
    expect(grid.cards.length).toBe(3);
    expect(grid.page).toBe(1);
    expect(grid.total).toBe(10);
    expect(grid.hasNext).toBe(true);
    expect(grid.hasPrev).toBe(false);
    expect(grid.cards[0].challengeId).toBe('chal_0');
  });

  it('returns the last page', () => {
    const grid = paginateKioskCards(cards, 4, 3);
    expect(grid.cards.length).toBe(1);
    expect(grid.hasNext).toBe(false);
    expect(grid.hasPrev).toBe(true);
    expect(grid.cards[0].challengeId).toBe('chal_9');
  });

  it('clamps negative page to 1', () => {
    const grid = paginateKioskCards(cards, -1, 3);
    expect(grid.page).toBe(1);
    expect(grid.hasPrev).toBe(false);
  });

  it('clamps negative pageSize to 1', () => {
    const grid = paginateKioskCards(cards, 1, -5);
    expect(grid.pageSize).toBe(1);
  });

  it('returns empty for page beyond range', () => {
    const grid = paginateKioskCards(cards, 100, 3);
    expect(grid.cards.length).toBe(0);
    expect(grid.hasNext).toBe(false);
  });
});

describe('kioskSearch', () => {
  const cards = [
    buildKioskCard(makeValidChallenge({ id: 'chal_a', name: 'Desert Raid', description: 'Hot and sandy' })),
    buildKioskCard(makeValidChallenge({ id: 'chal_b', name: 'Forest Ambush', description: 'Cool and green' })),
    buildKioskCard(makeValidChallenge({ id: 'chal_c', name: 'Sky Fortress', description: 'High above the clouds' })),
  ];

  it('finds matches by name', () => {
    const results = kioskSearch(cards, 'desert');
    expect(results.length).toBe(1);
    expect(results[0].name).toBe('Desert Raid');
  });

  it('finds matches by description', () => {
    const results = kioskSearch(cards, 'green');
    expect(results.length).toBe(1);
    expect(results[0].name).toBe('Forest Ambush');
  });

  it('finds matches by shardName', () => {
    // frontier-shard-zero name is "Oasis Shard 0"
    const results = kioskSearch(cards, 'oasis');
    expect(results.length).toBe(3);
  });

  it('requires all tokens to match', () => {
    const results = kioskSearch(cards, 'desert hot');
    expect(results.length).toBe(1);
    expect(results[0].name).toBe('Desert Raid');
  });

  it('returns empty when no match', () => {
    const results = kioskSearch(cards, 'underwater');
    expect(results.length).toBe(0);
  });

  it('returns all cards for empty query', () => {
    const results = kioskSearch(cards, '  ');
    expect(results.length).toBe(3);
  });
});

describe('kioskFeatured', () => {
  const cards = [
    buildKioskCard(makeValidChallenge({ id: 'chal_a', name: 'A', playabilityScore: 0.5 })),
    buildKioskCard(makeValidChallenge({ id: 'chal_b', name: 'B', playabilityScore: 0.9 })),
    buildKioskCard(makeValidChallenge({ id: 'chal_c', name: 'C', playabilityScore: 0.9 })),
  ];
  // B and C have same score (0.9). To break ties, add encounters.
  // B: 1 encounter (default), C: 1 encounter (default). Still tied.
  // We need to mutate the generatedShard counts directly.
  cards[0].encounterCount = 5;
  cards[1].encounterCount = 3;
  cards[2].encounterCount = 3;
  cards[1].questCount = 2;
  cards[2].questCount = 1;

  it('sorts by playabilityScore descending', () => {
    const featured = kioskFeatured(cards, 2);
    expect(featured[0].challengeId).toBe('chal_b');
    expect(featured[1].challengeId).toBe('chal_c');
  });

  it('breaks ties by encounterCount', () => {
    const c = [...cards];
    c[0].playabilityScore = 0.9;
    c[1].playabilityScore = 0.9;
    c[2].playabilityScore = 0.9;
    c[0].encounterCount = 10;
    c[1].encounterCount = 5;
    c[2].encounterCount = 3;
    const featured = kioskFeatured(c, 3);
    expect(featured[0].challengeId).toBe('chal_a');
    expect(featured[1].challengeId).toBe('chal_b');
    expect(featured[2].challengeId).toBe('chal_c');
  });

  it('returns empty for limit < 1', () => {
    expect(kioskFeatured(cards, 0)).toEqual([]);
    expect(kioskFeatured(cards, -1)).toEqual([]);
  });

  it('respects limit', () => {
    const featured = kioskFeatured(cards, 1);
    expect(featured.length).toBe(1);
  });
});
