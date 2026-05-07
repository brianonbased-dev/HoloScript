/**
 * EmbeddingTrait — v5.1
 *
 * Generate vector embeddings from text or structured data.
 *
 * Events:
 *  embedding:generate  { input, model, dimensions }
 *  embedding:result    { vector, dimensions, model }
 */

import type { TraitHandler, HSPlusNode, TraitContext, TraitEvent } from './TraitTypes';

export interface EmbeddingConfig {
  default_model: string;
  default_dimensions: number;
}

export const embeddingHandler: TraitHandler<EmbeddingConfig> = {
  name: 'embedding',
  defaultConfig: { default_model: 'text-embedding-3-small', default_dimensions: 1536 },

  onAttach(node: HSPlusNode): void {
    node.__embeddingState = { generated: 0 };
  },
  onDetach(node: HSPlusNode): void {
    delete node.__embeddingState;
  },
  onUpdate(): void {},

  onEvent(
    node: HSPlusNode,
    config: EmbeddingConfig,
    context: TraitContext,
    event: TraitEvent
  ): void {
    const state = node.__embeddingState as { generated: number } | undefined;
    if (!state) return;
    if ((typeof event === 'string' ? event : event.type) === 'embedding:generate') {
      state.generated++;
      const dims = resolveEmbeddingDimensions(event, config);
      const model = (event.model as string) ?? config.default_model;
      const input = event.input ?? event.payload?.input ?? '';
      context.emit?.('embedding:result', {
        vector: createDeterministicEmbedding(input, dims, model),
        dimensions: dims,
        model,
        source: 'local-deterministic-fallback',
        index: state.generated,
      });
    }
  },
};

function resolveEmbeddingDimensions(event: TraitEvent, config: EmbeddingConfig): number {
  const rawDimensions = (event.dimensions ?? event.payload?.dimensions) as unknown;
  const dimensions = typeof rawDimensions === 'number' ? rawDimensions : config.default_dimensions;

  if (!Number.isFinite(dimensions) || dimensions <= 0) {
    return Math.max(1, Math.floor(config.default_dimensions));
  }

  return Math.floor(dimensions);
}

function createDeterministicEmbedding(input: unknown, dimensions: number, model: string): Float32Array {
  const vector = new Float32Array(dimensions);
  const text = stringifyEmbeddingInput(input);
  const features = extractEmbeddingFeatures(text);

  for (let i = 0; i < features.length; i++) {
    const feature = features[i];
    const hash = fnv1a(`${model}\0${feature}\0${i}`);
    const index = hash % dimensions;
    const sign = hash & 1 ? 1 : -1;
    const weight = 1 + Math.log1p(feature.length);
    vector[index] += sign * weight;
  }

  normalizeVector(vector);
  return vector;
}

function stringifyEmbeddingInput(input: unknown): string {
  if (typeof input === 'string') return input;
  if (input === null || input === undefined) return '';

  try {
    return JSON.stringify(input);
  } catch {
    return String(input);
  }
}

function extractEmbeddingFeatures(text: string): string[] {
  const normalized = text.trim().toLowerCase();
  if (!normalized) return ['<empty>'];

  const tokens = normalized.match(/[a-z0-9_:-]+/g) ?? [normalized];
  const features = [...tokens, `len:${normalized.length}`];

  for (const token of tokens) {
    if (token.length <= 3) {
      features.push(`tok:${token}`);
      continue;
    }

    for (let i = 0; i <= token.length - 3; i++) {
      features.push(`tri:${token.slice(i, i + 3)}`);
    }
  }

  return features;
}

function normalizeVector(vector: Float32Array): void {
  let normSquared = 0;
  for (const value of vector) {
    normSquared += value * value;
  }

  if (normSquared === 0) {
    vector[0] = 1;
    return;
  }

  const norm = Math.sqrt(normSquared);
  for (let i = 0; i < vector.length; i++) {
    vector[i] = vector[i] / norm;
  }
}

function fnv1a(value: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }

  return hash >>> 0;
}

export default embeddingHandler;
