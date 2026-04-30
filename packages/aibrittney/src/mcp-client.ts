/**
 * Minimal client for the MCP orchestrator's /tools/call endpoint.
 *
 * v0.2 dispatches every tool through the orchestrator rather than reaching
 * each MCP server directly — that gives us one auth header, one error shape,
 * and lets the orchestrator route to whichever server actually owns the tool
 * (holoscript-tools, absorb, knowledge-store, etc).
 */

export interface CallToolArgs {
  server: string;
  tool: string;
  args: Record<string, unknown>;
}

export interface CallToolResult {
  ok: boolean;
  status: number;
  data: unknown;
  error?: string;
}

export interface McpClientConfig {
  endpoint: string;
  apiKey: string;
  timeoutMs: number;
  fetchImpl?: typeof fetch;
}

export const DEFAULT_ENDPOINT = 'https://mcp-orchestrator-production-45f9.up.railway.app';

export function defaultMcpConfig(overrides: Partial<McpClientConfig> = {}): McpClientConfig {
  const endpoint = overrides.endpoint ?? process.env.MCP_ORCHESTRATOR_URL ?? DEFAULT_ENDPOINT;
  const apiKey =
    overrides.apiKey ??
    process.env.HOLOSCRIPT_API_KEY ??
    process.env.MCP_API_KEY ??
    '';
  return {
    endpoint,
    apiKey,
    timeoutMs: overrides.timeoutMs ?? 60_000,
    fetchImpl: overrides.fetchImpl,
  };
}

export class McpClient {
  constructor(readonly config: McpClientConfig) {}

  async callTool({ server, tool, args }: CallToolArgs): Promise<CallToolResult> {
    if (!this.config.apiKey) {
      return {
        ok: false,
        status: 0,
        data: null,
        error: 'mcp-client: missing HOLOSCRIPT_API_KEY (or MCP_API_KEY) — tool calls disabled',
      };
    }
    const url = `${this.config.endpoint.replace(/\/$/, '')}/tools/call`;
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), this.config.timeoutMs);
    const fetchFn = this.config.fetchImpl ?? fetch;
    try {
      const res = await fetchFn(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-mcp-api-key': this.config.apiKey,
        },
        body: JSON.stringify({ server, tool, args }),
        signal: ac.signal,
      });
      const text = await res.text();
      let data: unknown = text;
      try {
        data = JSON.parse(text);
      } catch {
        // leave as text
      }
      if (!res.ok) {
        return {
          ok: false,
          status: res.status,
          data,
          error: `HTTP ${res.status} ${res.statusText}`,
        };
      }
      return { ok: true, status: res.status, data };
    } catch (err) {
      const e = err as Error & { name?: string };
      return {
        ok: false,
        status: 0,
        data: null,
        error: e.name === 'AbortError' ? `tool call timed out after ${this.config.timeoutMs}ms` : e.message,
      };
    } finally {
      clearTimeout(timer);
    }
  }
}
