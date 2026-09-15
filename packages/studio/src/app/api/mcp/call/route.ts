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
 * The caller's OWN upstream credential, if they sent one. `Authorization:
 * Bearer <key>` and `x-mcp-api-key: <key>` are the two forms the mesh
 * services accept.
 *
 * When the caller sends one, this gateway forwards exactly that and nothing
 * of ours, so whatever they may run, they run as themselves.
 */
function callerCredential(request: Request): Record<string, string> | null {
  const auth = request.headers.get('authorization')?.trim();
  if (auth && /^Bearer\s+\S+/i.test(auth)) return { Authorization: auth };
  const meshKey = request.headers.get('x-mcp-api-key')?.trim();
  if (meshKey) return { 'x-mcp-api-key': meshKey };
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
 *   holomesh_moltbook_crosspost                            create page palette
 *   holomesh_publish_agent_template                        create page palette
 *   generate_world / holo_generate_scene / holo_generate_world
 *                                          this route's own generated-output gate
 *
 * Anything else needs the caller's own key. Keep this list short: each entry
 * is a tool a signed-in stranger may run as our server identity.
 */
const STUDIO_SESSION_TOOLS = new Set<string>([
  'suggest_traits',
  'generate_scene',
  'validate_holoscript',
  'compile_to_sdk',
  'compile_fanout',
  'explain_fairness_receipt',
  'holomesh_moltbook_crosspost',
  'holomesh_publish_agent_template',
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
    const credential = callerCredential(request);

    if (credential) {
      Object.assign(headers, credential);
    } else {
      const auth = await requireAuth(request);
      if (auth instanceof NextResponse) return auth;

      if (!STUDIO_SESSION_TOOLS.has(tool)) {
        return NextResponse.json(
          {
            error: `Tool "${tool}" is not available to a Studio session. Send your own mesh API key as "Authorization: Bearer <key>" to run it as yourself.`,
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
      headers['x-mcp-api-key'] = serverKey;
    }

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
 * Gated like POST. It names the registered mesh services and their state,
 * nothing in Studio calls it, and `/api/health` is the public liveness probe,
 * so there is no reason for it to answer a stranger. It never attaches the
 * server key: a caller sees the inventory only with their own credential.
 */
export async function GET(request: Request) {
  const credential = callerCredential(request);
  if (!credential) {
    const auth = await requireAuth(request);
    if (auth instanceof NextResponse) return auth;
  }

  try {
    const res = await fetch(`${MCP_EXTERNAL_URL}/servers`, {
      headers: { ...(credential ?? {}) },
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
