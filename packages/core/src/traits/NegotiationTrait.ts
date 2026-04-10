/**
 * Negotiation Trait Handler
 *
 * Enables nodes to participate in multi-agent negotiation sessions.
 * Part of HoloScript v3.1 Agentic Choreography.
 *
 * Features:
 * - Initiate and participate in negotiation sessions
 * - Submit and vote on proposals
 * - Multiple voting mechanisms support
 * - Event-driven negotiation updates
 *
 * @version 3.1.0
 * @Sprint v3.1 (March 2026)
 */

import type { TraitHandler, TraitContext } from './TraitTypes';
import type { HSPlusNode } from '../types/HoloScriptPlus';
import type { AgentManifest } from '../agents/AgentManifest';
import type {
  NegotiationSession,
  Proposal,
  Vote,
  VotingMechanism,
  ProposalInput,
  VoteInput,
  InitiateOptions,
} from '../negotiation/NegotiationTypes';
import {
  NegotiationProtocol,
  getNegotiationProtocol,
  type AuditEntry,
} from '../negotiation/NegotiationProtocol';
import { getTrustWeight } from '../negotiation/VotingMechanisms';

// =============================================================================
// TYPES
// =============================================================================

type NegotiationRole = 'participant' | 'initiator' | 'observer';

interface NegotiationEvent {
  type: 'session_started' | 'proposal_received' | 'vote_cast' | 'session_resolved';
  sessionId: string;
  data?: unknown;
  timestamp: number;
}

interface NegotiationState {
  role: NegotiationRole;
  protocol: NegotiationProtocol | null;
  activeSessions: Map<string, NegotiationSession>;
  myProposals: Map<string, Proposal>;
  myVotes: Map<string, Vote>;
  eventHistory: NegotiationEvent[];
  agentId: string | null;
  agentManifest: AgentManifest | null;
  unsubscribers: Array<() => void>;
}

interface NegotiationTraitConfig {
  /** Operating role */
  role: NegotiationRole;
  /** Default voting mechanism */
  default_mechanism: VotingMechanism;
  /** Default session timeout (ms) */
  default_timeout: number;
  /** Default quorum requirement */
  default_quorum: number;
  /** Auto-vote enabled */
  auto_vote: boolean;
  /** Auto-vote strategy */
  auto_vote_strategy: 'first' | 'random' | 'highest_priority' | 'none';
  /** Event history limit */
  event_history_limit: number;
  /** Require justification for votes */
  require_justification: boolean;
  /** Agent ID (if not provided, derived from node) */
  agent_id?: string;
  /** Verbose logging */
  verbose: boolean;
}

// =============================================================================
// DEFAULT CONFIGURATION
// =============================================================================

const DEFAULT_NEGOTIATION_CONFIG: NegotiationTraitConfig = {
  role: 'participant',
  default_mechanism: 'majority',
  default_timeout: 60000,
  default_quorum: 0.5,
  auto_vote: false,
  auto_vote_strategy: 'none',
  event_history_limit: 100,
  require_justification: false,
  verbose: false,
};

// =============================================================================
// STATE MANAGEMENT
// =============================================================================

function createDefaultState(): NegotiationState {
  return {
    role: 'participant',
    protocol: null,
    activeSessions: new Map(),
    myProposals: new Map(),
    myVotes: new Map(),
    eventHistory: [],
    agentId: null,
    agentManifest: null,
    unsubscribers: [],
  };
}

type NodeWithNegotiation = HSPlusNode & {
  __negotiation_state?: NegotiationState;
};

function getState(node: HSPlusNode): NegotiationState {
  const n = node as NodeWithNegotiation;
  if (!n.__negotiation_state) {
    throw new Error('Negotiation trait not attached');
  }
  return n.__negotiation_state;
}

function addEvent(
  state: NegotiationState,
  type: NegotiationEvent['type'],
  sessionId: string,
  config: NegotiationTraitConfig,
  data?: unknown
): void {
  const event: NegotiationEvent = {
    type,
    sessionId,
    data,
    timestamp: Date.now(),
  };

  state.eventHistory.push(event);

  // Trim history if needed
  while (state.eventHistory.length > config.event_history_limit) {
    state.eventHistory.shift();
  }
}

function log(config: NegotiationTraitConfig, ...args: unknown[]): void {
  if (config.verbose) {
    console.log('[NegotiationTrait]', ...args);
  }
}

/**
 * Internal auto-vote function used by event handler
 */
async function autoVoteInternal(
  node: HSPlusNode,
  sessionId: string,
  config: NegotiationTraitConfig
): Promise<Vote | null> {
  const state = getState(node);
  const session = state.protocol!.getSession(sessionId);

  if (session.proposals.length === 0) {
    return null;
  }

  let ranking: string[];

  switch (config.auto_vote_strategy) {
    case 'first':
      ranking = [session.proposals[0].id];
      break;

    case 'random': {
      const shuffled = [...session.proposals].sort(() => Math.random() - 0.5);
      ranking = shuffled.map((p) => p.id);
      break;
    }

    case 'highest_priority': {
      const sorted = [...session.proposals].sort((a, b) => (b.priority || 0) - (a.priority || 0));
      ranking = sorted.map((p) => p.id);
      break;
    }

    default:
      return null;
  }

  const voteResult = await state.protocol!.vote(sessionId, {
    agentId: state.agentId!,
    ranking,
    weight: getTrustWeight('local'),
    justification: `Auto-voted: ${config.auto_vote_strategy}`,
    approvals: undefined,
    abstain: false,
  });

  state.myVotes.set(sessionId, voteResult);
  addEvent(state, 'vote_cast', sessionId, config, {
    voteId: voteResult.id,
  });

  return voteResult;
}

// =============================================================================
// HANDLER IMPLEMENTATION
// =============================================================================

/**
 * Negotiation trait handler
 */
export const negotiationHandler: TraitHandler<NegotiationTraitConfig> = {
  name: 'negotiation',

  defaultConfig: DEFAULT_NEGOTIATION_CONFIG,

  onAttach(node: HSPlusNode, config: NegotiationTraitConfig, _context: TraitContext) {
    const cfg = { ...DEFAULT_NEGOTIATION_CONFIG, ...config };
    const state = createDefaultState();
    state.role = cfg.role;

    // Derive agent ID
    state.agentId = cfg.agent_id || node.id || `agent-${Date.now()}`;

    // Store state on node
    (node as NodeWithNegotiation).__negotiation_state = state;

    // Get or create protocol instance
    state.protocol = getNegotiationProtocol();

    // Subscribe to protocol events
    const unsub1 = state.protocol.on('sessionStarted', ({ session }) => {
      if (session.participants.includes(state.agentId!)) {
        state.activeSessions.set(session.id, session);
        addEvent(state, 'session_started', session.id, cfg, { topic: session.topic });
        log(cfg, `Joined session ${session.id}: ${session.topic}`);
      }
    });

    const unsub2 = state.protocol.on('proposalSubmitted', ({ session, proposal }) => {
      if (session.participants.includes(state.agentId!)) {
        state.activeSessions.set(session.id, session);
        addEvent(state, 'proposal_received', session.id, cfg, {
          proposalId: proposal.id,
          title: proposal.title,
        });
        log(cfg, `Proposal received in ${session.id}: ${proposal.title}`);

        // Auto-vote if enabled
        if (cfg.auto_vote && cfg.auto_vote_strategy !== 'none') {
          const myVote = state.myVotes.get(session.id);
          if (!myVote) {
            // Use void to handle the promise (avoids unhandled promise warning)
            void autoVoteInternal(node, session.id, cfg);
          }
        }
      }
    });

    const unsub3 = state.protocol.on('sessionResolved', ({ session, resolution }) => {
      if (session.participants.includes(state.agentId!)) {
        state.activeSessions.delete(session.id);
        addEvent(state, 'session_resolved', session.id, cfg, {
          outcome: resolution.outcome,
          winnerId: resolution.winnerId,
        });
        log(cfg, `Session ${session.id} resolved: ${resolution.outcome}`);
      }
    });

    state.unsubscribers.push(unsub1, unsub2, unsub3);

    log(cfg, `Trait attached in ${cfg.role} mode for agent ${state.agentId}`);
  },

  onDetach(node: HSPlusNode, _config: NegotiationTraitConfig, _context: TraitContext) {
    const state = getState(node);

    // Unsubscribe from events
    for (const unsub of state.unsubscribers) {
      unsub();
    }

    // Clear state
    (node as NodeWithNegotiation).__negotiation_state = undefined;
  },

  onUpdate(
    _node: HSPlusNode,
    _config: NegotiationTraitConfig,
    _context: TraitContext,
    _delta: number
  ) {
    // No per-frame updates needed
  },
};

// =============================================================================
// EXPORTED METHODS (standalone functions)
// =============================================================================

/**
 * Initiate a new negotiation session
 */
export async function initiate(
  node: HSPlusNode,
  topic: string,
  participants: string[],
  options?: Partial<InitiateOptions>
): Promise<NegotiationSession> {
  const state = getState(node);
  const config = DEFAULT_NEGOTIATION_CONFIG;

  if (state.role === 'observer') {
    throw new Error('Observers cannot initiate negotiations');
  }

  // Ensure self is included
  const allParticipants = participants.includes(state.agentId!)
    ? participants
    : [state.agentId!, ...participants];

  const session = await state.protocol!.initiate({
    topic,
    participants: allParticipants,
    votingMechanism: options?.votingMechanism || config.default_mechanism,
    timeout: options?.timeout || config.default_timeout,
    quorum: options?.quorum || config.default_quorum,
    requireJustification: options?.requireJustification || config.require_justification,
    ...options,
  });

  state.activeSessions.set(session.id, session);
  return session;
}

/**
 * Submit a proposal to a session
 */
export async function propose(
  node: HSPlusNode,
  sessionId: string,
  title: string,
  content: unknown,
  options?: Partial<ProposalInput>
): Promise<Proposal> {
  const state = getState(node);

  if (state.role === 'observer') {
    throw new Error('Observers cannot submit proposals');
  }

  const proposal = await state.protocol!.propose(sessionId, {
    proposerId: state.agentId!,
    title,
    content,
    description: options?.description,
    priority: options?.priority,
    metadata: options?.metadata,
  });

  state.myProposals.set(proposal.id, proposal);
  return proposal;
}

/**
 * Cast a vote in a session
 */
export async function vote(
  node: HSPlusNode,
  sessionId: string,
  ranking: string[],
  options?: Partial<VoteInput>
): Promise<Vote> {
  const state = getState(node);

  if (state.role === 'observer') {
    throw new Error('Observers cannot vote');
  }

  const voteResult = await state.protocol!.vote(sessionId, {
    agentId: state.agentId!,
    ranking,
    weight: options?.weight ?? getTrustWeight('local'),
    justification: options?.justification,
    approvals: options?.approvals,
    abstain: options?.abstain,
  });

  state.myVotes.set(sessionId, voteResult);
  addEvent(state, 'vote_cast', sessionId, DEFAULT_NEGOTIATION_CONFIG, {
    voteId: voteResult.id,
  });

  return voteResult;
}

/**
 * Abstain from voting in a session
 */
export async function abstain(
  node: HSPlusNode,
  sessionId: string,
  justification?: string
): Promise<Vote> {
  return vote(node, sessionId, [], {
    abstain: true,
    justification,
  });
}

/**
 * Approve multiple proposals (for approval voting)
 */
export async function approve(
  node: HSPlusNode,
  sessionId: string,
  proposalIds: string[],
  justification?: string
): Promise<Vote> {
  return vote(node, sessionId, [], {
    approvals: proposalIds,
    justification,
  });
}

/**
 * Auto-vote based on configured strategy
 */
export async function autoVote(node: HSPlusNode, sessionId: string): Promise<Vote | null> {
  const state = getState(node);
  const session = state.protocol!.getSession(sessionId);
  const config = DEFAULT_NEGOTIATION_CONFIG;

  if (session.proposals.length === 0) {
    return null;
  }

  let ranking: string[];

  switch (config.auto_vote_strategy) {
    case 'first':
      ranking = [session.proposals[0].id];
      break;

    case 'random': {
      const shuffled = [...session.proposals].sort(() => Math.random() - 0.5);
      ranking = shuffled.map((p) => p.id);
      break;
    }

    case 'highest_priority': {
      const sorted = [...session.proposals].sort((a, b) => (b.priority || 0) - (a.priority || 0));
      ranking = sorted.map((p) => p.id);
      break;
    }

    default:
      return null;
  }

  return vote(node, sessionId, ranking, {
    justification: `Auto-voted: ${config.auto_vote_strategy}`,
  });
}

/**
 * Get active sessions this agent is participating in
 */
export function getActiveSessions(node: HSPlusNode): NegotiationSession[] {
  const state = getState(node);
  return Array.from(state.activeSessions.values());
}

/**
 * Get a specific session
 */
export function getSession(node: HSPlusNode, sessionId: string): NegotiationSession | undefined {
  const state = getState(node);
  return state.activeSessions.get(sessionId) || state.protocol!.getSession(sessionId);
}

/**
 * Get my proposals
 */
export function getMyProposals(node: HSPlusNode): Proposal[] {
  const state = getState(node);
  return Array.from(state.myProposals.values());
}

/**
 * Get my votes
 */
export function getMyVotes(node: HSPlusNode): Vote[] {
  const state = getState(node);
  return Array.from(state.myVotes.values());
}

/**
 * Get event history
 */
export function getEventHistory(node: HSPlusNode): NegotiationEvent[] {
  const state = getState(node);
  return [...state.eventHistory];
}

/**
 * Get audit log for a session
 */
export function getAuditLog(node: HSPlusNode, sessionId?: string): AuditEntry[] {
  const state = getState(node);
  return state.protocol!.getAuditLog(sessionId);
}

/**
 * Get the agent ID for this node
 */
export function getAgentId(node: HSPlusNode): string {
  const state = getState(node);
  return state.agentId!;
}

/**
 * Set agent manifest for trust-weighted voting
 */
export function setAgentManifest(node: HSPlusNode, manifest: AgentManifest): void {
  const state = getState(node);
  state.agentManifest = manifest;
}

/**
 * Check if currently in a session
 */
export function isInSession(node: HSPlusNode, sessionId: string): boolean {
  const state = getState(node);
  return state.activeSessions.has(sessionId);
}

/**
 * Has voted in a session
 */
export function hasVoted(node: HSPlusNode, sessionId: string): boolean {
  const state = getState(node);
  return state.myVotes.has(sessionId);
}

/**
 * Leave a session (if allowed)
 */
export async function leave(node: HSPlusNode, sessionId: string): Promise<void> {
  const state = getState(node);
  state.protocol!.removeParticipant(sessionId, state.agentId!);
  state.activeSessions.delete(sessionId);
}

// =============================================================================
// CONVENIENCE EXPORTS
// =============================================================================

export type { NegotiationTraitConfig, NegotiationState, NegotiationEvent };

/**
 * Helper to create a negotiation-enabled node
 */
export function withNegotiation(
  node: HSPlusNode,
  config?: Partial<NegotiationTraitConfig>
): HSPlusNode {
  const fullConfig = { ...DEFAULT_NEGOTIATION_CONFIG, ...config };
  negotiationHandler.onAttach?.(node, fullConfig, {} as TraitContext);
  return node;
}

/**
 * Helper to get negotiation methods from a node
 */
export function getNegotiationMethods(node: HSPlusNode) {
  return {
    initiate: (topic: string, participants: string[], options?: Partial<InitiateOptions>) =>
      initiate(node, topic, participants, options),
    propose: (
      sessionId: string,
      title: string,
      content: unknown,
      options?: Partial<ProposalInput>
    ) => propose(node, sessionId, title, content, options),
    vote: (sessionId: string, ranking: string[], options?: Partial<VoteInput>) =>
      vote(node, sessionId, ranking, options),
    abstain: (sessionId: string, justification?: string) => abstain(node, sessionId, justification),
    approve: (sessionId: string, proposalIds: string[], justification?: string) =>
      approve(node, sessionId, proposalIds, justification),
    getActiveSessions: () => getActiveSessions(node),
    getSession: (sessionId: string) => getSession(node, sessionId),
    getMyProposals: () => getMyProposals(node),
    getMyVotes: () => getMyVotes(node),
    getAgentId: () => getAgentId(node),
    isInSession: (sessionId: string) => isInSession(node, sessionId),
    hasVoted: (sessionId: string) => hasVoted(node, sessionId),
    leave: (sessionId: string) => leave(node, sessionId),
  };
}

export default negotiationHandler;
