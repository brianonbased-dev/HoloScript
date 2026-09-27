/**
 * Honest HoloEmbed lane receipt.
 *
 * Shared GraphRAG vectors are structural features plus hashed character
 * trigrams. They are not a downloaded neural model. Xenova/MiniLM, Ollama
 * nomic, and OpenAI remain opt-in experiments outside this default lane.
 */

import { HOLOEMBED_DIM } from './types.js';

export const HOLOEMBED_LANE_SCHEMA = 'holoscript.holoembed.lane.v1' as const;
export const HOLOEMBED_ALGORITHM_ID = 'structural+char-trigram' as const;
export const HOLOEMBED_FORBIDDEN_DEFAULT_PROVIDERS = ['xenova', 'ollama', 'openai'] as const;

export type HoloEmbedForbiddenDefaultProvider =
  (typeof HOLOEMBED_FORBIDDEN_DEFAULT_PROVIDERS)[number];

export interface HoloEmbedLaneReceipt {
  schemaVersion: typeof HOLOEMBED_LANE_SCHEMA;
  kind: 'HoloEmbedLane';
  provider: 'holoembed';
  algorithm: typeof HOLOEMBED_ALGORITHM_ID;
  dim: typeof HOLOEMBED_DIM;
  neuralModel: false;
  weights: 'none';
  sentence: string;
  forbiddenDefaultProviders: readonly HoloEmbedForbiddenDefaultProvider[];
}

export function describeHoloEmbedLane(): HoloEmbedLaneReceipt {
  return {
    schemaVersion: HOLOEMBED_LANE_SCHEMA,
    kind: 'HoloEmbedLane',
    provider: 'holoembed',
    algorithm: HOLOEMBED_ALGORITHM_ID,
    dim: HOLOEMBED_DIM,
    neuralModel: false,
    weights: 'none',
    sentence:
      'HoloEmbed default vectors are structural features plus hashed character trigrams. They are not a downloaded neural model.',
    forbiddenDefaultProviders: HOLOEMBED_FORBIDDEN_DEFAULT_PROVIDERS,
  };
}
