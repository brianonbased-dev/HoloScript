import { NextResponse } from 'next/server';
import { getDb } from '../../../db/client';
import { holomeshBoardTasks } from '../../../db/schema';
import { sql } from 'drizzle-orm';

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';

export async function GET() {
  // Check task board persistence
  let taskBoard: { mode: string; degraded: boolean; error?: string } = {
    mode: 'in-memory',
    degraded: true,
  };
  try {
    const db = getDb();
    if (db) {
      // Light query — just confirm the table is reachable
      await db.select({ count: sql<number>`count(*)` }).from(holomeshBoardTasks).limit(1);
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

  return NextResponse.json({ degraded, ollama, models, taskBoard });
}
