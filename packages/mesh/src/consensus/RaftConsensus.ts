/**
 * Raft Consensus Protocol
 * Sprint 4 Priority 5 - Consensus Mechanisms
 *
 * Implementation of the Raft consensus algorithm for leader election
 * and log replication. Provides strong consistency guarantees.
 *
 * Reference: https://raft.github.io/raft.pdf
 */

import { EventEmitter } from 'events';
import {
  ConsensusConfig,
  ConsensusNode,
  ConsensusProtocol,
  ConsensusMechanism,
  ProposalResult,
  RaftNodeState,
  RaftLogEntry,
  DEFAULT_CONSENSUS_CONFIG,
  calculateQuorum,
} from './ConsensusTypes';

// =============================================================================
// RAFT MESSAGE TYPES
// =============================================================================

export interface RaftMessage {
  type: 'append_entries' | 'append_entries_response' | 'request_vote' | 'request_vote_response';
  term: number;
  senderId: string;
}

export interface AppendEntriesMessage extends RaftMessage {
  type: 'append_entries';
  prevLogIndex: number;
  prevLogTerm: number;
  entries: RaftLogEntry[];
  leaderCommit: number;
}

export interface AppendEntriesResponseMessage extends RaftMessage {
  type: 'append_entries_response';
  success: boolean;
  matchIndex: number;
}

export interface RequestVoteMessage extends RaftMessage {
  type: 'request_vote';
  lastLogIndex: number;
  lastLogTerm: number;
}

export interface RequestVoteResponseMessage extends RaftMessage {
  type: 'request_vote_response';
  voteGranted: boolean;
}

export type RaftMessageUnion =
  | AppendEntriesMessage
  | AppendEntriesResponseMessage
  | RequestVoteMessage
  | RequestVoteResponseMessage;

// =============================================================================
// RAFT CONSENSUS PROTOCOL
// =============================================================================

/**
 * Raft consensus protocol implementation
 */
export class RaftConsensus extends EventEmitter implements ConsensusProtocol {
  readonly name: ConsensusMechanism = 'raft';
  readonly nodeId: string;

  // Raft persistent state
  private currentTerm: number = 0;
  private votedFor: string | null = null;
  private log: RaftLogEntry[] = [];

  // Raft volatile state
  private commitIndex: number = -1;
  private lastApplied: number = -1;

  // Leader volatile state
  private nextIndex: Map<string, number> = new Map();
  private matchIndex: Map<string, number> = new Map();

  // Node state
  private state: RaftNodeState = 'follower';
  private leaderId: string | null = null;
  private nodes: Map<string, ConsensusNode> = new Map();

  // State machine
  private stateMachine: Map<string, unknown> = new Map();

  // Timers
  private electionTimer: NodeJS.Timeout | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;

  // Config
  private config: Required<ConsensusConfig>;

  // Pending proposals waiting for commit
  private pendingProposals: Map<
    number,
    { resolve: (result: ProposalResult<unknown>) => void; key: string; value: unknown }
  > = new Map();

  // Message sender callback
  private sendMessage: ((toNodeId: string, message: RaftMessageUnion) => void) | null = null;

  constructor(nodeId: string, config: Partial<ConsensusConfig> = {}) {
    super();
    this.nodeId = nodeId;
    this.config = { ...DEFAULT_CONSENSUS_CONFIG, ...config, mechanism: 'raft' };

    // Add self as first node
    this.nodes.set(nodeId, { id: nodeId, state: 'follower', term: 0 });
  }

  /**
   * Set the message sender callback for node-to-node communication
   */
  setMessageSender(sender: (toNodeId: string, message: RaftMessageUnion) => void): void {
    this.sendMessage = sender;
  }

  // ===========================================================================
  // PUBLIC INTERFACE
  // ===========================================================================

  isLeader(): boolean {
    return this.state === 'leader';
  }

  getLeaderId(): string | null {
    return this.leaderId;
  }

  getState(): Map<string, unknown> {
    return new Map(this.stateMachine);
  }

  get<T>(key: string): T | undefined {
    return this.stateMachine.get(key) as T | undefined;
  }

  async propose<T>(key: string, value: T): Promise<ProposalResult<T>> {
    if (this.state !== 'leader') {
      return {
        proposalId: '',
        accepted: false,
        key,
        votes: { for: 0, against: 0, total: this.nodes.size },
        error: this.leaderId ? `Not leader. Forward to ${this.leaderId}` : 'No leader elected',
      };
    }

    // Append to log
    const entry: RaftLogEntry<T> = {
      term: this.currentTerm,
      index: this.log.length,
      command: 'set',
      key,
      value,
      timestamp: Date.now(),
    };

    this.log.push(entry);

    // Create promise for when entry is committed
    return new Promise((resolve) => {
      this.pendingProposals.set(entry.index, {
        resolve: resolve as (result: ProposalResult<unknown>) => void,
        key,
        value,
      });

      // Immediately try to replicate
      this.replicateLog();

      // Set timeout
      setTimeout(() => {
        const pending = this.pendingProposals.get(entry.index);
        if (pending) {
          this.pendingProposals.delete(entry.index);
          pending.resolve({
            proposalId: `${this.nodeId}-${entry.index}`,
            accepted: false,
            key,
            votes: { for: 0, against: 0, total: this.nodes.size },
            error: 'Proposal timed out',
          });
        }
      }, this.config.timeout);
    });
  }

  addNode(node: ConsensusNode): void {
    this.nodes.set(node.id, { ...node, state: 'follower', term: this.currentTerm });
    if (this.state === 'leader') {
      this.nextIndex.set(node.id, this.log.length);
      this.matchIndex.set(node.id, -1);
    }
    this.emit('node:joined', node);
  }

  removeNode(nodeId: string): void {
    this.nodes.delete(nodeId);
    this.nextIndex.delete(nodeId);
    this.matchIndex.delete(nodeId);
    this.emit('node:left', nodeId);
  }

  getNodes(): ConsensusNode[] {
    return Array.from(this.nodes.values());
  }

  start(): void {
    this.resetElectionTimer();
  }

  stop(): void {
    this.clearElectionTimer();
    this.clearHeartbeatTimer();
  }

  // ===========================================================================
  // MESSAGE HANDLING
  // ===========================================================================

  handleMessage(fromNodeId: string, message: unknown): void {
    const msg = message as RaftMessageUnion;

    // Update term if message has higher term
    if (msg.term > this.currentTerm) {
      this.currentTerm = msg.term;
      this.votedFor = null;
      this.becomeFollower();
    }

    switch (msg.type) {
      case 'append_entries':
        this.handleAppendEntries(fromNodeId, msg);
        break;
      case 'append_entries_response':
        this.handleAppendEntriesResponse(fromNodeId, msg);
        break;
      case 'request_vote':
        this.handleRequestVote(fromNodeId, msg);
        break;
      case 'request_vote_response':
        this.handleRequestVoteResponse(fromNodeId, msg);
        break;
    }
  }

  private handleAppendEntries(fromNodeId: string, msg: AppendEntriesMessage): void {
    // Reset election timer - we heard from leader
    this.resetElectionTimer();

    // Accept leader
    this.leaderId = fromNodeId;
    if (this.state === 'candidate') {
      this.becomeFollower();
    }

    // Reply false if term < currentTerm
    if (msg.term < this.currentTerm) {
      this.sendAppendEntriesResponse(fromNodeId, false, -1);
      return;
    }

    // Reply false if log doesn't contain entry at prevLogIndex with prevLogTerm
    if (msg.prevLogIndex >= 0) {
      if (
        msg.prevLogIndex >= this.log.length ||
        this.log[msg.prevLogIndex].term !== msg.prevLogTerm
      ) {
        this.sendAppendEntriesResponse(fromNodeId, false, this.log.length - 1);
        return;
      }
    }

    // Append new entries
    for (const entry of msg.entries) {
      if (entry.index < this.log.length) {
        if (this.log[entry.index].term !== entry.term) {
          // Conflict - remove this and all following entries
          this.log.splice(entry.index);
          this.log.push(entry);
        }
      } else {
        this.log.push(entry);
      }
    }

    // Update commit index
    if (msg.leaderCommit > this.commitIndex) {
      this.commitIndex = Math.min(msg.leaderCommit, this.log.length - 1);
      this.applyCommittedEntries();
    }

    this.sendAppendEntriesResponse(fromNodeId, true, this.log.length - 1);
  }

  private handleAppendEntriesResponse(fromNodeId: string, msg: AppendEntriesResponseMessage): void {
    if (this.state !== 'leader') return;
    if (msg.term < this.currentTerm) return;

    if (msg.success) {
      this.nextIndex.set(fromNodeId, msg.matchIndex + 1);
      this.matchIndex.set(fromNodeId, msg.matchIndex);
      this.updateCommitIndex();
    } else {
      // Decrement nextIndex and retry
      const nextIdx = this.nextIndex.get(fromNodeId) || 1;
      this.nextIndex.set(fromNodeId, Math.max(0, nextIdx - 1));
      this.replicateToNode(fromNodeId);
    }
  }

  private handleRequestVote(fromNodeId: string, msg: RequestVoteMessage): void {
    let voteGranted = false;

    // Grant vote if:
    // 1. Haven't voted this term OR already voted for this candidate
    // 2. Candidate's log is at least as up-to-date as ours
    if (msg.term >= this.currentTerm) {
      if (this.votedFor === null || this.votedFor === fromNodeId) {
        const lastLogIndex = this.log.length - 1;
        const lastLogTerm = lastLogIndex >= 0 ? this.log[lastLogIndex].term : 0;

        // Candidate log is up-to-date if:
        // - Its last term is higher, OR
        // - Same term but at least as long
        if (
          msg.lastLogTerm > lastLogTerm ||
          (msg.lastLogTerm === lastLogTerm && msg.lastLogIndex >= lastLogIndex)
        ) {
          voteGranted = true;
          this.votedFor = fromNodeId;
          this.currentTerm = msg.term;
          this.resetElectionTimer();
        }
      }
    }

    this.sendRequestVoteResponse(fromNodeId, voteGranted);
  }

  private handleRequestVoteResponse(fromNodeId: string, msg: RequestVoteResponseMessage): void {
    if (this.state !== 'candidate') return;
    if (msg.term < this.currentTerm) return;

    if (msg.voteGranted) {
      // Count votes
      let votes = 1; // Self vote
      for (const [nodeId, node] of this.nodes) {
        if (nodeId !== this.nodeId && node.votedFor === this.nodeId) {
          votes++;
        }
      }

      // Record this vote
      const node = this.nodes.get(fromNodeId);
      if (node) {
        node.votedFor = this.nodeId;
        votes++;
      }

      // Check if won election
      if (votes >= calculateQuorum(this.nodes.size)) {
        this.becomeLeader();
      }
    }
  }

  // ===========================================================================
  // MESSAGE SENDING
  // ===========================================================================

  private sendAppendEntriesResponse(toNodeId: string, success: boolean, matchIndex: number): void {
    if (!this.sendMessage) return;

    this.sendMessage(toNodeId, {
      type: 'append_entries_response',
      term: this.currentTerm,
      senderId: this.nodeId,
      success,
      matchIndex,
    });
  }

  private sendRequestVoteResponse(toNodeId: string, voteGranted: boolean): void {
    if (!this.sendMessage) return;

    this.sendMessage(toNodeId, {
      type: 'request_vote_response',
      term: this.currentTerm,
      senderId: this.nodeId,
      voteGranted,
    });
  }

  private broadcastRequestVote(): void {
    if (!this.sendMessage) return;

    const lastLogIndex = this.log.length - 1;
    const lastLogTerm = lastLogIndex >= 0 ? this.log[lastLogIndex].term : 0;

    for (const [nodeId] of this.nodes) {
      if (nodeId !== this.nodeId) {
        this.sendMessage(nodeId, {
          type: 'request_vote',
          term: this.currentTerm,
          senderId: this.nodeId,
          lastLogIndex,
          lastLogTerm,
        });
      }
    }
  }

  private sendAppendEntries(toNodeId: string): void {
    if (!this.sendMessage) return;

    const nextIdx = this.nextIndex.get(toNodeId) || 0;
    const prevLogIndex = nextIdx - 1;
    const prevLogTerm = prevLogIndex >= 0 ? this.log[prevLogIndex]?.term || 0 : 0;
    const entries = this.log.slice(nextIdx);

    this.sendMessage(toNodeId, {
      type: 'append_entries',
      term: this.currentTerm,
      senderId: this.nodeId,
      prevLogIndex,
      prevLogTerm,
      entries,
      leaderCommit: this.commitIndex,
    });
  }

  // ===========================================================================
  // STATE TRANSITIONS
  // ===========================================================================

  private becomeFollower(): void {
    this.state = 'follower';
    this.clearHeartbeatTimer();
    this.resetElectionTimer();
    this.updateNodeState();
  }

  private becomeCandidate(): void {
    this.state = 'candidate';
    this.currentTerm++;
    this.votedFor = this.nodeId;
    this.leaderId = null;
    this.updateNodeState();

    // Request votes from all other nodes
    this.broadcastRequestVote();

    // Set election timeout
    this.resetElectionTimer();
  }

  private becomeLeader(): void {
    this.state = 'leader';
    this.leaderId = this.nodeId;
    this.clearElectionTimer();
    this.updateNodeState();

    // Initialize leader state
    for (const [nodeId] of this.nodes) {
      if (nodeId !== this.nodeId) {
        this.nextIndex.set(nodeId, this.log.length);
        this.matchIndex.set(nodeId, -1);
      }
    }

    this.emit('leader:elected', this.nodeId);

    // Start heartbeat
    this.startHeartbeat();
  }

  private updateNodeState(): void {
    const node = this.nodes.get(this.nodeId);
    if (node) {
      node.state = this.state;
      node.term = this.currentTerm;
      node.votedFor = this.votedFor || undefined;
    }
  }

  // ===========================================================================
  // TIMERS
  // ===========================================================================

  private resetElectionTimer(): void {
    this.clearElectionTimer();

    const [min, max] = this.config.electionTimeout;
    const timeout = min + Math.random() * (max - min);

    this.electionTimer = setTimeout(() => {
      if (this.state !== 'leader') {
        this.becomeCandidate();
      }
    }, timeout);
  }

  private clearElectionTimer(): void {
    if (this.electionTimer) {
      clearTimeout(this.electionTimer);
      this.electionTimer = null;
    }
  }

  private startHeartbeat(): void {
    this.clearHeartbeatTimer();

    const sendHeartbeats = () => {
      if (this.state !== 'leader') return;

      for (const [nodeId] of this.nodes) {
        if (nodeId !== this.nodeId) {
          this.sendAppendEntries(nodeId);
        }
      }
    };

    // Send immediately
    sendHeartbeats();

    // Then periodically
    this.heartbeatTimer = setInterval(sendHeartbeats, this.config.heartbeatInterval);
  }

  private clearHeartbeatTimer(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  // ===========================================================================
  // LOG REPLICATION
  // ===========================================================================

  private replicateLog(): void {
    if (this.state !== 'leader') return;

    for (const [nodeId] of this.nodes) {
      if (nodeId !== this.nodeId) {
        this.replicateToNode(nodeId);
      }
    }
  }

  private replicateToNode(nodeId: string): void {
    this.sendAppendEntries(nodeId);
  }

  private updateCommitIndex(): void {
    // Find the highest index replicated to majority
    for (let n = this.log.length - 1; n > this.commitIndex; n--) {
      if (this.log[n].term === this.currentTerm) {
        let count = 1; // Self
        for (const [_nodeId, matchIdx] of this.matchIndex) {
          if (matchIdx >= n) count++;
        }

        if (count >= calculateQuorum(this.nodes.size)) {
          this.commitIndex = n;
          this.applyCommittedEntries();
          break;
        }
      }
    }
  }

  private applyCommittedEntries(): void {
    while (this.lastApplied < this.commitIndex) {
      this.lastApplied++;
      const entry = this.log[this.lastApplied];

      if (entry.command === 'set') {
        const previousValue = this.stateMachine.get(entry.key);
        this.stateMachine.set(entry.key, entry.value);
        this.emit('state:changed', entry.key, entry.value, previousValue);
      } else if (entry.command === 'delete') {
        this.stateMachine.delete(entry.key);
        this.emit('state:changed', entry.key, undefined);
      }

      // Resolve pending proposal
      const pending = this.pendingProposals.get(entry.index);
      if (pending) {
        this.pendingProposals.delete(entry.index);
        pending.resolve({
          proposalId: `${this.nodeId}-${entry.index}`,
          accepted: true,
          key: pending.key,
          value: pending.value,
          votes: {
            for: calculateQuorum(this.nodes.size),
            against: 0,
            total: this.nodes.size,
          },
        });
      }
    }
  }

  // ===========================================================================
  // DEBUG / TESTING
  // ===========================================================================

  /**
   * Get current Raft state for debugging
   */
  getDebugState(): {
    nodeId: string;
    state: RaftNodeState;
    term: number;
    votedFor: string | null;
    leaderId: string | null;
    logLength: number;
    commitIndex: number;
    lastApplied: number;
  } {
    return {
      nodeId: this.nodeId,
      state: this.state,
      term: this.currentTerm,
      votedFor: this.votedFor,
      leaderId: this.leaderId,
      logLength: this.log.length,
      commitIndex: this.commitIndex,
      lastApplied: this.lastApplied,
    };
  }

  /**
   * Force election (for testing)
   */
  triggerElection(): void {
    this.becomeCandidate();
  }
}
