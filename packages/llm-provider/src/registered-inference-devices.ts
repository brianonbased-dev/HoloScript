/**
 * Registered inference devices — "whatever hardware the user has registered".
 *
 * Studio / HoloShell device registration writes one `<handle>.json` per device into
 * the sovereign-devices registry ({@link resolveSovereignDevicesDir}). This module
 * reads EVERY registered device (not only the nodes a `@model_fleet` brain names),
 * keeps the capabilities that serve a general text model over an OpenAI-compatible
 * API, probes each one that is up with a short timeout, and returns them in the
 * order a caller should try them:
 *
 *   1. local  — endpoint on this machine (loopback)
 *   2. fleet  — endpoint on another owned device on the local network
 *
 * Within a tier an idle server comes before a busy one (single-slot HoloLlama
 * devices such as the Jetson queue every request behind the one in flight).
 * Public-host endpoints are never treated as registered hardware: anything that
 * costs money or leaves the owner's network belongs to the resolver's spend gates
 * (resolveSovereignProviderAsync), not here.
 *
 * Probing reuses the fleet router's discovery (`/health` + `/props` + `/slots`) so a
 * device is admitted by the same rules the fleet uses. Nothing is started, stopped,
 * or loaded: a device that is not already serving is skipped with a reason.
 *
 * Which capabilities count as a text model:
 *   - id `local-llm` (the registry's canonical LLM capability) or `holollama-*`
 *     (a HoloLlama llama-server lane), and
 *   - backend `llama.cpp` or `pytorch-holo` (both speak OpenAI `/v1/*`), and
 *   - status `available`, `proven`, or `shipped` (never `retired` / `planned`).
 * A HoloServe whose `/health` advertises an enabled typed-decision protocol serves
 * a decision model (answer/abstain tokens), not prose, so it is skipped too.
 */

import { readdir, readFile, realpath } from 'node:fs/promises';
import { isAbsolute, join, relative, sep } from 'node:path';
import { isBlacklistedModel, isOllamaCloudModel } from './model-policy';
import {
  discoverLlamaCppNode,
  discoverPytorchHoloNode,
  resolveSovereignDevicesDir,
  type FetchLike,
  type FleetBackend,
} from './fleet-router';
import { classifyServiceHost } from './sovereign-resolver';

export type RegisteredDeviceTier = 'local' | 'fleet';

/** One text-model capability declared in the registry (before probing). */
export interface RegisteredInferenceCapability {
  /** Registry handle (file name without `.json`). */
  handle: string;
  /** Capability id inside that file, e.g. `local-llm`, `holollama-fara`. */
  capabilityId: string;
  backend: FleetBackend;
  /** Endpoint URLs to try, most reliable first (`endpoint_ip` before an mDNS name). */
  endpoints: string[];
  /** Model the registry declares (the probe reports what is actually loaded). */
  declaredModel?: string;
}

/** A registered device that answered its probe and can take a request now. */
export interface RegisteredInferenceRoute {
  handle: string;
  capabilityId: string;
  tier: RegisteredDeviceTier;
  backend: FleetBackend;
  baseURL: string;
  /** Model the server reports as loaded. */
  model: string;
  /** Busy slots scaled by the fleet router (0 = idle). */
  loadScore: number;
}

/** A registered capability that was not routable this turn, and why. */
export interface RegisteredInferenceSkip {
  handle: string;
  capabilityId: string;
  endpoint?: string;
  reason: string;
}

export interface RegisteredInferenceProbe {
  registryDir: string;
  routes: RegisteredInferenceRoute[];
  skipped: RegisteredInferenceSkip[];
}

export interface RegisteredInferenceOptions {
  /** Registry directory override (default: SOVEREIGN_DEVICES_DIR or ~/.ai-ecosystem/...). */
  registryDir?: string;
  /** Per-request probe timeout in ms. Default 1500 — a down device must not stall a turn. */
  timeoutMs?: number;
  /** Inject fetch (tests). Defaults to global fetch. */
  fetchImpl?: FetchLike;
}

const TEXT_MODEL_STATUSES = new Set(['available', 'proven', 'shipped']);
const TEXT_MODEL_BACKENDS = new Set<FleetBackend>(['llama.cpp', 'pytorch-holo']);
const HANDLE_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isContained(root: string, candidate: string): boolean {
  const rel = relative(root, candidate);
  return rel.length > 0 && rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
}

function httpUrl(value: unknown): string | null {
  if (typeof value !== 'string' || !/^https?:\/\//iu.test(value)) return null;
  return value.replace(/\/+$/u, '');
}

function isTextModelCapabilityId(id: string): boolean {
  return id === 'local-llm' || id.startsWith('holollama-');
}

/**
 * Read every device file in the registry and return its text-model capabilities.
 * Unreadable or malformed files are skipped (a broken file never breaks routing).
 */
export async function listRegisteredInferenceCapabilities(
  registryDir?: string
): Promise<{ registryDir: string; capabilities: RegisteredInferenceCapability[] }> {
  const dir = resolveSovereignDevicesDir(registryDir);
  const capabilities: RegisteredInferenceCapability[] = [];
  let root: string;
  let names: string[];
  try {
    root = await realpath(dir);
    names = (await readdir(root)).filter((n) => n.endsWith('.json')).sort();
  } catch {
    return { registryDir: dir, capabilities };
  }

  for (const name of names) {
    const handle = name.slice(0, -'.json'.length);
    if (!HANDLE_RE.test(handle)) continue;
    let device: unknown;
    try {
      const file = await realpath(join(root, name));
      if (!isContained(root, file)) continue; // a link out of the registry is not a device
      device = JSON.parse(await readFile(file, 'utf8'));
    } catch {
      continue;
    }
    if (!isRecord(device) || !Array.isArray(device.capabilities)) continue;
    for (const cap of device.capabilities) {
      if (!isRecord(cap) || typeof cap.id !== 'string') continue;
      if (!isTextModelCapabilityId(cap.id)) continue;
      if (typeof cap.status !== 'string' || !TEXT_MODEL_STATUSES.has(cap.status)) continue;
      const backend = cap.backend as FleetBackend;
      if (!TEXT_MODEL_BACKENDS.has(backend)) continue;
      const endpoints = [httpUrl(cap.endpoint_ip), httpUrl(cap.endpoint)].filter(
        (u, i, all): u is string => u !== null && all.indexOf(u) === i
      );
      if (endpoints.length === 0) continue;
      capabilities.push({
        handle,
        capabilityId: cap.id,
        backend,
        endpoints,
        ...(typeof cap.model === 'string' ? { declaredModel: cap.model } : {}),
      });
    }
  }
  return { registryDir: dir, capabilities };
}

function tierOf(url: string): RegisteredDeviceTier | null {
  const cls = classifyServiceHost(url);
  if (cls === 'loopback') return 'local';
  if (cls === 'lan') return 'fleet';
  return null;
}

async function healthJson(
  fetchImpl: FetchLike,
  baseURL: string,
  timeoutMs: number
): Promise<unknown> {
  try {
    const r = await fetchImpl(`${baseURL}/health`, { signal: AbortSignal.timeout(timeoutMs) });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

function servesDecisionModel(health: unknown): boolean {
  return (
    isRecord(health) &&
    isRecord(health.typed_decision_protocol) &&
    health.typed_decision_protocol.enabled === true
  );
}

/**
 * Probe every registered text-model capability and return the ones that are up, in
 * try-order: local before fleet, idle before busy, registry order otherwise. The
 * same server reached through two capabilities (e.g. two files naming the Jetson's
 * llama-server) is probed and listed once.
 */
export async function probeRegisteredInferenceDevices(
  opts: RegisteredInferenceOptions = {}
): Promise<RegisteredInferenceProbe> {
  const timeoutMs = opts.timeoutMs ?? 1500;
  const fetchImpl = opts.fetchImpl ?? (globalThis.fetch as unknown as FetchLike);
  const { registryDir, capabilities } = await listRegisteredInferenceCapabilities(opts.registryDir);
  const isBlocked = (name: string): boolean => isBlacklistedModel(name) || isOllamaCloudModel(name);
  const skipped: RegisteredInferenceSkip[] = [];
  const seen = new Set<string>();

  const probes = capabilities.map(async (cap, order) => {
    const reasons: string[] = [];
    for (const endpoint of cap.endpoints) {
      const tier = tierOf(endpoint);
      if (!tier) {
        reasons.push(`${endpoint}: not on this machine or its local network`);
        continue;
      }
      if (seen.has(endpoint)) return null; // another capability already covers this server
      seen.add(endpoint);
      if (cap.backend === 'pytorch-holo') {
        const health = await healthJson(fetchImpl, endpoint, timeoutMs);
        if (health === null) {
          reasons.push(`${endpoint}: not answering /health`);
          continue;
        }
        if (servesDecisionModel(health)) {
          reasons.push(`${endpoint}: serves a typed-decision model, not a text model`);
          continue;
        }
      }
      const discover =
        cap.backend === 'pytorch-holo' ? discoverPytorchHoloNode : discoverLlamaCppNode;
      const found = await discover(cap.handle, endpoint, isBlocked, { timeoutMs, fetchImpl });
      if (!found || found.installed.length === 0) {
        reasons.push(`${endpoint}: not serving (no healthy model within ${timeoutMs} ms)`);
        continue;
      }
      return {
        order,
        route: {
          handle: cap.handle,
          capabilityId: cap.capabilityId,
          tier,
          backend: found.backend,
          baseURL: found.baseURL,
          model: found.installed[0],
          loadScore: found.loadScore,
        } satisfies RegisteredInferenceRoute,
      };
    }
    if (reasons.length > 0) {
      skipped.push({
        handle: cap.handle,
        capabilityId: cap.capabilityId,
        endpoint: cap.endpoints[0],
        reason: reasons.join('; '),
      });
    }
    return null;
  });

  const found = (await Promise.all(probes)).filter(
    (r): r is { order: number; route: RegisteredInferenceRoute } => r !== null
  );
  const tierRank = (t: RegisteredDeviceTier): number => (t === 'local' ? 0 : 1);
  found.sort(
    (a, b) =>
      tierRank(a.route.tier) - tierRank(b.route.tier) ||
      Number(a.route.loadScore > 0) - Number(b.route.loadScore > 0) ||
      a.order - b.order
  );
  return { registryDir, routes: found.map((f) => f.route), skipped };
}
