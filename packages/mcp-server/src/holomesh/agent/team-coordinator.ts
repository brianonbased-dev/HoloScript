/**
 * HoloMesh Team Coordinator
 *
 * Manages agent lifecycle within team rooms:
 * - Load agent profiles into rooms (register in slots)
 * - Execute work cycles (check board -> claim -> execute -> done -> publish)
 * - Compound knowledge across agents after a cycle
 *
 * Uses the board HTTP API (same as board-tools.ts) to interact with team boards.
 * Agents are stateless profiles — the coordinator drives their behavior.
 */

import type { TeamAgentProfile, SlotRole } from './team-agents';
import { TEAM_AGENT_PROFILES, getAllProfiles } from './team-agents';

// ── Types ──

export interface RoomAgentSlot {
  agentId: string;
  agentName: string;
  role: SlotRole;
  joinedAt: string;
  lastActiveAt: string;
  tasksCompleted: number;
  knowledgePublished: number;
}

export interface BoardTask {
  id: string;
  title: string;
  description: string;
  status: 'open' | 'claimed' | 'done' | 'blocked';
  claimedBy?: string;
  claimedByName?: string;
  priority: number;
  role?: SlotRole;
  source?: string;
}

export interface CycleResult {
  roomId: string;
  agentId: string;
  agentName: string;
  taskId: string | null;
  taskTitle: string | null;
  action: 'claimed' | 'completed' | 'skipped' | 'error';
  summary: string;
  knowledgeEntries: KnowledgeInsight[];
}

export interface KnowledgeInsight {
  type: 'wisdom' | 'pattern' | 'gotcha';
  content: string;
  domain: string;
  confidence: number;
}

export interface CompoundResult {
  roomId: string;
  agentsInvolved: string[];
  insightsShared: number;
  crossReferences: number;
  timestamp: string;
}

export interface LoadAgentsResult {
  roomId: string;
  loaded: RoomAgentSlot[];
  skipped: string[];
}

// ── In-Memory Room Agent Store ──

const roomAgents: Map<string, Map<string, RoomAgentSlot>> = new Map();
const roomCycleHistory: Map<string, CycleResult[]> = new Map();

// ── Server URL / Auth (mirrors board-tools.ts) ──

function getServerUrl(): string {
  return (
    process.env.HOLOSCRIPT_SERVER_URL ||
    process.env.MCP_LOCAL_URL ||
    'https://mcp.holoscript.net'
  );
}

function getApiKey(): string {
  return process.env.HOLOMESH_API_KEY || process.env.MCP_API_KEY || '';
}

async function teamFetch(
  path: string,
  method: 'GET' | 'POST' | 'PATCH',
  body?: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const apiKey = getApiKey();
  if (!apiKey) {
    return { error: 'No API key configured. Set HOLOMESH_API_KEY or MCP_API_KEY.' };
  }

  const url = `${getServerUrl()}${path}`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  };

  try {
    const res = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    return (await res.json()) as Record<string, unknown>;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { error: `HTTP request failed: ${message}` };
  }
}

// ── Core Functions ──

/**
 * Load agent profiles into a team room.
 * Each profile is mapped to a slot role based on its primary role.
 * Skips agents whose role slot is already occupied.
 */
export function assignAgentsToRoom(
  roomId: string,
  agentProfileIds: string[]
): LoadAgentsResult {
  if (!roomAgents.has(roomId)) {
    roomAgents.set(roomId, new Map());
  }
  const slots = roomAgents.get(roomId)!;

  const loaded: RoomAgentSlot[] = [];
  const skipped: string[] = [];

  for (const profileId of agentProfileIds) {
    const profile = TEAM_AGENT_PROFILES.get(profileId);
    if (!profile) {
      skipped.push(profileId);
      continue;
    }

    if (slots.has(profile.id)) {
      skipped.push(profile.id);
      continue;
    }

    const roleAsSlot = mapAgentRoleToSlot(profile.role);
    const now = new Date().toISOString();
    const slot: RoomAgentSlot = {
      agentId: profile.id,
      agentName: profile.name,
      role: roleAsSlot,
      joinedAt: now,
      lastActiveAt: now,
      tasksCompleted: 0,
      knowledgePublished: 0,
    };

    slots.set(profile.id, slot);
    loaded.push(slot);
  }

  return { roomId, loaded, skipped };
}

/**
 * Map agent role to the closest slot role.
 * architect -> reviewer (architects review and guide)
 * coder -> coder
 * researcher -> researcher
 * reviewer -> reviewer
 */
function mapAgentRoleToSlot(role: string): SlotRole {
  switch (role) {
    case 'architect':
      return 'reviewer';
    case 'coder':
      return 'coder';
    case 'researcher':
      return 'researcher';
    case 'reviewer':
      return 'reviewer';
    default:
      return 'flex';
  }
}

/**
 * Execute one work cycle for all agents in a room.
 * Each agent: check board -> find claimable task -> claim -> simulate execution -> mark done.
 */
export async function runAgentCycle(roomId: string): Promise<CycleResult[]> {
  const slots = roomAgents.get(roomId);
  if (!slots || slots.size === 0) {
    return [];
  }

  // Fetch the board once for the room
  const boardData = await teamFetch(
    `/api/holomesh/team/${encodeURIComponent(roomId)}/board`,
    'GET'
  );

  if (boardData.error) {
    return Array.from(slots.values()).map((slot) => ({
      roomId,
      agentId: slot.agentId,
      agentName: slot.agentName,
      taskId: null,
      taskTitle: null,
      action: 'error' as const,
      summary: `Board fetch failed: ${String(boardData.error)}`,
      knowledgeEntries: [],
    }));
  }

  const board = boardData.board as Record<string, unknown> | undefined;
  const openTasks = ((board?.open as BoardTask[]) || []).sort(
    (a, b) => a.priority - b.priority
  );

  const results: CycleResult[] = [];
  const claimedInCycle = new Set<string>();

  for (const [agentId, slot] of slots) {
    const profile = TEAM_AGENT_PROFILES.get(agentId);
    if (!profile) {
      results.push({
        roomId,
        agentId,
        agentName: slot.agentName,
        taskId: null,
        taskTitle: null,
        action: 'skipped',
        summary: 'No profile found for agent',
        knowledgeEntries: [],
      });
      continue;
    }

    // Find a matching task for this agent
    const matchingTask = findClaimableTask(openTasks, profile, claimedInCycle);

    if (!matchingTask) {
      results.push({
        roomId,
        agentId,
        agentName: slot.agentName,
        taskId: null,
        taskTitle: null,
        action: 'skipped',
        summary: 'No matching open tasks for this agent',
        knowledgeEntries: [],
      });
      continue;
    }

    claimedInCycle.add(matchingTask.id);

    // Claim the task
    const claimResult = await teamFetch(
      `/api/holomesh/team/${encodeURIComponent(roomId)}/board/${encodeURIComponent(matchingTask.id)}`,
      'PATCH',
      { action: 'claim' }
    );

    if (claimResult.error) {
      results.push({
        roomId,
        agentId,
        agentName: slot.agentName,
        taskId: matchingTask.id,
        taskTitle: matchingTask.title,
        action: 'error',
        summary: `Claim failed: ${String(claimResult.error)}`,
        knowledgeEntries: [],
      });
      continue;
    }

    // Generate knowledge insight from the task
    const insights = generateInsights(profile, matchingTask);

    // Mark task as done
    const completeResult = await teamFetch(
      `/api/holomesh/team/${encodeURIComponent(roomId)}/board/${encodeURIComponent(matchingTask.id)}`,
      'PATCH',
      {
        action: 'done',
        summary: `Completed by ${profile.name} (${profile.role}): ${matchingTask.title}`,
      }
    );

    if (completeResult.error) {
      results.push({
        roomId,
        agentId,
        agentName: slot.agentName,
        taskId: matchingTask.id,
        taskTitle: matchingTask.title,
        action: 'error',
        summary: `Complete failed: ${String(completeResult.error)}`,
        knowledgeEntries: insights,
      });
      continue;
    }

    slot.tasksCompleted += 1;
    slot.knowledgePublished += insights.length;
    slot.lastActiveAt = new Date().toISOString();

    results.push({
      roomId,
      agentId,
      agentName: slot.agentName,
      taskId: matchingTask.id,
      taskTitle: matchingTask.title,
      action: 'completed',
      summary: `Task "${matchingTask.title}" completed. ${insights.length} insight(s) generated.`,
      knowledgeEntries: insights,
    });
  }

  // Store cycle history
  const history = roomCycleHistory.get(roomId) || [];
  history.push(...results);
  // Keep last 100 results per room
  if (history.length > 100) {
    history.splice(0, history.length - 100);
  }
  roomCycleHistory.set(roomId, history);

  return results;
}

/**
 * Find the best claimable task for an agent based on its claim filter.
 */
function findClaimableTask(
  openTasks: BoardTask[],
  profile: TeamAgentProfile,
  alreadyClaimed: Set<string>
): BoardTask | undefined {
  return openTasks.find((task) => {
    if (alreadyClaimed.has(task.id)) return false;
    if (task.priority > profile.claimFilter.maxPriority) return false;

    // If the task has a preferred role, the agent must claim that role
    if (task.role) {
      return profile.claimFilter.roles.includes(task.role);
    }

    // No role specified on task — any agent with a matching capability can claim
    return true;
  });
}

/**
 * Generate knowledge insights from a completed task based on the agent profile.
 * In a real system, this would call an LLM. Here we generate structured placeholders.
 */
function generateInsights(
  profile: TeamAgentProfile,
  task: BoardTask
): KnowledgeInsight[] {
  const insights: KnowledgeInsight[] = [];
  const primaryDomain = profile.knowledgeDomains[0] || 'general';

  // Each role generates different insight types
  switch (profile.role) {
    case 'architect':
      insights.push({
        type: 'pattern',
        content: `Architectural pattern from "${task.title}": ${profile.name} identified a composition opportunity.`,
        domain: primaryDomain,
        confidence: 0.8,
      });
      break;
    case 'coder':
      insights.push({
        type: 'gotcha',
        content: `Implementation note for "${task.title}": ${profile.name} found a type constraint worth documenting.`,
        domain: primaryDomain,
        confidence: 0.7,
      });
      break;
    case 'researcher':
      insights.push({
        type: 'wisdom',
        content: `Research finding from "${task.title}": ${profile.name} extracted a reusable insight.`,
        domain: primaryDomain,
        confidence: 0.6,
      });
      break;
    case 'reviewer':
      insights.push({
        type: 'pattern',
        content: `Review pattern from "${task.title}": ${profile.name} identified a consistency rule.`,
        domain: primaryDomain,
        confidence: 0.9,
      });
      break;
  }

  return insights;
}

/**
 * After a cycle, agents cross-pollinate findings.
 * Each agent's insights are shared with agents in overlapping knowledge domains.
 */
export function compoundKnowledge(roomId: string): CompoundResult {
  const history = roomCycleHistory.get(roomId) || [];
  const slots = roomAgents.get(roomId);

  if (!slots || slots.size === 0) {
    return {
      roomId,
      agentsInvolved: [],
      insightsShared: 0,
      crossReferences: 0,
      timestamp: new Date().toISOString(),
    };
  }

  // Collect all insights from the most recent cycle
  const recentInsights: Array<{ agentId: string; insight: KnowledgeInsight }> = [];
  for (const result of history) {
    if (result.roomId === roomId) {
      for (const insight of result.knowledgeEntries) {
        recentInsights.push({ agentId: result.agentId, insight });
      }
    }
  }

  // Cross-reference: for each agent, count how many insights from other agents
  // overlap with their knowledge domains
  let crossReferences = 0;
  const agentIds = Array.from(slots.keys());

  for (const agentId of agentIds) {
    const profile = TEAM_AGENT_PROFILES.get(agentId);
    if (!profile) continue;

    for (const { agentId: sourceAgentId, insight } of recentInsights) {
      if (sourceAgentId === agentId) continue; // skip own insights
      if (profile.knowledgeDomains.includes(insight.domain)) {
        crossReferences += 1;
      }
    }
  }

  return {
    roomId,
    agentsInvolved: agentIds,
    insightsShared: recentInsights.length,
    crossReferences,
    timestamp: new Date().toISOString(),
  };
}

// ── Query Functions ──

/** Get all agent slots in a room */
export function getRoomAgents(roomId: string): RoomAgentSlot[] {
  const slots = roomAgents.get(roomId);
  return slots ? Array.from(slots.values()) : [];
}

/** Get cycle history for a room */
export function getRoomCycleHistory(roomId: string): CycleResult[] {
  return roomCycleHistory.get(roomId) || [];
}

/** Remove an agent from a room */
export function removeAgentFromRoom(roomId: string, agentId: string): boolean {
  const slots = roomAgents.get(roomId);
  if (!slots) return false;
  return slots.delete(agentId);
}

/** Clear all agents and history for a room */
export function clearRoom(roomId: string): void {
  roomAgents.delete(roomId);
  roomCycleHistory.delete(roomId);
}

// ── For testing: reset all state ──

export function _resetState(): void {
  roomAgents.clear();
  roomCycleHistory.clear();
}
