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
 * - http_4xx: a CLEAN refusal before any charge: 400/422 validation, 401/403
 *             auth, 402 payment. Only these statuses (Treasurer's rule).
 * - http_4xx_unclear: any other 4xx (404, 405, 406, 408, 409, 429, ...). It
 *             does not prove the tool never ran, so it is treated as
 *             'may have run' and is never retried on another paid path.
 * - http_5xx / timeout / rpc_error / network: the request was sent and the
 *             tool may have run (and charged). Callers must not retry these
 *             on another paid path.
 * - tool_error: the tool ran and answered with `{ error }` (or isError). It
 *             ran, so this is never retried on another path either.
 */
export type McpFailure =
  | 'refused'
  | 'http_4xx'
  | 'http_4xx_unclear'
  | 'http_5xx'
  | 'timeout'
  | 'rpc_error'
  | 'tool_error'
  | 'network';

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

/**
 * 4xx statuses that are a clean refusal before any charge (Treasurer's rule):
 * validation 400/422, auth 401/403, payment 402. Nothing else falls back.
 */
export const CLEAN_REFUSAL_STATUSES: ReadonlySet<number> = new Set([400, 401, 402, 403, 422]);

/**
 * Error codes that prove the request never left this host: the connection was
 * refused, or the host name never resolved. A reset, a timeout or any other
 * error after connecting may mean the tool ran.
 */
const NOTHING_SENT_CODES: ReadonlySet<string> = new Set(['ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN']);

function classifyThrown(err: unknown): McpFailure {
  const name = (err as { name?: unknown } | null)?.name;
  if (name === 'TimeoutError' || name === 'AbortError') return 'timeout';
  const code =
    (err as { cause?: { code?: unknown } } | null)?.cause?.code ??
    (err as { code?: unknown } | null)?.code;
  if (typeof code === 'string' && NOTHING_SENT_CODES.has(code)) return 'refused';
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
      const failure: McpFailure = CLEAN_REFUSAL_STATUSES.has(res.status)
        ? 'http_4xx'
        : res.status >= 400 && res.status < 500
          ? 'http_4xx_unclear'
          : 'http_5xx';
      return { ok: false, data: null, error, failure };
    }

    // A reset, an aborted or truncated stream, or an unparseable body throws
    // here AFTER the request was sent: classified as 'network' (may have run).
    const json = await res.json();
    if (json.error) {
      const error = `MCP ${toolName} error: ${
        typeof json.error?.message === 'string' ? json.error.message : JSON.stringify(json.error)
      }`;
      console.error(`[absorb-client] ${error}`);
      return { ok: false, data: json.error, error, failure: 'rpc_error' };
    }

    const textContent = json.result?.content?.[0]?.text;
    let data: unknown = json.result;
    if (textContent) {
      try {
        data = JSON.parse(textContent);
      } catch {
        // Not JSON: the tool answered in plain text, which is still its answer.
        data = { text: textContent };
      }
    }

    // A tool that answers `{ error }` (absorb's handlers report every failure
    // this way) or flags isError has failed, even though HTTP said 200.
    const toolError = toolErrorText(data, json.result?.isError === true ? textContent : undefined);
    if (toolError !== null) {
      const error = `MCP ${toolName} tool error: ${toolError}`;
      console.error(`[absorb-client] ${error}`);
      return { ok: false, data, error, failure: 'tool_error' };
    }

    return { ok: true, data };
  } catch (err: unknown) {
    const error = `MCP ${toolName} request failed: ${errorText(err)}`;
    console.error(`[absorb-client] ${error}`);
    return { ok: false, data: null, error, failure: classifyThrown(err) };
  }
}

/** The tool's own error text, or null when the answer is not an error. */
function toolErrorText(data: unknown, isErrorText: string | undefined): string | null {
  if (isErrorText !== undefined) return isErrorText || 'isError with no text';
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return null;
  const err = (data as { error?: unknown }).error;
  if (err === undefined || err === null || err === false || err === '') return null;
  return typeof err === 'string' ? err : JSON.stringify(err);
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
