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
  init?: { method?: string; headers?: Record<string, string>; signal?: AbortSignal }
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
      nodes.push({
        handle,
        models: listField(sub.inner, 'models') ?? [],
        role: scalarString(sub.inner, 'role'),
        alwaysOn: scalarBool(sub.inner, 'alwaysOn'),
      });
      // Remove the node sub-block from the top-level view so its keys
      // (models:, role:) cannot be mis-read as fleet-level fields.
      topLevel = topLevel.replace(fleet.slice(m.index, sub.end), ' ');
    }
    subRe.lastIndex = sub.end; // skip past nested braces we already consumed
  }

  return {
    nodes,
    strategy: scalarString(topLevel, 'strategy') ?? 'least-loaded',
    warmPreferred: scalarBool(topLevel, 'warm_preferred') ?? true,
    blacklist: listField(topLevel, 'blacklist') ?? [],
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

// ── Routing ─────────────────────────────────────────────────────────────────────

/**
 * Route one request across the fleet: pick the least-loaded reachable GPU that
 * has a usable model, preferring a node where the model is already warm.
 *
 * Returns null only when NO fleet node is reachable (caller falls back to the
 * single-endpoint local picker / configured provider).
 */
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
        return discoverNode(n.handle, endpoint, isBlocked, {
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
  const installedSomewhere = (model: string): boolean => discovered.some((d) => d.installed.includes(model));

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
      .filter((d) => d.installed.includes(model))
      .map((d) => ({ handle: d.handle, baseURL: d.baseURL, model, warm: d.warm.has(model), loadScore: d.loadScore }));
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

  // Rank: warm first (when warm-preferred), then least-loaded GPU.
  candidates.sort((a, b) => {
    if (spec.warmPreferred && a.warm !== b.warm) return a.warm ? -1 : 1;
    return a.loadScore - b.loadScore;
  });

  const chosen = candidates[0];
  const reason = `${spec.warmPreferred && chosen.warm ? 'warm' : 'least-loaded'} · ${chosen.handle} · load=${chosen.loadScore}${
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
