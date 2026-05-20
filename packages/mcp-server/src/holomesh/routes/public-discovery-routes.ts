import type http from 'http';
import { teamStore, agentKeyStore } from '../state';
import { json } from '../utils';

/**
 * Public discovery routes — no auth required.
 *
 * GET /api/holomesh/discover
 *   Returns a combined snapshot: public guilds + top agents.
 *   Safe for crawlers, bots, and unauthenticated visitors.
 *   This is the backend for the /holomesh/discover Studio page (D.055).
 */
export function handlePublicDiscoveryRoutes(
  req: http.IncomingMessage,
  res: http.ServerResponse
): boolean {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const { pathname } = url;
  const method = (req.method ?? 'GET').toUpperCase();

  if (pathname !== '/api/holomesh/discover' || method !== 'GET') return false;

  const limit = Math.min(Number(url.searchParams.get('limit') ?? '12'), 50);

  // Public guilds (visibility=public)
  const guilds = Array.from(teamStore.values())
    .filter((t) => t.visibility === 'public')
    .sort((a, b) => b.members.length - a.members.length)
    .slice(0, limit)
    .map((t) => ({
      teamId: t.id,
      teamName: t.name,
      description: t.description ?? null,
      memberCount: t.members.length,
      mode: t.mode ?? 'build',
      activeTasks: (t.taskBoard ?? []).filter((task) => task.status !== 'done').length,
      openBountyCount: (t.bounties?.list() ?? []).filter((b) => b.status === 'open').length,
      topMembers: t.members.slice(0, 3).map((m) => ({
        agentId: m.agentId,
        agentName: m.agentName,
        surfaceTag: m.surfaceTag ?? null,
      })),
    }));

  // Top agents by done-count across all team task boards
  const agentTaskCounts = new Map<string, { agentId: string; agentName: string; count: number }>();
  for (const team of teamStore.values()) {
    for (const task of team.taskBoard ?? []) {
      if (task.status === 'done' && task.claimedBy) {
        const existing = agentTaskCounts.get(task.claimedBy);
        if (existing) {
          existing.count += 1;
        } else {
          agentTaskCounts.set(task.claimedBy, {
            agentId: task.claimedBy,
            agentName: task.claimedByName ?? task.claimedBy,
            count: 1,
          });
        }
      }
    }
  }
  const topAgents = Array.from(agentTaskCounts.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, limit)
    .map((a) => ({
      agentId: a.agentId,
      agentName: a.agentName,
      tasksCompleted: a.count,
      // Surface info comes from agentKeyStore if present
      surface: agentKeyStore.get(a.agentId)?.surface ?? null,
    }));

  json(res, 200, {
    success: true,
    guilds,
    topAgents,
    guildCount: guilds.length,
    agentCount: topAgents.length,
    generatedAt: new Date().toISOString(),
  });
  return true;
}
