/**
 * BrainServerClient.ts
 *
 * P.NET.04: Batched HTTP client for the Brain Server.
 * Queues agent inference requests and flushes them in configurable batch sizes
 * to a dedicated GPU server (e.g., RTX 4090 running vLLM).
 *
 * Usage:
 * ```ts
 * const brain = new BrainServerClient({
 *   url: 'http://brain-server:8000/v1/batch',
 *   maxConcurrent: 100,
 *   batchSize: 16,
 *   timeoutMs: 3000,
 *   model: 'tinyllama-1.1b',
 * });
 *
 * brain.queueInference('agent_42', { goal: 'patrol', observation: '...' });
 * const results = await brain.flush();
 * ```
 */

import type { BrainServerConfig } from './NetworkManager';

// =============================================================================
// TYPES
// =============================================================================

/** A single agent inference request */
export interface AgentInferenceRequest {
  /** Unique agent identifier */
  agentId: string;
  /** Agent context (goal, observations, state) sent as the prompt payload */
  context: Record<string, unknown>;
  /** When this request was queued */
  queuedAt: number;
}

/** A single agent inference response */
export interface AgentInferenceResponse {
  agentId: string;
  /** Model output (next action, reasoning, etc.) */
  output: Record<string, unknown>;
  /** Inference latency in ms */
  latencyMs: number;
  /** Whether this response succeeded */
  success: boolean;
  /** Error message if !success */
  error?: string;
}

/** Batch result from a single flush */
export interface BatchResult {
  responses: AgentInferenceResponse[];
  totalLatencyMs: number;
  batchSize: number;
}

// =============================================================================
// CLIENT
// =============================================================================

export class BrainServerClient {
  private config: BrainServerConfig;
  private queue: AgentInferenceRequest[] = [];
  private inflight: number = 0;

  /** Custom fetch function — injectable for testing */
  private fetchFn: typeof globalThis.fetch;

  constructor(config: BrainServerConfig, fetchFn?: typeof globalThis.fetch) {
    this.config = config;
    this.fetchFn = fetchFn ?? globalThis.fetch?.bind(globalThis);
  }

  /**
   * Queue an inference request for an agent.
   * Requests accumulate until flush() is called.
   */
  queueInference(agentId: string, context: Record<string, unknown>): void {
    this.queue.push({ agentId, context, queuedAt: Date.now() });
  }

  /**
   * Get the number of pending (queued) requests.
   */
  getQueueSize(): number {
    return this.queue.length;
  }

  /**
   * Get the number of in-flight requests (currently being processed).
   */
  getInflightCount(): number {
    return this.inflight;
  }

  /**
   * Flush the queue — sends batched requests to the Brain Server.
   * Returns results for all queued inferences.
   * Respects maxConcurrent and batchSize from config.
   */
  async flush(): Promise<BatchResult> {
    if (this.queue.length === 0) {
      return { responses: [], totalLatencyMs: 0, batchSize: 0 };
    }

    // Take up to maxConcurrent from the queue
    const toProcess = this.queue.splice(0, this.config.maxConcurrent);
    const allResponses: AgentInferenceResponse[] = [];
    const startTime = Date.now();

    // Process in batches
    for (let i = 0; i < toProcess.length; i += this.config.batchSize) {
      const batch = toProcess.slice(i, i + this.config.batchSize);
      this.inflight += batch.length;

      try {
        const batchResponses = await this.sendBatch(batch);
        allResponses.push(...batchResponses);
      } catch (error) {
        // On batch failure, generate error responses for each agent
        for (const req of batch) {
          allResponses.push({
            agentId: req.agentId,
            output: {},
            latencyMs: Date.now() - req.queuedAt,
            success: false,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      } finally {
        this.inflight -= batch.length;
      }
    }

    return {
      responses: allResponses,
      totalLatencyMs: Date.now() - startTime,
      batchSize: toProcess.length,
    };
  }

  /**
   * Check if the Brain Server is reachable.
   */
  async isAvailable(): Promise<boolean> {
    try {
      const healthUrl = this.config.url.replace(/\/v1\/.*$/, '/health');
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 2000);

      const response = await this.fetchFn(healthUrl, {
        method: 'GET',
        signal: controller.signal,
      });
      clearTimeout(timeout);
      return response.ok;
    } catch {
      return false;
    }
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  private async sendBatch(batch: AgentInferenceRequest[]): Promise<AgentInferenceResponse[]> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);

    try {
      const response = await this.fetchFn(this.config.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.config.model,
          requests: batch.map((req) => ({
            agent_id: req.agentId,
            context: req.context,
          })),
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        throw new Error(`Brain Server returned ${response.status}: ${response.statusText}`);
      }

      const data = (await response.json()) as {
        results?: Array<{ agent_id: string; output: Record<string, unknown> }>;
      };

      return (data.results ?? []).map((result, idx) => ({
        agentId: result.agent_id ?? batch[idx]?.agentId ?? 'unknown',
        output: result.output ?? {},
        latencyMs: Date.now() - batch[idx].queuedAt,
        success: true,
      }));
    } catch (error) {
      clearTimeout(timeout);
      throw error;
    }
  }
}
