/**
 * MitosisSwarm — Swarm Execution Pipeline
 *
 * Manages hierarchical agent spawning, state synchronization between swarm
 * members, sync report collection/aggregation, and graceful shutdown.
 *
 * Works with HoloScriptRuntime's existing spawn/notifyParent builtins and
 * the MitosisTrait event system.
 */

import { logger } from './logger';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Configuration for an individual swarm agent */
export interface SwarmAgentConfig {
  /** Unique identifier for this agent */
  id: string;
  /** Template name to spawn from */
  template: string;
  /** Parent agent ID (null for root agents) */
  parentId: string | null;
  /** Spatial position [x, y, z] */
  position: [number, number, number];
  /** Initial state overrides merged into template defaults */
  initialState: Record<string, unknown>;
}

/** A sync report from one agent back to the swarm */
export interface SyncReport {
  /** Which agent sent the report */
  childId: string;
  /** Which parent the report is for */
  parentId: string;
  /** Arbitrary result payload */
  result: Record<string, unknown>;
  /** When the report was received (epoch ms) */
  timestamp: number;
}

/** Aggregated summary of all sync reports for a parent */
export interface AggregatedReport {
  parentId: string;
  totalReports: number;
  reports: SyncReport[];
  aggregatedState: Record<string, number>;
}

/** Full swarm configuration */
export interface SwarmConfig {
  /** How many agents to spawn */
  count: number;
  /** Template name for child agents */
  template: string;
  /** Root / commander agent ID */
  commanderId: string;
  /** Per-agent behavior factory: index -> config overrides */
  agentFactory: (index: number, commanderId: string) => Partial<SwarmAgentConfig>;
  /** Optional timeout in ms for the entire swarm lifecycle (default: 30000) */
  timeoutMs?: number;
}

export type SwarmEventType =
  | 'swarm_started'
  | 'agent_spawned'
  | 'agent_synced'
  | 'agent_failed'
  | 'swarm_complete'
  | 'swarm_shutdown';

export type SwarmEventHandler = (data: Record<string, unknown>) => void;

/** Internal representation of a live swarm agent */
interface LiveAgent {
  config: SwarmAgentConfig;
  status: 'pending' | 'running' | 'complete' | 'failed';
  spawnedAt: number;
  completedAt: number | null;
  result: Record<string, unknown> | null;
}

// ---------------------------------------------------------------------------
// MitosisSwarm
// ---------------------------------------------------------------------------

export class MitosisSwarm {
  private agents: Map<string, LiveAgent> = new Map();
  private syncReports: SyncReport[] = [];
  private eventHandlers: Map<SwarmEventType, SwarmEventHandler[]> = new Map();
  private isRunning = false;
  private isShutdown = false;
  private commanderId: string;
  private config: SwarmConfig;
  private shutdownResolve: (() => void) | null = null;

  constructor(config: SwarmConfig) {
    this.config = config;
    this.commanderId = config.commanderId;
  }

  // -----------------------------------------------------------------------
  // Event system
  // -----------------------------------------------------------------------

  on(event: SwarmEventType, handler: SwarmEventHandler): void {
    const handlers = this.eventHandlers.get(event) || [];
    handlers.push(handler);
    this.eventHandlers.set(event, handlers);
  }

  off(event: SwarmEventType, handler?: SwarmEventHandler): void {
    if (!handler) {
      this.eventHandlers.delete(event);
      return;
    }
    const handlers = this.eventHandlers.get(event) || [];
    this.eventHandlers.set(
      event,
      handlers.filter((h) => h !== handler)
    );
  }

  private emit(event: SwarmEventType, data: Record<string, unknown>): void {
    const handlers = this.eventHandlers.get(event) || [];
    for (const handler of handlers) {
      try {
        handler(data);
      } catch (err) {
        logger.error(`[MitosisSwarm] Event handler error for ${event}`, { error: err });
      }
    }
  }

  // -----------------------------------------------------------------------
  // Spawning
  // -----------------------------------------------------------------------

  /**
   * Spawn all agents according to the swarm configuration.
   * Returns the list of agent IDs that were spawned.
   */
  async spawn(): Promise<string[]> {
    if (this.isShutdown) {
      throw new Error('[MitosisSwarm] Cannot spawn after shutdown');
    }
    if (this.isRunning) {
      throw new Error('[MitosisSwarm] Swarm is already running');
    }

    this.isRunning = true;
    this.emit('swarm_started', {
      commanderId: this.commanderId,
      count: this.config.count,
      template: this.config.template,
    });

    const spawnedIds: string[] = [];

    for (let i = 0; i < this.config.count; i++) {
      const overrides = this.config.agentFactory(i, this.commanderId);
      const agentConfig: SwarmAgentConfig = {
        id: overrides.id || `${this.config.template}_${i}`,
        template: overrides.template || this.config.template,
        parentId: overrides.parentId !== undefined ? overrides.parentId : this.commanderId,
        position: overrides.position || [i * 2 - 1, 0, 5],
        initialState: overrides.initialState || {},
      };

      const liveAgent: LiveAgent = {
        config: agentConfig,
        status: 'running',
        spawnedAt: Date.now(),
        completedAt: null,
        result: null,
      };

      this.agents.set(agentConfig.id, liveAgent);
      spawnedIds.push(agentConfig.id);

      this.emit('agent_spawned', {
        parentId: this.commanderId,
        childId: agentConfig.id,
        template: agentConfig.template,
        position: agentConfig.position,
      });
    }

    return spawnedIds;
  }

  // -----------------------------------------------------------------------
  // Sync reports
  // -----------------------------------------------------------------------

  /**
   * Called when a child agent reports its results back to the swarm.
   */
  reportSync(childId: string, result: Record<string, unknown>): void {
    if (this.isShutdown) {
      logger.warn(`[MitosisSwarm] Ignoring sync from ${childId} — swarm is shut down`);
      return;
    }

    const agent = this.agents.get(childId);
    if (!agent) {
      logger.warn(`[MitosisSwarm] Unknown agent ${childId} reported sync`);
      return;
    }

    agent.status = 'complete';
    agent.completedAt = Date.now();
    agent.result = result;

    const report: SyncReport = {
      childId,
      parentId: agent.config.parentId || this.commanderId,
      result,
      timestamp: Date.now(),
    };

    this.syncReports.push(report);

    this.emit('agent_synced', {
      parentId: report.parentId,
      childId,
      result,
    });

    // Check if all agents are done
    if (this.allComplete()) {
      this.emit('swarm_complete', {
        commanderId: this.commanderId,
        totalReports: this.syncReports.length,
      });
      if (this.shutdownResolve) {
        this.shutdownResolve();
        this.shutdownResolve = null;
      }
    }
  }

  /**
   * Mark an agent as failed.
   */
  reportFailure(childId: string, error: string): void {
    const agent = this.agents.get(childId);
    if (!agent) return;

    agent.status = 'failed';
    agent.completedAt = Date.now();

    this.emit('agent_failed', {
      parentId: agent.config.parentId || this.commanderId,
      childId,
      error,
    });

    // Check completion even on failure
    if (this.allComplete()) {
      this.emit('swarm_complete', {
        commanderId: this.commanderId,
        totalReports: this.syncReports.length,
      });
      if (this.shutdownResolve) {
        this.shutdownResolve();
        this.shutdownResolve = null;
      }
    }
  }

  // -----------------------------------------------------------------------
  // Aggregation
  // -----------------------------------------------------------------------

  /**
   * Aggregate all sync reports for the commander.
   * Numeric fields in results are summed; non-numeric fields use last-write-wins.
   */
  aggregate(): AggregatedReport {
    const aggregatedState: Record<string, number> = {};

    for (const report of this.syncReports) {
      for (const [key, value] of Object.entries(report.result)) {
        if (typeof value === 'number') {
          aggregatedState[key] = (aggregatedState[key] || 0) + value;
        }
      }
    }

    return {
      parentId: this.commanderId,
      totalReports: this.syncReports.length,
      reports: [...this.syncReports],
      aggregatedState,
    };
  }

  // -----------------------------------------------------------------------
  // State queries
  // -----------------------------------------------------------------------

  /** Get the current status of a specific agent */
  getAgentStatus(agentId: string): LiveAgent['status'] | null {
    return this.agents.get(agentId)?.status ?? null;
  }

  /** Get all sync reports received so far */
  getSyncReports(): ReadonlyArray<SyncReport> {
    return this.syncReports;
  }

  /** Get the count of spawned agents */
  getAgentCount(): number {
    return this.agents.size;
  }

  /** Check if all agents have completed (or failed) */
  allComplete(): boolean {
    if (this.agents.size === 0) return false;
    for (const agent of this.agents.values()) {
      if (agent.status === 'pending' || agent.status === 'running') {
        return false;
      }
    }
    return true;
  }

  /** Whether the swarm is currently running */
  getIsRunning(): boolean {
    return this.isRunning;
  }

  /** Whether shutdown has been called */
  getIsShutdown(): boolean {
    return this.isShutdown;
  }

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------

  /**
   * Wait for all agents to complete or the timeout to expire.
   * Returns the aggregated report.
   */
  async waitForCompletion(): Promise<AggregatedReport> {
    if (this.allComplete()) {
      return this.aggregate();
    }

    const timeoutMs = this.config.timeoutMs || 30000;

    return new Promise<AggregatedReport>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.shutdownResolve = null;
        reject(new Error(`[MitosisSwarm] Timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      this.shutdownResolve = () => {
        clearTimeout(timer);
        resolve(this.aggregate());
      };
    });
  }

  /**
   * Gracefully shut down the swarm. No more reports accepted.
   * Returns the final aggregated report.
   */
  shutdown(): AggregatedReport {
    if (this.isShutdown) {
      return this.aggregate();
    }

    this.isShutdown = true;
    this.isRunning = false;

    // Mark any still-running agents as failed
    for (const agent of this.agents.values()) {
      if (agent.status === 'running' || agent.status === 'pending') {
        agent.status = 'failed';
        agent.completedAt = Date.now();
      }
    }

    this.emit('swarm_shutdown', {
      commanderId: this.commanderId,
      totalAgents: this.agents.size,
      completedReports: this.syncReports.length,
    });

    if (this.shutdownResolve) {
      this.shutdownResolve();
      this.shutdownResolve = null;
    }

    return this.aggregate();
  }
}
