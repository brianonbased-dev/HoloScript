/**
 * Agent Hierarchy
 * Sprint 4 Priority 7 - Hierarchical Agent Orchestration
 *
 * Manages tree-structured agent hierarchies for delegation and supervision.
 */

import { EventEmitter } from 'events';
import type { AgentManifest, AgentCapability } from '../agents/AgentManifest';
import {
  AgentHierarchy,
  DelegationRule,
  HierarchyConfig,
  HierarchyStats,
  HierarchyEvent,
  HierarchyEventHandler,
  DEFAULT_HIERARCHY_CONFIG,
} from './HierarchyTypes';

// =============================================================================
// HIERARCHY MANAGER
// =============================================================================

/**
 * Manages agent hierarchies and their relationships
 */
export class HierarchyManager extends EventEmitter {
  private hierarchies: Map<string, AgentHierarchy> = new Map();
  private agentToHierarchy: Map<string, string> = new Map();
  private stats: Map<string, HierarchyStats> = new Map();
  private config: HierarchyConfig;

  constructor(config: Partial<HierarchyConfig> = {}) {
    super();
    this.config = { ...DEFAULT_HIERARCHY_CONFIG, ...config };
  }

  // ===========================================================================
  // HIERARCHY CRUD
  // ===========================================================================

  /**
   * Create a new hierarchy
   */
  createHierarchy(options: CreateHierarchyOptions): AgentHierarchy {
    const id = options.id || this.generateId();

    if (this.hierarchies.has(id)) {
      throw new Error(`Hierarchy already exists: ${id}`);
    }

    // Check if supervisor is already in another hierarchy
    if (this.agentToHierarchy.has(options.supervisor.id)) {
      throw new Error(`Agent ${options.supervisor.id} is already in a hierarchy`);
    }

    const hierarchy: AgentHierarchy = {
      id,
      name: options.name,
      supervisor: options.supervisor,
      subordinates: options.subordinates || [],
      delegationRules: options.delegationRules || [],
      escalationPath: options.escalationPath || [options.supervisor.id],
      metadata: {
        maxDepth: options.maxDepth ?? this.config.maxDepth,
        allowNesting: options.allowNesting ?? true,
        defaultTimeout: options.defaultTimeout ?? this.config.defaultTimeout,
        autoEscalate: options.autoEscalate ?? this.config.autoEscalate,
        tags: options.tags || [],
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    // Register agents
    this.agentToHierarchy.set(options.supervisor.id, id);
    for (const sub of hierarchy.subordinates) {
      if (this.agentToHierarchy.has(sub.id)) {
        throw new Error(`Agent ${sub.id} is already in a hierarchy`);
      }
      this.agentToHierarchy.set(sub.id, id);
    }

    this.hierarchies.set(id, hierarchy);
    this.initializeStats(id);

    this.emit('hierarchyCreated', { hierarchy });

    return hierarchy;
  }

  /**
   * Get hierarchy by ID
   */
  getHierarchy(id: string): AgentHierarchy {
    const hierarchy = this.hierarchies.get(id);
    if (!hierarchy) {
      throw new Error(`Hierarchy not found: ${id}`);
    }
    return hierarchy;
  }

  /**
   * Get hierarchy by agent ID
   */
  getHierarchyByAgent(agentId: string): AgentHierarchy | undefined {
    const hierarchyId = this.agentToHierarchy.get(agentId);
    if (!hierarchyId) return undefined;
    return this.hierarchies.get(hierarchyId);
  }

  /**
   * List all hierarchies
   */
  listHierarchies(): AgentHierarchy[] {
    return Array.from(this.hierarchies.values());
  }

  /**
   * Update hierarchy metadata
   */
  updateHierarchy(
    id: string,
    updates: Partial<Pick<AgentHierarchy, 'name' | 'escalationPath' | 'metadata'>>
  ): AgentHierarchy {
    const hierarchy = this.getHierarchy(id);

    if (updates.name !== undefined) {
      hierarchy.name = updates.name;
    }
    if (updates.escalationPath !== undefined) {
      hierarchy.escalationPath = updates.escalationPath;
    }
    if (updates.metadata !== undefined) {
      hierarchy.metadata = { ...hierarchy.metadata, ...updates.metadata };
    }

    hierarchy.updatedAt = Date.now();
    this.emit('hierarchyUpdated', { hierarchy });

    return hierarchy;
  }

  /**
   * Delete a hierarchy
   */
  deleteHierarchy(id: string): void {
    const hierarchy = this.getHierarchy(id);

    // Unregister all agents
    this.agentToHierarchy.delete(hierarchy.supervisor.id);
    for (const sub of hierarchy.subordinates) {
      this.agentToHierarchy.delete(sub.id);
    }

    this.hierarchies.delete(id);
    this.stats.delete(id);

    this.emit('hierarchyDeleted', { hierarchyId: id });
  }

  // ===========================================================================
  // SUBORDINATE MANAGEMENT
  // ===========================================================================

  /**
   * Add a subordinate to a hierarchy
   */
  addSubordinate(hierarchyId: string, subordinate: AgentManifest): void {
    const hierarchy = this.getHierarchy(hierarchyId);

    if (this.agentToHierarchy.has(subordinate.id)) {
      throw new Error(`Agent ${subordinate.id} is already in a hierarchy`);
    }

    if (hierarchy.subordinates.some((s) => s.id === subordinate.id)) {
      throw new Error(`Agent ${subordinate.id} is already a subordinate`);
    }

    hierarchy.subordinates.push(subordinate);
    this.agentToHierarchy.set(subordinate.id, hierarchyId);
    hierarchy.updatedAt = Date.now();

    // Update stats
    const stats = this.stats.get(hierarchyId);
    if (stats) {
      stats.activeSubordinates = hierarchy.subordinates.length;
      stats.tasksPerSubordinate[subordinate.id] = 0;
    }

    this.emit('subordinateAdded', { hierarchyId, subordinate });
  }

  /**
   * Remove a subordinate from a hierarchy
   */
  removeSubordinate(hierarchyId: string, subordinateId: string): void {
    const hierarchy = this.getHierarchy(hierarchyId);

    const index = hierarchy.subordinates.findIndex((s) => s.id === subordinateId);
    if (index === -1) {
      throw new Error(`Agent ${subordinateId} is not a subordinate of hierarchy ${hierarchyId}`);
    }

    const removed = hierarchy.subordinates.splice(index, 1)[0];
    this.agentToHierarchy.delete(subordinateId);
    hierarchy.updatedAt = Date.now();

    // Update stats
    const stats = this.stats.get(hierarchyId);
    if (stats) {
      stats.activeSubordinates = hierarchy.subordinates.length;
      delete stats.tasksPerSubordinate[subordinateId];
    }

    this.emit('subordinateRemoved', { hierarchyId, subordinate: removed });
  }

  /**
   * Get subordinates of a supervisor
   */
  getSubordinates(supervisorId: string): AgentManifest[] {
    const hierarchy = this.getHierarchyByAgent(supervisorId);
    if (!hierarchy || hierarchy.supervisor.id !== supervisorId) {
      return [];
    }
    return hierarchy.subordinates;
  }

  /**
   * Get supervisor of an agent
   */
  getSupervisor(agentId: string): AgentManifest | undefined {
    const hierarchy = this.getHierarchyByAgent(agentId);
    if (!hierarchy) return undefined;

    // If agent is the supervisor, no supervisor above them in this hierarchy
    if (hierarchy.supervisor.id === agentId) {
      return undefined;
    }

    return hierarchy.supervisor;
  }

  /**
   * Check if an agent is a supervisor
   */
  isSupervisor(agentId: string): boolean {
    const hierarchy = this.getHierarchyByAgent(agentId);
    return hierarchy?.supervisor.id === agentId;
  }

  /**
   * Check if an agent is a subordinate
   */
  isSubordinate(agentId: string): boolean {
    const hierarchy = this.getHierarchyByAgent(agentId);
    if (!hierarchy) return false;
    return hierarchy.subordinates.some((s) => s.id === agentId);
  }

  // ===========================================================================
  // DELEGATION RULES
  // ===========================================================================

  /**
   * Add a delegation rule to a hierarchy
   */
  addDelegationRule(hierarchyId: string, rule: Omit<DelegationRule, 'id'>): DelegationRule {
    const hierarchy = this.getHierarchy(hierarchyId);

    const fullRule: DelegationRule = {
      id: this.generateId(),
      ...rule,
    };

    hierarchy.delegationRules.push(fullRule);
    hierarchy.updatedAt = Date.now();

    this.emit('ruleAdded', { hierarchyId, rule: fullRule });

    return fullRule;
  }

  /**
   * Remove a delegation rule
   */
  removeDelegationRule(hierarchyId: string, ruleId: string): void {
    const hierarchy = this.getHierarchy(hierarchyId);

    const index = hierarchy.delegationRules.findIndex((r) => r.id === ruleId);
    if (index === -1) {
      throw new Error(`Rule not found: ${ruleId}`);
    }

    const removed = hierarchy.delegationRules.splice(index, 1)[0];
    hierarchy.updatedAt = Date.now();

    this.emit('ruleRemoved', { hierarchyId, rule: removed });
  }

  /**
   * Find matching delegation rule for a task type
   */
  findDelegationRule(hierarchyId: string, taskType: string): DelegationRule | undefined {
    const hierarchy = this.getHierarchy(hierarchyId);

    // Find rules matching this task type, sorted by priority
    const matchingRules = hierarchy.delegationRules
      .filter((r) => r.taskType === taskType || r.taskType === '*')
      .sort((a, b) => b.priority - a.priority);

    return matchingRules[0];
  }

  /**
   * Find subordinate matching a capability
   */
  findSubordinateByCapability(
    hierarchyId: string,
    capabilityType: string
  ): AgentManifest | undefined {
    const hierarchy = this.getHierarchy(hierarchyId);

    return hierarchy.subordinates.find((sub) =>
      sub.capabilities.some((cap: AgentCapability) => cap.type === capabilityType)
    );
  }

  // ===========================================================================
  // ESCALATION
  // ===========================================================================

  /**
   * Get the escalation path for a hierarchy
   */
  getEscalationPath(hierarchyId: string): string[] {
    const hierarchy = this.getHierarchy(hierarchyId);
    return [...hierarchy.escalationPath];
  }

  /**
   * Get next agent in escalation path
   */
  getNextEscalationTarget(hierarchyId: string, currentAgentId: string): string | undefined {
    const path = this.getEscalationPath(hierarchyId);
    const currentIndex = path.indexOf(currentAgentId);

    if (currentIndex === -1) {
      // Not in path, return first in path
      return path[0];
    }

    if (currentIndex >= path.length - 1) {
      // Already at end of path
      return undefined;
    }

    return path[currentIndex + 1];
  }

  // ===========================================================================
  // STATISTICS
  // ===========================================================================

  /**
   * Get statistics for a hierarchy
   */
  getStats(hierarchyId: string): HierarchyStats {
    const stats = this.stats.get(hierarchyId);
    if (!stats) {
      throw new Error(`Stats not found for hierarchy: ${hierarchyId}`);
    }
    return { ...stats };
  }

  /**
   * Update task statistics
   */
  recordTaskCompletion(
    hierarchyId: string,
    subordinateId: string,
    success: boolean,
    duration: number
  ): void {
    const stats = this.stats.get(hierarchyId);
    if (!stats) return;

    stats.totalTasks++;
    if (success) {
      stats.completedTasks++;
    } else {
      stats.failedTasks++;
    }

    // Update average completion time
    const totalCompleted = stats.completedTasks;
    stats.avgCompletionTime =
      (stats.avgCompletionTime * (totalCompleted - 1) + duration) / totalCompleted || 0;

    // Update success rate
    stats.successRate = stats.totalTasks > 0 ? stats.completedTasks / stats.totalTasks : 0;

    // Update per-subordinate count
    stats.tasksPerSubordinate[subordinateId] = (stats.tasksPerSubordinate[subordinateId] || 0) + 1;

    stats.updatedAt = Date.now();
  }

  /**
   * Record an escalation
   */
  recordEscalation(hierarchyId: string): void {
    const stats = this.stats.get(hierarchyId);
    if (!stats) return;

    stats.escalatedTasks++;
    stats.updatedAt = Date.now();
  }

  // ===========================================================================
  // HELPERS
  // ===========================================================================

  private generateId(): string {
    return `hier_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  private initializeStats(hierarchyId: string): void {
    const hierarchy = this.getHierarchy(hierarchyId);

    const tasksPerSubordinate: Record<string, number> = {};
    for (const sub of hierarchy.subordinates) {
      tasksPerSubordinate[sub.id] = 0;
    }

    this.stats.set(hierarchyId, {
      hierarchyId,
      totalTasks: 0,
      completedTasks: 0,
      failedTasks: 0,
      escalatedTasks: 0,
      avgCompletionTime: 0,
      successRate: 0,
      activeSubordinates: hierarchy.subordinates.length,
      tasksPerSubordinate,
      updatedAt: Date.now(),
    });
  }

  // ===========================================================================
  // EVENT HANDLING
  // ===========================================================================

  /**
   * Override emit to type events
   */
  emit(event: HierarchyEvent, data?: unknown): boolean {
    return super.emit(event, data);
  }

  /**
   * Override on to type events
   */
  on(event: HierarchyEvent, listener: HierarchyEventHandler): this {
    return super.on(event, listener);
  }
}

// =============================================================================
// FACTORY
// =============================================================================

let defaultManager: HierarchyManager | null = null;

/**
 * Get the default hierarchy manager
 */
export function getHierarchyManager(): HierarchyManager {
  if (!defaultManager) {
    defaultManager = new HierarchyManager();
  }
  return defaultManager;
}

/**
 * Reset the default hierarchy manager (for testing)
 */
export function resetHierarchyManager(): void {
  defaultManager = null;
}

// =============================================================================
// OPTIONS
// =============================================================================

/**
 * Options for creating a hierarchy
 */
export interface CreateHierarchyOptions {
  /** Optional ID (auto-generated if not provided) */
  id?: string;

  /** Name of the hierarchy */
  name: string;

  /** Supervising agent */
  supervisor: AgentManifest;

  /** Initial subordinates */
  subordinates?: AgentManifest[];

  /** Delegation rules */
  delegationRules?: DelegationRule[];

  /** Escalation path (agent IDs) */
  escalationPath?: string[];

  /** Maximum nesting depth */
  maxDepth?: number;

  /** Allow nested hierarchies */
  allowNesting?: boolean;

  /** Default task timeout */
  defaultTimeout?: number;

  /** Auto-escalate on failure */
  autoEscalate?: boolean;

  /** Tags for categorization */
  tags?: string[];
}
