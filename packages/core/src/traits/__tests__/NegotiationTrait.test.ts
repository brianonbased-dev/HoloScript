import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createMockNode, createMockContext, attachTrait } from './traitTestHelpers';

// Mock NegotiationProtocol
const mockOn = vi.fn().mockReturnValue(vi.fn()); // returns unsubscribe function
const mockInitiate = vi.fn().mockResolvedValue({
  id: 'sess-1',
  topic: 'Test Topic',
  participants: ['agent-1', 'agent-2'],
  proposals: [],
  votes: [],
  status: 'active',
});
const mockPropose = vi.fn().mockResolvedValue({
  id: 'prop-1',
  proposerId: 'agent-1',
  title: 'Test Proposal',
  content: {},
});
const mockVote = vi.fn().mockResolvedValue({
  id: 'vote-1',
  agentId: 'agent-1',
  ranking: ['prop-1'],
});
const mockGetSession = vi.fn().mockReturnValue({
  id: 'sess-1',
  proposals: [{ id: 'prop-1', title: 'A', priority: 1 }],
  participants: ['agent-1'],
});
const mockGetAuditLog = vi.fn().mockReturnValue([]);
const mockRemoveParticipant = vi.fn();

vi.mock('@holoscript/framework/negotiation', () => ({
  NegotiationProtocol: class {},
  getNegotiationProtocol: vi.fn(() => ({
    on: mockOn,
    initiate: mockInitiate,
    propose: mockPropose,
    vote: mockVote,
    getSession: mockGetSession,
    getAuditLog: mockGetAuditLog,
    removeParticipant: mockRemoveParticipant,
  })),
}));

vi.mock('@holoscript/framework/agents', () => ({}));

import {
  negotiationHandler,
  getActiveSessions,
  getMyProposals,
  getMyVotes,
  getEventHistory,
  getAgentId,
  isInSession,
  hasVoted,
  withNegotiation,
} from '../NegotiationTrait';

describe('NegotiationTrait', () => {
  let node: Record<string, unknown>;
  let ctx: ReturnType<typeof createMockContext>;
  const cfg = {
    role: 'participant' as const,
    default_mechanism: 'majority' as const,
    default_timeout: 60000,
    default_quorum: 0.5,
    auto_vote: false,
    auto_vote_strategy: 'none' as const,
    event_history_limit: 100,
    require_justification: false,
    agent_id: 'agent-1',
    verbose: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    node = createMockNode('negotiator');
    (node as any).id = 'negotiator';
    ctx = createMockContext();
    attachTrait(negotiationHandler, node, cfg, ctx);
  });

  it('initializes state on attach', () => {
    const s = (node as any).__negotiation_state;
    expect(s).toBeDefined();
    expect(s.role).toBe('participant');
    expect(s.agentId).toBe('agent-1');
    expect(s.protocol).not.toBeNull();
  });

  it('subscribes to protocol events on attach', () => {
    // sessionStarted, proposalSubmitted, sessionResolved
    expect(mockOn).toHaveBeenCalledWith('sessionStarted', expect.any(Function));
    expect(mockOn).toHaveBeenCalledWith('proposalSubmitted', expect.any(Function));
    expect(mockOn).toHaveBeenCalledWith('sessionResolved', expect.any(Function));
  });

  it('stores unsubscribers', () => {
    const s = (node as any).__negotiation_state;
    expect(s.unsubscribers.length).toBe(3);
  });

  it('cleans up on detach', () => {
    negotiationHandler.onDetach?.(node as any, cfg as any, ctx as any);
    expect((node as any).__negotiation_state).toBeUndefined();
  });

  it('getAgentId returns configured agent ID', () => {
    expect(getAgentId(node as any)).toBe('agent-1');
  });

  it('returns empty active sessions initially', () => {
    expect(getActiveSessions(node as any)).toEqual([]);
  });

  it('returns empty proposals initially', () => {
    expect(getMyProposals(node as any)).toEqual([]);
  });

  it('returns empty votes initially', () => {
    expect(getMyVotes(node as any)).toEqual([]);
  });

  it('returns empty event history initially', () => {
    expect(getEventHistory(node as any)).toEqual([]);
  });

  it('isInSession returns false for unknown session', () => {
    expect(isInSession(node as any, 'unknown')).toBe(false);
  });

  it('hasVoted returns false initially', () => {
    expect(hasVoted(node as any, 'sess-1')).toBe(false);
  });

  it('withNegotiation attaches state to node', () => {
    const bareNode = createMockNode('bare') as any;
    bareNode.id = 'bare';
    withNegotiation(bareNode);
    expect(bareNode.__negotiation_state).toBeDefined();
  });

  it('has correct handler name', () => {
    expect(negotiationHandler.name).toBe('negotiation');
  });
});
