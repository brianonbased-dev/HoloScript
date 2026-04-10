/**
 * @holoscript/framework - Orchestrator Agent
 *
 * First concrete implementation of BaseAgent from the uAA2++ protocol.
 * Maps the 7-phase protocol to agent orchestration concerns:
 *   INTAKE → discover available agents
 *   REFLECT → match capabilities to task requirements
 *   EXECUTE → delegate tasks or run workflows
 *   COMPRESS → summarize execution results
 *   REINTAKE → check delegation results, update agent status
 *   GROW → record delegation patterns (what worked/failed)
 *   EVOLVE → optimize routing preferences
 *
 * Part of HoloScript v5.5 "Agents as Universal Orchestrators".
 */

import {
  BaseAgent,
  ProtocolPhase,
  type AgentIdentity,
  type PhaseResult,
} from '../protocol/implementations';
import { AgentRegistry, getDefaultRegistry } from './AgentRegistry';
import { FederatedRegistryAdapter, type FederatedRegistryConfig } from './FederatedRegistryAdapter';
import { TaskDelegationService, type DelegationResult } from './TaskDelegationService';
import {
  SkillWorkflowEngine,
  type WorkflowDefinition,
  type WorkflowResult,
} from './SkillWorkflowEngine';
import type { AgentManifest } from './AgentManifest';
import type { CapabilityQuery, AgentMatch } from './CapabilityMatcher';

// =============================================================================
// CONFIGURATION
// =============================================================================

export interface OrchestratorConfig {
  /** Agent name */
  name: string;
  /** Primary domain */
  domain: string;
  /** Seed URLs for federated discovery */
  seedUrls?: string[];
  /** Whether to auto-discover on intake (default true) */
  autoDiscovery?: boolean;
  /** Discovery poll interval in ms */
  discoveryIntervalMs?: number;
  /** Custom fetch function (for testing) */
  fetchFn?: FederatedRegistryConfig['fetchFn'];
  /** Local tool executor (for testing/integration) */
  localExecutor?: (skillId: string, args: Record<string, unknown>) => Promise<unknown>;
}

// =============================================================================
// INTERNAL STATE
// =============================================================================

interface DelegationPattern {
  agentId: string;
  skillId: string;
  successCount: number;
  failureCount: number;
  avgDurationMs: number;
  lastUsed: number;
}

// =============================================================================
// ORCHESTRATOR AGENT
// =============================================================================

export class OrchestratorAgent extends BaseAgent {
  readonly identity: AgentIdentity;

  private registry: AgentRegistry;
  private adapter: FederatedRegistryAdapter;
  private delegator: TaskDelegationService;
  private workflowEngine: SkillWorkflowEngine;
  private config: OrchestratorConfig;

  /** Learned delegation patterns (GROW phase) */
  private patterns: Map<string, DelegationPattern> = new Map();
  /** Routing preferences (EVOLVE phase) */
  private preferences: Map<string, string> = new Map(); // skillId → preferred agentId
  /** Last discovered agents */
  private lastDiscovery: AgentMatch[] = [];

  constructor(config: OrchestratorConfig) {
    super();
    this.config = config;
    this.identity = {
      id: `orchestrator-${config.name.toLowerCase().replace(/\s+/g, '-')}`,
      name: config.name,
      domain: config.domain,
      version: '1.0.0',
      capabilities: ['orchestrate', 'delegate', 'discover', 'workflow'],
    };

    this.registry = getDefaultRegistry();
    this.adapter = new FederatedRegistryAdapter(this.registry, {
      seedUrls: config.seedUrls || [],
      pollIntervalMs: config.discoveryIntervalMs || 60_000,
      fetchFn: config.fetchFn,
    });
    this.delegator = new TaskDelegationService(this.registry, this.adapter, {
      localExecutor: config.localExecutor,
    });
    this.workflowEngine = new SkillWorkflowEngine();
  }

  // ===========================================================================
  // PHASE 0: INTAKE — Discover available agents
  // ===========================================================================

  async intake(input: unknown): Promise<PhaseResult> {
    const startTime = Date.now();
    const data = input as Record<string, unknown>;

    // Discover agents
    if (this.config.autoDiscovery !== false) {
      await this.adapter.pollAll();
    }

    const allAgents = this.registry.getAllManifests();
    const onlineAgents = allAgents.filter((a) => a.status === 'online');

    return {
      phase: ProtocolPhase.INTAKE,
      status: 'success',
      data: {
        task: data.task || 'orchestrate',
        context: data,
        totalAgents: allAgents.length,
        onlineAgents: onlineAgents.length,
        remoteAgents: this.adapter.remoteAgentCount,
        agents: onlineAgents.map((a) => ({
          id: a.id,
          name: a.name,
          capabilities: a.capabilities.map((c) => `${c.type}:${c.domain}`),
        })),
      },
      durationMs: Date.now() - startTime,
      timestamp: Date.now(),
    };
  }

  // ===========================================================================
  // PHASE 1: REFLECT — Match capabilities to task requirements
  // ===========================================================================

  async reflect(data: unknown): Promise<PhaseResult> {
    const startTime = Date.now();
    const intakeData = data as Record<string, unknown>;
    const task = (intakeData.task as string) || '';

    // Build a capability query from the task
    const query = this.taskToQuery(task, intakeData.context as Record<string, unknown>);
    this.lastDiscovery = await this.registry.discoverWithScores(query);

    // Check for preferred agents from EVOLVE patterns
    const preferredAgents = this.getPreferredAgents(task);

    return {
      phase: ProtocolPhase.REFLECT,
      status: 'success',
      data: {
        task,
        matchingAgents: this.lastDiscovery.length,
        topAgent: this.lastDiscovery[0]
          ? { id: this.lastDiscovery[0].manifest.id, score: this.lastDiscovery[0].score }
          : null,
        preferredAgents,
        query,
      },
      durationMs: Date.now() - startTime,
      timestamp: Date.now(),
    };
  }

  // ===========================================================================
  // PHASE 2: EXECUTE — Delegate tasks or run workflows
  // ===========================================================================

  async execute(plan: unknown): Promise<PhaseResult> {
    const startTime = Date.now();
    const reflectData = plan as Record<string, unknown>;
    const task = (reflectData.task as string) || '';

    let result: DelegationResult | WorkflowResult | null = null;
    let executionType = 'none';

    if (this.lastDiscovery.length > 0) {
      // Simple delegation to best agent
      const bestAgent = this.lastDiscovery[0].manifest;
      result = await this.delegator.delegateTo({
        targetAgentId: bestAgent.id,
        skillId: task,
        arguments: (reflectData.query as Record<string, unknown>) || {},
      });
      executionType = 'delegation';
    }

    return {
      phase: ProtocolPhase.EXECUTE,
      status: 'success',
      data: {
        executionType,
        result,
        task,
      },
      durationMs: Date.now() - startTime,
      timestamp: Date.now(),
    };
  }

  // ===========================================================================
  // PHASE 3: COMPRESS — Summarize results
  // ===========================================================================

  async compress(results: unknown): Promise<PhaseResult> {
    const startTime = Date.now();
    const execData = results as Record<string, unknown>;
    const result = execData.result as Record<string, unknown> | null;

    return {
      phase: ProtocolPhase.COMPRESS,
      status: 'success',
      data: {
        summary: {
          executionType: execData.executionType,
          status: result?.status || 'no-execution',
          task: execData.task,
          durationMs: result?.durationMs,
        },
      },
      durationMs: Date.now() - startTime,
      timestamp: Date.now(),
    };
  }

  // ===========================================================================
  // PHASE 4: REINTAKE — Check delegation results
  // ===========================================================================

  async reintake(compressed: unknown): Promise<PhaseResult> {
    const startTime = Date.now();
    const summary = (compressed as Record<string, unknown>).summary as Record<string, unknown>;
    const stats = this.delegator.getStats();

    return {
      phase: ProtocolPhase.REINTAKE,
      status: 'success',
      data: {
        delegationStats: stats,
        lastResult: summary,
        registryHealth: this.registry.getStatusCounts(),
      },
      durationMs: Date.now() - startTime,
      timestamp: Date.now(),
    };
  }

  // ===========================================================================
  // PHASE 5: GROW — Learn patterns from delegations
  // ===========================================================================

  async grow(learnings: unknown): Promise<PhaseResult> {
    const startTime = Date.now();
    const data = learnings as Record<string, unknown>;
    const lastResult = data.lastResult as Record<string, unknown> | undefined;

    // Record delegation pattern
    if (lastResult?.status === 'completed') {
      const key = `${lastResult.task}`;
      const existing = this.patterns.get(key);
      if (existing) {
        existing.successCount++;
        existing.avgDurationMs =
          (existing.avgDurationMs + ((lastResult.durationMs as number) || 0)) / 2;
        existing.lastUsed = Date.now();
      } else {
        this.patterns.set(key, {
          agentId: 'unknown',
          skillId: key,
          successCount: 1,
          failureCount: 0,
          avgDurationMs: (lastResult.durationMs as number) || 0,
          lastUsed: Date.now(),
        });
      }
    }

    return {
      phase: ProtocolPhase.GROW,
      status: 'success',
      data: {
        totalPatterns: this.patterns.size,
        newPattern: lastResult?.task || null,
      },
      durationMs: Date.now() - startTime,
      timestamp: Date.now(),
    };
  }

  // ===========================================================================
  // PHASE 6: EVOLVE — Optimize routing preferences
  // ===========================================================================

  async evolve(adaptations: unknown): Promise<PhaseResult> {
    const startTime = Date.now();

    // Update routing preferences based on patterns
    for (const [skillId, pattern] of this.patterns) {
      if (pattern.successCount > pattern.failureCount) {
        this.preferences.set(skillId, pattern.agentId);
      }
    }

    return {
      phase: ProtocolPhase.EVOLVE,
      status: 'success',
      data: {
        totalPreferences: this.preferences.size,
        totalPatterns: this.patterns.size,
      },
      durationMs: Date.now() - startTime,
      timestamp: Date.now(),
    };
  }

  // ===========================================================================
  // CONVENIENCE METHODS
  // ===========================================================================

  /**
   * Delegate a task without running a full cycle.
   */
  async delegateTask(skillId: string, args: Record<string, unknown>): Promise<DelegationResult> {
    // Check preferences first
    const preferredAgentId = this.preferences.get(skillId);
    if (preferredAgentId && this.registry.has(preferredAgentId)) {
      return this.delegator.delegateTo({
        targetAgentId: preferredAgentId,
        skillId,
        arguments: args,
      });
    }

    // Auto-delegate
    return this.delegator.autoDelegate({}, skillId, args);
  }

  /**
   * Run a workflow without running a full cycle.
   */
  async runWorkflow(definition: WorkflowDefinition): Promise<WorkflowResult> {
    const executor = this.config.localExecutor
      ? async (skillId: string, inputs: Record<string, unknown>) => {
          const result = await this.config.localExecutor!(skillId, inputs);
          return (typeof result === 'object' && result !== null ? result : { result }) as Record<
            string,
            unknown
          >;
        }
      : async (skillId: string, inputs: Record<string, unknown>) => {
          return { skillId, inputs, note: 'No executor configured' } as Record<string, unknown>;
        };

    return this.workflowEngine.execute(definition, executor);
  }

  /**
   * Get all discovered agents.
   */
  getDiscoveredAgents(): AgentManifest[] {
    return this.registry.getAllManifests();
  }

  /**
   * Get learned patterns.
   */
  getPatterns(): DelegationPattern[] {
    return Array.from(this.patterns.values());
  }

  /**
   * Stop polling and cleanup.
   */
  shutdown(): void {
    this.adapter.stopPolling();
  }

  // ===========================================================================
  // PRIVATE HELPERS
  // ===========================================================================

  private taskToQuery(task: string, context?: Record<string, unknown>): CapabilityQuery {
    const query: CapabilityQuery = { includeOffline: false };

    // Extract type/domain hints from task string
    if (context?.type) query.type = context.type as string;
    if (context?.domain) query.domain = context.domain as string;
    if (context?.tags) query.tags = context.tags as string[];

    return query;
  }

  private getPreferredAgents(task: string): string[] {
    const preferred: string[] = [];
    const agentId = this.preferences.get(task);
    if (agentId) preferred.push(agentId);
    return preferred;
  }
}
