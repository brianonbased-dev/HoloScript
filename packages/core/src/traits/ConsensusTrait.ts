/**
 * Consensus Trait
 * Sprint 4 Priority 5 - Consensus Mechanisms
 *
 * HoloScript trait that provides consensus capabilities to entities,
 * allowing them to participate in distributed state management.
 */

import { EventEmitter } from 'events';
import {
  ConsensusConfig,
  ConsensusNode,
  ProposalResult,
  ConsensusMechanism,
} from '../consensus/ConsensusTypes';
import { ConsensusManager } from '../consensus/ConsensusManager';
import { RaftConsensus } from '../consensus/RaftConsensus';

// =============================================================================
// TRAIT CONFIGURATION
// =============================================================================

/**
 * Configuration for the consensus trait
 */
export interface ConsensusTraitConfig extends Partial<ConsensusConfig> {
  /** Unique node ID (defaults to entity ID) */
  nodeId?: string;

  /** Initial cluster nodes to connect to */
  initialNodes?: ConsensusNode[];

  /** Callback for sending messages to other nodes */
  messageSender?: (toNodeId: string, message: unknown) => void;
}

/**
 * Default trait configuration
 */
const DEFAULT_TRAIT_CONFIG: ConsensusTraitConfig = {
  mechanism: 'simple_majority',
  timeout: 5000,
};

// =============================================================================
// CONSENSUS TRAIT
// =============================================================================

/**
 * Trait that enables an entity to participate in consensus
 *
 * @example
 * ```holoscript
 * entity#voter {
 *   @trait consensus {
 *     mechanism: "simple_majority"
 *     timeout: 5000
 *   }
 *
 *   @on_state_change(key, value) {
 *     log("Consensus reached: {key} = {value}")
 *   }
 * }
 * ```
 */
export class ConsensusTrait extends EventEmitter {
  private entityId: string;
  private manager: ConsensusManager | null = null;
  private raft: RaftConsensus | null = null;
  private config: ConsensusTraitConfig;
  private isStarted: boolean = false;
  private subscriptions: Map<string, () => void> = new Map();

  constructor(entityId: string, config: ConsensusTraitConfig = {}) {
    super();
    this.entityId = entityId;
    this.config = { ...DEFAULT_TRAIT_CONFIG, ...config };
  }

  // ===========================================================================
  // LIFECYCLE
  // ===========================================================================

  /**
   * Start the consensus trait
   */
  start(): void {
    if (this.isStarted) return;

    const nodeId = this.config.nodeId || this.entityId;
    const mechanism = this.config.mechanism || 'simple_majority';

    if (mechanism === 'raft') {
      // Create Raft consensus
      this.raft = new RaftConsensus(nodeId, this.config);

      // Set up message sender if provided
      if (this.config.messageSender) {
        this.raft.setMessageSender(this.config.messageSender);
      }

      // Forward events
      this.raft.on('leader:elected', (leaderId: string) => {
        this.emit('leader:elected', leaderId);
      });

      this.raft.on('state:changed', (key: string, value: unknown, prev?: unknown) => {
        this.emit('state:changed', key, value, prev);
      });

      this.raft.on('node:joined', (node: ConsensusNode) => {
        this.emit('node:joined', node);
      });

      this.raft.on('node:left', (nodeId: string) => {
        this.emit('node:left', nodeId);
      });

      // Add initial nodes
      if (this.config.initialNodes) {
        for (const node of this.config.initialNodes) {
          this.raft.addNode(node);
        }
      }

      this.raft.start();
    } else {
      // Create simple majority manager
      this.manager = new ConsensusManager(nodeId, this.config);

      // Forward events
      this.manager.on('proposal:accepted', (result: ProposalResult) => {
        this.emit('proposal:accepted', result);
      });

      this.manager.on('proposal:rejected', (result: ProposalResult) => {
        this.emit('proposal:rejected', result);
      });

      this.manager.on('state:changed', (key: string, value: unknown, prev?: unknown) => {
        this.emit('state:changed', key, value, prev);
      });

      this.manager.on('node:joined', (node: ConsensusNode) => {
        this.emit('node:joined', node);
      });

      this.manager.on('node:left', (nodeId: string) => {
        this.emit('node:left', nodeId);
      });

      // Add initial nodes
      if (this.config.initialNodes) {
        for (const node of this.config.initialNodes) {
          this.manager.addNode(node);
        }
      }

      this.manager.start();
    }

    this.isStarted = true;
    this.emit('started');
  }

  /**
   * Stop the consensus trait
   */
  stop(): void {
    if (!this.isStarted) return;

    // Unsubscribe all
    for (const unsub of this.subscriptions.values()) {
      unsub();
    }
    this.subscriptions.clear();

    if (this.raft) {
      this.raft.stop();
      this.raft = null;
    }

    if (this.manager) {
      this.manager.stop();
      this.manager = null;
    }

    this.isStarted = false;
    this.emit('stopped');
  }

  // ===========================================================================
  // CONSENSUS OPERATIONS
  // ===========================================================================

  /**
   * Propose a state change
   */
  async propose<T>(key: string, value: T): Promise<boolean> {
    if (this.raft) {
      const result = await this.raft.propose(key, value);
      return result.accepted;
    }

    if (this.manager) {
      return this.manager.propose(key, value);
    }

    return false;
  }

  /**
   * Propose with full result details
   */
  async proposeWithResult<T>(key: string, value: T): Promise<ProposalResult<T>> {
    if (this.raft) {
      return this.raft.propose(key, value);
    }

    if (this.manager) {
      return this.manager.proposeWithResult(key, value);
    }

    return {
      proposalId: '',
      accepted: false,
      key,
      votes: { for: 0, against: 0, total: 0 },
      error: 'Consensus not started',
    };
  }

  /**
   * Get current value for key
   */
  get<T>(key: string): T | undefined {
    if (this.raft) {
      return this.raft.get<T>(key);
    }

    if (this.manager) {
      return this.manager.get<T>(key);
    }

    return undefined;
  }

  /**
   * Get all consensus state
   */
  getState(): Map<string, unknown> {
    if (this.raft) {
      return this.raft.getState();
    }

    if (this.manager) {
      return this.manager.getState();
    }

    return new Map();
  }

  /**
   * Subscribe to changes for a key
   */
  subscribe<T>(key: string, callback: (value: T) => void): () => void {
    if (this.manager) {
      const unsub = this.manager.subscribe(key, callback);
      this.subscriptions.set(key, unsub);
      return () => {
        unsub();
        this.subscriptions.delete(key);
      };
    }

    // For Raft, use event listener
    const handler = (changedKey: string, value: unknown) => {
      if (changedKey === key) {
        callback(value as T);
      }
    };

    this.on('state:changed', handler);
    return () => {
      this.off('state:changed', handler);
    };
  }

  // ===========================================================================
  // CLUSTER MANAGEMENT
  // ===========================================================================

  /**
   * Check if this node is the leader
   */
  isLeader(): boolean {
    if (this.raft) {
      return this.raft.isLeader();
    }

    if (this.manager) {
      return this.manager.isLeader();
    }

    return false;
  }

  /**
   * Get the current leader
   */
  getLeader(): ConsensusNode | null {
    if (this.raft) {
      const leaderId = this.raft.getLeaderId();
      if (leaderId) {
        return this.raft.getNodes().find((n) => n.id === leaderId) || null;
      }
      return null;
    }

    if (this.manager) {
      return this.manager.getLeader();
    }

    return null;
  }

  /**
   * Get all nodes in the cluster
   */
  getNodes(): ConsensusNode[] {
    if (this.raft) {
      return this.raft.getNodes();
    }

    if (this.manager) {
      return this.manager.getNodes();
    }

    return [];
  }

  /**
   * Add a node to the cluster
   */
  addNode(node: ConsensusNode): void {
    if (this.raft) {
      this.raft.addNode(node);
    } else if (this.manager) {
      this.manager.addNode(node);
    }
  }

  /**
   * Remove a node from the cluster
   */
  removeNode(nodeId: string): void {
    if (this.raft) {
      this.raft.removeNode(nodeId);
    } else if (this.manager) {
      this.manager.removeNode(nodeId);
    }
  }

  /**
   * Handle incoming message from another node
   */
  handleMessage(fromNodeId: string, message: unknown): void {
    if (this.raft) {
      this.raft.handleMessage(fromNodeId, message);
    } else if (this.manager) {
      this.manager.handleMessage(fromNodeId, message);
    }
  }

  // ===========================================================================
  // UTILITY
  // ===========================================================================

  /**
   * Get the node ID
   */
  getNodeId(): string {
    return this.config.nodeId || this.entityId;
  }

  /**
   * Get the consensus mechanism being used
   */
  getMechanism(): ConsensusMechanism {
    return this.config.mechanism || 'simple_majority';
  }

  /**
   * Check if the trait is running
   */
  isRunning(): boolean {
    return this.isStarted;
  }

  /**
   * Get debug state (Raft only)
   */
  getDebugState(): unknown {
    if (this.raft) {
      return this.raft.getDebugState();
    }
    return null;
  }
}

// =============================================================================
// FACTORY FUNCTION
// =============================================================================

/**
 * Create a consensus trait for an entity
 */
export function createConsensusTrait(
  entityId: string,
  config?: ConsensusTraitConfig
): ConsensusTrait {
  return new ConsensusTrait(entityId, config);
}

// ── Handler (delegates to ConsensusTrait) ──
import type { TraitHandler, HSPlusNode, TraitContext, TraitEvent } from './TraitTypes';

export const consensusHandler = {
  name: 'consensus',
  defaultConfig: {},
  onAttach(node: HSPlusNode, config: any, ctx: TraitContext): void {
    const instance = new ConsensusTrait(config);
    node.__consensus_instance = instance;
    ctx.emit('consensus_attached', { node, config });
  },
  onDetach(node: HSPlusNode, _config: any, ctx: TraitContext): void {
    const instance = node.__consensus_instance as any;
    if (instance) {
      if (typeof instance.onDetach === 'function') instance.onDetach(node, ctx);
      else if (typeof instance.dispose === 'function') instance.dispose();
      else if (typeof instance.cleanup === 'function') instance.cleanup();
    }
    ctx.emit('consensus_detached', { node });
    delete node.__consensus_instance;
  },
  onEvent(node: HSPlusNode, _config: any, ctx: TraitContext, event: TraitEvent): void {
    const instance = node.__consensus_instance as any;
    if (!instance) return;
    if (typeof instance.onEvent === 'function') instance.onEvent(event);
    else if (typeof instance.emit === 'function' && event.type) instance.emit(event);
    if (event.type === 'consensus_configure' && event.payload) {
      Object.assign(instance, event.payload);
      ctx.emit('consensus_configured', { node });
    }
  },
  onUpdate(node: HSPlusNode, _config: any, ctx: TraitContext, dt: number): void {
    const instance = node.__consensus_instance as any;
    if (!instance) return;
    if (typeof instance.onUpdate === 'function') instance.onUpdate(node, ctx, dt);
  },
} as const satisfies TraitHandler;
