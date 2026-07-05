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
 * `~/.ai-ecosystem/config/sovereign-devices/<handle>.json` and each fleet node
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

import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { isBlacklistedModel } from './model-policy';

/** Serving backend a fleet node runs. Default (unset) = Ollama. */
export type FleetBackend = 'ollama' | 'llama.cpp';

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
   * `/slots`. The same least-loaded / warm-preferred ranking applies to both, so a
   * llama.cpp node authored with `backend: "llama.cpp"` load-balances beside the
   * Ollama nodes on the two owned GPUs.
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
}

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
}

/** A routing candidate (node, model) the router weighed. */
export interface FleetCandidate {
  handle: string;
  baseURL: string;
  model: string;
  warm: boolean;
  loadScore: number;
}

/** The chosen route across the fleet. */
export interface FleetRoute extends FleetCandidate {
  reason: string;
  candidates: FleetCandidate[];
}

/** Minimal `fetch` shape so tests can inject a fake without a real network. */
export type FetchLike = (
  url: string,
  init?: { method?: string; headers?: Record<string, string>; signal?: AbortSignal; body?: string }
) => Promise<{ ok: boolean; json(): Promise<unknown> }>;

export interface FleetRouteOptions {
  /** Requested model (e.g. the brain's @provider_policy prefer). Blacklisted → ignored. */
  model?: string;
  /** Per-fetch timeout in ms (default 6000 — node discovery should be snappy). */
  timeoutMs?: number;
  /** Override the registry directory (default env SOVEREIGN_DEVICES_DIR or ~/.ai-ecosystem/...). */
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
    const handle = scalarString(sub.inner, 'node');
    if (handle) {
      const backendRaw = scalarString(sub.inner, 'backend');
      const backend: FleetBackend | undefined =
        backendRaw === 'llama.cpp' || backendRaw === 'ollama' ? backendRaw : undefined;
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
export async function resolveNodeEndpoint(handle: string, registryDir?: string): Promise<string | null> {
  try {
    const file = join(registryDirDefault(registryDir), `${handle}.json`);
    const dev = JSON.parse(await readFile(file, 'utf8')) as RegistryDevice;
    const cap = (dev.capabilities ?? []).find((c) => c.id === 'local-llm');
    const endpoint = cap?.endpoint;
    if (typeof endpoint === 'string' && /^https?:\/\//.test(endpoint)) return endpoint.replace(/\/$/, '');
    return null;
  } catch {
    return null;
  }
}

// ── Live discovery (/api/tags + /api/ps) ────────────────────────────────────────

interface TagsResponse {
  models?: Array<{ name?: string }>;
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
  default_generation_settings?: { model?: string; model_path?: string };
}
interface SlotsResponse extends Array<{ id?: number; state?: number; is_processing?: boolean }> {}

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

  const tags = await fetchJson<TagsResponse>(fetchImpl, `${base}/api/tags`, timeoutMs);
  if (!tags) return null; // unreachable → not a routable node this turn

  const installed = (tags.models ?? [])
    .map((x) => x.name)
    .filter((n): n is string => typeof n === 'string' && !isBlocked(n));

  const ps = await fetchJson<PsResponse>(fetchImpl, `${base}/api/ps`, timeoutMs);
  const warm = new Set<string>();
  let loadScore = 0;
  for (const p of ps?.models ?? []) {
    if (typeof p.name === 'string') warm.add(p.name);
    if (typeof p.size_vram === 'number') loadScore += p.size_vram;
  }

  return { handle, baseURL: base, installed, warm, loadScore };
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
  const fetchImpl = opts.fetchImpl ?? (globalThis.fetch as unknown as FetchLike);
  const timeoutMs = opts.timeoutMs ?? 6000;
  const base = baseURL.replace(/\/$/, '');

  const health = await fetchJson<unknown>(fetchImpl, `${base}/health`, timeoutMs);
  if (health === null) return null; // unreachable / not ok → not a routable node this turn

  const props = await fetchJson<PropsResponse>(fetchImpl, `${base}/props`, timeoutMs);
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
  const installed = isBlocked(rawModel) ? [] : [rawModel];
  const warm = new Set<string>(installed);

  const slots = await fetchJson<SlotsResponse>(fetchImpl, `${base}/slots`, timeoutMs);
  const busySlots = Array.isArray(slots)
    ? slots.filter((s) => s?.is_processing === true || (typeof s?.state === 'number' && s.state !== 0))
        .length
    : 0;
  // Scale busy slots into a byte-ish magnitude comparable to Ollama's size_vram-based
  // loadScore, so a busy llama.cpp node does not read as ~1e9x freer than a resident
  // Ollama node in the shared least-loaded sort. Idle (0 slots) = 0 = genuinely free;
  // cross-backend comparison remains nominal (Ollama load conflates resident with active).
  const loadScore = busySlots * 1_000_000_000;

  return { handle, baseURL: base, installed, warm, loadScore };
}

// ── Routing ─────────────────────────────────────────────────────────────────────

/**
 * Route one request across the fleet: pick the least-loaded reachable GPU that
 * has a usable model, preferring a node where the model is already warm.
 *
 * Returns null only when NO fleet node is reachable (caller falls back to the
 * single-endpoint local picker / configured provider).
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

  const resolveEndpoint = opts.resolveEndpoint ?? ((h: string) => resolveNodeEndpoint(h, opts.registryDir));

  // Discover every declared node in parallel; drop unreachable / unregistered.
  const discovered = (
    await Promise.all(
      spec.nodes.map(async (n) => {
        const endpoint = await resolveEndpoint(n.handle);
        if (!endpoint) return null;
        const discover = n.backend === 'llama.cpp' ? discoverLlamaCppNode : discoverNode;
        return discover(n.handle, endpoint, isBlocked, {
          timeoutMs: opts.timeoutMs,
          fetchImpl: opts.fetchImpl,
        });
      })
    )
  ).filter((d): d is NodeDiscovery => d !== null && d.installed.length > 0);

  if (discovered.length === 0) return null;

  const requested = opts.model && !isBlocked(opts.model) ? opts.model : undefined;

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
      .map((d) => ({ handle: d.handle, baseURL: d.baseURL, model, warm: warmSomewhere(d.warm, model), loadScore: d.loadScore }));
  } else {
    // No shared/declared model installed anywhere → each node offers its own
    // first installed model. Routing then just picks the freest GPU.
    candidates = discovered.map((d) => ({
      handle: d.handle,
      baseURL: d.baseURL,
      model: d.installed[0],
      warm: d.warm.has(d.installed[0]),
      loadScore: d.loadScore,
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
  const spilled = spec.primary && chosen.handle !== spec.primary ? ' (primary saturated → overflow)' : '';
  const reason = `${tier} · ${chosen.handle} · load=${chosen.loadScore}${spilled}${
    requested && chosen.model !== requested ? ` (requested ${requested} not installed; using ${chosen.model})` : ''
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
): Promise<{ baseURL: string; model: string; route: FleetRoute } | null> {
  const brainPath = opts.brainPath || process.env.HOLO_LLM_FLEET_BRAIN;
  const spec = opts.spec ?? (brainPath ? await loadFleetSpec(brainPath) : null);
  if (!spec || spec.nodes.length === 0) return null;
  const route = await pickFleetModel(spec, opts);
  if (!route) return null;
  return { baseURL: route.baseURL, model: route.model, route };
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
