/**
 * NegotiationTrait — Production Test Suite
 *
 * Dependencies mocked:
 * - NegotiationProtocol / getNegotiationProtocol — singleton protocol instance
 * - getTrustWeight — returns a fixed weight
 * - AgentManifest — type-only import, no mock needed
 * - logger (via negotiation protocol, none in trait itself)
 *
 * Key behaviours:
 * 1. defaultConfig — 9 fields
 * 2. onAttach — creates __negotiation_state; derives agentId (from config.agent_id or node.id)
 *   - sets role; subscribes to protocol events (sessionStarted, proposalSubmitted, sessionResolved)
 * 3. onDetach — calls all unsubscribers; clears __negotiation_state
 * 4. Protocol event 'sessionStarted' — adds session to activeSessions if agent is participant; adds eventHistory entry
 * 5. Protocol event 'proposalSubmitted' — updates activeSessions, adds eventHistory entry
 * 6. Protocol event 'sessionResolved' — removes from activeSessions, adds eventHistory entry
 * 7. addEvent trims eventHistory when > event_history_limit
 * 8. onAttach verbose=true: config.verbose just results in console.log (don't test output, just no-throw)
 * 9. Exported helpers: getActiveSessions, getSession, getMyProposals, getMyVotes, getEventHistory, getAgentId, isInSession, hasVoted, setAgentManifest
 * 10. withNegotiation factory helper
 * 11. observer role: initiate/propose/vote throw errors
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mock NegotiationProtocol ─────────────────────────────────────────────────

let _mockProtocol: any;
const _protocolListeners: Record<string, ((...args: any[]) => void)[]> = {};

vi.mock('@holoscript/framework/negotiation', () => {
  function NegotiationProtocolImpl() {
    return _mockProtocol;
  }
  function getNegotiationProtocol() {
    return _mockProtocol;
  }
  return {
    NegotiationProtocol: NegotiationProtocolImpl,
    getNegotiationProtocol,
    getTrustWeight: vi.fn().mockReturnValue(1.0),
  };
});

// Stub AgentManifest (type only, no runtime code needed)
vi.mock('@holoscript/framework/agents', () => ({}));

import {
  negotiationHandler,
  getActiveSessions,
  getEventHistory,
  getAgentId,
  isInSession,
  hasVoted,
  getMyProposals,
  getMyVotes,
  setAgentManifest,
  withNegotiation,
  initiate,
  propose,
  vote,
} from '../NegotiationTrait';

// ─── Helpers ──────────────────────────────────────────────────────────────────

let _nodeId = 0;
function makeNode() {
  return { id: `neg_node_${++_nodeId}` };
}
function makeCtx() {
  return { emit: vi.fn() };
}
function makeConfig(o: any = {}) {
  return { ...negotiationHandler.defaultConfig!, ...o };
}

function buildMockProtocol() {
  const listeners: Record<string, ((...args: any[]) => void)[]> = {};
  return {
    on: vi.fn((event: string, cb: (...a: any[]) => void) => {
      if (!listeners[event]) listeners[event] = [];
      listeners[event].push(cb);
      // return an unsubscribe function
      return () => {
        listeners[event] = listeners[event].filter((l) => l !== cb);
      };
    }),
    emit: (event: string, data: any) => {
      listeners[event]?.forEach((cb) => cb(data));
    },
    initiate: vi.fn().mockResolvedValue({
      id: 'session_1',
      topic: 'test',
      participants: [],
      proposals: [],
      status: 'open',
    }),
    propose: vi.fn().mockResolvedValue({
      id: 'proposal_1',
      title: 'Proposal A',
      proposerId: 'agent_x',
      content: {},
      priority: 0,
    }),
    vote: vi.fn().mockResolvedValue({ id: 'vote_1', agentId: 'agent_x', ranking: [], weight: 1 }),
    getSession: vi.fn().mockReturnValue({ id: 'session_1', proposals: [], participants: [] }),
    getAuditLog: vi.fn().mockReturnValue([]),
    removeParticipant: vi.fn(),
    _listeners: listeners,
  };
}

function attach(o: any = {}) {
  const node = makeNode();
  const ctx = makeCtx();
  const config = makeConfig(o);
  negotiationHandler.onAttach!(node as any, config, ctx as any);
  return { node, ctx, config };
}

beforeEach(() => {
  vi.clearAllMocks();
  _mockProtocol = buildMockProtocol();
});

// ─── defaultConfig ────────────────────────────────────────────────────────────
describe('negotiationHandler.defaultConfig', () => {
  const d = negotiationHandler.defaultConfig!;
  it('role = participant', () => expect(d.role).toBe('participant'));
  it('default_mechanism = majority', () => expect(d.default_mechanism).toBe('majority'));
  it('default_timeout = 60000', () => expect(d.default_timeout).toBe(60000));
  it('default_quorum = 0.5', () => expect(d.default_quorum).toBe(0.5));
  it('auto_vote = false', () => expect(d.auto_vote).toBe(false));
  it('auto_vote_strategy = none', () => expect(d.auto_vote_strategy).toBe('none'));
  it('event_history_limit = 100', () => expect(d.event_history_limit).toBe(100));
  it('require_justification = false', () => expect(d.require_justification).toBe(false));
  it('verbose = false', () => expect(d.verbose).toBe(false));
});

// ─── onAttach ─────────────────────────────────────────────────────────────────
describe('negotiationHandler.onAttach', () => {
  it('creates __negotiation_state', () => {
    const { node } = attach();
    expect((node as any).__negotiation_state).toBeDefined();
  });

  it('agentId = config.agent_id when provided', () => {
    const { node } = attach({ agent_id: 'my_agent' });
    expect(getAgentId(node as any)).toBe('my_agent');
  });

  it('agentId = node.id when agent_id not provided', () => {
    const { node } = attach();
    expect(getAgentId(node as any)).toBe(node.id);
  });

  it('state.role = config.role', () => {
    const { node } = attach({ role: 'initiator' });
    expect((node as any).__negotiation_state.role).toBe('initiator');
  });

  it('subscribes to protocol events (protocol.on called 3x)', () => {
    attach();
    expect(_mockProtocol.on).toHaveBeenCalledTimes(3);
    expect(_mockProtocol.on).toHaveBeenCalledWith('sessionStarted', expect.any(Function));
    expect(_mockProtocol.on).toHaveBeenCalledWith('proposalSubmitted', expect.any(Function));
    expect(_mockProtocol.on).toHaveBeenCalledWith('sessionResolved', expect.any(Function));
  });

  it('activeSessions/myProposals/myVotes/eventHistory start empty', () => {
    const { node } = attach();
    expect(getActiveSessions(node as any)).toEqual([]);
    expect(getMyProposals(node as any)).toEqual([]);
    expect(getMyVotes(node as any)).toEqual([]);
    expect(getEventHistory(node as any)).toEqual([]);
  });
});

// ─── onDetach ─────────────────────────────────────────────────────────────────
describe('negotiationHandler.onDetach', () => {
  it('clears __negotiation_state', () => {
    const { node, config, ctx } = attach();
    negotiationHandler.onDetach!(node as any, config, ctx as any);
    expect((node as any).__negotiation_state).toBeUndefined();
  });

  it('calls all unsubscribers (protocol.on return values)', () => {
    const unsub1 = vi.fn();
    const unsub2 = vi.fn();
    const unsub3 = vi.fn();
    _mockProtocol.on
      .mockReturnValueOnce(unsub1)
      .mockReturnValueOnce(unsub2)
      .mockReturnValueOnce(unsub3);
    const { node, config, ctx } = attach();
    negotiationHandler.onDetach!(node as any, config, ctx as any);
    expect(unsub1).toHaveBeenCalled();
    expect(unsub2).toHaveBeenCalled();
    expect(unsub3).toHaveBeenCalled();
  });
});

// ─── Protocol event: sessionStarted ─────────────────────────────────────────
describe('protocol event: sessionStarted', () => {
  it('adds session to activeSessions when agent is participant', () => {
    const { node } = attach({ agent_id: 'agent_1' });
    _mockProtocol._listeners.sessionStarted.forEach((cb: any) =>
      cb({ session: { id: 'sess_A', topic: 'topic', participants: ['agent_1'] } })
    );
    expect(isInSession(node as any, 'sess_A')).toBe(true);
  });

  it('adds "session_started" entry to eventHistory', () => {
    const { node } = attach({ agent_id: 'agent_1' });
    _mockProtocol._listeners.sessionStarted.forEach((cb: any) =>
      cb({ session: { id: 'sess_B', topic: 'test', participants: ['agent_1'] } })
    );
    const history = getEventHistory(node as any);
    expect(history.some((e: any) => e.type === 'session_started' && e.sessionId === 'sess_B')).toBe(
      true
    );
  });

  it('does NOT add session when agent is NOT a participant', () => {
    const { node } = attach({ agent_id: 'agent_1' });
    _mockProtocol._listeners.sessionStarted.forEach((cb: any) =>
      cb({ session: { id: 'sess_C', topic: 'other', participants: ['agent_2'] } })
    );
    expect(isInSession(node as any, 'sess_C')).toBe(false);
  });
});

// ─── Protocol event: proposalSubmitted ───────────────────────────────────────
describe('protocol event: proposalSubmitted', () => {
  it('adds "proposal_received" event to history when agent is participant', () => {
    const { node } = attach({ agent_id: 'agent_1' });
    _mockProtocol._listeners.proposalSubmitted?.forEach((cb: any) =>
      cb({
        session: { id: 'sess_A', participants: ['agent_1'] },
        proposal: { id: 'prop_1', title: 'Prop A' },
      })
    );
    const history = getEventHistory(node as any);
    expect(history.some((e: any) => e.type === 'proposal_received')).toBe(true);
  });

  it('does NOT add entry when agent is not a participant', () => {
    const { node } = attach({ agent_id: 'agent_1' });
    _mockProtocol._listeners.proposalSubmitted?.forEach((cb: any) =>
      cb({
        session: { id: 'sess_X', participants: ['agent_99'] },
        proposal: { id: 'p1', title: 'T' },
      })
    );
    const history = getEventHistory(node as any);
    expect(history.length).toBe(0);
  });
});

// ─── Protocol event: sessionResolved ─────────────────────────────────────────
describe('protocol event: sessionResolved', () => {
  it('removes session from activeSessions on resolution', () => {
    const { node } = attach({ agent_id: 'agent_1' });
    // First add session
    _mockProtocol._listeners.sessionStarted?.forEach((cb: any) =>
      cb({ session: { id: 'sess_D', topic: 'topic', participants: ['agent_1'] } })
    );
    // Then resolve
    _mockProtocol._listeners.sessionResolved?.forEach((cb: any) =>
      cb({
        session: { id: 'sess_D', participants: ['agent_1'] },
        resolution: { outcome: 'accepted', winnerId: 'p1' },
      })
    );
    expect(isInSession(node as any, 'sess_D')).toBe(false);
  });

  it('adds "session_resolved" event to history', () => {
    const { node } = attach({ agent_id: 'agent_1' });
    _mockProtocol._listeners.sessionResolved?.forEach((cb: any) =>
      cb({
        session: { id: 'sess_E', participants: ['agent_1'] },
        resolution: { outcome: 'rejected', winnerId: null },
      })
    );
    const history = getEventHistory(node as any);
    expect(history.some((e: any) => e.type === 'session_resolved')).toBe(true);
  });
});

// ─── eventHistory limit ───────────────────────────────────────────────────────
describe('eventHistory limit', () => {
  it('trims eventHistory when over event_history_limit', () => {
    const { node } = attach({ agent_id: 'agent_1', event_history_limit: 3 });
    // Fire 5 session events
    for (let i = 0; i < 5; i++) {
      _mockProtocol._listeners.sessionStarted?.forEach((cb: any) =>
        cb({ session: { id: `sess_${i}`, topic: 't', participants: ['agent_1'] } })
      );
    }
    const history = getEventHistory(node as any);
    expect(history.length).toBe(3);
  });
});

// ─── exported helpers ─────────────────────────────────────────────────────────
describe('exported helpers', () => {
  it('isInSession: true after session added manually', () => {
    const { node } = attach({ agent_id: 'a1' });
    (node as any).__negotiation_state.activeSessions.set('sess_Z', { id: 'sess_Z' });
    expect(isInSession(node as any, 'sess_Z')).toBe(true);
  });

  it('isInSession: false for unknown session', () => {
    const { node } = attach();
    expect(isInSession(node as any, 'nope')).toBe(false);
  });

  it('hasVoted: false initially', () => {
    const { node } = attach();
    expect(hasVoted(node as any, 'sess_1')).toBe(false);
  });

  it('hasVoted: true after vote recorded', () => {
    const { node } = attach();
    (node as any).__negotiation_state.myVotes.set('sess_1', { id: 'v1' });
    expect(hasVoted(node as any, 'sess_1')).toBe(true);
  });

  it('getMyProposals: returns array of proposals', () => {
    const { node } = attach();
    (node as any).__negotiation_state.myProposals.set('p1', { id: 'p1', title: 'Test' });
    expect(getMyProposals(node as any)).toHaveLength(1);
  });

  it('getMyVotes: returns array of votes', () => {
    const { node } = attach();
    (node as any).__negotiation_state.myVotes.set('s1', { id: 'v1' });
    expect(getMyVotes(node as any)).toHaveLength(1);
  });

  it('setAgentManifest: stores manifest in state', () => {
    const { node } = attach();
    const manifest = { id: 'manifest_1' } as any;
    setAgentManifest(node as any, manifest);
    expect((node as any).__negotiation_state.agentManifest).toBe(manifest);
  });

  it('getAgentId: returns derived agentId', () => {
    const { node } = attach({ agent_id: 'custom_agent' });
    expect(getAgentId(node as any)).toBe('custom_agent');
  });
});

// ─── withNegotiation factory ──────────────────────────────────────────────────
describe('withNegotiation', () => {
  it('returns the same node with negotiation state attached', () => {
    const node = makeNode();
    const result = withNegotiation(node as any, { role: 'observer' });
    expect(result).toBe(node);
    expect((node as any).__negotiation_state).toBeDefined();
  });

  it('applies config.role', () => {
    const node = makeNode();
    withNegotiation(node as any, { role: 'initiator' });
    expect((node as any).__negotiation_state.role).toBe('initiator');
  });
});

// ─── observer role guards ────────────────────────────────────────────────────
describe('observer role guards', () => {
  it('initiate throws for observer', async () => {
    const node = makeNode();
    withNegotiation(node as any, { role: 'observer' });
    await expect(initiate(node as any, 'topic', ['a', 'b'])).rejects.toThrow(
      'Observers cannot initiate'
    );
  });

  it('propose throws for observer', async () => {
    const node = makeNode();
    withNegotiation(node as any, { role: 'observer' });
    await expect(propose(node as any, 's1', 'title', {})).rejects.toThrow(
      'Observers cannot submit proposals'
    );
  });

  it('vote throws for observer', async () => {
    const node = makeNode();
    withNegotiation(node as any, { role: 'observer' });
    await expect(vote(node as any, 's1', ['p1'])).rejects.toThrow('Observers cannot vote');
  });
});

// ─── initiate / propose / vote for non-observer ───────────────────────────────
describe('initiate / propose / vote (participant role)', () => {
  it('initiate calls protocol.initiate and returns session', async () => {
    const { node } = attach({ agent_id: 'a1', role: 'initiator' });
    _mockProtocol.initiate.mockResolvedValue({
      id: 'sess_new',
      topic: 'new topic',
      participants: ['a1'],
    });
    const session = await initiate(node as any, 'new topic', ['a2']);
    expect(_mockProtocol.initiate).toHaveBeenCalled();
    expect(session.id).toBe('sess_new');
  });

  it('propose calls protocol.propose and stores proposal', async () => {
    const { node } = attach({ agent_id: 'a1' });
    _mockProtocol.propose.mockResolvedValue({
      id: 'prop_new',
      title: 'Prop X',
      proposerId: 'a1',
      content: {},
    });
    const proposal = await propose(node as any, 'sess_1', 'Prop X', { data: 1 });
    expect(_mockProtocol.propose).toHaveBeenCalled();
    expect(proposal.id).toBe('prop_new');
    expect(getMyProposals(node as any)).toHaveLength(1);
  });

  it('vote calls protocol.vote and stores vote', async () => {
    const { node } = attach({ agent_id: 'a1' });
    _mockProtocol.vote.mockResolvedValue({
      id: 'vote_new',
      agentId: 'a1',
      ranking: ['p1'],
      weight: 1,
    });
    const voteResult = await vote(node as any, 'sess_1', ['p1']);
    expect(_mockProtocol.vote).toHaveBeenCalled();
    expect(voteResult.id).toBe('vote_new');
    expect(hasVoted(node as any, 'sess_1')).toBe(true);
  });
});
