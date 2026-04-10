/**
 * Swarm Manager
 *
 * Orchestrates swarm formation, disbandment, and lifecycle.
 */

import {
  SwarmMembership,
  type SwarmMembershipConfig,
  type MembershipEvent,
} from './SwarmMembership';
import type { QuorumState } from './QuorumPolicy';

export interface SwarmInfo {
  id: string;
  name: string;
  objective: string;
  createdAt: number;
  createdBy: string;
  status: 'forming' | 'active' | 'disbanding' | 'disbanded';
  membership: SwarmMembership;
  metadata?: Record<string, unknown>;
}

export interface CreateSwarmRequest {
  name: string;
  objective: string;
  createdBy: string;
  membershipConfig?: Partial<SwarmMembershipConfig>;
  metadata?: Record<string, unknown>;
}

export interface DisbandOptions {
  reason: string;
  redistributeTasks: boolean;
  notifyMembers: boolean;
}

export interface SwarmManagerConfig {
  maxSwarmsPerAgent: number;
  defaultMembershipConfig: Partial<SwarmMembershipConfig>;
  disbandEmptySwarms: boolean;
  disbandTimeoutMs: number;
}

const DEFAULT_CONFIG: SwarmManagerConfig = {
  maxSwarmsPerAgent: 5,
  defaultMembershipConfig: {},
  disbandEmptySwarms: true,
  disbandTimeoutMs: 60000,
};

export interface SwarmEvent {
  type: 'swarm-created' | 'swarm-disbanded' | 'member-joined' | 'member-left' | 'status-changed';
  swarmId: string;
  agentId?: string;
  timestamp: number;
  details?: Record<string, unknown>;
}

type SwarmEventHandler = (event: SwarmEvent) => void;

/**
 * Manages the lifecycle of multiple swarms
 */
export class SwarmManager {
  private config: SwarmManagerConfig;
  private swarms: Map<string, SwarmInfo> = new Map();
  private agentSwarms: Map<string, Set<string>> = new Map();
  private eventHandlers: SwarmEventHandler[] = [];
  private disbandTimeouts: Map<string, ReturnType<typeof setTimeout>> = new Map();

  constructor(config: Partial<SwarmManagerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Create a new swarm
   */
  createSwarm(request: CreateSwarmRequest): SwarmInfo {
    const { name, objective, createdBy, membershipConfig, metadata } = request;

    // Check agent swarm limit
    const agentSwarmCount = this.agentSwarms.get(createdBy)?.size ?? 0;
    if (agentSwarmCount >= this.config.maxSwarmsPerAgent) {
      throw new Error(`Agent ${createdBy} has reached maximum swarm limit`);
    }

    const id = this.generateSwarmId(name);
    const now = Date.now();

    const membership = new SwarmMembership({
      ...this.config.defaultMembershipConfig,
      ...membershipConfig,
    });

    const swarmInfo: SwarmInfo = {
      id,
      name,
      objective,
      createdAt: now,
      createdBy,
      status: 'forming',
      membership,
      metadata,
    };

    this.swarms.set(id, swarmInfo);

    // Subscribe to membership events
    membership.onEvent((event) => this.handleMembershipEvent(id, event));

    // Creator auto-joins as leader
    membership.join({ agentId: createdBy, requestedRole: 'leader' });
    this.trackAgentSwarm(createdBy, id);

    this.emit({
      type: 'swarm-created',
      swarmId: id,
      agentId: createdBy,
      timestamp: now,
      details: { name, objective },
    });

    return swarmInfo;
  }

  /**
   * Join an existing swarm
   */
  joinSwarm(swarmId: string, agentId: string, asObserver = false): boolean {
    const swarm = this.swarms.get(swarmId);
    if (!swarm) {
      throw new Error(`Swarm ${swarmId} not found`);
    }

    if (swarm.status === 'disbanded' || swarm.status === 'disbanding') {
      throw new Error(`Swarm ${swarmId} is ${swarm.status}`);
    }

    // Check agent swarm limit
    const agentSwarmCount = this.agentSwarms.get(agentId)?.size ?? 0;
    if (!asObserver && agentSwarmCount >= this.config.maxSwarmsPerAgent) {
      throw new Error(`Agent ${agentId} has reached maximum swarm limit`);
    }

    const success = swarm.membership.join({
      agentId,
      requestedRole: asObserver ? 'observer' : 'member',
    });

    if (success) {
      this.trackAgentSwarm(agentId, swarmId);

      // Cancel disband timeout if was scheduled
      const timeout = this.disbandTimeouts.get(swarmId);
      if (timeout) {
        clearTimeout(timeout);
        this.disbandTimeouts.delete(swarmId);
      }

      // Update status to active if was forming
      if (swarm.status === 'forming' && swarm.membership.getQuorumState().hasQuorum) {
        swarm.status = 'active';
        this.emit({
          type: 'status-changed',
          swarmId,
          timestamp: Date.now(),
          details: { oldStatus: 'forming', newStatus: 'active' },
        });
      }
    }

    return success;
  }

  /**
   * Leave a swarm
   */
  leaveSwarm(swarmId: string, agentId: string, graceful = true): boolean {
    const swarm = this.swarms.get(swarmId);
    if (!swarm) {
      throw new Error(`Swarm ${swarmId} not found`);
    }

    const success = swarm.membership.leave({
      agentId,
      graceful,
    });

    if (success) {
      this.untrackAgentSwarm(agentId, swarmId);
      this.checkForEmptySwarm(swarmId);
    }

    return success;
  }

  /**
   * Disband a swarm
   */
  disbandSwarm(swarmId: string, options: DisbandOptions): void {
    const swarm = this.swarms.get(swarmId);
    if (!swarm) {
      throw new Error(`Swarm ${swarmId} not found`);
    }

    if (swarm.status === 'disbanded') {
      return;
    }

    swarm.status = 'disbanding';
    this.emit({
      type: 'status-changed',
      swarmId,
      timestamp: Date.now(),
      details: { oldStatus: swarm.status, newStatus: 'disbanding', reason: options.reason },
    });

    // Remove all members forcefully
    const members = swarm.membership.getMembers();
    for (const member of members) {
      swarm.membership.removeForcefully(member.agentId, options.reason);
      this.untrackAgentSwarm(member.agentId, swarmId);
    }

    swarm.status = 'disbanded';
    this.emit({
      type: 'swarm-disbanded',
      swarmId,
      timestamp: Date.now(),
      details: { reason: options.reason },
    });
  }

  /**
   * Get a swarm by ID
   */
  getSwarm(swarmId: string): SwarmInfo | undefined {
    return this.swarms.get(swarmId);
  }

  /**
   * Get all swarms
   */
  getAllSwarms(): SwarmInfo[] {
    return [...this.swarms.values()];
  }

  /**
   * Get active swarms
   */
  getActiveSwarms(): SwarmInfo[] {
    return this.getAllSwarms().filter((s) => s.status === 'active' || s.status === 'forming');
  }

  /**
   * Get swarms an agent is member of
   */
  getAgentSwarms(agentId: string): SwarmInfo[] {
    const swarmIds = this.agentSwarms.get(agentId);
    if (!swarmIds) {
      return [];
    }
    return [...swarmIds]
      .map((id) => this.swarms.get(id))
      .filter((s): s is SwarmInfo => s !== undefined);
  }

  /**
   * Find swarms by objective (simple text match)
   */
  findSwarmsByObjective(query: string): SwarmInfo[] {
    const lowerQuery = query.toLowerCase();
    return this.getActiveSwarms().filter(
      (s) =>
        s.objective.toLowerCase().includes(lowerQuery) || s.name.toLowerCase().includes(lowerQuery)
    );
  }

  /**
   * Get swarm statistics
   */
  getSwarmStats(swarmId: string):
    | {
        memberCount: number;
        quorumState: QuorumState;
        ageMs: number;
        healthScore: number;
      }
    | undefined {
    const swarm = this.swarms.get(swarmId);
    if (!swarm) {
      return undefined;
    }

    const quorumState = swarm.membership.getQuorumState();

    return {
      memberCount: swarm.membership.getMemberCount(),
      quorumState,
      ageMs: Date.now() - swarm.createdAt,
      healthScore: this.calculateHealthScore(swarm),
    };
  }

  /**
   * Subscribe to swarm events
   */
  onEvent(handler: SwarmEventHandler): () => void {
    this.eventHandlers.push(handler);
    return () => {
      const index = this.eventHandlers.indexOf(handler);
      if (index !== -1) {
        this.eventHandlers.splice(index, 1);
      }
    };
  }

  /**
   * Perform maintenance (check heartbeats, timeouts)
   */
  performMaintenance(): string[] {
    const affectedSwarms: string[] = [];

    for (const [swarmId, swarm] of this.swarms) {
      if (swarm.status !== 'active' && swarm.status !== 'forming') {
        continue;
      }

      const timedOut = swarm.membership.checkTimeouts();
      if (timedOut.length > 0) {
        affectedSwarms.push(swarmId);
      }

      this.checkForEmptySwarm(swarmId);
    }

    return affectedSwarms;
  }

  private handleMembershipEvent(swarmId: string, event: MembershipEvent): void {
    if (event.type === 'joined') {
      this.emit({
        type: 'member-joined',
        swarmId,
        agentId: event.agentId,
        timestamp: event.timestamp,
        details: event.details,
      });
    } else if (event.type === 'left') {
      this.emit({
        type: 'member-left',
        swarmId,
        agentId: event.agentId,
        timestamp: event.timestamp,
      });
    }
  }

  private checkForEmptySwarm(swarmId: string): void {
    const swarm = this.swarms.get(swarmId);
    if (!swarm || !this.config.disbandEmptySwarms) {
      return;
    }

    const memberCount = swarm.membership.getMemberCount();
    if (memberCount === 0) {
      // Schedule disbandment
      if (!this.disbandTimeouts.has(swarmId)) {
        const timeout = setTimeout(() => {
          this.disbandTimeouts.delete(swarmId);
          if (swarm.membership.getMemberCount() === 0) {
            this.disbandSwarm(swarmId, {
              reason: 'Empty swarm timeout',
              redistributeTasks: false,
              notifyMembers: false,
            });
          }
        }, this.config.disbandTimeoutMs);
        this.disbandTimeouts.set(swarmId, timeout);
      }
    }
  }

  private calculateHealthScore(swarm: SwarmInfo): number {
    if (swarm.status === 'disbanded') return 0;
    if (swarm.status === 'disbanding') return 0.2;

    const quorumState = swarm.membership.getQuorumState();
    let score = 0.5;

    if (quorumState.hasQuorum) {
      score += 0.3;
    }
    if (quorumState.status === 'optimal') {
      score += 0.2;
    }
    if (swarm.membership.getLeader()) {
      score += 0.1;
    }

    return Math.min(1, score);
  }

  private trackAgentSwarm(agentId: string, swarmId: string): void {
    let swarmSet = this.agentSwarms.get(agentId);
    if (!swarmSet) {
      swarmSet = new Set();
      this.agentSwarms.set(agentId, swarmSet);
    }
    swarmSet.add(swarmId);
  }

  private untrackAgentSwarm(agentId: string, swarmId: string): void {
    const swarmSet = this.agentSwarms.get(agentId);
    if (swarmSet) {
      swarmSet.delete(swarmId);
      if (swarmSet.size === 0) {
        this.agentSwarms.delete(agentId);
      }
    }
  }

  private emit(event: SwarmEvent): void {
    for (const handler of this.eventHandlers) {
      try {
        handler(event);
      } catch {
        // Ignore handler errors
      }
    }
  }

  private generateSwarmId(name: string): string {
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .substring(0, 20);
    return `swarm-${slug}-${Date.now().toString(36)}`;
  }
}
