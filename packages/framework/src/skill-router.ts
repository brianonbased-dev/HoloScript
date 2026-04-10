/**
 * SkillRouter — Skill-based task routing via agent capabilities.
 *
 * Matches task requirements to agent capabilities, scores by overlap,
 * and returns the best-fit agent. Supports required vs preferred skills.
 *
 * FW-0.6 — Skill-based routing via agent capabilities.
 *
 * @module skill-router
 */

import type { AgentConfig, TaskDef, SlotRole } from './types';

// =============================================================================
// TYPES
// =============================================================================

export interface RoutingResult {
  /** The selected agent, or null if no match */
  agent: AgentConfig | null;
  /** Score of the selected agent (0-100) */
  score: number;
  /** All candidates with their scores, sorted descending */
  candidates: ScoredCandidate[];
  /** Reason for selection or rejection */
  reason: string;
}

export interface ScoredCandidate {
  agent: AgentConfig;
  score: number;
  matchedCapabilities: string[];
  roleMatch: boolean;
}

export interface RoutingPolicy {
  /** Minimum score threshold (0-100) to be eligible (default 10) */
  minScore?: number;
  /** Weight for capability matches (default 15) */
  capabilityWeight?: number;
  /** Weight for exact role match (default 25) */
  roleWeight?: number;
  /** Weight for priority alignment (default 10) */
  priorityWeight?: number;
  /** Required capabilities — agent MUST have all of these */
  requiredCapabilities?: string[];
}

// =============================================================================
// SKILL ROUTER
// =============================================================================

export class SkillRouter {
  private defaultPolicy: Required<RoutingPolicy>;

  constructor(policy: RoutingPolicy = {}) {
    this.defaultPolicy = {
      minScore: policy.minScore ?? 10,
      capabilityWeight: policy.capabilityWeight ?? 15,
      roleWeight: policy.roleWeight ?? 25,
      priorityWeight: policy.priorityWeight ?? 10,
      requiredCapabilities: policy.requiredCapabilities ?? [],
    };
  }

  /**
   * Route a task to the best-fit agent.
   *
   * Scoring:
   * - Each capability keyword match in task title/description: +capabilityWeight
   * - Exact role match (task.role === agent role mapping): +roleWeight
   * - Priority alignment (agent.claimFilter.maxPriority >= task.priority): +priorityWeight
   * - Required capabilities must ALL be present or agent is filtered out
   */
  route(task: TaskDef, agents: AgentConfig[], policy?: RoutingPolicy): RoutingResult {
    const p = { ...this.defaultPolicy, ...policy };

    if (agents.length === 0) {
      return { agent: null, score: 0, candidates: [], reason: 'No agents available' };
    }

    const taskText = `${task.title} ${task.description}`.toLowerCase();
    const candidates: ScoredCandidate[] = [];

    for (const agent of agents) {
      // Check required capabilities
      const agentCaps = new Set(agent.capabilities.map(c => c.toLowerCase()));
      if (p.requiredCapabilities.length > 0) {
        const hasAll = p.requiredCapabilities.every(rc => agentCaps.has(rc.toLowerCase()));
        if (!hasAll) continue;
      }

      // Check priority alignment
      if (task.priority > agent.claimFilter.maxPriority) continue;

      let score = 0;
      const matchedCapabilities: string[] = [];

      // Capability matching — check if agent capabilities appear in task text
      for (const cap of agent.capabilities) {
        const capLower = cap.toLowerCase();
        if (taskText.includes(capLower)) {
          score += p.capabilityWeight;
          matchedCapabilities.push(cap);
        }
      }

      // Role matching
      const roleMatch = task.role ? this.agentMatchesRole(agent, task.role) : false;
      if (roleMatch) {
        score += p.roleWeight;
      }

      // Priority alignment bonus (closer to task priority = better fit)
      const priorityDelta = agent.claimFilter.maxPriority - task.priority;
      if (priorityDelta >= 0) {
        // Agents whose maxPriority closely matches get a bonus
        score += Math.max(0, p.priorityWeight - priorityDelta);
      }

      // Base score for being eligible at all
      score += 5;

      candidates.push({ agent, score, matchedCapabilities, roleMatch });
    }

    // Sort by score descending
    candidates.sort((a, b) => b.score - a.score);

    // Apply minimum threshold
    const eligible = candidates.filter(c => c.score >= p.minScore);

    if (eligible.length === 0) {
      return {
        agent: null,
        score: 0,
        candidates,
        reason: candidates.length > 0
          ? `${candidates.length} candidates scored below minimum threshold (${p.minScore})`
          : 'No candidates matched task requirements',
      };
    }

    const winner = eligible[0];
    return {
      agent: winner.agent,
      score: winner.score,
      candidates,
      reason: `Best fit: ${winner.agent.name} (score ${winner.score}, ${winner.matchedCapabilities.length} capability matches${winner.roleMatch ? ', role match' : ''})`,
    };
  }

  /**
   * Route a task to multiple agents (for parallel execution or fallback chains).
   */
  routeMultiple(
    task: TaskDef,
    agents: AgentConfig[],
    count: number,
    policy?: RoutingPolicy
  ): RoutingResult {
    const result = this.route(task, agents, policy);
    // Already sorted — just return top N candidates
    const topN = result.candidates.slice(0, count);
    return {
      ...result,
      agent: topN[0]?.agent ?? null,
      candidates: topN,
      reason: `Top ${Math.min(count, topN.length)} candidates selected`,
    };
  }

  // ── Private ──

  private agentMatchesRole(agent: AgentConfig, taskRole: SlotRole): boolean {
    // Map agent roles to slot roles
    const roleMapping: Record<string, SlotRole[]> = {
      architect: ['researcher', 'reviewer'],
      coder: ['coder', 'flex'],
      researcher: ['researcher'],
      reviewer: ['reviewer', 'tester'],
    };
    const mappedRoles = roleMapping[agent.role] ?? [];
    return mappedRoles.includes(taskRole) || agent.claimFilter.roles.includes(taskRole);
  }
}
