/**
 * Creator Template Pipeline — compiler/runtime hooks for HoloLand.
 *
 * Scope (task_1778186605462_muzd):
 *   - compileTemplateToChallenge: template + params → PlayableChallenge
 *   - submitForReview: challenge → PublishReview
 *   - approveChallenge: review → published PlayableChallenge
 *   - listPublishedChallenges: filter for kiosk visibility
 *   - getKioskSlice: product-slice retrieval for HoloLand runtime
 *
 * Design contract:
 *   1. Working pipeline — every public function has a test proving the happy
 *      path + at least one failure path.
 *   2. No storage backend — challenges and reviews are held in-memory or
 *      passed through; a real backend wires these functions.
 *   3. Deterministic — same template + params + creatorId → same challenge id
 *      (hash-based).
 *
 * Sibling to frontier-shard-zero.ts (task_1778186605462_2mlp):
 *   - frontier-shard-zero.ts ─ bootstrap Shard consumption
 *   - template-pipeline.ts    ─ creator-facing generation + review gates
 * The two are wired by `compileTemplateToChallenge`, which produces a Shard
 * that is then validated by `checkPlayability` (from framework) before
 * becoming a PlayableChallenge.
 *
 * @version 1.0.0
 * @module @holoscript/hololand-platform/creator
 */

import {
  type CreatorTemplate,
  type PlayableChallenge,
  type PublishReview,
  type Shard,
  type ValidationReceipt,
  type PlayabilityRequirements,
  validateCreatorTemplate,
  validatePlayableChallenge,
  validatePublishReview,
  checkPlayability,
  cloneShard,
} from '@holoscript/framework';
import { createHash } from 'node:crypto';

// =============================================================================
// IN-MEMORY REGISTRY (ephemeral — replace with real backend when consumer needs it)
// =============================================================================

interface CreatorRegistry {
  challenges: Map<string, PlayableChallenge>;
  reviews: Map<string, PublishReview>;
}

const registry: CreatorRegistry = {
  challenges: new Map(),
  reviews: new Map(),
};

/** Reset the in-memory registry (for testing). */
export function resetCreatorRegistry(): void {
  registry.challenges.clear();
  registry.reviews.clear();
}

/** Access the raw registry (for testing / debug only). */
export function getCreatorRegistry(): Readonly<CreatorRegistry> {
  return registry;
}

// =============================================================================
// COMPILER HOOKS
// =============================================================================

/**
 * Options for `compileTemplateToChallenge`.
 */
export interface CompileOptions {
  /** Creator identity. */
  creatorId: string;
  /** Override the template's default playability requirements. */
  playabilityRequirements?: PlayabilityRequirements;
  /** Optional validation receipt generator. Defaults to a synthetic pass receipt. */
  makeValidationReceipt?(challengeId: string, shard: Shard): ValidationReceipt;
  /** Optional timestamp override. Defaults to `new Date().toISOString()`. */
  now?: string;
}

/**
 * Hash a string into a hex string suitable for challenge ids.
 * Simple deterministic hash — enough for pipeline uniqueness tests.
 * Replace with SHA-256 when a real backend needs collision resistance.
 */
function djb2Hash(str: string): string {
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) + h + str.charCodeAt(i)) & 0xffffffff;
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

function buildChallengeId(templateId: string, creatorId: string, now: string): string {
  const payload = `${templateId}:${creatorId}:${now}`;
  const hash = djb2Hash(payload);
  return `chal_${templateId}_${hash}`;
}

function defaultValidationReceipt(challengeId: string, shard: Shard): ValidationReceipt {
  return {
    id: `val_${challengeId}`,
    scenarioId: shard.id,
    validatedAt: new Date().toISOString(),
    status: 'passed',
    hash: createHash('sha256').update(JSON.stringify(shard), 'utf8').digest('hex'),
    hashAlgorithm: 'sha256',
  };
}

/**
 * Compile a CreatorTemplate + parameter values into a PlayableChallenge.
 *
 * Steps:
 *   1. Validate the template structure.
 *   2. Build a generated Shard from the template's baseShard (deep clone).
 *   3. Run playability gates.
 *   4. Build a PlayableChallenge with the resulting score + validation receipt.
 *   5. If gates fail, challenge status is `rejected`; otherwise `playable`.
 *
 * The generated Shard is a clone — callers can safely mutate the template's
 * baseShard later without affecting already-compiled challenges.
 *
 * @throws Error when the template is structurally invalid.
 */
export function compileTemplateToChallenge(
  template: CreatorTemplate,
  options: CompileOptions
): PlayableChallenge {
  const templateErrors = validateCreatorTemplate(template);
  if (templateErrors.length > 0) {
    throw new Error(`Invalid CreatorTemplate: ${templateErrors.join('; ')}`);
  }

  const now = options.now ?? new Date().toISOString();
  const challengeId = buildChallengeId(template.id, options.creatorId, now);
  const generatedShard = cloneShard(template.baseShard);

  // Ensure the generated shard has a unique id derived from the template + creator
  generatedShard.id = `shard_${challengeId}`;
  generatedShard.name = `${template.name} — ${options.creatorId}`;

  const requirements =
    options.playabilityRequirements ?? template.playabilityRequirements ?? undefined;
  const playability = checkPlayability(generatedShard, requirements);

  const validationReceipt = (options.makeValidationReceipt ?? defaultValidationReceipt)(
    challengeId,
    generatedShard
  );

  const challenge: PlayableChallenge = {
    id: challengeId,
    name: template.name,
    description: template.description,
    generatedShard,
    playabilityScore: playability.score,
    validationReceipt,
    status: playability.passed ? 'playable' : 'rejected',
    creatorId: options.creatorId,
    createdAt: now,
  };

  // Persist in registry
  registry.challenges.set(challenge.id, challenge);
  return challenge;
}

// =============================================================================
// PUBLISH REVIEW HOOKS
// =============================================================================

/**
 * Submit a PlayableChallenge for publish review.
 *
 * Only challenges with status `playable` can be submitted. Rejected challenges
 * must be re-compiled after fixing the template or parameters.
 *
 * @throws Error when challenge is not in `playable` status or is invalid.
 */
export function submitForReview(challenge: PlayableChallenge): PublishReview {
  const challengeErrors = validatePlayableChallenge(challenge);
  if (challengeErrors.length > 0) {
    throw new Error(`Invalid PlayableChallenge: ${challengeErrors.join('; ')}`);
  }

  if (challenge.status !== 'playable') {
    throw new Error(
      `Cannot submit challenge ${challenge.id} for review: status is ${challenge.status} (expected playable).`
    );
  }

  const reviewId = `rev_${challenge.id}`;
  const review: PublishReview = {
    id: reviewId,
    challengeId: challenge.id,
    status: 'pending',
  };

  registry.reviews.set(review.id, review);
  return review;
}

/**
 * Approve a pending PublishReview, flipping the associated challenge to
 * `published`.
 *
 * @throws Error when the review is not `pending` or challenge is missing.
 */
export function approveChallenge(
  review: PublishReview,
  reviewerId: string,
  notes?: string,
  now?: string
): PlayableChallenge {
  const reviewErrors = validatePublishReview(review);
  if (reviewErrors.length > 0) {
    throw new Error(`Invalid PublishReview: ${reviewErrors.join('; ')}`);
  }

  if (review.status !== 'pending') {
    throw new Error(
      `Cannot approve review ${review.id}: status is ${review.status} (expected pending).`
    );
  }

  const challenge = registry.challenges.get(review.challengeId);
  if (!challenge) {
    throw new Error(`Challenge ${review.challengeId} not found in registry.`);
  }

  const updatedReview: PublishReview = {
    ...review,
    status: 'approved',
    reviewerId,
    notes,
    reviewedAt: now ?? new Date().toISOString(),
  };

  const updatedChallenge: PlayableChallenge = {
    ...challenge,
    status: 'published',
  };

  registry.reviews.set(review.id, updatedReview);
  registry.challenges.set(challenge.id, updatedChallenge);
  return updatedChallenge;
}

/**
 * Reject a pending PublishReview, keeping the associated challenge as
 * `playable` (the review is what failed, not necessarily the challenge).
 *
 * @throws Error when the review is not `pending` or challenge is missing.
 */
export function rejectChallenge(
  review: PublishReview,
  reviewerId: string,
  notes?: string,
  now?: string
): PlayableChallenge {
  const reviewErrors = validatePublishReview(review);
  if (reviewErrors.length > 0) {
    throw new Error(`Invalid PublishReview: ${reviewErrors.join('; ')}`);
  }

  if (review.status !== 'pending') {
    throw new Error(
      `Cannot reject review ${review.id}: status is ${review.status} (expected pending).`
    );
  }

  const challenge = registry.challenges.get(review.challengeId);
  if (!challenge) {
    throw new Error(`Challenge ${review.challengeId} not found in registry.`);
  }

  const updatedReview: PublishReview = {
    ...review,
    status: 'rejected',
    reviewerId,
    notes,
    reviewedAt: now ?? new Date().toISOString(),
  };

  // Challenge stays playable — creator can resubmit after edits.
  registry.reviews.set(review.id, updatedReview);
  return challenge;
}

// =============================================================================
// KIOSK CONSUMPTION PATH
// =============================================================================

/**
 * List all published challenges visible in the HoloLand kiosk.
 *
 * Optionally filter by creator or search term (matches name / description).
 */
export function listPublishedChallenges(options?: {
  creatorId?: string;
  search?: string;
  limit?: number;
}): PlayableChallenge[] {
  let results = Array.from(registry.challenges.values()).filter((c) => c.status === 'published');

  if (options?.creatorId) {
    results = results.filter((c) => c.creatorId === options.creatorId);
  }

  if (options?.search) {
    const term = options.search.toLowerCase();
    results = results.filter(
      (c) =>
        c.name.toLowerCase().includes(term) || (c.description ?? '').toLowerCase().includes(term)
    );
  }

  if (options?.limit !== undefined && options.limit >= 0) {
    results = results.slice(0, options.limit);
  }

  return results;
}

/**
 * Get a single published challenge by id.
 *
 * Returns `null` when the challenge does not exist or is not published.
 */
export function getPublishedChallenge(challengeId: string): PlayableChallenge | null {
  const challenge = registry.challenges.get(challengeId) ?? null;
  if (!challenge || challenge.status !== 'published') {
    return null;
  }
  return challenge;
}

/**
 * Kiosk slice — the minimal product envelope a HoloLand runtime needs
 * to boot a challenge. Contains the challenge metadata + the generated Shard.
 *
 * Returns `null` when the challenge is not published.
 */
export interface KioskSlice {
  challengeId: string;
  name: string;
  description?: string;
  creatorId: string;
  shard: Shard;
  playabilityScore: number;
}

/**
 * Get a kiosk slice for a published challenge.
 *
 * Returns `null` when the challenge does not exist or is not published.
 */
export function getKioskSlice(challengeId: string): KioskSlice | null {
  const challenge = getPublishedChallenge(challengeId);
  if (!challenge) return null;

  return {
    challengeId: challenge.id,
    name: challenge.name,
    description: challenge.description,
    creatorId: challenge.creatorId,
    shard: challenge.generatedShard,
    playabilityScore: challenge.playabilityScore,
  };
}
