/**
 * Team — The central orchestrator.
 *
 * A persistent, knowledge-compounding workspace where agents claim tasks,
 * execute work, publish knowledge, and get smarter over time.
 *
 * Local-first: works entirely in-process. Optional remote board/knowledge.
 */

import type {
  TeamConfig,
  AgentConfig,
  TaskDef,
  CycleResult,
  AgentCycleResult,
  AgentRuntime,
  KnowledgeInsight,
  ConsensusMode,
  ProposalResult,
  ReputationTier,
  SuggestionCreateResult,
  SuggestionVoteResult,
  SuggestionListResult,
  SuggestionStatus,
  TeamMode,
  SetModeResult,
  DeriveResult,
  PresenceResult,
  HeartbeatResult,
} from './types';
import { KnowledgeStore } from './knowledge/knowledge-store';
import { callLLM } from './llm/llm-adapter';
import type { LLMMessage } from './llm/llm-adapter';
import { runProtocolCycle } from './protocol-agent';
import { GoalSynthesizer } from './protocol/goal-synthesizer';
import type { GoalContext, SynthesizedGoal } from './protocol/goal-synthesizer';
import type { Goal } from './protocol/implementations';
import { SmartMicroPhaseDecomposer, createLLMAdapter } from './protocol/micro-phase-decomposer';
import type { DecompositionResult, TaskDescription } from './protocol/micro-phase-decomposer';

// ── Internal Proposal (not exported — use ProposalResult from types) ──

interface InternalProposal<T = unknown> {
  id: string;
  key: string;
  value: T;
  proposedBy: string;
  votes: Map<string, boolean>;
  status: 'pending' | 'accepted' | 'rejected';
  createdAt: number;
  resolvedAt?: number;
}

// ── Reputation ──

const REPUTATION_THRESHOLDS: Record<ReputationTier, number> = {
  newcomer: 0,
  contributor: 5,
  expert: 30,
  authority: 100,
};

function computeTier(score: number): ReputationTier {
  if (score >= REPUTATION_THRESHOLDS.authority) return 'authority';
  if (score >= REPUTATION_THRESHOLDS.expert) return 'expert';
  if (score >= REPUTATION_THRESHOLDS.contributor) return 'contributor';
  return 'newcomer';
}

/** When fewer than this many open tasks exist, agents synthesize goals instead of skipping. */
const OPEN_TASK_THRESHOLD = 3;

export class Team {
  readonly name: string;
  readonly knowledge: KnowledgeStore;

  private config: TeamConfig;
  private agentConfigs: AgentConfig[];
  private runtimes: Map<string, AgentRuntime> = new Map();
  private board: TaskDef[] = [];
  private doneLog: Array<{ taskId: string; title: string; completedBy: string; timestamp: string }> = [];
  private cycle = 0;
  private consensusMode: ConsensusMode;
  private proposals: Map<string, InternalProposal> = new Map();
  private goalSynthesizer: GoalSynthesizer;
  private decomposer: SmartMicroPhaseDecomposer | null = null;

  constructor(config: TeamConfig) {
    this.config = config;
    this.name = config.name;
    this.agentConfigs = config.agents;
    this.consensusMode = config.consensus ?? 'simple_majority';

    this.knowledge = new KnowledgeStore(
      config.knowledge ?? { persist: false }
    );

    // GoalSynthesizer gets knowledge store so it can derive context-aware goals (FW-0.2)
    // LLM config comes from first agent — all agents on a team typically share a provider.
    const firstAgent = this.agentConfigs[0];
    this.goalSynthesizer = new GoalSynthesizer({
      knowledge: this.knowledge,
      llm: firstAgent?.model,
    });

    // SmartMicroPhaseDecomposer — LLM-powered task decomposition (FW-0.2)
    if (firstAgent?.model) {
      this.decomposer = new SmartMicroPhaseDecomposer(createLLMAdapter(firstAgent.model));
    }

    // Initialize agent runtimes
    for (const agent of this.agentConfigs) {
      this.runtimes.set(agent.name, {
        name: agent.name,
        role: agent.role,
        config: agent,
        tasksCompleted: 0,
        knowledgePublished: 0,
        reputationScore: 0,
        reputationTier: 'newcomer',
      });
    }
  }

  /** Whether this team is connected to a remote HoloMesh board. */
  get isRemote(): boolean {
    return !!(this.config.boardUrl && this.config.boardApiKey);
  }

  /** POST/GET/PATCH to remote board API. Returns null if local-only. */
  private async boardFetch(
    path: string,
    method: 'GET' | 'POST' | 'PATCH',
    body?: Record<string, unknown>
  ): Promise<Record<string, unknown> | null> {
    if (!this.config.boardUrl || !this.config.boardApiKey) return null;
    try {
      const res = await fetch(`${this.config.boardUrl}${path}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.config.boardApiKey}`,
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(15_000),
      });
      return (await res.json()) as Record<string, unknown>;
    } catch {
      return null;
    }
  }

  // ── Board Management ──

  /** Add tasks to the board. Deduplicates by normalized title. */
  async addTasks(tasks: Array<Omit<TaskDef, 'id' | 'status' | 'createdAt'>>): Promise<TaskDef[]> {
    if (this.isRemote) {
      const res = await this.boardFetch(`/api/holomesh/team/${encodeURIComponent(this.name)}/board`, 'POST', { tasks });
      if (res && res.error) throw new Error(String(res.error));
      return (res?.tasks || res?.added || []) as TaskDef[];
    }

    const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 60);
    const existing = new Set([
      ...this.board.map(t => normalize(t.title)),
      ...this.doneLog.map(d => normalize(d.title)),
    ]);

    const added: TaskDef[] = [];
    for (const t of tasks) {
      const norm = normalize(t.title);
      if (existing.has(norm)) continue;
      existing.add(norm);

      const task: TaskDef = {
        id: `task_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        title: t.title,
        description: t.description,
        priority: t.priority,
        role: t.role,
        source: t.source,
        status: 'open',
        createdAt: new Date().toISOString(),
      };
      this.board.push(task);
      added.push(task);
    }
    return added;
  }

  /** Get all open tasks, sorted by priority. */
  get openTasks(): TaskDef[] {
    return this.board
      .filter(t => t.status === 'open')
      .sort((a, b) => a.priority - b.priority);
  }

  /** Get all board tasks. */
  get allTasks(): TaskDef[] {
    return [...this.board];
  }

  /** Get completed task count. */
  get completedCount(): number {
    return this.doneLog.length;
  }

  // ── Work Cycle ──

  /**
   * Run one work cycle: each agent checks the board, claims a matching task,
   * executes it via LLM, publishes knowledge, and compounds insights.
   */
  async runCycle(): Promise<CycleResult> {
    const start = Date.now();
    this.cycle++;

    // Remote mode: fetch board, claim via API, execute locally, mark done via API
    if (this.isRemote) {
      return this.runRemoteCycle(start);
    }

    const results: AgentCycleResult[] = [];
    const allInsights: KnowledgeInsight[] = [];
    const claimed = new Set<string>();

    for (const [, runtime] of this.runtimes) {
      const agent = runtime.config;

      // Find a matching task
      let task = this.findClaimableTask(agent, claimed);
      let synthesized = false;

      // When no task found and board is sparse, synthesize a goal autonomously (FW-0.2)
      if (!task && this.openTasks.length < OPEN_TASK_THRESHOLD) {
        const domain = agent.knowledgeDomains?.[0] ?? 'general';
        const goalContext: GoalContext = {
          domain,
          teamName: this.name,
          agentName: runtime.name,
          capabilities: agent.capabilities,
          recentCompletedTasks: this.doneLog.slice(-10).map(d => d.title),
        };
        try {
          const goals = await this.goalSynthesizer.synthesizeMultiple(goalContext, 1);
          if (goals.length > 0) {
            task = this.goalToTask(goals[0], agent.role);
            synthesized = true;
          }
        } catch {
          // Fallback to synchronous heuristic
          const goal = this.goalSynthesizer.synthesize(domain, 'autonomous-boredom');
          task = this.goalToTask(goal, agent.role);
          synthesized = true;
        }
      }

      if (!task) {
        results.push({
          agentName: runtime.name,
          taskId: null,
          taskTitle: null,
          action: 'skipped',
          summary: 'No matching open tasks',
          knowledge: [],
        });
        continue;
      }

      claimed.add(task.id);
      task.status = 'claimed';
      task.claimedBy = runtime.name;

      // Execute via LLM
      try {
        const { summary, insights } = await this.executeTask(runtime, task);

        // Mark done
        task.status = 'done';
        task.completedAt = new Date().toISOString();
        this.board = this.board.filter(t => t.id !== task.id);
        this.doneLog.push({
          taskId: task.id,
          title: task.title,
          completedBy: runtime.name,
          timestamp: task.completedAt,
        });

        // Publish knowledge
        for (const insight of insights) {
          this.knowledge.publish(insight, runtime.name);
          runtime.knowledgePublished++;
        }

        // Update reputation
        runtime.tasksCompleted++;
        runtime.reputationScore += 1 + insights.length * 0.5;
        runtime.reputationTier = computeTier(runtime.reputationScore);

        allInsights.push(...insights);
        results.push({
          agentName: runtime.name,
          taskId: task.id,
          taskTitle: task.title,
          action: synthesized ? 'synthesized' : 'completed',
          summary,
          knowledge: insights,
        });
      } catch (err) {
        task.status = 'open';
        task.claimedBy = undefined;
        results.push({
          agentName: runtime.name,
          taskId: task.id,
          taskTitle: task.title,
          action: 'error',
          summary: err instanceof Error ? err.message : String(err),
          knowledge: [],
        });
      }
    }

    // Compound knowledge
    const compounded = this.knowledge.compound(allInsights);

    return {
      teamName: this.name,
      cycle: this.cycle,
      agentResults: results,
      knowledgeProduced: allInsights,
      compoundedInsights: compounded,
      durationMs: Date.now() - start,
    };
  }

  /** Remote work cycle: board ops via HoloMesh API, execution local via LLM. */
  private async runRemoteCycle(start: number): Promise<CycleResult> {
    const teamId = encodeURIComponent(this.name);
    const results: AgentCycleResult[] = [];
    const allInsights: KnowledgeInsight[] = [];

    // Fetch board state from remote
    const boardData = await this.boardFetch(`/api/holomesh/team/${teamId}/board`, 'GET');
    const openTasks = ((boardData?.board as Record<string, unknown>)?.open as TaskDef[] || [])
      .sort((a, b) => a.priority - b.priority);

    const claimed = new Set<string>();

    for (const [, runtime] of this.runtimes) {
      const agent = runtime.config;

      // Find matching task from remote board
      let task = openTasks.find(t => {
        if (claimed.has(t.id)) return false;
        if (t.priority > agent.claimFilter.maxPriority) return false;
        if (t.role) return agent.claimFilter.roles.includes(t.role);
        return true;
      });
      let synthesized = false;

      // When no task found and remote board is sparse, synthesize a goal autonomously (FW-0.2)
      if (!task && openTasks.length < OPEN_TASK_THRESHOLD) {
        const domain = agent.knowledgeDomains?.[0] ?? 'general';
        let goal: Goal;
        try {
          const goals = await this.goalSynthesizer.synthesizeMultiple({
            domain,
            teamName: this.name,
            agentName: runtime.name,
            capabilities: agent.capabilities,
            recentCompletedTasks: this.doneLog.slice(-10).map(d => d.title),
          }, 1);
          goal = goals[0] ?? this.goalSynthesizer.synthesize(domain, 'autonomous-boredom');
        } catch {
          goal = this.goalSynthesizer.synthesize(domain, 'autonomous-boredom');
        }
        const addRes = await this.boardFetch(`/api/holomesh/team/${teamId}/board`, 'POST', {
          tasks: [{
            title: goal.description,
            description: `Autonomously synthesized goal [${goal.category}] — priority ${goal.priority}`,
            priority: goal.priority === 'high' ? 2 : goal.priority === 'medium' ? 4 : 6,
            role: (agent.role === 'architect' || agent.role === 'researcher') ? 'researcher' : 'coder',
            source: `synthesizer:${goal.source}`,
          }],
        });
        const addedTasks = (addRes?.tasks || addRes?.added || []) as TaskDef[];
        task = addedTasks[0];
        synthesized = true;
      }

      if (!task) {
        results.push({ agentName: runtime.name, taskId: null, taskTitle: null, action: 'skipped', summary: 'No matching open tasks', knowledge: [] });
        continue;
      }

      claimed.add(task.id);

      // Claim via API
      const claimRes = await this.boardFetch(`/api/holomesh/team/${teamId}/board/${encodeURIComponent(task.id)}`, 'PATCH', { action: 'claim' });
      if (claimRes?.error) {
        results.push({ agentName: runtime.name, taskId: task.id, taskTitle: task.title, action: 'error', summary: `Claim failed: ${claimRes.error}`, knowledge: [] });
        continue;
      }

      // Execute locally via LLM
      try {
        const { summary, insights } = await this.executeTask(runtime, task);

        // Mark done via API
        await this.boardFetch(`/api/holomesh/team/${teamId}/board/${encodeURIComponent(task.id)}`, 'PATCH', { action: 'done', summary });

        // Publish knowledge locally + compound
        for (const insight of insights) {
          this.knowledge.publish(insight, runtime.name);
          runtime.knowledgePublished++;
        }

        runtime.tasksCompleted++;
        runtime.reputationScore += 1 + insights.length * 0.5;
        runtime.reputationTier = computeTier(runtime.reputationScore);

        allInsights.push(...insights);
        results.push({ agentName: runtime.name, taskId: task.id, taskTitle: task.title, action: synthesized ? 'synthesized' : 'completed', summary, knowledge: insights });
      } catch (err) {
        // Reopen task on failure
        await this.boardFetch(`/api/holomesh/team/${teamId}/board/${encodeURIComponent(task.id)}`, 'PATCH', { action: 'reopen' });
        results.push({ agentName: runtime.name, taskId: task.id, taskTitle: task.title, action: 'error', summary: err instanceof Error ? err.message : String(err), knowledge: [] });
      }
    }

    const compounded = this.knowledge.compound(allInsights);

    // Sync knowledge to remote if configured
    if (this.knowledge['config'].remoteUrl) {
      await this.knowledge.syncToRemote();
    }

    return { teamName: this.name, cycle: this.cycle, agentResults: results, knowledgeProduced: allInsights, compoundedInsights: compounded, durationMs: Date.now() - start };
  }

  // ── Consensus ──

  /** Propose a decision for the team to vote on. */
  async propose<T>(key: string, value: T): Promise<ProposalResult<T>> {
    const proposal: InternalProposal<T> = {
      id: `prop_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      key,
      value,
      proposedBy: 'team',
      votes: new Map(),
      status: 'pending',
      createdAt: Date.now(),
    };

    // Each agent votes based on their LLM
    for (const [, runtime] of this.runtimes) {
      try {
        const vote = await this.getAgentVote(runtime, key, value);
        proposal.votes.set(runtime.name, vote);
      } catch {
        // Abstain on error
      }
    }

    const votesFor = Array.from(proposal.votes.values()).filter(v => v).length;
    const votesAgainst = proposal.votes.size - votesFor;
    const total = proposal.votes.size;

    let accepted: boolean;
    switch (this.consensusMode) {
      case 'unanimous':
        accepted = votesFor === total && total > 0;
        break;
      case 'owner_decides':
        accepted = true; // owner always decides yes (simplified)
        break;
      case 'simple_majority':
      default:
        accepted = votesFor > total / 2;
        break;
    }

    proposal.status = accepted ? 'accepted' : 'rejected';
    proposal.resolvedAt = Date.now();
    this.proposals.set(proposal.id, proposal);

    return {
      proposalId: proposal.id,
      accepted,
      votesFor,
      votesAgainst,
      votesTotal: total,
      value,
    };
  }

  // ── Reputation ──

  /** Get the reputation leaderboard. */
  leaderboard(): AgentRuntime[] {
    return Array.from(this.runtimes.values())
      .sort((a, b) => b.reputationScore - a.reputationScore);
  }

  /** Get a specific agent's runtime. */
  getAgent(name: string): AgentRuntime | undefined {
    return this.runtimes.get(name);
  }

  // ── Suggestions ──

  /** Create a suggestion for the team. Requires remote board. */
  async suggest(
    title: string,
    opts?: { description?: string; category?: string; evidence?: string }
  ): Promise<SuggestionCreateResult> {
    if (!this.isRemote) throw new Error('suggest() requires a remote board (boardUrl + boardApiKey)');
    const teamId = encodeURIComponent(this.name);
    const res = await this.boardFetch(`/api/holomesh/team/${teamId}/suggestions`, 'POST', {
      title,
      description: opts?.description,
      category: opts?.category,
      evidence: opts?.evidence,
    });
    if (!res) throw new Error('Failed to create suggestion — no response from board');
    if (res.error) throw new Error(String(res.error));
    return res as unknown as SuggestionCreateResult;
  }

  /** Vote on an existing suggestion. Requires remote board. */
  async vote(suggestionId: string, value: 1 | -1, reason?: string): Promise<SuggestionVoteResult> {
    if (!this.isRemote) throw new Error('vote() requires a remote board (boardUrl + boardApiKey)');
    const teamId = encodeURIComponent(this.name);
    const res = await this.boardFetch(
      `/api/holomesh/team/${teamId}/suggestions/${encodeURIComponent(suggestionId)}`,
      'PATCH',
      { action: 'vote', value, reason }
    );
    if (!res) throw new Error('Failed to vote — no response from board');
    if (res.error) throw new Error(String(res.error));
    return res as unknown as SuggestionVoteResult;
  }

  /** List suggestions, optionally filtered by status. Requires remote board. */
  async suggestions(status?: SuggestionStatus): Promise<SuggestionListResult> {
    if (!this.isRemote) throw new Error('suggestions() requires a remote board (boardUrl + boardApiKey)');
    const teamId = encodeURIComponent(this.name);
    const query = status ? `?status=${encodeURIComponent(status)}` : '';
    const res = await this.boardFetch(`/api/holomesh/team/${teamId}/suggestions${query}`, 'GET');
    if (!res) throw new Error('Failed to list suggestions — no response from board');
    if (res.error) throw new Error(String(res.error));
    return res as unknown as SuggestionListResult;
  }

  // ── Mode ──

  /** Switch the team's operating mode. Requires remote board. */
  async setMode(mode: TeamMode): Promise<SetModeResult> {
    if (!this.isRemote) throw new Error('setMode() requires a remote board (boardUrl + boardApiKey)');
    const teamId = encodeURIComponent(this.name);
    const res = await this.boardFetch(`/api/holomesh/team/${teamId}/mode`, 'POST', { mode });
    if (!res) throw new Error('Failed to set mode — no response from board');
    if (res.error) throw new Error(String(res.error));
    return res as unknown as SetModeResult;
  }

  // ── Derive ──

  /** Derive tasks from a source document (audit, roadmap, etc.). Requires remote board. */
  async derive(source: string, content: string): Promise<DeriveResult> {
    if (!this.isRemote) throw new Error('derive() requires a remote board (boardUrl + boardApiKey)');
    const teamId = encodeURIComponent(this.name);
    const res = await this.boardFetch(`/api/holomesh/team/${teamId}/board/derive`, 'POST', { source, content });
    if (!res) throw new Error('Failed to derive tasks — no response from board');
    if (res.error) throw new Error(String(res.error));
    return res as unknown as DeriveResult;
  }

  // ── Presence ──

  /** Get presence/slot info for the team. Requires remote board. */
  async presence(): Promise<PresenceResult> {
    if (!this.isRemote) throw new Error('presence() requires a remote board (boardUrl + boardApiKey)');
    const teamId = encodeURIComponent(this.name);
    const res = await this.boardFetch(`/api/holomesh/team/${teamId}/slots`, 'GET');
    if (!res) throw new Error('Failed to get presence — no response from board');
    if (res.error) throw new Error(String(res.error));
    return res as unknown as PresenceResult;
  }

  /** Send a heartbeat to the team's presence system. Requires remote board. */
  async heartbeat(ideType?: string): Promise<HeartbeatResult> {
    if (!this.isRemote) throw new Error('heartbeat() requires a remote board (boardUrl + boardApiKey)');
    const teamId = encodeURIComponent(this.name);
    const res = await this.boardFetch(`/api/holomesh/team/${teamId}/presence`, 'POST', {
      ide_type: ideType ?? 'unknown',
      status: 'active',
    });
    if (!res) throw new Error('Failed to send heartbeat — no response from board');
    if (res.error) throw new Error(String(res.error));
    return res as unknown as HeartbeatResult;
  }

  // ── Scout ──

  /** On-demand scout: parse TODO/FIXME content into tasks. */
  async scoutFromTodos(grepOutput: string): Promise<TaskDef[]> {
    if (this.isRemote) {
      const res = await this.boardFetch(`/api/holomesh/team/${encodeURIComponent(this.name)}/board/scout`, 'POST', { todo_content: grepOutput });
      if (res && res.error) throw new Error(String(res.error));
      return (res?.tasks || res?.added || []) as TaskDef[];
    }

    const tasks: Array<Omit<TaskDef, 'id' | 'status' | 'createdAt'>> = [];

    for (const line of grepOutput.split('\n')) {
      const match = line.trim().match(/^(.+?):(\d+):\s*(?:\/\/\s*)?(TODO|FIXME|HACK|XXX)\s*:?\s*(.+)$/i);
      if (!match) continue;

      const [, file, lineNo, kind, detail] = match;
      const upper = `${kind} ${detail}`.toUpperCase();
      const priority = /SECURITY|VULN|AUTH|CRITICAL/.test(upper) ? 1
        : /FIXME|BUG|BROKEN|ERROR/.test(upper) ? 2
        : /TODO|HACK|REFACTOR/.test(upper) ? 3 : 4;

      tasks.push({
        title: `${kind.toUpperCase()}: ${detail.trim().slice(0, 180)}`,
        description: `${file}:${lineNo}`,
        priority,
        role: 'coder',
        source: 'scout:todo-scan',
      });
    }

    return await this.addTasks(tasks);
  }

  // ── Task Decomposition (FW-0.2) ──

  /**
   * Decompose a complex task into parallel micro-phases and distribute
   * the sub-phases as individual board tasks. Each sub-phase becomes a
   * separate task that agents can claim independently.
   *
   * Returns the decomposition result including the wave-based execution plan.
   * If no decomposer is available (no LLM configured), falls back to adding
   * the task as-is.
   */
  async decomposeAndDistribute(task: TaskDef): Promise<DecompositionResult | null> {
    if (!this.decomposer) return null;

    const taskDesc: TaskDescription = {
      id: task.id,
      title: task.title,
      description: task.description,
      requiredCapabilities: task.role ? [task.role] : ['coding'],
    };

    const result = await this.decomposer.decompose(taskDesc);

    if (!result.wasDecomposed) return result;

    // Convert micro-phases into board tasks, preserving wave ordering via priority
    const subTasks: Array<Omit<TaskDef, 'id' | 'status' | 'createdAt'>> = [];
    for (let waveIdx = 0; waveIdx < result.plan.waves.length; waveIdx++) {
      for (const phase of result.plan.waves[waveIdx]) {
        subTasks.push({
          title: `[${task.id}/${phase.id}] ${phase.description}`,
          description: `Sub-phase of "${task.title}" (wave ${waveIdx + 1}/${result.plan.waves.length}). Dependencies: ${phase.dependencies.join(', ') || 'none'}`,
          priority: Math.max(1, task.priority - 1 + waveIdx), // Earlier waves get higher priority
          role: (phase.requiredCapabilities[0] as TaskDef['role']) ?? task.role,
          source: `decomposer:${task.id}`,
        });
      }
    }

    // Remove the original complex task and add sub-tasks
    this.board = this.board.filter(t => t.id !== task.id);
    await this.addTasks(subTasks);

    return result;
  }

  /** Get the decomposer instance for direct use (e.g., manual decomposition). */
  getDecomposer(): SmartMicroPhaseDecomposer | null {
    return this.decomposer;
  }

  // ── Remote Proxy ──

  async listBoard(): Promise<Record<string, unknown>> {
    if (!this.isRemote) throw new Error('listBoard() requires a remote board');
    const res = await this.boardFetch(`/api/holomesh/team/${encodeURIComponent(this.name)}/board`, 'GET');
    if (!res) throw new Error('Failed to list board');
    return res as Record<string, unknown>;
  }

  async claimTask(taskId: string): Promise<Record<string, unknown>> {
    if (!this.isRemote) throw new Error('claimTask() requires a remote board');
    const res = await this.boardFetch(`/api/holomesh/team/${encodeURIComponent(this.name)}/board/${encodeURIComponent(taskId)}`, 'PATCH', { action: 'claim' });
    if (!res) throw new Error('Failed to claim task');
    return res as Record<string, unknown>;
  }

  async completeTask(taskId: string, commit?: string, summary?: string): Promise<Record<string, unknown>> {
    if (!this.isRemote) throw new Error('completeTask() requires a remote board');
    const body: Record<string, unknown> = { action: 'done' };
    if (commit) body.commit = commit;
    if (summary) body.summary = summary;
    const res = await this.boardFetch(`/api/holomesh/team/${encodeURIComponent(this.name)}/board/${encodeURIComponent(taskId)}`, 'PATCH', body);
    if (!res) throw new Error('Failed to complete task');
    return res as Record<string, unknown>;
  }

  async assignSlots(roles: string[]): Promise<Record<string, unknown>> {
    if (!this.isRemote) throw new Error('assignSlots() requires a remote board');
    const res = await this.boardFetch(`/api/holomesh/team/${encodeURIComponent(this.name)}/roles`, 'PATCH', { roles });
    if (!res) throw new Error('Failed to assign slots');
    return res as Record<string, unknown>;
  }

  // ── Internal ──

  /** Convert a synthesized Goal into a TaskDef and add it to the board. */
  private goalToTask(goal: Goal, agentRole: string): TaskDef {
    const task: TaskDef = {
      id: `task_synth_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      title: goal.description,
      description: `Autonomously synthesized goal [${goal.category}] — priority ${goal.priority}`,
      priority: goal.priority === 'high' ? 2 : goal.priority === 'medium' ? 4 : 6,
      role: (agentRole === 'architect' || agentRole === 'researcher') ? 'researcher' as const : 'coder' as const,
      source: `synthesizer:${goal.source}`,
      status: 'open',
      createdAt: goal.generatedAt,
    };
    this.board.push(task);
    return task;
  }

  private findClaimableTask(agent: AgentConfig, alreadyClaimed: Set<string>): TaskDef | undefined {
    return this.openTasks.find(task => {
      if (alreadyClaimed.has(task.id)) return false;
      if (task.priority > agent.claimFilter.maxPriority) return false;
      if (task.role) return agent.claimFilter.roles.includes(task.role);
      return true;
    });
  }

  private async executeTask(
    runtime: AgentRuntime,
    task: TaskDef
  ): Promise<{ summary: string; insights: KnowledgeInsight[] }> {
    const relevantKnowledge = this.knowledge.search(task.title, 3);
    const knowledgeContext = relevantKnowledge.length > 0
      ? relevantKnowledge.map(k => `[${k.type}] ${k.content}`).join('\n')
      : '';

    // Run the full 7-phase protocol cycle
    const result = await runProtocolCycle(runtime.config, task, knowledgeContext);
    return { summary: result.summary, insights: result.insights };
  }


  private async getAgentVote<T>(runtime: AgentRuntime, key: string, value: T): Promise<boolean> {
    const messages: LLMMessage[] = [
      {
        role: 'system',
        content: `You are ${runtime.name}, a ${runtime.role}. Vote YES or NO on team proposals.`,
      },
      {
        role: 'user',
        content: `Proposal "${key}": ${JSON.stringify(value)}\n\nRespond with only YES or NO.`,
      },
    ];

    const response = await callLLM(runtime.config.model, messages, { maxTokens: 10 });
    return response.content.trim().toUpperCase().startsWith('YES');
  }
}
