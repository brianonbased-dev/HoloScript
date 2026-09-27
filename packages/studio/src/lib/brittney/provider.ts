/**
 * Brittney Provider Resolution — native-default (local sovereign), hosted bridge, gated BYOK.
 *
 * NOTE (2026-06-10): this policy is now CANONICAL in
 * @holoscript/llm-provider `resolveSovereignProviderAsync` (sovereign-resolver.ts),
 * shared by the HoloClaw daemon and the fleet supervisor. This file predates it
 * and keeps Brittney-specific extras (per-user BYOK vault keys, tier/lane);
 * converge it onto the shared resolver when touching this surface next.
 *
 * Founder directive (2026-06-05): Brittney's LLM deps are NATIVE by default. The
 * ecosystem's own AI runs on sovereign local serving — a local Ollama or the owned
 * fleet — NOT a third-party frontier API. BRITTNEY_SERVICE_URL (and the llm-provider
 * alias HOLO_LLM_SERVICE_URL) is a hosted bridge: the Brittney llm-service forwards
 * brittney-standard to Fireworks, with Together as fallback. It is not sovereign.
 * A frontier API (Anthropic) is BYOK: explicit provider name, or the auto path only
 * when HOLO_ALLOW_FRONTIER_FALLBACK=1. Other agent families bring their own keys.
 * Extends P.009 (sovereign embeddings) to the chat LLM.
 *
 * Auto-detect priority (no explicit BRITTNEY_PROVIDER):
 *   1. BRITTNEY_SERVICE_URL present → cloud   (hosted bridge — Fireworks/Together, NOT sovereign)
 *   2. OLLAMA_HOST present          → ollama  (sovereign local — Quest 3 / downloaded apps)
 *   3. ANTHROPIC_API_KEY present    → anthropic only if HOLO_ALLOW_FRONTIER_FALLBACK=1, else refuse
 *   4. Error
 *
 * Explicit BRITTNEY_PROVIDER=anthropic|ollama|cloud always wins (BYOK / pinned override).
 *
 * The resolved provider exposes `streamCompletion()` from
 * @holoscript/llm-provider — a provider-agnostic async iterable of
 * LLMStreamChunk events that the Brittney route consumes identically
 * regardless of backend.
 */

import {
  AnthropicAdapter,
  LocalLLMAdapter,
  BrittneyCloudAdapter,
  OpenAICompatibleAdapter,
  VastServerlessAdapter,
  pickLocalModel,
  OLLAMA_DEFAULT_BASE_URL,
  FLEET_DEFAULT_MODEL,
  LOCAL_DEFAULT_MODEL,
  gateFrontierFallback,
  type ILLMProvider,
} from '@holoscript/llm-provider';

export type BrittneyProviderName = 'anthropic' | 'ollama' | 'cloud' | 'fleet' | 'serverless';

/**
 * Per-user BYOK keys resolved server-side from the HoloKey vault (F.112). When present,
 * they OVERRIDE the shared env keys so a user's own credential — not a global founder key —
 * backs their session. Absent/null fields fall back to env, so behaviour is unchanged when
 * a user has stored nothing (or the vault is unconfigured).
 */
export interface BrittneyByokKeys {
  /** The user's own Anthropic key (vault:ANTHROPIC_API_KEY). Overrides ANTHROPIC_API_KEY. */
  anthropicKey?: string | null;
}

export interface ResolvedBrittneyProvider {
  /** The unified provider (Anthropic, Ollama, or Brittney Cloud). */
  provider: ILLMProvider;
  /** The model string to pass to streamCompletion(). */
  model: string;
  /** Max tokens for this provider. Anthropic = 16K, Ollama = 4-8K, Cloud = 8K. */
  maxTokens: number;
  /** Which provider was resolved (for logging/response headers). */
  providerName: BrittneyProviderName;
  /**
   * True when the auto path used Anthropic because HOLO_ALLOW_FRONTIER_FALLBACK=1.
   * Explicit BRITTNEY_PROVIDER=anthropic does not set this.
   */
  frontierFallback?: boolean;
}

/**
 * Default Ollama model for Brittney. qwen3.5 replaces qwen2.5-coder
 * (2026-06-10, founder): the older family cannot emit NATIVE tool calls via
 * Ollama — it writes the call JSON as text (the tend_garden stall and the
 * zero-objects fable5 benchmark cells). Matches BRITTNEY_SOVEREIGN_DEFAULT_MODEL
 * in SovereignGeneratorAdapter. Override with BRITTNEY_MODEL env var.
 */
const OLLAMA_DEFAULT_MODEL = process.env.BRITTNEY_MODEL || LOCAL_DEFAULT_MODEL;

/**
 * Resolve Brittney's LLM provider from environment variables.
 *
 * Priority (native-default — see file header for the founder directive):
 *   1. BRITTNEY_PROVIDER=anthropic|ollama|cloud (explicit override / BYOK)
 *   2. BRITTNEY_SERVICE_URL present → cloud   (hosted bridge — Fireworks/Together, not sovereign)
 *   3. OLLAMA_HOST present → ollama           (sovereign on-device)
 *   4. ANTHROPIC_API_KEY present → anthropic  (only with HOLO_ALLOW_FRONTIER_FALLBACK=1)
 *   5. Error — no provider configured
 *
 * Ollama host defaults:
 *   - OLLAMA_HOST env (full URL, e.g. http://host.docker.internal:11434)
 *   - OLLAMA_BASE_URL env (alternative key)
 *   - the Ollama default port (resolved inside resolveOllama)
 */
export function resolveBrittneyProvider(byok?: BrittneyByokKeys): ResolvedBrittneyProvider {
  const explicit = process.env.BRITTNEY_PROVIDER as BrittneyProviderName | undefined;

  // Per-user BYOK key (resolved from the HoloKey vault) OVERRIDES the shared env key. F.112.
  const anthropicKey = byok?.anthropicKey || process.env.ANTHROPIC_API_KEY;
  const ollamaHost = process.env.OLLAMA_HOST || process.env.OLLAMA_BASE_URL;
  const cloudUrl = process.env.BRITTNEY_SERVICE_URL;

  // Explicit override always wins (BYOK / pinned provider).
  if (explicit === 'ollama') {
    return resolveOllama(ollamaHost);
  }
  if (explicit === 'anthropic') {
    return resolveAnthropic(anthropicKey);
  }
  if (explicit === 'cloud') {
    return resolveCloud(cloudUrl);
  }

  // Auto-detect: hosted bridge (cloud) and sovereign local (ollama) before frontier.
  // Anthropic on this path is refused unless HOLO_ALLOW_FRONTIER_FALLBACK=1.
  // Explicit BRITTNEY_PROVIDER=anthropic above is the opt-in and is not gated.
  if (cloudUrl) {
    return resolveCloud(cloudUrl);
  }
  if (ollamaHost) {
    return resolveOllama(ollamaHost);
  }
  if (anthropicKey) {
    return gateFrontierFallback('anthropic', { caller: 'resolveBrittneyProvider' }, () =>
      resolveAnthropic(anthropicKey)
    );
  }

  throw new Error(
    'No Brittney provider configured. Brittney runs native by default — set ' +
      'BRITTNEY_PROVIDER=ollama (with OLLAMA_HOST) for sovereign local inference, or ' +
      'BRITTNEY_PROVIDER=cloud (with BRITTNEY_SERVICE_URL). That URL is a hosted bridge: ' +
      'it forwards to Fireworks/Together and is not sovereign (same family as ' +
      'HOLO_LLM_SERVICE_URL). For a BYOK frontier provider, set ' +
      'BRITTNEY_PROVIDER=anthropic (with ANTHROPIC_API_KEY). The auto path will not use ' +
      'Anthropic unless HOLO_ALLOW_FRONTIER_FALLBACK=1. Downloaded apps configure ' +
      'OLLAMA_HOST to the on-device Brittney model.'
  );
}

function resolveAnthropic(apiKey: string | undefined): ResolvedBrittneyProvider {
  if (!apiKey) {
    throw new Error(
      'BRITTNEY_PROVIDER=anthropic requires ANTHROPIC_API_KEY. ' +
        'Set ANTHROPIC_API_KEY or switch to BRITTNEY_PROVIDER=cloud or BRITTNEY_PROVIDER=ollama.'
    );
  }
  const provider = new AnthropicAdapter({
    apiKey,
    enablePromptCaching: true,
  });
  return {
    provider,
    model: process.env.BRITTNEY_MODEL || 'claude-opus-4-7',
    maxTokens: 16000,
    providerName: 'anthropic',
  };
}

/**
 * Brittney cloud route. BRITTNEY_SERVICE_URL / HOLO_LLM_SERVICE_URL reach the
 * llm-service, whose brittney-standard lane forwards to hosted Fireworks (Together
 * fallback). This is a hosted bridge, not sovereign serving. Explicit
 * BRITTNEY_PROVIDER=cloud is the opt-in for this route.
 */
function resolveCloud(baseURL: string | undefined): ResolvedBrittneyProvider {
  if (!baseURL) {
    throw new Error(
      'BRITTNEY_PROVIDER=cloud requires BRITTNEY_SERVICE_URL. ' +
        'Set BRITTNEY_SERVICE_URL or switch to another provider.'
    );
  }
  const apiKey = process.env.BRITTNEY_API_KEY ?? '';
  // Both stay UNSET when the env doesn't pin them: an unpinned tier lets the
  // service promote explicit vision/reasoning lanes to pro, and an unset lane
  // lets the service's heuristic lane detection run (task-type modulation).
  const tier = process.env.BRITTNEY_TIER as 'standard' | 'pro' | undefined;
  const lane = process.env.BRITTNEY_LANE as
    'operator' | 'code' | 'vision' | 'reasoning' | undefined;
  const provider = new BrittneyCloudAdapter({
    baseURL,
    apiKey,
    ...(tier ? { tier } : {}),
    ...(lane ? { lane } : {}),
  });
  return {
    provider,
    model: process.env.BRITTNEY_MODEL || 'brittney-standard',
    maxTokens: 8192,
    providerName: 'cloud',
  };
}

function resolveOllama(host: string | undefined): ResolvedBrittneyProvider {
  const baseURL = host || OLLAMA_DEFAULT_BASE_URL;
  const provider = new LocalLLMAdapter({
    baseURL,
    model: process.env.BRITTNEY_MODEL || OLLAMA_DEFAULT_MODEL,
    // Known-Ollama site — pin the native protocol; the :11434 port heuristic
    // misses custom-port Ollama and streaming would fall to the /v1 shim.
    nativeOllamaApi: true,
    timeoutMs: 300_000, // 5 min — matches Anthropic adapter
  });
  return {
    provider,
    model: process.env.BRITTNEY_MODEL || OLLAMA_DEFAULT_MODEL,
    // Local models have smaller context windows. 4K is safe for 7B-class;
    // 8K for larger models. Override via BRITTNEY_MAX_TOKENS if needed.
    maxTokens: Number(process.env.BRITTNEY_MAX_TOKENS) || 4096,
    providerName: 'ollama',
  };
}

// ── fleet (sovereign serving, dynamic-resolve) ────────────────────────────────

const FLEET_DEFAULT_ORCH = 'https://mcp-orchestrator-production-45f9.up.railway.app';

/**
 * Resolve Brittney against the sovereign serving fleet (P.008) — the MOST native
 * backend. The serving box's IP:port is EPHEMERAL across scale-to-zero, so we resolve
 * the current warm URL from the orchestrator's `/serve/resolve` registry PER REQUEST
 * (the GET also bumps demand → the autoscaler keeps/warms a box). When warm, we speak
 * to the box's OpenAI-compatible `/v1` with the shared `FLEET_INFERENCE_KEY` bearer.
 *
 * On COLD (scale-to-zero idle, the normal first-request state): the resolve has already
 * bumped demand so a box warms for next time; this call throws, and
 * `resolveBrittneyProviderAsync` falls back to a sync provider (BYOK Anthropic / local
 * Ollama) for THIS request — so scale-to-zero never 502s.
 *
 * Env: BRITTNEY_FLEET_ORCH_URL (or MCP_ORCHESTRATOR_URL), BRITTNEY_FLEET_MODEL,
 * FLEET_INFERENCE_KEY (= the box's SERVE_API_KEY), BRITTNEY_FLEET_RESOLVE_KEY (or
 * HOLOSCRIPT_API_KEY) for the `/serve/resolve` x-mcp-api-key.
 */
async function resolveFleet(): Promise<ResolvedBrittneyProvider> {
  const orch = (
    process.env.BRITTNEY_FLEET_ORCH_URL ||
    process.env.MCP_ORCHESTRATOR_URL ||
    FLEET_DEFAULT_ORCH
  ).replace(/\/$/, '');
  const model = process.env.BRITTNEY_FLEET_MODEL || FLEET_DEFAULT_MODEL;
  const bearer = process.env.FLEET_INFERENCE_KEY || process.env.SERVE_INFERENCE_KEY;
  const resolveKey = process.env.BRITTNEY_FLEET_RESOLVE_KEY || process.env.HOLOSCRIPT_API_KEY || '';

  let warmUrl: string | undefined;
  try {
    const r = await fetch(`${orch}/serve/resolve?model=${encodeURIComponent(model)}`, {
      headers: resolveKey ? { 'x-mcp-api-key': resolveKey } : {},
    });
    if (r.ok) {
      const body = (await r.json()) as { status?: string; url?: string };
      if (body.status === 'warm' && body.url) warmUrl = body.url;
    }
  } catch {
    // network error → treated as cold (fall back) below
  }

  if (!warmUrl) {
    throw new Error(
      `Brittney fleet endpoint is cold for model "${model}". The resolve bumped demand; the ` +
        `serving autoscaler will warm a box shortly. Falling back to a configured provider for ` +
        `this request (set ANTHROPIC_API_KEY for a BYOK fallback, or OLLAMA_HOST for local).`
    );
  }

  const provider = new OpenAICompatibleAdapter({
    baseURL: `${warmUrl.replace(/\/$/, '')}/v1`,
    apiKey: bearer,
    model,
  });
  return {
    provider,
    model,
    maxTokens: Number(process.env.BRITTNEY_MAX_TOKENS) || 8192,
    providerName: 'fleet',
  };
}

/**
 * Non-frontier fallback for a cold fleet: local Ollama (OLLAMA_HOST) is sovereign.
 * BRITTNEY_SERVICE_URL is a hosted bridge (forwards to Fireworks/Together), not
 * sovereign serving — it is still preferred here when set, as an already-configured
 * endpoint, and it is never a silent Anthropic bill. Returns null when neither is
 * configured. (Founder 2026-06-14: a cold lane ≠ an Anthropic bill.)
 */
function resolveSovereignFallback(): ResolvedBrittneyProvider | null {
  const cloudUrl = process.env.BRITTNEY_SERVICE_URL;
  if (cloudUrl) return resolveCloud(cloudUrl);
  const ollamaHost = process.env.OLLAMA_HOST || process.env.OLLAMA_BASE_URL;
  if (ollamaHost) return resolveOllama(ollamaHost);
  return null;
}

/**
 * Sovereign serving via the Vast SERVERLESS PyWorker endpoint — the DURABLE
 * foundation (founder 2026-06-14). Vast OWNS the autoscaling + a cold-worker pool
 * (resume in seconds, $0 idle), so there's no fragile local autoscaler tick and no
 * raw Docker cold-pull stall — the failure modes that made the raw /serve/resolve
 * path unreliable. The adapter resolves the warm worker PER REQUEST via the
 * route+envelope transport (it polls the cold pool awake), so construction is sync.
 * Active only when FLEET_SERVERLESS_ENDPOINT + VAST_API_KEY are set; null otherwise.
 */
function resolveServerless(): ResolvedBrittneyProvider | null {
  const endpointName = process.env.FLEET_SERVERLESS_ENDPOINT || process.env.VAST_QWEN_ENDPOINT_NAME;
  const apiKey = process.env.VAST_API_KEY;
  if (!endpointName || !apiKey) return null;
  const model =
    process.env.BRITTNEY_FLEET_MODEL || process.env.VAST_QWEN_MODEL || FLEET_DEFAULT_MODEL;
  const provider = new VastServerlessAdapter({ apiKey, endpointName, model });
  return {
    provider,
    model,
    maxTokens: Number(process.env.BRITTNEY_MAX_TOKENS) || 8192,
    providerName: 'serverless',
  };
}

/**
 * Async provider resolution — prefers the sovereign serving fleet (dynamic-resolve).
 * When the fleet is cold/unreachable it falls back to local Ollama or, if set, the
 * BRITTNEY_SERVICE_URL hosted bridge (Fireworks/Together — not sovereign). It does
 * NOT silently use a paid frontier API (founder policy 2026-06-14). With neither
 * configured it throws SOVEREIGN_WARMING so the caller surfaces an honest
 * "warming, retry" instead of billing Anthropic. Set
 * BRITTNEY_ALLOW_FRONTIER_FALLBACK=1 to opt in to the BYOK-frontier cold fallback.
 * The sync auto path (no fleet) uses HOLO_ALLOW_FRONTIER_FALLBACK=1 for the same rule.
 *
 * Fleet is used when BRITTNEY_PROVIDER=fleet, or auto-detected when fleet env
 * (BRITTNEY_FLEET_MODEL / FLEET_INFERENCE_KEY) is present and no explicit provider is set.
 * Everything else delegates to the sync `resolveBrittneyProvider`.
 */
export async function resolveBrittneyProviderAsync(
  byok?: BrittneyByokKeys
): Promise<ResolvedBrittneyProvider> {
  const explicit = process.env.BRITTNEY_PROVIDER as BrittneyProviderName | undefined;

  // Serverless serving — the DURABLE foundation (Vast-owned autoscaling + cold pool;
  // no fragile local autoscaler tick, no raw cold-pull stall). Preferred over the raw
  // /serve/resolve fleet path when FLEET_SERVERLESS_ENDPOINT + VAST_API_KEY are set.
  // Only for sovereign/fleet intent — an explicit frontier provider opts out.
  if (!explicit || explicit === 'fleet' || explicit === 'serverless') {
    const serverless = resolveServerless();
    if (serverless) return serverless;
  }

  const fleetConfigured =
    explicit === 'fleet' ||
    (!explicit && Boolean(process.env.BRITTNEY_FLEET_MODEL || process.env.FLEET_INFERENCE_KEY));

  if (fleetConfigured) {
    try {
      return await resolveFleet();
    } catch {
      // Cold/unreachable fleet. The /serve/resolve call already bumped demand, so a
      // serving box is warming. Founder policy 2026-06-14 ("im not recharging
      // anthropic ... use the fleet"): a cold fleet lane must NEVER silently
      // fall back to a paid frontier API. Local Ollama is the sovereign fallback;
      // BRITTNEY_SERVICE_URL is a hosted bridge (not sovereign) and is used only
      // when already configured. Otherwise surface an honest "warming, retry"
      // so a cold start is a brief wait — not an Anthropic bill. The escape hatch
      // BRITTNEY_ALLOW_FRONTIER_FALLBACK=1 opts in to the BYOK-frontier behavior.
      const sovereign = resolveSovereignFallback();
      if (sovereign) return upgradeOllamaByDiscovery(sovereign);
      if (process.env.BRITTNEY_ALLOW_FRONTIER_FALLBACK === '1') {
        // Explicit Studio opt-in (not the silent auto path). Call Anthropic directly
        // so this does not depend on HOLO_ALLOW_FRONTIER_FALLBACK, and say so out loud.
        const key = byok?.anthropicKey || process.env.ANTHROPIC_API_KEY;
        if (key) {
          console.warn(
            '[brittney] !!! FRONTIER FALLBACK ACTIVE !!! cold-fleet resolution is using ' +
              'frontier provider "anthropic" for caller resolveBrittneyProviderAsync because ' +
              'BRITTNEY_ALLOW_FRONTIER_FALLBACK=1.'
          );
          return upgradeOllamaByDiscovery(resolveAnthropic(key));
        }
        return upgradeOllamaByDiscovery(resolveBrittneyProvider(byok));
      }
      throw new Error(
        'SOVEREIGN_WARMING: Brittney is warming up — the sovereign serving box was ' +
          'scaled to zero and is spinning up now (your message bumped demand). Retry ' +
          'in ~1 minute. Sovereign-only by founder policy.'
      );
    }
  }
  return upgradeOllamaByDiscovery(resolveBrittneyProvider(byok));
}

/**
 * Discovery over hardcodes (founder 2026-06-10): when Brittney lands on local
 * Ollama with NO explicit BRITTNEY_MODEL pin, enumerate installed models and
 * pick the best behaviorally-verified tool-caller (capability flags lie:
 * qwen2.5-coder reports `tools` yet emits call JSON as text — the tend_garden
 * stall). Pull a better model and Brittney upgrades automatically.
 */
async function upgradeOllamaByDiscovery(
  resolved: ResolvedBrittneyProvider
): Promise<ResolvedBrittneyProvider> {
  if (resolved.providerName !== 'ollama' || process.env.BRITTNEY_MODEL) return resolved;
  const baseURL = process.env.OLLAMA_HOST || process.env.OLLAMA_BASE_URL || OLLAMA_DEFAULT_BASE_URL;
  const picked = await pickLocalModel(baseURL, { fallback: OLLAMA_DEFAULT_MODEL });
  // Always log the pick: a benchmark run silently rode the wrong model when
  // this was invisible (gemma4 flaky-probe incident, 2026-06-10).
  console.log(
    `[brittney] ollama discovery picked model=${picked.model} source=${picked.source} verified=${picked.toolCallVerified}`
  );
  if (picked.model === resolved.model) return resolved;
  // Known-Ollama site — pin the native protocol (see resolveOllama above).
  const provider = new LocalLLMAdapter({
    baseURL,
    model: picked.model,
    nativeOllamaApi: true,
    timeoutMs: 300_000,
  });
  return { ...resolved, provider, model: picked.model };
}
