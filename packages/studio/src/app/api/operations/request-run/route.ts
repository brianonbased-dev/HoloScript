/**
 * POST /api/operations/request-run
 *
 * End-to-end "Request run" for the Studio /operations Capabilities surface.
 * Files a SIGNED board-task request for a spend-class capability so a
 * hardware/fleet seat can pick it up — vast.ai/fleet spend is NEVER initiated
 * from the browser (F.025 file-as-task, F.115 no native task surface, D.080
 * founder-gate, D.081 Studio = operate surface).
 *
 * This route closes the gap the raw board proxy left open: the MCP board route
 * is Phase-3 strict and 401s `signing-rejected` for an unsigned body. Here we
 *   1. requireFounder(request)          — the real spend gate (F.095 class-1)
 *   2. build the exact board-task body  — title + the precise CLI command
 *   3. SIGN it with the Studio seat key — boardSigner (EIP-191 / secp256k1)
 *   4. POST {signed envelope} to the MCP board with the Studio team Bearer
 *   5. return { taskId } or an HONEST error
 *
 * FAIL CLOSED: if STUDIO_SEAT_SIGNING_KEY is not provisioned we return a clear
 * 503 "signing key not provisioned" — we NEVER fall through to an unsigned POST.
 *
 * SAFETY: this route only FILES a task (the CLI command is task TEXT, never
 * executed here). The founder-gate + the board route's own signing check are
 * both enforced. No spend, no fleet call, no shell-out.
 *
 * @see lib/boardSigner.ts                         — the signing contract
 * @see components/operations/CapabilitiesPanel.tsx — the "Request run" caller
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireFounder } from '../../../../lib/api-auth';
import { signBoardRequest, signerConfigured, seatAddress } from '../../../../lib/boardSigner';

export const maxDuration = 60;

const DEFAULT_TEAM = 'team_1777834718247_unr35n';
const HOLOMESH_API_URL =
  process.env.HOLOMESH_API_URL ?? process.env.MCP_SERVER_URL ?? 'https://mcp.holoscript.net';
// Team-member Bearer the MCP board route's requireTeamAccessFresh(board:write)
// needs. Studio already carries this for its proxy paths.
const HOLOMESH_API_KEY = process.env.HOLOMESH_API_KEY ?? process.env.HOLOMESH_KEY ?? '';

// Board caps (kept in sync with board-ops.ts / room-add-tasks.mjs).
const TITLE_CAP = 200;
const DESCRIPTION_CAP = 2000;

interface RequestRunBody {
  /** Capability id (e.g. 'fleet-bench-provision'). Becomes a tag. */
  capabilityId?: unknown;
  /** Human label (e.g. 'Fleet bench provision'). Goes in the task title. */
  label?: unknown;
  /** Provenance string (e.g. 'ai-ecosystem/scripts/fleet-bench-provision.py'). */
  backing?: unknown;
  /** The exact CLI command a hardware/fleet seat must run. Task body text only. */
  command?: unknown;
  /** Gate label echoed into the task body for the picking-up agent. */
  gate?: unknown;
  /** Override team id (defaults to the canonical HoloMesh team). */
  teamId?: unknown;
}

function asTrimmedString(v: unknown, fallback = ''): string {
  return typeof v === 'string' && v.trim() ? v.trim() : fallback;
}

/** Extract the task id from the MCP board's POST /board response shape. */
function extractTaskId(json: unknown): string | null {
  if (!json || typeof json !== 'object') return null;
  const j = json as { tasks?: Array<{ id?: unknown }>; task?: { id?: unknown }; id?: unknown };
  if (Array.isArray(j.tasks) && j.tasks[0] && typeof j.tasks[0].id === 'string')
    return j.tasks[0].id;
  if (j.task && typeof j.task.id === 'string') return j.task.id;
  if (typeof j.id === 'string') return j.id;
  return null;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  // 1. Founder gate — the real spend boundary. A public caller never reaches a
  //    spend-class file-as-request (F.095 class-1).
  const auth = await requireFounder(request);
  if (auth instanceof NextResponse) return auth; // 401 / 403

  // 2. Parse + validate the capability request.
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return NextResponse.json({ error: 'Body must be a JSON object' }, { status: 400 });
  }
  const body = raw as RequestRunBody;

  const label = asTrimmedString(body.label);
  const command = asTrimmedString(body.command);
  const capabilityId = asTrimmedString(body.capabilityId);
  if (!label || !command) {
    return NextResponse.json(
      { error: "'label' and 'command' are required to file a capability request." },
      { status: 400 }
    );
  }
  const backing = asTrimmedString(body.backing, '(unspecified)');
  const gate = asTrimmedString(body.gate, 'spend');
  const teamId = asTrimmedString(body.teamId, DEFAULT_TEAM);

  // 3. Fail closed when the signing key is not provisioned. NEVER POST unsigned —
  //    the MCP board route is Phase-3 strict and an unsigned spend request is
  //    exactly what must be refused.
  if (!signerConfigured()) {
    return NextResponse.json(
      {
        error: 'signing key not provisioned',
        detail:
          'STUDIO_SEAT_SIGNING_KEY is not set in the Studio environment, so this server cannot ' +
          'sign a board request. The board route requires a signed envelope (Phase-3 strict); ' +
          'refusing to POST unsigned. Provision the Studio seat and set STUDIO_SEAT_SIGNING_KEY.',
      },
      { status: 503 }
    );
  }
  if (!HOLOMESH_API_KEY) {
    return NextResponse.json(
      {
        error: 'team key not configured',
        detail:
          'HOLOMESH_API_KEY is not set, so the board membership Bearer is missing. The board ' +
          'route needs a team member with board:write in addition to a signed envelope.',
      },
      { status: 503 }
    );
  }

  // 4. Build the EXACT board-task body (title + the precise CLI command). Clamp
  //    to the board caps so the request is never silently truncated server-side.
  const title = `[capability-request] ${label}`.slice(0, TITLE_CAP);
  const description = [
    `Spend-class capability requested from the Studio Capabilities surface (signed Studio seat).`,
    `Backing: ${backing}`,
    ``,
    `Run (a hardware/fleet seat must execute — NOT the browser):`,
    `    ${command}`,
    ``,
    `Gate: ${gate}. Founder-gate applies per D.080 before any vast.ai spend.`,
    `Filed by: studio operate surface (founder-authenticated, ${request.method}).`,
  ]
    .join('\n')
    .slice(0, DESCRIPTION_CAP);

  // The board POST expects an ARRAY of tasks under `tasks` (board-routes.ts:729).
  const taskBody = {
    tasks: [
      {
        title,
        description,
        priority: 5,
        tags: ['capability-request', 'spend', ...(capabilityId ? [capabilityId] : [])],
      },
    ],
  };

  // 5. Sign the body into the envelope the board route verifies, then POST it
  //    with the team Bearer. signBoardRequest reads STUDIO_SEAT_SIGNING_KEY and
  //    NEVER returns/logs key material.
  let envelope: Awaited<ReturnType<typeof signBoardRequest>>;
  try {
    envelope = await signBoardRequest(taskBody);
  } catch {
    // resolvePrivateKey throws only env-name-referencing messages (no key bytes),
    // but guard anyway: surface a generic message, never the raw error text.
    return NextResponse.json(
      {
        error: 'signing failed',
        detail: 'Could not produce a signed board envelope from STUDIO_SEAT_SIGNING_KEY.',
      },
      { status: 500 }
    );
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${HOLOMESH_API_URL}/api/holomesh/team/${teamId}/board`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${HOLOMESH_API_KEY}`,
      },
      body: JSON.stringify(envelope),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: 'board unreachable', detail: msg }, { status: 502 });
  }

  const json = (await upstream.json().catch(() => null)) as unknown;

  if (!upstream.ok) {
    // Surface the board's own honest rejection (e.g. signing-rejected reason,
    // 403 membership). The signer address is PUBLIC and helps diagnose a
    // seat-not-registered mismatch.
    const reason =
      json && typeof json === 'object'
        ? ((json as { reason?: string; error?: string }).reason ??
          (json as { error?: string }).error ??
          `board ${upstream.status}`)
        : `board ${upstream.status}`;
    return NextResponse.json(
      {
        error: 'board rejected the request',
        status: upstream.status,
        reason,
        signerAddress: seatAddress(),
      },
      { status: upstream.status === 401 || upstream.status === 403 ? upstream.status : 502 }
    );
  }

  const taskId = extractTaskId(json);
  if (!taskId) {
    return NextResponse.json(
      {
        error: 'board accepted but returned no task id',
        detail: 'POST /board returned 2xx without a task id in the response.',
      },
      { status: 502 }
    );
  }

  return NextResponse.json({ taskId, signerAddress: seatAddress() });
}
