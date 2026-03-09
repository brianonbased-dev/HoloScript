/**
 * Multiplayer NPC Scene Integration Tests
 *
 * Exercises four cooperating traits:
 *
 *   LobbyTrait ──► MultiAgentTrait ──► NPCAITrait ──► NetworkedTrait
 *
 * LobbyTrait API (class): addPlayer(), removePlayer(), startGame(), getPlayerCount(),
 *   getHost(), setReady(), getState(), getPlayer(), allPlayersReady(), on()
 * MultiAgentTrait API (handler): onAttach/onEvent/onUpdate, all via event types
 * NPCAITrait API (handler): npc_ai_prompt → async → npc_ai_response → npc_behavior_* + npc_action
 * NetworkedTrait API (class): setProperty, getProperty, flushUpdates, applyState, getEntityId
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mock SyncProtocol / Transports ───────────────────────────────────────────
vi.mock('../../network/SyncProtocol', () => {
  class SyncProtocol {
    connect = vi.fn().mockResolvedValue(undefined);
    isConnected = vi.fn().mockReturnValue(false);
    getClientId = vi.fn().mockReturnValue('client_npc');
    getLatency = vi.fn().mockReturnValue(15);
    on = vi.fn();
    syncState = vi.fn();
    requestOwnership = vi.fn();
    respondToOwnership = vi.fn();
  }
  return { SyncProtocol };
});
vi.mock('../../network/WebSocketTransport', () => {
  class WebSocketTransport {
    connect = vi.fn().mockRejectedValue(new Error());
    disconnect = vi.fn();
  }
  return { WebSocketTransport };
});
vi.mock('../../network/WebRTCTransport', () => {
  class WebRTCTransport {
    initialize = vi.fn().mockRejectedValue(new Error());
    disconnect = vi.fn();
  }
  return { WebRTCTransport };
});
vi.mock('../../logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

// Mock AI adapter: adapter.chat returns response with action tags
const _mockAdapter = {
  chat: vi.fn().mockResolvedValue({
    content: 'Ready. <action type="move" target="spawn_point" />',
    role: 'assistant',
  }),
};
vi.mock('../../ai/AIAdapter', () => ({
  getDefaultAIAdapter: vi.fn(() => _mockAdapter),
}));

import { LobbyTrait } from '../LobbyTrait';
import { multiAgentHandler } from '../MultiAgentTrait';
import { npcAIHandler } from '../NPCAITrait';
import { NetworkedTrait } from '../NetworkedTrait';

// ─── Helpers ──────────────────────────────────────────────────────────────────
function makeCtx(extra: any = {}) {
  return { emit: vi.fn(), setState: vi.fn(), getState: vi.fn().mockReturnValue({}), ...extra };
}

function spawnAgent(agentId: string, caps: string[] = [], cfg: any = {}) {
  const node = { id: agentId } as any;
  const config = {
    ...multiAgentHandler.defaultConfig,
    agent_id: agentId,
    agent_name: agentId,
    capabilities: caps,
    ...cfg,
  };
  const ctx = makeCtx();
  multiAgentHandler.onAttach!(node, config, ctx);
  return {
    node,
    config,
    ctx,
    state: () => node.__multiAgentState,
    event: (type: string, payload: any = {}) =>
      multiAgentHandler.onEvent!(node, config, ctx, { type, payload }),
    update: (delta = 16) => multiAgentHandler.onUpdate!(node, config, ctx, delta),
  };
}

function discover(a: ReturnType<typeof spawnAgent>, b: ReturnType<typeof spawnAgent>) {
  a.event('agent_discovered', {
    agentId: b.state().self.id,
    name: b.state().self.name,
    capabilities: b.state().self.capabilities,
  });
}

beforeEach(() => vi.clearAllMocks());

// ─── Scenario 1: LobbyTrait room lifecycle ────────────────────────────────────
describe('LobbyTrait — room lifecycle', () => {
  it('accepts 2 players (getPlayerCount)', () => {
    const lobby = new LobbyTrait({ maxPlayers: 4, minPlayers: 2 });
    lobby.addPlayer({ id: 'p1', name: 'Alice' });
    lobby.addPlayer({ id: 'p2', name: 'Bob' });
    expect(lobby.getPlayerCount()).toBe(2);
  });

  it('first player to join becomes host', () => {
    const lobby = new LobbyTrait({ maxPlayers: 4, minPlayers: 1 });
    lobby.addPlayer({ id: 'p1', name: 'First' });
    lobby.addPlayer({ id: 'p2', name: 'Second' });
    expect(lobby.getHost()?.id).toBe('p1');
  });

  it('emits player-joined event for each addPlayer', () => {
    const lobby = new LobbyTrait({ maxPlayers: 4, minPlayers: 1 });
    const events: string[] = [];
    lobby.on('player-joined', (e) => events.push(e.playerId!));
    lobby.addPlayer({ id: 'p1', name: 'Alice' });
    lobby.addPlayer({ id: 'p2', name: 'Bob' });
    expect(events).toEqual(['p1', 'p2']);
  });

  it('player can ready up via setReady', () => {
    const lobby = new LobbyTrait({ maxPlayers: 4, minPlayers: 2 });
    lobby.addPlayer({ id: 'p1', name: 'Alice' });
    lobby.setReady('p1', true);
    expect(lobby.getPlayer('p1')?.isReady).toBe(true);
  });

  it('lobby state → in-progress after startGame()', () => {
    const lobby = new LobbyTrait({ maxPlayers: 4, minPlayers: 1 });
    lobby.addPlayer({ id: 'p1', name: 'Alice' });
    lobby.startGame();
    expect(lobby.getState()).toBe('in-progress');
  });

  it('late player cannot join when in-progress without allowMidGameJoin', () => {
    const lobby = new LobbyTrait({ maxPlayers: 4, minPlayers: 1, allowMidGameJoin: false });
    lobby.addPlayer({ id: 'p1', name: 'Host' });
    lobby.startGame();
    const joined = lobby.addPlayer({ id: 'late', name: 'Late' });
    expect(joined).toBe(false);
  });

  it('allPlayersReady returns false when some not ready', () => {
    const lobby = new LobbyTrait({ maxPlayers: 4, minPlayers: 2 });
    lobby.addPlayer({ id: 'p1', name: 'A' });
    lobby.addPlayer({ id: 'p2', name: 'B' });
    lobby.setReady('p1', true);
    expect(lobby.allPlayersReady()).toBe(false);
  });

  it('allPlayersReady returns true when all ready', () => {
    const lobby = new LobbyTrait({ maxPlayers: 4, minPlayers: 2 });
    lobby.addPlayer({ id: 'p1', name: 'A' });
    lobby.addPlayer({ id: 'p2', name: 'B' });
    lobby.setReady('p1', true);
    lobby.setReady('p2', true);
    expect(lobby.allPlayersReady()).toBe(true);
  });
});

// ─── Scenario 2: NPC agent registration ───────────────────────────────────────
describe('MultiAgentTrait — NPC registration', () => {
  it('two NPC agents discover each other', () => {
    const npc1 = spawnAgent('npc_1', ['combat', 'patrol']);
    const npc2 = spawnAgent('npc_2', ['merchant', 'dialogue']);
    discover(npc1, npc2);
    expect(npc1.state().registry.size).toBe(2);
    expect(npc1.state().registry.has('npc_2')).toBe(true);
  });

  it('capability filter finds correct NPC', () => {
    const coord = spawnAgent('coord', ['management']);
    const combat = spawnAgent('npc_combat', ['combat', 'patrol']);
    const merchant = spawnAgent('npc_merchant', ['merchant']);
    discover(coord, combat);
    discover(coord, merchant);
    coord.ctx.emit.mockClear();

    coord.event('discover_agents', { capability: 'combat' });
    const call = coord.ctx.emit.mock.calls.find(
      ([ev]: any) => ev === 'multi_agent_discovery_result'
    );
    expect(call![1].agents).toHaveLength(1);
    expect(call![1].agents[0].id).toBe('npc_combat');
  });

  it('departed NPC removed from registry', () => {
    const coord = spawnAgent('coord2', ['management']);
    const npc = spawnAgent('gone_npc', ['combat']);
    discover(coord, npc);
    expect(coord.state().registry.size).toBe(2);
    coord.event('agent_departed', { agentId: 'gone_npc' });
    expect(coord.state().registry.size).toBe(1);
  });
});

// ─── Scenario 3: NPCAITrait AI prompt → behavior emit ─────────────────────────
describe('NPCAITrait — AI prompt → behavior emit', () => {
  it('npc_ai_prompt sets isThinking and emits think_begin (sync)', () => {
    const npcNode = { id: 'npc_ai_1' } as any;
    const npcCtx = makeCtx();
    const npcConfig = { ...npcAIHandler.defaultConfig, systemPrompt: 'You are a guard.' };
    npcAIHandler.onAttach!(npcNode, npcConfig, npcCtx as any);

    npcAIHandler.onEvent!(npcNode, npcConfig, npcCtx as any, {
      type: 'npc_ai_prompt',
      prompt: 'Player approaches',
    });

    // Synchronous effect: isThinking set, think_begin emitted
    expect(npcNode.__npcAIState.isThinking).toBe(true);
    expect(npcCtx.emit).toHaveBeenCalledWith('npc_ai_think_begin', expect.any(Object));
    npcAIHandler.onDetach!(npcNode, npcConfig, npcCtx as any);
  });

  it('npc_ai_response directly triggers npc_action with type field', () => {
    const npcNode = { id: 'npc_ai_2' } as any;
    const npcCtx = makeCtx();
    const npcConfig = { ...npcAIHandler.defaultConfig };
    npcAIHandler.onAttach!(npcNode, npcConfig, npcCtx as any);

    // Inject response directly — same code path as async adapter, but synchronous
    npcAIHandler.onEvent!(npcNode, npcConfig, npcCtx as any, {
      type: 'npc_ai_response',
      text: 'On my way. <action type="patrol" zone="west" />',
    });

    expect(npcCtx.emit).toHaveBeenCalledWith(
      'npc_action',
      expect.objectContaining({ type: 'patrol' })
    );
    npcAIHandler.onDetach!(npcNode, npcConfig, npcCtx as any);
  });

  it('npc_ai_response event directly triggers behavior parsing', () => {
    const npcNode = { id: 'npc_ai_3' } as any;
    const npcCtx = makeCtx();
    const npcConfig = { ...npcAIHandler.defaultConfig };
    npcAIHandler.onAttach!(npcNode, npcConfig, npcCtx as any);

    // Directly inject response event (simulates adapter returning)
    npcAIHandler.onEvent!(npcNode, npcConfig, npcCtx as any, {
      type: 'npc_ai_response',
      text: 'Attack! <action type="attack" target="enemy_1" />',
    });

    expect(npcCtx.emit).toHaveBeenCalledWith(
      'npc_behavior_attack',
      expect.objectContaining({ params: expect.objectContaining({ target: 'enemy_1' }) })
    );
    expect(npcCtx.emit).toHaveBeenCalledWith(
      'npc_action',
      expect.objectContaining({ type: 'attack' })
    );
    npcAIHandler.onDetach!(npcNode, npcConfig, npcCtx as any);
  });
});

// ─── Scenario 4: Multi-NPC task delegation ────────────────────────────────────
describe('MultiAgentTrait — task delegation', () => {
  it('coordinator delegates task to capable NPC', () => {
    const coord = spawnAgent('coord', ['management']);
    const npc = spawnAgent('npc_guard', ['combat', 'patrol']);
    discover(coord, npc);
    coord.event('delegate_task', {
      requiredCapabilities: ['patrol'],
      description: 'Patrol east wing',
    });
    const task = coord.state().delegatedTasks[0];
    expect(task.assigneeId).toBe('npc_guard');
    expect(task.status).toBe('assigned');
  });

  it('NPC accepts task and marks itself busy', () => {
    const npc = spawnAgent('npc_busy', ['combat']);
    npc.state().assignedTasks.push({
      id: 'task_guard',
      delegatorId: 'coord',
      assigneeId: 'npc_busy',
      description: 'Guard door',
      requiredCapabilities: [],
      status: 'assigned',
      priority: 'normal',
      payload: {},
      result: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      deadline: 0,
      retryCount: 0,
      maxRetries: 3,
    });
    npc.event('accept_task', { taskId: 'task_guard' });
    expect(npc.state().self.status).toBe('busy');
    expect(npc.state().assignedTasks[0].status).toBe('in_progress');
  });

  it('NPC completes task and returns to active', () => {
    const npc = spawnAgent('npc_done', ['combat']);
    npc.state().assignedTasks.push({
      id: 'task_2',
      delegatorId: 'coord',
      assigneeId: 'npc_done',
      description: 'Work',
      requiredCapabilities: [],
      status: 'in_progress',
      priority: 'normal',
      payload: {},
      result: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      deadline: 0,
      retryCount: 0,
      maxRetries: 3,
    });
    npc.state().self.status = 'busy';
    npc.event('complete_task', { taskId: 'task_2', result: { success: true } });
    expect(npc.state().self.status).toBe('active');
  });

  it('offline NPC excluded from capability-based assignment', () => {
    const coord = spawnAgent('coord3', ['management']);
    const npc = spawnAgent('npc_offline', ['combat']);
    discover(coord, npc);
    coord.state().registry.get('npc_offline').status = 'offline';
    coord.event('delegate_task', { requiredCapabilities: ['combat'], description: 'Fight boss' });
    const task = coord.state().delegatedTasks[0];
    expect(task.status).toBe('pending');
    expect(task.assigneeId).toBeNull();
  });
});

// ─── Scenario 5: Shared state across agents ───────────────────────────────────
describe('MultiAgentTrait — shared state sync', () => {
  it('agent writes score, sync propagates to other agent', () => {
    const npc1 = spawnAgent('npc_a', ['combat']);
    const npc2 = spawnAgent('npc_b', ['support']);

    npc1.event('set_shared_state', { key: 'score', value: 1500 });

    const entries = Array.from(npc1.state().sharedState.entries()).map(([k, v]: any) => ({
      key: k,
      value: v.value,
      writer: v.lastWriter,
      version: v.version,
    }));
    npc2.event('sync_shared_state', { entries });

    npc2.ctx.emit.mockClear();
    npc2.event('get_shared_state', { key: 'score' });
    expect(npc2.ctx.emit).toHaveBeenCalledWith(
      'multi_agent_shared_state_response',
      expect.objectContaining({ key: 'score', value: 1500 })
    );
  });

  it('last-write-wins: higher version overwrites lower', () => {
    const npc1 = spawnAgent('n1', []);
    npc1.event('set_shared_state', { key: 'phase', value: 'wave_1' });
    npc1.event('sync_shared_state', {
      entries: [{ key: 'phase', value: 'wave_2', writer: 'n2', version: 2 }],
    });
    npc1.ctx.emit.mockClear();
    npc1.event('get_shared_state', { key: 'phase' });
    expect(npc1.ctx.emit).toHaveBeenCalledWith(
      'multi_agent_shared_state_response',
      expect.objectContaining({ value: 'wave_2', version: 2 })
    );
  });
});

// ─── Scenario 6: NetworkedTrait NPC sync ──────────────────────────────────────
describe('NetworkedTrait — NPC property sync', () => {
  it('tracks health and position', () => {
    const npcNet = new NetworkedTrait({ mode: 'owner', syncRate: 20 });
    npcNet.setProperty('health', 100);
    npcNet.setProperty('position', [10, 0, 5]);
    expect(npcNet.getProperty('health')).toBe(100);
    expect(npcNet.getProperty('position')).toEqual([10, 0, 5]);
  });

  it('flushUpdates returns diff and clears buffer', () => {
    const npcNet = new NetworkedTrait({ mode: 'owner', syncRate: 20 });
    npcNet.setProperty('health', 75);
    const updates = npcNet.flushUpdates();
    expect(updates.health).toBe(75);
    expect(Object.keys(npcNet.flushUpdates()).length).toBe(0);
  });

  it('observer receives NPC state via applyState', () => {
    const observer = new NetworkedTrait({ mode: 'shared', syncRate: 20, interpolation: false });
    observer.applyState({ npcId: 'guard_1', health: 80, action: 'patrol' });
    expect(observer.getProperty('health')).toBe(80);
    expect(observer.getProperty('action')).toBe('patrol');
  });

  it('multiple NPC instances have distinct entityIds', () => {
    const ids = new Set([
      new NetworkedTrait({ mode: 'owner' }).getEntityId(),
      new NetworkedTrait({ mode: 'owner' }).getEntityId(),
      new NetworkedTrait({ mode: 'owner' }).getEntityId(),
    ]);
    expect(ids.size).toBe(3);
  });
});

// ─── Scenario 7: Full round-trip ──────────────────────────────────────────────
describe('Multiplayer NPC Scene — full round-trip', () => {
  it('lobby starts → agents discover → task delegated → state synced → net property set', () => {
    // 1. Lobby — two players join, game starts
    const lobby = new LobbyTrait({ maxPlayers: 4, minPlayers: 2 });
    lobby.addPlayer({ id: 'human_1', name: 'Alice' });
    lobby.addPlayer({ id: 'npc_guard', name: 'GuardBot' });
    lobby.startGame();
    expect(lobby.getState()).toBe('in-progress');

    // 2. MultiAgent — NPC agents discover each other
    const coord = spawnAgent('coordinator', ['management']);
    const npc = spawnAgent('npc_guard', ['combat', 'patrol']);
    discover(coord, npc);
    expect(coord.state().registry.size).toBe(2);

    // 3. Delegate patrol
    coord.event('delegate_task', {
      requiredCapabilities: ['patrol'],
      description: 'Patrol west wing',
    });
    expect(coord.state().delegatedTasks[0].assigneeId).toBe('npc_guard');

    // 4. Shared state: game phase
    coord.event('set_shared_state', { key: 'gamePhase', value: 'round_1' });
    const entries = Array.from(coord.state().sharedState.entries()).map(([k, v]: any) => ({
      key: k,
      value: v.value,
      writer: v.lastWriter,
      version: v.version,
    }));
    npc.event('sync_shared_state', { entries });
    npc.ctx.emit.mockClear();
    npc.event('get_shared_state', { key: 'gamePhase' });
    expect(npc.ctx.emit).toHaveBeenCalledWith(
      'multi_agent_shared_state_response',
      expect.objectContaining({ value: 'round_1' })
    );

    // 5. NetworkedTrait — NPC syncs new position
    const npcNet = new NetworkedTrait({ mode: 'owner', syncRate: 30 });
    npcNet.setProperty('position', [15, 0, 3]);
    npcNet.setProperty('status', 'patrolling');
    const pending = npcNet.flushUpdates();
    expect(pending.position).toEqual([15, 0, 3]);
    expect(pending.status).toBe('patrolling');
  });

  it('NPC goes offline → coordinator marks it → task auto-assign fails → pending', () => {
    const coord = spawnAgent('coord_x', ['management'], {
      heartbeat_interval: 100,
      offline_threshold: 2,
    });
    const npc = spawnAgent('npc_gone', ['combat']);
    discover(coord, npc);

    coord.state().registry.get('npc_gone').lastHeartbeat = Date.now() - 300;
    coord.update(100);

    expect(coord.state().registry.get('npc_gone').status).toBe('offline');

    coord.event('delegate_task', { requiredCapabilities: ['combat'], description: 'Fight' });
    expect(coord.state().delegatedTasks[0].status).toBe('pending');
  });

  it('direct npc_ai_response with multiple action tags fires all behaviors', () => {
    const npcNode = { id: 'npc_multi' } as any;
    const npcCtx = makeCtx();
    const npcConfig = { ...npcAIHandler.defaultConfig };
    npcAIHandler.onAttach!(npcNode, npcConfig, npcCtx as any);

    npcAIHandler.onEvent!(npcNode, npcConfig, npcCtx as any, {
      type: 'npc_ai_response',
      text: '<action type="move" target="gate" /> <action type="speak" line="Halt!" />',
    });

    const emittedTypes = npcCtx.emit.mock.calls
      .filter(([ev]: any) => ev.startsWith('npc_behavior_'))
      .map(([ev]: any) => ev);
    expect(emittedTypes).toContain('npc_behavior_move');
    expect(emittedTypes).toContain('npc_behavior_speak');
    npcAIHandler.onDetach!(npcNode, npcConfig, npcCtx as any);
  });
});
