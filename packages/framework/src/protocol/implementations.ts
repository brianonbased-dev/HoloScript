/**
 * Protocol Implementations
 *
 * Canonical home for BaseAgent, BaseService, GoalSynthesizer, MicroPhaseDecomposer.
 * These were absorbed from @holoscript/agent-protocol which now keeps only specs/interfaces.
 */

// ── Protocol spec types (defined here as canonical source, no circular deps) ──

export enum ProtocolPhase {
  INTAKE = 0,
  REFLECT = 1,
  EXECUTE = 2,
  COMPRESS = 3,
  REINTAKE = 4,
  GROW = 5,
  EVOLVE = 6,
  AUTONOMIZE = 7,
}

export interface PhaseResult {
  phase: ProtocolPhase;
  status: 'success' | 'failure' | 'skipped';
  data: unknown;
  durationMs: number;
  timestamp: number;
}

export interface AgentIdentity {
  id: string;
  name: string;
  domain: string;
  version: string;
  capabilities: string[];
}

export interface ProtocolCycleResult {
  cycleId: string;
  task: string;
  domain: string;
  phases: PhaseResult[];
  status: 'complete' | 'partial' | 'failed';
  totalDurationMs: number;
  startedAt: number;
  completedAt: number;
}

export interface Goal {
  id: string;
  description: string;
  category: string;
  priority: 'low' | 'medium' | 'high';
  estimatedComplexity: number;
  generatedAt: string;
  source: 'autonomous-boredom' | 'user-instruction' | 'system-mandate';
}

export interface MicroPhaseTask {
  id: string;
  name: string;
  estimatedDuration: number;
  dependencies: string[];
  execute: () => Promise<unknown>;
  priority?: number;
  timeout?: number;
  retryCount?: number;
}

export interface MicroPhaseGroup {
  id: string;
  name: string;
  tasks: MicroPhaseTask[];
  parallel: boolean;
  estimatedDuration: number;
}

export interface ExecutionPlan {
  groups: MicroPhaseGroup[];
  totalEstimatedTime: number;
  parallelizationRatio: number;
}

export interface ExecutionResult {
  taskId: string;
  status: 'success' | 'failure' | 'timeout' | 'skipped';
  duration: number;
  result?: unknown;
  error?: Error;
  timestamp: number;
}

export interface ServiceMetadata {
  name: string;
  version: string;
  description: string;
  dependencies?: string[];
  lifecycle: string;
  initializedAt?: Date;
  readyAt?: Date;
}

export interface ServiceMetrics {
  requestCount: number;
  errorCount: number;
  latency: { p50: number; p95: number; p99: number };
  lastRequestAt?: Date;
  lastErrorAt?: Date;
}

export interface ServiceConfig {
  enabled: boolean;
  timeout: number;
  retries: number;
  [key: string]: unknown;
}

export type PWGSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface Pattern {
  id: string;
  domain: string;
  problem: string;
  solution: string;
  context?: string;
  tags: string[];
  confidence: number;
  createdAt: number;
  updatedAt: number;
}

export interface Wisdom {
  id: string;
  domain: string;
  insight: string;
  context: string;
  source: string;
  tags: string[];
  createdAt: number;
}

export interface Gotcha {
  id: string;
  domain: string;
  mistake: string;
  fix: string;
  severity: PWGSeverity;
  tags: string[];
  createdAt: number;
}

export type PWGEntry = Pattern | Wisdom | Gotcha;

export function isPattern(entry: PWGEntry): entry is Pattern {
  return entry.id.startsWith('P.');
}
export function isWisdom(entry: PWGEntry): entry is Wisdom {
  return entry.id.startsWith('W.');
}
export function isGotcha(entry: PWGEntry): entry is Gotcha {
  return entry.id.startsWith('G.');
}

// =============================================================================
// BASE AGENT — Abstract 7-phase agent contract
// =============================================================================

export abstract class BaseAgent {
  abstract readonly identity: AgentIdentity;

  /** Phase 0: Gather data and context */
  abstract intake(input: unknown): Promise<PhaseResult>;
  /** Phase 1: Analyze and understand */
  abstract reflect(data: unknown): Promise<PhaseResult>;
  /** Phase 2: Take action */
  abstract execute(plan: unknown): Promise<PhaseResult>;
  /** Phase 3: Store knowledge efficiently */
  abstract compress(results: unknown): Promise<PhaseResult>;
  /** Phase 4: Re-evaluate with compressed knowledge */
  abstract reintake(compressed: unknown): Promise<PhaseResult>;
  /** Phase 5: Learn patterns, wisdom, gotchas */
  abstract grow(learnings: unknown): Promise<PhaseResult>;
  /** Phase 6: Adapt and optimize */
  abstract evolve(adaptations: unknown): Promise<PhaseResult>;

  /**
   * Execute a complete 7-phase cycle
   */
  async runCycle(
    task: string,
    context: Record<string, unknown> = {}
  ): Promise<ProtocolCycleResult> {
    const startedAt = Date.now();
    const cycleId = `cycle_${startedAt}_${Math.random().toString(36).slice(2, 8)}`;
    const phases: PhaseResult[] = [];

    const runPhase = async (
      phase: ProtocolPhase,
      fn: (input: unknown) => Promise<PhaseResult>,
      input: unknown
    ): Promise<PhaseResult> => {
      const start = Date.now();
      try {
        const result = await fn.call(this, input);
        result.durationMs = Date.now() - start;
        phases.push(result);
        return result;
      } catch (err) {
        const failResult: PhaseResult = {
          phase,
          status: 'failure',
          data: err instanceof Error ? err.message : String(err),
          durationMs: Date.now() - start,
          timestamp: Date.now(),
        };
        phases.push(failResult);
        return failResult;
      }
    };

    const intakeResult = await runPhase(ProtocolPhase.INTAKE, this.intake, { task, ...context });
    const reflectResult = await runPhase(ProtocolPhase.REFLECT, this.reflect, intakeResult.data);
    const executeResult = await runPhase(ProtocolPhase.EXECUTE, this.execute, reflectResult.data);
    const compressResult = await runPhase(
      ProtocolPhase.COMPRESS,
      this.compress,
      executeResult.data
    );
    const reintakeResult = await runPhase(
      ProtocolPhase.REINTAKE,
      this.reintake,
      compressResult.data
    );
    const growResult = await runPhase(ProtocolPhase.GROW, this.grow, reintakeResult.data);
    await runPhase(ProtocolPhase.EVOLVE, this.evolve, growResult.data);

    const failed = phases.some((p) => p.status === 'failure');
    return {
      cycleId,
      task,
      domain: this.identity.domain,
      phases,
      status: failed ? 'partial' : 'complete',
      totalDurationMs: Date.now() - startedAt,
      startedAt,
      completedAt: Date.now(),
    };
  }
}

// =============================================================================
// BASE SERVICE — Lifecycle-managed service with metrics
// =============================================================================

export enum ServiceLifecycle {
  INITIALIZING = 'initializing',
  READY = 'ready',
  DEGRADED = 'degraded',
  STOPPING = 'stopping',
  STOPPED = 'stopped',
  ERROR = 'error',
}

export enum ServiceErrorCode {
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  NOT_FOUND = 'NOT_FOUND',
  CONFLICT = 'CONFLICT',
  RATE_LIMIT = 'RATE_LIMIT',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
}

export class ServiceError extends Error {
  constructor(
    public code: ServiceErrorCode,
    message: string,
    public statusCode: number = 500,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'ServiceError';
  }
}

export abstract class BaseService {
  protected metadata: ServiceMetadata;
  protected config: ServiceConfig;
  protected metrics: ServiceMetrics;

  constructor(
    metadata: Omit<ServiceMetadata, 'lifecycle' | 'initializedAt' | 'readyAt'>,
    config?: Partial<ServiceConfig>
  ) {
    this.metadata = { ...metadata, lifecycle: ServiceLifecycle.INITIALIZING };
    this.config = { enabled: true, timeout: 30000, retries: 3, ...config };
    this.metrics = { requestCount: 0, errorCount: 0, latency: { p50: 0, p95: 0, p99: 0 } };
  }

  async initialize(): Promise<void> {
    this.metadata.initializedAt = new Date();
    await this.onInit();
    this.metadata.lifecycle = ServiceLifecycle.READY;
    this.metadata.readyAt = new Date();
    await this.onReady();
  }

  async stop(): Promise<void> {
    if (this.metadata.lifecycle === ServiceLifecycle.STOPPED) return;
    this.metadata.lifecycle = ServiceLifecycle.STOPPING;
    await this.onStop();
    this.metadata.lifecycle = ServiceLifecycle.STOPPED;
  }

  getMetadata(): ServiceMetadata {
    return { ...this.metadata };
  }
  getMetrics(): ServiceMetrics {
    return { ...this.metrics };
  }
  isReady(): boolean {
    return this.metadata.lifecycle === ServiceLifecycle.READY;
  }

  protected recordRequest(latency: number): void {
    this.metrics.requestCount++;
    this.metrics.lastRequestAt = new Date();
    this.metrics.latency.p50 = (this.metrics.latency.p50 + latency) / 2;
  }

  protected recordError(_error: Error): void {
    this.metrics.errorCount++;
    this.metrics.lastErrorAt = new Date();
  }

  protected async executeWithMetrics<T>(op: () => Promise<T>): Promise<T> {
    const start = Date.now();
    try {
      const result = await op();
      this.recordRequest(Date.now() - start);
      return result;
    } catch (err) {
      this.recordError(err instanceof Error ? err : new Error(String(err)));
      throw err;
    }
  }

  protected async onInit(): Promise<void> {}
  protected async onReady(): Promise<void> {}
  protected async onStop(): Promise<void> {}
}

export class ServiceManager {
  private services: BaseService[] = [];
  private started = false;

  register(service: BaseService): void {
    if (this.started) throw new Error('Cannot register service after starting manager');
    this.services.push(service);
  }

  get size(): number {
    return this.services.length;
  }

  async startAll(): Promise<void> {
    this.started = true;
    for (const svc of this.services) {
      await svc.initialize();
    }
  }

  async stopAll(): Promise<void> {
    // Stop in reverse order
    for (let i = this.services.length - 1; i >= 0; i--) {
      await this.services[i].stop();
    }
  }

  health(): ServiceManagerHealth {
    const ready = this.services.filter((s) => s.isReady());
    return {
      totalServices: this.services.length,
      readyCount: ready.length,
      allReady: this.services.length > 0 && ready.length === this.services.length,
      services: this.services.map((s) => ({
        name: s.getMetadata().name,
        ready: s.isReady(),
        lifecycle: s.getMetadata().lifecycle,
      })),
    };
  }
}

/** Health status of a single service */
export interface ServiceHealth {
  name: string;
  ready: boolean;
  lifecycle: string;
}

/** Aggregate health status from ServiceManager */
export interface ServiceManagerHealth {
  totalServices: number;
  readyCount: number;
  allReady: boolean;
  services: ServiceHealth[];
}

// =============================================================================
// GOAL SYNTHESIZER — Autonomous goal generation (FW-0.2)
// =============================================================================
// Canonical implementation moved to ./goal-synthesizer.ts with LLM + KnowledgeStore support.
// Re-exported here for backward compatibility.

export { GoalSynthesizer } from './goal-synthesizer';
export type { GoalContext, SynthesizedGoal } from './goal-synthesizer';

// =============================================================================
// MICRO-PHASE DECOMPOSER — Parallel task execution with dependency graph
// =============================================================================

export class MicroPhaseDecomposer {
  private nodes: Map<string, MicroPhaseTask> = new Map();
  private edges: Map<string, Set<string>> = new Map();
  private reverseEdges: Map<string, Set<string>> = new Map();
  private history: ExecutionResult[] = [];

  registerTask(task: MicroPhaseTask): void {
    if (this.nodes.has(task.id)) throw new Error(`Task ${task.id} already registered`);
    this.nodes.set(task.id, task);
    if (!this.edges.has(task.id)) this.edges.set(task.id, new Set());
    if (!this.reverseEdges.has(task.id)) this.reverseEdges.set(task.id, new Set());

    for (const dep of task.dependencies) {
      if (!this.nodes.has(dep)) throw new Error(`Dependency ${dep} not registered`);
      this.reverseEdges.get(task.id)!.add(dep);
      this.edges.get(dep)!.add(task.id);
    }
  }

  createExecutionPlan(): ExecutionPlan {
    const sorted = this.topologicalSort();
    const groups: MicroPhaseGroup[] = [];
    const assignedToGroup: Map<string, number> = new Map();

    for (const taskId of sorted) {
      const task = this.nodes.get(taskId)!;
      let groupIdx = 0;
      for (const depId of task.dependencies) {
        groupIdx = Math.max(groupIdx, (assignedToGroup.get(depId) ?? 0) + 1);
      }
      while (groups.length <= groupIdx) {
        groups.push({
          id: `group_${groups.length}`,
          name: `Group ${groups.length}`,
          tasks: [],
          parallel: true,
          estimatedDuration: 0,
        });
      }
      groups[groupIdx].tasks.push(task);
      assignedToGroup.set(taskId, groupIdx);
    }

    let totalTime = 0;
    for (const g of groups) {
      g.estimatedDuration = Math.max(...g.tasks.map((t) => t.estimatedDuration));
      totalTime += g.estimatedDuration;
    }

    const seqTime = [...this.nodes.values()].reduce((s, t) => s + t.estimatedDuration, 0);
    return {
      groups,
      totalEstimatedTime: totalTime,
      parallelizationRatio: seqTime > 0 ? ((seqTime - totalTime) / seqTime) * 100 : 0,
    };
  }

  async executePlan(plan: ExecutionPlan): Promise<ExecutionResult[]> {
    const results: ExecutionResult[] = [];
    for (const group of plan.groups) {
      const groupResults = await Promise.all(
        group.tasks.map(async (task) => {
          const start = Date.now();
          try {
            const timeout = task.timeout ?? 30000;
            const result = await Promise.race([
              task.execute(),
              new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Task timeout')), timeout)
              ),
            ]);
            return {
              taskId: task.id,
              status: 'success' as const,
              duration: Date.now() - start,
              result,
              timestamp: Date.now(),
            };
          } catch (err) {
            const isTimeout = err instanceof Error && err.message === 'Task timeout';
            return {
              taskId: task.id,
              status: (isTimeout ? 'timeout' : 'failure') as 'timeout' | 'failure',
              duration: Date.now() - start,
              error: err instanceof Error ? err : new Error(String(err)),
              timestamp: Date.now(),
            };
          }
        })
      );
      results.push(...groupResults);
    }
    this.history.push(...results);
    return results;
  }

  getHistory(): ExecutionResult[] {
    return [...this.history];
  }

  reset(): void {
    this.nodes.clear();
    this.edges.clear();
    this.reverseEdges.clear();
    this.history = [];
  }

  private topologicalSort(): string[] {
    const visited = new Set<string>();
    const stack: string[] = [];
    const dfs = (id: string) => {
      visited.add(id);
      for (const dep of this.reverseEdges.get(id) ?? []) {
        if (!visited.has(dep)) dfs(dep);
      }
      stack.push(id);
    };
    for (const id of this.nodes.keys()) {
      if (!visited.has(id)) dfs(id);
    }
    return stack.reverse();
  }
}
