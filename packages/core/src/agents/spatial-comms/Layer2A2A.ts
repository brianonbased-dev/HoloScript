/**
 * @holoscript/core - Layer 2: A2A Coordination Layer
 *
 * JSON-RPC over HTTP/2 for agent-to-agent collaboration.
 * Features:
 * - Task assignment and completion tracking
 * - Spatial region claims and conflict resolution
 * - Resource request/release management
 * - Request/response with acknowledgments
 * - Retry with exponential backoff
 */

import { EventEmitter } from 'events';
import { DEFAULT_A2A_CONFIG } from './ProtocolTypes';
import type {
  A2AMessage,
  A2AResponse,
  A2AProtocolConfig,
  TaskSpec,
  ConflictResolutionStrategy,
} from './ProtocolTypes';

// ============================================================================
// A2A MESSAGE QUEUE
// ============================================================================

interface QueuedMessage {
  message: A2AMessage;
  attempt: number;
  maxRetries: number;
  backoffBase: number;
  resolve: (response: A2AResponse) => void;
  reject: (error: Error) => void;
}

/**
 * Message queue for retry management
 */
class MessageQueue {
  private queue: Map<string, QueuedMessage> = new Map();
  private retryTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();

  /**
   * Add message to queue
   */
  add(message: A2AMessage, maxRetries: number, backoffBase: number): Promise<A2AResponse> {
    return new Promise((resolve, reject) => {
      this.queue.set(message.message_id, {
        message,
        attempt: 0,
        maxRetries,
        backoffBase,
        resolve,
        reject,
      });
    });
  }

  /**
   * Get message from queue
   */
  get(messageId: string): QueuedMessage | undefined {
    return this.queue.get(messageId);
  }

  /**
   * Remove message from queue
   */
  remove(messageId: string): void {
    const timer = this.retryTimers.get(messageId);
    if (timer) {
      clearTimeout(timer);
      this.retryTimers.delete(messageId);
    }
    this.queue.delete(messageId);
  }

  /**
   * Schedule retry for message
   */
  scheduleRetry(messageId: string, callback: () => void): void {
    const queued = this.queue.get(messageId);
    if (!queued) return;

    queued.attempt++;

    // Exponential backoff: base * 2^attempt
    const delay = queued.backoffBase * Math.pow(2, queued.attempt - 1);

    const timer = setTimeout(() => {
      this.retryTimers.delete(messageId);
      callback();
    }, delay);

    this.retryTimers.set(messageId, timer);
  }

  /**
   * Check if message should retry
   */
  shouldRetry(messageId: string): boolean {
    const queued = this.queue.get(messageId);
    if (!queued) return false;
    return queued.attempt < queued.maxRetries;
  }

  /**
   * Get queue size
   */
  get size(): number {
    return this.queue.size;
  }

  /**
   * Clear all queued messages
   */
  clear(): void {
    for (const timer of this.retryTimers.values()) {
      clearTimeout(timer);
    }
    this.retryTimers.clear();
    this.queue.clear();
  }
}

// ============================================================================
// SPATIAL CLAIM MANAGER
// ============================================================================

export interface SpatialClaim {
  claim_id: string;
  agent_id: string;
  bounding_box: {
    min: [number, number, number];
    max: [number, number, number];
  };
  priority: 'low' | 'medium' | 'high' | 'critical';
  exclusive: boolean;
  expires_at?: number;
}

/**
 * Spatial claim manager for conflict detection
 */
class SpatialClaimManager {
  private claims: Map<string, SpatialClaim> = new Map();

  /**
   * Add spatial claim
   */
  addClaim(claim: SpatialClaim): void {
    this.claims.set(claim.claim_id, claim);
  }

  /**
   * Remove spatial claim
   */
  removeClaim(claimId: string): void {
    this.claims.delete(claimId);
  }

  /**
   * Get claims by agent
   */
  getClaimsByAgent(agentId: string): SpatialClaim[] {
    return Array.from(this.claims.values()).filter((c) => c.agent_id === agentId);
  }

  /**
   * Check for conflicts with new claim
   */
  checkConflicts(newClaim: SpatialClaim): SpatialClaim[] {
    const conflicts: SpatialClaim[] = [];

    for (const existingClaim of this.claims.values()) {
      // Skip if same agent
      if (existingClaim.agent_id === newClaim.agent_id) continue;

      // Check if bounding boxes overlap
      if (this.boundingBoxesOverlap(newClaim.bounding_box, existingClaim.bounding_box)) {
        // Check if either claim is exclusive
        if (newClaim.exclusive || existingClaim.exclusive) {
          conflicts.push(existingClaim);
        }
      }
    }

    return conflicts;
  }

  /**
   * Check if two bounding boxes overlap
   */
  private boundingBoxesOverlap(
    box1: { min: [number, number, number]; max: [number, number, number] },
    box2: { min: [number, number, number]; max: [number, number, number] }
  ): boolean {
    return (
      box1.min[0] <= box2.max[0] &&
      box1.max[0] >= box2.min[0] &&
      box1.min[1] <= box2.max[1] &&
      box1.max[1] >= box2.min[1] &&
      box1.min[2] <= box2.max[2] &&
      box1.max[2] >= box2.min[2]
    );
  }

  /**
   * Cleanup expired claims
   */
  cleanup(): void {
    const now = Date.now();
    for (const [claimId, claim] of this.claims) {
      if (claim.expires_at && claim.expires_at < now) {
        this.claims.delete(claimId);
      }
    }
  }

  /**
   * Get all claims
   */
  getAllClaims(): SpatialClaim[] {
    return Array.from(this.claims.values());
  }

  /**
   * Clear all claims
   */
  clear(): void {
    this.claims.clear();
  }
}

// ============================================================================
// LAYER 2 CLIENT
// ============================================================================

/**
 * Layer 2 A2A Coordination Client
 */
export class Layer2A2AClient extends EventEmitter {
  private config: A2AProtocolConfig;
  private agentId: string;
  private messageQueue: MessageQueue = new MessageQueue();
  private claimManager: SpatialClaimManager = new SpatialClaimManager();
  private messageHandlers: Map<string, (message: A2AMessage) => Promise<A2AResponse>> = new Map();
  private batchBuffer: A2AMessage[] = [];
  private batchTimer?: ReturnType<typeof setTimeout>;

  constructor(agentId: string, config?: Partial<A2AProtocolConfig>) {
    super();
    this.agentId = agentId;
    this.config = { ...DEFAULT_A2A_CONFIG, ...config } as A2AProtocolConfig;

    // Start periodic cleanup
    setInterval(() => {
      this.claimManager.cleanup();
    }, 60000); // Every minute
  }

  /**
   * Send A2A message with retry
   */
  async send(
    message: Omit<A2AMessage, 'message_id' | 'from_agent' | 'timestamp'>
  ): Promise<A2AResponse> {
    // Generate message ID and add metadata
    const fullMessage: A2AMessage = {
      ...message,
      message_id: this.generateMessageId(),
      from_agent: this.agentId,
      timestamp: Date.now(),
    } as A2AMessage;

    // Add to batch if batching enabled
    if (this.config.enableBatching) {
      return this.addToBatch(fullMessage);
    }

    // Send immediately
    return this.sendMessage(fullMessage);
  }

  /**
   * Send task assignment
   */
  async assignTask(toAgent: string, task: TaskSpec): Promise<A2AResponse> {
    return this.send({
      type: 'task_assignment',
      to_agent: toAgent,
      task,
    } as any);
  }

  /**
   * Send task completion
   */
  async completeTask(
    taskId: string,
    success: boolean,
    result?: any,
    error?: string,
    performanceMetrics?: {
      duration_ms: number;
      frame_time_avg_ms: number;
      frame_time_max_ms: number;
      quality_level: 'high' | 'medium' | 'low' | 'minimal';
    }
  ): Promise<A2AResponse> {
    return this.send({
      type: 'task_complete',
      task_id: taskId,
      success,
      result,
      error,
      performance_metrics: performanceMetrics,
    } as any);
  }

  /**
   * Claim spatial region
   */
  async claimSpatialRegion(
    claimId: string,
    boundingBox: {
      min: [number, number, number];
      max: [number, number, number];
    },
    priority: 'low' | 'medium' | 'high' | 'critical',
    durationMs?: number,
    exclusive = true
  ): Promise<A2AResponse> {
    // Create claim
    const claim: SpatialClaim = {
      claim_id: claimId,
      agent_id: this.agentId,
      bounding_box: boundingBox,
      priority,
      exclusive,
      expires_at: durationMs ? Date.now() + durationMs : undefined,
    };

    // Check for conflicts
    const conflicts = this.claimManager.checkConflicts(claim);

    if (conflicts.length > 0) {
      // Emit conflict event
      this.emit('spatial_conflict', {
        claim,
        conflicts,
      });

      // If any conflict has higher or equal priority, fail
      const hasHigherPriority = conflicts.some((c) => {
        const priorities = ['low', 'medium', 'high', 'critical'];
        return priorities.indexOf(c.priority) >= priorities.indexOf(priority);
      });

      if (hasHigherPriority) {
        return {
          message_id: this.generateMessageId(),
          success: false,
          error: 'Spatial conflict with higher priority claim',
          data: { conflicts },
          timestamp: Date.now(),
        };
      }
    }

    // Add claim
    this.claimManager.addClaim(claim);

    // Send claim message
    return this.send({
      type: 'spatial_claim',
      claim_id: claimId,
      bounding_box: boundingBox,
      priority,
      duration_ms: durationMs,
      exclusive,
    } as any);
  }

  /**
   * Resolve spatial conflict
   */
  async resolveConflict(
    conflictId: string,
    involvedAgents: string[],
    strategy: ConflictResolutionStrategy,
    resolutionParams?: Record<string, any>
  ): Promise<A2AResponse> {
    return this.send({
      type: 'conflict_resolution',
      conflict_id: conflictId,
      strategy,
      involved_agents: involvedAgents,
      resolution_params: resolutionParams,
    } as any);
  }

  /**
   * Request resource
   */
  async requestResource(
    resourceId: string,
    resourceType: 'mesh' | 'texture' | 'material' | 'audio' | 'compute' | 'memory',
    amount?: number,
    priority: 'low' | 'medium' | 'high' | 'critical' = 'medium'
  ): Promise<A2AResponse> {
    return this.send({
      type: 'resource_request',
      resource_id: resourceId,
      resource_type: resourceType,
      amount,
      priority,
    } as any);
  }

  /**
   * Release resource
   */
  async releaseResource(resourceId: string): Promise<A2AResponse> {
    return this.send({
      type: 'resource_release',
      resource_id: resourceId,
    } as any);
  }

  /**
   * Perform agent handshake
   */
  async handshake(
    toAgent: string,
    capabilities: string[],
    protocolVersion: string
  ): Promise<A2AResponse> {
    return this.send({
      type: 'agent_handshake',
      to_agent: toAgent,
      capabilities,
      protocol_version: protocolVersion,
    } as any);
  }

  /**
   * Register message handler
   */
  onMessage(messageType: string, handler: (message: A2AMessage) => Promise<A2AResponse>): void {
    this.messageHandlers.set(messageType, handler);
  }

  /**
   * Handle incoming message
   */
  async handleIncoming(message: A2AMessage): Promise<A2AResponse> {
    // Emit event
    this.emit('message', message);
    this.emit(message.type, message);

    // Check if handler registered
    const handler = this.messageHandlers.get(message.type);
    if (handler) {
      return handler(message);
    }

    // Default response
    return {
      message_id: message.message_id,
      success: true,
      timestamp: Date.now(),
    };
  }

  /**
   * Get spatial claims for this agent
   */
  getMyClaims(): SpatialClaim[] {
    return this.claimManager.getClaimsByAgent(this.agentId);
  }

  /**
   * Get all spatial claims
   */
  getAllClaims(): SpatialClaim[] {
    return this.claimManager.getAllClaims();
  }

  /**
   * Send message with retry logic
   */
  private async sendMessage(message: A2AMessage): Promise<A2AResponse> {
    // Add to queue
    const responsePromise = this.messageQueue.add(
      message,
      this.config.maxRetries,
      this.config.retryBackoffBase
    );

    // Attempt to send
    this.attemptSend(message);

    return responsePromise;
  }

  /**
   * Attempt to send message
   */
  private async attemptSend(message: A2AMessage): Promise<void> {
    try {
      // Send HTTP/2 request
      const response = await this.httpRequest(message);

      // Get queued message
      const queued = this.messageQueue.get(message.message_id);
      if (!queued) return;

      // Resolve promise
      queued.resolve(response);
      this.messageQueue.remove(message.message_id);

      // Emit success
      this.emit('message_sent', { message, response });
    } catch (error) {
      // Get queued message
      const queued = this.messageQueue.get(message.message_id);
      if (!queued) return;

      // Check if should retry
      if (this.messageQueue.shouldRetry(message.message_id)) {
        this.emit('retry', { message, attempt: queued.attempt });
        this.messageQueue.scheduleRetry(message.message_id, () => {
          this.attemptSend(message);
        });
      } else {
        // Max retries exceeded
        queued.reject(error as Error);
        this.messageQueue.remove(message.message_id);
        this.emit('message_failed', { message, error });
      }
    }
  }

  /**
   * HTTP/2 request
   */
  private async httpRequest(message: A2AMessage): Promise<A2AResponse> {
    // In a real implementation, this would use HTTP/2
    // For now, using fetch with timeout

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      const response = await fetch(this.config.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(message),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      return data as A2AResponse;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Add message to batch
   */
  private addToBatch(message: A2AMessage): Promise<A2AResponse> {
    this.batchBuffer.push(message);

    // Create promise for response
    const responsePromise = new Promise<A2AResponse>((resolve, reject) => {
      // Store resolve/reject in message queue
      this.messageQueue
        .add(message, this.config.maxRetries, this.config.retryBackoffBase)
        .then(resolve)
        .catch(reject);
    });

    // Schedule batch send if not already scheduled
    if (!this.batchTimer) {
      this.batchTimer = setTimeout(() => {
        this.flushBatch();
      }, 10); // 10ms batch window
    }

    // Check if batch is full
    if (this.batchBuffer.length >= this.config.batchSize) {
      this.flushBatch();
    }

    return responsePromise;
  }

  /**
   * Flush batch of messages
   */
  private flushBatch(): void {
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = undefined;
    }

    if (this.batchBuffer.length === 0) return;

    const batch = this.batchBuffer.splice(0);

    // Send batch
    for (const message of batch) {
      this.attemptSend(message);
    }
  }

  /**
   * Generate unique message ID
   */
  private generateMessageId(): string {
    return `${this.agentId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get queue statistics
   */
  getQueueStats(): {
    queueSize: number;
    claimCount: number;
  } {
    return {
      queueSize: this.messageQueue.size,
      claimCount: this.getAllClaims().length,
    };
  }

  /**
   * Shutdown client
   */
  async shutdown(): Promise<void> {
    // Flush any pending batches
    this.flushBatch();

    // Clear claims
    this.claimManager.clear();

    // Clear queue
    this.messageQueue.clear();

    this.emit('shutdown');
  }
}
