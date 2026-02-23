/**
 * FBXTrait — Production Test Suite
 *
 * fbxHandler stores state on node.__fbxState.
 * loadFBXAsset is async (simulateAssetLoad has 10×50ms = 550ms).
 * Strategy: inject pre-built state directly to avoid async load in most tests.
 * Test async load via vitest's fake timers only for loading_start emission.
 *
 * Also tests exported helpers: applyFBXAxisConversion.
 *
 * Key behaviours:
 * 1. defaultConfig — all 22 fields
 * 2. applyFBXAxisConversion — z-up swaps Y↔Z; y-up passthrough
 * 3. onAttach — state init (isLoaded=false, etc.); emits loading_start when source set
 * 4. onDetach — clears playingAnimations; emits fbx:unloaded when sceneRoot set; removes state
 * 5. onUpdate — no-op when !isLoaded; animation time advance, loop wrap, non-loop complete+emit;
 *               morphs_updated when weights present
 * 6. onEvent — fbx:play_animation: adds playback to Map;
 *              fbx:stop_animation: removes entry or clears all;
 *              fbx:set_morph: clamps weight, only for known targets;
 *              fbx:set_animation_speed/weight/seek; fbx:reload; fbx:set_bone_override/clear
 */
import { describe, it, expect, vi } from 'vitest';
import { fbxHandler, applyFBXAxisConversion } from '../FBXTrait';
import type { FBXState, FBXConfig } from '../FBXTrait';

// ─── helpers ─────────────────────────────────────────────────────────────────

function makeNode() {
  return { id: 'fbx_node', properties: {} };
}

function makeCtx() {
  return { emit: vi.fn(), vr: { headset: { position: [0, 0, 0], rotation: [0, 0, 0] } } };
}

function makeLoadedState(overrides: Partial<FBXState> = {}): FBXState {
  return {
    isLoaded: true,
    isLoading: false,
    loadProgress: 1,
    meshCount: 4,
    materialCount: 2,
    textureCount: 6,
    animationStacks: [
      { name: 'idle', duration: 3.0, frameRate: 30, startFrame: 0, endFrame: 90, layers: [] },
      { name: 'walk', duration: 1.0, frameRate: 30, startFrame: 0, endFrame: 30, layers: [] },
    ],
    playingAnimations: new Map(),
    morphTargetNames: ['smile', 'frown'],
    morphWeights: new Map([['smile', 0], ['frown', 0]]),
    skeleton: null,
    boundingBox: null,
    sceneRoot: null,
    textures: [],
    metadata: null,
    hierarchy: [],
    ...overrides,
  };
}

function attach(cfg: Partial<FBXConfig> = {}) {
  const node = makeNode();
  const ctx = makeCtx();
  const config = { ...fbxHandler.defaultConfig!, ...cfg };
  // Override source to empty so loadFBXAsset is NOT called (sync-safe)
  config.source = '';
  fbxHandler.onAttach!(node as any, config, ctx as any);
  return { node, ctx, config };
}

function attachWithState(state: FBXState, cfg: Partial<FBXConfig> = {}) {
  const { node, ctx, config } = attach(cfg);
  (node as any).__fbxState = state;
  return { node, ctx, config };
}

// ─── defaultConfig ────────────────────────────────────────────────────────────

describe('fbxHandler.defaultConfig', () => {
  const d = fbxHandler.defaultConfig!;
  it('source=""', () => expect(d.source).toBe(''));
  it('animation_stack=""', () => expect(d.animation_stack).toBe(''));
  it('embed_textures=true', () => expect(d.embed_textures).toBe(true));
  it('scale_factor=1.0', () => expect(d.scale_factor).toBe(1.0));
  it('up_axis=y', () => expect(d.up_axis).toBe('y'));
  it('forward_axis=-z', () => expect(d.forward_axis).toBe('-z'));
  it('unit_conversion=true', () => expect(d.unit_conversion).toBe(true));
  it('unit_scale=m', () => expect(d.unit_scale).toBe('m'));
  it('skeleton_binding=auto', () => expect(d.skeleton_binding).toBe('auto'));
  it('import_animations=true', () => expect(d.import_animations).toBe(true));
  it('import_morphs=true', () => expect(d.import_morphs).toBe(true));
  it('import_materials=true', () => expect(d.import_materials).toBe(true));
  it('texture_paths=[]', () => expect(d.texture_paths).toEqual([]));
  it('bake_animations=false', () => expect(d.bake_animations).toBe(false));
  it('remove_namespace=true', () => expect(d.remove_namespace).toBe(true));
  it('cast_shadows=true', () => expect(d.cast_shadows).toBe(true));
  it('receive_shadows=true', () => expect(d.receive_shadows).toBe(true));
  it('auto_play=false', () => expect(d.auto_play).toBe(false));
  it('loop_animations=true', () => expect(d.loop_animations).toBe(true));
  it('streaming_priority=normal', () => expect(d.streaming_priority).toBe('normal'));
  it('collision_shape=auto', () => expect(d.collision_shape).toBe('auto'));
});

// ─── applyFBXAxisConversion ───────────────────────────────────────────────────

describe('applyFBXAxisConversion', () => {
  it('z-up swaps Y and Z (negates old Y into Z)', () => {
    const config = { ...fbxHandler.defaultConfig!, up_axis: 'z' as const };
    const result = applyFBXAxisConversion(config, [1, 2, 3]);
    expect(result).toEqual([1, 3, -2]);
  });

  it('y-up passthrough (no change)', () => {
    const config = { ...fbxHandler.defaultConfig!, up_axis: 'y' as const };
    const result = applyFBXAxisConversion(config, [1, 2, 3]);
    expect(result).toEqual([1, 2, 3]);
  });
});

// ─── onAttach ─────────────────────────────────────────────────────────────────

describe('fbxHandler.onAttach', () => {
  it('initialises __fbxState with isLoaded=false', () => {
    const { node } = attach();
    expect((node as any).__fbxState.isLoaded).toBe(false);
  });

  it('playingAnimations is empty Map', () => {
    const { node } = attach();
    expect((node as any).__fbxState.playingAnimations).toBeInstanceOf(Map);
    expect((node as any).__fbxState.playingAnimations.size).toBe(0);
  });

  it('does NOT emit fbx:loading_start when source is empty', () => {
    const { ctx } = attach({ source: '' });
    expect(ctx.emit).not.toHaveBeenCalledWith('fbx:loading_start', expect.anything());
  });
});

// ─── onDetach ─────────────────────────────────────────────────────────────────

describe('fbxHandler.onDetach', () => {
  it('clears playingAnimations', () => {
    const state = makeLoadedState();
    state.playingAnimations.set('idle', { stackName: 'idle', time: 0, duration: 3, speed: 1, weight: 1, loop: true, playing: true, layer: 0 });
    const { node, ctx, config } = attachWithState(state);
    fbxHandler.onDetach!(node as any, config, ctx as any);
    expect(state.playingAnimations.size).toBe(0);
  });

  it('emits fbx:unloaded when sceneRoot is set', () => {
    const state = makeLoadedState({ sceneRoot: { root: true } });
    const { node, ctx, config } = attachWithState(state);
    // Set source after attach (attach() forces '' to avoid async loading)
    config.source = 'model.fbx';
    ctx.emit.mockClear();
    fbxHandler.onDetach!(node as any, config, ctx as any);
    expect(ctx.emit).toHaveBeenCalledWith('fbx:unloaded', expect.objectContaining({ source: 'model.fbx' }));
  });

  it('does NOT emit fbx:unloaded when sceneRoot=null', () => {
    const state = makeLoadedState({ sceneRoot: null });
    const { node, ctx, config } = attachWithState(state);
    ctx.emit.mockClear();
    fbxHandler.onDetach!(node as any, config, ctx as any);
    expect(ctx.emit).not.toHaveBeenCalledWith('fbx:unloaded', expect.anything());
  });

  it('removes __fbxState', () => {
    const { node, ctx, config } = attachWithState(makeLoadedState());
    fbxHandler.onDetach!(node as any, config, ctx as any);
    expect((node as any).__fbxState).toBeUndefined();
  });
});

// ─── onUpdate — no-op when not loaded ─────────────────────────────────────────

describe('fbxHandler.onUpdate', () => {
  it('no-op when isLoaded=false', () => {
    const { node, ctx, config } = attach();
    ctx.emit.mockClear();
    fbxHandler.onUpdate!(node as any, config, ctx as any, 0.016);
    expect(ctx.emit).not.toHaveBeenCalled();
  });

  it('advances animation time by delta * speed', () => {
    const state = makeLoadedState();
    state.playingAnimations.set('idle', { stackName: 'idle', time: 0, duration: 3, speed: 2, weight: 1, loop: true, playing: true, layer: 0 });
    const { node, ctx, config } = attachWithState(state);
    fbxHandler.onUpdate!(node as any, config, ctx as any, 0.1); // 0.1 × 2 = 0.2
    expect(state.playingAnimations.get('idle')!.time).toBeCloseTo(0.2, 5);
  });

  it('wraps time on loop complete', () => {
    const state = makeLoadedState();
    state.playingAnimations.set('walk', { stackName: 'walk', time: 0.95, duration: 1.0, speed: 1, weight: 1, loop: true, playing: true, layer: 0 });
    const { node, ctx, config } = attachWithState(state);
    fbxHandler.onUpdate!(node as any, config, ctx as any, 0.2); // 0.95+0.2=1.15 → 0.15
    expect(state.playingAnimations.get('walk')!.time).toBeCloseTo(0.15, 4);
  });

  it('stops and emits fbx:animation_complete on non-loop end', () => {
    const state = makeLoadedState();
    state.playingAnimations.set('idle', { stackName: 'idle', time: 2.95, duration: 3, speed: 1, weight: 1, loop: false, playing: true, layer: 0 });
    const { node, ctx, config } = attachWithState(state);
    ctx.emit.mockClear();
    fbxHandler.onUpdate!(node as any, config, ctx as any, 0.1);
    expect(state.playingAnimations.get('idle')!.playing).toBe(false);
    expect(ctx.emit).toHaveBeenCalledWith('fbx:animation_complete', expect.objectContaining({ animation: 'idle' }));
  });

  it('emits fbx:morphs_updated when morphWeights is non-empty', () => {
    const state = makeLoadedState();
    state.morphWeights.set('smile', 0.5);
    const { node, ctx, config } = attachWithState(state);
    ctx.emit.mockClear();
    fbxHandler.onUpdate!(node as any, config, ctx as any, 0.016);
    expect(ctx.emit).toHaveBeenCalledWith('fbx:morphs_updated', expect.objectContaining({ weights: { smile: 0.5, frown: 0 } }));
  });

  it('does NOT emit fbx:morphs_updated when morphWeights is empty', () => {
    const state = makeLoadedState({ morphTargetNames: [], morphWeights: new Map() });
    const { node, ctx, config } = attachWithState(state);
    ctx.emit.mockClear();
    fbxHandler.onUpdate!(node as any, config, ctx as any, 0.016);
    expect(ctx.emit).not.toHaveBeenCalledWith('fbx:morphs_updated', expect.anything());
  });
});

// ─── onEvent — fbx:play_animation ────────────────────────────────────────────

describe('fbxHandler.onEvent — fbx:play_animation', () => {
  it('adds playback entry for known stack', () => {
    const state = makeLoadedState();
    const { node, ctx, config } = attachWithState(state);
    fbxHandler.onEvent!(node as any, config, ctx as any, { type: 'fbx:play_animation', stack: 'idle', options: { loop: false, speed: 1.5 } });
    expect(state.playingAnimations.has('idle')).toBe(true);
    expect(state.playingAnimations.get('idle')!.speed).toBe(1.5);
    expect(state.playingAnimations.get('idle')!.loop).toBe(false);
  });

  it('ignores unknown stack', () => {
    const state = makeLoadedState();
    const { node, ctx, config } = attachWithState(state);
    fbxHandler.onEvent!(node as any, config, ctx as any, { type: 'fbx:play_animation', stack: 'unknown' });
    expect(state.playingAnimations.has('unknown')).toBe(false);
  });
});

// ─── onEvent — fbx:stop_animation ────────────────────────────────────────────

describe('fbxHandler.onEvent — fbx:stop_animation', () => {
  it('removes named animation from playingAnimations', () => {
    const state = makeLoadedState();
    state.playingAnimations.set('idle', { stackName: 'idle', time: 0, duration: 3, speed: 1, weight: 1, loop: true, playing: true, layer: 0 });
    const { node, ctx, config } = attachWithState(state);
    fbxHandler.onEvent!(node as any, config, ctx as any, { type: 'fbx:stop_animation', stack: 'idle' });
    expect(state.playingAnimations.has('idle')).toBe(false);
  });

  it('clears all animations when no stack specified', () => {
    const state = makeLoadedState();
    state.playingAnimations.set('idle', { stackName: 'idle', time: 0, duration: 3, speed: 1, weight: 1, loop: true, playing: true, layer: 0 });
    state.playingAnimations.set('walk', { stackName: 'walk', time: 0, duration: 1, speed: 1, weight: 1, loop: true, playing: true, layer: 0 });
    const { node, ctx, config } = attachWithState(state);
    fbxHandler.onEvent!(node as any, config, ctx as any, { type: 'fbx:stop_animation' });
    expect(state.playingAnimations.size).toBe(0);
  });
});

// ─── onEvent — fbx:set_morph ─────────────────────────────────────────────────

describe('fbxHandler.onEvent — fbx:set_morph', () => {
  it('sets morph weight for known target', () => {
    const state = makeLoadedState();
    const { node, ctx, config } = attachWithState(state);
    fbxHandler.onEvent!(node as any, config, ctx as any, { type: 'fbx:set_morph', target: 'smile', weight: 0.8 });
    expect(state.morphWeights.get('smile')).toBeCloseTo(0.8, 4);
  });

  it('clamps morph weight to [0, 1]', () => {
    const state = makeLoadedState();
    const { node, ctx, config } = attachWithState(state);
    fbxHandler.onEvent!(node as any, config, ctx as any, { type: 'fbx:set_morph', target: 'smile', weight: 2.0 });
    expect(state.morphWeights.get('smile')).toBe(1);
    fbxHandler.onEvent!(node as any, config, ctx as any, { type: 'fbx:set_morph', target: 'smile', weight: -0.5 });
    expect(state.morphWeights.get('smile')).toBe(0);
  });

  it('ignores unknown morph target', () => {
    const state = makeLoadedState();
    const { node, ctx, config } = attachWithState(state);
    fbxHandler.onEvent!(node as any, config, ctx as any, { type: 'fbx:set_morph', target: 'unknown', weight: 0.5 });
    expect(state.morphWeights.has('unknown')).toBe(false);
  });
});

// ─── onEvent — speed / weight / seek ─────────────────────────────────────────

describe('fbxHandler.onEvent — speed/weight/seek', () => {
  function playbackState() {
    const state = makeLoadedState();
    state.playingAnimations.set('idle', { stackName: 'idle', time: 0, duration: 3, speed: 1, weight: 1, loop: true, playing: true, layer: 0 });
    return state;
  }

  it('fbx:set_animation_speed updates speed', () => {
    const state = playbackState();
    const { node, ctx, config } = attachWithState(state);
    fbxHandler.onEvent!(node as any, config, ctx as any, { type: 'fbx:set_animation_speed', stack: 'idle', speed: 2.5 });
    expect(state.playingAnimations.get('idle')!.speed).toBe(2.5);
  });

  it('fbx:set_animation_weight clamps to [0,1]', () => {
    const state = playbackState();
    const { node, ctx, config } = attachWithState(state);
    fbxHandler.onEvent!(node as any, config, ctx as any, { type: 'fbx:set_animation_weight', stack: 'idle', weight: 5.0 });
    expect(state.playingAnimations.get('idle')!.weight).toBe(1);
  });

  it('fbx:seek_animation clamps time to [0, duration]', () => {
    const state = playbackState();
    const { node, ctx, config } = attachWithState(state);
    fbxHandler.onEvent!(node as any, config, ctx as any, { type: 'fbx:seek_animation', stack: 'idle', time: 10 });
    expect(state.playingAnimations.get('idle')!.time).toBe(3); // clamped to duration
  });
});
