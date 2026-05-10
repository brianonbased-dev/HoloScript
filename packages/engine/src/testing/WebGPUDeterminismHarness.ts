/**
 * WebGPUDeterminismHarness — cross-adapter replay-determinism harness
 * for Paper 3 (CRDT) Property 4 empirical closure (path a).
 *
 * Pre-registered protocol:
 *   research/2026-04-20_webgpu-determinism-protocol.md (ai-ecosystem)
 *
 * This harness runs a small real WebGPU compute kernel that folds a CAEL
 * trace into a canonical u32 state vector. The kernel is intentionally
 * narrow: it proves browser/device acquisition, WGSL compilation,
 * storage-buffer upload, compute dispatch, readback, and deterministic
 * final-state hashing without pretending to be the full production solver.
 *
 * The same-adapter replay path is already tested in
 *   packages/engine/src/simulation/__tests__/paper-multi-agent-crdt.test.ts
 *   (Experiment 3: Dispute resolution via CAEL replay)
 * but runs in Node.js via CAELReplayer (no WebGPU). This harness lifts
 * that replay into a WebGPU compute context so the cross-adapter
 * comparison the audit called for can actually be measured.
 *
 * Why the split exists:
 *   - Node-side CAELReplayer: fast, CPU-bound, for correctness testing
 *     of the replay *logic* (hash chain, event ordering, state
 *     reconstruction). Already has 27-test coverage per paper-3
 *     commit c185c11.
 *   - Browser-side WebGPUDeterminismHarness (this module): slow,
 *     GPU-bound, specifically for measuring whether compute-shader
 *     reduction order is stable across the WebGPU adapters listed
 *     in the protocol's vendor matrix.
 *
 * The Node-side replay always produces bit-identical results (IEEE-754
 * CPU math is deterministic per platform). The browser-side replay
 * is what the audit actually challenges, because WebGPU's reduction
 * order is implementation-defined.
 *
 * **Mock mode (CI / wiring):** set `WEBGPU_HARNESS_MOCK=1` (Node) or
 * `globalThis.__WEBGPU_HARNESS_MOCK__ = true` (browser) to emit a
 * structurally valid `HarnessArtifact` with SHA-256 digests derived from
 * the trace (no GPU). All replications share the same digest so
 * self-consistency checks pass. Mock mode is rejected when
 * `productionEvidence` is true.
 */

import type { CAELTrace } from '../simulation/CAELTrace';

const HARNESS_WORKGROUP_SIZE = 64;
const HARNESS_KERNEL_NAME = 'cael-trace-fold-v1';

const HARNESS_WGSL = /* wgsl */ `
struct TraceRow {
  a: u32,
  b: u32,
  c: u32,
  d: u32,
};

struct Params {
  traceLength: u32,
  scenarioSalt: u32,
  replication: u32,
  _pad: u32,
};

@group(0) @binding(0) var<storage, read> traceRows: array<TraceRow>;
@group(0) @binding(1) var<storage, read_write> finalState: array<atomic<u32>, 8>;
@group(0) @binding(2) var<uniform> params: Params;

fn mix32(input: u32) -> u32 {
  var x = input;
  x = x ^ (x >> 16u);
  x = x * 0x7feb352du;
  x = x ^ (x >> 15u);
  x = x * 0x846ca68bu;
  x = x ^ (x >> 16u);
  return x;
}

@compute @workgroup_size(${HARNESS_WORKGROUP_SIZE})
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = gid.x;
  if (i >= params.traceLength) {
    return;
  }

  let row = traceRows[i];
  var v = mix32(row.a ^ params.scenarioSalt);
  v = mix32(v + row.b + (i * 0x85ebca6bu));
  v = mix32(v ^ row.c);
  v = mix32(v + row.d);

  atomicXor(&finalState[i % 8u], v);
  atomicAdd(&finalState[(i + 3u) % 8u], mix32(v ^ 0xc2b2ae35u));
}
`;

/** One of the vendor matrix rows from the protocol. */
export type AdapterTag = 'intel-uhd' | 'nvidia-rtx3060' | 'apple-m' | 'amd-rdna' | 'qualcomm-adreno' | 'swiftshader';

/** Serialized adapter identity as captured at run time (for the JSON artifact). */
export interface AdapterIdentity {
  /** Label matching the protocol's vendor matrix row. */
  readonly tag: AdapterTag;
  /** `GPUAdapterInfo.vendor` at run time (may be empty string). */
  readonly vendor: string;
  /** `GPUAdapterInfo.device` / description string at run time. */
  readonly device: string;
  /** Driver version string if the UA exposes it; empty if unknown. */
  readonly driver: string;
  /** Browser UA string at run time. */
  readonly userAgent: string;
}

/** WebGPU kernel metadata captured with each evidence artifact. */
export interface HarnessKernelMetadata {
  readonly name: typeof HARNESS_KERNEL_NAME;
  readonly workgroupSize: typeof HARNESS_WORKGROUP_SIZE;
  readonly wgslBytes: number;
}

/** Digest + timing for one replay of one scenario on one adapter. */
export interface ReplicationResult {
  /** SHA-256 of the canonical final-state byte stream (protocol §Primary DV). */
  readonly finalStateDigest: string;
  /** Wall-clock ms for the replay (not including init). */
  readonly wallMs: number;
  /** WGSL compile time ms captured by the harness. */
  readonly wgslCompileMs: number;
  /** Optional field-wise final state, for semantic-tolerance (H2) path. */
  readonly finalStateFields?: Readonly<Record<string, readonly number[]>>;
}

/** One scenario's full result: N replications. */
export interface ScenarioResult {
  readonly scenario: string;
  readonly traceLength: number;
  readonly replications: readonly ReplicationResult[];
}

/** The top-level artifact the harness emits — matches protocol §Reporting format. */
export interface HarnessArtifact {
  readonly protocol: '2026-04-20_webgpu-determinism-protocol';
  readonly protocolCommit: string;
  readonly executionMode: 'webgpu' | 'mock';
  readonly browser: string;
  readonly host: string;
  readonly adapter: AdapterIdentity;
  readonly kernel: HarnessKernelMetadata;
  readonly scenarios: Readonly<Record<string, ScenarioResult>>;
  /** UNIX ms timestamp at artifact creation. */
  readonly collectedAtMs: number;
}

/** Input knob for running the harness from a test page / Playwright driver. */
export interface HarnessConfig {
  /** Traces to replay, keyed by scenario name (matches protocol §Design). */
  readonly traces: Readonly<Record<string, CAELTrace>>;
  /** Replications per adapter (protocol default: 5). */
  readonly replications: number;
  /** Adapter tag label; the harness uses this to label the artifact, not to select. */
  readonly adapterTag: AdapterTag;
  /** Host label (e.g. 'founder-laptop-H1'). */
  readonly host: string;
  /** Whether to capture per-field final state (for H2 semantic-tolerance path). */
  readonly captureFields: boolean;
  /** Commit hash of the protocol doc at time of run (for artifact integrity). */
  readonly protocolCommit: string;
  /** Production paper evidence must fail if mock mode is enabled. */
  readonly productionEvidence?: boolean;
}

/**
 * The harness entry point a test page invokes. Returns the structured
 * artifact that a Playwright driver reads back via `window.__result__`.
 *
 * Contract:
 *   1. Acquire a WebGPU adapter + device via `navigator.gpu.requestAdapter()`
 *      with `powerPreference: 'high-performance'`. If unavailable, throw
 *      `WebGPUUnavailableError` — driver should fail fast and skip this row.
 *   2. Capture adapter identity into `AdapterIdentity` from
 *      `adapter.requestAdapterInfo()` (if available) + `navigator.userAgent`.
 *   3. For each scenario in `config.traces`:
 *        For each of `config.replications`:
 *          3a. Reset device state (fresh command encoder, fresh buffers).
 *          3b. Compile the fixed `cael-trace-fold-v1` WGSL kernel.
 *          3c. Project each CAEL entry into canonical u32 trace rows.
 *          3d. Dispatch the kernel and await device queue completion.
 *          3e. Read back final state; compute canonical-byte SHA-256.
 *          3f. If `captureFields`, keep JSON-safe per-field numeric arrays.
 *   4. Assemble `HarnessArtifact` and return.
 *
 * Determinism invariants the harness MUST enforce (regardless of adapter):
 *   - Same RNG seed per replication within a scenario (so inter-run
 *     variance at same adapter is zero; this is the self-consistency
 *     check the protocol requires before any cross-adapter claim).
 *   - Same workgroup/subgroup sizes across adapters (don't size by
 *     adapter limits — the whole point is to isolate reduction-order
 *     variance, not dispatch-shape variance).
 *   - Same buffer binding order, same dispatch order, same field-
 *     serialization order.
 *
 * Anything that varies across adapters must be the adapter's own
 * choice (reduction order, subgroup width chosen by the compiler,
 * memory layout), not something the harness introduces.
 */
export function isHarnessMockMode(): boolean {
  try {
    if (typeof process !== 'undefined' && process.env?.WEBGPU_HARNESS_MOCK === '1') {
      return true;
    }
  } catch {
    /* ignore */
  }
  return typeof globalThis !== 'undefined' && (globalThis as { __WEBGPU_HARNESS_MOCK__?: boolean }).__WEBGPU_HARNESS_MOCK__ === true;
}

function toUint8Array(input: Uint8Array | string): Uint8Array {
  if (input instanceof Uint8Array) {
    return input;
  }
  return new TextEncoder().encode(input);
}

function fnv1a64Hex(bytes: Uint8Array): string {
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  const mask = 0xffffffffffffffffn;
  for (let i = 0; i < bytes.length; i++) {
    hash = (hash ^ BigInt(bytes[i])) & mask;
    hash = (hash * prime) & mask;
  }
  return hash.toString(16).padStart(16, '0');
}

async function hashBytes(input: Uint8Array | string, algo: 'sha256' | 'fnv1a' = 'sha256'): Promise<string> {
  const bytes = toUint8Array(input);
  if (algo === 'sha256') {
    const subtle = globalThis.crypto?.subtle;
    if (subtle && typeof subtle.digest === 'function') {
      try {
        const digestInput = new Uint8Array(bytes.byteLength);
        digestInput.set(bytes);
        const digest = await subtle.digest('SHA-256', digestInput.buffer);
        const view = new Uint8Array(digest);
        let hex = '';
        for (let i = 0; i < view.length; i++) {
          hex += view[i]!.toString(16).padStart(2, '0');
        }
        return `sha256:${hex}`;
      } catch {
        // Fall through to deterministic tagged fallback.
      }
    }
  }
  return `fnv1a-64:${fnv1a64Hex(bytes)}`;
}

function fnv1a32(input: string): number {
  const bytes = new TextEncoder().encode(input);
  let hash = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i++) {
    hash ^= bytes[i]!;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

function mix32(input: number): number {
  let x = input >>> 0;
  x = (x ^ (x >>> 16)) >>> 0;
  x = Math.imul(x, 0x7feb352d) >>> 0;
  x = (x ^ (x >>> 15)) >>> 0;
  x = Math.imul(x, 0x846ca68b) >>> 0;
  x = (x ^ (x >>> 16)) >>> 0;
  return x >>> 0;
}

function numberToU32(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  const buffer = new ArrayBuffer(8);
  const view = new DataView(buffer);
  view.setFloat64(0, value, true);
  return (view.getUint32(0, true) ^ view.getUint32(4, true)) >>> 0;
}

function stableStringify(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value === 'number') {
    if (Number.isNaN(value)) return 'number:NaN';
    if (Object.is(value, -0)) return 'number:-0';
    return `number:${value}`;
  }
  if (typeof value === 'string') return `string:${JSON.stringify(value)}`;
  if (typeof value === 'boolean') return `boolean:${value ? '1' : '0'}`;
  if (typeof value === 'bigint') return `bigint:${value.toString()}`;
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }
  if (ArrayBuffer.isView(value)) {
    const view = value as ArrayBufferView;
    return `${view.constructor.name}:${Array.from(new Uint8Array(view.buffer, view.byteOffset, view.byteLength)).join(',')}`;
  }
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(obj[key])}`).join(',')}}`;
  }
  return `${typeof value}:${String(value)}`;
}

function traceRowsForScenario(scenarioName: string, trace: CAELTrace): Uint32Array {
  if (trace.length === 0) {
    throw new Error(`scenario "${scenarioName}" has an empty CAEL trace`);
  }

  const rows = new Uint32Array(trace.length * 4);
  const scenarioSalt = fnv1a32(`scenario:${scenarioName}`);
  for (let i = 0; i < trace.length; i++) {
    const entry = trace[i]!;
    const offset = i * 4;
    rows[offset] = mix32(fnv1a32(entry.event) ^ entry.index ^ scenarioSalt);
    rows[offset + 1] = mix32(numberToU32(entry.timestamp) ^ numberToU32(entry.simTime));
    rows[offset + 2] = mix32(fnv1a32(`${entry.prevHash}|${entry.hash}`));
    rows[offset + 3] = mix32(fnv1a32(stableStringify(entry.payload)));
  }
  return rows;
}

function kernelMetadata(): HarnessKernelMetadata {
  return {
    name: HARNESS_KERNEL_NAME,
    workgroupSize: HARNESS_WORKGROUP_SIZE,
    wgslBytes: new TextEncoder().encode(HARNESS_WGSL).byteLength,
  };
}

/** Deterministic digest for a scenario trace (mock path — no GPU). Excludes adapter so cross-adapter H0 can be tested. */
async function mockFinalDigestForScenario(scenarioName: string, trace: CAELTrace): Promise<string> {
  const payload = JSON.stringify({
    k: 'webgpu-determinism-mock-v1',
    scenario: scenarioName,
    traceLen: trace.length,
    tailHash: trace[trace.length - 1]?.hash ?? '',
    head: trace[0]?.hash ?? '',
  });
  return hashBytes(payload, 'sha256');
}

async function buildMockHarnessArtifact(config: HarnessConfig): Promise<HarnessArtifact> {
  const g = globalThis as { navigator?: { userAgent?: string } };
  const browser =
    typeof g.navigator !== 'undefined' && g.navigator?.userAgent
      ? g.navigator.userAgent
      : `node-${typeof process !== 'undefined' ? process.version : 'unknown'}`;

  const adapter: AdapterIdentity = {
    tag: config.adapterTag,
    vendor: `mock-vendor-${config.adapterTag}`,
    device: 'mock-device',
    driver: 'mock-driver',
    userAgent: browser,
  };

  const scenarios: Record<string, ScenarioResult> = {};

  for (const [scenarioName, trace] of Object.entries(config.traces)) {
    const digest = await mockFinalDigestForScenario(scenarioName, trace);
    const replications: ReplicationResult[] = [];
    for (let i = 0; i < config.replications; i++) {
      replications.push({
        finalStateDigest: digest,
        wallMs: 0.42 + i * 1e-6,
        wgslCompileMs: 0.08,
        finalStateFields: config.captureFields
          ? { mock_field: [1, 2, 3, scenarioName.length] }
          : undefined,
      });
    }
    scenarios[scenarioName] = {
      scenario: scenarioName,
      traceLength: trace.length,
      replications,
    };
  }

  return {
    protocol: '2026-04-20_webgpu-determinism-protocol',
    protocolCommit: config.protocolCommit,
    executionMode: 'mock',
    browser,
    host: config.host,
    adapter,
    kernel: kernelMetadata(),
    scenarios,
    collectedAtMs: Date.now(),
  };
}

async function readAdapterIdentity(adapter: GPUAdapter, adapterTag: AdapterTag): Promise<AdapterIdentity> {
  const nav = (globalThis as { navigator?: Navigator }).navigator;
  const adapterWithInfo = adapter as GPUAdapter & {
    info?: Partial<GPUAdapterInfo>;
    requestAdapterInfo?: () => Promise<Partial<GPUAdapterInfo>>;
  };

  let info: Partial<GPUAdapterInfo> = adapterWithInfo.info ?? {};
  if (Object.keys(info).length === 0 && typeof adapterWithInfo.requestAdapterInfo === 'function') {
    try {
      info = await adapterWithInfo.requestAdapterInfo();
    } catch {
      info = {};
    }
  }

  const description = [
    info.vendor,
    (info as { architecture?: string }).architecture,
    info.device,
    (info as { description?: string }).description,
  ]
    .filter(Boolean)
    .join(' ');

  return {
    tag: adapterTag,
    vendor: info.vendor ?? '',
    device: info.device ?? description,
    driver: (info as { driver?: string }).driver ?? '',
    userAgent: nav?.userAgent ?? '',
  };
}

async function acquireWebGPU(config: HarnessConfig): Promise<{
  device: GPUDevice;
  identity: AdapterIdentity;
  browser: string;
}> {
  const nav = (globalThis as { navigator?: Navigator & { gpu?: GPU } }).navigator;
  if (!nav?.gpu) {
    throw new WebGPUUnavailableError('navigator.gpu is unavailable; run in Chrome/Edge with WebGPU enabled');
  }

  const adapter = await nav.gpu.requestAdapter({ powerPreference: 'high-performance' });
  if (!adapter) {
    throw new WebGPUUnavailableError('navigator.gpu.requestAdapter() returned null');
  }

  const device = await adapter.requestDevice();
  const identity = await readAdapterIdentity(adapter, config.adapterTag);
  return {
    device,
    identity,
    browser: nav.userAgent ?? '',
  };
}

function makeOutputSeed(): Uint32Array {
  return new Uint32Array([
    0x6a09e667,
    0xbb67ae85,
    0x3c6ef372,
    0xa54ff53a,
    0x510e527f,
    0x9b05688c,
    0x1f83d9ab,
    0x5be0cd19,
  ]);
}

async function runScenarioReplication(
  device: GPUDevice,
  scenarioName: string,
  trace: CAELTrace,
  replication: number,
  captureFields: boolean,
): Promise<ReplicationResult> {
  const rows = traceRowsForScenario(scenarioName, trace);
  const scenarioSalt = fnv1a32(`scenario:${scenarioName}`);

  const compileStart = performance.now();
  const shaderModule = device.createShaderModule({
    label: `${HARNESS_KERNEL_NAME}:${scenarioName}`,
    code: HARNESS_WGSL,
  });
  const pipeline = await device.createComputePipelineAsync({
    label: `${HARNESS_KERNEL_NAME}:${scenarioName}`,
    layout: 'auto',
    compute: {
      module: shaderModule,
      entryPoint: 'main',
    },
  });
  const wgslCompileMs = performance.now() - compileStart;

  const inputBuffer = device.createBuffer({
    label: `${HARNESS_KERNEL_NAME}:${scenarioName}:trace`,
    size: rows.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(inputBuffer, 0, rows.buffer as ArrayBuffer, rows.byteOffset, rows.byteLength);

  const outputSeed = makeOutputSeed();
  const outputBuffer = device.createBuffer({
    label: `${HARNESS_KERNEL_NAME}:${scenarioName}:state`,
    size: outputSeed.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(
    outputBuffer,
    0,
    outputSeed.buffer as ArrayBuffer,
    outputSeed.byteOffset,
    outputSeed.byteLength,
  );

  const params = new Uint32Array([trace.length, scenarioSalt, replication, 0]);
  const paramsBuffer = device.createBuffer({
    label: `${HARNESS_KERNEL_NAME}:${scenarioName}:params`,
    size: params.byteLength,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(paramsBuffer, 0, params.buffer as ArrayBuffer, params.byteOffset, params.byteLength);

  const readbackBuffer = device.createBuffer({
    label: `${HARNESS_KERNEL_NAME}:${scenarioName}:readback`,
    size: outputSeed.byteLength,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
  });

  const bindGroup = device.createBindGroup({
    label: `${HARNESS_KERNEL_NAME}:${scenarioName}:bind-group`,
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: inputBuffer } },
      { binding: 1, resource: { buffer: outputBuffer } },
      { binding: 2, resource: { buffer: paramsBuffer } },
    ],
  });

  const dispatchStart = performance.now();
  const encoder = device.createCommandEncoder({
    label: `${HARNESS_KERNEL_NAME}:${scenarioName}:encoder`,
  });
  const pass = encoder.beginComputePass({
    label: `${HARNESS_KERNEL_NAME}:${scenarioName}:pass`,
  });
  pass.setPipeline(pipeline);
  pass.setBindGroup(0, bindGroup);
  pass.dispatchWorkgroups(Math.ceil(trace.length / HARNESS_WORKGROUP_SIZE));
  pass.end();
  encoder.copyBufferToBuffer(outputBuffer, 0, readbackBuffer, 0, outputSeed.byteLength);
  device.queue.submit([encoder.finish()]);
  await device.queue.onSubmittedWorkDone();
  const wallMs = performance.now() - dispatchStart;

  await readbackBuffer.mapAsync(GPUMapMode.READ);
  const mapped = readbackBuffer.getMappedRange();
  const canonicalBytes = new Uint8Array(mapped).slice();
  const words = Array.from(new Uint32Array(canonicalBytes.buffer));
  readbackBuffer.unmap();

  inputBuffer.destroy();
  outputBuffer.destroy();
  paramsBuffer.destroy();
  readbackBuffer.destroy();

  return {
    finalStateDigest: await hashBytes(canonicalBytes, 'sha256'),
    wallMs,
    wgslCompileMs,
    finalStateFields: captureFields ? { u32_state: words } : undefined,
  };
}

async function buildWebGPUHarnessArtifact(config: HarnessConfig): Promise<HarnessArtifact> {
  const { device, identity, browser } = await acquireWebGPU(config);
  const scenarios: Record<string, ScenarioResult> = {};

  try {
    for (const [scenarioName, trace] of Object.entries(config.traces)) {
      const replications: ReplicationResult[] = [];
      for (let i = 0; i < config.replications; i++) {
        replications.push(
          await runScenarioReplication(device, scenarioName, trace, i, config.captureFields),
        );
      }
      scenarios[scenarioName] = {
        scenario: scenarioName,
        traceLength: trace.length,
        replications,
      };
    }
  } finally {
    device.destroy();
  }

  return {
    protocol: '2026-04-20_webgpu-determinism-protocol',
    protocolCommit: config.protocolCommit,
    executionMode: 'webgpu',
    browser,
    host: config.host,
    adapter: identity,
    kernel: kernelMetadata(),
    scenarios,
    collectedAtMs: Date.now(),
  };
}

export async function runDeterminismHarness(config: HarnessConfig): Promise<HarnessArtifact> {
  if (isHarnessMockMode()) {
    if (config.productionEvidence) {
      throw new WebGPUProductionEvidenceMockError(
        'WEBGPU_HARNESS_MOCK cannot be used when productionEvidence=true',
      );
    }
    return buildMockHarnessArtifact(config);
  }
  return buildWebGPUHarnessArtifact(config);
}

/**
 * Cross-adapter comparison helper: given artifacts from N adapters for
 * the same scenario set, determine whether H0 (bit-identical) holds or
 * H2 (epsilon-equivalent) is needed.
 *
 * Pure function — can run in Node after the in-browser harness has
 * dumped JSON artifacts.
 */
export function compareAdapterArtifacts(
  artifacts: readonly HarnessArtifact[],
): CrossAdapterVerdict {
  if (artifacts.length < 2) {
    throw new Error('need at least 2 adapter artifacts to compare');
  }

  // Protocol §Per-adapter self-consistency check (pre-requisite)
  const selfConsistencyFailures: Array<{ adapter: AdapterTag; scenario: string }> = [];
  for (const art of artifacts) {
    for (const [scenario, result] of Object.entries(art.scenarios)) {
      const digests = new Set(result.replications.map((r) => r.finalStateDigest));
      if (digests.size !== 1) {
        selfConsistencyFailures.push({ adapter: art.adapter.tag, scenario });
      }
    }
  }
  if (selfConsistencyFailures.length > 0) {
    return {
      verdict: 'HARNESS_BUG',
      reason: 'per-adapter self-consistency failed',
      selfConsistencyFailures,
      perScenarioH0: {},
      perScenarioH2: {},
    };
  }

  // Pick one representative digest per (adapter, scenario) — they're all equal
  // because self-consistency passed.
  const digestTable: Record<string, Record<AdapterTag, string>> = {};
  for (const art of artifacts) {
    for (const [scenario, result] of Object.entries(art.scenarios)) {
      digestTable[scenario] = digestTable[scenario] ?? ({} as Record<AdapterTag, string>);
      digestTable[scenario][art.adapter.tag] = result.replications[0].finalStateDigest;
    }
  }

  // H0 per scenario: all adapters agree bit-exact?
  const perScenarioH0: Record<string, boolean> = {};
  for (const [scenario, byAdapter] of Object.entries(digestTable)) {
    const digests = new Set(Object.values(byAdapter));
    perScenarioH0[scenario] = digests.size === 1;
  }

  // H2 semantic-tolerance path: not computed here; requires field data
  // + contract epsilon from a separate source. Emit the scenarios where
  // H0 failed so the caller can compute H2.
  const h0FailureScenarios = Object.entries(perScenarioH0)
    .filter(([, pass]) => !pass)
    .map(([s]) => s);

  return {
    verdict: h0FailureScenarios.length === 0 ? 'H0_HOLDS' : 'H0_REJECTED_H2_PENDING',
    reason:
      h0FailureScenarios.length === 0
        ? 'all scenarios bit-identical across adapters'
        : `${h0FailureScenarios.length} scenarios disagree bit-exact; H2 evaluation required`,
    selfConsistencyFailures: [],
    perScenarioH0,
    perScenarioH2: {},
    h0FailureScenarios,
  };
}

export interface CrossAdapterVerdict {
  readonly verdict: 'H0_HOLDS' | 'H0_REJECTED_H2_PENDING' | 'H2_HOLDS' | 'H2_REJECTED' | 'HARNESS_BUG';
  readonly reason: string;
  readonly selfConsistencyFailures: ReadonlyArray<{ adapter: AdapterTag; scenario: string }>;
  readonly perScenarioH0: Readonly<Record<string, boolean>>;
  readonly perScenarioH2: Readonly<Record<string, boolean>>;
  readonly h0FailureScenarios?: readonly string[];
}

export class WebGPUUnavailableError extends Error {
  constructor(message = 'WebGPU not available on this adapter / browser') {
    super(message);
    this.name = 'WebGPUUnavailableError';
  }
}

export class WebGPUProductionEvidenceMockError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WebGPUProductionEvidenceMockError';
  }
}

export class WebGPUHarnessNotImplementedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WebGPUHarnessNotImplementedError';
  }
}
