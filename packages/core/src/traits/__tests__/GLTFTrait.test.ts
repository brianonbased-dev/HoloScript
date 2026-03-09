import { describe, it, expect, beforeEach } from 'vitest';
import {
  gltfHandler,
  getGLTFState,
  isGLTFLoaded,
  getGLTFAnimations,
  getGLTFMorphTargets,
} from '../GLTFTrait';
import {
  createMockContext,
  createMockNode,
  attachTrait,
  sendEvent,
  updateTrait,
  getEventCount,
} from './traitTestHelpers';

describe('GLTFTrait', () => {
  let node: Record<string, unknown>;
  let ctx: ReturnType<typeof createMockContext>;
  const cfg = {
    source: '', // No source → no async loading
    draco_compression: true,
    meshopt_compression: false,
    ktx2_textures: false,
    extensions: [] as any[],
    animation_clip: '',
    lod_levels: 1,
    lod_distances: [10, 25, 50, 100],
    enable_instancing: true,
    cast_shadows: true,
    receive_shadows: true,
    scale: 1.0,
    auto_play: false,
    loop_animations: true,
    enable_morphs: true,
    streaming_priority: 'normal' as const,
    load_lightmaps: false,
    collision_shape: 'auto' as const,
  };

  beforeEach(() => {
    node = createMockNode('gltf');
    ctx = createMockContext();
    attachTrait(gltfHandler, node, cfg, ctx);
  });

  it('initializes state on attach', () => {
    const state = getGLTFState(node as any);
    expect(state).toBeDefined();
    expect(state!.isLoaded).toBe(false);
    expect(state!.isLoading).toBe(false);
  });

  it('isGLTFLoaded returns false when not loaded', () => {
    expect(isGLTFLoaded(node as any)).toBe(false);
  });

  it('getGLTFAnimations returns empty when not loaded', () => {
    expect(getGLTFAnimations(node as any)).toEqual([]);
  });

  it('getGLTFMorphTargets returns empty when not loaded', () => {
    expect(getGLTFMorphTargets(node as any)).toEqual([]);
  });

  it('play_animation is safe when not loaded', () => {
    sendEvent(gltfHandler, node, cfg, ctx, { type: 'gltf:play_animation', animation: 'idle' });
    expect((node as any).__gltfState.playingAnimations.size).toBe(0);
  });

  it('stop_animation is safe when empty', () => {
    sendEvent(gltfHandler, node, cfg, ctx, { type: 'gltf:stop_animation' });
    expect((node as any).__gltfState.playingAnimations.size).toBe(0);
  });

  it('set_morph is safe when not loaded', () => {
    sendEvent(gltfHandler, node, cfg, ctx, {
      type: 'gltf:set_morph',
      target: 'smile',
      weight: 0.5,
    });
    expect((node as any).__gltfState.morphWeights.size).toBe(0);
  });

  it('set_material emits event', () => {
    sendEvent(gltfHandler, node, cfg, ctx, { type: 'gltf:set_material', material: 'chrome' });
    expect(getEventCount(ctx, 'gltf:material_changed')).toBe(1);
  });

  it('detach cleans up state', () => {
    gltfHandler.onDetach?.(node as any, cfg as any, ctx as any);
    expect((node as any).__gltfState).toBeUndefined();
  });

  it('update with no loaded data is safe', () => {
    updateTrait(gltfHandler, node, cfg, ctx, 0.016);
    // No crash
  });
});
