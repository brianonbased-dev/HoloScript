import { describe, it, expect, vi, beforeEach } from 'vitest';
import { gestureHandler, GestureConfig } from '../GestureTrait';

// ─── helpers ────────────────────────────────────────────────────────────────

let _now = 0;
vi.spyOn(performance, 'now').mockImplementation(() => _now);

function mkCfg(o: Partial<GestureConfig> = {}): GestureConfig {
  return { ...gestureHandler.defaultConfig!, ...o };
}

function mkNode(id = 'g-node') {
  return { id } as any;
}

function mkHand(pos: { x: number; y: number; z?: number }, pinch = 0) {
  return { position: { x: pos.x, y: pos.y, z: pos.z ?? 0 }, pinchStrength: pinch };
}

function mkCtx(left: any = null, right: any = null) {
  const emitted: any[] = [];
  const hands: any = {};
  if (left) hands.left = left;
  if (right) hands.right = right;
  return {
    emitted,
    emit: vi.fn((t: string, p: any) => emitted.push({ type: t, payload: p })),
    vr: { hands },
  };
}

function attach(cfg = mkCfg(), node = mkNode()) {
  gestureHandler.onAttach!(node, cfg, {} as any);
  return { node, cfg };
}

// ─── tests ───────────────────────────────────────────────────────────────────

describe('gestureHandler — defaultConfig', () => {
  it('enabledGestures includes swipe_left, swipe_right, pinch', () => {
    const g = gestureHandler.defaultConfig!.enabledGestures;
    expect(g).toContain('swipe_left');
    expect(g).toContain('swipe_right');
    expect(g).toContain('pinch');
  });
  it('swipeThreshold = 0.1', () => expect(gestureHandler.defaultConfig?.swipeThreshold).toBe(0.1));
  it('pinchThreshold = 0.9', () => expect(gestureHandler.defaultConfig?.pinchThreshold).toBe(0.9));
  it('debounce = 300', () => expect(gestureHandler.defaultConfig?.debounce).toBe(300));
});

describe('gestureHandler — onAttach / onDetach', () => {
  it('onAttach initialises state without throwing', () => {
    const node = mkNode('att1');
    expect(() => gestureHandler.onAttach!(node, mkCfg(), {} as any)).not.toThrow();
  });
  it('onDetach removes state without throwing', () => {
    const node = mkNode('det1');
    gestureHandler.onAttach!(node, mkCfg(), {} as any);
    expect(() => gestureHandler.onDetach!(node, mkCfg(), {} as any)).not.toThrow();
  });
  it('no-op when vr context missing', () => {
    const node = mkNode('novr');
    gestureHandler.onAttach!(node, mkCfg(), {} as any);
    expect(() => gestureHandler.onUpdate!(node, mkCfg(), {} as any, 0.016)).not.toThrow();
  });
});

describe('gestureHandler — pinch detection', () => {
  it('emits gesture pinch when pinchStrength > threshold', () => {
    _now = 1000;
    const cfg = mkCfg({ enabledGestures: ['pinch'], pinchThreshold: 0.9, debounce: 300 });
    const { node } = attach(cfg);
    const ctx = mkCtx(mkHand({ x: 0, y: 0 }, 0.95));
    gestureHandler.onUpdate!(node, cfg, ctx as any, 0.016);
    expect(ctx.emitted.some((e: any) => e.type === 'gesture' && e.payload.type === 'pinch')).toBe(true);
  });

  it('pinch emits hand name = left', () => {
    _now = 2000;
    const cfg = mkCfg({ enabledGestures: ['pinch'], debounce: 0 });
    const { node } = attach(cfg);
    const ctx = mkCtx(mkHand({ x: 0, y: 0 }, 0.95));
    gestureHandler.onUpdate!(node, cfg, ctx as any, 0.016);
    const ev = ctx.emitted.find((e: any) => e.payload?.type === 'pinch');
    expect(ev?.payload.hand).toBe('left');
  });

  it('pinch emits hand name = right', () => {
    _now = 3000;
    const cfg = mkCfg({ enabledGestures: ['pinch'], debounce: 0 });
    const { node } = attach(cfg);
    const ctx = mkCtx(null, mkHand({ x: 0, y: 0 }, 0.95));
    gestureHandler.onUpdate!(node, cfg, ctx as any, 0.016);
    const ev = ctx.emitted.find((e: any) => e.payload?.type === 'pinch');
    expect(ev?.payload.hand).toBe('right');
  });

  it('no pinch when strength below threshold', () => {
    _now = 4000;
    const cfg = mkCfg({ enabledGestures: ['pinch'], pinchThreshold: 0.9 });
    const { node } = attach(cfg);
    const ctx = mkCtx(mkHand({ x: 0, y: 0 }, 0.5));
    gestureHandler.onUpdate!(node, cfg, ctx as any, 0.016);
    expect(ctx.emitted.some((e: any) => e.payload?.type === 'pinch')).toBe(false);
  });

  it('debounce prevents double-pinch within window', () => {
    _now = 5000;
    const cfg = mkCfg({ enabledGestures: ['pinch'], pinchThreshold: 0.9, debounce: 500 });
    const { node } = attach(cfg);
    const ctx = mkCtx(mkHand({ x: 0, y: 0 }, 0.95));
    gestureHandler.onUpdate!(node, cfg, ctx as any, 0.016); // fires at t=5000
    ctx.emitted.length = 0;
    _now = 5100; // only 100ms later — within debounce window
    gestureHandler.onUpdate!(node, cfg, ctx as any, 0.016);
    expect(ctx.emitted.some((e: any) => e.payload?.type === 'pinch')).toBe(false);
  });

  it('pinch fires again after debounce window', () => {
    _now = 6000;
    const cfg = mkCfg({ enabledGestures: ['pinch'], pinchThreshold: 0.9, debounce: 300 });
    const { node } = attach(cfg);
    // First fire - need to reset pinch state first
    const ctx = mkCtx(mkHand({ x: 0, y: 0 }, 0.0)); // not pinching
    gestureHandler.onUpdate!(node, cfg, ctx as any, 0.016);
    ctx.emitted.length = 0;
    _now = 6500;
    const ctx2 = mkCtx(mkHand({ x: 0, y: 0 }, 0.95));
    gestureHandler.onUpdate!(node, cfg, ctx2 as any, 0.016);
    expect(ctx2.emitted.some((e: any) => e.payload?.type === 'pinch')).toBe(true);
  });

  it('pinch not emitted if gesture not in enabledGestures', () => {
    _now = 7000;
    const cfg = mkCfg({ enabledGestures: ['swipe_left'], pinchThreshold: 0.9 });
    const { node } = attach(cfg);
    const ctx = mkCtx(mkHand({ x: 0, y: 0 }, 0.98));
    gestureHandler.onUpdate!(node, cfg, ctx as any, 0.016);
    expect(ctx.emitted.some((e: any) => e.payload?.type === 'pinch')).toBe(false);
  });
});

describe('gestureHandler — swipe detection', () => {
  it('emits swipe_right on sufficient positive dx', () => {
    _now = 10000;
    const cfg = mkCfg({ enabledGestures: ['swipe_right'], swipeThreshold: 0.1, debounce: 0 });
    const { node } = attach(cfg);
    // First update: set lastPosition
    const ctx1 = mkCtx(mkHand({ x: 0, y: 0 }));
    gestureHandler.onUpdate!(node, cfg, ctx1 as any, 0.016);
    // Second update: move right by 0.5m
    _now = 10100;
    const ctx2 = mkCtx(mkHand({ x: 0.5, y: 0 }));
    gestureHandler.onUpdate!(node, cfg, ctx2 as any, 0.016);
    expect(ctx2.emitted.some((e: any) => e.payload?.type === 'swipe_right')).toBe(true);
  });

  it('emits swipe_left on negative dx', () => {
    _now = 11000;
    const cfg = mkCfg({ enabledGestures: ['swipe_left'], swipeThreshold: 0.1, debounce: 0 });
    const { node } = attach(cfg);
    const ctx1 = mkCtx(mkHand({ x: 0, y: 0 }));
    gestureHandler.onUpdate!(node, cfg, ctx1 as any, 0.016);
    _now = 11100;
    const ctx2 = mkCtx(mkHand({ x: -0.5, y: 0 }));
    gestureHandler.onUpdate!(node, cfg, ctx2 as any, 0.016);
    expect(ctx2.emitted.some((e: any) => e.payload?.type === 'swipe_left')).toBe(true);
  });

  it('emits swipe_up on positive dy > dx', () => {
    _now = 12000;
    const cfg = mkCfg({ enabledGestures: ['swipe_up'], swipeThreshold: 0.1, debounce: 0 });
    const { node } = attach(cfg);
    const ctx1 = mkCtx(mkHand({ x: 0, y: 0 }));
    gestureHandler.onUpdate!(node, cfg, ctx1 as any, 0.016);
    _now = 12100;
    const ctx2 = mkCtx(mkHand({ x: 0.05, y: 0.5 })); // dy > dx
    gestureHandler.onUpdate!(node, cfg, ctx2 as any, 0.016);
    expect(ctx2.emitted.some((e: any) => e.payload?.type === 'swipe_up')).toBe(true);
  });

  it('emits swipe_down on negative dy', () => {
    _now = 13000;
    const cfg = mkCfg({ enabledGestures: ['swipe_down'], swipeThreshold: 0.1, debounce: 0 });
    const { node } = attach(cfg);
    const ctx1 = mkCtx(mkHand({ x: 0, y: 0 }));
    gestureHandler.onUpdate!(node, cfg, ctx1 as any, 0.016);
    _now = 13100;
    const ctx2 = mkCtx(mkHand({ x: 0.02, y: -0.5 }));
    gestureHandler.onUpdate!(node, cfg, ctx2 as any, 0.016);
    expect(ctx2.emitted.some((e: any) => e.payload?.type === 'swipe_down')).toBe(true);
  });

  it('no swipe if dist < swipeThreshold', () => {
    _now = 14000;
    const cfg = mkCfg({ enabledGestures: ['swipe_right'], swipeThreshold: 0.5, debounce: 0 });
    const { node } = attach(cfg);
    const ctx1 = mkCtx(mkHand({ x: 0, y: 0 }));
    gestureHandler.onUpdate!(node, cfg, ctx1 as any, 0.016);
    _now = 14100;
    const ctx2 = mkCtx(mkHand({ x: 0.1, y: 0 })); // only 0.1 < 0.5 threshold
    gestureHandler.onUpdate!(node, cfg, ctx2 as any, 0.016);
    expect(ctx2.emitted.some((e: any) => e.payload?.type === 'swipe_right')).toBe(false);
  });

  it('swipe not emitted if type not in enabledGestures', () => {
    _now = 15000;
    const cfg = mkCfg({ enabledGestures: ['pinch'], swipeThreshold: 0.1, debounce: 0 });
    const { node } = attach(cfg);
    const ctx1 = mkCtx(mkHand({ x: 0, y: 0 }));
    gestureHandler.onUpdate!(node, cfg, ctx1 as any, 0.016);
    _now = 15100;
    const ctx2 = mkCtx(mkHand({ x: 0.5, y: 0 }));
    gestureHandler.onUpdate!(node, cfg, ctx2 as any, 0.016);
    expect(ctx2.emitted.some((e: any) => e.payload?.type === 'swipe_right')).toBe(false);
  });

  it('updates lastPosition each frame', () => {
    _now = 16000;
    const cfg = mkCfg();
    const { node } = attach(cfg);
    const ctx1 = mkCtx(mkHand({ x: 1, y: 2 }));
    gestureHandler.onUpdate!(node, cfg, ctx1 as any, 0.016);
    // Second call should use new position as baseline
    _now = 16100;
    const ctx2 = mkCtx(mkHand({ x: 1.01, y: 2.01 })); // tiny move — below 0.1 threshold
    gestureHandler.onUpdate!(node, cfg, ctx2 as any, 0.016);
    expect(ctx2.emitted.some((e: any) => e.payload?.type?.startsWith('swipe'))).toBe(false);
  });

  it('swipe-debounce prevents double emission', () => {
    _now = 17000;
    const cfg = mkCfg({ enabledGestures: ['swipe_right'], swipeThreshold: 0.1, debounce: 500 });
    const { node } = attach(cfg);
    const ctx1 = mkCtx(mkHand({ x: 0, y: 0 }));
    gestureHandler.onUpdate!(node, cfg, ctx1 as any, 0.016);
    _now = 17100;
    const ctx2 = mkCtx(mkHand({ x: 0.5, y: 0 }));
    gestureHandler.onUpdate!(node, cfg, ctx2 as any, 0.016); // fires
    ctx2.emitted.length = 0;
    _now = 17200;
    const ctx3 = mkCtx(mkHand({ x: 1.0, y: 0 }));
    gestureHandler.onUpdate!(node, cfg, ctx3 as any, 0.016); // within debounce
    expect(ctx3.emitted.some((e: any) => e.payload?.type === 'swipe_right')).toBe(false);
  });
});
