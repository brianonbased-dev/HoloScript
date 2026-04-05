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
  Suggestion,
  SuggestionVoteEntry,
  SuggestionCreateResult,
  SuggestionVoteResult,
  SuggestionListResult,
  SuggestionStatus,
  TeamMode,
  SetModeResult,
  DeriveResult,
  PresenceResult,
  HeartbeatResult,
  AgentPresence,
  AgentPresenceStatus,
  PresenceConfig,
  SlotRole,
} from './types';
import { KnowledgeStore } from './knowledge/knowledge-store';
import { DoneLogAuditor } from './board/audit';
import type { FullAuditResult } from './board/audit';
import type { DoneLogEntry } from './board/board-types';
import { callLLM } from './llm/llm-adapter';
import type { LLMMessage } from './llm/llm-adapter';
import { runProtocolCycle } from './protocol-agent';
import { GoalSynthesizer } from './protocol/goal-synthesizer';
import type { GoalContext, SynthesizedGoal } from './protocol/goal-synthesizer';
import type { Goal } from './protocol/implementations';
import { SmartMicroPhaseDecomposer, createLLMAdapter } from './protocol/micro-phase-decomposer';
import type { DecompositionResult, TaskDescription } from './protocol/micro-phase-decomposer';
import { parseDeriveContent, ROOM_PRESETS } from './board';
import { MeshDiscovery, SignalService, GossipProtocol } from './mesh';
import type { PeerMetadata, GossipPacket } from './mesh';

// ── Mode Claim Filters (FW-0.3) ──
// Each mode defines which SlotRoles can actively claim tasks.
// Agents whose claimFilter.roles don't overlap with the active set are deprioritized.

const MODE_CLAIM_ROLES: Record<TeamMode, SlotRole[]> = {
  audit: ['researcher', 'reviewer', 'tester'],
  build: ['coder', 'tester'],
  research: ['researcher'],
  review: ['reviewer', 'researcher'],
};

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

/** Default presence timeouts (FW-0.3). */
const DEFAULT_IDLE_TIMEOUT_MS = 60_000;   // 60 seconds
const DEFAULT_OFFLINE_TIMEOUT_MS = 300_000; // 5 minutes

/** Internal record for tracking an agent's presence state. */
interface PresenceRecord {
  firstSeen: number;
  lastSeen: number;
  currentTask?: string;
}

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
  private localSuggestions: Suggestion[] = [];
  private currentMode: TeamMode = 'build';
  private modeObjective: string = ROOM_PRESETS['build'].objective;
  private modeRules: string[] = ROOM_PRESETS['build'].rules;
  private goalSynthesizer: GoalSynthesizer;
  private decomposer: SmartMicroPhaseDecomposer | null = null;

  // ── Local presence tracking (FW-0.3) ──
  private presenceRecords: Map<string, PresenceRecord> = new Map();
  private idleTimeoutMs: number;
  private offlineTimeoutMs: number;

  // ── Mesh integration (FW-0.4) ──
  readonly mesh: MeshDiscovery;
  readonly signals: SignalService;
  readonly gossip: GossipProtocol;

  constructor(config: TeamConfig) {
    this.config = config;
    this.name = config.name;
    this.agentConfigs = config.agents;
    this.consensusMode = config.consensus ?? 'simple_majority';
    this.idleTimeoutMs = config.presence?.idleTimeoutMs ?? DEFAULT_IDLE_TIMEOUT_MS;
    this.offlineTimeoutMs = config.presence?.offlineTimeoutMs ?? DEFAULT_OFFLINE_TIMEOUT_MS;

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

    // Mesh integration (FW-0.4) — peer discovery, signaling, gossip
    this.mesh = new MeshDiscovery(config.name);
    this.signals = new SignalService(config.name);
    this.gossip = new GossipProtocol();

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
      let task = this.findClaimableTask(runtime, claimed);
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

      // Auto-heartbeat: record agent as alive with current task (FW-0.3)
      this.localHeartbeat(runtime.name, task.title);

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
      let task = this.findClaimableTask(runtime, claimed, openTasks);
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

      // Auto-heartbeat: record agent as alive with current task (FW-0.3)
      this.localHeartbeat(runtime.name, task.title);

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

  // ── Audit (FW-0.3) ──

  /**
   * Audit the done log: check for missing fields, duplicates, non-monotonic
   * timestamps, and return aggregate statistics.
   *
   * Works in both local and remote modes. In local mode, the internal doneLog
   * is converted to DoneLogEntry format. In remote mode, fetches the board
   * and extracts the done log from the response.
   */
  async audit(): Promise<FullAuditResult> {
    let entries: DoneLogEntry[];

    if (this.isRemote) {
      const boardData = await this.listBoard();
      const board = boardData.board as Record<string, unknown> | undefined;
      const rawDone = (board?.done_log ?? board?.doneLog ?? []) as Array<Record<string, unknown>>;
      entries = rawDone.map((d) => ({
        taskId: String(d.taskId ?? d.task_id ?? ''),
        title: String(d.title ?? ''),
        completedBy: String(d.completedBy ?? d.completed_by ?? ''),
        commitHash: d.commitHash as string | undefined ?? d.commit_hash as string | undefined,
        timestamp: String(d.timestamp ?? d.completedAt ?? ''),
        summary: String(d.summary ?? ''),
      }));
    } else {
      entries = this.doneLog.map((d) => ({
        taskId: d.taskId,
        title: d.title,
        completedBy: d.completedBy,
        timestamp: d.timestamp,
        summary: '',
      }));
    }

    const auditor = new DoneLogAuditor(entries);
    return auditor.fullAudit();
  }

  // ── Suggestions (FW-0.3 — local-first with optional remote) ──

  /**
   * Create a suggestion for the team.
   * Works locally (in-memory) and remotely (delegates to HoloMesh API).
   */
  async suggest(
    title: string,
    opts?: {
      description?: string;
      category?: string;
      evidence?: string;
      proposedBy?: string;
      autoPromoteThreshold?: number;
      autoDismissThreshold?: number;
    }
  ): Promise<SuggestionCreateResult> {
    if (this.isRemote) {
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

    const trimmedTitle = title.trim().slice(0, 200);
    if (!trimmedTitle) throw new Error('title is required');

    const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    const existingNorm = new Set(
      this.localSuggestions.filter(s => s.status === 'open').map(s => normalize(s.title))
    );
    if (existingNorm.has(normalize(trimmedTitle))) {
      throw new Error('A similar open suggestion already exists');
    }

    const suggestion: Suggestion = {
      id: `sug_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      title: trimmedTitle,
      description: opts?.description?.slice(0, 2000),
      category: opts?.category,
      evidence: opts?.evidence?.slice(0, 1000),
      proposedBy: opts?.proposedBy ?? 'anonymous',
      status: 'open',
      votes: [],
      score: 0,
      createdAt: new Date().toISOString(),
      autoPromoteThreshold: opts?.autoPromoteThreshold,
      autoDismissThreshold: opts?.autoDismissThreshold,
    };
    this.localSuggestions.push(suggestion);
    return { suggestion };
  }

  /**
   * Vote on an existing suggestion.
   * Local mode: vote(id, agentName, 'up'|'down', reason?).
   * Remote mode: vote(id, 1|-1, reason?) for backward compatibility.
   */
  async vote(suggestionId: string, agentNameOrValue: string | 1 | -1, voteOrReason?: 'up' | 'down' | string, reason?: string): Promise<SuggestionVoteResult> {
    if (this.isRemote) {
      const value = typeof agentNameOrValue === 'number' ? agentNameOrValue : (voteOrReason === 'down' ? -1 : 1);
      const remoteReason = typeof agentNameOrValue === 'number' ? (voteOrReason as string | undefined) : reason;
      const teamId = encodeURIComponent(this.name);
      const res = await this.boardFetch(
        `/api/holomesh/team/${teamId}/suggestions/${encodeURIComponent(suggestionId)}`,
        'PATCH',
        { action: 'vote', value, reason: remoteReason }
      );
      if (!res) throw new Error('Failed to vote — no response from board');
      if (res.error) throw new Error(String(res.error));
      return res as unknown as SuggestionVoteResult;
    }

    const agentName = String(agentNameOrValue);
    const voteDir: 'up' | 'down' = (voteOrReason === 'up' || voteOrReason === 'down') ? voteOrReason : 'up';

    const suggestion = this.localSuggestions.find(s => s.id === suggestionId);
    if (!suggestion) throw new Error('Suggestion not found');
    if (suggestion.status !== 'open') throw new Error(`Suggestion is ${suggestion.status}, voting closed`);

    suggestion.votes = suggestion.votes.filter(v => v.agent !== agentName);
    suggestion.votes.push({ agent: agentName, vote: voteDir, reason, votedAt: new Date().toISOString() });

    const upvotes = suggestion.votes.filter(v => v.vote === 'up').length;
    const downvotes = suggestion.votes.filter(v => v.vote === 'down').length;
    suggestion.score = upvotes - downvotes;

    let promotedTaskId: string | undefined;

    const promoteThreshold = suggestion.autoPromoteThreshold ?? Math.ceil(this.agentConfigs.length / 2);
    if (upvotes >= promoteThreshold && suggestion.status === 'open') {
      suggestion.status = 'promoted';
      suggestion.resolvedAt = new Date().toISOString();
      const promoted = await this.addTasks([{
        title: suggestion.title,
        description: `${suggestion.description ?? ''}\n\n[Auto-promoted from suggestion by ${suggestion.proposedBy} with ${suggestion.score} net votes]`.trim(),
        priority: suggestion.category === 'architecture' ? 2 : suggestion.category === 'testing' ? 3 : 4,
        source: `suggestion:${suggestion.id}`,
      }]);
      if (promoted.length > 0) {
        promotedTaskId = promoted[0].id;
        suggestion.promotedTaskId = promotedTaskId;
      }
    }

    const dismissThreshold = suggestion.autoDismissThreshold ?? Math.ceil(this.agentConfigs.length / 2);
    if (downvotes >= dismissThreshold && suggestion.status === 'open') {
      suggestion.status = 'dismissed';
      suggestion.resolvedAt = new Date().toISOString();
    }

    return { suggestion, promotedTaskId };
  }

  /**
   * List suggestions, optionally filtered by status.
   * Works locally (in-memory) and remotely (delegates to HoloMesh API).
   */
  async suggestions(status?: SuggestionStatus): Promise<SuggestionListResult> {
    if (this.isRemote) {
      const teamId = encodeURIComponent(this.name);
      const query = status ? `?status=${encodeURIComponent(status)}` : '';
      const res = await this.boardFetch(`/api/holomesh/team/${teamId}/suggestions${query}`, 'GET');
      if (!res) throw new Error('Failed to list suggestions — no response from board');
      if (res.error) throw new Error(String(res.error));
      return res as unknown as SuggestionListResult;
    }

    const filtered = status
      ? this.localSuggestions.filter(s => s.status === status)
      : [...this.localSuggestions];
    return { suggestions: filtered };
  }

  /** Promote a suggestion to a board task manually. Local-only. */
  async promoteSuggestion(suggestionId: string, promoterName?: string): Promise<SuggestionVoteResult> {
    if (this.isRemote) throw new Error('promoteSuggestion() is not supported in remote mode — use the board API');

    const suggestion = this.localSuggestions.find(s => s.id === suggestionId);
    if (!suggestion) throw new Error('Suggestion not found');
    if (suggestion.status !== 'open') throw new Error(`Suggestion is already ${suggestion.status}`);

    suggestion.status = 'promoted';
    suggestion.resolvedAt = new Date().toISOString();

    const promoted = await this.addTasks([{
      title: suggestion.title,
      description: `${suggestion.description ?? ''}\n\n[Promoted by ${promoterName ?? 'team'} from suggestion by ${suggestion.proposedBy}]`.trim(),
      priority: suggestion.category === 'architecture' ? 2 : suggestion.category === 'testing' ? 3 : 4,
      source: `suggestion:${suggestion.id}`,
    }]);

    const promotedTaskId = promoted.length > 0 ? promoted[0].id : undefined;
    suggestion.promotedTaskId = promotedTaskId;
    return { suggestion, promotedTaskId };
  }

  /** Dismiss a suggestion. Local-only. */
  dismissSuggestion(suggestionId: string): SuggestionVoteResult {
    if (this.isRemote) throw new Error('dismissSuggestion() is not supported in remote mode — use the board API');

    const suggestion = this.localSuggestions.find(s => s.id === suggestionId);
    if (!suggestion) throw new Error('Suggestion not found');
    if (suggestion.status !== 'open') throw new Error(`Suggestion is already ${suggestion.status}`);

    suggestion.status = 'dismissed';
    suggestion.resolvedAt = new Date().toISOString();
    return { suggestion };
  }

  // ── Mode ──

  /** Get the current operating mode. */
  get mode(): TeamMode {
    return this.currentMode;
  }

  /** Get the current mode's objective string. */
  get objective(): string {
    return this.modeObjective;
  }

  /** Get the current mode's rules. */
  get rules(): string[] {
    return [...this.modeRules];
  }

  /** Switch the team's operating mode. Local-first with optional remote sync. */
  async setMode(mode: TeamMode): Promise<SetModeResult> {
    const preset = ROOM_PRESETS[mode];
    if (!preset) throw new Error(`Unknown mode: ${mode}. Valid: ${Object.keys(ROOM_PRESETS).join(', ')}`);

    const previousMode = this.currentMode;
    this.currentMode = mode;
    this.modeObjective = preset.objective;
    this.modeRules = preset.rules;

    // Sync to remote if connected
    if (this.isRemote) {
      const teamId = encodeURIComponent(this.name);
      const res = await this.boardFetch(`/api/holomesh/team/${teamId}/mode`, 'POST', { mode });
      if (res?.error) throw new Error(String(res.error));
    }

    return { mode, previousMode };
  }

  // ── Derive (local-first with optional remote sync) ──

  /**
   * Derive tasks from a source document (audit, roadmap, grep output, etc.).
   * Parses markdown checkboxes, section headers, and TODO/FIXME patterns.
   * Deduplicates against existing board and done log.
   * Works locally and remotely.
   */
  async derive(source: string, content: string): Promise<DeriveResult> {
    if (this.isRemote) {
      const teamId = encodeURIComponent(this.name);
      const res = await this.boardFetch(`/api/holomesh/team/${teamId}/board/derive`, 'POST', { source, content });
      if (!res) throw new Error('Failed to derive tasks — no response from board');
      if (res.error) throw new Error(String(res.error));
      return res as unknown as DeriveResult;
    }

    // Parse content into task candidates using the framework's derive parser
    const candidates = parseDeriveContent(content, source);
    if (candidates.length === 0) return { tasks: [] };

    // Add to board with dedup
    const added = await this.addTasks(candidates);
    return { tasks: added };
  }

  // ── Presence (FW-0.3 — local-first with optional remote) ──

  /**
   * Record that an agent is alive. Updates lastSeen timestamp.
   * Works locally on all teams. Optionally pass the task the agent is working on.
   */
  localHeartbeat(agentName: string, currentTask?: string): void {
    const now = Date.now();
    const existing = this.presenceRecords.get(agentName);
    if (existing) {
      existing.lastSeen = now;
      existing.currentTask = currentTask;
    } else {
      this.presenceRecords.set(agentName, {
        firstSeen: now,
        lastSeen: now,
        currentTask,
      });
    }
  }

  /**
   * Return the presence status of all known agents.
   * Agents not heartbeating within idleTimeoutMs → 'idle'.
   * Agents not heartbeating within offlineTimeoutMs → 'offline'.
   */
  localPresence(): AgentPresence[] {
    const now = Date.now();
    const result: AgentPresence[] = [];

    for (const [name, record] of this.presenceRecords) {
      const elapsed = now - record.lastSeen;
      let status: AgentPresenceStatus;
      if (elapsed >= this.offlineTimeoutMs) {
        status = 'offline';
      } else if (elapsed >= this.idleTimeoutMs) {
        status = 'idle';
      } else {
        status = 'online';
      }

      result.push({
        name,
        status,
        lastSeen: record.lastSeen,
        currentTask: record.currentTask,
        uptime: now - record.firstSeen,
      });
    }

    return result;
  }

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

  // ── Mesh Integration (FW-0.4) ──

  /**
   * Get discovered peers with their metadata.
   * Prunes stale peers (>15s since last seen) before returning.
   */
  peers(): PeerMetadata[] {
    this.mesh.pruneStalePeers();
    return this.mesh.getPeers();
  }

  /**
   * Register a peer node for multi-team coordination.
   */
  registerPeer(peer: PeerMetadata): void {
    this.mesh.registerPeer(peer);
  }

  /**
   * Broadcast this team's capabilities as a mesh signal.
   * Other teams can discover this signal via `signals.discoverSignals('agent-host')`.
   */
  broadcastCapabilities(url?: string): void {
    const capabilities = new Set<string>();
    for (const agent of this.agentConfigs) {
      for (const cap of agent.capabilities) capabilities.add(cap);
    }
    this.signals.broadcastSignal({
      type: 'agent-host',
      url: url ?? `local://${this.name}`,
      capabilities: [...capabilities],
    });
  }

  /**
   * Share a knowledge insight via gossip protocol.
   * Returns the gossip packet for cross-team anti-entropy sync.
   */
  shareKnowledge(payload: unknown): GossipPacket {
    return this.gossip.shareWisdom(this.name, payload);
  }

  /**
   * Sync knowledge from a peer's gossip pool.
   * Returns the number of new entries absorbed.
   */
  syncFromPeer(peerPool: Map<string, GossipPacket>): number {
    return this.gossip.antiEntropySync(peerPool);
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

  private findClaimableTask(runtime: AgentRuntime, alreadyClaimed: Set<string>, pool?: TaskDef[]): TaskDef | undefined {
    const tasks = pool ?? this.openTasks;
    const agent = runtime.config;

    const validTasks = tasks.filter(task => {
      if (alreadyClaimed.has(task.id)) return false;
      if (task.priority > agent.claimFilter.maxPriority) return false;
      if (task.role) return agent.claimFilter.roles.includes(task.role);
      return true;
    });

    if (validTasks.length === 0) return undefined;

    // Score and pick highest
    return validTasks.map(task => {
      let score = (10 - task.priority) * 10; // Prioritize higher priority
      score += runtime.reputationScore;

      const fullText = `${task.title} ${task.description}`.toLowerCase();
      for (const cap of agent.capabilities || []) {
        if (fullText.includes(cap.toLowerCase())) {
          score += 15; // Capability match bonus
        }
      }

      if (task.role && agent.role === task.role) {
        score += 20; // Exact role match bonus
      }

      return { task, score };
    }).sort((a, b) => b.score - a.score)[0]?.task;
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
