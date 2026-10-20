/**
 * Shared Absorb MCP client
 *
 * Consolidates Absorb service configuration and MCP tool calling logic.
 * Used by all routes that need to invoke Absorb tools.
 */

import { ENDPOINTS, getAbsorbKey, getMcpApiKey } from '@holoscript/config';

export const MCP_SERVER_URL = ENDPOINTS.HOLOSCRIPT_MCP;
export const ABSORB_BASE = ENDPOINTS.ABSORB_SERVICE;
export const ABSORB_API_KEY = getAbsorbKey() || getMcpApiKey() || '';

/**
 * Call an MCP tool via the Absorb service.
 *
 * @param toolName - Name of the MCP tool to invoke
 * @param args - Tool arguments
 * @returns Result object with ok flag and data payload. When ok is false,
 *   `error` carries the real reason (HTTP status + body, JSON-RPC error, or
 *   the thrown error) so callers can report it instead of a generic failure.
 */
/**
 * Why an MCP call failed, as far as the caller can tell.
 * - refused:  the connection was refused; the request never reached the tool.
 * - http_4xx: the MCP endpoint rejected the request (auth, Accept, bad args)
 *             before the tool ran.
 * - http_5xx / timeout / rpc_error / network: the request was sent and the
 *             tool may have run (and charged). Callers must not retry these
 *             on another paid path.
 */
export type McpFailure = 'refused' | 'http_4xx' | 'http_5xx' | 'timeout' | 'rpc_error' | 'network';

export interface McpToolResult {
  ok: boolean;
  data: unknown;
  error?: string;
  failure?: McpFailure;
}

/** True only when the MCP tool clearly did not run: connection refused or a 4xx. */
export function mcpClearlyDidNotRun(result: McpToolResult): boolean {
  return !result.ok && (result.failure === 'refused' || result.failure === 'http_4xx');
}

function classifyThrown(err: unknown): McpFailure {
  const name = (err as { name?: unknown } | null)?.name;
  if (name === 'TimeoutError' || name === 'AbortError') return 'timeout';
  const code =
    (err as { cause?: { code?: unknown } } | null)?.cause?.code ??
    (err as { code?: unknown } | null)?.code;
  if (code === 'ECONNREFUSED') return 'refused';
  return 'network';
}

export async function callMcpTool(
  toolName: string,
  args: Record<string, unknown>
): Promise<McpToolResult> {
  try {
    const res = await fetch(`${ABSORB_BASE}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // The absorb MCP endpoint is a Streamable HTTP transport: it answers
        // 406 unless the client accepts both JSON and SSE (prod 2026-10-14).
        Accept: 'application/json, text/event-stream',
        Authorization: `Bearer ${ABSORB_API_KEY}`,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: Date.now(),
        method: 'tools/call',
        params: { name: toolName, arguments: args },
      }),
      signal: AbortSignal.timeout(60000), // Absorb can take a while
    });

    if (!res.ok) {
      const text = await res.text().catch((err: unknown) => `(body unreadable: ${errorText(err)})`);
      const error = `MCP ${toolName} HTTP ${res.status}${res.statusText ? ` ${res.statusText}` : ''}: ${text.slice(0, 300)}`;
      console.error(`[absorb-client] ${error}`);
      const failure: McpFailure = res.status >= 400 && res.status < 500 ? 'http_4xx' : 'http_5xx';
      return { ok: false, data: null, error, failure };
    }

    const json = await res.json();
    if (json.error) {
      const error = `MCP ${toolName} error: ${
        typeof json.error?.message === 'string' ? json.error.message : JSON.stringify(json.error)
      }`;
      console.error(`[absorb-client] ${error}`);
      return { ok: false, data: json.error, error, failure: 'rpc_error' };
    }

    const textContent = json.result?.content?.[0]?.text;
    if (textContent) {
      try {
        return { ok: true, data: JSON.parse(textContent) };
      } catch {
        // Not JSON: the tool answered in plain text, which is still its answer.
        return { ok: true, data: { text: textContent } };
      }
    }

    return { ok: true, data: json.result };
  } catch (err: unknown) {
    const error = `MCP ${toolName} request failed: ${errorText(err)}`;
    console.error(`[absorb-client] ${error}`);
    return { ok: false, data: null, error, failure: classifyThrown(err) };
  }
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
