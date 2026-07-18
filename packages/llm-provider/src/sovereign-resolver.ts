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
 *   HOLOSERVE_PARITY_PINS                         model@binding-sha256 pins (comma-separated)
 *   HOLOSERVE_PARITY_REGISTRY                     path to the parity pin registry JSON
 *                                                 (maintained by ai-ecosystem
 *                                                 scripts/holoserve-llamaserver-parity-receipt.mjs)
 */

import { readFileSync } from 'node:fs';
import type { ILLMProvider } from './types';
import { OLLAMA_DEFAULT_BASE_URL, pickLocalModel } from './local-model-picker';
import { FLEET_DEFAULT_MODEL, LOCAL_DEFAULT_MODEL } from './model-policy';
import { AnthropicAdapter } from './adapters/anthropic';
import { OpenAIAdapter } from './adapters/openai';
import { XAIAdapter } from './adapters/xai';
import { LocalLLMAdapter } from './adapters/local-llm';
import { BrittneyCloudAdapter } from './adapters/brittney-cloud';
import { VastServerlessAdapter } from './adapters/vast-serverless';
import { admitHoloServeHealth } from './fleet-router';

export type SovereignProviderName =
  | 'fleet'
  | 'cloud'
  | 'holoserve'
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

/**
 * HoloServe — the FULLY sovereign HOLO-family serving lane (D.118: no llama.cpp, no GGUF;
 * PyTorch-direct over the native byte-BPE tokenizer). Serves OpenAI /v1/completions +
 * /health asserting `{sovereign:true, llama_cpp:false, gguf:false}` — the async resolver
 * VERIFIES that invariant before handing the provider out (a non-sovereign impostor on the
 * port is refused, never silently used). Preferred over HoloLlama for HOLO-arch checkpoints;
 * HoloLlama remains the GGUF/foreign-carrier lane (brittney-edge etc.).
 * Default port matches the laptop-holoserve registry node (config/sovereign-devices).
 */
const HOLOSERVE_DEFAULT_URL = 'http://127.0.0.1:8099';
const HOLOSERVE_DEFAULT_MODEL = 'holorunner-s0';
const SHA256_RE = /^sha256:[0-9a-f]{64}$/u;
const PORTABLE_MODEL_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,255}$/u;

/**
 * Per-model HoloServe pin — the dependency-sovereignty-ladder strangler
 * (ratified 2026-07-16). D.118 retires llama.cpp PER MODEL, not by fiat: a model
 * with a PASSING HoloServe↔llama-server parity receipt is PINNED to HoloServe
 * through async live-binding admission (the llama-server lane becomes unreachable
 * for it); a model WITHOUT a receipt
 * keeps exactly the current behavior (fail-open).
 *
 * Pin sources (both fail-open — unset/missing/corrupt input pins NOTHING):
 *   HOLOSERVE_PARITY_PINS      comma-separated model@sha256:<64-hex> pins
 *   HOLOSERVE_PARITY_REGISTRY  path to the pin-registry JSON maintained by
 *                              ai-ecosystem scripts/holoserve-llamaserver-parity-receipt.mjs
 *                              ({ pins: { "<model>": { verdict: "pass",
 *                              bindingSha256: "sha256:...", ... } } }); only
 *                              exact artifact-bound pass entries pin.
 *
 * Read fresh on every resolution (resolution is per-provider-construction, not
 * per-token) so a receipt landing or being revoked takes effect without a restart.
 */
interface HoloServeParityPin {
  bindingSha256: string;
}

function holoServeParityPins(): ReadonlyMap<string, HoloServeParityPin> {
  const pins = new Map<string, HoloServeParityPin>();
  const inline = env('HOLOSERVE_PARITY_PINS');
  if (inline) {
    for (const entry of inline.split(',')) {
      const trimmed = entry.trim();
      const separator = trimmed.lastIndexOf('@');
      const model = separator > 0 ? trimmed.slice(0, separator) : '';
      const bindingSha256 = separator > 0 ? trimmed.slice(separator + 1) : '';
      if (PORTABLE_MODEL_RE.test(model) && SHA256_RE.test(bindingSha256)) {
        pins.set(model, { bindingSha256 });
      }
    }
  }
  const registryPath = env('HOLOSERVE_PARITY_REGISTRY');
  if (registryPath) {
    try {
      const parsed: unknown = JSON.parse(readFileSync(registryPath, 'utf-8'));
      const registry = (parsed && typeof parsed === 'object' ? parsed : {}) as {
        schema?: unknown;
        pins?: Record<string, { verdict?: unknown; bindingSha256?: unknown }>;
      };
      if (registry.schema !== 'holoserve-parity-pin-registry/v0') return pins;
      for (const [model, entry] of Object.entries(registry.pins ?? {})) {
        if (
          PORTABLE_MODEL_RE.test(model) &&
          entry &&
          typeof entry === 'object' &&
          entry.verdict === 'pass' &&
          typeof entry.bindingSha256 === 'string' &&
          SHA256_RE.test(entry.bindingSha256)
        ) {
          pins.set(model, { bindingSha256: entry.bindingSha256 });
        }
      }
    } catch {
      /* fail-open: an unreadable registry pins nothing — behavior unchanged */
    }
  }
  return pins;
}

export interface ResolvedSovereignProvider {
  provider: ILLMProvider;
  /** Model string to pass to complete()/streamCompletion(). */
  model: string;
  maxTokens: number;
  providerName: SovereignProviderName;
  /** Exact parity-tested HoloServe binding when a strangler pin selected this route. */
  artifactBindingSha256?: string;
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
  return resolveSovereignProviderInternal(opts, false);
}

function resolveSovereignProviderInternal(
  opts: SovereignResolveOptions,
  allowParityHoloServe: boolean
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
    case 'holoserve':
      return resolveHoloServe(undefined, opts, allowParityHoloServe);
    case 'holollama':
      return resolveHoloLlama(undefined, opts, allowParityHoloServe);
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
          `Valid: fleet | cloud | holoserve | holollama | ollama | anthropic | xai | openai | sovereign/auto.`
      );
  }

  // Auto-detect: sovereign first, BYOK frontier last (F.112 ecosystem-wide).
  // D.117: HoloLlama (llama.cpp llama-server) is the sovereign LOCAL layer — preferred
  // over legacy Ollama, and the TERMINAL sovereign default so a bare-config call lands
  // on HoloLlama at :18080 rather than throwing. Ollama stays reachable via OLLAMA_HOST
  // (legacy) and BYOK keys still auto-fall (before the terminal default) so cloud-only
  // deployments keep working.
  if (cloudUrl) return resolveCloud(cloudUrl, opts);
  // D.118: a configured HoloServe (fully sovereign HOLO runtime) beats HoloLlama (llama.cpp).
  const holoServeUrl = env('HOLOSERVE_URL', 'HOLOSERVE_ENDPOINT');
  if (holoServeUrl) return resolveHoloServe(holoServeUrl, opts, allowParityHoloServe);
  const holoLlamaUrl = env('HOLOLLAMA_URL', 'HOLOLLAMA_ENDPOINT');
  if (holoLlamaUrl) return resolveHoloLlama(holoLlamaUrl, opts, allowParityHoloServe);
  if (ollamaHost) return resolveOllama(ollamaHost, opts);
  if (anthropicKey) return resolveAnthropic(anthropicKey, opts);
  if (env('XAI_API_KEY')) return resolveXai(opts);
  if (env('OPENAI_API_KEY')) return resolveOpenai(opts);

  // Sovereign default (D.117): HoloLlama at :18080. If the local server is down the
  // CALL fails with a llama-server start hint — never a silent cloud/Ollama fallback.
  return resolveHoloLlama(undefined, opts, allowParityHoloServe);
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
      let fallback: ResolvedSovereignProvider;
      try {
        fallback = resolveSovereignProviderInternal({ ...opts, explicit: undefined }, true);
      } catch {
        throw fleetErr;
      }
      try {
        return await finalizeAsyncResolution(fallback, opts);
      } catch (fallbackErr) {
        if (fallback.providerName === 'holoserve') throw fallbackErr;
        throw fleetErr;
      }
    }
  }
  const resolved = resolveSovereignProviderInternal(opts, true);
  return finalizeAsyncResolution(resolved, opts);
}

async function finalizeAsyncResolution(
  resolved: ResolvedSovereignProvider,
  opts: SovereignResolveOptions
): Promise<ResolvedSovereignProvider> {
  if (resolved.providerName === 'holoserve') {
    // Async path can afford the network round-trip: enforce the sovereignty invariant
    // before anyone sends a token to this provider.
    await verifyHoloServeSovereignty(
      (env('HOLOSERVE_URL', 'HOLOSERVE_ENDPOINT') || HOLOSERVE_DEFAULT_URL).replace(/\/+$/, ''),
      resolved.model,
      resolved.artifactBindingSha256
    );
    return resolved;
  }
  return upgradeOllamaByDiscovery(resolved, opts);
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
  // This site KNOWS the backend is Ollama — pin the native protocol explicitly.
  // The :11434 port heuristic misses custom-port Ollama (tunnel/proxy), and the
  // OpenAI /v1 shim it would fall to drops tool_calls for thinking models.
  const provider = new LocalLLMAdapter({
    baseURL,
    model: picked.model,
    nativeOllamaApi: true,
    timeoutMs: 300_000,
  });
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
  // Known-Ollama site — pin the native protocol; do not rely on the port heuristic.
  const provider = new LocalLLMAdapter({
    baseURL,
    model,
    nativeOllamaApi: true,
    timeoutMs: 300_000,
  });
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
/**
 * HoloServe (D.118) — PyTorch-direct sovereign serving for HOLO-arch checkpoints. OpenAI
 * /v1 like llama-server, so the same LocalLLMAdapter drives it (nativeOllamaApi:false).
 * Exact resident registry → no Ollama discovery upgrade. The SYNC resolver trusts the
 * configured URL only for unpinned models; the
 * ASYNC path additionally verifies the /health sovereignty invariant via
 * verifyHoloServeSovereignty before handing the provider out.
 */
function resolveHoloServe(
  baseUrlOverride: string | undefined,
  opts: SovereignResolveOptions,
  allowParityHoloServe = false
): ResolvedSovereignProvider {
  const baseURL = (
    baseUrlOverride ||
    env('HOLOSERVE_URL', 'HOLOSERVE_ENDPOINT') ||
    HOLOSERVE_DEFAULT_URL
  ).replace(/\/+$/, '');
  const model = modelOverride(opts) || env('HOLOSERVE_MODEL') || HOLOSERVE_DEFAULT_MODEL;
  const parityPin = holoServeParityPins().get(model);
  if (parityPin && !allowParityHoloServe) {
    throw new Error(
      `Model ${model} is artifact-pinned to HoloServe and requires ` +
        'resolveSovereignProviderAsync() for live binding verification.'
    );
  }
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
    providerName: 'holoserve',
    ...(parityPin ? { artifactBindingSha256: parityPin.bindingSha256 } : {}),
  };
}

/**
 * Machine-check the HoloServe sovereignty invariant (W.832): /health must assert
 * `{sovereign:true, llama_cpp:false, gguf:false}`. A reachable server that fails the
 * invariant is an impostor on the port — REFUSE it (throw), never fall through silently.
 * An UNREACHABLE server also throws (with the start hint): a configured HoloServe URL is
 * a commitment, matching the HoloLlama terminal-default philosophy of no silent fallback.
 * A sovereignty label alone is insufficient: the expected model must have an
 * exact, canonically hashed entry in `model_artifact_bindings`.
 */
async function verifyHoloServeSovereignty(
  baseURL: string,
  expectedModel: string,
  expectedBindingSha256?: string
): Promise<void> {
  let health: unknown;
  try {
    const response = await fetch(`${baseURL}/health`, { signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    health = await response.json();
  } catch (err) {
    let port = '8099';
    try {
      port = new URL(baseURL).port || port;
    } catch {
      // Keep the fenced instruction usable even when the configured URL is malformed.
    }
    throw new Error(
      `HoloServe at ${baseURL} is unreachable (${(err as Error).message}). ` +
        'Keep it fenced until an admitted launch supplies: ' +
        'python scripts/holoserve.py --model-name <model> --ckpt <ckpt.pt> --bins <bins> ' +
        '--snapshot-dir <existing-private-0700-dir> ' +
        '--custody-receipt <receipt.json> --expected-custody-sha256 sha256:<64-hex> ' +
        `--port ${port}`
    );
  }
  const admission = admitHoloServeHealth(health, expectedModel);
  if (!admission) {
    throw new Error(
      `REFUSING non-sovereign or artifact-unbound server at ${baseURL}: ` +
        `the exact canonical model_artifact_bindings entry for ${expectedModel} is required. ` +
        `(HoloServe must assert sovereign:true, llama_cpp:false, gguf:false — D.118)`
    );
  }
  if (expectedBindingSha256 && admission.bindingSha256 !== expectedBindingSha256) {
    throw new Error(
      `REFUSING parity-artifact drift at ${baseURL}: ${expectedModel} does not match ` +
        'the exact binding SHA-256 in its passing parity pin'
    );
  }
}

function resolveHoloLlama(
  baseUrlOverride: string | undefined,
  opts: SovereignResolveOptions,
  allowParityHoloServe = false
): ResolvedSovereignProvider {
  const model = modelOverride(opts) || OLLAMA_DEFAULT_MODEL;
  // Per-model strangler pin (2026-07-16 ruling): a model with a PASSING parity
  // receipt resolves ONLY to HoloServe — llama-server is unreachable for it.
  // Synchronous callers must upgrade instead of using an unverified checkpoint;
  // unpinned models fall through to the unchanged HoloLlama resolution below.
  const parityPin = holoServeParityPins().get(model);
  if (parityPin) {
    if (!allowParityHoloServe) {
      throw new Error(
        `Model ${model} is artifact-pinned to HoloServe and requires ` +
          'resolveSovereignProviderAsync() for live binding verification.'
      );
    }
    return resolveHoloServe(undefined, { ...opts, model }, allowParityHoloServe);
  }
  const baseURL = (
    baseUrlOverride ||
    env('HOLOLLAMA_URL', 'HOLOLLAMA_ENDPOINT') ||
    HOLOLLAMA_DEFAULT_URL
  ).replace(/\/+$/, '');
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
