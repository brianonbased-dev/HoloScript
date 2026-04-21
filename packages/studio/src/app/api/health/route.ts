export const maxDuration = 300;

import { NextResponse } from 'next/server';
import { getDb } from '../../../db/client';
import { holomeshBoardTasks } from '../../../db/schema';
import { sql } from 'drizzle-orm';

/**
 * Cloud-first AI detection. Ollama is an optional local fallback — never required.
 */
function detectAIProvider(): { provider: string; connected: boolean } {
  if (process.env.OPENROUTER_API_KEY) return { provider: 'openrouter', connected: true };
  if (process.env.ANTHROPIC_API_KEY) return { provider: 'anthropic', connected: true };
  if (process.env.OPENAI_API_KEY) return { provider: 'openai', connected: true };
  if (process.env.OLLAMA_URL) return { provider: 'ollama', connected: true };
  return { provider: 'none', connected: false };
}

interface TeamActivity {
  active_teams: number;
  total_agents: number;
  tasks_completed_today: number;
}

interface MetricsRow extends Record<string, unknown> {
  active_teams: unknown;
  total_agents: unknown;
  tasks_completed_today: unknown;
}

export async function GET() {
  // Check task board persistence + collect team activity metrics in one query
  let taskBoard: { mode: string; degraded: boolean; error?: string } = {
    mode: 'in-memory',
    degraded: true,
  };
  let teamActivity: TeamActivity | undefined;

  try {
    const db = getDb();
    if (db) {
      // Single aggregate query: reachability check + metrics
      const result = await db.execute<MetricsRow>(sql`
        SELECT
          COUNT(DISTINCT team_id)::int                                               AS active_teams,
          COUNT(DISTINCT claimed_by) FILTER (WHERE claimed_by IS NOT NULL)::int      AS total_agents,
          COUNT(*) FILTER (WHERE status = 'done' AND completed_at >= CURRENT_DATE)::int
                                                                                      AS tasks_completed_today
        FROM ${holomeshBoardTasks}
      `);

      const row = result.rows[0];
      if (row) {
        teamActivity = {
          active_teams: Number(row.active_teams),
          total_agents: Number(row.total_agents),
          tasks_completed_today: Number(row.tasks_completed_today),
        };
      }

      taskBoard = { mode: 'db-backed', degraded: false };
    }
  } catch (err) {
    taskBoard = {
      mode: 'in-memory',
      degraded: true,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  // Detect AI provider (cloud-first, Ollama optional fallback)
  const ai = detectAIProvider();

  const degraded = taskBoard.degraded;

  // Legacy compat: ollama field mirrors ai.connected for old clients
  return NextResponse.json({
    degraded,
    ai,
    ollama: ai.connected,
    models: ai.provider !== 'none' ? [ai.provider] : [],
    taskBoard,
    teamActivity,
  });
}


// PUBLIC-CORS: documented-public endpoint, intentional wildcard (SEC-T11)
export function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-mcp-api-key',
    },
  });
}
