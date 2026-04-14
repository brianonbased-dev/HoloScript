/**
 * POITrait — Production Test Suite
 *
 * Tests defaultConfig, onAttach state init + navigation/label registration,
 * onDetach cleanup, onUpdate proximity detection (trigger / exit / visibility),
 * and onEvent poi_navigate_to / poi_reset / poi_set_metadata / poi_highlight / poi_show_info / poi_query.
 */
import { describe, it, expect, vi } from 'vitest';
import { poiHandler } from '../POITrait';

function makeNode(pos?: Vector3) {
  return { id: 'poi_1', position: pos ?? [0, 0, 0 ] };
}
function makeContext(playerPos?: Vector3) {
  return {
    emit: vi.fn(),
    player: playerPos ? { position: playerPos } : undefined,
  };
}
function attachNode(config: any = {}) {
  const node = makeNode();
  const ctx = makeContext();
  const cfg = { ...poiHandler.defaultConfig!, ...config };
  poiHandler.onAttach!(node, cfg, ctx);
  return { node, ctx, cfg };
}

// ─── defaultConfig ────────────────────────────────────────────────────────────

describe('poiHandler.defaultConfig', () => {
  it('name = empty string', () => expect(poiHandler.defaultConfig!.name).toBe(''));
  it('trigger_radius = 10', () => expect(poiHandler.defaultConfig!.trigger_radius).toBe(10));
  it('visible_radius = 100', () => expect(poiHandler.defaultConfig!.visible_radius).toBe(100));
  it('navigation_target = false', () =>
    expect(poiHandler.defaultConfig!.navigation_target).toBe(false));
  it('show_distance = true', () => expect(poiHandler.defaultConfig!.show_distance).toBe(true));
  it('show_label = true', () => expect(poiHandler.defaultConfig!.show_label).toBe(true));
  it('trigger_once = false', () => expect(poiHandler.defaultConfig!.trigger_once).toBe(false));
  it('cooldown = 1000ms', () => expect(poiHandler.defaultConfig!.cooldown).toBe(1000));
  it('metadata = {}', () => expect(poiHandler.defaultConfig!.metadata).toEqual({}));
});

// ─── onAttach ────────────────────────────────────────────────────────────────

describe('poiHandler.onAttach', () => {
  it('initializes __poiState on node', () => {
    const { node } = attachNode();
    expect((node as any).__poiState).toBeDefined();
  });
  it('initial isInRange = false', () => {
    const { node } = attachNode();
    expect((node as any).__poiState.isInRange).toBe(false);
  });
  it('initial isVisible = false', () => {
    const { node } = attachNode();
    expect((node as any).__poiState.isVisible).toBe(false);
  });
  it('initial distanceToUser = Infinity', () => {
    const { node } = attachNode();
    expect((node as any).__poiState.distanceToUser).toBe(Infinity);
  });
  it('initial wasTriggered = false', () => {
    const { node } = attachNode();
    expect((node as any).__poiState.wasTriggered).toBe(false);
  });
  it('initial userInTriggerZone = false', () => {
    const { node } = attachNode();
    expect((node as any).__poiState.userInTriggerZone).toBe(false);
  });
  it('emits poi_register when navigation_target=true', () => {
    const node = makeNode();
    const ctx = makeContext();
    const cfg = {
      ...poiHandler.defaultConfig!,
      navigation_target: true,
      name: 'Lab',
      category: 'science',
    };
    poiHandler.onAttach!(node, cfg, ctx);
    expect(ctx.emit).toHaveBeenCalledWith(
      'poi_register',
      expect.objectContaining({ name: 'Lab', category: 'science' })
    );
  });
  it('does NOT emit poi_register when navigation_target=false', () => {
    const { ctx } = attachNode({ navigation_target: false });
    const called = ctx.emit.mock.calls.some((c: any[]) => c[0] === 'poi_register');
    expect(called).toBe(false);
  });
  it('emits poi_create_label when show_label=true', () => {
    const { ctx } = attachNode({ show_label: true, name: 'Museum' });
    expect(ctx.emit).toHaveBeenCalledWith(
      'poi_create_label',
      expect.objectContaining({ name: 'Museum' })
    );
  });
  it('does NOT emit poi_create_label when show_label=false', () => {
    const { ctx } = attachNode({ show_label: false });
    const called = ctx.emit.mock.calls.some((c: any[]) => c[0] === 'poi_create_label');
    expect(called).toBe(false);
  });
});

// ─── onDetach ────────────────────────────────────────────────────────────────

describe('poiHandler.onDetach', () => {
  it('removes __poiState from node', () => {
    const { node, cfg, ctx } = attachNode();
    poiHandler.onDetach!(node, cfg, ctx);
    expect((node as any).__poiState).toBeUndefined();
  });
  it('emits poi_unregister when navigation_target=true', () => {
    const node = makeNode();
    const ctx = makeContext();
    const cfg = { ...poiHandler.defaultConfig!, navigation_target: true };
    poiHandler.onAttach!(node, cfg, ctx);
    ctx.emit.mockClear();
    poiHandler.onDetach!(node, cfg, ctx);
    expect(ctx.emit).toHaveBeenCalledWith('poi_unregister', expect.any(Object));
  });
  it('does NOT emit poi_unregister when navigation_target=false', () => {
    const { node, cfg, ctx } = attachNode({ navigation_target: false });
    ctx.emit.mockClear();
    poiHandler.onDetach!(node, cfg, ctx);
    const called = ctx.emit.mock.calls.some((c: any[]) => c[0] === 'poi_unregister');
    expect(called).toBe(false);
  });
});

// ─── onUpdate — proximity detection ──────────────────────────────────────────

describe('poiHandler.onUpdate', () => {
  it('calculates distance when player and node positions known', () => {
    const node = makeNode([0, 0, 0 ]);
    const ctx = makeContext([3, 4, 0 ]); // distance = 5
    const cfg = { ...poiHandler.defaultConfig!, visible_radius: 100, trigger_radius: 10 };
    poiHandler.onAttach!(node, cfg, ctx);
    ctx.emit.mockClear();
    poiHandler.onUpdate!(node, cfg, ctx, 0.016);
    expect((node as any).__poiState.distanceToUser).toBeCloseTo(5, 2);
  });
  it('marks visible when distance <= visible_radius', () => {
    const node = makeNode([0, 0, 0 ]);
    const ctx = makeContext([5, 0, 0 ]); // distance = 5
    const cfg = { ...poiHandler.defaultConfig!, visible_radius: 10, trigger_radius: 2 };
    poiHandler.onAttach!(node, cfg, ctx);
    poiHandler.onUpdate!(node, cfg, ctx, 0.016);
    expect((node as any).__poiState.isVisible).toBe(true);
  });
  it('emits poi_visibility_change when visibility changes', () => {
    const node = makeNode([0, 0, 0 ]);
    const ctx = makeContext([5, 0, 0 ]);
    const cfg = { ...poiHandler.defaultConfig!, visible_radius: 10, trigger_radius: 2 };
    poiHandler.onAttach!(node, cfg, ctx);
    ctx.emit.mockClear();
    poiHandler.onUpdate!(node, cfg, ctx, 0.016);
    expect(ctx.emit).toHaveBeenCalledWith(
      'poi_visibility_change',
      expect.objectContaining({ visible: true })
    );
  });
  it('fires on_poi_proximity when entering trigger zone', () => {
    const node = makeNode([0, 0, 0 ]);
    const ctx = makeContext([2, 0, 0 ]); // distance = 2 < trigger_radius = 5
    const cfg = {
      ...poiHandler.defaultConfig!,
      trigger_radius: 5,
      visible_radius: 100,
      cooldown: 0,
    };
    poiHandler.onAttach!(node, cfg, ctx);
    ctx.emit.mockClear();
    poiHandler.onUpdate!(node, cfg, ctx, 0.016);
    expect(ctx.emit).toHaveBeenCalledWith('on_poi_proximity', expect.any(Object));
  });
  it('does NOT re-fire on_poi_proximity when trigger_once=true and already triggered', () => {
    const node = makeNode([0, 0, 0 ]);
    const ctx = makeContext([2, 0, 0 ]);
    const cfg = {
      ...poiHandler.defaultConfig!,
      trigger_radius: 5,
      visible_radius: 100,
      trigger_once: true,
      cooldown: 0,
    };
    poiHandler.onAttach!(node, cfg, ctx);
    (node as any).__poiState.wasTriggered = true; // already triggered
    (node as any).__poiState.lastTriggerTime = 0;
    ctx.emit.mockClear();
    poiHandler.onUpdate!(node, cfg, ctx, 0.016);
    const calls = ctx.emit.mock.calls.filter((c: any[]) => c[0] === 'on_poi_proximity');
    expect(calls).toHaveLength(0);
  });
  it('emits on_poi_exit when leaving trigger zone', () => {
    const node = makeNode([0, 0, 0 ]);
    const ctx = makeContext([20, 0, 0 ]); // far away
    const cfg = { ...poiHandler.defaultConfig!, trigger_radius: 5, visible_radius: 100 };
    poiHandler.onAttach!(node, cfg, ctx);
    (node as any).__poiState.userInTriggerZone = true; // was in zone
    ctx.emit.mockClear();
    poiHandler.onUpdate!(node, cfg, ctx, 0.016);
    expect(ctx.emit).toHaveBeenCalledWith('on_poi_exit', expect.any(Object));
  });
  it('does nothing when no player position', () => {
    const { node, cfg } = attachNode();
    const ctx = makeContext(); // no player
    expect(() => poiHandler.onUpdate!(node, cfg, ctx, 0.016)).not.toThrow();
  });
});

// ─── onEvent ─────────────────────────────────────────────────────────────────

describe('poiHandler.onEvent', () => {
  it('poi_navigate_to emits navigation_set_destination when navigation_target=true', () => {
    const node = makeNode();
    const ctx = makeContext();
    const cfg = { ...poiHandler.defaultConfig!, navigation_target: true, name: 'Library' };
    poiHandler.onAttach!(node, cfg, ctx);
    ctx.emit.mockClear();
    poiHandler.onEvent!(node, cfg, ctx, { type: 'poi_navigate_to' });
    expect(ctx.emit).toHaveBeenCalledWith(
      'navigation_set_destination',
      expect.objectContaining({ name: 'Library' })
    );
  });
  it('poi_navigate_to ignored when navigation_target=false', () => {
    const { node, cfg, ctx } = attachNode({ navigation_target: false });
    ctx.emit.mockClear();
    poiHandler.onEvent!(node, cfg, ctx, { type: 'poi_navigate_to' });
    expect(ctx.emit).not.toHaveBeenCalled();
  });
  it('poi_reset clears wasTriggered and lastTriggerTime', () => {
    const { node, cfg, ctx } = attachNode();
    (node as any).__poiState.wasTriggered = true;
    (node as any).__poiState.lastTriggerTime = 12345;
    poiHandler.onEvent!(node, cfg, ctx, { type: 'poi_reset' });
    expect((node as any).__poiState.wasTriggered).toBe(false);
    expect((node as any).__poiState.lastTriggerTime).toBe(0);
  });
  it('poi_set_metadata stores key/value in config.metadata', () => {
    const { node, cfg, ctx } = attachNode();
    poiHandler.onEvent!(node, cfg, ctx, {
      type: 'poi_set_metadata',
      key: 'hours',
      value: '9am–5pm',
    });
    expect(cfg.metadata['hours']).toBe('9am–5pm');
  });
  it('poi_highlight emits poi_show_highlight with color and duration', () => {
    const { node, cfg, ctx } = attachNode();
    ctx.emit.mockClear();
    poiHandler.onEvent!(node, cfg, ctx, {
      type: 'poi_highlight',
      duration: 3000,
      color: '#FF0000',
    });
    expect(ctx.emit).toHaveBeenCalledWith(
      'poi_show_highlight',
      expect.objectContaining({ duration: 3000, color: '#FF0000' })
    );
  });
  it('poi_highlight uses default color #ffff00 and duration 2000 when not specified', () => {
    const { node, cfg, ctx } = attachNode();
    ctx.emit.mockClear();
    poiHandler.onEvent!(node, cfg, ctx, { type: 'poi_highlight' });
    const call = ctx.emit.mock.calls.find((c: any[]) => c[0] === 'poi_show_highlight');
    expect(call?.[1].color).toBe('#ffff00');
    expect(call?.[1].duration).toBe(2000);
  });
  it('poi_show_info emits poi_display_info with name, description, category, metadata, distance', () => {
    const { node, cfg, ctx } = attachNode({
      name: 'Castle',
      description: 'Historic',
      category: 'landmark',
    });
    ctx.emit.mockClear();
    poiHandler.onEvent!(node, cfg, ctx, { type: 'poi_show_info' });
    expect(ctx.emit).toHaveBeenCalledWith(
      'poi_display_info',
      expect.objectContaining({ name: 'Castle', description: 'Historic', category: 'landmark' })
    );
  });
  it('poi_query emits poi_info with current state fields', () => {
    const { node, cfg, ctx } = attachNode({ name: 'Tower' });
    (node as any).__poiState.isVisible = true;
    (node as any).__poiState.isInRange = false;
    ctx.emit.mockClear();
    poiHandler.onEvent!(node, cfg, ctx, { type: 'poi_query', queryId: 'q1' });
    const call = ctx.emit.mock.calls.find((c: any[]) => c[0] === 'poi_info');
    expect(call?.[1]).toMatchObject({
      queryId: 'q1',
      name: 'Tower',
      isVisible: true,
      isInRange: false,
    });
  });
});
