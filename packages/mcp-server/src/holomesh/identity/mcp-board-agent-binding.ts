/**
 * Bind an MCP board mutation's written agent to the transport-authenticated
 * principal (Slice A of research/2026-07-26_holomesh-mcp-identity-gap.md).
 *
 * The MCP board tools (`board-tools.ts`) historically trust caller-supplied
 * `args.agent_id` (default `'mcp-agent'`), letting an authenticated HTTP caller
 * attribute a board write to any identity. `handleTool` now stamps the verified
 * principal onto `args.__authAgentId` (authoritatively — any caller-supplied value
 * is deleted first; the synthetic stdio `'stdio-local'` bridge is excluded, so the
 * stdio/local path carries NO principal and stays local-trust).
 *
 * Behavior (this resolver):
 *   - No principal (stdio/local): unchanged -> `args.agent_id` or `'mcp-agent'`.
 *   - Principal present, `agent_id` omitted or == principal: attribute to the
 *     principal (fixes the anonymous default for authenticated callers).
 *   - Principal present, `agent_id` != principal: under `HOLOMESH_BOARD_BIND_SIGNER=1`
 *     reject 403 (stops free-form impersonation via the MCP path); flag off preserves
 *     today's behavior. Delegation, like on the REST path, must migrate to the signed
 *     HTTP board API before enforcement is enabled.
 *
 * Note: the principal is only per-seat when the call is signed or uses a per-seat
 * token; under the shared HOLOSCRIPT_API_KEY it is the generic `'legacy-api-key'`,
 * so binding stops spoofing but pins to a generic id until calls are signed.
 */

const AUTH_PRINCIPAL_ARG = '__authAgentId';

const str = (v: unknown): string => (typeof v === 'string' && v.trim() ? v.trim() : '');

export type McpBoardAgent =
  | { ok: true; agentId: string; agentName: string }
  | { ok: false; status: number; error: string };

/** Read the authoritative principal stamped by handleTool (never caller-supplied). */
export function authPrincipal(args: Record<string, unknown>): string {
  return str(args[AUTH_PRINCIPAL_ARG]);
}

export function resolveMcpBoardAgent(args: Record<string, unknown>): McpBoardAgent {
  const principal = authPrincipal(args);
  const argId = str(args.agent_id);
  const argName = str(args.agent_name);

  if (!principal) {
    // stdio / local-trust: no authenticated principal. Unchanged behavior.
    const agentId = argId || 'mcp-agent';
    return { ok: true, agentId, agentName: argName || agentId };
  }

  if (argId && argId !== principal) {
    if (process.env.HOLOMESH_BOARD_BIND_SIGNER === '1') {
      return { ok: false, status: 403, error: 'agent-id-not-bound-to-caller' };
    }
    // Flag off: preserve current behavior (honor caller agent_id) — the impersonation
    // surface this flag closes when enabled.
    return { ok: true, agentId: argId, agentName: argName || argId };
  }

  // agent_id omitted or already equals the principal -> attribute to the principal.
  return { ok: true, agentId: principal, agentName: argName || principal };
}
