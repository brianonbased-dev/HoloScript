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
} from './types';
import { KnowledgeStore } from './knowledge/knowledge-store';
import { callLLM } from './llm/llm-adapter';
import type { LLMMessage } from './llm/llm-adapter';

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

  constructor(config: TeamConfig) {
    this.config = config;
    this.name = config.name;
    this.agentConfigs = config.agents;
    this.consensusMode = config.consensus ?? 'simple_majority';

    this.knowledge = new KnowledgeStore(
      config.knowledge ?? { persist: false }
    );

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
      const task = this.findClaimableTask(agent, claimed);
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
          action: 'completed',
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
      const task = openTasks.find(t => {
        if (claimed.has(t.id)) return false;
        if (t.priority > agent.claimFilter.maxPriority) return false;
        if (t.role) return agent.claimFilter.roles.includes(t.role);
        return true;
      });

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
        results.push({ agentName: runtime.name, taskId: task.id, taskTitle: task.title, action: 'completed', summary, knowledge: insights });
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

  // ── Internal ──

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
    const agent = runtime.config;
    const relevantKnowledge = this.knowledge.search(task.title, 3);
    const knowledgeContext = relevantKnowledge.length > 0
      ? `\n\nRelevant team knowledge:\n${relevantKnowledge.map(k => `[${k.type}] ${k.content}`).join('\n')}`
      : '';

    const messages: LLMMessage[] = [
      {
        role: 'system',
        content: agent.systemPrompt || `You are ${agent.name}, a ${agent.role} agent. Your capabilities: ${agent.capabilities.join(', ')}.`,
      },
      {
        role: 'user',
        content: `Task: ${task.title}\n${task.description}${knowledgeContext}\n\nComplete this task. Then output any Wisdom, Patterns, or Gotchas you discovered.\n\nFormat your response as:\nSUMMARY: <what you did>\nKNOWLEDGE:\n- [type] content (where type is wisdom, pattern, or gotcha)`,
      },
    ];

    const response = await callLLM(agent.model, messages);
    const { summary, insights } = this.parseResponse(response.content, agent.knowledgeDomains?.[0] ?? 'general', runtime.name);

    return { summary, insights };
  }

  private parseResponse(
    content: string,
    domain: string,
    agentName: string
  ): { summary: string; insights: KnowledgeInsight[] } {
    const lines = content.split('\n');
    let summary = '';
    const insights: KnowledgeInsight[] = [];
    let inKnowledge = false;

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('SUMMARY:')) {
        summary = trimmed.replace('SUMMARY:', '').trim();
        inKnowledge = false;
        continue;
      }
      if (trimmed === 'KNOWLEDGE:') {
        inKnowledge = true;
        continue;
      }
      if (inKnowledge && trimmed.startsWith('- [')) {
        const match = trimmed.match(/^-\s*\[(wisdom|pattern|gotcha)\]\s*(.+)$/i);
        if (match) {
          insights.push({
            type: match[1].toLowerCase() as 'wisdom' | 'pattern' | 'gotcha',
            content: match[2].trim(),
            domain,
            confidence: 0.7,
            source: agentName,
          });
        }
      }
    }

    if (!summary) summary = content.slice(0, 200);
    return { summary, insights };
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
