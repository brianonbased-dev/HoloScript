import { NextResponse } from 'next/server';
import { getDb } from '../../../db/client';
import { holomeshBoardTasks } from '../../../db/schema';
import { sql } from 'drizzle-orm';

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';

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

  // Check Ollama
  let ollama = false;
  let models: string[] = [];
  try {
    const ollamaRes = await fetch(`${OLLAMA_URL}/api/tags`, {
      signal: AbortSignal.timeout(3000),
    });
    if (ollamaRes.ok) {
      const data = await ollamaRes.json();
      models = ((data.models || []) as Array<{ name: string }>).map((m) => m.name);
      ollama = true;
    }
  } catch {
    // ollama stays false
  }

  const degraded = taskBoard.degraded;

  return NextResponse.json({ degraded, ollama, models, taskBoard, teamActivity });
}
