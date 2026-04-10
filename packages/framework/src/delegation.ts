/**
 * Cross-team Delegation — Send tasks between teams.
 *
 * Tracks delegation chains to prevent infinite loops and
 * enables cross-team collaboration via board forwarding.
 *
 * FW-0.6 — Cross-team delegation.
 *
 * @module delegation
 */

import type { TaskDef, SlotRole } from './types';

// =============================================================================
// TYPES
// =============================================================================

export interface DelegationResult {
  /** Whether the delegation was accepted */
  success: boolean;
  /** The task that was delegated */
  taskId: string;
  /** Source team ID */
  fromTeam: string;
  /** Target team ID */
  toTeam: string;
  /** The delegation chain (to detect loops) */
  chain: string[];
  /** Reason for success or failure */
  reason: string;
}

export interface DelegationRecord {
  /** Original task ID */
  taskId: string;
  /** Task title (for display) */
  taskTitle: string;
  /** The team that delegated */
  fromTeam: string;
  /** The team that received */
  toTeam: string;
  /** Full chain of delegations */
  chain: string[];
  /** When the delegation happened */
  timestamp: number;
  /** Status of the delegated task */
  status: 'pending' | 'accepted' | 'rejected' | 'completed' | 'bounced';
  /** Callback URL or team reference for result delivery */
  callbackRef?: string;
}

export interface DelegationPolicy {
  /** Maximum delegation chain length before rejecting (default 5) */
  maxChainLength?: number;
  /** Whether to allow delegating back to a team already in the chain (default false) */
  allowCycles?: boolean;
  /** Required capabilities the target team must have (optional) */
  requiredCapabilities?: string[];
}

/**
 * Adapter interface for sending tasks to other teams.
 * Implementations may use HTTP (remote boards), gossip (mesh), or in-process (local).
 */
export interface TeamBoardAdapter {
  /** Send a task to a target team's board */
  sendTask(
    targetTeamId: string,
    task: Pick<TaskDef, 'title' | 'description' | 'priority' | 'role' | 'source'>
  ): Promise<{ accepted: boolean; taskId?: string; reason?: string }>;

  /** Notify a team about delegation completion */
  notifyCompletion(
    teamId: string,
    delegation: DelegationRecord,
    result: { summary: string }
  ): Promise<void>;
}

// =============================================================================
// IN-PROCESS ADAPTER (for teams in the same process)
// =============================================================================

type AddTasksFn = (
  tasks: Array<Pick<TaskDef, 'title' | 'description' | 'priority' | 'role' | 'source'>>
) => Promise<TaskDef[]>;

export class InProcessBoardAdapter implements TeamBoardAdapter {
  private teams: Map<string, { addTasks: AddTasksFn }> = new Map();

  registerTeam(teamId: string, addTasks: AddTasksFn): void {
    this.teams.set(teamId, { addTasks });
  }

  async sendTask(
    targetTeamId: string,
    task: Pick<TaskDef, 'title' | 'description' | 'priority' | 'role' | 'source'>
  ): Promise<{ accepted: boolean; taskId?: string; reason?: string }> {
    const target = this.teams.get(targetTeamId);
    if (!target) {
      return { accepted: false, reason: `Team "${targetTeamId}" not found` };
    }
    try {
      const added = await target.addTasks([task]);
      if (added.length > 0) {
        return { accepted: true, taskId: added[0].id };
      }
      return { accepted: false, reason: 'Task was deduplicated' };
    } catch (err) {
      return { accepted: false, reason: err instanceof Error ? err.message : String(err) };
    }
  }

  async notifyCompletion(
    _teamId: string,
    _delegation: DelegationRecord,
    _result: { summary: string }
  ): Promise<void> {
    // In-process: no-op — the originating team can poll or observe directly
  }
}

// =============================================================================
// DELEGATION MANAGER
// =============================================================================

export class DelegationManager {
  private delegations: Map<string, DelegationRecord> = new Map();
  private policy: Required<Omit<DelegationPolicy, 'requiredCapabilities'>> & {
    requiredCapabilities: string[];
  };

  constructor(
    private teamId: string,
    private adapter: TeamBoardAdapter,
    policy: DelegationPolicy = {}
  ) {
    this.policy = {
      maxChainLength: policy.maxChainLength ?? 5,
      allowCycles: policy.allowCycles ?? false,
      requiredCapabilities: policy.requiredCapabilities ?? [],
    };
  }

  /**
   * Delegate a task to another team.
   *
   * 1. Validate delegation chain (no cycles, max length)
   * 2. Forward task to target team's board via adapter
   * 3. Track delegation record
   */
  async delegate(
    task: TaskDef,
    targetTeamId: string,
    existingChain: string[] = []
  ): Promise<DelegationResult> {
    const chain = [...existingChain, this.teamId];

    // Prevent self-delegation
    if (targetTeamId === this.teamId) {
      return {
        success: false,
        taskId: task.id,
        fromTeam: this.teamId,
        toTeam: targetTeamId,
        chain,
        reason: 'Cannot delegate to self',
      };
    }

    // Check for cycles
    if (!this.policy.allowCycles && chain.includes(targetTeamId)) {
      return {
        success: false,
        taskId: task.id,
        fromTeam: this.teamId,
        toTeam: targetTeamId,
        chain,
        reason: `Cycle detected: "${targetTeamId}" is already in the delegation chain`,
      };
    }

    // Check chain length
    if (chain.length >= this.policy.maxChainLength) {
      return {
        success: false,
        taskId: task.id,
        fromTeam: this.teamId,
        toTeam: targetTeamId,
        chain,
        reason: `Delegation chain too long (${chain.length} >= max ${this.policy.maxChainLength})`,
      };
    }

    // Forward to target team
    const result = await this.adapter.sendTask(targetTeamId, {
      title: task.title,
      description: `[Delegated from ${this.teamId}] ${task.description}`,
      priority: task.priority,
      role: task.role,
      source: `delegation:${this.teamId}:${task.id}`,
    });

    const record: DelegationRecord = {
      taskId: task.id,
      taskTitle: task.title,
      fromTeam: this.teamId,
      toTeam: targetTeamId,
      chain,
      timestamp: Date.now(),
      status: result.accepted ? 'accepted' : 'rejected',
    };

    const key = `${task.id}:${targetTeamId}`;
    this.delegations.set(key, record);

    return {
      success: result.accepted,
      taskId: task.id,
      fromTeam: this.teamId,
      toTeam: targetTeamId,
      chain,
      reason: result.accepted
        ? `Delegated to "${targetTeamId}" (remote task: ${result.taskId})`
        : result.reason ?? 'Target team rejected the task',
    };
  }

  /**
   * Mark a delegation as completed.
   */
  async completeDelegation(
    taskId: string,
    targetTeamId: string,
    summary: string
  ): Promise<boolean> {
    const key = `${taskId}:${targetTeamId}`;
    const record = this.delegations.get(key);
    if (!record) return false;

    record.status = 'completed';

    // Notify originating team if there's a chain
    if (record.chain.length > 1) {
      const originTeam = record.chain[0];
      await this.adapter.notifyCompletion(originTeam, record, { summary });
    }

    return true;
  }

  /**
   * Get all delegations from this team.
   */
  getOutboundDelegations(): DelegationRecord[] {
    return [...this.delegations.values()].filter(d => d.fromTeam === this.teamId);
  }

  /**
   * Get pending delegations.
   */
  getPendingDelegations(): DelegationRecord[] {
    return [...this.delegations.values()].filter(d => d.status === 'pending' || d.status === 'accepted');
  }
}
