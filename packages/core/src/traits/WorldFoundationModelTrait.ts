/**
 * WorldFoundationModelTrait
 *
 * Provenance companion for multimodal world synthesis. A generated world can
 * carry this trait to declare which foundation model, modalities, reconstruction
 * session, semantic-node count, and collider count produced the scene graph.
 */

import type { TraitContext, TraitEvent, TraitHandler } from './TraitTypes';

export type WorldFoundationInputModality = 'text' | 'image' | 'video';

export interface WorldFoundationModelConfig {
  schema: 'cael.world_foundation_model.v1';
  synthesis_id: string;
  provider: string;
  model: string;
  generated_at: string;
  prompt_hash: string;
  input_modalities: readonly WorldFoundationInputModality[];
  semantic_node_count: number;
  collider_count: number;
  source_asset_urls?: readonly string[];
  video_reconstruction_session_id?: string;
  replay_fingerprint?: string;
  receipt_hash: string;
  emit_cael?: boolean;
}

export interface WorldFoundationModelCAELEvent {
  version: 'cael.v1';
  event: 'world_synthesis';
  timestamp: number;
  simTime: number;
  payload: {
    schema: 'cael.world_foundation_model.v1';
    synthesisId: string;
    provider: string;
    model: string;
    inputModalities: readonly WorldFoundationInputModality[];
    semanticNodeCount: number;
    colliderCount: number;
    promptHash: string;
    receiptHash: string;
    videoReconstructionSessionId?: string;
    replayFingerprint?: string;
    sourceAssetUrls: readonly string[];
  };
}

export interface WorldFoundationModelState {
  config: WorldFoundationModelConfig;
  caelEvents: WorldFoundationModelCAELEvent[];
}

export const WORLD_FOUNDATION_MODEL_TRAIT = 'world_foundation_model';

const ALLOWED_MODALITIES: readonly WorldFoundationInputModality[] = ['text', 'image', 'video'];

export const worldFoundationModelHandler: TraitHandler<WorldFoundationModelConfig> = {
  name: WORLD_FOUNDATION_MODEL_TRAIT,

  defaultConfig: {
    schema: 'cael.world_foundation_model.v1',
    synthesis_id: 'uninitialized',
    provider: 'unknown',
    model: 'unknown',
    generated_at: new Date(0).toISOString(),
    prompt_hash: 'unknown',
    input_modalities: ['text'],
    semantic_node_count: 0,
    collider_count: 0,
    source_asset_urls: [],
    receipt_hash: 'unknown',
    emit_cael: true,
  },

  validate(config: WorldFoundationModelConfig): boolean {
    validateWorldFoundationModelConfig(config);
    return true;
  },

  onAttach(node, config, context) {
    validateWorldFoundationModelConfig(config);
    const state: WorldFoundationModelState = {
      config,
      caelEvents: [],
    };
    node.__worldFoundationModelState = state;

    context.emit?.('world_foundation_model_attached', {
      node,
      synthesisId: config.synthesis_id,
      provider: config.provider,
      inputModalities: config.input_modalities,
      colliderCount: config.collider_count,
    });

    if (config.emit_cael !== false) {
      emitWorldFoundationCAEL(node, config, context, state);
    }
  },

  onDetach(node) {
    delete node.__worldFoundationModelState;
  },

  onEvent(node, config, context, event) {
    if (event.type === 'world_foundation_model_emit_cael') {
      const state = node.__worldFoundationModelState as WorldFoundationModelState | undefined;
      emitWorldFoundationCAEL(node, config, context, state);
    }
  },
};

export function validateWorldFoundationModelConfig(
  config: WorldFoundationModelConfig
): WorldFoundationModelConfig {
  if (config.schema !== 'cael.world_foundation_model.v1') {
    throw new Error('WorldFoundationModelTrait: schema must be cael.world_foundation_model.v1');
  }
  for (const key of ['synthesis_id', 'provider', 'model', 'generated_at', 'prompt_hash', 'receipt_hash'] as const) {
    if (typeof config[key] !== 'string' || config[key].trim() === '') {
      throw new Error(`WorldFoundationModelTrait: ${key} is required`);
    }
  }
  if (!Array.isArray(config.input_modalities) || config.input_modalities.length === 0) {
    throw new Error('WorldFoundationModelTrait: input_modalities must be a non-empty array');
  }
  for (const modality of config.input_modalities) {
    if (!ALLOWED_MODALITIES.includes(modality)) {
      throw new Error(`WorldFoundationModelTrait: unsupported modality ${String(modality)}`);
    }
  }
  if (!Number.isInteger(config.semantic_node_count) || config.semantic_node_count < 0) {
    throw new Error('WorldFoundationModelTrait: semantic_node_count must be a non-negative integer');
  }
  if (!Number.isInteger(config.collider_count) || config.collider_count < 0) {
    throw new Error('WorldFoundationModelTrait: collider_count must be a non-negative integer');
  }
  return config;
}

function emitWorldFoundationCAEL(
  node: unknown,
  config: WorldFoundationModelConfig,
  context: TraitContext,
  state?: WorldFoundationModelState
): void {
  const event: WorldFoundationModelCAELEvent = {
    version: 'cael.v1',
    event: 'world_synthesis',
    timestamp: Date.parse(config.generated_at) || 0,
    simTime: 0,
    payload: {
      schema: config.schema,
      synthesisId: config.synthesis_id,
      provider: config.provider,
      model: config.model,
      inputModalities: config.input_modalities,
      semanticNodeCount: config.semantic_node_count,
      colliderCount: config.collider_count,
      promptHash: config.prompt_hash,
      receiptHash: config.receipt_hash,
      sourceAssetUrls: config.source_asset_urls ?? [],
      ...(config.video_reconstruction_session_id
        ? { videoReconstructionSessionId: config.video_reconstruction_session_id }
        : {}),
      ...(config.replay_fingerprint ? { replayFingerprint: config.replay_fingerprint } : {}),
    },
  };
  state?.caelEvents.push(event);
  context.emit?.('world_foundation_model_cael_event', {
    node,
    event,
  });
}

export default worldFoundationModelHandler;
