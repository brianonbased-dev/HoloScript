/**
 * SwarmInspector - Debugging and inspection tools for swarms
 * HoloScript v3.2 - Autonomous Agent Swarms
 *
 * Provides introspection, debugging, and visualization data for swarms
 */

/**
 * Agent state snapshot
 */
export interface IAgentSnapshot {
  id: string;
  swarmId?: string;
  state: string;
  position?: { x: number; y: number; z: number };
  velocity?: { x: number; y: number; z: number };
  health: number;
  load: number;
  lastActive: number;
  properties: Record<string, unknown>;
}

/**
 * Swarm state snapshot
 */
export interface ISwarmSnapshot {
  id: string;
  name?: string;
  memberCount: number;
  leaderId?: string;
  state: string;
  formation?: string;
  centroid?: { x: number; y: number; z: number };
  boundingBox?: {
    min: { x: number; y: number; z: number };
    max: { x: number; y: number; z: number };
  };
  createdAt: number;
  properties: Record<string, unknown>;
}

/**
 * Relationship between agents
 */
export interface IAgentRelation {
  sourceId: string;
  targetId: string;
  type: 'member' | 'leader' | 'neighbor' | 'communication' | 'custom';
  strength: number;
  metadata?: Record<string, unknown>;
}

/**
 * Debug event
 */
export interface IDebugEvent {
  id: string;
  timestamp: number;
  level: 'trace' | 'debug' | 'info' | 'warn' | 'error';
  source: string;
  message: string;
  data?: unknown;
}

/**
 * Health check result
 */
export interface IHealthCheck {
  name: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  message?: string;
  latency?: number;
  lastCheck: number;
}

/**
 * Inspection result
 */
export interface IInspectionResult {
  timestamp: number;
  swarms: ISwarmSnapshot[];
  agents: IAgentSnapshot[];
  relations: IAgentRelation[];
  health: IHealthCheck[];
  summary: {
    totalSwarms: number;
    totalAgents: number;
    healthyAgents: number;
    averageLoad: number;
    warnings: string[];
  };
}

/**
 * Event listener
 */
export type DebugEventListener = (event: IDebugEvent) => void;

/**
 * SwarmInspector - Debugging and inspection tools
 */
export class SwarmInspector {
  private agentSnapshots: Map<string, IAgentSnapshot> = new Map();
  private swarmSnapshots: Map<string, ISwarmSnapshot> = new Map();
  private relations: IAgentRelation[] = [];
  private healthChecks: Map<string, IHealthCheck> = new Map();
  private eventLog: IDebugEvent[] = [];
  private listeners: DebugEventListener[] = [];
  private maxEvents: number;
  private nextEventId = 1;

  constructor(config?: { maxEvents?: number }) {
    this.maxEvents = config?.maxEvents ?? 1000;
  }

  // ===== Agent Tracking =====

  /**
   * Update agent snapshot
   */
  updateAgent(snapshot: IAgentSnapshot): void {
    this.agentSnapshots.set(snapshot.id, snapshot);
  }

  /**
   * Remove agent snapshot
   */
  removeAgent(agentId: string): void {
    this.agentSnapshots.delete(agentId);
    // Remove relations involving this agent
    this.relations = this.relations.filter((r) => r.sourceId !== agentId && r.targetId !== agentId);
  }

  /**
   * Get agent snapshot
   */
  getAgent(agentId: string): IAgentSnapshot | undefined {
    return this.agentSnapshots.get(agentId);
  }

  /**
   * Get all agents
   */
  getAllAgents(): IAgentSnapshot[] {
    return [...this.agentSnapshots.values()];
  }

  /**
   * Get agents in swarm
   */
  getSwarmAgents(swarmId: string): IAgentSnapshot[] {
    return [...this.agentSnapshots.values()].filter((a) => a.swarmId === swarmId);
  }

  // ===== Swarm Tracking =====

  /**
   * Update swarm snapshot
   */
  updateSwarm(snapshot: ISwarmSnapshot): void {
    this.swarmSnapshots.set(snapshot.id, snapshot);
  }

  /**
   * Remove swarm snapshot
   */
  removeSwarm(swarmId: string): void {
    this.swarmSnapshots.delete(swarmId);
  }

  /**
   * Get swarm snapshot
   */
  getSwarm(swarmId: string): ISwarmSnapshot | undefined {
    return this.swarmSnapshots.get(swarmId);
  }

  /**
   * Get all swarms
   */
  getAllSwarms(): ISwarmSnapshot[] {
    return [...this.swarmSnapshots.values()];
  }

  // ===== Relations =====

  /**
   * Add relation between agents
   */
  addRelation(relation: IAgentRelation): void {
    // Check for existing
    const existing = this.relations.find(
      (r) =>
        r.sourceId === relation.sourceId &&
        r.targetId === relation.targetId &&
        r.type === relation.type
    );

    if (existing) {
      existing.strength = relation.strength;
      existing.metadata = relation.metadata;
    } else {
      this.relations.push(relation);
    }
  }

  /**
   * Remove relation
   */
  removeRelation(sourceId: string, targetId: string, type?: string): void {
    this.relations = this.relations.filter((r) => {
      if (r.sourceId !== sourceId || r.targetId !== targetId) return true;
      if (type && r.type !== type) return true;
      return false;
    });
  }

  /**
   * Get relations for agent
   */
  getAgentRelations(agentId: string): IAgentRelation[] {
    return this.relations.filter((r) => r.sourceId === agentId || r.targetId === agentId);
  }

  /**
   * Get all relations
   */
  getAllRelations(): IAgentRelation[] {
    return [...this.relations];
  }

  // ===== Health Checks =====

  /**
   * Register health check result
   */
  registerHealthCheck(check: IHealthCheck): void {
    this.healthChecks.set(check.name, check);
  }

  /**
   * Get health check
   */
  getHealthCheck(name: string): IHealthCheck | undefined {
    return this.healthChecks.get(name);
  }

  /**
   * Get all health checks
   */
  getAllHealthChecks(): IHealthCheck[] {
    return [...this.healthChecks.values()];
  }

  /**
   * Get overall health status
   */
  getOverallHealth(): 'healthy' | 'degraded' | 'unhealthy' {
    const checks = this.getAllHealthChecks();
    if (checks.length === 0) return 'healthy';

    if (checks.some((c) => c.status === 'unhealthy')) return 'unhealthy';
    if (checks.some((c) => c.status === 'degraded')) return 'degraded';
    return 'healthy';
  }

  // ===== Debug Events =====

  /**
   * Log a debug event
   */
  log(level: IDebugEvent['level'], source: string, message: string, data?: unknown): void {
    const event: IDebugEvent = {
      id: `evt-${this.nextEventId++}`,
      timestamp: Date.now(),
      level,
      source,
      message,
      data,
    };

    this.eventLog.push(event);

    // Trim old events
    while (this.eventLog.length > this.maxEvents) {
      this.eventLog.shift();
    }

    // Notify listeners
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // Ignore listener errors
      }
    }
  }

  /**
   * Log helpers
   */
  trace(source: string, message: string, data?: unknown): void {
    this.log('trace', source, message, data);
  }

  debug(source: string, message: string, data?: unknown): void {
    this.log('debug', source, message, data);
  }

  info(source: string, message: string, data?: unknown): void {
    this.log('info', source, message, data);
  }

  warn(source: string, message: string, data?: unknown): void {
    this.log('warn', source, message, data);
  }

  error(source: string, message: string, data?: unknown): void {
    this.log('error', source, message, data);
  }

  /**
   * Get event log
   */
  getEventLog(options?: {
    level?: IDebugEvent['level'];
    source?: string;
    since?: number;
    limit?: number;
  }): IDebugEvent[] {
    let result = [...this.eventLog];

    if (options?.level) {
      result = result.filter((e) => e.level === options.level);
    }

    if (options?.source) {
      result = result.filter((e) => e.source === options.source);
    }

    if (options?.since) {
      result = result.filter((e) => e.timestamp >= options.since!);
    }

    if (options?.limit) {
      result = result.slice(-options.limit);
    }

    return result;
  }

  /**
   * Add event listener
   */
  addEventListener(listener: DebugEventListener): () => void {
    this.listeners.push(listener);
    return () => {
      const idx = this.listeners.indexOf(listener);
      if (idx >= 0) this.listeners.splice(idx, 1);
    };
  }

  /**
   * Clear event log
   */
  clearEventLog(): void {
    this.eventLog = [];
  }

  // ===== Full Inspection =====

  /**
   * Get full inspection result
   */
  inspect(): IInspectionResult {
    const agents = this.getAllAgents();
    const swarms = this.getAllSwarms();
    const healthChecks = this.getAllHealthChecks();

    const healthyAgents = agents.filter((a) => a.health >= 0.5).length;
    const averageLoad =
      agents.length > 0 ? agents.reduce((sum, a) => sum + a.load, 0) / agents.length : 0;

    const warnings: string[] = [];

    // Check for issues
    if (this.getOverallHealth() !== 'healthy') {
      warnings.push('System health is degraded');
    }

    const unhealthyAgents = agents.filter((a) => a.health < 0.3);
    if (unhealthyAgents.length > 0) {
      warnings.push(`${unhealthyAgents.length} agents have low health`);
    }

    const overloadedAgents = agents.filter((a) => a.load > 0.9);
    if (overloadedAgents.length > 0) {
      warnings.push(`${overloadedAgents.length} agents are overloaded`);
    }

    const now = Date.now();
    const staleAgents = agents.filter((a) => now - a.lastActive > 60000);
    if (staleAgents.length > 0) {
      warnings.push(`${staleAgents.length} agents are stale`);
    }

    return {
      timestamp: now,
      swarms,
      agents,
      relations: this.getAllRelations(),
      health: healthChecks,
      summary: {
        totalSwarms: swarms.length,
        totalAgents: agents.length,
        healthyAgents,
        averageLoad,
        warnings,
      },
    };
  }

  /**
   * Generate a visualization-ready graph
   */
  toGraph(): {
    nodes: Array<{ id: string; type: 'agent' | 'swarm'; data: unknown }>;
    edges: Array<{ source: string; target: string; type: string; weight: number }>;
  } {
    const nodes: Array<{ id: string; type: 'agent' | 'swarm'; data: unknown }> = [];
    const edges: Array<{ source: string; target: string; type: string; weight: number }> = [];

    // Add swarm nodes
    for (const swarm of this.swarmSnapshots.values()) {
      nodes.push({ id: swarm.id, type: 'swarm', data: swarm });
    }

    // Add agent nodes
    for (const agent of this.agentSnapshots.values()) {
      nodes.push({ id: agent.id, type: 'agent', data: agent });

      // Add swarm membership edge
      if (agent.swarmId) {
        edges.push({
          source: agent.id,
          target: agent.swarmId,
          type: 'member',
          weight: 1,
        });
      }
    }

    // Add relations as edges
    for (const rel of this.relations) {
      edges.push({
        source: rel.sourceId,
        target: rel.targetId,
        type: rel.type,
        weight: rel.strength,
      });
    }

    return { nodes, edges };
  }

  /**
   * Reset all state
   */
  reset(): void {
    this.agentSnapshots.clear();
    this.swarmSnapshots.clear();
    this.relations = [];
    this.healthChecks.clear();
    this.eventLog = [];
  }
}
