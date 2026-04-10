/**
 * ConsensusTrait — Production Test Suite
 *
 * ConsensusTrait is a class (EventEmitter) that wraps either:
 * - ConsensusManager (simple_majority / all mechanisms except raft)
 * - RaftConsensus (when mechanism='raft')
 *
 * We mock both via vi.mock to avoid real networking.
 *
 * Key behaviours:
 * 1. constructor — defaults mechanism=simple_majority, timeout=5000;
 *                  getNodeId() returns config.nodeId ?? entityId
 *                  getMechanism() returns configured mechanism
 *                  isRunning() = false before start()
 * 2. start() (simple_majority path)
 *    - creates ConsensusManager with nodeId
 *    - adds initialNodes if provided
 *    - calls manager.start()
 *    - emits 'started'
 *    - isRunning() = true
 *    - idempotent (second start() no-op)
 * 3. stop()
 *    - calls manager.stop()
 *    - emits 'stopped'
 *    - isRunning() = false
 *    - idempotent (second stop() no-op)
 * 4. propose / get / getState / isLeader / getLeader / getNodes
 *    - returns false / undefined / empty Map / false / null / []
 *      when not started (no manager/raft)
 * 5. propose() delegates to manager.propose()
 * 6. proposeWithResult() returns error object when not started
 * 7. get() delegates to manager.get()
 * 8. subscribe() via manager path
 * 9. addNode / removeNode delegate
 * 10. start() (raft path) — creates RaftConsensus, calls raft.start()
 * 11. event forwarding: manager events re-emitted on trait
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Shared mock state (populated below by vi.mock factories) ─────────────────

// We use module-level vars that are reassigned in beforeEach.
// The mock factories themselves create objects; we capture them via module-level refs.
let _mockManagerInstance: ReturnType<typeof makeMockManager>;
let _mockRaftInstance: ReturnType<typeof makeMockRaft>;

function makeMockManager() {
  return {
    propose: vi.fn().mockReturnValue(true),
    proposeWithResult: vi.fn().mockResolvedValue({
      accepted: true,
      proposalId: 'p1',
      key: 'k',
      votes: { for: 1, against: 0, total: 1 },
    }),
    get: vi.fn().mockReturnValue(42),
    getState: vi.fn().mockReturnValue(new Map([['x', 99]])),
    isLeader: vi.fn().mockReturnValue(true),
    getLeader: vi.fn().mockReturnValue({ id: 'n1', address: 'localhost', port: 3001 }),
    getNodes: vi.fn().mockReturnValue([]),
    addNode: vi.fn(),
    removeNode: vi.fn(),
    handleMessage: vi.fn(),
    subscribe: vi.fn().mockReturnValue(() => {}),
    start: vi.fn(),
    stop: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    emit: vi.fn(),
  };
}

function makeMockRaft() {
  return {
    propose: vi.fn().mockResolvedValue({
      accepted: true,
      proposalId: 'p1',
      key: 'k',
      votes: { for: 1, against: 0, total: 1 },
    }),
    get: vi.fn().mockReturnValue('raftval'),
    getState: vi.fn().mockReturnValue(new Map()),
    isLeader: vi.fn().mockReturnValue(false),
    getLeaderId: vi.fn().mockReturnValue(null),
    getNodes: vi.fn().mockReturnValue([]),
    addNode: vi.fn(),
    removeNode: vi.fn(),
    handleMessage: vi.fn(),
    setMessageSender: vi.fn(),
    getDebugState: vi.fn().mockReturnValue({ role: 'follower' }),
    start: vi.fn(),
    stop: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    emit: vi.fn(),
  };
}

// ─── Mock consensus backends ──────────────────────────────────────────────────
// Must use class or function (not arrow) as mock constructor, per vitest requirements.

vi.mock('../../consensus/ConsensusManager', () => {
  function ConsensusManager() {
    _mockManagerInstance = makeMockManager();
    return _mockManagerInstance;
  }
  return { ConsensusManager };
});

vi.mock('../../consensus/RaftConsensus', () => {
  function RaftConsensus() {
    _mockRaftInstance = makeMockRaft();
    return _mockRaftInstance;
  }
  return { RaftConsensus };
});

vi.mock('../../consensus/ConsensusTypes', () => ({
  // types only — no runtime values needed
}));

import { ConsensusTrait, createConsensusTrait } from '../ConsensusTrait';

// ─── helpers ─────────────────────────────────────────────────────────────────

function makeTrait(
  entityId = 'entity_1',
  cfg: ConstructorParameters<typeof ConsensusTrait>[1] = {}
) {
  return new ConsensusTrait(entityId, cfg);
}

// Each start() creates a fresh manager instance; grab it after start()
function startTrait(t: ConsensusTrait) {
  t.start();
  return _mockManagerInstance;
}

function startRaftTrait(t: ConsensusTrait) {
  t.start();
  return _mockRaftInstance;
}

beforeEach(() => {
  // Reset refs — fresh instances created by each new makeTrait().start()
  _mockManagerInstance = undefined as any;
  _mockRaftInstance = undefined as any;
});

// ─── constructor / getters ────────────────────────────────────────────────────

describe('ConsensusTrait constructor', () => {
  it('getMechanism() defaults to simple_majority', () => {
    expect(makeTrait().getMechanism()).toBe('simple_majority');
  });

  it('getMechanism() returns configured mechanism', () => {
    expect(makeTrait('e', { mechanism: 'raft' as any }).getMechanism()).toBe('raft');
  });

  it('getNodeId() returns nodeId when provided', () => {
    expect(makeTrait('e', { nodeId: 'custom_node' }).getNodeId()).toBe('custom_node');
  });

  it('getNodeId() falls back to entityId when nodeId absent', () => {
    expect(makeTrait('entity_xyz').getNodeId()).toBe('entity_xyz');
  });

  it('isRunning() = false before start()', () => {
    expect(makeTrait().isRunning()).toBe(false);
  });
});

// ─── pre-start guards ─────────────────────────────────────────────────────────

describe('ConsensusTrait — pre-start guards', () => {
  it('propose() returns false when not started', async () => {
    expect(await makeTrait().propose('k', 'v')).toBe(false);
  });

  it('proposeWithResult() returns error result when not started', async () => {
    const result = await makeTrait().proposeWithResult('k', 'v');
    expect(result.accepted).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('get() returns undefined when not started', () => {
    expect(makeTrait().get('k')).toBeUndefined();
  });

  it('getState() returns empty Map when not started', () => {
    expect(makeTrait().getState().size).toBe(0);
  });

  it('isLeader() returns false when not started', () => {
    expect(makeTrait().isLeader()).toBe(false);
  });

  it('getLeader() returns null when not started', () => {
    expect(makeTrait().getLeader()).toBeNull();
  });

  it('getNodes() returns [] when not started', () => {
    expect(makeTrait().getNodes()).toEqual([]);
  });
});

// ─── start() — simple_majority path ───────────────────────────────────────────

describe('ConsensusTrait.start() — simple_majority', () => {
  it('isRunning() = true after start()', () => {
    const t = makeTrait('e', { mechanism: 'simple_majority' });
    t.start();
    expect(t.isRunning()).toBe(true);
    t.stop();
  });

  it('emits "started"', () => {
    const t = makeTrait();
    const cb = vi.fn();
    t.on('started', cb);
    t.start();
    expect(cb).toHaveBeenCalled();
    t.stop();
  });

  it('calls manager.start()', () => {
    const t = makeTrait();
    const m = startTrait(t);
    expect(m.start).toHaveBeenCalled();
    t.stop();
  });

  it('is idempotent — second start() is no-op', () => {
    const t = makeTrait();
    const m = startTrait(t);
    t.start(); // second call — no-op
    expect(m.start).toHaveBeenCalledTimes(1);
    t.stop();
  });

  it('adds initialNodes to manager', () => {
    const node = { id: 'n1', address: 'localhost', port: 3001 };
    const t = makeTrait('e', { initialNodes: [node] });
    const m = startTrait(t);
    expect(m.addNode).toHaveBeenCalledWith(node);
    t.stop();
  });
});

// ─── stop() ───────────────────────────────────────────────────────────────────

describe('ConsensusTrait.stop()', () => {
  it('emits "stopped"', () => {
    const t = makeTrait();
    const cb = vi.fn();
    t.on('stopped', cb);
    t.start();
    t.stop();
    expect(cb).toHaveBeenCalled();
  });

  it('isRunning() = false after stop()', () => {
    const t = makeTrait();
    t.start();
    t.stop();
    expect(t.isRunning()).toBe(false);
  });

  it('calls manager.stop()', () => {
    const t = makeTrait();
    const m = startTrait(t);
    t.stop();
    expect(m.stop).toHaveBeenCalled();
  });

  it('is idempotent — stop() when not started is no-op', () => {
    const t = makeTrait();
    // no start() — _mockManagerInstance stays undefined
    expect(() => t.stop()).not.toThrow();
    expect(_mockManagerInstance).toBeUndefined();
  });
});

// ─── propose / get / getState delegation ──────────────────────────────────────

describe('ConsensusTrait consensus operations (simple_majority)', () => {
  it('propose() delegates to manager.propose() and returns result', async () => {
    const t = makeTrait();
    const m = startTrait(t);
    const result = await t.propose('myKey', 'myValue');
    expect(m.propose).toHaveBeenCalledWith('myKey', 'myValue');
    expect(result).toBe(true);
    t.stop();
  });

  it('get() delegates to manager.get()', () => {
    const t = makeTrait();
    const m = startTrait(t);
    const val = t.get<number>('myKey');
    expect(m.get).toHaveBeenCalledWith('myKey');
    expect(val).toBe(42);
    t.stop();
  });

  it('getState() delegates to manager.getState()', () => {
    const t = makeTrait();
    const m = startTrait(t);
    const state = t.getState();
    expect(m.getState).toHaveBeenCalled();
    expect(state.get('x')).toBe(99);
    t.stop();
  });

  it('isLeader() delegates to manager.isLeader()', () => {
    const t = makeTrait();
    startTrait(t);
    expect(t.isLeader()).toBe(true);
    t.stop();
  });

  it('getLeader() delegates to manager.getLeader()', () => {
    const t = makeTrait();
    startTrait(t);
    const leader = t.getLeader();
    expect(leader).toEqual({ id: 'n1', address: 'localhost', port: 3001 });
    t.stop();
  });

  it('getNodes() delegates to manager.getNodes()', () => {
    const t = makeTrait();
    const m = startTrait(t);
    t.getNodes();
    expect(m.getNodes).toHaveBeenCalled();
    t.stop();
  });

  it('addNode() delegates to manager.addNode()', () => {
    const t = makeTrait();
    const node = { id: 'n2', address: 'host2', port: 3002 };
    const m = startTrait(t);
    t.addNode(node);
    expect(m.addNode).toHaveBeenCalledWith(node);
    t.stop();
  });

  it('removeNode() delegates to manager.removeNode()', () => {
    const t = makeTrait();
    const m = startTrait(t);
    t.removeNode('n1');
    expect(m.removeNode).toHaveBeenCalledWith('n1');
    t.stop();
  });

  it('subscribe() delegates to manager.subscribe()', () => {
    const t = makeTrait();
    const m = startTrait(t);
    const cb = vi.fn();
    t.subscribe('myKey', cb);
    expect(m.subscribe).toHaveBeenCalledWith('myKey', expect.any(Function));
    t.stop();
  });
});

// ─── Raft path ────────────────────────────────────────────────────────────────

describe('ConsensusTrait.start() — raft path', () => {
  it('calls raft.start()', () => {
    const t = makeTrait('e', { mechanism: 'raft' as any });
    const r = startRaftTrait(t);
    expect(r.start).toHaveBeenCalled();
    t.stop();
  });

  it('sets messageSender on raft when provided', () => {
    const sender = vi.fn();
    const t = makeTrait('e', { mechanism: 'raft', messageSender: sender });
    const r = startRaftTrait(t);
    expect(r.setMessageSender).toHaveBeenCalledWith(sender);
    t.stop();
  });

  it('isLeader() delegates to raft.isLeader()', () => {
    const t = makeTrait('e', { mechanism: 'raft' as any });
    startRaftTrait(t);
    expect(t.isLeader()).toBe(false);
    t.stop();
  });

  it('getDebugState() returns raft debug info', () => {
    const t = makeTrait('e', { mechanism: 'raft' as any });
    startRaftTrait(t);
    expect(t.getDebugState()).toEqual({ role: 'follower' });
    t.stop();
  });

  it('getDebugState() returns null when using manager', () => {
    const t = makeTrait();
    startTrait(t);
    expect(t.getDebugState()).toBeNull();
    t.stop();
  });
});

// ─── factory ──────────────────────────────────────────────────────────────────

describe('createConsensusTrait', () => {
  it('returns ConsensusTrait instance', () => {
    expect(createConsensusTrait('e')).toBeInstanceOf(ConsensusTrait);
  });

  it('passes config entityId', () => {
    const t = createConsensusTrait('my_entity', { nodeId: 'custom' });
    expect(t.getNodeId()).toBe('custom');
  });
});
