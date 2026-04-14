/**
 * VPSTrait Production Tests
 *
 * Visual Positioning System integration for high-accuracy localization.
 * Covers: defaultConfig, onAttach (coverage_check + auto_localize paths),
 * onDetach (stop_tracking guard), onUpdate (pose apply when tracking/localized),
 * and all 8 onEvent types.
 */

import { describe, it, expect, vi } from 'vitest';
import { vpsHandler } from '../VPSTrait';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeNode() {
  return { id: 'vps_test' } as any;
}
function makeCtx() {
  return { emit: vi.fn() };
}

function attach(node: any, overrides: Record<string, unknown> = {}) {
  const cfg = { ...vpsHandler.defaultConfig!, ...overrides } as any;
  const ctx = makeCtx();
  vpsHandler.onAttach!(node, cfg, ctx as any);
  return { cfg, ctx };
}

function st(node: any) {
  return node.__vpsState as any;
}

function fire(node: any, cfg: any, ctx: any, evt: Record<string, unknown>) {
  vpsHandler.onEvent!(node, cfg, ctx as any, evt as any);
}

const POSE = {
  position: [1, 2, 3],
  rotation: [0, 0.707, 0, 0.707 ],
};

// ─── defaultConfig ────────────────────────────────────────────────────────────

describe('VPSTrait — defaultConfig', () => {
  it('has 8 fields with correct defaults', () => {
    const d = vpsHandler.defaultConfig!;
    expect(d.provider).toBe('arcore');
    expect(d.coverage_check).toBe(true);
    expect(d.localization_timeout).toBe(30000);
    expect(d.continuous_tracking).toBe(true);
    expect(d.quality_threshold).toBe(0.7);
    expect(d.auto_localize).toBe(true);
    expect(d.max_attempts).toBe(5);
    expect(d.retry_interval).toBe(3000);
  });
});

// ─── onAttach ─────────────────────────────────────────────────────────────────

describe('VPSTrait — onAttach', () => {
  it('initialises state with correct defaults', () => {
    const node = makeNode();
    attach(node, { coverage_check: false, auto_localize: false });
    const s = st(node);
    expect(s.state).toBe('idle');
    expect(s.isLocalized).toBe(false);
    expect(s.confidence).toBe(0);
    expect(s.accuracy).toBe(Infinity);
    expect(s.continuousTrackingActive).toBe(false);
    expect(s.locationId).toBeNull();
    expect(s.localizationAttempts).toBe(0);
  });

  it('always emits vps_init with provider', () => {
    const node = makeNode();
    const { ctx } = attach(node, {
      coverage_check: false,
      auto_localize: false,
      provider: 'niantic',
    });
    expect(ctx.emit).toHaveBeenCalledWith(
      'vps_init',
      expect.objectContaining({ provider: 'niantic' })
    );
  });

  it('coverage_check=true: state=checking_coverage + emits vps_check_coverage', () => {
    const node = makeNode();
    const { ctx } = attach(node, { coverage_check: true });
    expect(st(node).state).toBe('checking_coverage');
    expect(ctx.emit).toHaveBeenCalledWith('vps_check_coverage', expect.any(Object));
  });

  it('coverage_check=false + auto_localize=true: state=localizing + emits vps_localize', () => {
    const node = makeNode();
    const { ctx } = attach(node, {
      coverage_check: false,
      auto_localize: true,
      localization_timeout: 15000,
    });
    expect(st(node).state).toBe('localizing');
    expect(ctx.emit).toHaveBeenCalledWith(
      'vps_localize',
      expect.objectContaining({ timeout: 15000 })
    );
  });

  it('coverage_check=false + auto_localize=false: state stays idle, no localize emit', () => {
    const node = makeNode();
    const { ctx } = attach(node, { coverage_check: false, auto_localize: false });
    expect(st(node).state).toBe('idle');
    expect(ctx.emit).not.toHaveBeenCalledWith('vps_localize', expect.any(Object));
  });
});

// ─── onDetach ─────────────────────────────────────────────────────────────────

describe('VPSTrait — onDetach', () => {
  it('emits vps_stop_tracking when continuousTrackingActive=true', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { coverage_check: false, auto_localize: false });
    st(node).continuousTrackingActive = true;
    ctx.emit.mockClear();
    vpsHandler.onDetach!(node, cfg, ctx as any);
    expect(ctx.emit).toHaveBeenCalledWith('vps_stop_tracking', expect.any(Object));
  });

  it('does NOT emit vps_stop_tracking when tracking not active', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { coverage_check: false, auto_localize: false });
    ctx.emit.mockClear();
    vpsHandler.onDetach!(node, cfg, ctx as any);
    expect(ctx.emit).not.toHaveBeenCalledWith('vps_stop_tracking', expect.any(Object));
  });

  it('always emits vps_shutdown', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { coverage_check: false, auto_localize: false });
    ctx.emit.mockClear();
    vpsHandler.onDetach!(node, cfg, ctx as any);
    expect(ctx.emit).toHaveBeenCalledWith('vps_shutdown', expect.any(Object));
  });

  it('removes __vpsState', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { coverage_check: false, auto_localize: false });
    vpsHandler.onDetach!(node, cfg, ctx as any);
    expect(node.__vpsState).toBeUndefined();
  });
});

// ─── onUpdate ─────────────────────────────────────────────────────────────────

describe('VPSTrait — onUpdate', () => {
  it('applies pose to node.position when state=tracking', () => {
    const node = {
      ...makeNode(),
      position: [0, 0, 0],
      rotation: [0, 0, 0, 0 ],
    };
    const { cfg, ctx } = attach(node, { coverage_check: false, auto_localize: false });
    st(node).state = 'tracking';
    st(node).pose = POSE;
    vpsHandler.onUpdate!(node, cfg, ctx as any, 0.016);
    expect(node.position[0]).toBe(1);
    expect(node.position[1]).toBe(2);
    expect(node.position[2]).toBe(3);
  });

  it('applies pose when state=localized', () => {
    const node = { ...makeNode(), position: [0, 0, 0] };
    const { cfg, ctx } = attach(node, { coverage_check: false, auto_localize: false });
    st(node).state = 'localized';
    st(node).pose = POSE;
    vpsHandler.onUpdate!(node, cfg, ctx as any, 0.016);
    expect(node.position[0]).toBe(1);
  });

  it('does not apply pose when state=idle', () => {
    const node = { ...makeNode(), position: [99, 0, 0] };
    const { cfg, ctx } = attach(node, { coverage_check: false, auto_localize: false });
    st(node).state = 'idle';
    st(node).pose = POSE;
    vpsHandler.onUpdate!(node, cfg, ctx as any, 0.016);
    expect(node.position[0]).toBe(99); // unchanged
  });

  it('applies rotation[3] when node.rotation[3] defined', () => {
    const node = {
      ...makeNode(),
      position: [0, 0, 0],
      rotation: [0, 0, 0, 0 ],
    };
    const { cfg, ctx } = attach(node, { coverage_check: false, auto_localize: false });
    st(node).state = 'tracking';
    st(node).pose = POSE;
    vpsHandler.onUpdate!(node, cfg, ctx as any, 0.016);
    expect(node.rotation[3]).toBeCloseTo(0.707);
  });
});

// ─── onEvent — vps_coverage_result ───────────────────────────────────────────

describe('VPSTrait — onEvent: vps_coverage_result', () => {
  it('hasCoverage=true + auto_localize: transitions to localizing + emits vps_localize + on_vps_coverage_available', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, {
      coverage_check: true,
      auto_localize: true,
      localization_timeout: 20000,
    });
    ctx.emit.mockClear();
    fire(node, cfg, ctx, { type: 'vps_coverage_result', hasCoverage: true });
    expect(st(node).state).toBe('localizing');
    expect(ctx.emit).toHaveBeenCalledWith(
      'vps_localize',
      expect.objectContaining({ timeout: 20000 })
    );
    expect(ctx.emit).toHaveBeenCalledWith('on_vps_coverage_available', expect.any(Object));
  });

  it('hasCoverage=true + auto_localize=false: state=idle + emits on_vps_coverage_available', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { coverage_check: true, auto_localize: false });
    ctx.emit.mockClear();
    fire(node, cfg, ctx, { type: 'vps_coverage_result', hasCoverage: true });
    expect(st(node).state).toBe('idle');
    expect(ctx.emit).not.toHaveBeenCalledWith('vps_localize', expect.any(Object));
    expect(ctx.emit).toHaveBeenCalledWith('on_vps_coverage_available', expect.any(Object));
  });

  it('hasCoverage=false: state=unavailable + emits on_vps_unavailable', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { coverage_check: true, auto_localize: true });
    ctx.emit.mockClear();
    fire(node, cfg, ctx, { type: 'vps_coverage_result', hasCoverage: false });
    expect(st(node).state).toBe('unavailable');
    expect(ctx.emit).toHaveBeenCalledWith(
      'on_vps_unavailable',
      expect.objectContaining({ reason: 'no_coverage' })
    );
  });
});

// ─── onEvent — vps_localized ─────────────────────────────────────────────────

describe('VPSTrait — onEvent: vps_localized', () => {
  it('confidence >= threshold + continuous_tracking: state=tracking + vps_start_tracking + on_vps_localized', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, {
      coverage_check: false,
      auto_localize: false,
      quality_threshold: 0.6,
      continuous_tracking: true,
    });
    ctx.emit.mockClear();
    fire(node, cfg, ctx, {
      type: 'vps_localized',
      confidence: 0.85,
      accuracy: 0.5,
      locationId: 'loc1',
      pose: POSE,
    });
    const s = st(node);
    expect(s.state).toBe('tracking');
    expect(s.isLocalized).toBe(true);
    expect(s.confidence).toBeCloseTo(0.85);
    expect(s.locationId).toBe('loc1');
    expect(s.pose).toEqual(POSE);
    expect(s.continuousTrackingActive).toBe(true);
    expect(ctx.emit).toHaveBeenCalledWith('vps_start_tracking', expect.any(Object));
    expect(ctx.emit).toHaveBeenCalledWith(
      'on_vps_localized',
      expect.objectContaining({ confidence: 0.85, locationId: 'loc1' })
    );
  });

  it('confidence >= threshold + continuous_tracking=false: state=localized, no start_tracking', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, {
      coverage_check: false,
      auto_localize: false,
      quality_threshold: 0.6,
      continuous_tracking: false,
    });
    ctx.emit.mockClear();
    fire(node, cfg, ctx, {
      type: 'vps_localized',
      confidence: 0.8,
      accuracy: 1,
      locationId: null,
      pose: POSE,
    });
    expect(st(node).state).toBe('localized');
    expect(ctx.emit).not.toHaveBeenCalledWith('vps_start_tracking', expect.any(Object));
    expect(ctx.emit).toHaveBeenCalledWith('on_vps_localized', expect.any(Object));
  });

  it('confidence < threshold: state=limited + emits on_vps_limited', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, {
      coverage_check: false,
      auto_localize: false,
      quality_threshold: 0.7,
    });
    ctx.emit.mockClear();
    fire(node, cfg, ctx, {
      type: 'vps_localized',
      confidence: 0.5,
      accuracy: 2,
      locationId: null,
      pose: POSE,
    });
    expect(st(node).state).toBe('limited');
    expect(ctx.emit).toHaveBeenCalledWith(
      'on_vps_limited',
      expect.objectContaining({ requiredConfidence: 0.7 })
    );
  });
});

// ─── onEvent — vps_localization_failed ────────────────────────────────────────

describe('VPSTrait — onEvent: vps_localization_failed', () => {
  it('increments attempts and does NOT emit on_vps_failed below max', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, {
      coverage_check: false,
      auto_localize: false,
      max_attempts: 3,
    });
    fire(node, cfg, ctx, { type: 'vps_localization_failed', reason: 'timeout' });
    expect(st(node).localizationAttempts).toBe(1);
    expect(ctx.emit).not.toHaveBeenCalledWith('on_vps_failed', expect.any(Object));
  });

  it('sets unavailable and emits on_vps_failed when max_attempts reached', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, {
      coverage_check: false,
      auto_localize: false,
      max_attempts: 2,
      retry_interval: 1,
    });
    fire(node, cfg, ctx, { type: 'vps_localization_failed', reason: 'no_features' });
    fire(node, cfg, ctx, { type: 'vps_localization_failed', reason: 'no_features' });
    expect(st(node).state).toBe('unavailable');
    expect(ctx.emit).toHaveBeenCalledWith(
      'on_vps_failed',
      expect.objectContaining({ attempts: 2, reason: 'no_features' })
    );
  });
});

// ─── onEvent — vps_pose_update ────────────────────────────────────────────────

describe('VPSTrait — onEvent: vps_pose_update', () => {
  it('updates pose, confidence, accuracy', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { coverage_check: false, auto_localize: false });
    st(node).state = 'tracking';
    st(node).confidence = 0.9;
    fire(node, cfg, ctx, { type: 'vps_pose_update', pose: POSE, confidence: 0.95, accuracy: 0.3 });
    expect(st(node).pose).toEqual(POSE);
    expect(st(node).confidence).toBeCloseTo(0.95);
  });

  it('tracking→limited when confidence drops below threshold', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, {
      coverage_check: false,
      auto_localize: false,
      quality_threshold: 0.7,
    });
    st(node).state = 'tracking';
    ctx.emit.mockClear();
    fire(node, cfg, ctx, { type: 'vps_pose_update', pose: POSE, confidence: 0.5, accuracy: 3 });
    expect(st(node).state).toBe('limited');
    expect(ctx.emit).toHaveBeenCalledWith(
      'on_vps_tracking_degraded',
      expect.objectContaining({ confidence: 0.5 })
    );
  });

  it('limited→tracking when confidence recovers above threshold', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, {
      coverage_check: false,
      auto_localize: false,
      quality_threshold: 0.7,
    });
    st(node).state = 'limited';
    st(node).confidence = 0.5;
    ctx.emit.mockClear();
    fire(node, cfg, ctx, { type: 'vps_pose_update', pose: POSE, confidence: 0.85, accuracy: 0.5 });
    expect(st(node).state).toBe('tracking');
    expect(ctx.emit).toHaveBeenCalledWith(
      'on_vps_tracking_restored',
      expect.objectContaining({ confidence: 0.85 })
    );
  });
});

// ─── onEvent — vps_localize (manual trigger) ──────────────────────────────────

describe('VPSTrait — onEvent: vps_localize', () => {
  it('resets attempts, sets localizing, emits vps_localize', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, {
      coverage_check: false,
      auto_localize: false,
      localization_timeout: 15000,
    });
    st(node).localizationAttempts = 4;
    ctx.emit.mockClear();
    fire(node, cfg, ctx, { type: 'vps_localize' });
    expect(st(node).state).toBe('localizing');
    expect(st(node).localizationAttempts).toBe(0);
    expect(ctx.emit).toHaveBeenCalledWith(
      'vps_localize',
      expect.objectContaining({ timeout: 15000 })
    );
  });
});

// ─── onEvent — vps_stop ───────────────────────────────────────────────────────

describe('VPSTrait — onEvent: vps_stop', () => {
  it('stops tracking, sets idle, emits vps_stop_tracking', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { coverage_check: false, auto_localize: false });
    st(node).continuousTrackingActive = true;
    st(node).state = 'tracking';
    ctx.emit.mockClear();
    fire(node, cfg, ctx, { type: 'vps_stop' });
    expect(st(node).continuousTrackingActive).toBe(false);
    expect(st(node).state).toBe('idle');
    expect(ctx.emit).toHaveBeenCalledWith('vps_stop_tracking', expect.any(Object));
  });
});

// ─── onEvent — vps_query ──────────────────────────────────────────────────────

describe('VPSTrait — onEvent: vps_query', () => {
  it('emits vps_info with full snapshot', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { coverage_check: false, auto_localize: false });
    st(node).state = 'tracking';
    st(node).isLocalized = true;
    st(node).confidence = 0.92;
    st(node).accuracy = 0.3;
    st(node).locationId = 'locX';
    st(node).pose = POSE;
    ctx.emit.mockClear();
    fire(node, cfg, ctx, { type: 'vps_query', queryId: 'vq1' });
    expect(ctx.emit).toHaveBeenCalledWith(
      'vps_info',
      expect.objectContaining({
        queryId: 'vq1',
        state: 'tracking',
        isLocalized: true,
        confidence: 0.92,
        locationId: 'locX',
      })
    );
  });
});
