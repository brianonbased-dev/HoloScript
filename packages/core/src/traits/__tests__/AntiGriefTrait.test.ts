/**
 * AntiGriefTrait — comprehensive tests
 */
import { describe, it, expect, vi } from 'vitest';
import { antiGriefHandler } from '../AntiGriefTrait';

const makeNode = (id = 'zone-1') => ({
  id,
  traits: new Set<string>(),
  emit: vi.fn(),
  __antiGriefState: undefined as unknown,
});

const defaultConfig = {
  sensitivity: 0.5,
  shield_threshold: 0.7,
  window_seconds: 60,
  kill_threshold: 5,
  destruction_threshold: 10,
  shield_duration: 30,
  shield_color: '#32cd3230',
  auto_report: true,
};

const makeCtx = (node: ReturnType<typeof makeNode>) => ({
  emit: (type: string, data: unknown) => node.emit(type, data),
});

describe('AntiGriefTrait — metadata', () => {
  it('has name "anti_grief"', () => {
    expect(antiGriefHandler.name).toBe('anti_grief');
  });

  it('defaultConfig has expected keys', () => {
    const c = antiGriefHandler.defaultConfig!;
    expect(c.sensitivity).toBe(0.5);
    expect(c.shield_threshold).toBe(0.7);
    expect(c.window_seconds).toBe(60);
    expect(c.kill_threshold).toBe(5);
    expect(c.destruction_threshold).toBe(10);
    expect(c.shield_duration).toBe(30);
    expect(c.auto_report).toBe(true);
  });
});

describe('AntiGriefTrait — onAttach / onDetach', () => {
  it('onAttach initializes state and emits anti_grief_create', () => {
    const node = makeNode();
    antiGriefHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    const state = node.__antiGriefState as { active: boolean; players: Map<string, unknown>; shieldedPlayers: Map<string, number> };
    expect(state.active).toBe(true);
    expect(state.players).toBeInstanceOf(Map);
    expect(state.shieldedPlayers).toBeInstanceOf(Map);
    expect(node.emit).toHaveBeenCalledWith('anti_grief_create', expect.objectContaining({
      sensitivity: 0.5,
      shieldThreshold: 0.7,
      shieldColor: '#32cd3230',
    }));
  });

  it('onDetach clears state and emits anti_grief_destroy', () => {
    const node = makeNode();
    antiGriefHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    node.emit.mockClear();
    antiGriefHandler.onDetach!(node as never, defaultConfig, makeCtx(node) as never);
    expect(node.__antiGriefState).toBeUndefined();
    expect(node.emit).toHaveBeenCalledWith('anti_grief_destroy', { nodeId: 'zone-1' });
  });

  it('onDetach is safe to call twice', () => {
    const node = makeNode();
    antiGriefHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    antiGriefHandler.onDetach!(node as never, defaultConfig, makeCtx(node) as never);
    node.emit.mockClear();
    antiGriefHandler.onDetach!(node as never, defaultConfig, makeCtx(node) as never);
    expect(node.emit).not.toHaveBeenCalled();
  });
});

describe('AntiGriefTrait — onEvent', () => {
  it('player_kill records kill for killerId', () => {
    const node = makeNode();
    antiGriefHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    antiGriefHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'player_kill', killerId: 'p1',
    } as never);
    const state = node.__antiGriefState as { players: Map<string, { kills: number[] }> };
    expect(state.players.get('p1')!.kills).toHaveLength(1);
  });

  it('object_destroyed records destruction for destroyerId', () => {
    const node = makeNode();
    antiGriefHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    antiGriefHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'object_destroyed', destroyerId: 'p2',
    } as never);
    const state = node.__antiGriefState as { players: Map<string, { destructions: number[] }> };
    expect(state.players.get('p2')!.destructions).toHaveLength(1);
  });

  it('player_report records report for reportedId', () => {
    const node = makeNode();
    antiGriefHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    antiGriefHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'player_report', reportedId: 'p3',
    } as never);
    const state = node.__antiGriefState as { players: Map<string, { reports: number[] }> };
    expect(state.players.get('p3')!.reports).toHaveLength(1);
  });

  it('anti_grief_shield_player activates shield and emits', () => {
    const node = makeNode();
    antiGriefHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    node.emit.mockClear();
    antiGriefHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'anti_grief_shield_player', playerId: 'victim1',
    } as never);
    const state = node.__antiGriefState as { shieldedPlayers: Map<string, number> };
    expect(state.shieldedPlayers.has('victim1')).toBe(true);
    expect(node.emit).toHaveBeenCalledWith('anti_grief_shield_activated', expect.objectContaining({
      playerId: 'victim1',
      duration: 30,
      color: '#32cd3230',
    }));
  });

  it('anti_grief_reset clears all player and shield data', () => {
    const node = makeNode();
    antiGriefHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    antiGriefHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'player_kill', killerId: 'p1',
    } as never);
    antiGriefHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'anti_grief_reset',
    } as never);
    const state = node.__antiGriefState as { players: Map<string, unknown>; shieldedPlayers: Map<string, unknown> };
    expect(state.players.size).toBe(0);
    expect(state.shieldedPlayers.size).toBe(0);
  });
});

describe('AntiGriefTrait — onUpdate grief detection', () => {
  it('emits anti_grief_detected when grief score exceeds threshold', () => {
    const node = makeNode();
    // sensitivity=1 so score = (kills/kill_threshold + destructions/dest_threshold) * 1
    const cfg = { ...defaultConfig, sensitivity: 1, kill_threshold: 2, destruction_threshold: 10, shield_threshold: 0.5 };
    antiGriefHandler.onAttach!(node as never, cfg, makeCtx(node) as never);
    // Add 2 kills (ratio = 1.0), grief score >= 0.5 threshold
    for (let i = 0; i < 2; i++) {
      antiGriefHandler.onEvent!(node as never, cfg, makeCtx(node) as never, {
        type: 'player_kill', killerId: 'griefer',
      } as never);
    }
    node.emit.mockClear();
    antiGriefHandler.onUpdate!(node as never, cfg, makeCtx(node) as never, 0.016);
    expect(node.emit).toHaveBeenCalledWith('anti_grief_detected', expect.objectContaining({
      grieferId: 'griefer',
    }));
  });

  it('emits moderation_check when auto_report=true and grief detected', () => {
    const node = makeNode();
    const cfg = { ...defaultConfig, sensitivity: 1, kill_threshold: 1, destruction_threshold: 10, shield_threshold: 0.1, auto_report: true };
    antiGriefHandler.onAttach!(node as never, cfg, makeCtx(node) as never);
    antiGriefHandler.onEvent!(node as never, cfg, makeCtx(node) as never, {
      type: 'player_kill', killerId: 'badactor',
    } as never);
    node.emit.mockClear();
    antiGriefHandler.onUpdate!(node as never, cfg, makeCtx(node) as never, 0.016);
    expect(node.emit).toHaveBeenCalledWith('moderation_check', expect.objectContaining({
      userId: 'badactor',
    }));
  });
});
