import { describe, it, expect, beforeEach } from 'vitest';
import { hrtfHandler } from '../HRTFTrait';
import {
  createMockContext,
  createMockNode,
  attachTrait,
  sendEvent,
  updateTrait,
  getEventCount,
  getLastEvent,
} from './traitTestHelpers';

describe('HRTFTrait', () => {
  let node: Record<string, unknown>;
  let ctx: ReturnType<typeof createMockContext>;
  const cfg = {
    profile: 'generic',
    database: 'cipic' as const,
    custom_sofa_url: '',
    interpolation: 'bilinear' as const,
    crossfade_time: 50,
    head_radius: 0.0875,
    enable_near_field: true,
    itd_model: 'spherical' as const,
  };

  beforeEach(() => {
    node = createMockNode('hrtf');
    ctx = createMockContext();
    attachTrait(hrtfHandler, node, cfg, ctx);
  });

  it('emits hrtf_load_database and hrtf_configure on attach', () => {
    expect(getEventCount(ctx, 'hrtf_load_database')).toBe(1);
    expect(getEventCount(ctx, 'hrtf_configure')).toBe(1);
    expect((node as any).__hrtfState.isActive).toBe(true);
  });

  it('custom sofa url triggers hrtf_load_custom', () => {
    const n = createMockNode('hrtf2');
    const c = createMockContext();
    attachTrait(hrtfHandler, n, { ...cfg, custom_sofa_url: 'https://example.com/custom.sofa' }, c);
    expect(getEventCount(c, 'hrtf_load_custom')).toBe(1);
    expect(getEventCount(c, 'hrtf_load_database')).toBe(0);
  });

  it('hrtf_database_loaded sets ready', () => {
    sendEvent(hrtfHandler, node, cfg, ctx, { type: 'hrtf_database_loaded', subjectId: 42 });
    expect((node as any).__hrtfState.databaseLoaded).toBe(true);
    expect((node as any).__hrtfState.subjectId).toBe(42);
    expect(getEventCount(ctx, 'hrtf_ready')).toBe(1);
  });

  it('listener_update updates position', () => {
    const pos = [1, 2, 3 ];
    const ori = { forward: [0, 0, -1 ], up: [0, 1, 0 ] };
    sendEvent(hrtfHandler, node, cfg, ctx, {
      type: 'listener_update',
      position: pos,
      orientation: ori,
    });
    expect((node as any).__hrtfState.listenerPosition).toEqual(pos);
    expect(getEventCount(ctx, 'hrtf_listener_update')).toBe(1);
  });

  it('hrtf_set_head_radius updates and reconfigures', () => {
    sendEvent(hrtfHandler, node, cfg, ctx, { type: 'hrtf_set_head_radius', radius: 0.1 });
    expect((node as any).__hrtfState.headRadius).toBe(0.1);
    // hrtf_configure emitted once on attach + once on head radius change
    expect(getEventCount(ctx, 'hrtf_configure')).toBe(2);
  });

  it('hrtf_enable and hrtf_disable toggle active', () => {
    sendEvent(hrtfHandler, node, cfg, ctx, { type: 'hrtf_disable' });
    expect((node as any).__hrtfState.isActive).toBe(false);
    sendEvent(hrtfHandler, node, cfg, ctx, { type: 'hrtf_enable' });
    expect((node as any).__hrtfState.isActive).toBe(true);
  });

  it('profile change on update emits hrtf_change_profile', () => {
    const newCfg = { ...cfg, profile: 'personalized' };
    updateTrait(hrtfHandler, node, newCfg, ctx, 0.016);
    expect(getEventCount(ctx, 'hrtf_change_profile')).toBe(1);
    expect((node as any).__hrtfState.currentProfile).toBe('personalized');
  });

  it('detach emits hrtf_disable and cleans up', () => {
    hrtfHandler.onDetach?.(node as any, cfg as any, ctx as any);
    expect((node as any).__hrtfState).toBeUndefined();
    expect(getEventCount(ctx, 'hrtf_disable')).toBe(1);
  });

  // ---- WIRE: Pattern B closure 2026-04-27 ------------------------------
  // onUpdate was a 5-LOC stub that only handled profile changes. Now wires
  // listener-pose polling + full config-change detection. Tests below pin
  // the new behavior so future agents can't accidentally regress to stub.

  describe('onUpdate config-change detection (Pattern B WIRE)', () => {
    it('head_radius change triggers hrtf_configure re-emit', () => {
      const before = getEventCount(ctx, 'hrtf_configure');
      updateTrait(hrtfHandler, node, { ...cfg, head_radius: 0.1 }, ctx, 0.016);
      expect(getEventCount(ctx, 'hrtf_configure')).toBe(before + 1);
      expect((node as any).__hrtfState.headRadius).toBe(0.1);
    });

    it('interpolation change triggers hrtf_configure re-emit', () => {
      const before = getEventCount(ctx, 'hrtf_configure');
      updateTrait(hrtfHandler, node, { ...cfg, interpolation: 'sphere' }, ctx, 0.016);
      expect(getEventCount(ctx, 'hrtf_configure')).toBe(before + 1);
    });

    it('crossfade_time change triggers hrtf_configure re-emit', () => {
      const before = getEventCount(ctx, 'hrtf_configure');
      updateTrait(hrtfHandler, node, { ...cfg, crossfade_time: 100 }, ctx, 0.016);
      expect(getEventCount(ctx, 'hrtf_configure')).toBe(before + 1);
    });

    it('itd_model change triggers hrtf_configure re-emit', () => {
      const before = getEventCount(ctx, 'hrtf_configure');
      updateTrait(hrtfHandler, node, { ...cfg, itd_model: 'measured' }, ctx, 0.016);
      expect(getEventCount(ctx, 'hrtf_configure')).toBe(before + 1);
    });

    it('multiple parameters changing in one frame collapse to a single configure', () => {
      const before = getEventCount(ctx, 'hrtf_configure');
      updateTrait(
        hrtfHandler,
        node,
        { ...cfg, head_radius: 0.1, interpolation: 'sphere', crossfade_time: 100 },
        ctx,
        0.016
      );
      expect(getEventCount(ctx, 'hrtf_configure')).toBe(before + 1);
    });

    it('idle frames (no config change) do NOT re-emit configure', () => {
      const before = getEventCount(ctx, 'hrtf_configure');
      updateTrait(hrtfHandler, node, cfg, ctx, 0.016);
      updateTrait(hrtfHandler, node, cfg, ctx, 0.016);
      updateTrait(hrtfHandler, node, cfg, ctx, 0.016);
      expect(getEventCount(ctx, 'hrtf_configure')).toBe(before);
    });

    it('database swap triggers hrtf_load_database', () => {
      const before = getEventCount(ctx, 'hrtf_load_database');
      updateTrait(hrtfHandler, node, { ...cfg, database: 'listen' }, ctx, 0.016);
      expect(getEventCount(ctx, 'hrtf_load_database')).toBe(before + 1);
      expect((node as any).__hrtfState.databaseLoaded).toBe(false);
    });

    it('switching to a custom SOFA URL triggers hrtf_load_custom', () => {
      const before = getEventCount(ctx, 'hrtf_load_custom');
      updateTrait(
        hrtfHandler,
        node,
        { ...cfg, custom_sofa_url: 'https://example.com/x.sofa' },
        ctx,
        0.016
      );
      expect(getEventCount(ctx, 'hrtf_load_custom')).toBe(before + 1);
    });

    it('inactive trait skips all onUpdate work', () => {
      sendEvent(hrtfHandler, node, cfg, ctx, { type: 'hrtf_disable' });
      const before = getEventCount(ctx, 'hrtf_configure');
      updateTrait(hrtfHandler, node, { ...cfg, head_radius: 0.1 }, ctx, 0.016);
      expect(getEventCount(ctx, 'hrtf_configure')).toBe(before);
    });
  });

  describe('onUpdate listener-pose polling (Pattern B WIRE)', () => {
    function ctxWithVR(position: [number, number, number], rotation?: [number, number, number]) {
      const c = createMockContext();
      (c as { vr?: unknown }).vr = {
        headset: {
          position,
          rotation: rotation ?? [0, 0, 0],
        },
      };
      return c;
    }

    it('headset position drift past threshold triggers hrtf_listener_update', () => {
      const c = ctxWithVR([0, 0, 0]);
      const n = createMockNode('hrtf-vr');
      attachTrait(hrtfHandler, n, cfg, c);
      const before = getEventCount(c, 'hrtf_listener_update');
      // Significant move (10 cm) — should fire.
      (c as { vr: { headset: { position: number[] } } }).vr.headset.position = [0.1, 0, 0];
      updateTrait(hrtfHandler, n, cfg, c, 0.016);
      expect(getEventCount(c, 'hrtf_listener_update')).toBe(before + 1);
    });

    it('sub-threshold position jitter does NOT fire hrtf_listener_update', () => {
      const c = ctxWithVR([0, 0, 0]);
      const n = createMockNode('hrtf-vr2');
      attachTrait(hrtfHandler, n, cfg, c);
      // First update establishes baseline.
      updateTrait(hrtfHandler, n, cfg, c, 0.016);
      const before = getEventCount(c, 'hrtf_listener_update');
      // Sub-cm jitter (5e-4 m → 2.5e-7 m² < 1e-4 m² threshold).
      (c as { vr: { headset: { position: number[] } } }).vr.headset.position = [0.0005, 0, 0];
      updateTrait(hrtfHandler, n, cfg, c, 0.016);
      expect(getEventCount(c, 'hrtf_listener_update')).toBe(before);
    });

    it('first frame with VR pose emits hrtf_listener_update (non-zero pose)', () => {
      const c = ctxWithVR([1, 1.7, 0.5]);
      const n = createMockNode('hrtf-vr3');
      attachTrait(hrtfHandler, n, cfg, c);
      const before = getEventCount(c, 'hrtf_listener_update');
      updateTrait(hrtfHandler, n, cfg, c, 0.016);
      expect(getEventCount(c, 'hrtf_listener_update')).toBe(before + 1);
    });

    it('headset rotation change past threshold triggers update', () => {
      const c = ctxWithVR([0, 0, 0], [0, 0, 0]);
      const n = createMockNode('hrtf-vr4');
      attachTrait(hrtfHandler, n, cfg, c);
      // Settle baseline.
      updateTrait(hrtfHandler, n, cfg, c, 0.016);
      const before = getEventCount(c, 'hrtf_listener_update');
      // Significant yaw turn (~6° → 0.105 rad → 0.011 rad² > 1e-4 threshold).
      (c as { vr: { headset: { rotation: number[] } } }).vr.headset.rotation = [0, 0.105, 0];
      updateTrait(hrtfHandler, n, cfg, c, 0.016);
      expect(getEventCount(c, 'hrtf_listener_update')).toBe(before + 1);
    });

    it('no VR context → onUpdate skips pose polling without throwing', () => {
      // Default mock context has no vr field — the trait must not crash.
      const before = getEventCount(ctx, 'hrtf_listener_update');
      updateTrait(hrtfHandler, node, cfg, ctx, 0.016);
      expect(getEventCount(ctx, 'hrtf_listener_update')).toBe(before);
    });
  });
});
