/**
 * Embodied Tool Definitions for Brittney
 *
 * Lets Brittney answer "is everything ok?" / "what's the system state?" by
 * reading the composite snapshot from /api/embodied/composite.
 *
 * The composite is pushed to /api/embodied/composite by ai-ecosystem's
 * voice adapter (~/.claude/skills/embodied/adapters/voice.mjs) when its
 * EMBODIED_NOTIFY_URL points at this Studio deploy. See:
 *   ~/.claude/skills/embodied/SKILL.md
 *   ~/.claude/skills/embodied/references/presence-protocol.md
 *
 * Why this is a TOOL not a system-prompt injection:
 *   - System prompt is fixed at session start; embodied state changes
 *     constantly. A tool call gets fresh data.
 *   - User has to ask ("is everything ok?") before it loads — keeps
 *     context lean and honest about what's "live" data.
 *   - Brittney decides when it's relevant; we don't force it on every turn.
 */

import type { StudioToolDefinition } from './StudioAPITools';

// ─── Tool: read_embodied_status ──────────────────────────────────────────

const readEmbodiedStatus: StudioToolDefinition = {
  type: 'function',
  function: {
    name: 'read_embodied_status',
    description:
      'Read the current ecosystem status composite — answers "is everything ok?", "what\'s going on with the system?", "are services up?", "do I have unread DMs?". Returns a glanceable composite (✅/⚠/🔴 health, one-phrase summary, voice line) plus per-skill breakdowns for /qa (services, deploys, GitHub Actions), /room (board, inbox, mode), and any other producer that has registered with the embodied skill. Use whenever the user asks about overall system state, before recommending action that depends on services being up, or proactively when the user opens a session and you want to flag something they should know about.',
    parameters: {
      type: 'object',
      properties: {
        verbose: {
          type: 'boolean',
          description:
            'If true, include the full per-skill details array (drill-down rows). If false (default), return only the composite + skill-level summaries — use this for "is everything ok?" questions.',
        },
      },
    },
  },
};

// ─── Public exports (mirror MCPTools / StudioAPITools shape) ─────────────

export const EMBODIED_TOOLS: StudioToolDefinition[] = [readEmbodiedStatus];

export const EMBODIED_TOOL_NAMES: Set<string> = new Set(
  EMBODIED_TOOLS.map((t) => t.function.name),
);

// ─── Executor ────────────────────────────────────────────────────────────

export interface EmbodiedToolResult {
  tool: string;
  success: boolean;
  data: unknown;
  error?: string;
}

/**
 * Execute an embodied tool call. Routes to /api/embodied/composite on the
 * same Studio deploy. Self-call via process.env.NEXT_PUBLIC_STUDIO_URL or
 * inferred from request — if neither is available, falls back to a relative
 * fetch (which works in Next.js server components).
 */
export async function executeEmbodiedTool(
  toolName: string,
  args: Record<string, unknown>,
): Promise<EmbodiedToolResult> {
  if (toolName !== 'read_embodied_status') {
    return {
      tool: toolName,
      success: false,
      data: null,
      error: `unknown embodied tool: ${toolName}`,
    };
  }

  const verbose = args['verbose'] === true;
  const baseUrl =
    process.env.NEXT_PUBLIC_STUDIO_URL ||
    process.env.STUDIO_URL ||
    'http://localhost:3000';

  try {
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 3000);
    const res = await fetch(`${baseUrl}/api/embodied/composite`, {
      headers: { Accept: 'application/json' },
      signal: ctrl.signal,
    });
    clearTimeout(tid);

    if (!res.ok) {
      return {
        tool: toolName,
        success: false,
        data: null,
        error: `embodied composite endpoint ${res.status}`,
      };
    }

    const payload = (await res.json()) as {
      stale?: boolean;
      age_ms?: number;
      composite?: Record<string, unknown> | null;
    };

    if (!payload.composite || payload.stale) {
      // Cache is empty or stale — fall back to /api/health for a live system
      // status check so Brittney can answer "is everything ok?" truthfully
      // without requiring the ai-ecosystem voice adapter to have run recently.
      const fallback = await fetchHealthFallback(baseUrl);
      return {
        tool: toolName,
        success: true,
        data: fallback,
      };
    }

    const c = payload.composite as Record<string, unknown>;

    // Trim per-skill detail unless verbose — keeps Brittney's context lean.
    const skills = Array.isArray(c.skills)
      ? (c.skills as Array<Record<string, unknown>>).map((s) => ({
          skill: s.skill,
          health: s.health,
          glyph: s.glyph,
          summary: s.summary,
          urgency: s.urgency,
          badge_count: s.badge_count,
          ...(verbose ? { details: s.details, action_url: s.action_url } : {}),
        }))
      : [];

    return {
      tool: toolName,
      success: true,
      data: {
        health: c.composite_health,
        glyph: c.composite_glyph,
        summary: c.composite_summary,
        voice: c.composite_voice,
        urgency: c.composite_urgency,
        participating_count: c.participating_count,
        ts: c.ts,
        stale: payload.stale ?? false,
        age_ms: payload.age_ms,
        skills,
      },
    };
  } catch (e) {
    const isTimeout = e instanceof Error && e.name === 'AbortError';
    return {
      tool: toolName,
      success: false,
      data: null,
      error: isTimeout ? 'embodied composite fetch timeout' : `embodied composite fetch failed: ${(e as Error).message}`,
    };
  }
}

// ─── Health fallback ──────────────────────────────────────────────────────────

/**
 * Fetch a live health snapshot from /api/health and convert it into the
 * same shape that read_embodied_status normally returns.
 *
 * Called when /api/embodied/composite has no composite cached yet (or the
 * cache is stale). This ensures Brittney can answer "is everything ok?"
 * truthfully from live data — without requiring the ai-ecosystem voice
 * adapter (embodied.mjs) to have pushed a composite recently.
 *
 * The /api/health endpoint is fast (DB query + env-var inspection) and
 * does not require authentication, so a same-process self-call is safe.
 *
 * We never surface raw /api/health JSON to the LLM — we normalize it into
 * the same { health, summary, voice, stale, skills[] } shape the tool
 * contract defines.
 */
async function fetchHealthFallback(baseUrl: string): Promise<Record<string, unknown>> {
  interface HealthResponse {
    degraded?: boolean;
    ai?: { provider: string; connected: boolean };
    taskBoard?: { mode: string; degraded: boolean; error?: string };
    teamActivity?: {
      active_teams: number;
      total_agents: number;
      tasks_completed_today: number;
    };
  }

  try {
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 2000);
    const res = await fetch(`${baseUrl}/api/health`, {
      headers: { Accept: 'application/json' },
      signal: ctrl.signal,
    });
    clearTimeout(tid);

    if (!res.ok) {
      return {
        health: 'unknown',
        summary: `Studio /api/health returned ${res.status} — service may be starting up.`,
        voice: 'I could not reach the health endpoint. Services may be starting up.',
        stale: false,
        source: 'health-fallback-error',
        skills: [],
      };
    }

    const h = (await res.json()) as HealthResponse;

    // Determine overall health from /api/health fields.
    const boardDegraded = h.taskBoard?.degraded ?? true;
    const aiConnected = h.ai?.connected ?? false;

    let health: 'ok' | 'warn' | 'down' | 'unknown';
    if (!h.degraded && aiConnected) {
      health = 'ok';
    } else if (h.degraded && !boardDegraded) {
      health = 'warn'; // DB up but AI disconnected
    } else if (h.degraded && boardDegraded) {
      health = 'warn'; // some degradation
    } else {
      health = 'unknown';
    }

    // Build a skill-level breakdown for /api/health's known checks.
    const skills: Array<Record<string, unknown>> = [];

    // Task board skill
    skills.push({
      skill: 'task-board',
      health: boardDegraded ? 'warn' : 'ok',
      glyph: boardDegraded ? '⚠' : '✅',
      summary: boardDegraded
        ? `running in-memory (${h.taskBoard?.error ? h.taskBoard.error.slice(0, 60) : 'DB not connected'})`
        : `DB-backed; ${h.teamActivity?.active_teams ?? 0} teams, ${h.teamActivity?.tasks_completed_today ?? 0} tasks today`,
      urgency: boardDegraded ? 2 : 0,
    });

    // AI provider skill
    skills.push({
      skill: 'ai-provider',
      health: aiConnected ? 'ok' : 'warn',
      glyph: aiConnected ? '✅' : '⚠',
      summary: aiConnected
        ? `${h.ai?.provider ?? 'unknown'} connected`
        : 'no AI provider configured (ANTHROPIC_API_KEY / OLLAMA_HOST unset)',
      urgency: aiConnected ? 0 : 3,
    });

    // Voice summary
    let voice: string;
    if (health === 'ok') {
      voice = 'Studio is healthy — AI and task board are both up.';
    } else if (health === 'warn') {
      const issue = !aiConnected ? 'AI provider is not connected.' : 'Task board is running in-memory.';
      voice = `Studio is mostly up but ${issue}`;
    } else {
      voice = 'Studio health is unclear. Some services may be starting up.';
    }

    const summary: string =
      health === 'ok'
        ? 'all systems ok (via /api/health)'
        : skills.find((s) => s.urgency && Number(s.urgency) > 0)?.summary as string ??
          'some services degraded';

    return {
      health,
      glyph: { ok: '✅', warn: '⚠', down: '🔴', unknown: '❓' }[health],
      summary,
      voice,
      stale: false, // live data from this request
      source: 'health-fallback',
      note: 'Composite from /api/embodied/composite was absent or stale; this is a live /api/health snapshot. For full ecosystem status, run the embodied skill (node ~/.ai-ecosystem/skills/embodied/scripts/embodied.mjs --surface voice).',
      skills,
    };
  } catch (e) {
    return {
      health: 'unknown',
      summary: 'Could not reach /api/health — service may be starting.',
      voice: 'I have no live status right now. Services may be starting up.',
      stale: false,
      source: 'health-fallback-exception',
      skills: [],
    };
  }
}
