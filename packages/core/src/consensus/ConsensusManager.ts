/**
 * Consensus Manager
 * Sprint 4 Priority 5 - Consensus Mechanisms
 *
 * High-level manager for multi-agent consensus, supporting pluggable
 * consensus protocols (simple majority, Raft, PBFT).
 */

import { EventEmitter } from 'events';
import {
  ConsensusConfig,
  ConsensusNode,
  ConsensusProtocol,
  ConsensusMechanism,
  Proposal,
  ProposalResult,
  DEFAULT_CONSENSUS_CONFIG,
  generateProposalId,
  calculateQuorum,
  hasQuorum,
} from './ConsensusTypes';

// =============================================================================
// CONSENSUS MANAGER EVENTS
// =============================================================================

export interface ConsensusManagerEvents {
  'proposal:created': (proposal: Proposal) => void;
  'proposal:accepted': (result: ProposalResult) => void;
  'proposal:rejected': (result: ProposalResult) => void;
  'proposal:timeout': (proposalId: string) => void;
  'vote:received': (proposalId: string, voterId: string, approve: boolean) => void;
  'state:changed': (key: string, value: unknown, previousValue?: unknown) => void;
  'leader:elected': (leaderId: string) => void;
  'leader:lost': () => void;
  'node:joined': (node: ConsensusNode) => void;
  'node:left': (nodeId: string) => void;
}

// =============================================================================
// SIMPLE MAJORITY PROTOCOL
// =============================================================================

/**
 * Simple majority voting consensus
 * Each node votes on proposals, majority wins
 */
class SimpleMajorityProtocol implements ConsensusProtocol {
  readonly name: ConsensusMechanism = 'simple_majority';
  readonly nodeId: string;

  private nodes: Map<string, ConsensusNode> = new Map();
  private state: Map<string, unknown> = new Map();
  private proposals: Map<string, Proposal> = new Map();
  private config: Required<ConsensusConfig>;
  private eventEmitter: EventEmitter;
  private proposalTimeouts: Map<string, NodeJS.Timeout> = new Map();

  constructor(nodeId: string, config: Required<ConsensusConfig>, eventEmitter: EventEmitter) {
    this.nodeId = nodeId;
    this.config = config;
    this.eventEmitter = eventEmitter;

    // Add self as first node
    this.nodes.set(nodeId, { id: nodeId });
  }

  isLeader(): boolean {
    // In simple majority, any node can propose
    return true;
  }

  getLeaderId(): string | null {
    // No leader in simple majority
    return null;
  }

  async propose<T>(key: string, value: T): Promise<ProposalResult<T>> {
    const proposalId = generateProposalId(this.nodeId);
    const now = Date.now();

    const proposal: Proposal<T> = {
      id: proposalId,
      key,
      value,
      proposerId: this.nodeId,
      timestamp: now,
      status: 'voting',
      votes: new Map(),
    };

    this.proposals.set(proposalId, proposal as Proposal);
    this.eventEmitter.emit('proposal:created', proposal);

    // Vote for own proposal
    this.vote(proposalId, this.nodeId, true);

    // Set timeout for proposal
    return new Promise<ProposalResult<T>>((resolve) => {
      const timeout = setTimeout(() => {
        const p = this.proposals.get(proposalId);
        if (p && p.status === 'voting') {
          p.status = 'timeout';
          this.eventEmitter.emit('proposal:timeout', proposalId);
          resolve({
            proposalId,
            accepted: false,
            key,
            votes: this.countVotes(proposalId),
            error: 'Proposal timed out',
          });
        }
        this.proposalTimeouts.delete(proposalId);
      }, this.config.timeout);

      this.proposalTimeouts.set(proposalId, timeout);

      // Check if already have quorum (single node case)
      this.checkQuorum(proposalId, resolve);
    });
  }

  private vote(proposalId: string, voterId: string, approve: boolean): void {
    const proposal = this.proposals.get(proposalId);
    if (!proposal || proposal.status !== 'voting') {
      return;
    }

    proposal.votes.set(voterId, approve);
    this.eventEmitter.emit('vote:received', proposalId, voterId, approve);
  }

  private checkQuorum<T>(proposalId: string, resolve: (result: ProposalResult<T>) => void): void {
    const proposal = this.proposals.get(proposalId);
    if (!proposal || proposal.status !== 'voting') {
      return;
    }

    const clusterSize = this.nodes.size;
    const quorum = this.config.quorum || calculateQuorum(clusterSize);
    const { for: forVotes, against: againstVotes } = this.countVotes(proposalId);

    // Check for acceptance
    if (hasQuorum(forVotes, clusterSize, quorum)) {
      proposal.status = 'accepted';
      const previousValue = this.state.get(proposal.key);
      this.state.set(proposal.key, proposal.value);

      const result: ProposalResult<T> = {
        proposalId,
        accepted: true,
        key: proposal.key,
        value: proposal.value as T,
        votes: { for: forVotes, against: againstVotes, total: clusterSize },
      };

      this.clearProposalTimeout(proposalId);
      this.eventEmitter.emit('proposal:accepted', result);
      this.eventEmitter.emit('state:changed', proposal.key, proposal.value, previousValue);
      resolve(result);
      return;
    }

    // Check for rejection (enough against votes to never reach quorum)
    const remainingVotes = clusterSize - forVotes - againstVotes;
    if (forVotes + remainingVotes < quorum) {
      proposal.status = 'rejected';

      const result: ProposalResult<T> = {
        proposalId,
        accepted: false,
        key: proposal.key,
        votes: { for: forVotes, against: againstVotes, total: clusterSize },
        error: 'Proposal rejected by majority',
      };

      this.clearProposalTimeout(proposalId);
      this.eventEmitter.emit('proposal:rejected', result);
      resolve(result);
    }
  }

  private countVotes(proposalId: string): { for: number; against: number; total: number } {
    const proposal = this.proposals.get(proposalId);
    if (!proposal) {
      return { for: 0, against: 0, total: this.nodes.size };
    }

    let forVotes = 0;
    let againstVotes = 0;
    for (const vote of proposal.votes.values()) {
      if (vote) forVotes++;
      else againstVotes++;
    }

    return { for: forVotes, against: againstVotes, total: this.nodes.size };
  }

  private clearProposalTimeout(proposalId: string): void {
    const timeout = this.proposalTimeouts.get(proposalId);
    if (timeout) {
      clearTimeout(timeout);
      this.proposalTimeouts.delete(proposalId);
    }
  }

  get<T>(key: string): T | undefined {
    return this.state.get(key) as T | undefined;
  }

  getState(): Map<string, unknown> {
    return new Map(this.state);
  }

  addNode(node: ConsensusNode): void {
    this.nodes.set(node.id, node);
    this.eventEmitter.emit('node:joined', node);
  }

  removeNode(nodeId: string): void {
    this.nodes.delete(nodeId);
    this.eventEmitter.emit('node:left', nodeId);
  }

  getNodes(): ConsensusNode[] {
    return Array.from(this.nodes.values());
  }

  handleMessage(fromNodeId: string, message: unknown): void {
    const msg = message as { type: string; proposalId?: string; approve?: boolean };

    if (msg.type === 'vote' && msg.proposalId !== undefined && msg.approve !== undefined) {
      this.vote(msg.proposalId, fromNodeId, msg.approve);

      // Re-check quorum for pending proposals
      const proposal = this.proposals.get(msg.proposalId);
      if (proposal && proposal.status === 'voting') {
        // Create a resolver that emits events
        this.checkQuorum(msg.proposalId, () => {});
      }
    }
  }

  start(): void {
    // No-op for simple majority
  }

  stop(): void {
    // Clear all timeouts
    for (const timeout of this.proposalTimeouts.values()) {
      clearTimeout(timeout);
    }
    this.proposalTimeouts.clear();
  }
}

// =============================================================================
// PBFT PROTOCOL
// =============================================================================

/**
 * PBFT message phases
 */
type PBFTPhase = 'pre-prepare' | 'prepare' | 'commit';

/**
 * PBFT message
 */
interface PBFTMessage {
  type: PBFTPhase | 'view-change' | 'new-view';
  view: number;
  sequenceNumber: number;
  digest: string;
  senderId: string;
  proposalId?: string;
  key?: string;
  value?: unknown;
}

/**
 * Internal PBFT proposal state tracking through the 3-phase protocol
 */
interface PBFTProposalState<T = unknown> {
  proposal: Proposal<T>;
  sequenceNumber: number;
  view: number;
  digest: string;
  prepareMessages: Set<string>; // nodeIds that sent prepare
  commitMessages: Set<string>; // nodeIds that sent commit
  prePrepared: boolean;
  prepared: boolean;
  committed: boolean;
  resolve: (result: ProposalResult<T>) => void;
}

/**
 * Practical Byzantine Fault Tolerance consensus protocol
 *
 * Tolerates f = floor((n-1)/3) Byzantine faults.
 * Three-phase protocol: Pre-prepare -> Prepare -> Commit
 * Requires 2f+1 matching messages for prepare and commit quorums.
 */
class PBFTProtocol implements ConsensusProtocol {
  readonly name: ConsensusMechanism = 'pbft';
  readonly nodeId: string;

  private nodes: Map<string, ConsensusNode> = new Map();
  private state: Map<string, unknown> = new Map();
  private config: Required<ConsensusConfig>;
  private eventEmitter: EventEmitter;

  // PBFT state
  private view: number = 0;
  private sequenceNumber: number = 0;
  private proposals: Map<string, PBFTProposalState> = new Map();
  private proposalTimeouts: Map<string, NodeJS.Timeout> = new Map();

  // View change state
  private viewChangeTimer: NodeJS.Timeout | null = null;
  private viewChangeVotes: Map<number, Set<string>> = new Map(); // view -> nodeIds

  // Message sender callback
  private sendMessage: ((toNodeId: string, message: PBFTMessage) => void) | null = null;

  constructor(nodeId: string, config: Required<ConsensusConfig>, eventEmitter: EventEmitter) {
    this.nodeId = nodeId;
    this.config = config;
    this.eventEmitter = eventEmitter;

    // Add self as first node
    this.nodes.set(nodeId, { id: nodeId });
  }

  /**
   * Set the message sender callback for node-to-node communication
   */
  setMessageSender(sender: (toNodeId: string, message: PBFTMessage) => void): void {
    this.sendMessage = sender;
  }

  /**
   * Maximum number of Byzantine faults tolerated: f = floor((n-1)/3)
   */
  private get f(): number {
    return Math.floor((this.nodes.size - 1) / 3);
  }

  /**
   * Quorum size needed for prepare and commit phases: 2f+1
   */
  private get quorumSize(): number {
    return 2 * this.f + 1;
  }

  /**
   * The primary (leader) for the current view
   */
  private get primaryId(): string {
    const nodeIds = Array.from(this.nodes.keys()).sort();
    return nodeIds[this.view % nodeIds.length];
  }

  /**
   * Compute a simple digest for message validation
   */
  private computeDigest(key: string, value: unknown): string {
    const content = JSON.stringify({ key, value });
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash |= 0; // Convert to 32-bit integer
    }
    return `pbft-${Math.abs(hash).toString(16)}`;
  }

  isLeader(): boolean {
    return this.primaryId === this.nodeId;
  }

  getLeaderId(): string | null {
    return this.primaryId;
  }

  async propose<T>(key: string, value: T): Promise<ProposalResult<T>> {
    // Only the primary can initiate proposals
    if (!this.isLeader()) {
      return {
        proposalId: '',
        accepted: false,
        key,
        votes: { for: 0, against: 0, total: this.nodes.size },
        error: `Not primary. Current primary is ${this.primaryId}`,
      };
    }

    const proposalId = generateProposalId(this.nodeId);
    const seqNum = ++this.sequenceNumber;
    const digest = this.computeDigest(key, value);

    const proposal: Proposal<T> = {
      id: proposalId,
      key,
      value,
      proposerId: this.nodeId,
      timestamp: Date.now(),
      status: 'voting',
      votes: new Map(),
    };

    this.eventEmitter.emit('proposal:created', proposal);

    return new Promise<ProposalResult<T>>((resolve) => {
      const pbftState: PBFTProposalState<T> = {
        proposal,
        sequenceNumber: seqNum,
        view: this.view,
        digest,
        prepareMessages: new Set(),
        commitMessages: new Set(),
        prePrepared: true, // Primary has pre-prepared
        prepared: false,
        committed: false,
        resolve,
      };

      this.proposals.set(proposalId, pbftState as PBFTProposalState);

      // Set timeout for the proposal
      const timeout = setTimeout(() => {
        const state = this.proposals.get(proposalId);
        if (state && !state.committed) {
          state.proposal.status = 'timeout';
          this.eventEmitter.emit('proposal:timeout', proposalId);
          state.resolve({
            proposalId,
            accepted: false,
            key,
            votes: { for: state.commitMessages.size, against: 0, total: this.nodes.size },
            error: 'Proposal timed out',
          });
          this.proposals.delete(proposalId);
          this.startViewChangeTimer();
        }
        this.proposalTimeouts.delete(proposalId);
      }, this.config.timeout);

      this.proposalTimeouts.set(proposalId, timeout);

      // Phase 1: Broadcast PRE-PREPARE to all replicas
      this.broadcastMessage({
        type: 'pre-prepare',
        view: this.view,
        sequenceNumber: seqNum,
        digest,
        senderId: this.nodeId,
        proposalId,
        key,
        value,
      });

      // Single-node case: self-complete immediately
      if (this.nodes.size === 1) {
        this.completePBFT(proposalId);
      }
    });
  }

  get<T>(key: string): T | undefined {
    return this.state.get(key) as T | undefined;
  }

  getState(): Map<string, unknown> {
    return new Map(this.state);
  }

  addNode(node: ConsensusNode): void {
    this.nodes.set(node.id, node);
    this.eventEmitter.emit('node:joined', node);
  }

  removeNode(nodeId: string): void {
    this.nodes.delete(nodeId);
    this.eventEmitter.emit('node:left', nodeId);
  }

  getNodes(): ConsensusNode[] {
    return Array.from(this.nodes.values());
  }

  handleMessage(fromNodeId: string, message: unknown): void {
    const msg = message as PBFTMessage;

    // Validate message view
    if (msg.view !== undefined && msg.view < this.view && msg.type !== 'view-change') {
      return; // Ignore messages from old views
    }

    switch (msg.type) {
      case 'pre-prepare':
        this.handlePrePrepare(fromNodeId, msg);
        break;
      case 'prepare':
        this.handlePrepare(fromNodeId, msg);
        break;
      case 'commit':
        this.handleCommit(fromNodeId, msg);
        break;
      case 'view-change':
        this.handleViewChange(fromNodeId, msg);
        break;
      case 'new-view':
        this.handleNewView(fromNodeId, msg);
        break;
    }
  }

  /**
   * Phase 1: Handle PRE-PREPARE message (received by replicas from primary)
   */
  private handlePrePrepare(fromNodeId: string, msg: PBFTMessage): void {
    // Only accept pre-prepare from the current primary
    if (fromNodeId !== this.primaryId) {
      return;
    }

    // Validate message
    if (msg.view !== this.view) {
      return;
    }

    // Validate digest
    if (msg.key !== undefined && msg.value !== undefined) {
      const expectedDigest = this.computeDigest(msg.key, msg.value);
      if (expectedDigest !== msg.digest) {
        return; // Digest mismatch - possible Byzantine behavior
      }
    }

    const proposalId = msg.proposalId!;

    // Create local proposal state if we don't have it
    if (!this.proposals.has(proposalId)) {
      const proposal: Proposal = {
        id: proposalId,
        key: msg.key!,
        value: msg.value,
        proposerId: fromNodeId,
        timestamp: Date.now(),
        status: 'voting',
        votes: new Map(),
      };

      const pbftState: PBFTProposalState = {
        proposal,
        sequenceNumber: msg.sequenceNumber,
        view: msg.view,
        digest: msg.digest,
        prepareMessages: new Set(),
        commitMessages: new Set(),
        prePrepared: true,
        prepared: false,
        committed: false,
        resolve: () => {}, // Replicas don't have a resolve callback
      };

      this.proposals.set(proposalId, pbftState);
    }

    // Phase 2: Send PREPARE to all nodes
    this.broadcastMessage({
      type: 'prepare',
      view: this.view,
      sequenceNumber: msg.sequenceNumber,
      digest: msg.digest,
      senderId: this.nodeId,
      proposalId,
    });
  }

  /**
   * Phase 2: Handle PREPARE message
   */
  private handlePrepare(fromNodeId: string, msg: PBFTMessage): void {
    const proposalId = msg.proposalId;
    if (!proposalId) return;

    const pbftState = this.proposals.get(proposalId);
    if (!pbftState || pbftState.committed) return;

    // Validate digest matches
    if (msg.digest !== pbftState.digest) {
      return;
    }

    // Record prepare message
    pbftState.prepareMessages.add(fromNodeId);

    // Check if we have 2f+1 prepare messages (including our own pre-prepare acceptance)
    // The prepare quorum needs 2f+1 messages (counting the pre-prepare as one)
    const prepareCount = pbftState.prepareMessages.size + (pbftState.prePrepared ? 1 : 0);

    if (!pbftState.prepared && prepareCount >= this.quorumSize) {
      pbftState.prepared = true;

      // Phase 3: Send COMMIT to all nodes
      this.broadcastMessage({
        type: 'commit',
        view: this.view,
        sequenceNumber: pbftState.sequenceNumber,
        digest: pbftState.digest,
        senderId: this.nodeId,
        proposalId,
      });
    }
  }

  /**
   * Phase 3: Handle COMMIT message
   */
  private handleCommit(fromNodeId: string, msg: PBFTMessage): void {
    const proposalId = msg.proposalId;
    if (!proposalId) return;

    const pbftState = this.proposals.get(proposalId);
    if (!pbftState || pbftState.committed) return;

    // Validate digest
    if (msg.digest !== pbftState.digest) {
      return;
    }

    // Record commit message
    pbftState.commitMessages.add(fromNodeId);

    // Check if we have 2f+1 commit messages
    if (!pbftState.committed && pbftState.commitMessages.size >= this.quorumSize) {
      this.completePBFT(proposalId);
    }
  }

  /**
   * Complete the PBFT protocol - apply state change and resolve
   */
  private completePBFT(proposalId: string): void {
    const pbftState = this.proposals.get(proposalId);
    if (!pbftState || pbftState.committed) return;

    pbftState.committed = true;
    pbftState.proposal.status = 'accepted';

    // Apply to state machine
    const previousValue = this.state.get(pbftState.proposal.key);
    this.state.set(pbftState.proposal.key, pbftState.proposal.value);

    const result: ProposalResult = {
      proposalId,
      accepted: true,
      key: pbftState.proposal.key,
      value: pbftState.proposal.value,
      votes: {
        for: pbftState.commitMessages.size + 1, // +1 for self
        against: 0,
        total: this.nodes.size,
      },
    };

    // Clear timeout
    const timeout = this.proposalTimeouts.get(proposalId);
    if (timeout) {
      clearTimeout(timeout);
      this.proposalTimeouts.delete(proposalId);
    }

    // Cancel any pending view change timer on success
    this.clearViewChangeTimer();

    this.eventEmitter.emit('proposal:accepted', result);
    this.eventEmitter.emit(
      'state:changed',
      pbftState.proposal.key,
      pbftState.proposal.value,
      previousValue
    );

    // Resolve the promise (only the primary's resolve is meaningful)
    pbftState.resolve(result);
  }

  /**
   * Handle VIEW-CHANGE message - triggered on primary timeout
   */
  private handleViewChange(fromNodeId: string, msg: PBFTMessage): void {
    const targetView = msg.view;

    if (!this.viewChangeVotes.has(targetView)) {
      this.viewChangeVotes.set(targetView, new Set());
    }
    this.viewChangeVotes.get(targetView)!.add(fromNodeId);

    // Need 2f+1 view-change messages to proceed
    if (this.viewChangeVotes.get(targetView)!.size >= this.quorumSize) {
      this.view = targetView;
      this.viewChangeVotes.delete(targetView);
      this.clearViewChangeTimer();

      // New primary announces NEW-VIEW
      if (this.isLeader()) {
        this.broadcastMessage({
          type: 'new-view',
          view: this.view,
          sequenceNumber: this.sequenceNumber,
          digest: '',
          senderId: this.nodeId,
        });

        this.eventEmitter.emit('leader:elected', this.nodeId);
      }
    }
  }

  /**
   * Handle NEW-VIEW message from the new primary
   */
  private handleNewView(fromNodeId: string, msg: PBFTMessage): void {
    if (msg.view >= this.view) {
      this.view = msg.view;
      this.clearViewChangeTimer();
      this.eventEmitter.emit('leader:elected', fromNodeId);
    }
  }

  /**
   * Start a view change timer - triggers view change if primary is unresponsive
   */
  private startViewChangeTimer(): void {
    this.clearViewChangeTimer();

    this.viewChangeTimer = setTimeout(() => {
      this.initiateViewChange();
    }, this.config.timeout);
  }

  /**
   * Initiate a view change
   */
  private initiateViewChange(): void {
    const newView = this.view + 1;

    // Add own vote
    if (!this.viewChangeVotes.has(newView)) {
      this.viewChangeVotes.set(newView, new Set());
    }
    this.viewChangeVotes.get(newView)!.add(this.nodeId);

    // Broadcast view-change
    this.broadcastMessage({
      type: 'view-change',
      view: newView,
      sequenceNumber: this.sequenceNumber,
      digest: '',
      senderId: this.nodeId,
    });

    // Check if we already have enough votes (e.g., single node)
    if (this.viewChangeVotes.get(newView)!.size >= this.quorumSize) {
      this.view = newView;
      this.viewChangeVotes.delete(newView);
      this.clearViewChangeTimer();

      if (this.isLeader()) {
        this.eventEmitter.emit('leader:elected', this.nodeId);
      }
    }
  }

  /**
   * Clear the view change timer
   */
  private clearViewChangeTimer(): void {
    if (this.viewChangeTimer) {
      clearTimeout(this.viewChangeTimer);
      this.viewChangeTimer = null;
    }
  }

  /**
   * Broadcast a message to all other nodes
   */
  private broadcastMessage(message: PBFTMessage): void {
    if (!this.sendMessage) return;

    for (const [nodeId] of this.nodes) {
      if (nodeId !== this.nodeId) {
        this.sendMessage(nodeId, message);
      }
    }
  }

  start(): void {
    // Start view change timer to detect primary failure
    if (!this.isLeader()) {
      this.startViewChangeTimer();
    }
  }

  stop(): void {
    // Clear all timeouts
    for (const timeout of this.proposalTimeouts.values()) {
      clearTimeout(timeout);
    }
    this.proposalTimeouts.clear();
    this.clearViewChangeTimer();
  }
}

// =============================================================================
// CONSENSUS MANAGER
// =============================================================================

/**
 * High-level consensus manager
 *
 * Wraps consensus protocols and provides a unified interface for
 * proposing and subscribing to state changes.
 */
export class ConsensusManager extends EventEmitter {
  private protocol: ConsensusProtocol;
  private config: Required<ConsensusConfig>;
  private subscriptions: Map<string, Set<(value: unknown) => void>> = new Map();
  private isRunning: boolean = false;

  constructor(nodeId: string, config: Partial<ConsensusConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONSENSUS_CONFIG, ...config };

    // Create protocol based on mechanism
    switch (this.config.mechanism) {
      case 'raft':
        // Raft is implemented in RaftConsensus.ts
        throw new Error('Use RaftConsensus class directly for Raft protocol');
      case 'pbft':
        this.protocol = new PBFTProtocol(nodeId, this.config, this);
      case 'simple_majority':
      default:
        this.protocol = new SimpleMajorityProtocol(nodeId, this.config, this);
    }

    // Forward state changes to subscriptions
    this.on('state:changed', (key: string, value: unknown) => {
      const subs = this.subscriptions.get(key);
      if (subs) {
        for (const callback of subs) {
          try {
            callback(value);
          } catch (e) {
            console.error(`Subscription callback error for key ${key}:`, e);
          }
        }
      }
    });
  }

  /**
   * Get current node ID
   */
  get nodeId(): string {
    return this.protocol.nodeId;
  }

  /**
   * Start the consensus protocol
   */
  start(): void {
    if (this.isRunning) return;
    this.protocol.start();
    this.isRunning = true;
  }

  /**
   * Stop the consensus protocol
   */
  stop(): void {
    if (!this.isRunning) return;
    this.protocol.stop();
    this.isRunning = false;
  }

  /**
   * Propose a state change
   */
  async propose<T>(key: string, value: T): Promise<boolean> {
    const result = await this.protocol.propose(key, value);
    return result.accepted;
  }

  /**
   * Propose with full result
   */
  async proposeWithResult<T>(key: string, value: T): Promise<ProposalResult<T>> {
    return this.protocol.propose(key, value);
  }

  /**
   * Get current value for key
   */
  get<T>(key: string): T | undefined {
    return this.protocol.get<T>(key);
  }

  /**
   * Get all state
   */
  getState(): Map<string, unknown> {
    return this.protocol.getState();
  }

  /**
   * Subscribe to changes for a key
   */
  subscribe<T>(key: string, callback: (value: T) => void): () => void {
    let subs = this.subscriptions.get(key);
    if (!subs) {
      subs = new Set();
      this.subscriptions.set(key, subs);
    }
    subs.add(callback as (value: unknown) => void);

    // Return unsubscribe function
    return () => {
      subs?.delete(callback as (value: unknown) => void);
      if (subs?.size === 0) {
        this.subscriptions.delete(key);
      }
    };
  }

  /**
   * Check if this node is the leader (Raft) or can propose (simple majority)
   */
  isLeader(): boolean {
    return this.protocol.isLeader();
  }

  /**
   * Get leader ID (null for simple majority)
   */
  getLeader(): ConsensusNode | null {
    const leaderId = this.protocol.getLeaderId();
    if (!leaderId) return null;
    return this.protocol.getNodes().find((n) => n.id === leaderId) || null;
  }

  /**
   * Add a node to the consensus cluster
   */
  addNode(node: ConsensusNode): void {
    this.protocol.addNode(node);
  }

  /**
   * Remove a node from the consensus cluster
   */
  removeNode(nodeId: string): void {
    this.protocol.removeNode(nodeId);
  }

  /**
   * Get all nodes in the cluster
   */
  getNodes(): ConsensusNode[] {
    return this.protocol.getNodes();
  }

  /**
   * Handle incoming message from another node
   */
  handleMessage(fromNodeId: string, message: unknown): void {
    this.protocol.handleMessage(fromNodeId, message);
  }

  /**
   * Get the underlying protocol
   */
  getProtocol(): ConsensusProtocol {
    return this.protocol;
  }
}
