/**
 * Team mode changes — provenance for GET /board, history ring buffer, and
 * timeline (messages + team activity feed). task_1777050706699_ixmi
 */
import { ROOM_PRESETS } from '@holoscript/framework';
import type { Team, TeamMessage, TeamModeChangeFeedItem } from './types';
import { teamFeedStore, teamMessageStore, persistTeamStore } from './state';
import { broadcastToTeam } from './team-room';

const MODE_HISTORY_MAX = 10;
const FEED_CAP = 200;
const MESSAGES_CAP = 500;

export type ModeChangeSource = 'api' | 'mcp_tool';

export interface ModeHistoryEntry {
  mode: string;
  at: string;
  by: string;
  byAgentId: string;
  source: ModeChangeSource;
  reason?: string;
  previousMode: string;
}

function pushModeHistory(team: Team, entry: ModeHistoryEntry) {
  if (!team.roomConfig) team.roomConfig = {};
  const ring = (team.roomConfig as { modeHistory?: ModeHistoryEntry[] }).modeHistory || [];
  const next = [entry, ...ring].slice(0, MODE_HISTORY_MAX);
  (team.roomConfig as { modeHistory: ModeHistoryEntry[] }).modeHistory = next;
}

/**
 * GET /board — last change + full history (max 10); legacy teams get unknown provenance.
 */
export function getBoardModeFields(team: Team) {
  const rc = team.roomConfig;
  const prov = rc?.modeProvenance;
  const history: ModeHistoryEntry[] = (rc?.modeHistory as ModeHistoryEntry[] | undefined) || [];
  return {
    modeChangedAt: prov?.changedAt ?? null,
    /** Agent id, or e.g. `mcp-tool` for MCP; null if unknown (pre-audit team). */
    modeChangedBy: prov?.changedByAgentId ?? null,
    modeChangeSource: (prov?.source as ModeHistoryEntry['source'] | 'unknown' | undefined) ?? 'unknown',
    modeHistory: history,
  };
}

/**
 * Apply a mode change: team.mode, objective, provenance, history, message, feed, SSE.
 * No-op if newMode === current mode (objective may still be refreshed from preset).
 */
export function recordTeamModeChange(opts: {
  teamId: string;
  team: Team;
  newMode: string;
  source: ModeChangeSource;
  actor: { id: string; name: string };
  reason?: string;
}): { changed: boolean; previousMode: string } {
  const { teamId, team, newMode, source, actor } = opts;
  const previousMode = team.mode || 'general';
  const preset = (ROOM_PRESETS as Record<string, { objective?: string }>)[newMode];
  if (!team.roomConfig) team.roomConfig = {};
  if (previousMode === newMode) {
    if (preset?.objective) {
      (team.roomConfig as { objective?: string }).objective = preset.objective;
      persistTeamStore();
    }
    return { changed: false, previousMode };
  }
  const now = new Date().toISOString();
  team.mode = newMode;
  if (preset?.objective) {
    (team.roomConfig as { objective?: string }).objective = preset.objective;
  }
  (team.roomConfig as { modeProvenance: Record<string, unknown> }).modeProvenance = {
    source,
    changedAt: now,
    changedByAgentId: actor.id,
    changedByName: actor.name,
    previousMode,
  };
  const histEntry: ModeHistoryEntry = {
    mode: newMode,
    at: now,
    by: actor.name,
    byAgentId: actor.id,
    source,
    reason: opts.reason,
    previousMode,
  };
  pushModeHistory(team, histEntry);

  const summary = `Mode ${previousMode} → ${newMode} (${source})`;
  const message: TeamMessage = {
    id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    teamId,
    fromAgentId: actor.id,
    fromAgentName: actor.name,
    content: summary,
    messageType: 'mode_change',
    createdAt: now,
    modeChange: {
      previousMode,
      newMode,
      source,
      reason: opts.reason,
    },
  };
  const msgs = teamMessageStore.get(teamId) || [];
  msgs.push(message);
  teamMessageStore.set(teamId, msgs.slice(-MESSAGES_CAP));

  const feedItem: TeamModeChangeFeedItem = {
    id: `feed_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    teamId,
    kind: 'mode_change',
    fromMode: previousMode,
    toMode: newMode,
    source,
    actorAgentId: actor.id,
    actorAgentName: actor.name,
    createdAt: now,
  };
  const list = teamFeedStore.get(teamId) || [];
  list.push(feedItem);
  teamFeedStore.set(teamId, list.length > FEED_CAP ? list.slice(-FEED_CAP) : list);

  persistTeamStore();
  broadcastToTeam(teamId, {
    type: 'mode:changed' as any,
    agent: actor.name,
    data: {
      mode: newMode,
      objective: preset?.objective || '',
      fromMode: previousMode,
      source,
    },
  });

  return { changed: true, previousMode };
}
