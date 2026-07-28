/**
 * HoloShell prod-cache reader (stage-1 of the Operations data design).
 *
 * The local operate-room server publishes its machine-state snapshot — with a
 * `holoshell` bundle (stale processes, pending consents, execution history) —
 * to the MCP server's seat-keyed cache every 2 min (10-min TTL). Reading that
 * cache makes every Operations card work from ANY Studio deployment; the
 * direct local proxy (resolveHoloShellApiUrl) remains the same-machine
 * fallback with fresher data.
 */

const MCP_BASE = (
  process.env.MCP_HOLOSCRIPT_URL ||
  process.env.MCP_SERVER_URL ||
  'https://mcp.holoscript.net'
).replace(/\/$/, '');

const MCP_KEY = process.env.HOLOSCRIPT_API_KEY || process.env.HOLOMESH_API_KEY || '';

const SEAT_ID =
  process.env.HOLOSHELL_SEAT_ID || process.env.HOLOMESH_AGENT_SURFACE || 'local-win-x64';

export interface HoloShellProdBundle {
  staleProcesses?: unknown[];
  pendingConsents?: unknown[];
  executionHistory?: unknown[];
  automations?: unknown[];
  automationSummary?: unknown;
}

export interface HoloShellProdCacheResult {
  bundle: HoloShellProdBundle;
  publishedAt?: string;
}

/** Returns the published holoshell bundle, or null when unavailable/expired. */
export async function readHoloShellProdBundle(): Promise<HoloShellProdCacheResult | null> {
  if (!MCP_KEY) return null;
  try {
    const r = await fetch(`${MCP_BASE}/api/holomesh/machine-state/${encodeURIComponent(SEAT_ID)}`, {
      cache: 'no-store',
      headers: { 'x-mcp-api-key': MCP_KEY, Authorization: `Bearer ${MCP_KEY}` },
      signal: AbortSignal.timeout(8_000),
    });
    if (!r.ok) return null;
    const j = (await r.json()) as {
      snapshot?: { holoshell?: HoloShellProdBundle };
      publishedAt?: string;
    };
    const bundle = j.snapshot?.holoshell;
    if (!bundle || typeof bundle !== 'object') return null;
    return { bundle, publishedAt: j.publishedAt };
  } catch {
    return null;
  }
}
