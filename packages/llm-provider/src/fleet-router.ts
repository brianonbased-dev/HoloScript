/**
 * Local multi-GPU fleet router — routes one inference request across the
 * OWNED-metal GPU nodes (Jetson Orin + dev-laptop RTX 3060) so both cards
 * answer as ONE local tier instead of one sitting idle while the other queues.
 *
 * This is the runtime the native HoloScript brain
 * `compositions/model-fleet.hsplus` declares (founder 2026-06-16, "this is
 * supposed to be native holoscript"): the `.hsplus` is the SPEC, this module is
 * the consumer. The single-endpoint {@link pickLocalModel} is its degenerate
 * one-node case.
 *
 * Endpoint resolution is by sovereign-devices registry HANDLE, never a
 * hardcoded address (founder ruling 2026-06-16): a `localhost` literal is
 * consumer-relative and only correct on the node it runs on. The git-tracked
 * registry is the source of truth for node identity (pillar 8). It lives at
 * `config/sovereign-devices/<handle>.json` and each fleet node
 * carries a `local-llm` capability whose `endpoint` is the LAN-absolute Ollama
 * URL. A node with no resolvable `local-llm` endpoint is simply not a fleet
 * member right now — the fleet degrades to whatever IS reachable (Jetson-only
 * until the laptop's Ollama binds `0.0.0.0`).
 *
 * Routing = the least-loaded GPU that HAS the model, warm-preferred. Live model
 * inventory + load come from each node's Ollama (`/api/tags` + `/api/ps`);
 * blacklist + safe fallback come from the model-policy SSOT. $0 marginal — both
 * nodes are owned metal.
 */

import { createHash } from 'node:crypto';
import { readFile, realpath } from 'node:fs/promises';
import { homedir } from 'node:os';
import { isAbsolute, join, relative, resolve as resolvePath, sep } from 'node:path';
import { isBlacklistedModel } from './model-policy';
import { DEFAULT_FLEET_PLACEMENT_POLICY, planFleetPlacement } from './fleet-placement';
import type {
  FleetPlacementManifest,
  FleetPlacementOptions,
  FleetPlacementPolicy,
  FleetPlacementReceipt,
} from './fleet-placement';

/** Serving backend a fleet node runs. Default (unset) = Ollama. */
export type FleetBackend = 'ollama' | 'llama.cpp' | 'pytorch-holo';

const HOLOSERVE_REGISTRY_SCHEMA = 'holoscript.holoserve-model-artifact-registry.v0.1.0';
const HOLOSERVE_BINDING_SCHEMA = 'holoscript.holoserve-model-artifact-binding.v0.1.0';
const HOLOSERVE_BINS_SCHEMA = 'holoscript.holoserve-bins-binding.v0.1.0';
const SHA256_RE = /^sha256:[0-9a-f]{64}$/u;
const PORTABLE_MODEL_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,255}$/u;
const SAFE_NODE_HANDLE_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,255}$/u;
const WINDOWS_RESERVED_NODE_HANDLE_RE = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu;

type JsonRecord = Record<string, unknown>;

export interface HoloServeArtifactAdmission {
  defaultModel: string;
  selectedModel: string;
  /** Every resident model whose exact artifact binding was admitted. */
  models: string[];
  /** Canonical SHA-256 of the selected exact artifact binding. */
  bindingSha256: string;
  /** Canonical SHA-256 of the complete exact registry, used to detect probe-time drift. */
  registrySha256: string;
}

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isSafeNodeHandle(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    SAFE_NODE_HANDLE_RE.test(value) &&
    !value.endsWith('.') &&
    !WINDOWS_RESERVED_NODE_HANDLE_RE.test(value)
  );
}

function isContainedPath(root: string, candidate: string): boolean {
  const pathFromRoot = relative(root, candidate);
  return (
    pathFromRoot.length > 0 &&
    pathFromRoot !== '..' &&
    !pathFromRoot.startsWith(`..${sep}`) &&
    !isAbsolute(pathFromRoot)
  );
}

function hasExactKeys(value: JsonRecord, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return actual.length === wanted.length && actual.every((key, index) => key === wanted[index]);
}

function canonicalJsonValue(value: unknown, seen: Set<object>): unknown {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('non-finite JSON number');
    return value;
  }
  if (typeof value !== 'object') throw new Error('non-JSON value');
  if (seen.has(value)) throw new Error('cyclic JSON value');
  seen.add(value);
  try {
    if (Array.isArray(value)) {
      return value.map((entry) => canonicalJsonValue(entry, seen));
    }
    if (Object.getOwnPropertySymbols(value).length !== 0)
      throw new Error('symbol-keyed JSON value');
    const canonical: JsonRecord = {};
    for (const key of Object.keys(value).sort()) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) {
        throw new Error('accessor-backed JSON value');
      }
      canonical[key] = canonicalJsonValue(descriptor.value, seen);
    }
    return canonical;
  } finally {
    seen.delete(value);
  }
}

function canonicalJsonSha256(value: unknown): string | null {
  try {
    const canonical = canonicalJsonValue(value, new Set<object>());
    const body = JSON.stringify(canonical);
    if (typeof body !== 'string') return null;
    return `sha256:${createHash('sha256').update(body, 'utf8').digest('hex')}`;
  } catch {
    return null;
  }
}

function validHoloServeBinding(value: unknown): value is JsonRecord {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ['schema', 'available', 'checkpointSha256', 'tokenizerSha256', 'bins'])
  )
    return false;
  if (value.schema !== HOLOSERVE_BINDING_SCHEMA || value.available !== true) return false;
  if (typeof value.checkpointSha256 !== 'string' || !SHA256_RE.test(value.checkpointSha256))
    return false;
  if (typeof value.tokenizerSha256 !== 'string' || !SHA256_RE.test(value.tokenizerSha256))
    return false;

  const bins = value.bins;
  if (!isRecord(bins) || !hasExactKeys(bins, ['schema', 'files', 'bindingSha256'])) return false;
  if (bins.schema !== HOLOSERVE_BINS_SCHEMA) return false;
  if (typeof bins.bindingSha256 !== 'string' || !SHA256_RE.test(bins.bindingSha256)) return false;
  const files = bins.files;
  if (!isRecord(files) || !hasExactKeys(files, ['meta.json', 'tokenizer.json'])) return false;
  const metaSha256 = files['meta.json'];
  const tokenizerSha256 = files['tokenizer.json'];
  if (typeof metaSha256 !== 'string' || !SHA256_RE.test(metaSha256)) return false;
  if (typeof tokenizerSha256 !== 'string' || !SHA256_RE.test(tokenizerSha256)) return false;
  if (value.tokenizerSha256 !== tokenizerSha256) return false;

  const binsPayload = { schema: bins.schema, files };
  return canonicalJsonSha256(binsPayload) === bins.bindingSha256;
}

/**
 * Admit one HoloServe health payload only when its model registry binds exact,
 * canonical artifact identities. This is deliberately stricter than checking
 * sovereignty labels: a model name without a valid bytes binding is not routable.
 */
export function admitHoloServeHealth(
  health: unknown,
  expectedModel?: string
): HoloServeArtifactAdmission | null {
  // A real response came from strict JSON. Reject injected/proxied NaN, Infinity,
  // accessors, cycles, undefined, or other values JSON could not faithfully carry.
  if (canonicalJsonSha256(health) === null || !isRecord(health)) return null;
  if (
    health.status !== 'ok' ||
    health.backend !== 'pytorch-holo' ||
    health.sovereign !== true ||
    health.llama_cpp !== false ||
    health.gguf !== false
  )
    return null;

  const registry = health.model_artifact_bindings;
  if (!isRecord(registry) || !hasExactKeys(registry, ['schema', 'defaultModel', 'models']))
    return null;
  if (registry.schema !== HOLOSERVE_REGISTRY_SCHEMA) return null;
  const defaultModel = registry.defaultModel;
  if (typeof defaultModel !== 'string' || !PORTABLE_MODEL_RE.test(defaultModel)) return null;
  const models = registry.models;
  if (!isRecord(models)) return null;
  const modelNames = Object.keys(models).sort();
  if (modelNames.length === 0 || modelNames.some((name) => !PORTABLE_MODEL_RE.test(name)))
    return null;
  for (const name of modelNames) {
    if (!validHoloServeBinding(models[name])) return null;
  }
  if (!Object.prototype.hasOwnProperty.call(models, defaultModel)) return null;

  const modelSummary = health.model;
  if (!isRecord(modelSummary) || modelSummary.name !== defaultModel) return null;
  const advertisedModels = health.models;
  if (
    !Array.isArray(advertisedModels) ||
    advertisedModels.some((name) => typeof name !== 'string') ||
    new Set(advertisedModels).size !== advertisedModels.length ||
    [...advertisedModels].sort().some((name, index) => name !== modelNames[index]) ||
    advertisedModels.length !== modelNames.length
  )
    return null;

  const selectedModel = expectedModel ?? defaultModel;
  if (
    !PORTABLE_MODEL_RE.test(selectedModel) ||
    !Object.prototype.hasOwnProperty.call(models, selectedModel)
  ) {
    return null;
  }
  const bindingSha256 = canonicalJsonSha256(models[selectedModel]);
  const registrySha256 = canonicalJsonSha256(registry);
  if (!bindingSha256 || !registrySha256) return null;
  return { defaultModel, selectedModel, models: modelNames, bindingSha256, registrySha256 };
}

/** One declared fleet node. Addresses are NOT here — only the registry handle. */
export interface FleetNode {
  /** sovereign-devices registry handle, e.g. "jetson-orin". */
  handle: string;
  /** Declared model hints (the runtime re-discovers what is actually installed). */
  models: string[];
  /** Human role note from the brain (diagnostics only). */
  role?: string;
  /** Whether the node is expected to be always-on (diagnostics only). */
  alwaysOn?: boolean;
  /**
   * Serving backend. Unset/`ollama` → discovered via Ollama `/api/tags` + `/api/ps`.
   * `llama.cpp` → discovered via a HoloLlama llama-server's `/health` + `/props` +
   * `/slots`. `pytorch-holo` → discovered via the SAME three routes on a HoloServe
   * native sovereign server (scripts/holoserve.py in ai-ecosystem, D.118 — no
   * llama.cpp/GGUF), with `/health` additionally required to ASSERT sovereignty
   * (`sovereign:true`, not `llama_cpp:true`) before the node is admitted. The same
   * least-loaded / warm-preferred ranking applies to all three, so every backend
   * kind load-balances beside the others on the owned GPUs.
   */
  backend?: FleetBackend;
}

/** The parsed `@model_fleet` declaration. */
export interface FleetSpec {
  nodes: FleetNode[];
  /** Routing strategy, e.g. "least-loaded". */
  strategy: string;
  /** Prefer a node where the model is already resident in VRAM. */
  warmPreferred: boolean;
  /** Spec-level blacklist (merged with the model-policy blacklist). */
  blacklist: string[];
  /**
   * Primary node handle — the node that should carry the MAIN inference load.
   * The router prefers it over all others UNTIL its VRAM load crosses
   * `primaryMaxLoadBytes`, then spills to the next-freest node (the overflow
   * GPUs "on top"). Unset → pure strategy ranking. (founder 2026-06-17:
   * "the jetson handles the main inference and the laptop provides GPU on top".)
   */
  primary?: string;
  /** VRAM-resident bytes above which the primary is "saturated" → spill. Default 6 GB. */
  primaryMaxLoadBytes?: number;
  /**
   * Fail-closed placement policy authored by `@model_fleet`. The v1 planner is
   * metadata-only: exact warm artifacts, one worker island, direct data plane,
   * and no spend, provisioning, remote code, generic RPC, or cross-worker TP.
   */
  placementPolicy: FleetPlacementPolicy;
}

/** Placement inputs whose safety policy is supplied by the authored fleet spec. */
export type FleetModelPlacementOptions = Omit<FleetPlacementOptions, 'manifest'> & {
  manifest: Omit<FleetPlacementManifest, 'policy'>;
};

/** Live per-node inventory + load. */
export interface NodeDiscovery {
  handle: string;
  baseURL: string;
  /** Installed, non-blacklisted model tags (`/api/tags`). */
  installed: string[];
  /** Models currently resident in VRAM (`/api/ps`). */
  warm: Set<string>;
  /** Sum of resident model `size_vram` bytes — lower = freer GPU. */
  loadScore: number;
  /**
   * Which serving backend answered discovery. Carried through to the route so a
   * consumer knows which API shape the chosen node speaks (Ollama `/api/chat` vs
   * OpenAI-compat `/v1/*`) instead of guessing from a `:11434` port heuristic.
   */
  backend: FleetBackend;
}

/** A routing candidate (node, model) the router weighed. */
export interface FleetCandidate {
  handle: string;
  baseURL: string;
  model: string;
  warm: boolean;
  loadScore: number;
  /** Serving backend of the node (see {@link NodeDiscovery.backend}). */
  backend: FleetBackend;
}

/** The chosen route across the fleet. */
export interface FleetRoute extends FleetCandidate {
  reason: string;
  candidates: FleetCandidate[];
}

/** Minimal `fetch` shape so tests can inject a fake without a real network. */
export type FetchLike = (
  url: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    signal?: AbortSignal;
    body?: string;
    redirect?: 'error' | 'follow' | 'manual';
  }
) => Promise<{ ok: boolean; json(): Promise<unknown> }>;

export interface FleetRouteOptions {
  /** Requested model (e.g. the brain's @provider_policy prefer). Blacklisted → fail closed. */
  model?: string;
  /** Per-fetch timeout in ms (default 6000 — node discovery should be snappy). */
  timeoutMs?: number;
  /** Override the registry directory (default env SOVEREIGN_DEVICES_DIR or a local config directory). */
  registryDir?: string;
  /** Inject a fetch (tests). Defaults to global fetch. */
  fetchImpl?: FetchLike;
  /** Inject endpoint resolution (tests). Defaults to registry-file resolution. */
  resolveEndpoint?: (handle: string) => Promise<string | null>;
}

// ── @model_fleet parsing ──────────────────────────────────────────────────────

/** Brace-match: given src[open] === '{', return the inner text and the index past '}'. */
function matchBraces(src: string, open: number): { inner: string; end: number } | null {
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    const ch = src[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return { inner: src.slice(open + 1, i), end: i + 1 };
    }
  }
  return null;
}

function scalarString(block: string, key: string): string | undefined {
  const re = new RegExp(`\\b${key}\\s*:\\s*"([^"]*)"`);
  const m = re.exec(block);
  return m ? m[1] : undefined;
}

function scalarBool(block: string, key: string): boolean | undefined {
  const re = new RegExp(`\\b${key}\\s*:\\s*(true|false)\\b`);
  const m = re.exec(block);
  return m ? m[1] === 'true' : undefined;
}

function listField(block: string, key: string): string[] | undefined {
  const re = new RegExp(`\\b${key}\\s*:\\s*\\[([^\\]]*)\\]`);
  const m = re.exec(block);
  if (!m) return undefined;
  return m[1]
    .split(',')
    .map((s) => s.trim().replace(/^["']|["']$/g, ''))
    .filter((s) => s.length > 0);
}

function fieldCount(block: string, key: string): number {
  return [...block.matchAll(new RegExp(`\\b${key}\\s*:`, 'g'))].length;
}

/**
 * Parse the safety boundary for content-addressed fleet placement. Missing
 * fields inherit the safe v1 defaults for older compositions. Any explicitly
 * declared alternate value is rejected rather than silently weakened.
 */
function parsePlacementPolicy(block: string): FleetPlacementPolicy | null {
  const stringFields = [
    ['artifact_mode', 'warm_only'],
    ['data_plane', 'direct_worker'],
    ['parallel_scope', 'single_worker'],
    ['spend', 'forbidden'],
    ['provisioning', 'forbidden'],
  ] as const;
  const boolFields = ['remote_code', 'generic_rpc', 'inter_worker_tensor_transport'] as const;

  for (const [sourceKey, required] of stringFields) {
    const count = fieldCount(block, sourceKey);
    if (count > 1) return null;
    if (count === 0) continue;
    const value = scalarString(block, sourceKey);
    if (value !== required) return null;
  }
  for (const sourceKey of boolFields) {
    const count = fieldCount(block, sourceKey);
    if (count > 1) return null;
    if (count === 0) continue;
    const value = scalarBool(block, sourceKey);
    if (value !== false) return null;
  }
  return { ...DEFAULT_FLEET_PLACEMENT_POLICY };
}

/**
 * Parse a `@model_fleet { … }` block out of a `.hsplus` brain. Returns null when
 * the brain declares no fleet (so the caller falls back to single-node routing).
 *
 * Node sub-blocks are recognised structurally — any `name { … }` containing a
 * `node:` field is a fleet node — so the brain can name them freely
 * (jetson/laptop/…); top-level `strategy`/`warm_preferred`/`blacklist` are read
 * after the node sub-blocks are carved out, so a node's `models:` list never
 * leaks into the fleet-level blacklist.
 */
export function parseFleetSpec(brainSrc: string): FleetSpec | null {
  const header = /@model_fleet\s*\{/.exec(brainSrc);
  if (!header) return null;
  const block = matchBraces(brainSrc, header.index + header[0].length - 1);
  if (!block) return null;
  const fleet = block.inner;

  const nodes: FleetNode[] = [];
  let topLevel = fleet;
  // Walk every `name {` sub-block; keep those with a `node:` field as fleet nodes.
  const subRe = /(\w+)\s*\{/g;
  let m: RegExpExecArray | null;
  while ((m = subRe.exec(fleet)) !== null) {
    const sub = matchBraces(fleet, m.index + m[0].length - 1);
    if (!sub) continue;
    const nodeCount = fieldCount(sub.inner, 'node');
    if (nodeCount > 0) {
      if (nodeCount !== 1) return null;
      const handle = scalarString(sub.inner, 'node');
      if (!isSafeNodeHandle(handle)) return null;
      const backendCount = fieldCount(sub.inner, 'backend');
      if (backendCount > 1) return null;
      const backendRaw = scalarString(sub.inner, 'backend');
      if (
        backendCount === 1 &&
        backendRaw !== 'llama.cpp' &&
        backendRaw !== 'ollama' &&
        backendRaw !== 'pytorch-holo'
      ) {
        return null;
      }
      const backend = backendRaw as FleetBackend | undefined;
      nodes.push({
        handle,
        models: listField(sub.inner, 'models') ?? [],
        role: scalarString(sub.inner, 'role'),
        alwaysOn: scalarBool(sub.inner, 'alwaysOn'),
        ...(backend ? { backend } : {}),
      });
      // Remove the node sub-block from the top-level view so its keys
      // (models:, role:) cannot be mis-read as fleet-level fields.
      topLevel = topLevel.replace(fleet.slice(m.index, sub.end), ' ');
    }
    subRe.lastIndex = sub.end; // skip past nested braces we already consumed
  }

  const primaryMaxLoadGb = scalarString(topLevel, 'primary_max_load_gb');
  const placementPolicy = parsePlacementPolicy(topLevel);
  if (!placementPolicy) return null;
  return {
    nodes,
    strategy: scalarString(topLevel, 'strategy') ?? 'least-loaded',
    warmPreferred: scalarBool(topLevel, 'warm_preferred') ?? true,
    blacklist: listField(topLevel, 'blacklist') ?? [],
    primary: scalarString(topLevel, 'primary'),
    primaryMaxLoadBytes:
      primaryMaxLoadGb && Number.isFinite(Number(primaryMaxLoadGb))
        ? Number(primaryMaxLoadGb) * 1_000_000_000
        : undefined,
    placementPolicy,
  };
}

/** Load + parse a fleet spec from a brain file path. Null on any read/parse miss. */
export async function loadFleetSpec(brainPath: string): Promise<FleetSpec | null> {
  try {
    return parseFleetSpec(await readFile(brainPath, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * Plan one digest-bound worker placement under the policy authored by
 * `@model_fleet`. The pure planner performs no lease, provisioning, network,
 * artifact, spend, RPC, or tensor-transport side effect.
 */
export function planFleetModelPlacement(
  spec: FleetSpec,
  options: FleetModelPlacementOptions
): FleetPlacementReceipt {
  return planFleetPlacement({
    ...options,
    manifest: {
      ...options.manifest,
      policy: { ...spec.placementPolicy },
    },
  });
}

// ── Endpoint resolution (sovereign-devices registry) ───────────────────────────

function registryDirDefault(override?: string): string {
  return (
    override ||
    process.env.SOVEREIGN_DEVICES_DIR ||
    join(homedir(), '.ai-ecosystem', 'config', 'sovereign-devices')
  );
}

interface RegistryCapability {
  id?: string;
  endpoint?: string;
}
interface RegistryDevice {
  capabilities?: RegistryCapability[];
}

/**
 * Resolve a node handle → its LAN-absolute Ollama endpoint by reading
 * `<registryDir>/<handle>.json` and returning the `local-llm` capability's
 * `endpoint`. Null when the file is missing, unparseable, or carries no
 * `local-llm` endpoint (→ the node is not a fleet member right now).
 */
export async function resolveNodeEndpoint(
  handle: string,
  registryDir?: string
): Promise<string | null> {
  if (!isSafeNodeHandle(handle)) return null;
  try {
    const registryRoot = await realpath(registryDirDefault(registryDir));
    const requestedFile = resolvePath(registryRoot, `${handle}.json`);
    if (!isContainedPath(registryRoot, requestedFile)) return null;

    // Resolve the file itself before reading so an in-registry symlink or junction
    // cannot escape the sovereign-device root after the lexical handle check.
    const file = await realpath(requestedFile);
    if (!isContainedPath(registryRoot, file)) return null;
    const dev = JSON.parse(await readFile(file, 'utf8')) as RegistryDevice;
    const cap = (dev.capabilities ?? []).find((c) => c.id === 'local-llm');
    const endpoint = cap?.endpoint;
    if (typeof endpoint === 'string' && /^https?:\/\//.test(endpoint))
      return endpoint.replace(/\/$/, '');
    return null;
  } catch {
    return null;
  }
}

// ── Live discovery (/api/tags + /api/ps) ────────────────────────────────────────

interface TagsResponse {
  models: Array<{ name: string }>;
}
interface PsResponse {
  models?: Array<{ name?: string; size_vram?: number }>;
}

// llama-server (build 7885) discovery surface: /props reports the single loaded
// model, /slots reports per-slot busy state. A llama-server serves exactly ONE
// model and holds it resident once /health is ok, so there is no cold/warm split.
interface PropsResponse {
  model?: string;
  model_path?: string;
  default_generation_settings?: { model?: string; model_path?: string; n_ctx?: number };
  total_slots?: number;
  backend?: string;
  models?: string[];
}
interface SlotsResponse extends Array<{
  id?: number;
  state?: number;
  is_processing?: boolean;
  model?: string;
}> {}

function isOllamaTagsResponse(value: unknown): value is TagsResponse {
  return (
    isRecord(value) &&
    Array.isArray(value.models) &&
    value.models.every(
      (model) => isRecord(model) && typeof model.name === 'string' && model.name.length > 0
    )
  );
}

function validOptionalString(record: JsonRecord, key: string): boolean {
  return (
    !Object.prototype.hasOwnProperty.call(record, key) ||
    (typeof record[key] === 'string' && (record[key] as string).length > 0)
  );
}

function isPropsResponse(value: unknown): value is PropsResponse {
  if (!isRecord(value)) return false;
  if (!validOptionalString(value, 'model') || !validOptionalString(value, 'model_path'))
    return false;
  if (!validOptionalString(value, 'backend')) return false;

  if (Object.prototype.hasOwnProperty.call(value, 'default_generation_settings')) {
    const settings = value.default_generation_settings;
    if (!isRecord(settings)) return false;
    if (!validOptionalString(settings, 'model') || !validOptionalString(settings, 'model_path'))
      return false;
    if (
      Object.prototype.hasOwnProperty.call(settings, 'n_ctx') &&
      (!Number.isSafeInteger(settings.n_ctx) || (settings.n_ctx as number) <= 0)
    )
      return false;
  }

  if (
    Object.prototype.hasOwnProperty.call(value, 'total_slots') &&
    (!Number.isSafeInteger(value.total_slots) || (value.total_slots as number) < 0)
  )
    return false;
  if (
    Object.prototype.hasOwnProperty.call(value, 'models') &&
    (!Array.isArray(value.models) ||
      value.models.some((model) => typeof model !== 'string' || model.length === 0))
  )
    return false;
  return true;
}

function isExactLlamaCppHealth(value: unknown): boolean {
  return isRecord(value) && hasExactKeys(value, ['status']) && value.status === 'ok';
}

async function fetchJson<T>(
  fetchImpl: FetchLike,
  url: string,
  timeoutMs: number,
  init?: { method?: string; headers?: Record<string, string> }
): Promise<T | null> {
  try {
    const r = await fetchImpl(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
    if (!r.ok) return null;
    return (await r.json()) as T;
  } catch {
    return null;
  }
}

/**
 * Probe one node's Ollama: installed models (`/api/tags`, blacklist-filtered) +
 * resident models with their VRAM load (`/api/ps`). Returns null when the node
 * is unreachable (so it is dropped from routing).
 */
export async function discoverNode(
  handle: string,
  baseURL: string,
  isBlocked: (name: string) => boolean,
  opts: { timeoutMs?: number; fetchImpl?: FetchLike } = {}
): Promise<NodeDiscovery | null> {
  const fetchImpl = opts.fetchImpl ?? (globalThis.fetch as unknown as FetchLike);
  const timeoutMs = opts.timeoutMs ?? 6000;
  const base = baseURL.replace(/\/$/, '');

  const tags = await fetchJson<unknown>(fetchImpl, `${base}/api/tags`, timeoutMs);
  if (!isOllamaTagsResponse(tags)) return null;

  const installed = tags.models.map((model) => model.name).filter((name) => !isBlocked(name));

  const ps = await fetchJson<PsResponse>(fetchImpl, `${base}/api/ps`, timeoutMs);
  if (!ps || !Array.isArray(ps.models)) return null;
  const warm = new Set<string>();
  let loadScore = 0;
  for (const p of ps.models) {
    if (
      !isRecord(p) ||
      typeof p.name !== 'string' ||
      p.name.length === 0 ||
      !Number.isSafeInteger(p.size_vram) ||
      (p.size_vram ?? -1) < 0
    ) {
      return null;
    }
    warm.add(p.name);
    loadScore += p.size_vram as number;
  }

  return { handle, baseURL: base, installed, warm, loadScore, backend: 'ollama' };
}

/** Basename of a model path without directory or extension (for a friendly model id). */
function modelIdFromPath(p: string): string {
  const base = p.split(/[\\/]/).pop() ?? p;
  return base.replace(/\.(gguf|bin|safetensors)$/i, '');
}

/**
 * Probe one HoloLlama llama-server node: gate on `/health`, read the single loaded
 * model from `/props`, and derive load from busy `/slots`. Returns the SAME
 * {@link NodeDiscovery} shape as {@link discoverNode} so the router ranks llama.cpp
 * and Ollama nodes identically. Returns null when `/health` is unreachable/not-ok
 * (so the node is dropped from routing this turn).
 *
 * A llama-server serves exactly one model and holds it resident once `/health` is
 * ok, so `installed` is that one model and `warm` is the same single element — there
 * is no cold state to distinguish. loadScore is the count of busy slots (a small
 * integer); cross-backend load magnitudes are nominal, but the model-match filter
 * plus the primary/warm tiers (checked before loadScore) keep routing sensible.
 */
export async function discoverLlamaCppNode(
  handle: string,
  baseURL: string,
  isBlocked: (name: string) => boolean,
  opts: { timeoutMs?: number; fetchImpl?: FetchLike } = {}
): Promise<NodeDiscovery | null> {
  return discoverSingleModelServer(
    handle,
    baseURL,
    isBlocked,
    'llama.cpp',
    isExactLlamaCppHealth,
    opts
  );
}

/**
 * Probe one HoloServe node (the native PyTorch-direct sovereign server, D.118 —
 * scripts/holoserve.py in ai-ecosystem). Same `/health` + `/props` + `/slots`
 * surface while its exact health registry may advertise multiple resident models, so it
 * shares {@link discoverLlamaCppNode}'s discovery body — with one addition: the
 * `/health` body must MACHINE-CHECKABLY assert sovereignty (`sovereign: true` and
 * not `llama_cpp: true`). A node declared `backend: "pytorch-holo"` whose health
 * doesn't carry that claim (e.g. someone pointed the handle at a llama-server) is
 * dropped rather than routed as sovereign.
 * Admission additionally requires the exact canonical model-artifact registry,
 * agreement with `/props`, finite slot
 * telemetry, and an unchanged registry after all discovery probes.
 */
export async function discoverPytorchHoloNode(
  handle: string,
  baseURL: string,
  isBlocked: (name: string) => boolean,
  opts: { timeoutMs?: number; fetchImpl?: FetchLike } = {}
): Promise<NodeDiscovery | null> {
  const sovereignGate = (health: unknown): boolean => {
    // Demand the exact artifact registry as well as the typed sovereignty claim.
    // It rejects stringly boolean claims and payloads missing required fields; HoloServe
    // sends both booleans — a payload missing either is not making the claim.
    return admitHoloServeHealth(health) !== null;
  };
  return discoverSingleModelServer(handle, baseURL, isBlocked, 'pytorch-holo', sovereignGate, opts);
}

/** Shared OpenAI-compatible discovery: gate on `/health`, identity from `/props`, load from `/slots`. */
async function discoverSingleModelServer(
  handle: string,
  baseURL: string,
  isBlocked: (name: string) => boolean,
  backend: FleetBackend,
  healthGate: (health: unknown) => boolean,
  opts: { timeoutMs?: number; fetchImpl?: FetchLike } = {}
): Promise<NodeDiscovery | null> {
  const fetchImpl = opts.fetchImpl ?? (globalThis.fetch as unknown as FetchLike);
  const timeoutMs = opts.timeoutMs ?? 6000;
  const base = baseURL.replace(/\/$/, '');

  const health = await fetchJson<unknown>(fetchImpl, `${base}/health`, timeoutMs);
  if (health === null) return null; // unreachable / not ok → not a routable node this turn
  if (!healthGate(health)) return null; // reachable but fails the backend's health claim → dropped

  const initialHoloAdmission = backend === 'pytorch-holo' ? admitHoloServeHealth(health) : null;
  if (backend === 'pytorch-holo' && !initialHoloAdmission) return null;

  const rawProps = await fetchJson<unknown>(fetchImpl, `${base}/props`, timeoutMs);
  if (!isPropsResponse(rawProps)) return null;
  const props = rawProps;
  const rawModel =
    props?.default_generation_settings?.model ??
    props?.model ??
    (props?.model_path ? modelIdFromPath(props.model_path) : undefined) ??
    (props?.default_generation_settings?.model_path
      ? modelIdFromPath(props.default_generation_settings.model_path)
      : undefined);
  // /props gave no servable model (unreachable/flaky/empty) → drop the node rather than
  // fabricating the handle as a model id the server cannot actually serve. Same "no usable
  // model → dropped" contract as the Ollama path (an empty installed list is filtered out).
  if (!rawModel) return null;
  if (initialHoloAdmission && rawModel !== initialHoloAdmission.defaultModel) return null;
  if (initialHoloAdmission) {
    if (
      props.backend !== 'pytorch-holo' ||
      props.model !== initialHoloAdmission.defaultModel ||
      props.default_generation_settings?.model !== initialHoloAdmission.defaultModel ||
      !Number.isInteger(props.default_generation_settings?.n_ctx) ||
      (props.default_generation_settings?.n_ctx ?? 0) <= 0 ||
      !Number.isInteger(props.total_slots) ||
      (props.total_slots ?? 0) <= 0 ||
      !Array.isArray(props.models) ||
      props.models.length !== initialHoloAdmission.models.length ||
      [...props.models].sort().some((model, index) => model !== initialHoloAdmission.models[index])
    )
      return null;
  }
  const residentModels = initialHoloAdmission?.models ?? [rawModel];
  const installed = residentModels.filter((model) => !isBlocked(model));
  const warm = new Set<string>(installed);

  const slots = await fetchJson<SlotsResponse>(fetchImpl, `${base}/slots`, timeoutMs);
  if (!Array.isArray(slots) || slots.length === 0) return null;
  if (!initialHoloAdmission) {
    for (const slot of slots) {
      if (!isRecord(slot)) return null;
      const hasState = Object.prototype.hasOwnProperty.call(slot, 'state');
      const hasProcessing = Object.prototype.hasOwnProperty.call(slot, 'is_processing');
      if (!hasState && !hasProcessing) return null;
      if (hasState && (!Number.isInteger(slot.state) || (slot.state as number) < 0)) return null;
      if (hasProcessing && typeof slot.is_processing !== 'boolean') return null;
    }
  }
  if (initialHoloAdmission) {
    if (slots.length !== props.total_slots) return null;
    const slotIds = new Set<number>();
    for (const slot of slots) {
      if (!isRecord(slot)) return null;
      if (
        !Number.isInteger(slot.id) ||
        (slot.id ?? -1) < 0 ||
        slotIds.has(slot.id as number) ||
        !Number.isInteger(slot.state) ||
        (slot.state ?? -1) < 0 ||
        typeof slot.is_processing !== 'boolean' ||
        typeof slot.model !== 'string' ||
        !initialHoloAdmission.models.includes(slot.model)
      )
        return null;
      slotIds.add(slot.id as number);
    }
  }
  const busySlots = slots.filter(
    (s) => s.is_processing === true || (typeof s.state === 'number' && s.state !== 0)
  ).length;
  // Scale busy slots into a byte-ish magnitude comparable to Ollama's size_vram-based
  // loadScore, so a busy llama.cpp node does not read as ~1e9x freer than a resident
  // Ollama node in the shared least-loaded sort. Idle (0 slots) = 0 = genuinely free;
  // cross-backend comparison remains nominal (Ollama load conflates resident with active).
  const loadScore = busySlots * 1_000_000_000;

  if (initialHoloAdmission) {
    // Re-read identity after the other discovery probes so a process restart or
    // mutable registry cannot splice one model binding into another route.
    const finalHealth = await fetchJson<unknown>(fetchImpl, `${base}/health`, timeoutMs);
    const finalAdmission = admitHoloServeHealth(finalHealth, initialHoloAdmission.defaultModel);
    if (
      !finalAdmission ||
      finalAdmission.defaultModel !== initialHoloAdmission.defaultModel ||
      finalAdmission.bindingSha256 !== initialHoloAdmission.bindingSha256 ||
      finalAdmission.registrySha256 !== initialHoloAdmission.registrySha256
    )
      return null;
  }

  return { handle, baseURL: base, installed, warm, loadScore, backend };
}

// ── Routing ─────────────────────────────────────────────────────────────────────

/**
 * Route one request across the fleet: pick the least-loaded reachable GPU that
 * has a usable model, preferring a node where the model is already warm.
 *
 * Returns null when no fleet node is reachable or an explicit model request is
 * policy-blocked (callers must not silently substitute a different model).
 */
/**
 * Ollama stores a model pulled by bare name (`ollama pull nomic-embed-text`) as
 * `nomic-embed-text:latest` and reports that suffixed tag in `/api/tags`, yet it
 * accepts the bare name in `/api/embed` and `/api/chat`. So a request for the bare
 * name must match the `:latest` tag, or any bare-pulled model (the common case)
 * silently fails to route. Normalize a trailing `:latest` away for comparison.
 */
function normalizeModelTag(name: string): string {
  return name.endsWith(':latest') ? name.slice(0, -':latest'.length) : name;
}
/** True if two Ollama model names refer to the same model (`:latest`-tolerant). */
function sameModel(a: string, b: string): boolean {
  return a === b || normalizeModelTag(a) === normalizeModelTag(b);
}

export async function pickFleetModel(
  spec: FleetSpec,
  opts: FleetRouteOptions = {}
): Promise<FleetRoute | null> {
  const extraBlacklist = spec.blacklist.map((s) => s.toLowerCase());
  const isBlocked = (name: string): boolean =>
    isBlacklistedModel(name) || extraBlacklist.some((b) => name.toLowerCase().includes(b));

  // A denied explicit request is a policy decision, not a fallback hint. Reject it
  // before resolving or probing endpoints so another model cannot mask the denial.
  if (opts.model && isBlocked(opts.model)) return null;

  const resolveEndpoint =
    opts.resolveEndpoint ?? ((h: string) => resolveNodeEndpoint(h, opts.registryDir));

  // Discover every declared node in parallel; drop unreachable / unregistered.
  const discovered = (
    await Promise.all(
      spec.nodes.map(async (n) => {
        try {
          const endpoint = await resolveEndpoint(n.handle);
          if (!endpoint) return null;
          const discover =
            n.backend === 'llama.cpp'
              ? discoverLlamaCppNode
              : n.backend === 'pytorch-holo'
                ? discoverPytorchHoloNode
                : discoverNode;
          return await discover(n.handle, endpoint, isBlocked, {
            timeoutMs: opts.timeoutMs,
            fetchImpl: opts.fetchImpl,
          });
        } catch {
          return null;
        }
      })
    )
  ).filter((d): d is NodeDiscovery => d !== null && d.installed.length > 0);

  if (discovered.length === 0) return null;

  const requested = opts.model;

  // Choose the target model: the requested one if any reachable node has it;
  // else the first declared model that is actually installed somewhere; else the
  // best-installed model on the least-loaded node (so the fleet always answers).
  // `:latest`-tolerant so a bare-pulled model (reported as `name:latest`) still matches.
  const installedSomewhere = (model: string): boolean =>
    discovered.some((d) => d.installed.some((inst) => sameModel(inst, model)));
  const warmSomewhere = (warm: Set<string>, model: string): boolean =>
    [...warm].some((w) => sameModel(w, model));

  let targetModel: string | undefined;
  if (requested && installedSomewhere(requested)) {
    targetModel = requested;
  } else {
    const declared = spec.nodes.flatMap((n) => n.models);
    targetModel = declared.find((m) => !isBlocked(m) && installedSomewhere(m));
  }

  let candidates: FleetCandidate[];
  if (targetModel) {
    const model = targetModel;
    candidates = discovered
      .filter((d) => d.installed.some((inst) => sameModel(inst, model)))
      .map((d) => ({
        handle: d.handle,
        baseURL: d.baseURL,
        model,
        warm: warmSomewhere(d.warm, model),
        loadScore: d.loadScore,
        backend: d.backend,
      }));
  } else {
    // No shared/declared model installed anywhere → each node offers its own
    // first installed model. Routing then just picks the freest GPU.
    candidates = discovered.map((d) => ({
      handle: d.handle,
      baseURL: d.baseURL,
      model: d.installed[0],
      warm: d.warm.has(d.installed[0]),
      loadScore: d.loadScore,
      backend: d.backend,
    }));
  }

  // The primary node carries the main load: it wins over everything UNTIL its
  // VRAM load crosses the saturation line, then the overflow GPUs compete by load
  // ("the jetson handles the main inference and the laptop provides GPU on top").
  const primaryMaxLoad = spec.primaryMaxLoadBytes ?? 6_000_000_000;
  const isPreferredPrimary = (c: FleetCandidate): boolean =>
    !!spec.primary && c.handle === spec.primary && c.loadScore < primaryMaxLoad;

  // Rank: unsaturated primary first, then warm (when warm-preferred), then least-loaded GPU.
  candidates.sort((a, b) => {
    const ap = isPreferredPrimary(a);
    const bp = isPreferredPrimary(b);
    if (ap !== bp) return ap ? -1 : 1;
    if (spec.warmPreferred && a.warm !== b.warm) return a.warm ? -1 : 1;
    return a.loadScore - b.loadScore;
  });

  const chosen = candidates[0];
  const tier = isPreferredPrimary(chosen)
    ? 'primary'
    : spec.warmPreferred && chosen.warm
      ? 'warm'
      : 'least-loaded';
  const spilled =
    spec.primary && chosen.handle !== spec.primary ? ' (primary saturated → overflow)' : '';
  const reason = `${tier} · ${chosen.handle} · load=${chosen.loadScore}${spilled}${
    requested && chosen.model !== requested
      ? ` (requested ${requested} not installed; using ${chosen.model})`
      : ''
  }`;
  return { ...chosen, reason, candidates };
}

/**
 * High-level helper for callers that just want `(baseURL, model)` for the local
 * tier across both GPUs. Loads the fleet spec from `opts.brainPath` (or env
 * `HOLO_LLM_FLEET_BRAIN`), routes, and returns the pick — or null when no fleet
 * is declared / none reachable (caller then keeps its single-endpoint path).
 */
export async function resolveLocalFleet(
  opts: FleetRouteOptions & { brainPath?: string; spec?: FleetSpec } = {}
): Promise<{ baseURL: string; model: string; backend: FleetBackend; route: FleetRoute } | null> {
  const brainPath = opts.brainPath || process.env.HOLO_LLM_FLEET_BRAIN;
  const spec = opts.spec ?? (brainPath ? await loadFleetSpec(brainPath) : null);
  if (!spec || spec.nodes.length === 0) return null;
  const route = await pickFleetModel(spec, opts);
  if (!route) return null;
  return { baseURL: route.baseURL, model: route.model, backend: route.backend, route };
}

// ── Embeddings (the fleet routes embed requests too, not just chat) ─────────────

/**
 * Embed `text` via the fleet's embedding model, routed to whichever OWNED node has
 * it installed (default `nomic-embed-text` → the Jetson model store). Reuses the
 * same registry-handle endpoint resolution + live `/api/tags` discovery as chat
 * routing, then calls Ollama `POST /api/embed`. Returns the vector, or `null` on
 * ANY miss (no fleet / node down / model absent / bad response) so callers treat
 * embeddings as best-effort (a retrieval miss never breaks the turn). $0 — owned metal.
 */
export async function embedAcrossFleet(
  text: string,
  opts: FleetRouteOptions & { brainPath?: string; spec?: FleetSpec; embedModel?: string } = {}
): Promise<number[] | null> {
  const embedModel = opts.embedModel ?? 'nomic-embed-text';
  // Route to a node that actually has the embed model (pickFleetModel re-discovers
  // installed models via /api/tags, so the embed model need not be declared in the
  // @model_fleet brain — it just has to be installed somewhere reachable).
  const picked = await resolveLocalFleet({ ...opts, model: embedModel });
  if (!picked || picked.model !== embedModel) return null; // embed model not reachable on the fleet
  // `/api/embed` is an Ollama-native surface. A llama.cpp or pytorch-holo server
  // can legitimately win routing for the embed model name, but it
  // cannot answer this call — skip instead of POSTing into a 404. (Sovereign
  // embeddings are HoloEmbed's lane, not this chat fleet — see model-fleet.hsplus.)
  if (picked.backend !== 'ollama') return null;
  const fetchImpl = opts.fetchImpl ?? (globalThis.fetch as unknown as FetchLike);
  try {
    const r = await fetchImpl(`${picked.baseURL.replace(/\/$/, '')}/api/embed`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: embedModel, input: text }),
      signal: AbortSignal.timeout(opts.timeoutMs ?? 15000),
    });
    if (!r.ok) return null;
    const j = (await r.json()) as { embeddings?: number[][]; embedding?: number[] };
    const vec = j.embeddings?.[0] ?? j.embedding;
    return Array.isArray(vec) && vec.length > 0 ? vec : null;
  } catch {
    return null;
  }
}

/** Cosine similarity of two equal-length vectors. Returns 0 on mismatch / zero-norm. */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}
