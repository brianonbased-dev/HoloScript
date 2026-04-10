/**
 * HoloMesh Team Coordinator
 *
 * @deprecated FW-0.3 — This module is scheduled for removal. All work-cycle
 * logic has already been delegated to `@holoscript/framework` Team.runCycle().
 *
 * **Remaining unique logic that must migrate to framework before deletion:**
 * 1. In-memory room→agent slot store (`roomAgents` Map) — framework Team
 *    takes agents at construction time; need a `team.addAgent()` / `team.removeAgent()` API.
 * 2. `assignAgentsToRoom()` — maps TeamAgentProfile → RoomAgentSlot with
 *    role mapping and dedup. Framework needs an equivalent load-from-profile helper.
 * 3. `compoundKnowledge()` — cross-references insights by knowledge domain
 *    across agents. Framework has `knowledge.compound()` but not the per-agent
 *    domain-overlap scoring done here.
 * 4. Room lifecycle helpers (`clearRoom`, `removeAgentFromRoom`, `getRoomAgents`,
 *    `getRoomCycleHistory`) — framework Team has no multi-room management.
 *
 * Once these migrate, delete this file and update imports in:
 * - `./team-agent-tools.ts`
 * - `../index.ts`
 * - `../__tests__/team-agents.test.ts`
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
import { Team as FrameworkTeam } from '@holoscript/framework';
import type { CycleResult as FrameworkCycleResult } from '@holoscript/framework';

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
  action: 'claimed' | 'completed' | 'skipped' | 'error' | 'synthesized';
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

// ── Core Functions ──

/**
 * Load agent profiles into a team room.
 * Each profile is mapped to a slot role based on its primary role.
 * Skips agents whose role slot is already occupied.
 * @deprecated FW-0.3 — migrate to framework Team constructor + addAgent() API
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
 * Delegates to @holoscript/framework Team.runCycle() for the core
 * claim/execute/done loop. Adapts the result back to the coordinator's
 * CycleResult[] shape for backward compatibility.
 * @deprecated FW-0.3 — use framework Team.runCycle() directly
 */
export async function runAgentCycle(roomId: string): Promise<CycleResult[]> {
  const slots = roomAgents.get(roomId);
  if (!slots || slots.size === 0) {
    return [];
  }

  // Build a Framework Team from the registered agent profiles
  const agentConfigs = Array.from(slots.values())
    .map(slot => {
      const profile = TEAM_AGENT_PROFILES.get(slot.agentId);
      if (!profile) return null;
      return {
        name: profile.name,
        role: profile.role as 'architect' | 'coder' | 'researcher' | 'reviewer',
        model: { provider: profile.provider as 'anthropic' | 'openai' | 'xai', model: profile.model },
        capabilities: profile.capabilities,
        claimFilter: { roles: profile.claimFilter.roles, maxPriority: profile.claimFilter.maxPriority },
        systemPrompt: profile.systemPrompt,
        knowledgeDomains: profile.knowledgeDomains,
      };
    })
    .filter((c): c is NonNullable<typeof c> => c !== null);

  if (agentConfigs.length === 0) {
    return Array.from(slots.values()).map(slot => ({
      roomId,
      agentId: slot.agentId,
      agentName: slot.agentName,
      taskId: null,
      taskTitle: null,
      action: 'skipped' as const,
      summary: 'No profile found for agent',
      knowledgeEntries: [],
    }));
  }

  const serverUrl = getServerUrl();
  const apiKey = getApiKey();

  const frameworkTeam = new FrameworkTeam({
    name: roomId,
    agents: agentConfigs,
    boardUrl: serverUrl,
    boardApiKey: apiKey,
  });

  // Run the framework cycle (handles claim/execute/done via API)
  const fwResult: FrameworkCycleResult = await frameworkTeam.runCycle();

  // Adapt framework results → coordinator CycleResult[]
  const results: CycleResult[] = fwResult.agentResults.map(ar => {
    const slot = Array.from(slots.values()).find(s => s.agentName === ar.agentName);
    const agentId = slot?.agentId || ar.agentName;

    // Update slot stats
    if (slot && ar.action === 'completed') {
      slot.tasksCompleted += 1;
      slot.knowledgePublished += ar.knowledge.length;
      slot.lastActiveAt = new Date().toISOString();
    }

    return {
      roomId,
      agentId,
      agentName: ar.agentName,
      taskId: ar.taskId,
      taskTitle: ar.taskTitle,
      action: ar.action,
      summary: ar.summary,
      knowledgeEntries: ar.knowledge.map(k => ({
        type: k.type,
        content: k.content,
        domain: k.domain,
        confidence: k.confidence,
      })),
    };
  });

  // Store cycle history
  const history = roomCycleHistory.get(roomId) || [];
  history.push(...results);
  if (history.length > 100) {
    history.splice(0, history.length - 100);
  }
  roomCycleHistory.set(roomId, history);

  return results;
}

/**
 * After a cycle, agents cross-pollinate findings.
 * Each agent's insights are shared with agents in overlapping knowledge domains.
 * @deprecated FW-0.3 — migrate domain-overlap scoring to framework KnowledgeStore.compound()
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

/** Get all agent slots in a room @deprecated FW-0.3 */
export function getRoomAgents(roomId: string): RoomAgentSlot[] {
  const slots = roomAgents.get(roomId);
  return slots ? Array.from(slots.values()) : [];
}

/** Get cycle history for a room @deprecated FW-0.3 */
export function getRoomCycleHistory(roomId: string): CycleResult[] {
  return roomCycleHistory.get(roomId) || [];
}

/** Remove an agent from a room @deprecated FW-0.3 */
export function removeAgentFromRoom(roomId: string, agentId: string): boolean {
  const slots = roomAgents.get(roomId);
  if (!slots) return false;
  return slots.delete(agentId);
}

/** Clear all agents and history for a room @deprecated FW-0.3 */
export function clearRoom(roomId: string): void {
  roomAgents.delete(roomId);
  roomCycleHistory.delete(roomId);
}

// ── For testing: reset all state ──

export function _resetState(): void {
  roomAgents.clear();
  roomCycleHistory.clear();
}
