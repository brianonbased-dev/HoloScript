/**
 * @holoscript/core - Task Delegation Service
 *
 * Cross-agent task forwarding with support for local (in-process) and remote
 * (A2A JSON-RPC) delegation. Includes auto-delegation via capability matching,
 * retry with exponential backoff, and delegation history tracking.
 *
 * Part of HoloScript v5.5 "Agents as Universal Orchestrators".
 */

import { randomUUID } from 'crypto';
import {
  canonicalTaskToA2ASendMessage,
  createCanonicalTaskEnvelope,
} from '@holoscript/agent-protocol';
import type { AgentManifest } from './AgentManifest';
import type { AgentRegistry } from './AgentRegistry';
import type { CapabilityQuery } from './CapabilityMatcher';
import type { FederatedRegistryAdapter } from './FederatedRegistryAdapter';

// =============================================================================
// TYPES
// =============================================================================

export interface DelegationRequest {
  /** Target agent ID (from AgentManifest.id) */
  targetAgentId: string;
  /** Skill/tool name to invoke on the target agent */
  skillId: string;
  /** Arguments to pass to the skill */
  arguments: Record<string, unknown>;
  /** Timeout in ms (default 30_000) */
  timeout?: number;
  /** Number of retries on failure (default 0) */
  retries?: number;
  /** Callback URL for async results (reserved for future use) */
  callbackUrl?: string;
}

export interface DelegationResult {
  /** Unique task ID for tracking */
  taskId: string;
  /** Final delegation status */
  status: 'completed' | 'failed' | 'timeout' | 'rejected';
  /** Result data on success */
  result?: unknown;
  /** Error message on failure */
  error?: string;
  /** Total execution time in ms */
  durationMs: number;
  /** Info about the delegated agent */
  delegatedTo: { agentId: string; endpoint: string };
}

export interface TaskDelegationConfig {
  /** Default timeout for delegations in ms (default 30_000) */
  defaultTimeout: number;
  /** Maximum delegation history entries (default 1000, LRU eviction) */
  maxHistory: number;
  /** Custom fetch function (for testing) */
  fetchFn?: (url: string, init?: RequestInit) => Promise<Response>;
  /** Local tool executor for in-process agents */
  localExecutor?: (skillId: string, args: Record<string, unknown>) => Promise<unknown>;
  /** Optional observability hook for per-task delegation trace events */
  traceHook?: (event: DelegationTraceEvent) => void;
  /** Optional transport adapter for remote A2A calls */
  transportAdapter?: A2ATransportAdapter;
  /** Optional idempotency key factory for remote A2A calls */
  idempotencyKeyFactory?: (ctx: {
    taskId: string;
    attempt: number;
    endpointUrl: string;
    skillId: string;
  }) => string;
}

export interface A2ATransportAdapter {
  send(input: {
    endpointUrl: string;
    requestBody: Record<string, unknown>;
    idempotencyKey: string;
    fetchFn: (url: string, init?: RequestInit) => Promise<Response>;
  }): Promise<unknown>;
}

export type DelegationTracePhase =
  | 'start'
  | 'attempt'
  | 'retry'
  | 'success'
  | 'failure'
  | 'timeout'
  | 'rejected'
  | 'replay_requested'
  | 'replay_completed'
  | 'replay_failed';

export interface DelegationTraceEvent {
  taskId: string;
  phase: DelegationTracePhase;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

const DEFAULT_CONFIG: TaskDelegationConfig = {
  defaultTimeout: 30_000,
  maxHistory: 1000,
};

// =============================================================================
// TASK DELEGATION SERVICE
// =============================================================================

export class TaskDelegationService {
  private registry: AgentRegistry;
  private adapter?: FederatedRegistryAdapter;
  private config: TaskDelegationConfig;
  private history: DelegationResult[] = [];
  private traceHistory: DelegationTraceEvent[] = [];
  private requestHistory = new Map<string, DelegationRequest>();

  constructor(
    registry: AgentRegistry,
    adapter?: FederatedRegistryAdapter,
    config: Partial<TaskDelegationConfig> = {}
  ) {
    this.registry = registry;
    this.adapter = adapter;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ===========================================================================
  // DELEGATION
  // ===========================================================================

  /**
   * Delegate a task to a specific agent by ID.
   */
  async delegateTo(request: DelegationRequest): Promise<DelegationResult> {
    const startTime = Date.now();
    const taskId = randomUUID();
    const timeout = request.timeout ?? this.config.defaultTimeout;
    const maxRetries = request.retries ?? 0;

    this.requestHistory.set(taskId, { ...request, arguments: { ...request.arguments } });
    this.emitTrace(taskId, 'start', {
      targetAgentId: request.targetAgentId,
      skillId: request.skillId,
      timeout,
      maxRetries,
    });

    // Resolve target agent
    const manifest = this.registry.get(request.targetAgentId);
    if (!manifest) {
      const result: DelegationResult = {
        taskId,
        status: 'rejected',
        error: `Agent not found: ${request.targetAgentId}`,
        durationMs: Date.now() - startTime,
        delegatedTo: { agentId: request.targetAgentId, endpoint: 'unknown' },
      };
      this.addToHistory(result);
      this.emitTrace(taskId, 'rejected', { reason: result.error });
      return result;
    }

    const endpoint = this.getPrimaryEndpoint(manifest);
    const delegatedTo = { agentId: manifest.id, endpoint: endpoint?.address || 'local' };

    // Retry loop
    let lastError = '';
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      this.emitTrace(taskId, 'attempt', { attempt, maxRetries });
      if (attempt > 0) {
        // Exponential backoff with jitter
        const delay = Math.min(1000 * Math.pow(2, attempt - 1) + Math.random() * 200, 10_000);
        this.emitTrace(taskId, 'retry', { attempt, delayMs: delay });
        await this.sleep(delay);
      }

      try {
        const result = await this.executeWithTimeout(
          () => this.executeOnAgent(manifest, request.skillId, request.arguments, taskId, attempt),
          timeout
        );

        const delegationResult: DelegationResult = {
          taskId,
          status: 'completed',
          result,
          durationMs: Date.now() - startTime,
          delegatedTo,
        };
        this.addToHistory(delegationResult);
        this.emitTrace(taskId, 'success', { attempt });
        return delegationResult;
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
        if (lastError === 'TIMEOUT') {
          const result: DelegationResult = {
            taskId,
            status: 'timeout',
            error: `Delegation timed out after ${timeout}ms`,
            durationMs: Date.now() - startTime,
            delegatedTo,
          };
          this.addToHistory(result);
          this.emitTrace(taskId, 'timeout', { attempt, timeoutMs: timeout });
          return result;
        }
        this.emitTrace(taskId, 'failure', { attempt, error: lastError });
        // Continue retrying on non-timeout errors
      }
    }

    // All retries exhausted
    const result: DelegationResult = {
      taskId,
      status: 'failed',
      error: lastError || 'Unknown error',
      durationMs: Date.now() - startTime,
      delegatedTo,
    };
    this.addToHistory(result);
    this.emitTrace(taskId, 'failure', { retriesExhausted: true, error: result.error });
    return result;
  }

  /**
   * Auto-delegate: find the best agent for a capability then delegate.
   */
  async autoDelegate(
    query: CapabilityQuery,
    skillId: string,
    args: Record<string, unknown>,
    options?: { timeout?: number; retries?: number }
  ): Promise<DelegationResult> {
    // Find the best agent
    const bestAgent = await this.registry.findBest({
      ...query,
      includeOffline: false,
    });

    if (!bestAgent) {
      const startTime = Date.now();
      const result: DelegationResult = {
        taskId: randomUUID(),
        status: 'rejected',
        error: `No agent found matching query: ${JSON.stringify(query)}`,
        durationMs: Date.now() - startTime,
        delegatedTo: { agentId: 'none', endpoint: 'none' },
      };
      this.addToHistory(result);
      return result;
    }

    return this.delegateTo({
      targetAgentId: bestAgent.id,
      skillId,
      arguments: args,
      timeout: options?.timeout,
      retries: options?.retries,
    });
  }

  /**
   * Get the status of a previously delegated task from history.
   */
  getStatus(taskId: string): DelegationResult | undefined {
    return this.history.find((r) => r.taskId === taskId);
  }

  /**
   * Get the full delegation history.
   */
  getDelegationHistory(): DelegationResult[] {
    return [...this.history];
  }

  /**
   * Get observability trace events for delegations (optionally filtered by taskId).
   */
  getTraceHistory(taskId?: string): DelegationTraceEvent[] {
    if (!taskId) return [...this.traceHistory];
    return this.traceHistory.filter((event) => event.taskId === taskId);
  }

  /**
   * Replay a previously delegated task using its original request payload.
   */
  async replay(
    taskId: string,
    overrides: Partial<DelegationRequest> = {}
  ): Promise<DelegationResult> {
    const original = this.requestHistory.get(taskId);
    if (!original) {
      throw new Error(`Replay unavailable for taskId: ${taskId}`);
    }

    const replayRequest: DelegationRequest = {
      ...original,
      ...overrides,
      arguments: {
        ...original.arguments,
        ...(overrides.arguments ?? {}),
      },
    };

    this.emitTrace(taskId, 'replay_requested', {
      targetAgentId: replayRequest.targetAgentId,
      skillId: replayRequest.skillId,
    });

    try {
      const replayResult = await this.delegateTo(replayRequest);
      this.emitTrace(taskId, 'replay_completed', { replayTaskId: replayResult.taskId });
      return replayResult;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.emitTrace(taskId, 'replay_failed', { error: message });
      throw error;
    }
  }

  /**
   * Get delegation stats.
   */
  getStats(): {
    total: number;
    completed: number;
    failed: number;
    timeout: number;
    rejected: number;
  } {
    return {
      total: this.history.length,
      completed: this.history.filter((r) => r.status === 'completed').length,
      failed: this.history.filter((r) => r.status === 'failed').length,
      timeout: this.history.filter((r) => r.status === 'timeout').length,
      rejected: this.history.filter((r) => r.status === 'rejected').length,
    };
  }

  // ===========================================================================
  // PRIVATE HELPERS
  // ===========================================================================

  /**
   * Execute a skill on an agent (local or remote).
   */
  private async executeOnAgent(
    manifest: AgentManifest,
    skillId: string,
    args: Record<string, unknown>,
    taskId: string,
    attempt: number
  ): Promise<unknown> {
    const endpoint = this.getPrimaryEndpoint(manifest);

    // Local agent: use local executor
    if (!endpoint || endpoint.protocol === 'local') {
      if (this.config.localExecutor) {
        return this.config.localExecutor(skillId, args);
      }
      throw new Error(`No local executor configured for agent ${manifest.id}`);
    }

    // Remote agent: A2A JSON-RPC sendMessage
    if (endpoint.protocol === 'http' || endpoint.protocol === 'https') {
      return this.executeRemote(endpoint.address, skillId, args, taskId, attempt);
    }

    throw new Error(`Unsupported endpoint protocol: ${endpoint.protocol}`);
  }

  /**
   * Execute via remote A2A JSON-RPC.
   */
  private async executeRemote(
    endpointUrl: string,
    skillId: string,
    args: Record<string, unknown>,
    taskId: string,
    attempt: number
  ): Promise<unknown> {
    const fetchFn = this.config.fetchFn || globalThis.fetch;
    const idempotencyKey =
      this.config.idempotencyKeyFactory?.({
        taskId,
        attempt,
        endpointUrl,
        skillId,
      }) ?? `hs-delegation-${taskId}-attempt-${attempt}`;

    const envelope = createCanonicalTaskEnvelope({
      id: taskId,
      intent: skillId,
      skillId,
      input: args,
      idempotency_key: idempotencyKey,
      timeout: this.config.defaultTimeout,
    });

    const jsonRpcRequest = canonicalTaskToA2ASendMessage(envelope, randomUUID());

    if (this.config.transportAdapter) {
      return this.config.transportAdapter.send({
        endpointUrl,
        requestBody: jsonRpcRequest as Record<string, unknown>,
        idempotencyKey,
        fetchFn,
      });
    }

    const response = await fetchFn(endpointUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify(jsonRpcRequest),
    });

    if (!response.ok) {
      throw new Error(`Remote agent returned HTTP ${response.status}`);
    }

    const data = (await response.json()) as {
      result?: { status?: string; artifacts?: unknown[] };
      error?: { message: string };
    };

    if (data.error) {
      throw new Error(data.error.message);
    }

    return data.result;
  }

  /**
   * Execute a function with a timeout.
   */
  private async executeWithTimeout<T>(fn: () => Promise<T>, timeoutMs: number): Promise<T> {
    return Promise.race([
      fn(),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('TIMEOUT')), timeoutMs);
      }),
    ]);
  }

  /**
   * Get the primary endpoint from a manifest.
   */
  private getPrimaryEndpoint(manifest: AgentManifest) {
    return manifest.endpoints.find((e) => e.primary) || manifest.endpoints[0];
  }

  /**
   * Add a result to history with LRU eviction.
   */
  private addToHistory(result: DelegationResult): void {
    this.history.push(result);
    while (this.history.length > this.config.maxHistory) {
      const evicted = this.history.shift();
      if (evicted) {
        this.requestHistory.delete(evicted.taskId);
      }
    }
  }

  /**
   * Emit and store delegation observability traces.
   */
  private emitTrace(
    taskId: string,
    phase: DelegationTracePhase,
    metadata?: Record<string, unknown>
  ): void {
    const event: DelegationTraceEvent = {
      taskId,
      phase,
      timestamp: new Date().toISOString(),
      ...(metadata ? { metadata } : {}),
    };
    this.traceHistory.push(event);
    this.config.traceHook?.(event);
  }

  /**
   * Sleep utility.
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
