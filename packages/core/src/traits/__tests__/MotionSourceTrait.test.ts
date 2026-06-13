import { describe, it, expect, beforeEach } from 'vitest';
import { motionSourceHandler } from '../MotionSourceTrait';
import type { MotionSourceConfig } from '../MotionSourceTrait';
import {
  createMockContext,
  createMockNode,
  attachTrait,
  sendEvent,
  updateTrait,
  getEventCount,
  getLastEvent,
} from './traitTestHelpers';
import { VR_TRAITS } from '../constants';
import { vrTraitRegistry } from '../VRTraitSystem';
import { parse } from '../../parser/HoloScriptPlusParser';

// A recording stand-in for the AnimationTrait instance stored at
// node.__animation_instance. Returns truthy from playback methods so the
// handler can report `applied: true`.
function makeDriver() {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  return {
    calls,
    addClip(c: unknown) {
      calls.push({ method: 'addClip', args: [c] });
    },
    addState(s: unknown) {
      calls.push({ method: 'addState', args: [s] });
    },
    crossfade(state: string, dur?: number) {
      calls.push({ method: 'crossfade', args: [state, dur] });
      return true;
    },
    play(clip: string) {
      calls.push({ method: 'play', args: [clip] });
      return true;
    },
    setState(s: string) {
      calls.push({ method: 'setState', args: [s] });
      return true;
    },
    setFloat(name: string, value: number) {
      calls.push({ method: 'setFloat', args: [name, value] });
    },
    stop() {
      calls.push({ method: 'stop', args: [] });
    },
    getCurrentClip() {
      return undefined;
    },
    getCurrentState() {
      return undefined;
    },
  };
}

const libConfig: MotionSourceConfig = {
  kind: 'library',
  library: 'mixamo',
  default_motion: 'idle',
  blend: 0.25,
  catalog: {
    idle: { asset: 'idle.fbx', loop: true },
    wave: { asset: 'wave.fbx', loop: false, duration: 1.2 },
    walk: { asset: 'walk.fbx', loop: true },
  },
  retarget: { skeleton: 'mixamo', scale: 1.0 },
};

function callsOf(driver: ReturnType<typeof makeDriver>, method: string) {
  return driver.calls.filter((c) => c.method === method);
}

describe('MotionSourceTrait', () => {
  // ── Registration & parser acceptance ────────────────────────────────────────

  it('is registered in the VR trait registry', () => {
    expect(vrTraitRegistry.has('motion_source')).toBe(true);
    expect(vrTraitRegistry.getHandler('motion_source')?.name).toBe('motion_source');
  });

  it('is in VR_TRAITS so the parser accepts @motion_source', () => {
    expect((VR_TRAITS as readonly string[]).includes('motion_source')).toBe(true);
  });

  it('parses an @motion_source block without throwing', () => {
    const src = `object "AgentBody" {
  @motion_source { kind: "library", default_motion: "idle" }
}`;
    expect(() => parse(src, { enableVRTraits: true })).not.toThrow();
    const result = parse(src, { enableVRTraits: true });
    expect(result).toBeDefined();
  });

  // ── Attach & catalog registration ───────────────────────────────────────────

  describe('attach (library kind, with AnimationTrait)', () => {
    let node: Record<string, unknown>;
    let ctx: ReturnType<typeof createMockContext>;
    let driver: ReturnType<typeof makeDriver>;

    beforeEach(() => {
      node = createMockNode('agent');
      driver = makeDriver();
      node.__animation_instance = driver;
      ctx = createMockContext();
      attachTrait(motionSourceHandler, node, libConfig, ctx);
    });

    function state() {
      return node.__motionSourceState as Record<string, unknown>;
    }

    it('initializes motion state on attach', () => {
      expect(state().kind).toBe('library');
      expect(state().currentMotion).toBe('idle');
      expect(state().catalogKeys).toEqual(['idle', 'wave', 'walk']);
      expect(state().registered).toBe(true);
    });

    it('registers each catalog entry as a clip and a state in the AnimationTrait', () => {
      expect(callsOf(driver, 'addClip')).toHaveLength(3);
      expect(callsOf(driver, 'addState')).toHaveLength(3);
    });

    it('maps loop flag to wrapMode and carries duration', () => {
      const wave = callsOf(driver, 'addClip').find(
        (c) => (c.args[0] as { name: string }).name === 'wave'
      );
      const idle = callsOf(driver, 'addClip').find(
        (c) => (c.args[0] as { name: string }).name === 'idle'
      );
      expect((wave!.args[0] as { wrapMode: string }).wrapMode).toBe('once');
      expect((wave!.args[0] as { duration: number }).duration).toBe(1.2);
      expect((idle!.args[0] as { wrapMode: string }).wrapMode).toBe('loop');
    });

    it('auto-plays the default motion via crossfade', () => {
      const cf = callsOf(driver, 'crossfade');
      expect(cf).toHaveLength(1);
      expect(cf[0].args[0]).toBe('idle');
      expect(cf[0].args[1]).toBe(0.25);
      expect(state().applied).toBe(true);
    });

    it('emits on_motion_source_ready with the catalog motions', () => {
      expect(getEventCount(ctx, 'on_motion_source_ready')).toBe(1);
      const data = getLastEvent(ctx, 'on_motion_source_ready') as { motions: string[] };
      expect(data.motions).toEqual(['idle', 'wave', 'walk']);
    });

    it('emits on_motion_changed for the default motion', () => {
      const data = getLastEvent(ctx, 'on_motion_changed') as { motion: string; applied: boolean };
      expect(data.motion).toBe('idle');
      expect(data.applied).toBe(true);
    });
  });

  // ── motion_request routing ──────────────────────────────────────────────────

  describe('motion_request', () => {
    let node: Record<string, unknown>;
    let ctx: ReturnType<typeof createMockContext>;
    let driver: ReturnType<typeof makeDriver>;

    beforeEach(() => {
      node = createMockNode('agent');
      driver = makeDriver();
      node.__animation_instance = driver;
      ctx = createMockContext();
      attachTrait(motionSourceHandler, node, libConfig, ctx);
    });

    it('crossfades to the requested intent and updates currentMotion', () => {
      sendEvent(motionSourceHandler, node, libConfig, ctx, { type: 'motion_request', intent: 'wave' });
      const cf = callsOf(driver, 'crossfade');
      expect(cf[cf.length - 1].args[0]).toBe('wave');
      expect((node.__motionSourceState as { currentMotion: string }).currentMotion).toBe('wave');
      const data = getLastEvent(ctx, 'on_motion_changed') as { motion: string; applied: boolean };
      expect(data.motion).toBe('wave');
      expect(data.applied).toBe(true);
    });

    it('accepts clip/motion aliases for the intent payload', () => {
      sendEvent(motionSourceHandler, node, libConfig, ctx, { type: 'motion_request', clip: 'walk' });
      expect((node.__motionSourceState as { currentMotion: string }).currentMotion).toBe('walk');
    });

    it('mirrors the active motion onto AvatarEmbodiment state', () => {
      node.__avatarEmbodimentState = { currentAnimation: 'idle' };
      sendEvent(motionSourceHandler, node, libConfig, ctx, { type: 'motion_request', intent: 'wave' });
      expect((node.__avatarEmbodimentState as { currentAnimation: string }).currentAnimation).toBe(
        'wave'
      );
    });

    it('falls back to play() when the driver has no crossfade', () => {
      const node2 = createMockNode('agent2');
      const driver2 = makeDriver() as Record<string, unknown>;
      delete driver2.crossfade;
      node2.__animation_instance = driver2;
      const ctx2 = createMockContext();
      attachTrait(motionSourceHandler, node2, libConfig, ctx2);
      const playCalls = (driver2.calls as Array<{ method: string; args: unknown[] }>).filter(
        (c) => c.method === 'play'
      );
      expect(playCalls.length).toBeGreaterThanOrEqual(1);
      expect((node2.__motionSourceState as { applied: boolean }).applied).toBe(true);
    });
  });

  // ── Procedural gait selection ───────────────────────────────────────────────

  describe('procedural gait', () => {
    const procConfig: MotionSourceConfig = {
      kind: 'procedural',
      frequency: 60,
      default_motion: 'idle',
      blend: 0.2,
      catalog: {
        idle: { asset: 'idle.fbx', loop: true },
        walk: { asset: 'walk.fbx', loop: true },
        run: { asset: 'run.fbx', loop: true },
      },
      procedural: {
        speed_param: 'speed',
        thresholds: { walk: 0.1, run: 3.0 },
        clips: { idle: 'idle', walk: 'walk', run: 'run' },
      },
    };

    let node: Record<string, unknown>;
    let ctx: ReturnType<typeof createMockContext>;
    let driver: ReturnType<typeof makeDriver>;

    beforeEach(() => {
      node = createMockNode('runner');
      driver = makeDriver();
      node.__animation_instance = driver;
      ctx = createMockContext();
      attachTrait(motionSourceHandler, node, procConfig, ctx);
      driver.calls.length = 0; // ignore the attach-time default play
    });

    it('selects walk gait when speed crosses the walk threshold', () => {
      sendEvent(motionSourceHandler, node, procConfig, ctx, { type: 'motion_speed', speed: 1.5 });
      updateTrait(motionSourceHandler, node, procConfig, ctx, 1.0);
      const cf = callsOf(driver, 'crossfade');
      expect(cf[cf.length - 1].args[0]).toBe('walk');
      expect((node.__motionSourceState as { currentMotion: string }).currentMotion).toBe('walk');
      const sf = callsOf(driver, 'setFloat');
      expect(sf[sf.length - 1].args).toEqual(['speed', 1.5]);
    });

    it('selects run gait at high speed', () => {
      sendEvent(motionSourceHandler, node, procConfig, ctx, { type: 'motion_speed', speed: 5 });
      updateTrait(motionSourceHandler, node, procConfig, ctx, 1.0);
      const cf = callsOf(driver, 'crossfade');
      expect(cf[cf.length - 1].args[0]).toBe('run');
    });

    it('returns to idle when speed drops to zero', () => {
      sendEvent(motionSourceHandler, node, procConfig, ctx, { type: 'motion_speed', speed: 5 });
      updateTrait(motionSourceHandler, node, procConfig, ctx, 1.0); // -> run
      sendEvent(motionSourceHandler, node, procConfig, ctx, { type: 'motion_speed', speed: 0 });
      updateTrait(motionSourceHandler, node, procConfig, ctx, 1.0); // -> idle
      expect((node.__motionSourceState as { currentMotion: string }).currentMotion).toBe('idle');
    });

    it('throttles re-evaluation to the configured frequency', () => {
      const slow: MotionSourceConfig = { ...procConfig, frequency: 1 }; // interval = 1s
      const n = createMockNode('slow');
      const d = makeDriver();
      n.__animation_instance = d;
      const c = createMockContext();
      attachTrait(motionSourceHandler, n, slow, c);
      d.calls.length = 0;
      sendEvent(motionSourceHandler, n, slow, c, { type: 'motion_speed', speed: 2 });
      updateTrait(motionSourceHandler, n, slow, c, 0.1); // below interval -> no re-eval
      expect(d.calls.filter((x) => x.method === 'crossfade')).toHaveLength(0);
      updateTrait(motionSourceHandler, n, slow, c, 1.0); // crosses interval -> re-eval
      expect(d.calls.filter((x) => x.method === 'crossfade').length).toBeGreaterThanOrEqual(1);
    });

    it('does not run gait selection for non-procedural kinds', () => {
      const n = createMockNode('lib');
      const d = makeDriver();
      n.__animation_instance = d;
      const c = createMockContext();
      attachTrait(motionSourceHandler, n, libConfig, c);
      d.calls.length = 0;
      sendEvent(motionSourceHandler, n, libConfig, c, { type: 'motion_speed', speed: 5 });
      updateTrait(motionSourceHandler, n, libConfig, c, 1.0);
      expect(d.calls.filter((x) => x.method === 'crossfade')).toHaveLength(0);
    });
  });

  // ── motion_stop ─────────────────────────────────────────────────────────────

  it('motion_stop stops the driver and emits on_motion_stopped', () => {
    const node = createMockNode('agent');
    const driver = makeDriver();
    node.__animation_instance = driver;
    const ctx = createMockContext();
    attachTrait(motionSourceHandler, node, libConfig, ctx);
    sendEvent(motionSourceHandler, node, libConfig, ctx, { type: 'motion_stop' });
    expect(callsOf(driver, 'stop')).toHaveLength(1);
    expect(getEventCount(ctx, 'on_motion_stopped')).toBe(1);
  });

  // ── Graceful degradation (no AnimationTrait present) ─────────────────────────

  it('works without an AnimationTrait — tracks motion and reports applied=false', () => {
    const node = createMockNode('headless');
    const ctx = createMockContext();
    attachTrait(motionSourceHandler, node, libConfig, ctx);
    expect((node.__motionSourceState as { currentMotion: string }).currentMotion).toBe('idle');
    const ready = getLastEvent(ctx, 'on_motion_changed') as { applied: boolean };
    expect(ready.applied).toBe(false);

    sendEvent(motionSourceHandler, node, libConfig, ctx, { type: 'motion_request', intent: 'wave' });
    expect((node.__motionSourceState as { currentMotion: string }).currentMotion).toBe('wave');
    const after = getLastEvent(ctx, 'on_motion_changed') as { motion: string; applied: boolean };
    expect(after.motion).toBe('wave');
    expect(after.applied).toBe(false);
  });

  // ── Detach ──────────────────────────────────────────────────────────────────

  it('onDetach clears the motion state', () => {
    const node = createMockNode('agent');
    node.__animation_instance = makeDriver();
    const ctx = createMockContext();
    attachTrait(motionSourceHandler, node, libConfig, ctx);
    expect(node.__motionSourceState).toBeDefined();
    motionSourceHandler.onDetach?.(node as never, libConfig as never, ctx as never);
    expect(node.__motionSourceState).toBeUndefined();
  });
});
