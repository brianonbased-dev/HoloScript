export const maxDuration = 300;

import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { validateGeneratedHoloOutput } from '@/lib/brittney/generatedOutputGate';

// ─── /api/mcp/call — HoloScript MCP Tool Proxy (Decoupled) ───────────────────
//
// This route acts purely as an API Gateway to forward requests from the React
// Studio frontend to the standalone external MCP Orchestrator and Absorb Service.
// Generated scene/world output is gated through `@holoscript/core` before Studio
// accepts it, so proxy success cannot admit surface-only scene text.
// ─────────────────────────────────────────────────────────────────────────────

import { ENDPOINTS } from '@holoscript/config/endpoints';

import { corsHeaders } from '../../_lib/cors';
let MCP_EXTERNAL_URL = ENDPOINTS.MCP_ORCHESTRATOR;
if (MCP_EXTERNAL_URL && !MCP_EXTERNAL_URL.startsWith('http')) {
  MCP_EXTERNAL_URL = `https://${MCP_EXTERNAL_URL}`;
}

/**
 * The one header the upstream actually reads. It takes the key from
 * `x-mcp-api-key` (or an `apiKey` query param) and never consults
 * `Authorization` — both `/tools/call` and `/servers` sit behind that single
 * lookup in the upstream's own auth middleware.
 */
const MESH_KEY_HEADER = 'x-mcp-api-key';

/** What a locked-out caller is told to do, in the form that actually works. */
const OWN_KEY_HINT = `Send your own mesh API key as "${MESH_KEY_HEADER}: <your key>" to run it as yourself.`;

/**
 * The caller's OWN upstream key, if they sent one.
 *
 * Both spellings are accepted FROM the caller — `x-mcp-api-key: <key>` and
 * `Authorization: Bearer <key>` — because agents arrive with both habits. The
 * key is then forwarded in the single form the upstream reads. Until now this
 * route passed a bearer key on as `Authorization`, which promised an
 * authentication that fails silently: upstream treats the caller as anonymous
 * and never says why.
 *
 * A `bk_` bearer is deliberately NOT treated as a mesh key: those are Studio's
 * own API keys. Presenting one upstream would hand a Studio credential to a
 * different service, which records the presented key when validation fails.
 */
function callerMeshKey(request: Request): string | null {
  const meshKey = request.headers.get(MESH_KEY_HEADER)?.trim();
  if (meshKey) return meshKey;

  const authorization = request.headers.get('authorization')?.trim() ?? '';
  const bearer = /^Bearer\s+(\S+)$/i.exec(authorization)?.[1];
  if (bearer && !bearer.startsWith('bk_')) return bearer;

  return null;
}

/**
 * Tools this gateway will run under Studio's OWN server key for a caller who
 * proved only that they are signed in to Studio.
 *
 * Every entry is a tool Studio's own UI calls through this route today —
 * measured from the callers, not guessed:
 *   suggest_traits / generate_scene / validate_holoscript  useMCPSceneGen
 *   compile_to_sdk                                         useSceneExport
 *   compile_fanout                                         dispatchFanout
 *   explain_fairness_receipt                               FairnessPanel
 *   generate_world / holo_generate_scene / holo_generate_world
 *                                          this route's own generated-output gate
 *
 * Anything else needs the caller's own key. Keep this list short: each entry
 * is a tool a signed-in stranger may run as our server identity.
 *
 * DROPPED 2026-09-15 — the two create-page palette tools. Both PUBLISH to the
 * mesh, and under the server key they publish as US: any signed-in stranger
 * could post to the crosspost feed and the agent-template marketplace under
 * our identity, with nothing tying the post back to them, because a Studio
 * account is not a mesh agent id. Every surviving entry only compiles,
 * validates, generates or explains — none of them writes anything the world
 * can see. The two palette commands that called them (Ctrl+Shift+M and
 * Ctrl+Shift+P on /create) now refuse for a session-only caller and name the
 * header that works; they still run for a caller who brings their own key.
 */
const STUDIO_SESSION_TOOLS = new Set<string>([
  'suggest_traits',
  'generate_scene',
  'validate_holoscript',
  'compile_to_sdk',
  'compile_fanout',
  'explain_fairness_receipt',
  'generate_world',
  'holo_generate_scene',
  'holo_generate_world',
]);

export async function POST(request: Request) {
  try {
    const body = await request.json();

    if (!body?.tool) {
      return NextResponse.json({ error: 'Missing required field: tool' }, { status: 400 });
    }
    const tool = String(body.tool);

    // Who is calling? Until 2026-09-15 this route answered "nobody in
    // particular" and attached the server key anyway, so any stranger on the
    // internet could spend our mesh identity. src/proxy.ts cannot help: its
    // matcher skips /api entirely.
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const meshKey = callerMeshKey(request);

    if (meshKey) {
      headers[MESH_KEY_HEADER] = meshKey;
    } else {
      const auth = await requireAuth(request);
      if (auth instanceof NextResponse) {
        // Not the bare 401 the guard returns. Six tools on /create reach this
        // route, and that page has no sign-in gate, so a signed-out visitor
        // meets this message rather than a status code: it is the only place
        // they are told what happened and what to do.
        return NextResponse.json(
          {
            error: `Sign in to HoloScript Studio to use this tool. ${OWN_KEY_HINT}`,
            signInRequired: true,
          },
          { status: 401 }
        );
      }

      if (!STUDIO_SESSION_TOOLS.has(tool)) {
        return NextResponse.json(
          {
            error: `Tool "${tool}" is not available to a Studio session. ${OWN_KEY_HINT}`,
            ownKeyRequired: true,
          },
          { status: 403 }
        );
      }

      // Server-only key. NEXT_PUBLIC_* is deliberately not a fallback: Next
      // inlines those into the browser bundle, so one would be readable by
      // every visitor and could never be a server credential.
      const serverKey = process.env.HOLOSCRIPT_API_KEY;
      if (!serverKey) {
        return NextResponse.json(
          { error: 'Studio is not configured to run mesh tools for a signed-in caller.' },
          { status: 503 }
        );
      }
      headers[MESH_KEY_HEADER] = serverKey;
    }

    // The path below is `/call`, and the upstream registers `/tools/call`, not
    // `/call` — so the tool calls routed through this gateway are very likely
    // already dead in production. That is left exactly as it is ON PURPOSE:
    // correcting the path here would turn a dead route into a live
    // tool-execution route inside a security fix. It needs its own change and
    // its own decision.
    const res = await fetch(`${MCP_EXTERNAL_URL}/call`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      const errText = await res.text();
      return NextResponse.json(
        {
          error: `Mesh Orchestrator Error [${res.status}]: ${errText}`,
          offline: res.status >= 500,
        },
        { status: res.status >= 500 ? 502 : res.status }
      );
    }

    const data = await res.json();
    const validationError = validateGeneratedToolPayload(String(body.tool), data);
    if (validationError) return validationError;

    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const isTimeout = message.includes('TimeoutError') || message.includes('aborted');
    const isOffline = message.includes('ECONNREFUSED') || message.includes('fetch');
    return NextResponse.json(
      {
        error: `Failed to contact external MCP service: ${message}`,
        offline: isOffline,
        timeout: isTimeout,
      },
      { status: isOffline ? 503 : isTimeout ? 504 : 500 }
    );
  }
}

function validateGeneratedToolPayload(tool: string, data: unknown): NextResponse | null {
  const codeField = generatedCodeFieldForTool(tool);
  if (!codeField) return null;

  const resultContainer = asRecord(data)?.['result'];
  const payload = asRecord(resultContainer) ?? asRecord(data);
  if (!payload) {
    return NextResponse.json(
      {
        error: `${tool} returned a non-object response for Studio validation`,
        generatedOutputValid: false,
      },
      { status: 422 }
    );
  }

  const code = payload?.[codeField] ?? payload?.['code'] ?? payload?.['holoCode'];

  if (typeof code !== 'string' || code.trim().length === 0) {
    return NextResponse.json(
      {
        error: `${tool} returned no generated HoloScript code for Studio validation`,
        generatedOutputValid: false,
      },
      { status: 422 }
    );
  }

  const validation = validateGeneratedHoloOutput(code);
  if (!validation.valid) {
    return NextResponse.json(
      {
        error: `${tool} generated output failed core validation`,
        generatedOutputValid: false,
        validationErrors: validation.errors,
        ...(validation.warnings.length > 0 && { validationWarnings: validation.warnings }),
      },
      { status: 422 }
    );
  }

  payload['generatedOutputValidation'] = {
    valid: true,
    corePrimitives: validation.corePrimitives,
  };
  return null;
}

function generatedCodeFieldForTool(tool: string): 'code' | 'holoCode' | null {
  if (tool === 'generate_scene' || tool === 'holo_generate_scene') return 'code';
  if (tool === 'generate_world' || tool === 'holo_generate_world') return 'holoCode';
  return null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

/**
 * GET — mesh server inventory.
 *
 * Gated like POST, and it authenticates the SAME caller the POST refusal tells
 * to come back with a key: whichever header they use, the key reaches
 * `/servers` in the form that endpoint reads. It names the registered mesh
 * services and their state, nothing in Studio calls it, and `/api/health` is
 * the public liveness probe, so there is no reason for it to answer a
 * stranger. It never attaches the server key: a caller sees the inventory only
 * under their own key.
 */
export async function GET(request: Request) {
  const meshKey = callerMeshKey(request);
  if (!meshKey) {
    const auth = await requireAuth(request);
    if (auth instanceof NextResponse) {
      return NextResponse.json(
        {
          error: `Sign in to HoloScript Studio to read the mesh inventory. ${OWN_KEY_HINT}`,
          signInRequired: true,
        },
        { status: 401 }
      );
    }
  }

  try {
    const res = await fetch(`${MCP_EXTERNAL_URL}/servers`, {
      headers: meshKey ? { [MESH_KEY_HEADER]: meshKey } : {},
    });
    if (!res.ok) {
      return NextResponse.json(
        { error: `Mesh Orchestrator Error: ${res.status}` },
        { status: res.status }
      );
    }
    const data = await res.json();
    return NextResponse.json({
      service: 'HoloScript MCP API Gateway',
      environment: 'Decoupled',
      orchestrator_status: 'online',
      mesh_servers: data,
    });
  } catch (error) {
    return NextResponse.json({
      service: 'HoloScript MCP API Gateway',
      environment: 'Decoupled',
      orchestrator_status: 'offline',
      error: String(error),
    });
  }
}

export function OPTIONS(request: Request) {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(request, { methods: 'GET, POST, PUT, DELETE, PATCH, OPTIONS' }),
  });
}
