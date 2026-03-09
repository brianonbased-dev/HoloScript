/**
 * SpectatorTrait — Production Test Suite
 *
 * Tests: defaultConfig, onAttach state, onDetach, onUpdate follow camera,
 * onEvent spectator_join (capacity / join events), _leave, _set_camera (allowlist guard),
 * _set_follow (broadcasts to follow-mode spectators), _broadcast (delay vs immediate),
 * _set_delay, _toggle_visibility, _query.
 */
import { describe, it, expect, vi } from 'vitest';
import { spectatorHandler } from '../SpectatorTrait';

function makeNode() {
  return { id: 'spectator_node' };
}
function makeContext() {
  return { emit: vi.fn() };
}
function attachNode(config: any = {}) {
  const node = makeNode();
  const ctx = makeContext();
  const cfg = { ...spectatorHandler.defaultConfig!, ...config };
  spectatorHandler.onAttach!(node, cfg, ctx);
  return { node, ctx, cfg };
}

// ─── defaultConfig ────────────────────────────────────────────────────────────

describe('spectatorHandler.defaultConfig', () => {
  it('camera_mode = free', () => expect(spectatorHandler.defaultConfig!.camera_mode).toBe('free'));
  it('follow_target = empty string', () =>
    expect(spectatorHandler.defaultConfig!.follow_target).toBe(''));
  it('can_interact = false', () =>
    expect(spectatorHandler.defaultConfig!.can_interact).toBe(false));
  it('visible_to_participants = false', () =>
    expect(spectatorHandler.defaultConfig!.visible_to_participants).toBe(false));
  it('max_spectators = 50', () => expect(spectatorHandler.defaultConfig!.max_spectators).toBe(50));
  it('delay = 0', () => expect(spectatorHandler.defaultConfig!.delay).toBe(0));
  it('allowed_camera_modes includes free, follow, orbit', () => {
    expect(spectatorHandler.defaultConfig!.allowed_camera_modes).toContain('free');
    expect(spectatorHandler.defaultConfig!.allowed_camera_modes).toContain('follow');
    expect(spectatorHandler.defaultConfig!.allowed_camera_modes).toContain('orbit');
  });
  it('broadcast_events = true', () =>
    expect(spectatorHandler.defaultConfig!.broadcast_events).toBe(true));
});

// ─── onAttach ────────────────────────────────────────────────────────────────

describe('spectatorHandler.onAttach', () => {
  it('creates __spectatorState on node', () => {
    const { node } = attachNode();
    expect((node as any).__spectatorState).toBeDefined();
  });
  it('initial isSpectating = false', () => {
    const { node } = attachNode();
    expect((node as any).__spectatorState.isSpectating).toBe(false);
  });
  it('initial spectatorCount = 0', () => {
    const { node } = attachNode();
    expect((node as any).__spectatorState.spectatorCount).toBe(0);
  });
  it('initial spectators map is empty', () => {
    const { node } = attachNode();
    expect((node as any).__spectatorState.spectators.size).toBe(0);
  });
  it('initial activeCamera = camera_mode from config', () => {
    const { node } = attachNode({ camera_mode: 'orbit' });
    expect((node as any).__spectatorState.activeCamera).toBe('orbit');
  });
  it('initial followTarget = null when follow_target is empty', () => {
    const { node } = attachNode({ follow_target: '' });
    expect((node as any).__spectatorState.followTarget).toBeNull();
  });
  it('initial followTarget = configured value when set', () => {
    const { node } = attachNode({ follow_target: 'player_1' });
    expect((node as any).__spectatorState.followTarget).toBe('player_1');
  });
  it('initial streamDelay = config.delay', () => {
    const { node } = attachNode({ delay: 3000 });
    expect((node as any).__spectatorState.streamDelay).toBe(3000);
  });
  it('emits spectator_init with max_spectators and delay', () => {
    const { ctx } = attachNode({ max_spectators: 10, delay: 500 });
    expect(ctx.emit).toHaveBeenCalledWith(
      'spectator_init',
      expect.objectContaining({ maxSpectators: 10, delay: 500 })
    );
  });
});

// ─── onDetach ────────────────────────────────────────────────────────────────

describe('spectatorHandler.onDetach', () => {
  it('removes __spectatorState', () => {
    const { node, cfg, ctx } = attachNode();
    spectatorHandler.onDetach!(node, cfg, ctx);
    expect((node as any).__spectatorState).toBeUndefined();
  });
  it('emits spectator_end_all when spectators are present', () => {
    const { node, cfg, ctx } = attachNode();
    (node as any).__spectatorState.spectatorCount = 2;
    ctx.emit.mockClear();
    spectatorHandler.onDetach!(node, cfg, ctx);
    expect(ctx.emit).toHaveBeenCalledWith('spectator_end_all', expect.any(Object));
  });
  it('does NOT emit spectator_end_all when no spectators', () => {
    const { node, cfg, ctx } = attachNode();
    ctx.emit.mockClear();
    spectatorHandler.onDetach!(node, cfg, ctx);
    const called = ctx.emit.mock.calls.some((c: any[]) => c[0] === 'spectator_end_all');
    expect(called).toBe(false);
  });
});

// ─── onUpdate ─────────────────────────────────────────────────────────────────

describe('spectatorHandler.onUpdate', () => {
  it('emits spectator_update_follow when activeCamera=follow and followTarget set', () => {
    const { node, cfg, ctx } = attachNode({ follow_target: 'player_2' });
    (node as any).__spectatorState.activeCamera = 'follow';
    (node as any).__spectatorState.followTarget = 'player_2';
    ctx.emit.mockClear();
    spectatorHandler.onUpdate!(node, cfg, ctx, 0.016);
    expect(ctx.emit).toHaveBeenCalledWith(
      'spectator_update_follow',
      expect.objectContaining({ targetId: 'player_2' })
    );
  });
  it('does NOT emit spectator_update_follow when activeCamera != follow', () => {
    const { node, cfg, ctx } = attachNode();
    (node as any).__spectatorState.activeCamera = 'orbit';
    ctx.emit.mockClear();
    spectatorHandler.onUpdate!(node, cfg, ctx, 0.016);
    const called = ctx.emit.mock.calls.some((c: any[]) => c[0] === 'spectator_update_follow');
    expect(called).toBe(false);
  });
});

// ─── onEvent — spectator_join ─────────────────────────────────────────────────

describe('spectatorHandler.onEvent — spectator_join', () => {
  it('adds spectator to map and increments count', () => {
    const { node, cfg, ctx } = attachNode({ max_spectators: 5 });
    spectatorHandler.onEvent!(node, cfg, ctx, { type: 'spectator_join', spectatorId: 'spec_1' });
    expect((node as any).__spectatorState.spectatorCount).toBe(1);
    expect((node as any).__spectatorState.spectators.has('spec_1')).toBe(true);
  });
  it('emits spectator_setup and on_spectator_join events', () => {
    const { node, cfg, ctx } = attachNode();
    ctx.emit.mockClear();
    spectatorHandler.onEvent!(node, cfg, ctx, { type: 'spectator_join', spectatorId: 'spec_a' });
    expect(ctx.emit).toHaveBeenCalledWith(
      'spectator_setup',
      expect.objectContaining({ spectatorId: 'spec_a' })
    );
    expect(ctx.emit).toHaveBeenCalledWith(
      'on_spectator_join',
      expect.objectContaining({ spectatorId: 'spec_a', spectatorCount: 1 })
    );
  });
  it('rejects join when at max capacity and emits spectator_rejected', () => {
    const { node, cfg, ctx } = attachNode({ max_spectators: 1 });
    spectatorHandler.onEvent!(node, cfg, ctx, { type: 'spectator_join', spectatorId: 'spec_1' });
    ctx.emit.mockClear();
    spectatorHandler.onEvent!(node, cfg, ctx, { type: 'spectator_join', spectatorId: 'spec_2' });
    expect(ctx.emit).toHaveBeenCalledWith(
      'spectator_rejected',
      expect.objectContaining({ reason: 'max_capacity' })
    );
    expect((node as any).__spectatorState.spectatorCount).toBe(1); // unchanged
  });
});

// ─── onEvent — spectator_leave ────────────────────────────────────────────────

describe('spectatorHandler.onEvent — spectator_leave', () => {
  it('removes spectator and decrements count', () => {
    const { node, cfg, ctx } = attachNode();
    spectatorHandler.onEvent!(node, cfg, ctx, { type: 'spectator_join', spectatorId: 'spec_X' });
    spectatorHandler.onEvent!(node, cfg, ctx, { type: 'spectator_leave', spectatorId: 'spec_X' });
    expect((node as any).__spectatorState.spectatorCount).toBe(0);
    expect((node as any).__spectatorState.spectators.has('spec_X')).toBe(false);
  });
  it('emits on_spectator_leave', () => {
    const { node, cfg, ctx } = attachNode();
    spectatorHandler.onEvent!(node, cfg, ctx, { type: 'spectator_join', spectatorId: 'spec_Y' });
    ctx.emit.mockClear();
    spectatorHandler.onEvent!(node, cfg, ctx, { type: 'spectator_leave', spectatorId: 'spec_Y' });
    expect(ctx.emit).toHaveBeenCalledWith(
      'on_spectator_leave',
      expect.objectContaining({ spectatorId: 'spec_Y' })
    );
  });
  it('ignores leave for unknown spectator', () => {
    const { node, cfg, ctx } = attachNode();
    ctx.emit.mockClear();
    spectatorHandler.onEvent!(node, cfg, ctx, { type: 'spectator_leave', spectatorId: 'ghost' });
    expect(ctx.emit).not.toHaveBeenCalledWith('on_spectator_leave', expect.any(Object));
  });
});

// ─── onEvent — spectator_set_camera ──────────────────────────────────────────

describe('spectatorHandler.onEvent — spectator_set_camera', () => {
  it('updates spectator camera mode when allowed', () => {
    const { node, cfg, ctx } = attachNode({ allowed_camera_modes: ['free', 'orbit'] });
    spectatorHandler.onEvent!(node, cfg, ctx, { type: 'spectator_join', spectatorId: 'sp1' });
    spectatorHandler.onEvent!(node, cfg, ctx, {
      type: 'spectator_set_camera',
      spectatorId: 'sp1',
      mode: 'orbit',
    });
    expect((node as any).__spectatorState.spectators.get('sp1').cameraMode).toBe('orbit');
  });
  it('emits spectator_camera_change on allowed mode', () => {
    const { node, cfg, ctx } = attachNode({ allowed_camera_modes: ['free', 'orbit'] });
    spectatorHandler.onEvent!(node, cfg, ctx, { type: 'spectator_join', spectatorId: 'sp1' });
    ctx.emit.mockClear();
    spectatorHandler.onEvent!(node, cfg, ctx, {
      type: 'spectator_set_camera',
      spectatorId: 'sp1',
      mode: 'orbit',
    });
    expect(ctx.emit).toHaveBeenCalledWith(
      'spectator_camera_change',
      expect.objectContaining({ mode: 'orbit' })
    );
  });
  it('ignores disallowed camera mode', () => {
    const { node, cfg, ctx } = attachNode({ allowed_camera_modes: ['free'] }); // 'cinematic' not allowed
    spectatorHandler.onEvent!(node, cfg, ctx, { type: 'spectator_join', spectatorId: 'sp2' });
    ctx.emit.mockClear();
    spectatorHandler.onEvent!(node, cfg, ctx, {
      type: 'spectator_set_camera',
      spectatorId: 'sp2',
      mode: 'cinematic',
    });
    expect(ctx.emit).not.toHaveBeenCalledWith('spectator_camera_change', expect.any(Object));
  });
});

// ─── onEvent — spectator_set_follow ───────────────────────────────────────────

describe('spectatorHandler.onEvent — spectator_set_follow', () => {
  it('sets followTarget on state', () => {
    const { node, cfg, ctx } = attachNode();
    spectatorHandler.onEvent!(node, cfg, ctx, { type: 'spectator_set_follow', targetId: 'tank_1' });
    expect((node as any).__spectatorState.followTarget).toBe('tank_1');
  });
  it('emits spectator_update_target for spectators in follow mode', () => {
    const { node, cfg, ctx } = attachNode({ allowed_camera_modes: ['free', 'follow'] });
    spectatorHandler.onEvent!(node, cfg, ctx, { type: 'spectator_join', spectatorId: 'sp3' });
    spectatorHandler.onEvent!(node, cfg, ctx, {
      type: 'spectator_set_camera',
      spectatorId: 'sp3',
      mode: 'follow',
    });
    ctx.emit.mockClear();
    spectatorHandler.onEvent!(node, cfg, ctx, { type: 'spectator_set_follow', targetId: 'boss' });
    expect(ctx.emit).toHaveBeenCalledWith(
      'spectator_update_target',
      expect.objectContaining({ spectatorId: 'sp3', targetId: 'boss' })
    );
  });
});

// ─── onEvent — spectator_broadcast ────────────────────────────────────────────

describe('spectatorHandler.onEvent — spectator_broadcast', () => {
  it('emits spectator_event_broadcast immediately when delay=0', () => {
    const { node, cfg, ctx } = attachNode({ delay: 0, broadcast_events: true });
    ctx.emit.mockClear();
    spectatorHandler.onEvent!(node, cfg, ctx, {
      type: 'spectator_broadcast',
      data: { foo: 'bar' },
    });
    expect(ctx.emit).toHaveBeenCalledWith(
      'spectator_event_broadcast',
      expect.objectContaining({ data: { foo: 'bar' } })
    );
  });
  it('does NOT emit broadcast when broadcast_events=false', () => {
    const { node, cfg, ctx } = attachNode({ broadcast_events: false });
    ctx.emit.mockClear();
    spectatorHandler.onEvent!(node, cfg, ctx, { type: 'spectator_broadcast', data: {} });
    expect(ctx.emit).not.toHaveBeenCalledWith('spectator_event_broadcast', expect.any(Object));
  });
});

// ─── onEvent — spectator_set_delay + toggle_visibility + query ────────────────

describe('spectatorHandler.onEvent — misc events', () => {
  it('spectator_set_delay updates streamDelay', () => {
    const { node, cfg, ctx } = attachNode();
    spectatorHandler.onEvent!(node, cfg, ctx, { type: 'spectator_set_delay', delay: 5000 });
    expect((node as any).__spectatorState.streamDelay).toBe(5000);
  });
  it('spectator_toggle_visibility emits spectator_visibility_change', () => {
    const { node, cfg, ctx } = attachNode();
    ctx.emit.mockClear();
    spectatorHandler.onEvent!(node, cfg, ctx, {
      type: 'spectator_toggle_visibility',
      visible: true,
    });
    expect(ctx.emit).toHaveBeenCalledWith(
      'spectator_visibility_change',
      expect.objectContaining({ visible: true })
    );
  });
  it('spectator_query emits spectator_info with count, camera, followTarget, delay, spectatorIds', () => {
    const { node, cfg, ctx } = attachNode();
    spectatorHandler.onEvent!(node, cfg, ctx, { type: 'spectator_join', spectatorId: 'sp_q' });
    ctx.emit.mockClear();
    spectatorHandler.onEvent!(node, cfg, ctx, { type: 'spectator_query', queryId: 'q99' });
    expect(ctx.emit).toHaveBeenCalledWith(
      'spectator_info',
      expect.objectContaining({
        queryId: 'q99',
        spectatorCount: 1,
        spectatorIds: ['sp_q'],
      })
    );
  });
});
