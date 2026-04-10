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
 * @returns Result object with ok flag and data payload
 */
export async function callMcpTool(
  toolName: string,
  args: Record<string, unknown>,
): Promise<{ ok: boolean; data: unknown }> {
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

    if (!res.ok) return { ok: false, data: null };

    const json = await res.json();
    if (json.error) return { ok: false, data: json.error };

    const textContent = json.result?.content?.[0]?.text;
    if (textContent) {
      try {
        return { ok: true, data: JSON.parse(textContent) };
      } catch {
        return { ok: true, data: { text: textContent } };
      }
    }

    return { ok: true, data: json.result };
  } catch {
    return { ok: false, data: null };
  }
}
