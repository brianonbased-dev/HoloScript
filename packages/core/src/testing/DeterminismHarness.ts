/**
 * DeterminismHarness
 *
 * Cross-backend determinism probing for HoloScript's empirical papers.
 * Single generic mechanism that Paper #2 (SNN-WebGPU), P2-0 (animation
 * retargeting), P2-1 (IK solver), and P3-CENTER (rendering) all
 * share — hash the probe's output, capture the execution environment,
 * report whether multiple runs converged to the same hash.
 *
 * Usage:
 *   const harness = new DeterminismHarness();
 *   const result = await harness.probe('snn-lif-1k-ticks', async () => {
 *     // ... run the computation, return Uint8Array of final state
 *     return new Uint8Array(outputBuffer);
 *   });
 *   // result.outputHash identifies this run's output.
 *
 *   // Collect results across backends, then:
 *   const report = DeterminismHarness.compareResults([resultA, resultB, resultC]);
 *   if (report.divergent) { ... }
 *
 * Intentionally framework-agnostic: works in a browser with WebGPU
 * available, in Node with no GPU, in a test fixture with synthetic
 * environment. The harness describes WHAT ran and where; papers
 * supply the probeFn that captures HOW.
 *
 * NORTH_STAR: this is infrastructure. Unblocks cross-backend
 * determinism benchmarks without forcing paper-specific harnesses
 * to re-implement environment capture + hashing + divergence
 * comparison separately.
 */

// =============================================================================
// ENVIRONMENT CAPTURE
// =============================================================================

export interface GpuInfo {
  vendor?: string;
  architecture?: string;
  device?: string;
  description?: string;
  backend?: string;
}

export interface NodeInfo {
  version: string;
  arch: string;
  platform: string;
}

export interface BrowserInfo {
  userAgent?: string;
  browser?: string;
  os?: string;
}

export interface EnvironmentInfo {
  runtime: 'browser' | 'node' | 'unknown';
  gpu?: GpuInfo;
  node?: NodeInfo;
  browser?: BrowserInfo;
  /** Caller-provided annotations (hardware class, test config, etc.) */
  annotations?: Record<string, string>;
}

type NavigatorWithGpu = {
  gpu?: {
    requestAdapter: () => Promise<{
      info?: Record<string, string | undefined>;
      requestAdapterInfo?: () => Promise<Record<string, string | undefined>>;
    } | null>;
  };
  userAgent?: string;
};

type ProcessLike = {
  versions?: { node?: string };
  arch?: string;
  platform?: string;
};

function getGlobal(): Record<string, unknown> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (globalThis as any) ?? {};
}

function detectRuntime(): 'browser' | 'node' | 'unknown' {
  const g = getGlobal();
  if (typeof g.window !== 'undefined' && typeof g.document !== 'undefined') {
    return 'browser';
  }
  if (typeof g.process !== 'undefined' && (g.process as ProcessLike).versions?.node) {
    return 'node';
  }
  return 'unknown';
}

function detectBrowserFromUserAgent(ua: string | undefined): { browser?: string; os?: string } {
  if (!ua) return {};
  let browser: string | undefined;
  let os: string | undefined;
  if (/Firefox\//.test(ua)) browser = 'firefox';
  else if (/Edg\//.test(ua)) browser = 'edge';
  else if (/Chrome\//.test(ua)) browser = 'chromium';
  else if (/Safari\//.test(ua)) browser = 'safari';
  if (/Windows NT/.test(ua)) os = 'windows';
  else if (/Mac OS X/.test(ua)) os = 'macos';
  else if (/Linux/.test(ua)) os = 'linux';
  else if (/Android/.test(ua)) os = 'android';
  else if (/iPhone|iPad/.test(ua)) os = 'ios';
  return { browser, os };
}

/**
 * Capture the current execution environment. Never throws — missing
 * fields are simply omitted.
 */
export async function captureEnvironment(
  annotations: Record<string, string> = {}
): Promise<EnvironmentInfo> {
  const runtime = detectRuntime();
  const g = getGlobal();
  const info: EnvironmentInfo = { runtime };
  if (Object.keys(annotations).length > 0) info.annotations = { ...annotations };

  if (runtime === 'browser') {
    const nav = g.navigator as NavigatorWithGpu | undefined;
    const ua = nav?.userAgent;
    info.browser = { userAgent: ua, ...detectBrowserFromUserAgent(ua) };

    if (nav?.gpu?.requestAdapter) {
      try {
        const adapter = await nav.gpu.requestAdapter();
        // Prefer adapter.info (newer spec); fall back to requestAdapterInfo().
        let gpuInfo: Record<string, string | undefined> | undefined = adapter?.info;
        if (!gpuInfo && adapter?.requestAdapterInfo) {
          gpuInfo = await adapter.requestAdapterInfo();
        }
        if (gpuInfo) {
          info.gpu = {
            vendor: gpuInfo.vendor,
            architecture: gpuInfo.architecture,
            device: gpuInfo.device,
            description: gpuInfo.description,
            backend: 'webgpu',
          };
        }
      } catch {
        // Adapter probing is best-effort — leave gpu undefined on failure.
      }
    }
  } else if (runtime === 'node') {
    const proc = g.process as ProcessLike | undefined;
    if (proc) {
      info.node = {
        version: proc.versions?.node ?? 'unknown',
        arch: proc.arch ?? 'unknown',
        platform: proc.platform ?? 'unknown',
      };
    }
  }

  return info;
}

// =============================================================================
// HASHING
// =============================================================================

function toUint8Array(input: Uint8Array | string): Uint8Array {
  if (input instanceof Uint8Array) return input;
  // Encode string as UTF-8.
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(input);
  }
  // Minimal fallback (Node without TextEncoder is ancient but guard anyway).
  const bytes = new Uint8Array(input.length);
  for (let i = 0; i < input.length; i++) bytes[i] = input.charCodeAt(i) & 0xff;
  return bytes;
}

/**
 * FNV-1a 64-bit hash. Deterministic, no dependencies, equal-speed
 * across Node and browser. Used as the default when SubtleCrypto is
 * unavailable or when a caller wants the faster non-cryptographic
 * hash for benchmarks.
 */
function fnv1a64Hex(bytes: Uint8Array): string {
  // FNV-1a 64-bit: offset = 0xcbf29ce484222325, prime = 0x100000001b3
  // JS can't hold 64-bit ints natively; use BigInt.
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  const mask = 0xffffffffffffffffn;
  for (let i = 0; i < bytes.length; i++) {
    hash = (hash ^ BigInt(bytes[i])) & mask;
    hash = (hash * prime) & mask;
  }
  return hash.toString(16).padStart(16, '0');
}

/**
 * SHA-256 hex digest via SubtleCrypto when available; otherwise a
 * deterministic FNV-1a fallback (tagged `fnv1a-64:...` so the caller
 * can distinguish). Never throws.
 */
export async function hashBytes(
  input: Uint8Array | string,
  algo: 'sha256' | 'fnv1a' = 'sha256'
): Promise<string> {
  const bytes = toUint8Array(input);
  if (algo === 'sha256') {
    const g = getGlobal();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const subtle = (g.crypto as any)?.subtle;
    if (subtle && typeof subtle.digest === 'function') {
      try {
        const digest = await subtle.digest('SHA-256', bytes);
        const view = new Uint8Array(digest);
        let hex = '';
        for (let i = 0; i < view.length; i++) hex += view[i].toString(16).padStart(2, '0');
        return `sha256:${hex}`;
      } catch {
        // fall through to FNV-1a fallback
      }
    }
  }
  return `fnv1a-64:${fnv1a64Hex(bytes)}`;
}

// =============================================================================
// PROBE RESULT
// =============================================================================

export interface ProbeResult<T = Uint8Array | string> {
  name: string;
  timestamp: number;
  environment: EnvironmentInfo;
  durationMs: number;
  outputHash: string;
  outputSize: number;
  output?: T;
  error?: string;
}

export interface DivergenceGroup {
  hash: string;
  results: ProbeResult[];
  environments: string[];
}

export interface DivergenceReport {
  probeName: string;
  totalResults: number;
  uniqueHashes: number;
  divergent: boolean;
  groups: DivergenceGroup[];
  summary: string;
}

// =============================================================================
// HARNESS
// =============================================================================

export interface HarnessOptions {
  /** Retain the probe's raw output on the ProbeResult (default: false). */
  captureOutput?: boolean;
  /** Hashing algorithm (default: 'sha256' with FNV-1a fallback). */
  hashAlgorithm?: 'sha256' | 'fnv1a';
  /** Default annotations attached to every probe this harness runs. */
  annotations?: Record<string, string>;
}

export class DeterminismHarness {
  private options: Required<Omit<HarnessOptions, 'annotations'>> & {
    annotations: Record<string, string>;
  };

  constructor(options: HarnessOptions = {}) {
    this.options = {
      captureOutput: options.captureOutput ?? false,
      hashAlgorithm: options.hashAlgorithm ?? 'sha256',
      annotations: options.annotations ?? {},
    };
  }

  /**
   * Run a probe function, capture environment, hash the output,
   * return a structured ProbeResult. Never throws — errors are
   * caught and reported on the result's `error` field with a
   * sentinel outputHash of `error:<message>`.
   */
  async probe<T extends Uint8Array | string>(
    name: string,
    fn: () => Promise<T> | T,
    annotations: Record<string, string> = {}
  ): Promise<ProbeResult<T>> {
    const timestamp = Date.now();
    const mergedAnnotations = { ...this.options.annotations, ...annotations };
    const environment = await captureEnvironment(mergedAnnotations);

    const started = typeof performance !== 'undefined' ? performance.now() : timestamp;
    let output: T | undefined;
    let error: string | undefined;
    try {
      output = await fn();
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }
    const ended = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const durationMs = Math.max(0, ended - started);

    if (error !== undefined || output === undefined) {
      return {
        name,
        timestamp,
        environment,
        durationMs,
        outputHash: `error:${error ?? 'no-output'}`,
        outputSize: 0,
        error,
      };
    }

    const outputHash = await hashBytes(output, this.options.hashAlgorithm);
    const outputSize =
      output instanceof Uint8Array ? output.byteLength : toUint8Array(output).byteLength;

    const result: ProbeResult<T> = {
      name,
      timestamp,
      environment,
      durationMs,
      outputHash,
      outputSize,
    };
    if (this.options.captureOutput) result.output = output;
    return result;
  }

  /**
   * Compare a collection of probe results and report whether they
   * agree. Groups results by hash so the caller can see which
   * environments produced which outputs.
   */
  static compareResults(results: ProbeResult[]): DivergenceReport {
    if (results.length === 0) {
      return {
        probeName: '(empty)',
        totalResults: 0,
        uniqueHashes: 0,
        divergent: false,
        groups: [],
        summary: 'No results supplied to compare.',
      };
    }

    const probeName = results[0].name;
    const byHash = new Map<string, ProbeResult[]>();
    for (const r of results) {
      const existing = byHash.get(r.outputHash);
      if (existing) existing.push(r);
      else byHash.set(r.outputHash, [r]);
    }

    const groups: DivergenceGroup[] = Array.from(byHash.entries()).map(([hash, rs]) => ({
      hash,
      results: rs,
      environments: rs.map((r) => describeEnvironment(r.environment)),
    }));

    const divergent = groups.length > 1;
    const summary = divergent
      ? `DIVERGENT: ${groups.length} distinct hashes across ${results.length} runs of "${probeName}".`
      : `CONVERGENT: all ${results.length} runs of "${probeName}" produced hash ${groups[0].hash}.`;

    return {
      probeName,
      totalResults: results.length,
      uniqueHashes: groups.length,
      divergent,
      groups,
      summary,
    };
  }
}

/**
 * Compact one-line environment descriptor for divergence reporting.
 * Not intended for machine parsing — use the structured
 * `EnvironmentInfo` object for that.
 */
export function describeEnvironment(env: EnvironmentInfo): string {
  const parts: string[] = [env.runtime];
  if (env.browser?.browser) parts.push(env.browser.browser);
  if (env.browser?.os) parts.push(env.browser.os);
  if (env.node) parts.push(`node ${env.node.version} ${env.node.platform}/${env.node.arch}`);
  if (env.gpu?.vendor) parts.push(`gpu:${env.gpu.vendor}${env.gpu.architecture ? '/' + env.gpu.architecture : ''}`);
  if (env.annotations) {
    for (const [k, v] of Object.entries(env.annotations)) {
      parts.push(`${k}=${v}`);
    }
  }
  return parts.join(' | ');
}
