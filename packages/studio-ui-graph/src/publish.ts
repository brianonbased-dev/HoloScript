import { readFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { mcpAuthHeadersAsync } from '@holoscript/config';

/**
 * v1.1 — publish the .holo to the production knowledge store so any agent on
 * the mesh can query it via the orchestrator's /knowledge/query endpoint.
 *
 * Default target: the MCP orchestrator's knowledge-store, which already
 * federates across workspaces. We post a single `pattern` entry with the
 * full .holo content as `content` and structured metadata for filtering.
 *
 * Auth (OAuth 2.1 preferred):
 *   When HOLOSCRIPT_MCP_CLIENT_ID + HOLOSCRIPT_MCP_CLIENT_SECRET are set,
 *   issues a client_credentials bearer token and sends
 *   `Authorization: Bearer <token>`. Falls back to the legacy
 *   `x-mcp-api-key` header (HOLOSCRIPT_API_KEY / MCP_API_KEY) when
 *   OAuth credentials are absent. Explicit --api-key overrides both.
 *
 * After publish, agents can ask:
 *   POST /knowledge/query  { "search": "Studio pages using SceneStore" }
 *   POST /knowledge/query  { "search": "shared_component", "type": "pattern" }
 *   POST /knowledge/query  { "search": "@route('/create')" }
 *
 * The entry is keyed by id `studio-ui-graph` so subsequent publishes
 * upsert in place (the orchestrator's sync semantics dedupe on id).
 */

export interface PublishOptions {
  /** Path to the .holo artifact to publish. */
  holoPath: string;
  /** Knowledge-store sync URL. Default: production MCP orchestrator. */
  endpoint?: string;
  /** Workspace id under which the entry lives. Default: 'ai-ecosystem'. */
  workspaceId?: string;
  /**
   * Explicit auth key override. When set, sends the legacy x-mcp-api-key
   * header instead of negotiating OAuth 2.1 bearer.
   * @deprecated Prefer environment-level OAuth credentials.
   */
  apiKey?: string;
  /** Don't actually POST — just print the payload that would be sent. */
  dryRun?: boolean;
  /** Override the entry id. Default: 'studio-ui-graph'. */
  entryId?: string;
}

export interface PublishResult {
  ok: boolean;
  status: number;
  entryId: string;
  contentBytes: number;
  contentSha256: string;
  endpoint: string;
  responseBody: string;
}

const DEFAULT_ENDPOINT = 'https://mcp-orchestrator-production-45f9.up.railway.app/knowledge/sync';
const DEFAULT_WORKSPACE = 'ai-ecosystem';
const DEFAULT_ENTRY_ID = 'studio-ui-graph';

export async function publishHolo(opts: PublishOptions): Promise<PublishResult> {
  const endpoint = opts.endpoint ?? DEFAULT_ENDPOINT;
  const workspaceId = opts.workspaceId ?? DEFAULT_WORKSPACE;
  const entryId = opts.entryId ?? DEFAULT_ENTRY_ID;

  const content = readFileSync(opts.holoPath, 'utf8');
  const sha = createHash('sha256').update(content).digest('hex').slice(0, 16);
  const stats = statSync(opts.holoPath);

  // Parse summary stats out of the .holo header so the metadata reflects
  // the actual graph state (rather than getting stale).
  const pageCountMatch = /\/\/ pages:\s*(\d+)/.exec(content);
  const componentCountMatch = /\/\/ unique components:\s*(\d+)/.exec(content);
  const generatedAtMatch = /\/\/ generated:\s*(.+)/.exec(content);

  const payload = {
    workspace_id: workspaceId,
    entries: [
      {
        id: entryId,
        workspace_id: workspaceId,
        type: 'pattern' as const,
        domain: 'studio-ui',
        content,
        confidence: 0.95,
        metadata: {
          title: 'Studio UI Graph (auto-generated)',
          source: 'studio-ui-graph CLI',
          page_count: pageCountMatch ? Number(pageCountMatch[1]) : undefined,
          unique_component_count: componentCountMatch ? Number(componentCountMatch[1]) : undefined,
          generated_at: generatedAtMatch ? generatedAtMatch[1].trim() : undefined,
          file_path: opts.holoPath,
          file_bytes: stats.size,
          content_sha256_prefix: sha,
        },
      },
    ],
  };

  if (opts.dryRun) {
    return {
      ok: true,
      status: 0,
      entryId,
      contentBytes: content.length,
      contentSha256: sha,
      endpoint,
      responseBody: JSON.stringify(
        {
          dryRun: true,
          would_post_to: endpoint,
          payload_size_bytes: JSON.stringify(payload).length,
        },
        null,
        2
      ),
    };
  }

  // Resolve auth headers.
  // Priority: explicit --api-key override > OAuth 2.1 client_credentials > legacy env key.
  let authHeaders: Record<string, string>;
  if (opts.apiKey) {
    // Explicit CLI override — use legacy header directly.
    authHeaders = { 'x-mcp-api-key': opts.apiKey };
  } else {
    // mcpAuthHeadersAsync: issues OAuth bearer when HOLOSCRIPT_MCP_CLIENT_ID +
    // HOLOSCRIPT_MCP_CLIENT_SECRET are configured; falls back to x-mcp-api-key
    // (HOLOSCRIPT_API_KEY / MCP_API_KEY) when they are absent.
    authHeaders = await mcpAuthHeadersAsync();
    // Guard: neither OAuth nor legacy key available.
    const hasAuth =
      'Authorization' in authHeaders ||
      ('x-mcp-api-key' in authHeaders && (authHeaders['x-mcp-api-key'] || '').length > 0);
    if (!hasAuth) {
      throw new Error(
        'publishHolo: no auth credentials — set HOLOSCRIPT_MCP_CLIENT_ID + ' +
          'HOLOSCRIPT_MCP_CLIENT_SECRET for OAuth, or HOLOSCRIPT_API_KEY for legacy key auth, ' +
          'or pass --api-key'
      );
    }
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders,
    },
    body: JSON.stringify(payload),
  });
  const responseBody = await response.text();

  return {
    ok: response.ok,
    status: response.status,
    entryId,
    contentBytes: content.length,
    contentSha256: sha,
    endpoint,
    responseBody,
  };
}
