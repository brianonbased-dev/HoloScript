/**
 * MCP Agent Orchestration Framework
 *
 * Coordinates multiple AI agents using the Model Context Protocol (MCP).
 * Enables parallel agent execution, result aggregation, and fault recovery.
 *
 * Features:
 * - Agent registration and discovery
 * - Distributed tool execution
 * - Result aggregation strategies
 * - Fallback and retry logic
 * - Resource pooling
 *
 * @version 1.1.1
 * @roadmap v3.1 (March 2026)
 */

// =============================================================================
// TYPES
// =============================================================================

export enum AgentType {
  BUILDER = 'builder', // Code generation, templates
  WORKER = 'worker', // Runtime execution
  ANALYZER = 'analyzer', // Code analysis
  OPTIMIZER = 'optimizer', // Performance optimization
  TESTER = 'tester', // Testing and validation
}

export interface MCPAgent {
  id: string;
  name: string;
  type: AgentType;
  description: string;
  tools: Map<string, MCPTool>;
  capabilities: string[];
  version: string;
  isReady(): Promise<boolean>;
}

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
  execute(params: Record<string, unknown>): Promise<unknown>;
}

export interface OrchestrationTask {
  id: string;
  name: string;
  description: string;
  steps: OrchestrationStep[];
  config: {
    parallel?: boolean;
    timeout?: number;
    retries?: number;
  };
}

export interface OrchestrationStep {
  id: string;
  agentId: string;
  toolName: string;
  params: Record<string, unknown>;
  dependsOn?: string[]; // Step IDs to wait for
}

export interface TaskResult {
  taskId: string;
  status: 'success' | 'failure' | 'partial';
  results: Map<string, unknown>;
  steps: { id: string; status: 'success' | 'failure'; result?: unknown; error?: string }[];
  durationMs: number;
  error?: Error;
}

export interface MCPOrchestrationConfig {
  /** Number of agent slots */
  maxConcurrentAgents: number;

  /** Global timeout in ms */
  timeoutMs: number;

  /** Retry failed steps */
  maxRetries: number;

  /** Aggregation strategy for results */
  aggregationStrategy: 'first-success' | 'all-responses' | 'consensus' | 'best-response';

  /** Enable caching */
  enableCache: boolean;

  /** Enable metrics collection */
  enableMetrics: boolean;
}

// =============================================================================
// MCP ORCHESTRATOR
// =============================================================================

/**
 * Orchestrates multiple MCP agents for coordinated task execution
 */
export class MCPOrchestrator {
  private agents = new Map<string, MCPAgent>();
  private config: Required<MCPOrchestrationConfig>;
  private taskQueue: OrchestrationTask[] = [];
  private activeAgents = new Map<string, Promise<unknown>>();
  private metrics: Map<string, any> = new Map();
  private toolCache = new Map<string, unknown>();

  constructor(config: Partial<MCPOrchestrationConfig> = {}) {
    this.config = {
      maxConcurrentAgents: 5,
      timeoutMs: 300000, // 5 minutes
      maxRetries: 2,
      aggregationStrategy: 'first-success',
      enableCache: true,
      enableMetrics: true,
      ...config,
    };
  }

  /**
   * Register an agent
   */
  registerAgent(agent: MCPAgent): void {
    this.agents.set(agent.id, agent);
  }

  /**
   * Unregister an agent
   */
  unregisterAgent(agentId: string): void {
    this.agents.delete(agentId);
  }

  /**
   * Get an agent by ID
   */
  getAgent(agentId: string): MCPAgent | undefined {
    return this.agents.get(agentId);
  }

  /**
   * List all registered agents
   */
  listAgents(): MCPAgent[] {
    return Array.from(this.agents.values());
  }

  /**
   * Discover agents by type or capability
   */
  discoverAgents(filter: { type?: AgentType; capability?: string; ready?: boolean }): MCPAgent[] {
    return Array.from(this.agents.values()).filter((agent) => {
      if (filter.type && agent.type !== filter.type) return false;
      if (filter.capability && !agent.capabilities.includes(filter.capability)) return false;
      return true;
    });
  }

  /**
   * Execute a single tool directly
   */
  async executeTool(
    agentId: string,
    toolName: string,
    params: Record<string, unknown>
  ): Promise<any> {
    const agent = this.agents.get(agentId);
    if (!agent) throw new Error(`Agent ${agentId} not found`);

    const tool = agent.tools.get(toolName);
    if (!tool) throw new Error(`Tool ${toolName} not found on agent ${agentId}`);

    // Check cache
    const cacheKey = `${agentId}:${toolName}:${JSON.stringify(params)}`;
    if (this.config.enableCache && this.toolCache.has(cacheKey)) {
      this.recordMetric('cache_hit', { agentId, toolName });
      return this.toolCache.get(cacheKey);
    }

    const start = Date.now();
    let result;

    // Retries handled by caller or basic retry here for direct tool exec
    let lastError;
    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      try {
        // Use the new executeStep logic for the actual execution
        // We construct a temporary step object
        result = await this.executeStep({
          id: `direct-exec-${Date.now()}`,
          agentId,
          toolName,
          params,
        });
        break; // Success
      } catch (err) {
        lastError = err;
        if (attempt < this.config.maxRetries) {
          await new Promise((r) => setTimeout(r, 100 * (attempt + 1)));
        }
      }
    }

    if (!result && lastError) throw lastError;

    if (this.config.enableCache) {
      this.toolCache.set(cacheKey, result);
    }

    if (this.config.enableMetrics) {
      this.recordMetric('execution', {
        agentId,
        toolName,
        duration: Date.now() - start,
        success: true,
      });
    }

    return result;
  }

  /**
   * Execute an orchestrated task
   */
  async executeTask(task: OrchestrationTask): Promise<TaskResult> {
    const startTime = Date.now();
    const results = new Map<string, unknown>();
    const completed = new Set<string>();
    const stepStatuses: {
      id: string;
      status: 'success' | 'failure';
      result?: unknown;
      error?: string;
    }[] = [];

    try {
      // Topological sort or simple dependency resolution
      // For now, we loop until all steps are done or we get stuck
      const remainingSteps = new Set(task.steps);
      const failedSteps = new Set<string>();

      while (remainingSteps.size > 0) {
        let itemsProcessed = 0;
        const promises: Promise<void>[] = [];

        for (const step of remainingSteps) {
          // Check dependencies
          const deps = step.dependsOn || [];
          const ready = deps.every((d) => completed.has(d));
          const blockedByFailure = deps.some((d) => failedSteps.has(d));

          if (blockedByFailure) {
            failedSteps.add(step.id);
            stepStatuses.push({ id: step.id, status: 'failure', error: 'Dependency failed' });
            remainingSteps.delete(step);
            itemsProcessed++;
            continue;
          }

          if (ready) {
            remainingSteps.delete(step);
            itemsProcessed++;

            // Execute step (possibly in parallel with others in this batch if configured)
            const executionPromise = (async () => {
              try {
                // We call executeStep directly to ensure tracking,
                // but executeTool handles caching/metrics better?
                // executeTool now calls executeStep! So logic is shared.
                // But executeTask shouldn't double-count metric if executeTool records it.
                // step.id logic is better in executeTask.

                const result = await this.executeTool(step.agentId, step.toolName, step.params);
                results.set(step.id, result);
                completed.add(step.id);
                stepStatuses.push({ id: step.id, status: 'success', result });
              } catch (error: unknown) {
                failedSteps.add(step.id);
                stepStatuses.push({ id: step.id, status: 'failure', error: error instanceof Error ? error.message : String(error) });
                if (!task.config.parallel) throw error;
              }
            })();

            if (task.config.parallel) {
              promises.push(executionPromise);
            } else {
              await executionPromise;
            }
          }
        }

        if (promises.length > 0) {
          await Promise.all(promises);
        }

        if (itemsProcessed === 0 && remainingSteps.size > 0) {
          throw new Error('Circular dependency or missing dependency detected');
        }
      }

      if (failedSteps.size > 0) {
        throw new Error(`Task failed with ${failedSteps.size} error(s)`);
      }

      return {
        taskId: task.id,
        status: 'success',
        results,
        steps: stepStatuses,
        durationMs: Date.now() - startTime,
      };
    } catch (error: unknown) {
      return {
        taskId: task.id,
        status: 'failure',
        results,
        steps: stepStatuses,
        durationMs: Date.now() - startTime,
        // @ts-expect-error During migration
        error,
      };
    }
  }

  /**
   * Run tools purely (helper for test compatibility?)
   */
  async runTools(tools: { agentId: string; toolName: string; params: unknown }[]): Promise<any[]> {
    const results = await Promise.all(
      tools.map((t) => this.executeTool(t.agentId, t.toolName, t.params))
    );
    return results;
  }

  /**
   * Execute multiple tasks in parallel with result aggregation
   */
  async executeParallel(tasks: OrchestrationTask[]): Promise<Map<string, TaskResult>> {
    const results = new Map<string, TaskResult>();
    await Promise.all(
      tasks.map(async (task) => {
        const res = await this.executeTask(task);
        results.set(task.id, res);
      })
    );
    return results;
  }

  invalidateCache(): void {
    this.toolCache.clear();
  }

  resetMetrics(): void {
    this.metrics.clear();
  }

  /**
   * Get agent metrics
   */
  getMetrics(): Record<string, any> {
    const metricsObj: Record<string, any> = {
      totalExecutions: 0,
      activeAgents: this.activeAgents.size,
      cacheHits: 0,
      averageExecutionTime: 0,
    };

    let totalExec = 0;
    let totalTime = 0;
    let cacheHits = 0;

    for (const [key, val] of this.metrics.entries()) {
      if (key.startsWith('execution')) {
        totalExec++;
        totalTime += val.duration || 0;
      } else if (key.startsWith('cache_hit')) {
        cacheHits++;
      }
    }

    metricsObj.totalExecutions = totalExec;
    metricsObj.cacheHits = cacheHits;
    metricsObj.averageExecutionTime = totalExec > 0 ? totalTime / totalExec : 0;

    return metricsObj;
  }

  // Private methods

  private async executeStep(step: OrchestrationStep, timeoutMs?: number): Promise<unknown> {
    const agent = this.agents.get(step.agentId);
    if (!agent) {
      throw new Error(`Agent ${step.agentId} not found`);
    }

    if (!(await agent.isReady())) {
      throw new Error(`Agent ${step.agentId} is not ready`);
    }

    const tool = agent.tools.get(step.toolName);
    if (!tool) {
      throw new Error(`Tool ${step.toolName} not found on agent ${step.agentId}`);
    }

    // Execute with timeout
    const timeout = timeoutMs || this.config.timeoutMs;

    const promise = Promise.race([
      tool.execute(step.params),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Step ${step.id} timeout after ${timeout}ms`)), timeout)
      ),
    ]);

    this.activeAgents.set(step.agentId, promise);

    try {
      const result = await promise;
      return result;
    } finally {
      this.activeAgents.delete(step.agentId);
    }
  }

  private recordMetric(name: string, data: unknown): void {
    const key = `${name}-${Date.now()}-${Math.random()}`;
    this.metrics.set(key, data);

    if (this.metrics.size > 1000) {
      const entries = Array.from(this.metrics.entries());
      this.metrics.delete(entries[0][0]);
    }
  }

  private aggregateResults(
    results: Map<string, Map<string, unknown>>
  ): Map<string, Map<string, unknown>> {
    return results;
  }
}

/**
 * Create orchestrator instance
 */
export function createMCPOrchestrator(config?: Partial<MCPOrchestrationConfig>): MCPOrchestrator {
  return new MCPOrchestrator(config);
}
