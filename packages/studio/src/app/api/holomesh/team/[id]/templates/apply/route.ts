export const maxDuration = 300;

import { NextRequest, NextResponse } from 'next/server';
import { getTemplate } from '../../../../../../../lib/holomesh/room-templates';
import { rateLimit } from '../../../../../../../lib/rate-limiter';

const BASE =
  process.env.HOLOMESH_API_URL ?? process.env.MCP_SERVER_URL ?? 'https://mcp.holoscript.net';
const KEY = process.env.HOLOMESH_API_KEY ?? process.env.HOLOMESH_KEY ?? '';

function boardHeaders(): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (KEY) h['Authorization'] = `Bearer ${KEY}`;
  return h;
}

/**
 * POST /api/holomesh/team/[id]/templates/apply
 *
 * Applies a room template to a team:
 *   1. Sets team mode to the template's mode.
 *   2. Posts all template tasks to the team board.
 *   3. Returns a summary of what was created.
 *
 * Body:
 *   { templateSlug: string }  — required
 *
 * Response:
 *   { success, teamId, template, tasksPosted, tasksFailed, mode }
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const limited = rateLimit(req, { max: 10, label: 'team-template-apply' }, 'team-template-apply');
  if (!limited.ok) return limited.response;

  const { id: teamId } = await params;

  const body = (await req.json()) as {
    templateSlug?: string;
    agentId?: string;
    agentName?: string;
  };
  const templateSlug = (body.templateSlug ?? '').trim();

  if (!templateSlug) {
    return NextResponse.json({ error: 'templateSlug is required' }, { status: 400 });
  }

  const template = getTemplate(templateSlug);
  if (!template) {
    return NextResponse.json({ error: `Template '${templateSlug}' not found` }, { status: 404 });
  }

  const headers = boardHeaders();
  const posted: Array<{ title: string; ok: boolean; error?: string }> = [];

  // 1. Set team mode (fire-and-forget)
  fetch(`${BASE}/api/holomesh/team/${teamId}/mode`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      mode: template.mode,
      agentId: body.agentId,
      agentName: body.agentName,
    }),
  }).catch(() => {});

  // 2. Add template tasks to the board
  for (const task of template.tasks) {
    try {
      const res = await fetch(`${BASE}/api/holomesh/team/${teamId}/board`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          title: task.title,
          description: task.description,
          role: task.role,
          priority: task.priority,
          source: 'template',
          metadata: {
            templateSlug,
            templateName: template.name,
          },
        }),
      });
      if (res.ok) {
        posted.push({ title: task.title, ok: true });
      } else {
        const errText = await res.text().catch(() => res.statusText);
        posted.push({ title: task.title, ok: false, error: errText });
      }
    } catch (e) {
      posted.push({ title: task.title, ok: false, error: String(e) });
    }
  }

  const tasksPosted = posted.filter((t) => t.ok).length;
  const tasksFailed = posted.filter((t) => !t.ok).length;

  return NextResponse.json({
    success: true,
    teamId,
    template: {
      slug: template.slug,
      name: template.name,
      mode: template.mode,
      objective: template.objective,
    },
    tasksPosted,
    tasksFailed,
    tasks: posted,
  });
}


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
