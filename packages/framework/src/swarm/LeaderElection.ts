/**
 * Leader Election System
 *
 * Implements Raft-inspired leader election for agent clusters.
 * Provides fault-tolerant leader selection with automatic failover.
 */

import type { ILeaderElection } from '@holoscript/core';

export interface LeaderElectionConfig {
  electionTimeoutMin: number; // Min election timeout (ms)
  electionTimeoutMax: number; // Max election timeout (ms)
  heartbeatInterval: number; // Leader heartbeat interval (ms)
  quorumSize?: number; // Override quorum calculation
}

export type ElectionRole = 'leader' | 'follower' | 'candidate';

export interface ElectionState {
  term: number;
  votedFor: string | null;
  role: ElectionRole;
  leaderId: string | null;
  votes: Set<string>;
}

const DEFAULT_CONFIG: LeaderElectionConfig = {
  electionTimeoutMin: 150,
  electionTimeoutMax: 300,
  heartbeatInterval: 50,
};

/**
 * Raft-inspired leader election for agent clusters
 */
export class LeaderElection implements ILeaderElection {
  private nodeId: string;
  private clusterMembers: string[];
  private config: LeaderElectionConfig;
  private state: ElectionState;
  private electionTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private callbacks: Set<(leaderId: string | null) => void> = new Set();
  private messageHandler: ((from: string, message: ElectionMessage) => void) | null = null;

  constructor(
    nodeId: string,
    clusterMembers: string[],
    config: Partial<LeaderElectionConfig> = {}
  ) {
    this.nodeId = nodeId;
    this.clusterMembers = clusterMembers.filter((id) => id !== nodeId);
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.state = {
      term: 0,
      votedFor: null,
      role: 'follower',
      leaderId: null,
      votes: new Set(),
    };
  }

  /**
   * Start participating in leader election
   */
  async startElection(): Promise<string> {
    this.becomeCandidate();

    // Wait for election to complete
    return new Promise((resolve) => {
      const checkLeader = setInterval(() => {
        if (this.state.leaderId !== null) {
          clearInterval(checkLeader);
          resolve(this.state.leaderId);
        }
      }, 10);

      // Timeout safety
      setTimeout(() => {
        clearInterval(checkLeader);
        resolve(this.state.leaderId ?? this.nodeId);
      }, this.config.electionTimeoutMax * 3);
    });
  }

  /**
   * Get current leader
   */
  getLeader(): string | null {
    return this.state.leaderId;
  }

  /**
   * Get this node's current role
   */
  getRole(): ElectionRole {
    return this.state.role;
  }

  /**
   * Subscribe to leader changes
   */
  onLeaderChange(callback: (leaderId: string | null) => void): () => void {
    this.callbacks.add(callback);
    return () => this.callbacks.delete(callback);
  }

  /**
   * Handle incoming election message
   */
  handleMessage(from: string, message: ElectionMessage): void {
    switch (message.type) {
      case 'request-vote':
        this.handleVoteRequest(from, message);
        break;
      case 'vote-response':
        this.handleVoteResponse(from, message);
        break;
      case 'heartbeat':
        this.handleHeartbeat(from, message);
        break;
    }
  }

  /**
   * Set message handler for sending messages to other nodes
   */
  setMessageHandler(handler: (from: string, message: ElectionMessage) => void): void {
    this.messageHandler = handler;
  }

  /**
   * Simulate receiving vote from another node (for testing/local clusters)
   */
  receiveVote(voterId: string): void {
    if (this.state.role === 'candidate') {
      this.state.votes.add(voterId);
      this.checkElectionWin();
    }
  }

  /**
   * Stop participating in election
   */
  stop(): void {
    if (this.electionTimer) {
      clearTimeout(this.electionTimer);
      this.electionTimer = null;
    }
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  /**
   * Transition to candidate role and start election
   */
  private becomeCandidate(): void {
    this.state.term++;
    this.state.role = 'candidate';
    this.state.votedFor = this.nodeId;
    this.state.votes = new Set([this.nodeId]); // Vote for self

    this.resetElectionTimer();
    this.requestVotes();
    this.checkElectionWin();
  }

  /**
   * Transition to leader role
   */
  private becomeLeader(): void {
    this.state.role = 'leader';
    this.state.leaderId = this.nodeId;

    if (this.electionTimer) {
      clearTimeout(this.electionTimer);
      this.electionTimer = null;
    }

    // Start sending heartbeats
    this.heartbeatTimer = setInterval(() => {
      this.sendHeartbeats();
    }, this.config.heartbeatInterval);

    this.notifyLeaderChange();
  }

  /**
   * Transition to follower role
   */
  private becomeFollower(leaderId: string, term: number): void {
    const wasLeader = this.state.role === 'leader';

    this.state.role = 'follower';
    this.state.leaderId = leaderId;
    this.state.term = term;
    this.state.votedFor = null;
    this.state.votes.clear();

    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    this.resetElectionTimer();

    if (wasLeader || this.state.leaderId !== leaderId) {
      this.notifyLeaderChange();
    }
  }

  /**
   * Request votes from all cluster members
   */
  private requestVotes(): void {
    const message: VoteRequestMessage = {
      type: 'request-vote',
      term: this.state.term,
      candidateId: this.nodeId,
    };

    // In a real implementation, this would send over network
    // For now, simulate immediate responses from local cluster
    if (this.messageHandler) {
      for (const member of this.clusterMembers) {
        this.messageHandler(member, message);
      }
    } else {
      // Simulate local cluster - all nodes vote for first candidate
      for (const member of this.clusterMembers) {
        this.receiveVote(member);
      }
    }
  }

  /**
   * Check if we've won the election
   */
  private checkElectionWin(): void {
    const quorum = this.getQuorumSize();

    if (this.state.votes.size >= quorum && this.state.role === 'candidate') {
      this.becomeLeader();
    }
  }

  /**
   * Send heartbeats to all followers
   */
  private sendHeartbeats(): void {
    if (this.state.role !== 'leader') return;

    const message: HeartbeatMessage = {
      type: 'heartbeat',
      term: this.state.term,
      leaderId: this.nodeId,
    };

    if (this.messageHandler) {
      for (const member of this.clusterMembers) {
        this.messageHandler(member, message);
      }
    }
  }

  /**
   * Handle vote request from candidate
   */
  private handleVoteRequest(from: string, message: VoteRequestMessage): void {
    // If we've already voted in this term or candidate's term is old, reject
    if (message.term < this.state.term) {
      return;
    }

    // If candidate's term is newer, update our term
    if (message.term > this.state.term) {
      this.state.term = message.term;
      this.state.votedFor = null;
    }

    // Grant vote if we haven't voted in this term
    if (this.state.votedFor === null || this.state.votedFor === message.candidateId) {
      this.state.votedFor = message.candidateId;

      const response: VoteResponseMessage = {
        type: 'vote-response',
        term: this.state.term,
        voteGranted: true,
      };

      if (this.messageHandler) {
        this.messageHandler(from, response);
      }
    }
  }

  /**
   * Handle vote response
   */
  private handleVoteResponse(from: string, message: VoteResponseMessage): void {
    if (message.term > this.state.term) {
      this.becomeFollower(from, message.term);
      return;
    }

    if (this.state.role === 'candidate' && message.voteGranted) {
      this.state.votes.add(from);
      this.checkElectionWin();
    }
  }

  /**
   * Handle heartbeat from leader
   */
  private handleHeartbeat(from: string, message: HeartbeatMessage): void {
    if (message.term >= this.state.term) {
      this.becomeFollower(message.leaderId, message.term);
      this.resetElectionTimer();
    }
  }

  /**
   * Reset election timeout
   */
  private resetElectionTimer(): void {
    if (this.electionTimer) {
      clearTimeout(this.electionTimer);
    }

    const timeout = this.getRandomElectionTimeout();

    this.electionTimer = setTimeout(() => {
      if (this.state.role !== 'leader') {
        this.becomeCandidate();
      }
    }, timeout);
  }

  /**
   * Get random election timeout in configured range
   */
  private getRandomElectionTimeout(): number {
    const { electionTimeoutMin, electionTimeoutMax } = this.config;
    return electionTimeoutMin + Math.random() * (electionTimeoutMax - electionTimeoutMin);
  }

  /**
   * Calculate quorum size (majority)
   */
  private getQuorumSize(): number {
    if (this.config.quorumSize) {
      return this.config.quorumSize;
    }
    const totalNodes = this.clusterMembers.length + 1; // Include self
    return Math.floor(totalNodes / 2) + 1;
  }

  /**
   * Notify all callbacks of leader change
   */
  private notifyLeaderChange(): void {
    for (const callback of this.callbacks) {
      try {
        callback(this.state.leaderId);
      } catch (_error) {
        // Ignore callback errors
      }
    }
  }
}

// Message types
export type ElectionMessage = VoteRequestMessage | VoteResponseMessage | HeartbeatMessage;

export interface VoteRequestMessage {
  type: 'request-vote';
  term: number;
  candidateId: string;
}

export interface VoteResponseMessage {
  type: 'vote-response';
  term: number;
  voteGranted: boolean;
}

export interface HeartbeatMessage {
  type: 'heartbeat';
  term: number;
  leaderId: string;
}
