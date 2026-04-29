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

    if (!payload.composite) {
      return {
        tool: toolName,
        success: true,
        data: {
          health: 'unknown',
          summary: 'Status not yet reported by the ai-ecosystem voice adapter.',
          voice: 'I have no recent status to share.',
          stale: true,
        },
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
        stale: payload.stale === true,
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
