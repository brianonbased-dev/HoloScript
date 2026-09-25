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
 *   Joseph/CoS coding-backup chain (2026-09-24; receipts record `step`):
 *     1. native          — HOLOSERVE_URL / holoserve (local native). Never label step 2/3 native.
 *     2. vast-oss-coding — Work house proxy (HOLO_VAST_CODING_URL or http://127.0.0.1:18780
 *                        when healthy). FOREIGN open-weight coding-backup; NOT sovereign/native.
 *                        Health-checked on loopback only; never silent frontier fall-through.
 *     3. hosted-bridge / hosted-frontier — closed hosted ONLY with HOLO_ALLOW_HOSTED_BRIDGE=1
 *                        or HOLO_ALLOW_FRONTIER_FALLBACK=1. Else fail closed (loud throw).
 *   Still available around that chain:
 *   - local-fleet — owned laptop/Jetson model-fleet routes, discovered per request (async)
 *   - fleet       — Vast serverless sovereign serving fleet (P.008), route-probed (async);
 *                   distinct from the Work :18780 OSS coding proxy above
 *   - holollama / ollama — local layers when URLs set; D.117 terminal default only when the
 *                   backup chain had nothing to try (empty config), not after a failed native/proxy
 *   - cloud / anthropic / xai / openai — step 3 only, gated as above
 *
 * Env surface (universal names first, BRITTNEY_* kept as compat aliases):
 *   HOLO_LLM_PROVIDER | BRITTNEY_PROVIDER         explicit override
 *   HOLO_LLM_SERVICE_URL | BRITTNEY_SERVICE_URL   cloud endpoint
 *   HOLO_LLM_MODEL | BRITTNEY_MODEL               model override
 *   HOLO_LLM_MAX_TOKENS | BRITTNEY_MAX_TOKENS     max-token override
 *   OLLAMA_HOST | OLLAMA_BASE_URL | OLLAMA_URL    local endpoint
 *   FLEET_PROVIDER_ENDPOINT | VAST_QWEN_ENDPOINT_NAME  Vast endpoint
 *   HOLO_LLM_FLEET_MODEL | BRITTNEY_FLEET_MODEL   fleet model
 *   HOLO_LLM_FLEET_BRAIN                            owned local @model_fleet source
 *   VAST_API_KEY                                  Vast route + worker bearer
 *   ANTHROPIC_API_KEY / XAI_API_KEY / OPENAI_API_KEY  BYOK fallbacks (explicit provider, or
 *                                                 auto only with HOLO_ALLOW_FRONTIER_FALLBACK=1)
 *   HOLO_ALLOW_FRONTIER_FALLBACK                  '1' = let sovereign/auto fall back to a
 *                                                 frontier API; anything else = refuse (default)
 *   HOLO_ALLOW_HOSTED_BRIDGE                      '1' = let sovereign/auto take the cloud
 *                                                 (brittney-standard) route; anything else =
 *                                                 refuse (default). Applies to EVERY URL, loopback
 *                                                 included — see gateHostedBridge().
 *   HOLO_VAST_CODING_URL                          Work OSS coding proxy (default
 *                                                 http://127.0.0.1:18780). Loopback-only health
 *                                                 check. FOREIGN coding-backup — never native.
 *   HOLO_VAST_CODING_MODEL                        Served model name at that proxy (default
 *                                                 Qwen3-Coder-30B-A3B-Instruct).
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
import { admitHoloServeHealth, resolveLocalFleet } from './fleet-router';
import type { FleetBackend } from './fleet-router';

export type SovereignProviderName =
  | 'local-fleet'
  | 'fleet'
  | 'cloud'
  | 'holoserve'
  | 'holollama'
  | 'ollama'
  | 'vast-oss-coding'
  | 'anthropic'
  | 'xai'
  | 'openai';

/** Receipt / resolved-object step for the Joseph coding-backup chain. */
export type SovereignResolveStep =
  | 'native'
  | 'vast-oss-coding'
  | 'hosted-frontier'
  | 'hosted-bridge';

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
  /** Concrete owned-fleet wire protocol selected in-band by resolveLocalFleet. */
  fleetBackend?: FleetBackend;
  /** Exact parity-tested HoloServe binding when a strangler pin selected this route. */
  artifactBindingSha256?: string;
  /**
   * True when the sovereign/auto path landed on a frontier API (anthropic/xai/openai)
   * because HOLO_ALLOW_FRONTIER_FALLBACK=1 was set. Callers should record this in receipts.
   * Implies step:'hosted-frontier'. Never label this sovereign/native.
   */
  frontierFallback?: boolean;
  /**
   * True when the sovereign/auto path landed on the Brittney cloud route because
   * HOLO_ALLOW_HOSTED_BRIDGE=1 was set. That service may forward to hosted Fireworks /
   * Together — never label this result sovereign/native. Implies step:'hosted-bridge'.
   */
  hostedBridge?: boolean;
  /**
   * Joseph coding-backup chain step that produced this resolution.
   * native | vast-oss-coding | hosted-frontier | hosted-bridge.
   * Steps 2 and 3 must NEVER be labeled sovereign/native by callers.
   */
  step?: SovereignResolveStep;
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
  /**
   * Optional caller label for the frontier-fallback warning/error. When absent the
   * resolver derives one from the call stack (first frame outside this package).
   */
  caller?: string;
}

// ── frontier-fallback gate (2026-09-24 native-inference audit, fix 7) ───────
/**
 * The sovereign/auto path must never reach a frontier API (Anthropic, xAI, OpenAI)
 * silently. Before this gate, a process with no local endpoint env but any of
 * ANTHROPIC_API_KEY / XAI_API_KEY / OPENAI_API_KEY set resolved "sovereign" to that
 * frontier provider. Now it only does so with HOLO_ALLOW_FRONTIER_FALLBACK=1; otherwise
 * it logs a loud warning naming the provider and caller, and throws.
 * An EXPLICIT provider (opts.explicit / HOLO_LLM_PROVIDER = anthropic|xai|openai) is an
 * opt-in by itself and is not affected.
 */
export const FRONTIER_FALLBACK_FLAG = 'HOLO_ALLOW_FRONTIER_FALLBACK';

export type FrontierProviderName = 'anthropic' | 'xai' | 'openai';

export class FrontierFallbackRefusedError extends Error {
  readonly code = 'HOLO_FRONTIER_FALLBACK_REFUSED';
  readonly wouldHaveUsed: FrontierProviderName;
  readonly caller: string;
  constructor(wouldHaveUsed: FrontierProviderName, caller: string) {
    super(
      `REFUSING frontier fallback: sovereign/auto LLM resolution would have used ` +
        `"${wouldHaveUsed}" (a frontier API) for caller ${caller}, because no local or ` +
        `sovereign endpoint is configured (HOLO_LLM_SERVICE_URL / HOLOSERVE_URL / ` +
        `HOLOLLAMA_URL / OLLAMA_HOST) and a ${wouldHaveUsed} API key is present. ` +
        `Configure a local endpoint, pass an explicit provider, or set ` +
        `${FRONTIER_FALLBACK_FLAG}=1 to opt in to frontier fallback.`
    );
    this.name = 'FrontierFallbackRefusedError';
    this.wouldHaveUsed = wouldHaveUsed;
    this.caller = caller;
  }
}

function frontierFallbackAllowed(): boolean {
  return process.env[FRONTIER_FALLBACK_FLAG] === '1';
}

const OWN_FRAME_RE = /sovereign-resolver\.[cm]?[jt]s|llm-provider[\\/]dist[\\/]|node:internal/u;

function describeCaller(opts: SovereignResolveOptions): string {
  if (opts.caller) return opts.caller;
  const frames = (new Error().stack ?? '').split('\n').slice(1);
  for (const raw of frames) {
    const frame = raw.trim();
    if (frame && !OWN_FRAME_RE.test(frame)) return frame.replace(/^at\s+/u, '');
  }
  return process.argv[1] ? `script ${process.argv[1]}` : 'unknown caller';
}

export function gateFrontierFallback(
  name: FrontierProviderName,
  opts: SovereignResolveOptions,
  resolve: () => ResolvedSovereignProvider
): ResolvedSovereignProvider {
  const caller = describeCaller(opts);
  if (!frontierFallbackAllowed()) {
    console.warn(
      `[llm-provider] !!! FRONTIER FALLBACK REFUSED !!! sovereign/auto resolution would have ` +
        `used frontier provider "${name}" for caller ${caller}. Set ${FRONTIER_FALLBACK_FLAG}=1 ` +
        `to allow it, or configure a local endpoint / explicit provider.`
    );
    throw new FrontierFallbackRefusedError(name, caller);
  }
  console.warn(
    `[llm-provider] !!! FRONTIER FALLBACK ACTIVE !!! sovereign/auto resolution is using ` +
      `frontier provider "${name}" for caller ${caller} because ${FRONTIER_FALLBACK_FLAG}=1.`
  );
  return { ...resolve(), frontierFallback: true, step: 'hosted-frontier' };
}

// ── hosted-bridge gate (2026-09-24 native-inference audit, follow-up to fix 7) ──
/**
 * HOLO_LLM_SERVICE_URL points the "cloud" route at the Brittney llm-service
 * (HoloScript/services/llm-service, POST /api/chat). Its InferenceRouter sends
 * standard -> Fireworks (api.fireworks.ai, llama-v3p1-8b-instruct), pro -> Kimi K2.5 on
 * Fireworks, with Together (api.together.xyz) and Vast/Ollama as fallbacks, choosing a
 * provider by which API keys the SERVICE holds. The resolver cannot see those keys:
 *   - the sync path makes no network calls, and the service's GET /api/providers is an
 *     unauthenticated self-report, not an attestation;
 *   - the URL's host says nothing about where inference runs: the adapter's own default
 *     is http://localhost:8000, i.e. this same Fireworks-forwarding service run locally.
 * So "forwards to hosted" is not detectable here and a loopback/LAN URL is NOT evidence of
 * local inference. The rule this code can honestly enforce is: the auto path treats EVERY
 * cloud route as a hosted bridge and refuses it unless HOLO_ALLOW_HOSTED_BRIDGE=1. The host
 * class (loopback / lan / public) is reported in the log line for information only.
 * An EXPLICIT provider (opts.explicit / HOLO_LLM_PROVIDER = cloud) is an opt-in by itself.
 */
export const HOSTED_BRIDGE_FLAG = 'HOLO_ALLOW_HOSTED_BRIDGE';

export type ServiceHostClass = 'loopback' | 'lan' | 'public' | 'invalid';

/** Informational only (see above): never used to allow the route. */
export function classifyServiceHost(url: string): ServiceHostClass {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase().replace(/^\[|\]$/gu, '');
  } catch {
    return 'invalid';
  }
  if (host === 'localhost' || host === '::1' || /^127\./u.test(host)) return 'loopback';
  if (
    /^10\./u.test(host) ||
    /^192\.168\./u.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./u.test(host) ||
    /^169\.254\./u.test(host) ||
    /^f[cd][0-9a-f]{2}:/u.test(host) ||
    /^fe80:/u.test(host) ||
    host.endsWith('.local') ||
    host.endsWith('.lan') ||
    !host.includes('.')
  )
    return 'lan';
  return 'public';
}

/** Log/error-safe URL: drops userinfo, query and fragment (they can carry tokens). */
export function redactServiceUrl(url: string): string {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host}${u.pathname === '/' ? '' : u.pathname}`;
  } catch {
    return '<unparseable HOLO_LLM_SERVICE_URL>';
  }
}

export class HostedBridgeRefusedError extends Error {
  readonly code = 'HOLO_HOSTED_BRIDGE_REFUSED';
  readonly url: string;
  readonly hostClass: ServiceHostClass;
  readonly caller: string;
  constructor(url: string, hostClass: ServiceHostClass, caller: string) {
    super(
      `REFUSING hosted bridge: sovereign/auto LLM resolution would have used the cloud ` +
        `(brittney-standard) route at ${url} (host class: ${hostClass}) for caller ${caller}. ` +
        `That service forwards to hosted third-party models (Fireworks, Together) whenever it ` +
        `holds their keys, and the resolver cannot verify it does not, so it is not ` +
        `sovereign. Pass an explicit provider (provider=cloud), unset HOLO_LLM_SERVICE_URL, ` +
        `or set ${HOSTED_BRIDGE_FLAG}=1 to opt in.`
    );
    this.name = 'HostedBridgeRefusedError';
    this.url = url;
    this.hostClass = hostClass;
    this.caller = caller;
  }
}

function hostedBridgeAllowed(): boolean {
  return process.env[HOSTED_BRIDGE_FLAG] === '1';
}

function gateHostedBridge(
  cloudUrl: string,
  opts: SovereignResolveOptions,
  resolve: () => ResolvedSovereignProvider
): ResolvedSovereignProvider {
  const caller = describeCaller(opts);
  const url = redactServiceUrl(cloudUrl);
  const hostClass = classifyServiceHost(cloudUrl);
  if (!hostedBridgeAllowed()) {
    console.warn(
      `[llm-provider] !!! HOSTED BRIDGE REFUSED !!! sovereign/auto resolution would have used ` +
        `the cloud (brittney-standard) route ${url} (host class: ${hostClass}; may forward to ` +
        `Fireworks/Together) for caller ${caller}. Set ${HOSTED_BRIDGE_FLAG}=1 to allow it, or ` +
        `pass an explicit provider.`
    );
    throw new HostedBridgeRefusedError(url, hostClass, caller);
  }
  console.warn(
    `[llm-provider] !!! HOSTED BRIDGE ACTIVE !!! sovereign/auto resolution is using the cloud ` +
      `(brittney-standard) route ${url} (host class: ${hostClass}) for caller ${caller} because ` +
      `${HOSTED_BRIDGE_FLAG}=1. It may forward to hosted Fireworks/Together models.`
  );
  return { ...resolve(), hostedBridge: true, step: 'hosted-bridge' };
}

// ── Joseph coding-backup chain (2026-09-24): native → vast-oss-coding → gated hosted ──

export const VAST_OSS_CODING_DEFAULT_URL = 'http://127.0.0.1:18780';
export const VAST_OSS_CODING_DEFAULT_MODEL = 'Qwen3-Coder-30B-A3B-Instruct';
export const VAST_CODING_URL_ENV = 'HOLO_VAST_CODING_URL';
export const VAST_CODING_MODEL_ENV = 'HOLO_VAST_CODING_MODEL';

/**
 * Fail-closed when native is down/unhealthy, the Work OSS coding proxy is down,
 * and no gated hosted/frontier opt-in is available. Loud log names every failed step.
 */
export class BackupChainExhaustedError extends Error {
  readonly code = 'HOLO_BACKUP_CHAIN_EXHAUSTED';
  readonly failures: string[];
  constructor(failures: string[], caller: string) {
    const named = failures.length ? failures.join(' | ') : 'no-steps-attempted';
    super(
      `BACKUP CHAIN EXHAUSTED for caller ${caller}: ${named}. ` +
        `Order is native (HOLOSERVE) → vast-oss-coding (Work proxy :18780) → ` +
        `hosted only with ${HOSTED_BRIDGE_FLAG}=1 / ${FRONTIER_FALLBACK_FLAG}=1. ` +
        `Failing closed — will not silently call a frontier API or label a foreign route native.`
    );
    this.name = 'BackupChainExhaustedError';
    this.failures = failures;
  }
}

function isLoopbackUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    const host = u.hostname.toLowerCase();
    return host === '127.0.0.1' || host === 'localhost' || host === '::1';
  } catch {
    return false;
  }
}

function vastCodingUrlFromEnv(): string | undefined {
  return env(VAST_CODING_URL_ENV);
}

function vastCodingUrlForAsyncProbe(): string {
  return (vastCodingUrlFromEnv() || VAST_OSS_CODING_DEFAULT_URL).replace(/\/+$/, '');
}

function resolveVastOssCoding(
  baseUrlOverride: string | undefined,
  opts: SovereignResolveOptions
): ResolvedSovereignProvider {
  const baseURL = (baseUrlOverride || vastCodingUrlFromEnv() || VAST_OSS_CODING_DEFAULT_URL).replace(
    /\/+$/,
    ''
  );
  if (!isLoopbackUrl(baseURL)) {
    throw new Error(
      `vast-oss-coding proxy URL must be loopback-only (got ${baseURL}). ` +
        `Set ${VAST_CODING_URL_ENV} to http://127.0.0.1:18780 (Work house proxy). ` +
        `Refusing non-loopback to avoid cross-route / accidental frontier egress.`
    );
  }
  const model =
    modelOverride(opts) || env(VAST_CODING_MODEL_ENV) || VAST_OSS_CODING_DEFAULT_MODEL;
  const provider = new LocalLLMAdapter({
    baseURL,
    model,
    nativeOllamaApi: false,
    timeoutMs: 300_000,
  });
  return {
    provider,
    model,
    maxTokens: maxTokensOverride(opts) || 8192,
    providerName: 'vast-oss-coding',
    step: 'vast-oss-coding',
  };
}

/**
 * Lightweight health probe for the Work holo-inference-proxy. Loopback only.
 * Does NOT require HoloServe sovereignty invariants (this is a FOREIGN coding-backup).
 */
async function probeVastOssCodingProxy(baseURL: string): Promise<void> {
  if (!isLoopbackUrl(baseURL)) {
    throw new Error(`refusing non-loopback vast-oss-coding health probe: ${baseURL}`);
  }
  const response = await fetch(`${baseURL}/health`, { signal: AbortSignal.timeout(5_000) });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} from ${baseURL}/health`);
  }
}


function isNativeUnreachableError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  // Network/down only — sovereignty impostor / artifact-binding refusals must NOT
  // fall through to the foreign coding-backup (fail closed on honesty violations).
  return /unreachable|ECONNREFUSED|ETIMEDOUT|AbortError|fetch failed|network|ENOTFOUND|EHOSTUNREACH/i.test(
    msg
  );
}

function withNativeStep(resolved: ResolvedSovereignProvider): ResolvedSovereignProvider {
  // holoserve / holollama / ollama / local-fleet are native-side. Never apply to vast/frontier.
  if (
    resolved.providerName === 'holoserve' ||
    resolved.providerName === 'holollama' ||
    resolved.providerName === 'ollama' ||
    resolved.providerName === 'local-fleet'
  ) {
    return { ...resolved, step: resolved.step ?? 'native' };
  }
  return resolved;
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
 * Synchronous sovereign-first resolution: cloud → holoserve → holollama → ollama →
 * [anthropic → xai → openai ONLY with HOLO_ALLOW_FRONTIER_FALLBACK=1, else refuse] →
 * holollama terminal default. Fleet (dynamic-resolve) needs a network round-trip — use
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
    case 'vast-oss-coding':
    case 'vast-coding':
      return resolveVastOssCoding(undefined, opts);
    case 'fleet':
      throw new Error(
        'provider=fleet requires async resolution (Vast serverless route probe) — ' +
          'call resolveSovereignProviderAsync().'
      );
    case 'local-fleet':
      throw new Error(
        'provider=local-fleet requires async resolution (owned model-fleet discovery) — ' +
          'call resolveSovereignProviderAsync().'
      );
    default:
      throw new Error(
        `Unknown LLM provider "${explicit}". ` +
          `Valid: local-fleet | fleet | cloud | holoserve | holollama | ollama | vast-oss-coding | anthropic | xai | openai | sovereign/auto.`
      );
  }

  // Auto-detect: Joseph coding-backup order (2026-09-24).
  //   1. native (HOLOSERVE → holollama → ollama)
  //   2. vast-oss-coding (explicit HOLO_VAST_CODING_URL only in sync — async probes default :18780)
  //   3. hosted-bridge / hosted-frontier ONLY with opt-in flags
  //   else D.117 holollama terminal default (empty config ergonomics)
  // Sync cannot health-check; resolveSovereignProviderAsync enforces healthy failover.
  const holoServeUrl = env('HOLOSERVE_URL', 'HOLOSERVE_ENDPOINT');
  if (holoServeUrl) return withNativeStep(resolveHoloServe(holoServeUrl, opts, allowParityHoloServe));
  const vastCodingUrl = vastCodingUrlFromEnv();
  if (vastCodingUrl) return resolveVastOssCoding(vastCodingUrl, opts);
  const holoLlamaUrl = env('HOLOLLAMA_URL', 'HOLOLLAMA_ENDPOINT');
  if (holoLlamaUrl) return withNativeStep(resolveHoloLlama(holoLlamaUrl, opts, allowParityHoloServe));
  if (ollamaHost) return withNativeStep(resolveOllama(ollamaHost, opts));
  // Hosted-bridge gate: Brittney llm-service may forward to Fireworks/Together. Never silent.
  if (cloudUrl) return gateHostedBridge(cloudUrl, opts, () => resolveCloud(cloudUrl, opts));
  // Frontier fallback GATED (fix 7): never silent.
  if (anthropicKey)
    return gateFrontierFallback('anthropic', opts, () => resolveAnthropic(anthropicKey, opts));
  if (env('XAI_API_KEY')) return gateFrontierFallback('xai', opts, () => resolveXai(opts));
  if (env('OPENAI_API_KEY'))
    return gateFrontierFallback('openai', opts, () => resolveOpenai(opts));

  // Sovereign default (D.117): HoloLlama at :18080 when the backup chain had nothing configured.
  return withNativeStep(resolveHoloLlama(undefined, opts, allowParityHoloServe));
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
  const auto =
    explicit === undefined || explicit === '' || explicit === 'auto' || explicit === 'sovereign';
  const localFleetBrain = env('HOLO_LLM_FLEET_BRAIN');
  const localFleetConfigured = explicit === 'local-fleet' || (auto && Boolean(localFleetBrain));

  if (localFleetConfigured) {
    const picked = await resolveLocalFleet({
      brainPath: localFleetBrain,
      model: modelOverride(opts),
    });
    if (picked) {
      const provider = new LocalLLMAdapter({
        baseURL: picked.baseURL,
        model: picked.model,
        nativeOllamaApi: picked.backend === 'ollama',
        timeoutMs: 300_000,
      });
      return {
        provider,
        model: picked.model,
        maxTokens: maxTokensOverride(opts) || 4096,
        providerName: 'local-fleet',
        fleetBackend: picked.backend,
        step: 'native',
      };
    }
    if (explicit === 'local-fleet') {
      throw new Error(
        'No admitted owned local fleet route is available. Check the @model_fleet brain, ' +
          'node registry, and backend health/sovereignty receipts.'
      );
    }
  }

  const fleetConfigured = explicit === 'fleet' || (auto && Boolean(env('VAST_API_KEY')));

  if (fleetConfigured) {
    try {
      return await resolveFleet(opts);
    } catch (fleetErr) {
      // Cold/unreachable fleet → sync fallback for THIS request. If none is
      // configured either, surface the fleet error (it has the warm-up hint).
      let fallback: ResolvedSovereignProvider;
      try {
        fallback = resolveSovereignProviderInternal({ ...opts, explicit: undefined }, true);
      } catch (fallbackResolveErr) {
        // A refused frontier fallback must surface as itself, not be masked by the
        // cold-fleet error (2026-09-24 audit, fix 7).
        if (
          fallbackResolveErr instanceof FrontierFallbackRefusedError ||
          fallbackResolveErr instanceof HostedBridgeRefusedError ||
          fallbackResolveErr instanceof BackupChainExhaustedError
        )
          throw fallbackResolveErr;
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
  // Explicit providers: resolve + finalize (parity/sovereignty checks) as before.
  if (!auto) {
    const resolved = resolveSovereignProviderInternal(opts, true);
    const finalized = await finalizeAsyncResolution(resolved, opts);
    if (
      finalized.providerName === 'holoserve' ||
      finalized.providerName === 'holollama' ||
      finalized.providerName === 'ollama'
    ) {
      return { ...finalized, step: finalized.step ?? 'native' };
    }
    if (finalized.providerName === 'vast-oss-coding') {
      return { ...finalized, step: 'vast-oss-coding' };
    }
    return finalized;
  }

  // Joseph coding-backup chain (async, health-aware): native → vast-oss-coding → gated hosted.
  // Does NOT silently fall into frontier via llm-provider; step 2 is the Work loopback proxy only.
  return resolveOrderedBackupChainAsync(opts);
}


async function resolveOrderedBackupChainAsync(
  opts: SovereignResolveOptions
): Promise<ResolvedSovereignProvider> {
  const caller = opts.caller || 'resolveSovereignProviderAsync';
  const failures: string[] = [];
  const cloudUrl = env('HOLO_LLM_SERVICE_URL', 'BRITTNEY_SERVICE_URL');
  const anthropicKey = opts.anthropicKey || env('ANTHROPIC_API_KEY');
  const holoServeUrl = env('HOLOSERVE_URL', 'HOLOSERVE_ENDPOINT');
  const holoLlamaUrl = env('HOLOLLAMA_URL', 'HOLOLLAMA_ENDPOINT');
  const ollamaHost = env('OLLAMA_HOST', 'OLLAMA_BASE_URL', 'OLLAMA_URL');

  // Step 1 — native (HoloServe when configured).
  if (holoServeUrl) {
    try {
      const native = withNativeStep(resolveHoloServe(holoServeUrl, opts, true));
      await finalizeAsyncResolution(native, opts);
      console.warn(
        `[sovereign-resolver] BACKUP CHAIN step=native caller=${caller} url=${holoServeUrl}`
      );
      return native;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!isNativeUnreachableError(err)) {
        console.error(
          `[sovereign-resolver] BACKUP CHAIN step=native REFUSED (not unreachable) caller=${caller}: ${msg}`
        );
        throw err;
      }
      failures.push(`native:${msg}`);
      console.warn(
        `[sovereign-resolver] BACKUP CHAIN step=native FAILED caller=${caller}: ${msg}`
      );
    }
  } else {
    failures.push('native:HOLOSERVE_URL unset');
  }

  // Local native peers (holollama/ollama) still count as step=native when URLs are set,
  // before foreign coding-backup. Distinct from Vast Work proxy.
  if (holoLlamaUrl) {
    try {
      const native = withNativeStep(
        await finalizeAsyncResolution(resolveHoloLlama(holoLlamaUrl, opts, true), opts)
      );
      console.warn(
        `[sovereign-resolver] BACKUP CHAIN step=native(holollama) caller=${caller} url=${holoLlamaUrl}`
      );
      return native;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      failures.push(`native-holollama:${msg}`);
      console.warn(
        `[sovereign-resolver] BACKUP CHAIN step=native(holollama) FAILED caller=${caller}: ${msg}`
      );
    }
  }
  if (ollamaHost) {
    try {
      const native = withNativeStep(
        await finalizeAsyncResolution(resolveOllama(ollamaHost, opts), opts)
      );
      console.warn(
        `[sovereign-resolver] BACKUP CHAIN step=native(ollama) caller=${caller} url=${ollamaHost}`
      );
      return native;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      failures.push(`native-ollama:${msg}`);
      console.warn(
        `[sovereign-resolver] BACKUP CHAIN step=native(ollama) FAILED caller=${caller}: ${msg}`
      );
    }
  }

  // Step 2 — Vast/Work OSS coding proxy (FOREIGN). Loopback health-check only.
  // Probe default :18780 only when native was configured and failed, or when
  // HOLO_VAST_CODING_URL is explicit. Never uses llm-provider frontier fallback;
  // never labeled native/sovereign.
  const codingUrlExplicit = vastCodingUrlFromEnv();
  const nativeConfigured = Boolean(holoServeUrl || holoLlamaUrl || ollamaHost);
  const nativeFailed = failures.some(
    (f) =>
      f.startsWith('native:') ||
      f.startsWith('native-holollama:') ||
      f.startsWith('native-ollama:')
  );
  const shouldProbeCoding =
    Boolean(codingUrlExplicit) || (nativeConfigured && nativeFailed);
  if (shouldProbeCoding) {
    const codingUrl = (codingUrlExplicit || VAST_OSS_CODING_DEFAULT_URL).replace(/\/+$/, '');
    if (isLoopbackUrl(codingUrl)) {
      try {
        await probeVastOssCodingProxy(codingUrl);
        const foreign = resolveVastOssCoding(codingUrl, opts);
        console.warn(
          `[sovereign-resolver] BACKUP CHAIN step=vast-oss-coding caller=${caller} url=${codingUrl} ` +
            `(FOREIGN open-weight coding-backup — NOT native/sovereign)`
        );
        return foreign;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        failures.push(`vast-oss-coding:${msg}`);
        console.warn(
          `[sovereign-resolver] BACKUP CHAIN step=vast-oss-coding FAILED caller=${caller}: ${msg}`
        );
      }
    } else {
      failures.push(`vast-oss-coding:non-loopback-refused:${codingUrl}`);
    }
  }

  // Step 3 — closed hosted / frontier ONLY with matching opt-in flags.
  if (cloudUrl) {
    return gateHostedBridge(cloudUrl, opts, () => resolveCloud(cloudUrl, opts));
  }
  if (anthropicKey) {
    return gateFrontierFallback('anthropic', opts, () => resolveAnthropic(anthropicKey, opts));
  }
  if (env('XAI_API_KEY')) {
    return gateFrontierFallback('xai', opts, () => resolveXai(opts));
  }
  if (env('OPENAI_API_KEY')) {
    return gateFrontierFallback('openai', opts, () => resolveOpenai(opts));
  }

  // Fail closed when native was configured (or local peers were) and everything failed,
  // or when foreign proxy failed and frontier keys exist without flags (gates already threw).
  const attemptedNative = Boolean(holoServeUrl || holoLlamaUrl || ollamaHost);
  if (attemptedNative) {
    console.error(
      `[sovereign-resolver] BACKUP CHAIN EXHAUSTED caller=${caller} failures=${failures.join(' | ')}`
    );
    throw new BackupChainExhaustedError(failures, caller);
  }

  // Virgin empty config: keep D.117 holollama terminal default (no throw).
  // Still finalize — a parity-pinned model may strangler-route to HoloServe and must verify.
  console.warn(
    `[sovereign-resolver] BACKUP CHAIN empty-config → D.117 holollama default caller=${caller} ` +
      `failures=${failures.join(' | ')}`
  );
  return withNativeStep(
    await finalizeAsyncResolution(resolveHoloLlama(undefined, opts, true), opts)
  );
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
    'operator' | 'code' | 'vision' | 'reasoning' | undefined;
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
