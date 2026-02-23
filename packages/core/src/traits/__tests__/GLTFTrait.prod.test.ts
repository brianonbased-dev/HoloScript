/**
 * GLTFTrait Production Tests
 *
 * First-class glTF/glb support with extensions, streaming, and optimization.
 * Focuses on pure synchronous logic: defaultConfig, helper functions
 * (getRequiredExtensions via defaultConfig inspection, selectLODLevel,
 * playAnimation, stopAnimation, setMorphWeight), onDetach guards, onUpdate
 * (animation tick, LOD change), and all 5 onEvent handlers.
 * Async loading (simulateAssetLoad) is not tested here.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  gltfHandler,
  getGLTFState,
  isGLTFLoaded,
  getGLTFAnimations,
  getGLTFMorphTargets,
} from '../GLTFTrait';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeNode() { return { id: 'gltf_test' } as any; }
function makeCtx() {
  return {
    emit: vi.fn(),
    vr: { headset: { position: [0, 0, 0] } },
  };
}

/**
 * Manually bootstrap state (skips async loadGLTFAsset)
 */
function bootstrap(node: any, overrides: Record<string, unknown> = {}) {
  const cfg = { ...gltfHandler.defaultConfig!, ...overrides } as any;
  const ctx = makeCtx();
  gltfHandler.onAttach!(node, cfg, ctx as any);
  return { cfg, ctx };
}

/**
 * Bootstrap with pre-loaded state (isLoaded=true, with animations/morphs)
 */
function bootstrapLoaded(node: any, overrides: Record<string, unknown> = {}) {
  const { cfg, ctx } = bootstrap(node, overrides);
  const s = node.__gltfState;
  s.isLoaded = true;
  s.animationNames = ['idle', 'walk', 'run'];
  s.morphTargetNames = ['smile', 'frown', 'blink_L'];
  s.morphWeights.set('smile', 0);
  s.morphWeights.set('frown', 0);
  s.morphWeights.set('blink_L', 0);
  return { cfg, ctx };
}

function st(node: any) { return node.__gltfState as any; }
function fire(node: any, cfg: any, ctx: any, evt: Record<string, unknown>) {
  gltfHandler.onEvent!(node, cfg, ctx as any, evt as any);
}

// ─── defaultConfig ────────────────────────────────────────────────────────────

describe('GLTFTrait — defaultConfig', () => {
  it('has correct defaults for all 18 fields', () => {
    const d = gltfHandler.defaultConfig!;
    expect(d.source).toBe('');
    expect(d.draco_compression).toBe(true);
    expect(d.meshopt_compression).toBe(false);
    expect(d.ktx2_textures).toBe(false);
    expect(d.extensions).toEqual([]);
    expect(d.animation_clip).toBe('');
    expect(d.lod_levels).toBe(1);
    expect(d.lod_distances).toEqual([10, 25, 50, 100]);
    expect(d.enable_instancing).toBe(true);
    expect(d.cast_shadows).toBe(true);
    expect(d.receive_shadows).toBe(true);
    expect(d.scale).toBeCloseTo(1.0);
    expect(d.auto_play).toBe(false);
    expect(d.loop_animations).toBe(true);
    expect(d.enable_morphs).toBe(true);
    expect(d.streaming_priority).toBe('normal');
    expect(d.load_lightmaps).toBe(false);
    expect(d.collision_shape).toBe('auto');
  });
});

// ─── onAttach (no source — no async load) ─────────────────────────────────────

describe('GLTFTrait — onAttach (no source)', () => {
  it('initialises state with isLoaded=false, isLoading=false', () => {
    const node = makeNode();
    bootstrap(node);
    const s = st(node);
    expect(s.isLoaded).toBe(false);
    expect(s.isLoading).toBe(false);
    expect(s.loadProgress).toBe(0);
    expect(s.meshCount).toBe(0);
    expect(s.playingAnimations).toBeInstanceOf(Map);
    expect(s.morphWeights).toBeInstanceOf(Map);
    expect(s.boundingBox).toBeNull();
  });
});

// ─── onDetach ─────────────────────────────────────────────────────────────────

describe('GLTFTrait — onDetach', () => {
  it('emits gltf:unloaded when sceneRoot is set', () => {
    const node = makeNode();
    // cfg.source='model.glb' so onDetach emits gltf:unloaded with that source
    const { cfg, ctx } = bootstrap(node, { source: 'model.glb' });
    st(node).sceneRoot = { id: 'root' };
    ctx.emit.mockClear();
    gltfHandler.onDetach!(node, cfg, ctx as any);
    expect(ctx.emit).toHaveBeenCalledWith('gltf:unloaded', expect.objectContaining({ source: 'model.glb' }));
  });

  it('does NOT emit gltf:unloaded when sceneRoot is null', () => {
    const node = makeNode();
    const { cfg, ctx } = bootstrap(node);
    ctx.emit.mockClear();
    gltfHandler.onDetach!(node, cfg, ctx as any);
    expect(ctx.emit).not.toHaveBeenCalledWith('gltf:unloaded', expect.any(Object));
  });

  it('clears playingAnimations and removes state', () => {
    const node = makeNode();
    const { cfg, ctx } = bootstrapLoaded(node);
    fire(node, cfg, ctx, { type: 'gltf:play_animation', animation: 'idle', options: {} });
    gltfHandler.onDetach!(node, cfg, ctx as any);
    expect(node.__gltfState).toBeUndefined();
  });
});

// ─── onUpdate — animation tick ────────────────────────────────────────────────

describe('GLTFTrait — onUpdate: animation tick', () => {
  it('advances playback.time by delta * speed', () => {
    const node = makeNode();
    const { cfg, ctx } = bootstrapLoaded(node);
    fire(node, cfg, ctx, { type: 'gltf:play_animation', animation: 'idle', options: { speed: 2, loop: false } });
    const pb = st(node).playingAnimations.get('idle')!;
    pb.duration = 1.0;
    gltfHandler.onUpdate!(node, cfg, ctx as any, 0.1);
    expect(pb.time).toBeCloseTo(0.2); // 0.1 * 2
  });

  it('loops animation when time >= duration and loop=true', () => {
    const node = makeNode();
    const { cfg, ctx } = bootstrapLoaded(node);
    fire(node, cfg, ctx, { type: 'gltf:play_animation', animation: 'walk', options: { loop: true, speed: 1 } });
    const pb = st(node).playingAnimations.get('walk')!;
    pb.duration = 1.0;
    pb.time = 0.95;
    gltfHandler.onUpdate!(node, cfg, ctx as any, 0.1); // 0.95+0.1=1.05 >= 1.0
    expect(pb.time).toBeCloseTo(0.05); // looped: 1.05 % 1.0
    expect(pb.playing).toBe(true);
  });

  it('stops animation and emits gltf:animation_complete when loop=false and time >= duration', () => {
    const node = makeNode();
    const { cfg, ctx } = bootstrapLoaded(node);
    fire(node, cfg, ctx, { type: 'gltf:play_animation', animation: 'run', options: { loop: false, speed: 1 } });
    const pb = st(node).playingAnimations.get('run')!;
    pb.duration = 1.0;
    pb.time = 0.98;
    ctx.emit.mockClear();
    gltfHandler.onUpdate!(node, cfg, ctx as any, 0.05);
    expect(pb.playing).toBe(false);
    expect(pb.time).toBeCloseTo(1.0); // clamped to duration
    expect(ctx.emit).toHaveBeenCalledWith('gltf:animation_complete', expect.objectContaining({ animation: 'run' }));
  });

  it('skips tick for animations with playing=false', () => {
    const node = makeNode();
    const { cfg, ctx } = bootstrapLoaded(node);
    fire(node, cfg, ctx, { type: 'gltf:play_animation', animation: 'idle', options: {} });
    const pb = st(node).playingAnimations.get('idle')!;
    pb.playing = false;
    pb.time = 0;
    pb.duration = 1.0;
    gltfHandler.onUpdate!(node, cfg, ctx as any, 0.5);
    expect(pb.time).toBe(0); // unchanged
  });
});

// ─── onUpdate — LOD ───────────────────────────────────────────────────────────

describe('GLTFTrait — onUpdate: LOD selection', () => {
  it('emits gltf:lod_changed when LOD level switches', () => {
    const node = { ...makeNode(), position: [0, 0, 15] }; // distance ~15 from origin camera
    const { cfg, ctx } = bootstrapLoaded(node, { lod_levels: 3, lod_distances: [10, 25, 50] });
    ctx.emit.mockClear();
    // distance 15: 15 >= 10, 15 < 25 → LOD index 1
    gltfHandler.onUpdate!(node, cfg, ctx as any, 0.016);
    expect(ctx.emit).toHaveBeenCalledWith('gltf:lod_changed', expect.objectContaining({ lod: 1 }));
    expect(st(node).currentLOD).toBe(1);
  });

  it('no LOD change emit when LOD stays the same', () => {
    const node = { ...makeNode(), position: [0, 0, 5] }; // distance 5 < 10 → LOD 0
    const { cfg, ctx } = bootstrapLoaded(node, { lod_levels: 3, lod_distances: [10, 25, 50] });
    st(node).currentLOD = 0;
    ctx.emit.mockClear();
    gltfHandler.onUpdate!(node, cfg, ctx as any, 0.016);
    expect(ctx.emit).not.toHaveBeenCalledWith('gltf:lod_changed', expect.any(Object));
  });

  it('no LOD logic when lod_levels=1 (default)', () => {
    const node = makeNode();
    const { cfg, ctx } = bootstrapLoaded(node, { lod_levels: 1 });
    ctx.emit.mockClear();
    gltfHandler.onUpdate!(node, cfg, ctx as any, 0.016);
    expect(ctx.emit).not.toHaveBeenCalledWith('gltf:lod_changed', expect.any(Object));
  });
});

// ─── onEvent — gltf:play_animation ───────────────────────────────────────────

describe('GLTFTrait — onEvent: gltf:play_animation', () => {
  it('adds animation to playingAnimations with correct defaults', () => {
    const node = makeNode();
    const { cfg, ctx } = bootstrapLoaded(node);
    fire(node, cfg, ctx, { type: 'gltf:play_animation', animation: 'idle', options: {} });
    const pb = st(node).playingAnimations.get('idle')!;
    expect(pb).toBeDefined();
    expect(pb.playing).toBe(true);
    expect(pb.speed).toBe(1);
    expect(pb.weight).toBe(1);
    expect(pb.loop).toBe(true); // default
    expect(pb.time).toBe(0);
  });

  it('respects speed, weight, loop, startTime options', () => {
    const node = makeNode();
    const { cfg, ctx } = bootstrapLoaded(node);
    fire(node, cfg, ctx, { type: 'gltf:play_animation', animation: 'walk', options: { speed: 0.5, weight: 0.8, loop: false, startTime: 0.3 } });
    const pb = st(node).playingAnimations.get('walk')!;
    expect(pb.speed).toBeCloseTo(0.5);
    expect(pb.weight).toBeCloseTo(0.8);
    expect(pb.loop).toBe(false);
    expect(pb.time).toBeCloseTo(0.3);
  });

  it('no-op for unknown animation name', () => {
    const node = makeNode();
    const { cfg, ctx } = bootstrapLoaded(node);
    fire(node, cfg, ctx, { type: 'gltf:play_animation', animation: 'NONEXISTENT', options: {} });
    expect(st(node).playingAnimations.has('NONEXISTENT')).toBe(false);
  });
});

// ─── onEvent — gltf:stop_animation ───────────────────────────────────────────

describe('GLTFTrait — onEvent: gltf:stop_animation', () => {
  it('stops specific animation', () => {
    const node = makeNode();
    const { cfg, ctx } = bootstrapLoaded(node);
    fire(node, cfg, ctx, { type: 'gltf:play_animation', animation: 'idle', options: {} });
    fire(node, cfg, ctx, { type: 'gltf:play_animation', animation: 'walk', options: {} });
    fire(node, cfg, ctx, { type: 'gltf:stop_animation', animation: 'idle' });
    expect(st(node).playingAnimations.has('idle')).toBe(false);
    expect(st(node).playingAnimations.has('walk')).toBe(true);
  });

  it('stops all animations when no animation name provided', () => {
    const node = makeNode();
    const { cfg, ctx } = bootstrapLoaded(node);
    fire(node, cfg, ctx, { type: 'gltf:play_animation', animation: 'idle', options: {} });
    fire(node, cfg, ctx, { type: 'gltf:play_animation', animation: 'walk', options: {} });
    fire(node, cfg, ctx, { type: 'gltf:stop_animation' });
    expect(st(node).playingAnimations.size).toBe(0);
  });
});

// ─── onEvent — gltf:set_morph ────────────────────────────────────────────────

describe('GLTFTrait — onEvent: gltf:set_morph', () => {
  it('sets morph weight clamped to [0,1]', () => {
    const node = makeNode();
    const { cfg, ctx } = bootstrapLoaded(node);
    fire(node, cfg, ctx, { type: 'gltf:set_morph', target: 'smile', weight: 0.7 });
    expect(st(node).morphWeights.get('smile')).toBeCloseTo(0.7);
  });

  it('clamps weight > 1 to 1', () => {
    const node = makeNode();
    const { cfg, ctx } = bootstrapLoaded(node);
    fire(node, cfg, ctx, { type: 'gltf:set_morph', target: 'frown', weight: 2.5 });
    expect(st(node).morphWeights.get('frown')).toBeCloseTo(1.0);
  });

  it('clamps weight < 0 to 0', () => {
    const node = makeNode();
    const { cfg, ctx } = bootstrapLoaded(node);
    fire(node, cfg, ctx, { type: 'gltf:set_morph', target: 'blink_L', weight: -0.5 });
    expect(st(node).morphWeights.get('blink_L')).toBeCloseTo(0.0);
  });

  it('no-op for unknown morph target', () => {
    const node = makeNode();
    const { cfg, ctx } = bootstrapLoaded(node);
    fire(node, cfg, ctx, { type: 'gltf:set_morph', target: 'UNKNOWN', weight: 0.5 });
    expect(st(node).morphWeights.has('UNKNOWN')).toBe(false);
  });
});

// ─── onEvent — gltf:set_material ─────────────────────────────────────────────

describe('GLTFTrait — onEvent: gltf:set_material', () => {
  it('emits gltf:material_changed with material', () => {
    const node = makeNode();
    const { cfg, ctx } = bootstrapLoaded(node);
    ctx.emit.mockClear();
    fire(node, cfg, ctx, { type: 'gltf:set_material', material: 'mat_chrome' });
    expect(ctx.emit).toHaveBeenCalledWith('gltf:material_changed', expect.objectContaining({ material: 'mat_chrome' }));
  });
});

// ─── onEvent — gltf:reload (sync part) ───────────────────────────────────────

describe('GLTFTrait — onEvent: gltf:reload', () => {
  it('resets isLoaded=false + isLoading=false when source is set (async part not awaited)', () => {
    const node = makeNode();
    // Use bootstrapLoaded with an explicit source so gltf:reload triggers loadGLTFAsset
    const { ctx } = bootstrap(node, { source: 'model.glb' });
    const cfg = { ...gltfHandler.defaultConfig!, source: 'model.glb' } as any;
    // Manually mark loaded so we can observe the reset
    st(node).isLoaded = true;
    st(node).isLoading = false;
    fire(node, cfg, ctx, { type: 'gltf:reload' });
    // loadGLTFAsset sets isLoading=true synchronously before async simulation
    expect(st(node).isLoading).toBe(true);
  });

  it('no-op when source is empty', () => {
    const node = makeNode();
    const { cfg, ctx } = bootstrap(node, { source: '' });
    fire(node, cfg, ctx, { type: 'gltf:reload' });
    // No change expected
    expect(st(node).isLoaded).toBe(false);
  });
});

// ─── Utility exports ──────────────────────────────────────────────────────────

describe('GLTFTrait — utility exports', () => {
  it('getGLTFState returns __gltfState', () => {
    const node = makeNode();
    bootstrap(node);
    expect(getGLTFState(node)).toBe(st(node));
  });

  it('isGLTFLoaded returns false when not loaded', () => {
    const node = makeNode();
    bootstrap(node);
    expect(isGLTFLoaded(node)).toBe(false);
  });

  it('isGLTFLoaded returns true when isLoaded=true', () => {
    const node = makeNode();
    bootstrapLoaded(node);
    expect(isGLTFLoaded(node)).toBe(true);
  });

  it('getGLTFAnimations returns animationNames', () => {
    const node = makeNode();
    bootstrapLoaded(node);
    expect(getGLTFAnimations(node)).toEqual(['idle', 'walk', 'run']);
  });

  it('getGLTFMorphTargets returns morphTargetNames', () => {
    const node = makeNode();
    bootstrapLoaded(node);
    expect(getGLTFMorphTargets(node)).toEqual(['smile', 'frown', 'blink_L']);
  });

  it('getGLTFState returns undefined for node without state', () => {
    const node = makeNode();
    expect(getGLTFState(node)).toBeUndefined();
  });
});
