/**
 * Brittney Provider Resolution — native-default (sovereign serving), BYOK fallback.
 *
 * Founder directive (2026-06-05): Brittney's LLM deps are NATIVE by default. The
 * ecosystem's own AI runs on sovereign serving — Brittney Cloud (our vast Ollama/
 * PyWorker fleet, P.008) or a local Ollama — NOT a third-party frontier API. A
 * frontier API (Anthropic) is BYOK: explicit opt-in or last-resort fallback only.
 * Other agent families bring their own keys; Brittney itself defaults sovereign.
 * Extends P.009 (sovereign embeddings) to the chat LLM.
 *
 * Auto-detect priority (no explicit BRITTNEY_PROVIDER):
 *   1. BRITTNEY_SERVICE_URL present → cloud   (sovereign serving — the native default)
 *   2. OLLAMA_HOST present          → ollama  (sovereign local — Quest 3 / downloaded apps)
 *   3. ANTHROPIC_API_KEY present    → anthropic (BYOK frontier fallback)
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
  type ILLMProvider,
} from '@holoscript/llm-provider';

export type BrittneyProviderName = 'anthropic' | 'ollama' | 'cloud' | 'fleet';

export interface ResolvedBrittneyProvider {
  /** The unified provider (Anthropic, Ollama, or Brittney Cloud). */
  provider: ILLMProvider;
  /** The model string to pass to streamCompletion(). */
  model: string;
  /** Max tokens for this provider. Anthropic = 16K, Ollama = 4-8K, Cloud = 8K. */
  maxTokens: number;
  /** Which provider was resolved (for logging/response headers). */
  providerName: BrittneyProviderName;
}

/**
 * Default Ollama model for Brittney. The brittney-qwen-v23 Ollama tag is retired;
 * the current sovereign default is qwen2.5-coder:7b (matches BRITTNEY_SOVEREIGN_DEFAULT_MODEL
 * in SovereignGeneratorAdapter). Override with BRITTNEY_MODEL env var.
 */
const OLLAMA_DEFAULT_MODEL = process.env.BRITTNEY_MODEL || 'qwen2.5-coder:7b';

/**
 * Resolve Brittney's LLM provider from environment variables.
 *
 * Priority (native-default — see file header for the founder directive):
 *   1. BRITTNEY_PROVIDER=anthropic|ollama|cloud (explicit override / BYOK)
 *   2. BRITTNEY_SERVICE_URL present → cloud   (sovereign serving — native default)
 *   3. OLLAMA_HOST present → ollama           (sovereign on-device)
 *   4. ANTHROPIC_API_KEY present → anthropic  (BYOK frontier fallback)
 *   5. Error — no provider configured
 *
 * Ollama host defaults:
 *   - OLLAMA_HOST env (full URL, e.g. http://host.docker.internal:11434)
 *   - OLLAMA_BASE_URL env (alternative key)
 *   - the Ollama default port (resolved inside resolveOllama)
 */
export function resolveBrittneyProvider(): ResolvedBrittneyProvider {
  const explicit = process.env.BRITTNEY_PROVIDER as BrittneyProviderName | undefined;

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
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

  // Auto-detect: sovereign serving FIRST (cloud → ollama), BYOK frontier (anthropic) LAST.
  // Brittney's own deps are native by default; Anthropic is only the fallback when no
  // sovereign endpoint is configured.
  if (cloudUrl) {
    return resolveCloud(cloudUrl);
  }
  if (ollamaHost) {
    return resolveOllama(ollamaHost);
  }
  if (anthropicKey) {
    return resolveAnthropic(anthropicKey);
  }

  throw new Error(
    'No Brittney provider configured. Brittney runs native by default — set ' +
    'BRITTNEY_PROVIDER=cloud (with BRITTNEY_SERVICE_URL, the sovereign serving endpoint) ' +
    'or BRITTNEY_PROVIDER=ollama (with OLLAMA_HOST). For a BYOK frontier fallback, set ' +
    'BRITTNEY_PROVIDER=anthropic (with ANTHROPIC_API_KEY). Downloaded apps configure ' +
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

function resolveCloud(baseURL: string | undefined): ResolvedBrittneyProvider {
  if (!baseURL) {
    throw new Error(
      'BRITTNEY_PROVIDER=cloud requires BRITTNEY_SERVICE_URL. ' +
      'Set BRITTNEY_SERVICE_URL or switch to another provider.'
    );
  }
  const apiKey = process.env.BRITTNEY_API_KEY ?? '';
  const tier = (process.env.BRITTNEY_TIER as 'standard' | 'pro') || 'standard';
  const provider = new BrittneyCloudAdapter({
    baseURL,
    apiKey,
    tier,
  });
  return {
    provider,
    model: process.env.BRITTNEY_MODEL || 'brittney-standard',
    maxTokens: 8192,
    providerName: 'cloud',
  };
}

function resolveOllama(host: string | undefined): ResolvedBrittneyProvider {
  const baseURL = host || 'http://localhost:11434';
  const provider = new LocalLLMAdapter({
    baseURL,
    model: process.env.BRITTNEY_MODEL || OLLAMA_DEFAULT_MODEL,
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

const FLEET_DEFAULT_MODEL = 'qwen2.5-coder:1.5b';
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
    process.env.BRITTNEY_FLEET_ORCH_URL || process.env.MCP_ORCHESTRATOR_URL || FLEET_DEFAULT_ORCH
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
 * Async provider resolution — prefers the sovereign serving fleet (dynamic-resolve),
 * gracefully falling back to the sync providers (cloud → ollama → anthropic-BYOK) when
 * the fleet is cold/unreachable, so scale-to-zero never breaks a request.
 *
 * Fleet is used when BRITTNEY_PROVIDER=fleet, or auto-detected when fleet env
 * (BRITTNEY_FLEET_MODEL / FLEET_INFERENCE_KEY) is present and no explicit provider is set.
 * Everything else delegates to the sync `resolveBrittneyProvider`.
 */
export async function resolveBrittneyProviderAsync(): Promise<ResolvedBrittneyProvider> {
  const explicit = process.env.BRITTNEY_PROVIDER as BrittneyProviderName | undefined;
  const fleetConfigured =
    explicit === 'fleet' ||
    (!explicit && Boolean(process.env.BRITTNEY_FLEET_MODEL || process.env.FLEET_INFERENCE_KEY));

  if (fleetConfigured) {
    try {
      return await resolveFleet();
    } catch (fleetErr) {
      // Cold/unreachable fleet → fall back to a sync provider for THIS request. If none is
      // configured, resolveBrittneyProvider() throws its own error — surface the fleet one.
      try {
        return resolveBrittneyProvider();
      } catch {
        throw fleetErr;
      }
    }
  }
  return resolveBrittneyProvider();
}
