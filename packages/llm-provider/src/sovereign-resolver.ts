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
 *   1. fleet  — sovereign serving fleet (P.008), dynamic-resolved per request
 *               from the orchestrator's /serve/resolve registry (async only)
 *   2. cloud  — pinned sovereign serving endpoint (BrittneyCloudAdapter)
 *   3. ollama — sovereign local model (on-device / same-box)
 *   4. anthropic / xai / openai — BYOK frontier fallback, in that order
 *
 * Env surface (universal names first, BRITTNEY_* kept as compat aliases):
 *   HOLO_LLM_PROVIDER | BRITTNEY_PROVIDER         explicit override
 *   HOLO_LLM_SERVICE_URL | BRITTNEY_SERVICE_URL   cloud endpoint
 *   HOLO_LLM_MODEL | BRITTNEY_MODEL               model override
 *   HOLO_LLM_MAX_TOKENS | BRITTNEY_MAX_TOKENS     max-token override
 *   OLLAMA_HOST | OLLAMA_BASE_URL | OLLAMA_URL    local endpoint
 *   HOLO_LLM_FLEET_MODEL | BRITTNEY_FLEET_MODEL   fleet model
 *   FLEET_INFERENCE_KEY | SERVE_INFERENCE_KEY     fleet bearer
 *   ANTHROPIC_API_KEY / XAI_API_KEY / OPENAI_API_KEY  BYOK fallbacks
 */

import type { ILLMProvider } from './types';
import { AnthropicAdapter } from './adapters/anthropic';
import { OpenAIAdapter } from './adapters/openai';
import { XAIAdapter } from './adapters/xai';
import { LocalLLMAdapter } from './adapters/local-llm';
import { BrittneyCloudAdapter } from './adapters/brittney-cloud';
import { OpenAICompatibleAdapter } from './adapters/openai-compatible';

export type SovereignProviderName =
  | 'fleet'
  | 'cloud'
  | 'ollama'
  | 'anthropic'
  | 'xai'
  | 'openai';

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

const FLEET_DEFAULT_MODEL = 'qwen2.5-coder:1.5b';
const FLEET_DEFAULT_ORCH = 'https://mcp-orchestrator-production-45f9.up.railway.app';
const OLLAMA_DEFAULT_MODEL = 'qwen2.5-coder:7b';

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
        'provider=fleet requires async resolution (dynamic /serve/resolve) — ' +
          'call resolveSovereignProviderAsync().'
      );
    default:
      throw new Error(
        `Unknown LLM provider "${explicit}". ` +
          `Valid: fleet | cloud | ollama | anthropic | xai | openai | sovereign/auto.`
      );
  }

  // Auto-detect: sovereign first, BYOK frontier last (F.112 ecosystem-wide).
  if (cloudUrl) return resolveCloud(cloudUrl, opts);
  if (ollamaHost) return resolveOllama(ollamaHost, opts);
  if (anthropicKey) return resolveAnthropic(anthropicKey, opts);
  if (env('XAI_API_KEY')) return resolveXai(opts);
  if (env('OPENAI_API_KEY')) return resolveOpenai(opts);

  throw new Error(
    'No LLM provider configured. The ecosystem runs sovereign by default — set ' +
      'HOLO_LLM_SERVICE_URL (sovereign serving endpoint), OLLAMA_HOST (local model), ' +
      'or fleet env (HOLO_LLM_FLEET_MODEL + FLEET_INFERENCE_KEY, async resolution). ' +
      'For a BYOK frontier fallback set ANTHROPIC_API_KEY, XAI_API_KEY, or OPENAI_API_KEY.'
  );
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
    ((explicit === undefined || explicit === '' || explicit === 'auto' || explicit === 'sovereign') &&
      Boolean(env('HOLO_LLM_FLEET_MODEL', 'BRITTNEY_FLEET_MODEL', 'FLEET_INFERENCE_KEY')));

  if (fleetConfigured) {
    try {
      return await resolveFleet(opts);
    } catch (fleetErr) {
      // Cold/unreachable fleet → sync fallback for THIS request. If none is
      // configured either, surface the fleet error (it has the warm-up hint).
      try {
        return resolveSovereignProvider({ ...opts, explicit: undefined });
      } catch {
        throw fleetErr;
      }
    }
  }
  return resolveSovereignProvider(opts);
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
  const baseURL = host || 'http://localhost:11434';
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
    model: modelOverride(opts) || 'grok-3',
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
 * Sovereign serving fleet (P.008) — the MOST native backend. The serving
 * box's IP:port is ephemeral across scale-to-zero, so the current warm URL is
 * resolved from the orchestrator's /serve/resolve registry per call (the GET
 * also bumps demand → the autoscaler keeps/warms a box). Cold → throw; the
 * async resolver falls back to the sync chain for this request.
 */
async function resolveFleet(opts: SovereignResolveOptions): Promise<ResolvedSovereignProvider> {
  const orch = (
    env('HOLO_LLM_FLEET_ORCH_URL', 'BRITTNEY_FLEET_ORCH_URL', 'MCP_ORCHESTRATOR_URL') ||
    FLEET_DEFAULT_ORCH
  ).replace(/\/$/, '');
  const model =
    env('HOLO_LLM_FLEET_MODEL', 'BRITTNEY_FLEET_MODEL') || modelOverride(opts) || FLEET_DEFAULT_MODEL;
  const bearer = env('FLEET_INFERENCE_KEY', 'SERVE_INFERENCE_KEY');
  const resolveKey =
    env('HOLO_LLM_FLEET_RESOLVE_KEY', 'BRITTNEY_FLEET_RESOLVE_KEY', 'HOLOSCRIPT_API_KEY') || '';

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
      `Sovereign fleet endpoint is cold for model "${model}". The resolve bumped demand; ` +
        `the serving autoscaler will warm a box shortly. Falling back to a configured ` +
        `provider for this request.`
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
    maxTokens: maxTokensOverride(opts) || 8192,
    providerName: 'fleet',
  };
}
