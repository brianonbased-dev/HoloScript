/**
 * Agent Extension Types
 *
 * Core extensibility interfaces for HoloScript agent system.
 * Consumers (like uaa2-service) can implement these to add
 * application-specific features.
 */

// ============================================================================
// Actor Model Interfaces
// ============================================================================

/**
 * Reference to an agent that may or may not be active.
 * Decouples caller from agent lifecycle.
 */
export interface IAgentRef<T = unknown> {
  readonly agentId: string;

  /**
   * Send message without waiting for response (fire-and-forget)
   */
  tell(message: T): Promise<void>;

  /**
   * Send message and wait for response (request-response)
   */
  ask<R = unknown>(message: T, timeoutMs?: number): Promise<R>;

  /**
   * Get current agent state (may wake agent if dormant)
   */
  getState(): Promise<unknown>;

  /**
   * Check if agent is currently active
   */
  isActive(): Promise<boolean>;
}

/**
 * Factory for creating agent references
 */
export interface IAgentRefFactory {
  /**
   * Get reference to an agent (does not wake it)
   */
  getRef<T = unknown>(agentId: string): IAgentRef<T>;

  /**
   * Spawn a new agent and return reference
   */
  spawn<T = unknown>(agentType: string, config?: Record<string, unknown>): Promise<IAgentRef<T>>;

  /**
   * Stop an agent
   */
  stop(agentId: string): Promise<void>;
}

/**
 * Message queue/mailbox for agent
 */
export interface IAgentMailbox<T = unknown> {
  /**
   * Enqueue a message
   */
  enqueue(message: T, priority?: 'low' | 'normal' | 'high'): void;

  /**
   * Dequeue next message
   */
  dequeue(): T | undefined;

  /**
   * Peek at next message without removing
   */
  peek(): T | undefined;

  /**
   * Get queue depth
   */
  size(): number;

  /**
   * Check if empty
   */
  isEmpty(): boolean;
}

/**
 * Wake-on-demand controller
 */
export interface IWakeOnDemandController {
  /**
   * Ensure agent is active (wake if dormant)
   */
  ensureActive(agentId: string): Promise<boolean>;

  /**
   * Put agent to sleep (persist state, reduce resources)
   */
  sleep(agentId: string): Promise<void>;

  /**
   * Check if agent is dormant
   */
  isDormant(agentId: string): boolean;

  /**
   * Get dormancy duration
   */
  getDormantSince(agentId: string): number | null;
}

// ============================================================================
// Self-Healing Interfaces
// ============================================================================

/**
 * Failure classification
 */
export type FailureType =
  | 'network-timeout'
  | 'api-rate-limit'
  | 'invalid-input'
  | 'storage-error'
  | 'ai-service-error'
  | 'dependency-error'
  | 'memory-error'
  | 'type-error'
  | 'permission-error'
  | 'unknown';

/**
 * Agent failure record
 */
export interface IAgentFailure {
  id: string;
  agentId: string;
  errorType: FailureType;
  message: string;
  stack?: string;
  timestamp: number;
  context?: Record<string, unknown>;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

/**
 * Recovery result
 */
export interface IRecoveryResult {
  success: boolean;
  strategyUsed: string;
  message: string;
  retryRecommended: boolean;
  nextAction?: 'retry' | 'skip' | 'escalate';
}

/**
 * Recovery strategy definition
 */
export interface IRecoveryStrategy {
  /**
   * Unique strategy identifier
   */
  id: string;

  /**
   * Failure types this strategy handles
   */
  handles: FailureType[];

  /**
   * Maximum recovery attempts
   */
  maxAttempts: number;

  /**
   * Backoff between attempts (ms)
   */
  backoffMs: number;

  /**
   * Execute recovery
   */
  execute(failure: IAgentFailure): Promise<IRecoveryResult>;

  /**
   * Check if strategy applies to failure
   */
  matches(failure: IAgentFailure): boolean;
}

/**
 * Self-healing service interface
 */
export interface ISelfHealingService {
  /**
   * Register a recovery strategy
   */
  registerStrategy(strategy: IRecoveryStrategy): void;

  /**
   * Report a failure
   */
  reportFailure(failure: IAgentFailure): Promise<string>;

  /**
   * Attempt automatic recovery
   */
  attemptRecovery(failureId: string): Promise<IRecoveryResult>;

  /**
   * Get failure patterns (for learning)
   */
  getFailurePatterns(agentId?: string): FailurePattern[];

  /**
   * Escalate failure to human/supervisor
   */
  escalate(failureId: string, reason: string): Promise<void>;
}

export interface FailurePattern {
  pattern: string;
  errorType: FailureType;
  frequency: number;
  lastSeen: number;
  suggestedStrategy: string;
  successRate: number;
}

// ============================================================================
// Marketplace/Auction Interfaces
// ============================================================================

/**
 * Task handoff request
 */
export interface IHandoffRequest {
  taskId: string;
  requesterId: string;
  roleRequired: string;
  skills?: string[];
  priority: 'low' | 'normal' | 'high' | 'urgent';
  deadline?: number;
  budget?: number;
  context?: Record<string, unknown>;
}

/**
 * Bid for task handoff
 */
export interface IHandoffBid {
  bidId: string;
  taskId: string;
  bidderId: string;
  cost: number;
  confidence: number; // 0-1
  estimatedDuration: number; // ms
  capabilities: string[];
  timestamp: number;
}

/**
 * Awarded contract
 */
export interface IHandoffContract {
  contractId: string;
  taskId: string;
  requesterId: string;
  providerId: string;
  agreedCost: number;
  deadline: number;
  terms: Record<string, unknown>;
  status: 'active' | 'completed' | 'failed' | 'cancelled';
}

/**
 * Marketplace/auction service
 */
export interface IMarketplaceService {
  /**
   * Broadcast a handoff request
   */
  requestHandoff(request: IHandoffRequest): Promise<IHandoffContract | null>;

  /**
   * Submit a bid for a task
   */
  submitBid(bid: IHandoffBid): void;

  /**
   * Get active auctions
   */
  getActiveAuctions(): IHandoffRequest[];

  /**
   * Select winning bid
   */
  selectBid(taskId: string, bidId: string): Promise<IHandoffContract>;

  /**
   * Auto-select best bid based on criteria
   */
  autoSelect(taskId: string, criteria: BidSelectionCriteria): Promise<IHandoffContract | null>;
}

export interface BidSelectionCriteria {
  maxCost?: number;
  minConfidence?: number;
  maxDuration?: number;
  preferredProviders?: string[];
  weightCost?: number; // 0-1
  weightConfidence?: number; // 0-1
  weightSpeed?: number; // 0-1
}

// ============================================================================
// Hive Mind / Collective Intelligence Interfaces
// ============================================================================

/**
 * Contribution to collective thought
 */
export interface IHiveContribution {
  id: string;
  agentId: string;
  timestamp: number;
  type: 'idea' | 'critique' | 'consensus' | 'solution';
  content: string;
  confidence: number;
}

/**
 * Collective session
 */
export interface IHiveSession {
  id: string;
  topic: string;
  goal: string;
  initiator: string;
  status: 'active' | 'resolved' | 'closed';
  participants: string[];
  contributions: IHiveContribution[];
  resolution?: unknown;
}

/**
 * Collective intelligence service
 */
export interface ICollectiveIntelligenceService {
  /**
   * Create a new session
   */
  createSession(topic: string, goal: string, initiator: string): IHiveSession | Promise<string>;

  /**
   * Join a session
   */
  join(sessionId: string, agentId: string): void | Promise<void>;

  /**
   * Leave a session
   */
  leave(sessionId: string, agentId: string): void | Promise<void>;

  /**
   * Contribute to session
   */
  contribute(
    sessionId: string,
    contribution: Omit<IHiveContribution, 'id' | 'timestamp'>
  ): IHiveContribution | Promise<void>;

  /**
   * Vote on contributions
   */
  vote(
    sessionId: string,
    contributionId: string,
    voterId: string,
    vote: 'support' | 'oppose'
  ): void | Promise<void>;

  /**
   * Synthesize collective wisdom
   */
  synthesize(sessionId: string): unknown;

  /**
   * Resolve and close session
   */
  resolve(sessionId: string, resolution: string | unknown): void | Promise<void>;
}

// ============================================================================
// Swarm Interfaces
// ============================================================================

/**
 * Swarm algorithm configuration
 */
export interface ISwarmConfig {
  algorithm: 'pso' | 'aco' | 'bees' | 'hybrid';
  populationSize: number;
  maxIterations: number;
  convergenceThreshold: number;
  adaptiveSizing?: boolean;
}

/**
 * Swarm optimization result
 */
export interface ISwarmResult {
  bestSolution: number[];
  bestFitness: number;
  converged: boolean;
  iterations: number;
  improvementPercent: number;
}

/**
 * Swarm coordinator interface
 */
export interface ISwarmCoordinator {
  /**
   * Optimize agent-task assignment
   */
  optimize(
    agents: { id: string; capacity: number; load: number }[],
    tasks: { id: string; complexity: number; priority: number }[],
    config?: Partial<ISwarmConfig>
  ): Promise<ISwarmResult>;

  /**
   * Get recommended population size based on problem
   */
  getRecommendedPopulation(problemSize: number): number;
}

/**
 * Leader election interface
 */
export interface ILeaderElection {
  /**
   * Start an election
   */
  startElection(): Promise<string>;

  /**
   * Get current leader
   */
  getLeader(): string | null;

  /**
   * Get own role
   */
  getRole(): 'leader' | 'follower' | 'candidate';

  /**
   * Subscribe to leader changes
   */
  onLeaderChange(callback: (leaderId: string | null) => void): () => void;
}
