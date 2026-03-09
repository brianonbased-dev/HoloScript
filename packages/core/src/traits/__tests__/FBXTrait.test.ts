import { describe, it, expect, beforeEach } from 'vitest';
import { fbxHandler, applyFBXAxisConversion } from '../FBXTrait';
import {
  createMockContext,
  createMockNode,
  attachTrait,
  sendEvent,
  updateTrait,
  getEventCount,
  getLastEvent,
} from './traitTestHelpers';

describe('FBXTrait', () => {
  let node: Record<string, unknown>;
  let ctx: ReturnType<typeof createMockContext>;
  const cfg = {
    source: '', // No source → no async loading on attach
    animation_stack: '',
    embed_textures: true,
    scale_factor: 1.0,
    up_axis: 'y' as const,
    forward_axis: '-z' as const,
    unit_conversion: true,
    unit_scale: 'm' as const,
    skeleton_binding: 'auto' as const,
    import_animations: true,
    import_morphs: true,
    import_materials: true,
    texture_paths: [],
    bake_animations: false,
    remove_namespace: true,
    cast_shadows: true,
    receive_shadows: true,
    auto_play: false,
    loop_animations: true,
    streaming_priority: 'normal' as const,
    collision_shape: 'auto' as const,
  };

  beforeEach(() => {
    node = createMockNode('fbx');
    ctx = createMockContext();
    attachTrait(fbxHandler, node, cfg, ctx);
  });

  it('initializes state on attach', () => {
    const state = (node as any).__fbxState;
    expect(state).toBeDefined();
    expect(state.isLoaded).toBe(false);
    expect(state.isLoading).toBe(false);
    expect(state.meshCount).toBe(0);
  });

  it('does not start loading without source', () => {
    expect((node as any).__fbxState.isLoading).toBe(false);
  });

  it('play_animation event with no loaded data is safe', () => {
    sendEvent(fbxHandler, node, cfg, ctx, { type: 'fbx:play_animation', animation: 'idle' });
    // No crash, playingAnimations still empty
    expect((node as any).__fbxState.playingAnimations.size).toBe(0);
  });

  it('stop_animation event is safe when empty', () => {
    sendEvent(fbxHandler, node, cfg, ctx, { type: 'fbx:stop_animation' });
    expect((node as any).__fbxState.playingAnimations.size).toBe(0);
  });

  it('set_morph event is safe when not loaded', () => {
    sendEvent(fbxHandler, node, cfg, ctx, { type: 'fbx:set_morph', target: 'smile', weight: 0.5 });
    expect((node as any).__fbxState.morphWeights.size).toBe(0);
  });

  it('detach cleans up state', () => {
    fbxHandler.onDetach?.(node as any, cfg as any, ctx as any);
    expect((node as any).__fbxState).toBeUndefined();
  });

  it('update with no loaded data is safe', () => {
    updateTrait(fbxHandler, node, cfg, ctx, 0.016);
    // No crash
  });

  it('applyFBXAxisConversion with y-up returns same', () => {
    const result = applyFBXAxisConversion({ ...cfg, up_axis: 'y' }, [1, 2, 3]);
    expect(result).toEqual([1, 2, 3]);
  });

  it('applyFBXAxisConversion with z-up swaps axes', () => {
    const result = applyFBXAxisConversion({ ...cfg, up_axis: 'z' }, [1, 2, 3]);
    expect(result).toEqual([1, 3, -2]);
  });
});
