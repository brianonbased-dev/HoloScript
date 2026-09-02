/**
 * Union process-local teamMessageStore rows with durable team.messages by id.
 *
 * HTTP POST writes the side map and may leave team.messages stale. MCP send
 * writes both, then persistTeamDurable. After reloadTeam/getFresh, a warm
 * replica's side map can still be non-empty from boot — preferring either
 * side wholesale drops the other (HTTP clobber vs silent non-delivery).
 */
import { persistTeamDurable, teamMessageStore, teamStore } from './state';
import type { TeamMessage } from './types';

export const TEAM_MESSAGE_CAP = 500;

export function mergeTeamMessagesById(
  processLocal: TeamMessage[] | undefined,
  durable: TeamMessage[] | undefined
): TeamMessage[] {
  const byId = new Map<string, TeamMessage>();
  for (const msg of processLocal || []) {
    if (msg && typeof msg.id === 'string' && msg.id) byId.set(msg.id, msg);
  }
  for (const msg of durable || []) {
    if (msg && typeof msg.id === 'string' && msg.id) byId.set(msg.id, msg);
  }
  return [...byId.values()]
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    .slice(-TEAM_MESSAGE_CAP);
}

type TeamWithMessages = { messages?: TeamMessage[] };

export function hydrateTeamMessageStore(teamId: string): TeamMessage[] {
  const team = teamStore.get(teamId) as TeamWithMessages | undefined;
  const merged = mergeTeamMessagesById(teamMessageStore.get(teamId), team?.messages);
  teamMessageStore.set(teamId, merged);
  return merged;
}

export async function persistTeamMessages(
  teamId: string,
  messages: TeamMessage[]
): Promise<TeamMessage[]> {
  const capped = messages.slice(-TEAM_MESSAGE_CAP);
  teamMessageStore.set(teamId, capped);
  const team = teamStore.get(teamId) as TeamWithMessages | undefined;
  if (team) team.messages = capped;
  await persistTeamDurable(teamId);
  return capped;
}
