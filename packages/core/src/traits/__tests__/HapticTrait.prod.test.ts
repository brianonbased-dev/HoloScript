/**
 * HapticTrait — Production Test Suite
 */
import { describe, it, expect, vi } from 'vitest';
import { hapticHandler } from '../HapticTrait';

function makeNode(props: any = {}) {
  return { id: 'h_node', properties: props };
}
function makeCtx(opts: any = {}) {
  return {
    emit: vi.fn(),
    haptics: { pulse: vi.fn() },
    vr: { getDominantHand: vi.fn().mockReturnValue(null) },
    getScaleMultiplier: vi.fn().mockReturnValue(1),
    ...opts,
  };
}
function attach(cfg: any = {}) {
  const node = makeNode();
  const ctx = makeCtx();
  const config = { ...hapticHandler.defaultConfig!, ...cfg };
  hapticHandler.onAttach!(node, config, ctx);
  return { node: node as any, ctx, config };
}

// ─── defaultConfig ─────────────────────────────────────────────────────────────

describe('hapticHandler.defaultConfig', () => {
  const d = hapticHandler.defaultConfig!;
  it('intensity=0.5', () => expect(d.intensity).toBe(0.5));
  it('proximity_enabled=false', () => expect(d.proximity_enabled).toBe(false));
  it('proximity_distance=0.5', () => expect(d.proximity_distance).toBe(0.5));
  it('collision_pattern=soft', () => expect(d.collision_pattern).toBe('soft'));
  it('hands=dominant', () => expect(d.hands).toBe('dominant'));
  it('duration=100', () => expect(d.duration).toBe(100));
});

// ─── onAttach ─────────────────────────────────────────────────────────────────

describe('hapticHandler.onAttach', () => {
  it('creates __hapticState', () => expect(attach().node.__hapticState).toBeDefined());
  it('isPlaying=false', () => expect(attach().node.__hapticState.isPlaying).toBe(false));
  it('currentPattern=null', () => expect(attach().node.__hapticState.currentPattern).toBeNull());
  it('patternIndex=0', () => expect(attach().node.__hapticState.patternIndex).toBe(0));
  it('patternTimer=0', () => expect(attach().node.__hapticState.patternTimer).toBe(0));
  it('proximityIntensity=0', () => expect(attach().node.__hapticState.proximityIntensity).toBe(0));
});

// ─── onDetach ─────────────────────────────────────────────────────────────────

describe('hapticHandler.onDetach', () => {
  it('removes __hapticState', () => {
    const { node, config, ctx } = attach();
    hapticHandler.onDetach!(node, config, ctx);
    expect(node.__hapticState).toBeUndefined();
  });
});

// ─── onEvent — collision ──────────────────────────────────────────────────────

describe('hapticHandler.onEvent — collision', () => {
  it('plays built-in soft pattern on collision: isPlaying=true', () => {
    const { node, config, ctx } = attach({ collision_pattern: 'soft', hands: 'both' });
    hapticHandler.onEvent!(node, config, ctx, { type: 'collision' });
    expect(node.__hapticState.isPlaying).toBe(true);
  });
  it('collision emits first step pulse for both hands', () => {
    const { node, config, ctx } = attach({
      collision_pattern: 'soft',
      hands: 'both',
      intensity: 1.0,
    });
    hapticHandler.onEvent!(node, config, ctx, { type: 'collision' });
    // soft pattern step[0] = [0.2, 50], intensity=1 → clamp(0.2*1)=0.2
    expect(ctx.haptics.pulse).toHaveBeenCalledWith(
      'left',
      expect.closeTo(0.2, 5),
      expect.any(Number)
    );
    expect(ctx.haptics.pulse).toHaveBeenCalledWith(
      'right',
      expect.closeTo(0.2, 5),
      expect.any(Number)
    );
  });
  it('plays hard pattern on hard collision', () => {
    const { node, config, ctx } = attach({
      collision_pattern: 'hard',
      hands: 'both',
      intensity: 1.0,
    });
    hapticHandler.onEvent!(node, config, ctx, { type: 'collision' });
    // hard step[0] = [0.8, 30]
    expect(ctx.haptics.pulse).toHaveBeenCalledWith(
      'left',
      expect.closeTo(0.8, 5),
      expect.any(Number)
    );
  });
  it('plays metal pattern on metal collision', () => {
    const { node, config, ctx } = attach({
      collision_pattern: 'metal',
      hands: 'both',
      intensity: 1.0,
    });
    hapticHandler.onEvent!(node, config, ctx, { type: 'collision' });
    // metal step[0] = [1.0, 10]
    expect(ctx.haptics.pulse).toHaveBeenCalledWith('left', 1.0, expect.any(Number));
  });
  it('plays glass pattern', () => {
    const { node, config, ctx } = attach({
      collision_pattern: 'glass',
      hands: 'both',
      intensity: 1.0,
    });
    hapticHandler.onEvent!(node, config, ctx, { type: 'collision' });
    // glass step[0] = [0.5, 20]
    expect(ctx.haptics.pulse).toHaveBeenCalledWith(
      'left',
      expect.closeTo(0.5, 5),
      expect.any(Number)
    );
  });
  it('custom pattern plays custom sequence', () => {
    const customPat = { name: 'test', sequence: [[0.9, 100]] as [number, number][], loop: false };
    const { node, config, ctx } = attach({
      collision_pattern: 'custom',
      custom_pattern: customPat,
      hands: 'left',
      intensity: 1.0,
    });
    hapticHandler.onEvent!(node, config, ctx, { type: 'collision' });
    expect(ctx.haptics.pulse).toHaveBeenCalledWith('left', 0.9, expect.any(Number));
  });
  it('right-hand only collision', () => {
    const { node, config, ctx } = attach({
      collision_pattern: 'soft',
      hands: 'right',
      intensity: 1.0,
    });
    hapticHandler.onEvent!(node, config, ctx, { type: 'collision' });
    expect(ctx.haptics.pulse).toHaveBeenCalledWith('right', expect.any(Number), expect.any(Number));
    expect(ctx.haptics.pulse).not.toHaveBeenCalledWith(
      'left',
      expect.any(Number),
      expect.any(Number)
    );
  });
  it('dominant-hand collision uses getDominantHand', () => {
    const ctx = makeCtx({
      vr: { getDominantHand: vi.fn().mockReturnValue({ id: 'left', position: [0, 0, 0] }) },
    });
    const node = makeNode();
    const config = {
      ...hapticHandler.defaultConfig!,
      collision_pattern: 'soft' as const,
      hands: 'dominant' as const,
      intensity: 1.0,
    };
    hapticHandler.onAttach!(node, config, ctx);
    hapticHandler.onEvent!(node as any, config, ctx, { type: 'collision' });
    expect(ctx.haptics.pulse).toHaveBeenCalledWith('left', expect.any(Number), expect.any(Number));
  });
  it('intensity is multiplied into pulse', () => {
    const ctx = makeCtx();
    const node = makeNode();
    const config = {
      ...hapticHandler.defaultConfig!,
      collision_pattern: 'soft' as const,
      hands: 'both' as const,
      intensity: 0.5,
    };
    hapticHandler.onAttach!(node, config, ctx);
    hapticHandler.onEvent!(node as any, config, ctx, { type: 'collision' });
    // soft step[0] [0.2, 50] * 0.5 = 0.1
    expect(ctx.haptics.pulse).toHaveBeenCalledWith(
      'left',
      expect.closeTo(0.1, 5),
      expect.any(Number)
    );
  });
});

// ─── onEvent — grab_start ─────────────────────────────────────────────────────

describe('hapticHandler.onEvent — grab_start', () => {
  it('pulses at 70% intensity for both hands', () => {
    const { node, config, ctx } = attach({ hands: 'both', intensity: 1.0 });
    hapticHandler.onEvent!(node, config, ctx, { type: 'grab_start' });
    expect(ctx.haptics.pulse).toHaveBeenCalledWith('left', expect.closeTo(0.7, 5), 50);
    expect(ctx.haptics.pulse).toHaveBeenCalledWith('right', expect.closeTo(0.7, 5), 50);
  });
  it('respects intensity scaling on grab', () => {
    const { node, config, ctx } = attach({ hands: 'both', intensity: 0.4 });
    hapticHandler.onEvent!(node, config, ctx, { type: 'grab_start' });
    expect(ctx.haptics.pulse).toHaveBeenCalledWith('left', expect.closeTo(0.28, 2), 50);
  });
});

// ─── onEvent — play_pattern ────────────────────────────────────────────────────

describe('hapticHandler.onEvent — play_pattern', () => {
  it('plays named built-in pattern by event.pattern', () => {
    const { node, config, ctx } = attach({ hands: 'both', intensity: 1.0 });
    hapticHandler.onEvent!(node, config, ctx, { type: 'play_pattern', pattern: 'heartbeat' });
    expect(node.__hapticState.isPlaying).toBe(true);
    expect(node.__hapticState.currentPattern!.name).toBe('heartbeat');
  });
  it('falls back to collision_pattern if no event.pattern', () => {
    const { node, config, ctx } = attach({
      collision_pattern: 'metal' as const,
      hands: 'both',
      intensity: 1.0,
    });
    hapticHandler.onEvent!(node, config, ctx, { type: 'play_pattern' });
    expect(node.__hapticState.currentPattern!.name).toBe('metal');
  });
  it('plays rumble looping pattern', () => {
    const { node, config, ctx } = attach({ hands: 'both', intensity: 1.0 });
    hapticHandler.onEvent!(node, config, ctx, { type: 'play_pattern', pattern: 'rumble' });
    expect(node.__hapticState.currentPattern!.loop).toBe(true);
  });
});

// ─── onEvent — stop_pattern ────────────────────────────────────────────────────

describe('hapticHandler.onEvent — stop_pattern', () => {
  it('sets isPlaying=false and currentPattern=null', () => {
    const { node, config, ctx } = attach({ hands: 'both', intensity: 1.0 });
    hapticHandler.onEvent!(node, config, ctx, { type: 'play_pattern', pattern: 'rumble' });
    ctx.haptics.pulse.mockClear();
    hapticHandler.onEvent!(node, config, ctx, { type: 'stop_pattern' });
    expect(node.__hapticState.isPlaying).toBe(false);
    expect(node.__hapticState.currentPattern).toBeNull();
  });
});

// ─── onUpdate — pattern stepping ──────────────────────────────────────────────

describe('hapticHandler.onUpdate — pattern stepping', () => {
  it('accumulates patternTimer by delta*1000', () => {
    const { node, config, ctx } = attach({ hands: 'both', intensity: 1.0 });
    hapticHandler.onEvent!(node, config, ctx, { type: 'play_pattern', pattern: 'soft' });
    ctx.haptics.pulse.mockClear();
    // soft step[0] duration=50ms. delta=0.02 → timer=20, not enough to advance
    hapticHandler.onUpdate!(node, config, ctx, 0.02);
    expect(node.__hapticState.patternTimer).toBeCloseTo(20, 5);
    expect(ctx.haptics.pulse).not.toHaveBeenCalled(); // no step advance yet
  });
  it('advances to next step when timer >= step duration', () => {
    const { node, config, ctx } = attach({ hands: 'both', intensity: 1.0 });
    hapticHandler.onEvent!(node, config, ctx, { type: 'play_pattern', pattern: 'soft' });
    ctx.haptics.pulse.mockClear();
    // soft step[0]=[0.2,50]. delta=0.06 → timer=60 >= 50
    hapticHandler.onUpdate!(node, config, ctx, 0.06);
    expect(node.__hapticState.patternIndex).toBe(1);
    expect(node.__hapticState.patternTimer).toBeCloseTo(0, 5);
    // step[1]=[0.1,50] → pulse at 0.1*1.0=0.1
    expect(ctx.haptics.pulse).toHaveBeenCalledWith(
      'left',
      expect.closeTo(0.1, 5),
      expect.any(Number)
    );
  });
  it('stops pattern after last non-looping step', () => {
    const { node, config, ctx } = attach({ hands: 'both', intensity: 1.0 });
    hapticHandler.onEvent!(node, config, ctx, { type: 'play_pattern', pattern: 'soft' });
    // soft has 2 steps of 50ms each. step through both
    hapticHandler.onUpdate!(node, config, ctx, 0.06); // advance to step 1
    hapticHandler.onUpdate!(node, config, ctx, 0.06); // advance past step 1 → done
    expect(node.__hapticState.isPlaying).toBe(false);
    expect(node.__hapticState.currentPattern).toBeNull();
  });
  it('loops pattern when loop=true', () => {
    const { node, config, ctx } = attach({ hands: 'both', intensity: 1.0 });
    hapticHandler.onEvent!(node, config, ctx, { type: 'play_pattern', pattern: 'rumble' }); // loop=true, 2 steps 50ms
    hapticHandler.onUpdate!(node, config, ctx, 0.06); // advance to step 1
    hapticHandler.onUpdate!(node, config, ctx, 0.06); // advance past step 1 → loops to 0
    expect(node.__hapticState.isPlaying).toBe(true);
    expect(node.__hapticState.patternIndex).toBe(0);
  });
  it('no-op when no state', () => {
    const node = makeNode();
    const ctx = makeCtx();
    const config = { ...hapticHandler.defaultConfig! };
    // don't attach — state is missing
    expect(() => hapticHandler.onUpdate!(node as any, config, ctx, 0.016)).not.toThrow();
    expect(ctx.haptics.pulse).not.toHaveBeenCalled();
  });
});

// ─── onUpdate — proximity ─────────────────────────────────────────────────────

describe('hapticHandler.onUpdate — proximity', () => {
  it('updates proximityIntensity based on hand distance', () => {
    const dominantHand = { id: 'right', position: [0.1, 0, 0] };
    const ctx = makeCtx({ vr: { getDominantHand: vi.fn().mockReturnValue(dominantHand) } });
    const node = makeNode({ position: [0, 0, 0] });
    const config = {
      ...hapticHandler.defaultConfig!,
      proximity_enabled: true,
      proximity_distance: 1.0,
      intensity: 1.0,
      hands: 'both' as const,
    };
    hapticHandler.onAttach!(node as any, config, ctx);
    ctx.haptics.pulse.mockClear();
    hapticHandler.onUpdate!(node as any, config, ctx, 0.016);
    // distance=0.1, maxDist=1.0, normalized=0.9, intensity=0.9, rumble=0.9*0.3=0.27
    expect(node.__hapticState.proximityIntensity).toBeCloseTo(0.9, 5);
    expect(ctx.haptics.pulse).toHaveBeenCalled();
  });
  it('sets proximityIntensity=0 when out of range', () => {
    const dominantHand = { id: 'right', position: [5, 0, 0] }; // far away
    const ctx = makeCtx({ vr: { getDominantHand: vi.fn().mockReturnValue(dominantHand) } });
    const node = makeNode({ position: [0, 0, 0] });
    const config = {
      ...hapticHandler.defaultConfig!,
      proximity_enabled: true,
      proximity_distance: 1.0,
      intensity: 1.0,
      hands: 'both' as const,
    };
    hapticHandler.onAttach!(node as any, config, ctx);
    ctx.haptics.pulse.mockClear();
    hapticHandler.onUpdate!(node as any, config, ctx, 0.016);
    expect(node.__hapticState.proximityIntensity).toBe(0);
    expect(ctx.haptics.pulse).not.toHaveBeenCalled();
  });
  it('skips proximity when proximity_enabled=false', () => {
    const ctx = makeCtx({
      vr: { getDominantHand: vi.fn().mockReturnValue({ id: 'left', position: [0, 0, 0] }) },
    });
    const node = makeNode({ position: [0, 0, 0] });
    const config = {
      ...hapticHandler.defaultConfig!,
      proximity_enabled: false,
      hands: 'both' as const,
    };
    hapticHandler.onAttach!(node as any, config, ctx);
    ctx.haptics.pulse.mockClear();
    hapticHandler.onUpdate!(node as any, config, ctx, 0.016);
    expect(ctx.haptics.pulse).not.toHaveBeenCalled();
  });
});
