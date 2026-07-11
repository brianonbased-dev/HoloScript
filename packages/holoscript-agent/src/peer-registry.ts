/**
 * Peer registry — dynamic capability→node resolution for `ask_peer` / `council`
 * (D.100 Axis-2: "can delegate, can't find WHOM"). A brain authors the CAPABILITY
 * it needs (`ask_peer { capability: "hardware" }`); the agent resolves which
 * sovereign node provides it at call time — the peer endpoint is never hardcoded in
 * the brain. The registry is a list of peers (handle, baseUrl, model, capabilities)
 * supplied via HOLOSCRIPT_AGENT_PEER_REGISTRY (inline JSON or a file path); the
 * .ai-ecosystem side can generate it from config/sovereign-devices/*.json, but this
 * module only consumes a parsed list — provider-free, fs-free, so the edge package
 * keeps its clean publish closure (the runner does the env/file read).
 *
 * @module holoscript-agent/peer-registry
 */

export interface PeerEntry {
  /** Display handle for the peer (used as the honest "who answered" label). */
  handle?: string;
  /** LLM endpoint base URL (e.g. http://laptop.local:11434) — required to route. */
  baseUrl: string;
  /** Model id to request on that node. Falls back to the caller's default. */
  model?: string;
  /** Capabilities this peer offers — matched against an ask_peer/council request. */
  capabilities?: string[];
}

/** Parse a peer registry from a JSON string. Returns [] on any malformation. */
export function parsePeerRegistry(raw: string | undefined): PeerEntry[] {
  if (!raw || !raw.trim()) return [];
  try {
    const v = JSON.parse(raw) as unknown;
    if (!Array.isArray(v)) return [];
    return v.filter(
      (e): e is PeerEntry =>
        !!e && typeof e === 'object' && typeof (e as PeerEntry).baseUrl === 'string'
    );
  } catch {
    return [];
  }
}

/**
 * Resolve a peer for a request. Capability-filtered when given; round-robined by
 * `seat` so a council's N seats spread across the matching peers (genuinely
 * different nodes when more than one provides the capability). Returns null when
 * nothing matches — the caller then falls back to HOLOSCRIPT_AGENT_PEER_BASE_URL,
 * then to self-consult.
 *
 * Capability semantics: when a capability is requested but NO peer offers it,
 * returns null (don't route a "hardware" question to an unrelated peer — fail to
 * the fallback chain instead). When no capability is requested, any peer is a
 * candidate (used for capability-agnostic council diversity).
 */
export function resolvePeer(
  registry: PeerEntry[],
  opts: { capability?: string; seat?: number } = {}
): PeerEntry | null {
  if (registry.length === 0) return null;

  let candidates = registry;
  if (opts.capability) {
    const cap = opts.capability.toLowerCase();
    candidates = registry.filter((e) => (e.capabilities ?? []).some((c) => c.toLowerCase() === cap));
    if (candidates.length === 0) return null; // requested capability unavailable
  }

  const n = candidates.length;
  const idx = (((opts.seat ?? 0) % n) + n) % n; // safe positive modulo
  return candidates[idx];
}
