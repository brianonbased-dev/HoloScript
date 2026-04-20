/**
 * WebGPUDeterminismHarness — cross-adapter replay-determinism harness
 * for Paper 3 (CRDT) Property 4 empirical closure (path a).
 *
 * Pre-registered protocol:
 *   research/2026-04-20_webgpu-determinism-protocol.md (ai-ecosystem)
 *
 * This harness does NOT yet run — it scaffolds the interface contract
 * so a later session can fill in the compute-kernel body and the
 * Playwright driver can exercise it across adapters.
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
 * NOT YET IMPLEMENTED (follow-up task):
 *   - The compute kernel that projects a CAEL trace onto a WebGPU
 *     device and runs the contracted simulation on-GPU.
 *   - The Playwright driver at `scripts/run-webgpu-determinism.mjs`
 *     modeled on `packages/snn-webgpu/scripts/run-benchmark.mjs`.
 *   - The HTML page that loads this harness in-browser.
 *
 * This is scaffolding. Implementation of the GPU compute path is the
 * separate follow-up task called out in the protocol's "Acceptance
 * criteria" section.
 */

import type { CAELTrace } from '../simulation/CAELTrace';

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

/** Digest + timing for one replay of one scenario on one adapter. */
export interface ReplicationResult {
  /** SHA-256 of the canonical final-state byte stream (protocol §Primary DV). */
  readonly finalStateDigest: string;
  /** Wall-clock ms for the replay (not including init). */
  readonly wallMs: number;
  /** WGSL compile time ms captured by the harness. */
  readonly wgslCompileMs: number;
  /** Optional field-wise final state, for semantic-tolerance (H2) path. */
  readonly finalStateFields?: Readonly<Record<string, Float32Array>>;
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
  readonly browser: string;
  readonly host: string;
  readonly adapter: AdapterIdentity;
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
}

/**
 * The harness entry point a test page invokes. Returns the structured
 * artifact that a Playwright driver reads back via `window.__result__`.
 *
 * Contract (not yet fully implemented):
 *   1. Acquire a WebGPU adapter + device via `navigator.gpu.requestAdapter()`
 *      with `powerPreference: 'high-performance'`. If unavailable, throw
 *      `WebGPUUnavailableError` — driver should fail fast and skip this row.
 *   2. Capture adapter identity into `AdapterIdentity` from
 *      `adapter.requestAdapterInfo()` (if available) + `navigator.userAgent`.
 *   3. For each scenario in `config.traces`:
 *        For each of `config.replications`:
 *          3a. Reset device state (fresh command encoder, fresh buffers).
 *          3b. Compile WGSL kernel for the scenario's solver (from
 *              `packages/engine/src/simulation/<solver>.wgsl` — not yet
 *              written; same shader as the production path).
 *          3c. Upload initial state from trace[0].payload.
 *          3d. For each event in trace[1..]: dispatch appropriate kernel,
 *              await device queue.
 *          3e. Read back final state; compute canonical-byte SHA-256.
 *          3f. If `captureFields`, keep per-field Float32Array copies.
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
export async function runDeterminismHarness(
  _config: HarnessConfig,
): Promise<HarnessArtifact> {
  throw new WebGPUHarnessNotImplementedError(
    'runDeterminismHarness() is scaffolded but not yet implemented. ' +
      'See packages/engine/src/testing/WebGPUDeterminismHarness.ts header ' +
      "comment and ai-ecosystem's research/2026-04-20_webgpu-determinism-protocol.md " +
      'for the contract. Implementation is a follow-up task.',
  );
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

export class WebGPUHarnessNotImplementedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WebGPUHarnessNotImplementedError';
  }
}
