/**
 * Blackboard Trait (Swarm Intelligence)
 *
 * Provides a shared spatial memory for collective agent intelligence.
 * Allows agents to post "Beliefs" (knowledge) and "Proposals" (actions) to a common board.
 * Implements a basic consensus mechanism for coordinated group behavior.
 *
 * @version 1.0.0
 */

import type { TraitHandler } from './TraitTypes';
import type { HSPlusNode } from '../types/HoloScriptPlus';

// =============================================================================
// TYPES
// =============================================================================

export interface BlackboardEntry {
  id: string;
  key: string;
  value: any;
  authorId: string;
  timestamp: number;
  ttl: number; // Time-to-live in milliseconds
}

export interface Proposal {
  id: string;
  actionType: string;
  payload: any;
  proposerId: string;
  votes: Map<string, 'accept' | 'reject'>;
  status: 'pending' | 'accepted' | 'rejected';
  expiresAt: number;
}

interface BlackboardState {
  beliefs: Map<string, BlackboardEntry>;
  proposals: Map<string, Proposal>;
  groupId: string;
}

interface BlackboardConfig {
  group_id: string;
  cleanup_interval: number;
}

// =============================================================================
// HANDLER
// =============================================================================

export const blackboardHandler: TraitHandler<BlackboardConfig> = {
  name: 'blackboard' as any,

  defaultConfig: {
    group_id: 'default_swarm',
    cleanup_interval: 1000,
  },

  onAttach(node, config, context) {
    const state: BlackboardState = {
      beliefs: new Map(),
      proposals: new Map(),
      groupId: config.group_id,
    };
    (node as any).__blackboardState = state;

    context.emit?.('blackboard_initialized', { node, groupId: config.group_id });
  },

  onDetach(node, config, context) {
    delete (node as any).__blackboardState;
  },

  onUpdate(node, config, context, delta) {
    const state = (node as any).__blackboardState as BlackboardState;
    if (!state) return;

    const now = Date.now();

    // Cleanup expired beliefs
    for (const [key, entry] of state.beliefs) {
      if (now > entry.timestamp + entry.ttl) {
        state.beliefs.delete(key);
        context.emit?.('blackboard_belief_expired', { node, key });
      }
    }

    // Cleanup expired proposals
    for (const [id, proposal] of state.proposals) {
      if (proposal.status === 'pending' && now > proposal.expiresAt) {
        proposal.status = 'rejected';
        context.emit?.('blackboard_proposal_expired', { node, proposalId: id });
        state.proposals.delete(id);
      }
    }
  },

  onEvent(node, config, context, event) {
    const state = (node as any).__blackboardState as BlackboardState;
    if (!state) return;

    if (event.type === 'blackboard_post_belief') {
      const { key, value, ttl, authorId } = event as any;
      const entry: BlackboardEntry = {
        id: `${key}_${Date.now()}`,
        key,
        value,
        authorId: authorId || 'anonymous',
        timestamp: Date.now(),
        ttl: ttl || 5000,
      };
      state.beliefs.set(key, entry);
      context.emit?.('blackboard_belief_updated', { node, key, value });
    } else if (event.type === 'blackboard_read_belief') {
      const { key, queryId } = event as any;
      const entry = state.beliefs.get(key);
      context.emit?.('blackboard_belief_result', {
        node,
        queryId,
        found: !!entry,
        value: entry?.value,
      });
    } else if (event.type === 'blackboard_propose_action') {
      const { actionType, payload, proposerId, timeout } = event as any;
      const id = `prop_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;

      const proposal: Proposal = {
        id,
        actionType,
        payload,
        proposerId: proposerId || 'anonymous',
        votes: new Map(),
        status: 'pending',
        expiresAt: Date.now() + (timeout || 2000),
      };

      // Auto-vote yes by proposer
      proposal.votes.set(proposal.proposerId, 'accept');

      state.proposals.set(id, proposal);
      context.emit?.('blackboard_proposal_created', { node, proposal });
    } else if (event.type === 'blackboard_vote') {
      const { proposalId, voterId, vote } = event as any;
      const proposal = state.proposals.get(proposalId);

      if (proposal && proposal.status === 'pending') {
        proposal.votes.set(voterId, vote);
        context.emit?.('blackboard_vote_cast', { node, proposalId, voterId, vote });

        // Simple consensus: 50% + 1 (mock logic, real logic would need member count)
        // For now, if we have > 2 accepts, we execute
        let accepts = 0;
        let rejects = 0;
        for (const v of proposal.votes.values()) {
          if (v === 'accept') accepts++;
          else rejects++;
        }

        if (accepts >= 2) {
          proposal.status = 'accepted';
          context.emit?.('blackboard_consensus_reached', { node, proposal });
        }
      }
    }
  },
};

export default blackboardHandler;
