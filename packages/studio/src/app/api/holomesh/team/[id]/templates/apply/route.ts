export const maxDuration = 300;

import { NextRequest, NextResponse } from 'next/server';
import { getTemplate } from '../../../../../../../lib/holomesh/room-templates';
import { rateLimit } from '../../../../../../../lib/rate-limiter';
import {
  callerHoloMeshHeaders,
  noHoloMeshAgentResponse,
} from '../../../../../../../lib/holomesh-proxy';

import { corsHeaders } from '../../../../../_lib/cors';
const BASE =
  process.env.HOLOMESH_API_URL ?? process.env.MCP_SERVER_URL ?? 'https://mcp.holoscript.net';

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

  // Audit 2026-10-15: this wrote the team's mode and board under Studio's
  // server key for any caller. It acts on the caller's team, so only the
  // caller's own key may do it; keyless → 404 no_holomesh_agent.
  const headers = callerHoloMeshHeaders(req);
  if (!headers) return noHoloMeshAgentResponse();

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

export function OPTIONS(request: Request) {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(request, { methods: 'GET, POST, PUT, DELETE, PATCH, OPTIONS' }),
  });
}
