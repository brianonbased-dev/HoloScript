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
export async function callMcpTool(
  toolName: string,
  args: Record<string, unknown>,
): Promise<{ ok: boolean; data: unknown; error?: string }> {
  try {
    const res = await fetch(`${ABSORB_BASE}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
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
      return { ok: false, data: null, error };
    }

    const json = await res.json();
    if (json.error) {
      const error = `MCP ${toolName} error: ${
        typeof json.error?.message === 'string' ? json.error.message : JSON.stringify(json.error)
      }`;
      console.error(`[absorb-client] ${error}`);
      return { ok: false, data: json.error, error };
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
    return { ok: false, data: null, error };
  }
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
