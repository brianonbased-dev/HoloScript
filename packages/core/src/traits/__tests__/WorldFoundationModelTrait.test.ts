import { describe, expect, it, vi } from 'vitest';
import {
  validateWorldFoundationModelConfig,
  worldFoundationModelHandler,
  type WorldFoundationModelConfig,
} from '../WorldFoundationModelTrait';

const baseConfig: WorldFoundationModelConfig = {
  schema: 'cael.world_foundation_model.v1',
  synthesis_id: 'wfm_test',
  provider: 'sovereign-3d',
  model: 'sovereign-3d-world-foundation',
  generated_at: '2026-06-21T00:00:00Z',
  prompt_hash: 'abc123',
  input_modalities: ['text', 'image', 'video'],
  semantic_node_count: 4,
  collider_count: 5,
  source_asset_urls: ['file:///scan.mp4'],
  video_reconstruction_session_id: 'sess-1',
  replay_fingerprint: 'fp-1',
  receipt_hash: 'receipt-1',
};

const makeNode = () => ({
  id: 'node-1',
  name: 'WorldFoundationProvenance',
  traits: new Set<string>(),
  __worldFoundationModelState: undefined as unknown,
});

const makeCtx = () => ({
  emit: vi.fn(),
});

describe('WorldFoundationModelTrait', () => {
  it('has the world_foundation_model trait name', () => {
    expect(worldFoundationModelHandler.name).toBe('world_foundation_model');
  });

  it('validates a multimodal CAEL provenance config', () => {
    expect(validateWorldFoundationModelConfig(baseConfig)).toBe(baseConfig);
  });

  it('rejects an empty modality list', () => {
    expect(() =>
      validateWorldFoundationModelConfig({ ...baseConfig, input_modalities: [] })
    ).toThrow('input_modalities');
  });

  it('attaches state and emits a CAEL-compatible receipt event', () => {
    const node = makeNode();
    const ctx = makeCtx();

    worldFoundationModelHandler.onAttach!(node as never, baseConfig, ctx as never);

    const state = node.__worldFoundationModelState as { caelEvents: unknown[] };
    expect(state.caelEvents).toHaveLength(1);
    expect(ctx.emit).toHaveBeenCalledWith(
      'world_foundation_model_cael_event',
      expect.objectContaining({
        event: expect.objectContaining({
          version: 'cael.v1',
          event: 'world_synthesis',
          payload: expect.objectContaining({
            synthesisId: 'wfm_test',
            inputModalities: ['text', 'image', 'video'],
            colliderCount: 5,
            replayFingerprint: 'fp-1',
          }),
        }),
      })
    );
  });
});
