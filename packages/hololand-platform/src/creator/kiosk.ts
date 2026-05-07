/**
 * HoloLand Creator Kiosk — product-slice presentation layer.
 *
 * Scope (task_1778186605462_muzd):
 *   - KioskCard: UI-ready summary of a published PlayableChallenge
 *   - KioskGrid: paginated grid layout helpers
 *   - kioskSearch: fuzzy search across challenge names + descriptions
 *   - kioskFeatured: promoted / curated challenge selection
 *
 * Design contract:
 *   1. Typed surface — KioskCard, KioskGrid, search/featured helpers.
 *   2. Pure functions — no side effects, no storage. Consumers wire to React/Vue.
 *   3. Tests — valid card/grid + deliberately-broken inputs (G.GOLD.013).
 *   4. No gold-plating — no React components, no CSS, no image assets. Those
 *      land in the Studio package when a UI consumer needs them.
 *
 * @version 1.0.0
 * @module @holoscript/hololand-platform/creator/kiosk
 */

import type { PlayableChallenge, Shard } from '@holoscript/framework';

// ── KioskCard ──

/**
 * UI-ready summary of a published challenge. Drives card renderers in the
 * HoloLand creator kiosk without importing React or any UI framework.
 */
export interface KioskCard {
  challengeId: string;
  name: string;
  description?: string;
  creatorId: string;
  playabilityScore: number;
  /** Shard id for deep-linking into the challenge detail page. */
  shardId: string;
  /** Shard name for display. */
  shardName: string;
  /** Number of encounters (combat density hint). */
  encounterCount: number;
  /** Number of quests (progression depth hint). */
  questCount: number;
  /** Number of items (reward density hint). */
  itemCount: number;
  /** Number of skills (capability gate depth hint). */
  skillCount: number;
  /** Human-readable difficulty label derived from playability score. */
  difficultyLabel: 'Casual' | 'Moderate' | 'Intense' | 'Extreme';
}

function difficultyFromScore(score: number): KioskCard['difficultyLabel'] {
  if (score >= 0.9) return 'Casual';
  if (score >= 0.7) return 'Moderate';
  if (score >= 0.5) return 'Intense';
  return 'Extreme';
}

/**
 * Build a KioskCard from a published PlayableChallenge.
 *
 * @throws Error when the challenge is missing required fields.
 */
export function buildKioskCard(challenge: PlayableChallenge): KioskCard {
  if (!challenge?.generatedShard) {
    throw new Error('Cannot build KioskCard: challenge.generatedShard is required.');
  }
  const shard: Shard = challenge.generatedShard;
  return {
    challengeId: challenge.id,
    name: challenge.name,
    description: challenge.description,
    creatorId: challenge.creatorId,
    playabilityScore: challenge.playabilityScore,
    shardId: shard.id,
    shardName: shard.name,
    encounterCount: shard.encounters?.length ?? 0,
    questCount: shard.quests?.length ?? 0,
    itemCount: shard.items?.length ?? 0,
    skillCount: shard.skills?.length ?? 0,
    difficultyLabel: difficultyFromScore(challenge.playabilityScore),
  };
}

// ── KioskGrid ──

/**
 * Paginated grid state. Pure — consumers re-render when page changes.
 */
export interface KioskGrid {
  cards: KioskCard[];
  page: number;
  pageSize: number;
  total: number;
  hasNext: boolean;
  hasPrev: boolean;
}

/**
 * Slice a flat card list into a paginated KioskGrid.
 */
export function paginateKioskCards(
  cards: KioskCard[],
  page: number,
  pageSize: number,
): KioskGrid {
  if (page < 1) page = 1;
  if (pageSize < 1) pageSize = 1;
  const start = (page - 1) * pageSize;
  const slice = cards.slice(start, start + pageSize);
  return {
    cards: slice,
    page,
    pageSize,
    total: cards.length,
    hasNext: start + pageSize < cards.length,
    hasPrev: page > 1,
  };
}

// ── Search ──

/**
 * Fuzzy search across challenge names + descriptions. Case-insensitive,
 * splits query on whitespace and requires every token to match.
 */
export function kioskSearch(cards: KioskCard[], query: string): KioskCard[] {
  const tokens = query
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 0);
  if (tokens.length === 0) return cards;

  return cards.filter((card) => {
    const haystack = `${card.name} ${card.description ?? ''} ${card.shardName}`.toLowerCase();
    return tokens.every((t) => haystack.includes(t));
  });
}

// ── Featured / Curation ──

/**
 * Select featured challenges — highest playabilityScore first, then
 * most encounters (combat density), then most quests.
 */
export function kioskFeatured(cards: KioskCard[], limit: number): KioskCard[] {
  if (limit < 1) return [];
  const sorted = [...cards].sort((a, b) => {
    if (b.playabilityScore !== a.playabilityScore) {
      return b.playabilityScore - a.playabilityScore;
    }
    if (b.encounterCount !== a.encounterCount) {
      return b.encounterCount - a.encounterCount;
    }
    return b.questCount - a.questCount;
  });
  return sorted.slice(0, limit);
}
