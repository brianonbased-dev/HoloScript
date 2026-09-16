/**
 * Resolve the agent identity a request has PROVEN it owns.
 *
 * `POST /oauth/register` is open to anyone, and `client_secret` proves only
 * WHICH CLIENT is calling — neither can establish which AGENT the caller is. A
 * key from the HoloMesh key registry can: keys are issued per agent and resolve
 * to exactly one agentId. Returns undefined when no live agent key is
 * presented, which makes every unproven `agent_id` request fail closed.
 *
 * This lives in its own module on purpose. It is the verifier the whole
 * agent_id binding rests on, and `http-server.ts` builds an HTTP server and
 * listens at import time, so a copy that lived there could not be tested
 * without booting a server — which is how it shipped with no test at all.
 *
 * Accepted headers, and why these:
 *   - `x-agent-key`     — the agent-scoped key the daemon presents.
 *   - `x-mcp-api-key`   — the orchestrator convention, and the per-agent header
 *                         `resolveRequestingAgent` already treats as identity.
 *   - `Authorization: Bearer <key>` — the HTTP-standard spelling of the same
 *                         per-agent key. Accepted so an agent using the
 *                         documented primary convention is not silently
 *                         refused its own agent_id. A Bearer OAuth ACCESS token
 *                         is not in the key registry, so it proves nothing here
 *                         and simply falls through.
 *
 * `x-api-key` is deliberately NOT accepted. That header carries the SHARED
 * legacy key (`HOLOSCRIPT_API_KEY`), which every legacy caller holds in common.
 * Because that same variable is also seeded into the key registry on first
 * boot, accepting it here would let any holder of the shared key upgrade it
 * into a proven, per-agent identity — the opposite of what proving means.
 */
import type { IncomingHttpHeaders } from 'http';
import { keyRegistry } from '../holomesh/state';

/** Per-agent key headers, in resolution order. */
export const PROVEN_AGENT_KEY_HEADERS = ['x-agent-key', 'x-mcp-api-key'] as const;

function firstHeaderValue(value: string | string[] | undefined): string {
  if (typeof value === 'string') return value.trim();
  if (Array.isArray(value)) return (value[0] || '').trim();
  return '';
}

/** The agent a live registry key belongs to, or undefined if it proves nothing. */
function agentIdForKey(presented: string): string | undefined {
  if (!presented) return undefined;
  const record = keyRegistry.get(presented);
  if (!record) return undefined;
  if (record.expiresAt && new Date(record.expiresAt) < new Date()) return undefined;
  return record.agentId || undefined;
}

export function resolveProvenAgentId(headers: IncomingHttpHeaders): string | undefined {
  for (const headerName of PROVEN_AGENT_KEY_HEADERS) {
    const proven = agentIdForKey(firstHeaderValue(headers[headerName]));
    if (proven) return proven;
  }

  const authorization = firstHeaderValue(headers['authorization']);
  if (authorization.startsWith('Bearer ')) {
    const proven = agentIdForKey(authorization.slice(7).trim());
    if (proven) return proven;
  }

  return undefined;
}
