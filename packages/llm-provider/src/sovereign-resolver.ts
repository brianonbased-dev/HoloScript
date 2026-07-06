/**
 * Universal sovereign-first LLM provider resolution.
 *
 * Founder directive (2026-06-10): HoloClaw, the fleet, and Brittney resolve
 * their LLM the SAME way — sovereign by default, frontier APIs as BYOK
 * fallback only. This file is the canonical implementation of that policy
 * (F.112 extended ecosystem-wide; P.009 sovereign embeddings is the
 * companion for embeddings). Surfaces that still carry their own copy of
 * the policy (studio's lib/brittney/provider.ts) should converge here.
 *
 * Auto-detect priority (no explicit provider):
 *   1. fleet     — Vast serverless sovereign serving fleet (P.008), route-probed
 *                  per request so cold pools can fall back while they wake
 *   2. cloud     — pinned sovereign serving endpoint (BrittneyCloudAdapter)
 *   3. holollama — sovereign local inference layer (llama.cpp llama-server, D.117),
 *                  when HOLOLLAMA_URL is set; preferred over legacy Ollama
 *   4. ollama    — legacy local model (OLLAMA_HOST), kept for back-compat
 *   5. anthropic / xai / openai — BYOK frontier fallback, in that order
 *   6. holollama (default :18080) — TERMINAL sovereign default (D.117), instead of
 *                  a bare "nothing configured" throw
 *
 * Env surface (universal names first, BRITTNEY_* kept as compat aliases):
 *   HOLO_LLM_PROVIDER | BRITTNEY_PROVIDER         explicit override
 *   HOLO_LLM_SERVICE_URL | BRITTNEY_SERVICE_URL   cloud endpoint
 *   HOLO_LLM_MODEL | BRITTNEY_MODEL               model override
 *   HOLO_LLM_MAX_TOKENS | BRITTNEY_MAX_TOKENS     max-token override
 *   OLLAMA_HOST | OLLAMA_BASE_URL | OLLAMA_URL    local endpoint
 *   FLEET_PROVIDER_ENDPOINT | VAST_QWEN_ENDPOINT_NAME  Vast endpoint
 *   HOLO_LLM_FLEET_MODEL | BRITTNEY_FLEET_MODEL   fleet model
 *   VAST_API_KEY                                  Vast route + worker bearer
 *   ANTHROPIC_API_KEY / XAI_API_KEY / OPENAI_API_KEY  BYOK fallbacks
 */

import type { ILLMProvider } from './types';
import { OLLAMA_DEFAULT_BASE_URL, pickLocalModel } from './local-model-picker';
import { FLEET_DEFAULT_MODEL, LOCAL_DEFAULT_MODEL } from './model-policy';
import { AnthropicAdapter } from './adapters/anthropic';
import { OpenAIAdapter } from './adapters/openai';
import { XAIAdapter } from './adapters/xai';
import { LocalLLMAdapter } from './adapters/local-llm';
import { BrittneyCloudAdapter } from './adapters/brittney-cloud';
import { VastServerlessAdapter } from './adapters/vast-serverless';

export type SovereignProviderName =
  | 'fleet'
  | 'cloud'
  | 'holollama'
  | 'ollama'
  | 'anthropic'
  | 'xai'
  | 'openai';

/**
 * HoloLlama — the sovereign LOCAL inference layer (D.117: retire Ollama; run
 * llama-server direct). llama.cpp exposes OpenAI /v1/chat/completions, so we drive
 * it through LocalLLMAdapter with nativeOllamaApi:false (the adapter only auto-picks
 * Ollama's /api/chat when the URL contains :11434). Preferred over Ollama and the
 * TERMINAL sovereign default (no bare "nothing configured" throw).
 */
const HOLOLLAMA_DEFAULT_URL = 'http://127.0.0.1:18080';

export interface ResolvedSovereignProvider {
  provider: ILLMProvider;
  /** Model string to pass to complete()/streamCompletion(). */
  model: string;
  maxTokens: number;
  providerName: SovereignProviderName;
}

export interface SovereignResolveOptions {
  /** Explicit provider override (CLI flag etc.) — beats every env. */
  explicit?: string;
  /** BYOK Anthropic key (e.g. per-user vault) — overrides ANTHROPIC_API_KEY. */
  anthropicKey?: string | null;
  /** Model override — beats HOLO_LLM_MODEL/BRITTNEY_MODEL. */
  model?: string;
  /** Max-token override — beats HOLO_LLM_MAX_TOKENS/BRITTNEY_MAX_TOKENS. */
  maxTokens?: number;
}

// FLEET_DEFAULT_MODEL + the local default come from the model-policy SSOT.
// qwen3.5 over qwen2.5-coder: the older family cannot emit NATIVE tool calls
// via Ollama — it writes the call JSON as plain text (2026-06-10 zero-objects
// benchmark finding; founder caught the stale default).
const OLLAMA_DEFAULT_MODEL = LOCAL_DEFAULT_MODEL;

function env(...names: string[]): string | undefined {
  for (const n of names) {
    const v = process.env[n];
    if (typeof v === 'string' && v.length > 0) return v;
  }
  return undefined;
}

function modelOverride(opts: SovereignResolveOptions): string | undefined {
  return opts.model || env('HOLO_LLM_MODEL', 'BRITTNEY_MODEL');
}

function maxTokensOverride(opts: SovereignResolveOptions): number | undefined {
  if (opts.maxTokens) return opts.maxTokens;
  const raw = env('HOLO_LLM_MAX_TOKENS', 'BRITTNEY_MAX_TOKENS');
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/**
 * Synchronous sovereign-first resolution: cloud → ollama → anthropic → xai →
 * openai. Fleet (dynamic-resolve) needs a network round-trip — use
 * `resolveSovereignProviderAsync` to include it.
 */
export function resolveSovereignProvider(
  opts: SovereignResolveOptions = {}
): ResolvedSovereignProvider {
  const explicit = (opts.explicit || env('HOLO_LLM_PROVIDER', 'BRITTNEY_PROVIDER'))?.toLowerCase();

  const anthropicKey = opts.anthropicKey || env('ANTHROPIC_API_KEY');
  const cloudUrl = env('HOLO_LLM_SERVICE_URL', 'BRITTNEY_SERVICE_URL');
  const ollamaHost = env('OLLAMA_HOST', 'OLLAMA_BASE_URL', 'OLLAMA_URL');

  switch (explicit) {
    case undefined:
    case '':
    case 'auto':
    case 'sovereign':
      break; // fall through to auto-detect
    case 'cloud':
      return resolveCloud(cloudUrl, opts);
    case 'holollama':
      return resolveHoloLlama(undefined, opts);
    case 'ollama':
      return resolveOllama(ollamaHost, opts);
    case 'anthropic':
      return resolveAnthropic(anthropicKey, opts);
    case 'xai':
      return resolveXai(opts);
    case 'openai':
      return resolveOpenai(opts);
    case 'fleet':
      throw new Error(
        'provider=fleet requires async resolution (Vast serverless route probe) — ' +
          'call resolveSovereignProviderAsync().'
      );
    default:
      throw new Error(
        `Unknown LLM provider "${explicit}". ` +
          `Valid: fleet | cloud | ollama | anthropic | xai | openai | sovereign/auto.`
      );
  }

  // Auto-detect: sovereign first, BYOK frontier last (F.112 ecosystem-wide).
  // D.117: HoloLlama (llama.cpp llama-server) is the sovereign LOCAL layer — preferred
  // over legacy Ollama, and the TERMINAL sovereign default so a bare-config call lands
  // on HoloLlama at :18080 rather than throwing. Ollama stays reachable via OLLAMA_HOST
  // (legacy) and BYOK keys still auto-fall (before the terminal default) so cloud-only
  // deployments keep working.
  if (cloudUrl) return resolveCloud(cloudUrl, opts);
  const holoLlamaUrl = env('HOLOLLAMA_URL', 'HOLOLLAMA_ENDPOINT');
  if (holoLlamaUrl) return resolveHoloLlama(holoLlamaUrl, opts);
  if (ollamaHost) return resolveOllama(ollamaHost, opts);
  if (anthropicKey) return resolveAnthropic(anthropicKey, opts);
  if (env('XAI_API_KEY')) return resolveXai(opts);
  if (env('OPENAI_API_KEY')) return resolveOpenai(opts);

  // Sovereign default (D.117): HoloLlama at :18080. If the local server is down the
  // CALL fails with a llama-server start hint — never a silent cloud/Ollama fallback.
  return resolveHoloLlama(undefined, opts);
}

/**
 * Async sovereign-first resolution — prefers the serving fleet
 * (dynamic-resolve; the GET also bumps demand so the autoscaler warms a box),
 * gracefully falling back to the sync chain when the fleet is cold or
 * unreachable, so scale-to-zero never breaks a caller.
 */
export async function resolveSovereignProviderAsync(
  opts: SovereignResolveOptions = {}
): Promise<ResolvedSovereignProvider> {
  const explicit = (opts.explicit || env('HOLO_LLM_PROVIDER', 'BRITTNEY_PROVIDER'))?.toLowerCase();
  const fleetConfigured =
    explicit === 'fleet' ||
    ((explicit === undefined ||
      explicit === '' ||
      explicit === 'auto' ||
      explicit === 'sovereign') &&
      Boolean(env('VAST_API_KEY')));

  if (fleetConfigured) {
    try {
      return await resolveFleet(opts);
    } catch (fleetErr) {
      // Cold/unreachable fleet → sync fallback for THIS request. If none is
      // configured either, surface the fleet error (it has the warm-up hint).
      try {
        return await upgradeOllamaByDiscovery(
          resolveSovereignProvider({ ...opts, explicit: undefined }),
          opts
        );
      } catch {
        throw fleetErr;
      }
    }
  }
  return upgradeOllamaByDiscovery(resolveSovereignProvider(opts), opts);
}

/**
 * Discovery over hardcodes (founder 2026-06-10): when the async path lands on
 * local Ollama with NO explicit model pin, enumerate installed models and pick
 * the best behaviorally-verified tool-caller instead of the static default.
 * The sync resolver keeps the static fallback (it cannot await discovery).
 */
async function upgradeOllamaByDiscovery(
  resolved: ResolvedSovereignProvider,
  opts: SovereignResolveOptions
): Promise<ResolvedSovereignProvider> {
  if (resolved.providerName !== 'ollama' || modelOverride(opts)) return resolved;
  const baseURL = env('OLLAMA_HOST', 'OLLAMA_BASE_URL', 'OLLAMA_URL') || OLLAMA_DEFAULT_BASE_URL;
  const picked = await pickLocalModel(baseURL, { fallback: OLLAMA_DEFAULT_MODEL });
  if (picked.model === resolved.model) return resolved;
  const provider = new LocalLLMAdapter({ baseURL, model: picked.model, timeoutMs: 300_000 });
  return { ...resolved, provider, model: picked.model };
}

// ── backends ─────────────────────────────────────────────────────────────────

function resolveCloud(
  baseURL: string | undefined,
  opts: SovereignResolveOptions
): ResolvedSovereignProvider {
  if (!baseURL) {
    throw new Error(
      'provider=cloud requires HOLO_LLM_SERVICE_URL (or BRITTNEY_SERVICE_URL) — ' +
        'the sovereign serving endpoint.'
    );
  }
  const tier = env('HOLO_LLM_TIER', 'BRITTNEY_TIER') as 'standard' | 'pro' | undefined;
  const lane = env('HOLO_LLM_LANE', 'BRITTNEY_LANE') as
    | 'operator'
    | 'code'
    | 'vision'
    | 'reasoning'
    | undefined;
  const provider = new BrittneyCloudAdapter({
    baseURL,
    apiKey: env('HOLO_LLM_SERVICE_KEY', 'BRITTNEY_API_KEY') ?? '',
    ...(tier ? { tier } : {}),
    ...(lane ? { lane } : {}),
  });
  return {
    provider,
    model: modelOverride(opts) || 'brittney-standard',
    maxTokens: maxTokensOverride(opts) || 8192,
    providerName: 'cloud',
  };
}

function resolveOllama(
  host: string | undefined,
  opts: SovereignResolveOptions
): ResolvedSovereignProvider {
  const baseURL = host || OLLAMA_DEFAULT_BASE_URL;
  const model = modelOverride(opts) || OLLAMA_DEFAULT_MODEL;
  const provider = new LocalLLMAdapter({ baseURL, model, timeoutMs: 300_000 });
  return {
    provider,
    model,
    // Local models have smaller context windows; 4K is safe for 7B-class.
    maxTokens: maxTokensOverride(opts) || 4096,
    providerName: 'ollama',
  };
}

/**
 * HoloLlama — llama.cpp llama-server, the sovereign LOCAL inference layer (D.117).
 * OpenAI /v1/chat/completions; forces nativeOllamaApi:false so LocalLLMAdapter never
 * uses Ollama's /api/chat. No model-discovery upgrade (a llama-server holds exactly
 * one model), so providerName='holollama' is intentionally skipped by
 * upgradeOllamaByDiscovery.
 */
function resolveHoloLlama(
  baseUrlOverride: string | undefined,
  opts: SovereignResolveOptions
): ResolvedSovereignProvider {
  const baseURL = (
    baseUrlOverride ||
    env('HOLOLLAMA_URL', 'HOLOLLAMA_ENDPOINT') ||
    HOLOLLAMA_DEFAULT_URL
  ).replace(/\/+$/, '');
  const model = modelOverride(opts) || OLLAMA_DEFAULT_MODEL;
  const provider = new LocalLLMAdapter({
    baseURL,
    model,
    nativeOllamaApi: false,
    timeoutMs: 300_000,
  });
  return {
    provider,
    model,
    maxTokens: maxTokensOverride(opts) || 4096,
    providerName: 'holollama',
  };
}

function resolveAnthropic(
  apiKey: string | undefined,
  opts: SovereignResolveOptions
): ResolvedSovereignProvider {
  if (!apiKey) {
    throw new Error('provider=anthropic requires ANTHROPIC_API_KEY (BYOK frontier fallback).');
  }
  const provider = new AnthropicAdapter({ apiKey, enablePromptCaching: true });
  return {
    provider,
    model: modelOverride(opts) || 'claude-sonnet-4-6',
    maxTokens: maxTokensOverride(opts) || 16000,
    providerName: 'anthropic',
  };
}

function resolveXai(opts: SovereignResolveOptions): ResolvedSovereignProvider {
  const apiKey = env('XAI_API_KEY');
  if (!apiKey) throw new Error('provider=xai requires XAI_API_KEY.');
  const provider = new XAIAdapter({ apiKey });
  return {
    provider,
    model: modelOverride(opts) || 'grok-4.3',
    maxTokens: maxTokensOverride(opts) || 8192,
    providerName: 'xai',
  };
}

function resolveOpenai(opts: SovereignResolveOptions): ResolvedSovereignProvider {
  const apiKey = env('OPENAI_API_KEY');
  if (!apiKey) throw new Error('provider=openai requires OPENAI_API_KEY.');
  const provider = new OpenAIAdapter({
    apiKey,
    ...(env('OPENAI_BASE_URL') ? { baseURL: env('OPENAI_BASE_URL') } : {}),
  });
  return {
    provider,
    model: modelOverride(opts) || 'gpt-4.1',
    maxTokens: maxTokensOverride(opts) || 8192,
    providerName: 'openai',
  };
}

/**
 * Sovereign serving fleet (P.008): Vast serverless route/envelope transport.
 * A one-shot route probe records demand and only selects fleet when a worker is
 * already ready; cold pools fall back for this request while they wake.
 */
function optionalPositiveNumberEnv(name: string): number | undefined {
  const raw = env(name);
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

async function resolveFleet(opts: SovereignResolveOptions): Promise<ResolvedSovereignProvider> {
  const apiKey = env('VAST_API_KEY');
  if (!apiKey) throw new Error('provider=fleet requires VAST_API_KEY.');
  const endpointName =
    env('FLEET_PROVIDER_ENDPOINT', 'VAST_QWEN_ENDPOINT_NAME') || 'holoscript-qwen-coder';
  const model =
    env('HOLO_LLM_FLEET_MODEL', 'BRITTNEY_FLEET_MODEL', 'FLEET_MODEL', 'VAST_QWEN_MODEL') ||
    modelOverride(opts) ||
    FLEET_DEFAULT_MODEL;
  const cost = optionalPositiveNumberEnv('VAST_SERVERLESS_COST');
  const pollIntervalMs = optionalPositiveNumberEnv('VAST_SERVERLESS_POLL_INTERVAL_MS');
  const baseConfig = {
    apiKey,
    endpointName,
    model,
    ...(cost ? { cost } : {}),
    ...(pollIntervalMs ? { pollIntervalMs } : {}),
  };

  const probe = await new VastServerlessAdapter({ ...baseConfig, maxWaitS: 0 }).healthCheck();
  if (!probe.ok) {
    throw new Error(
      `Sovereign Vast serverless fleet endpoint "${endpointName}" is cold for model "${model}". ` +
        `The route probe bumped demand; falling back to a configured provider for this request.`
    );
  }

  const maxWaitS = optionalPositiveNumberEnv('VAST_SERVERLESS_MAX_WAIT_S');
  const provider = new VastServerlessAdapter({
    ...baseConfig,
    ...(maxWaitS ? { maxWaitS } : {}),
  });
  return {
    provider,
    model,
    maxTokens: maxTokensOverride(opts) || 8192,
    providerName: 'fleet',
  };
}
