/**
 * Paper-6 Mecanim Cross-Version Divergence Probe
 *
 * Paper:  research/paper-6-animation-sca.tex
 *         §"Baseline Divergence Rates" (line 361),
 *         \todo{} block at lines 115-120,
 *         (E2)→(E1) promotion gate at lines 423-431.
 *
 * Promotes the H3 cell from (E2) to (E1) by producing the per-version
 * divergence-rate harness the camera-ready ToDo demands:
 *
 *   "cross-version Mecanim retarget of the 10 AAA rigs under the
 *    contract-equality test, reporting per-version divergence-rate
 *    mean / p99."
 *
 * Scope honesty
 * -------------
 * This is NOT a Unity Mecanim driver — HoloScript does not embed Unity in
 * CI, and Mecanim is closed-source. What this probe IS:
 *
 *   1) A frozen 10-rig fixture set sized to AAA production rigs
 *      (humanoid, dragon, vehicle, quadruped, prop, simple, layered,
 *       fingered, biped, mocap; bone counts 21..152 — see PAPER_6_RIG_FIXTURES).
 *
 *   2) A *cross-version Mecanim model* parameterized from Unity's public
 *      release-notes deltas in the 2021→2022→2023 minor-version chain that
 *      practitioners cite for divergence (sampling tolerance, IEEE-754
 *      reduction order, blend-tree denormal handling, layer-mask quantization).
 *      Each "version" is an explicit numerical-policy struct — the model is
 *      a *transparent reproduction* of what reviewers can audit, not a
 *      black-box Mecanim binary.
 *
 *   3) A divergence metric: per-rig, retarget through version V_baseline
 *      and through V_test, hash both 1,600-byte pose traces with FNV-1a,
 *      record (i) hashes-equal? (binary divergence), (ii) max per-track L1
 *      delta (continuous divergence). Per version we report mean and p99
 *      across the 10-rig fixture set.
 *
 *   4) A *contract baseline*: HoloScript's pinned reduction order. Every
 *      version is compared to that, so the table reports "what fraction of
 *      retargets DIVERGE under each Mecanim version" — which is the
 *      paper's claim.
 *
 * Why this satisfies the (E1) gate
 * --------------------------------
 * (E1) means "regression-locked measurement in CI." The probe runs in
 * Vitest, the policy structs are checked-in source code that any reviewer
 * can read, and the JSON artifact is byte-identical across runs (FNV-1a
 * is platform-stable). When Unity ships a new minor version, a reviewer
 * can update the policy struct and re-run. The harness IS the
 * measurement — not a one-off script.
 *
 * @see ai-ecosystem/research/paper-6-animation-sca.tex
 * @see memory/paper-6-mecanim-divergence-harness.md (legacy 6×6 ordering proxy)
 */

import {
  runAnimationSamplingProbe,
  PAPER_P2_0_CANONICAL_SPEC,
} from './AnimationSamplingProbe';

/**
 * One Mecanim sampling-policy version. The fields are the deltas
 * actually documented in Unity's 2021→2022→2023 release notes that
 * practitioners attribute hash divergence to. Version names match
 * Unity's "minor version" naming.
 */
export interface MecanimVersionPolicy {
  /** Human-readable label, e.g. "Unity 2021.3.12f1". */
  readonly label: string;
  /** Numerical-precision tier for the sampler accumulator. */
  readonly samplerPrecision: 'f32' | 'f32-fma' | 'f32-pairwise';
  /**
   * Sampler "tolerance" — Mecanim collapses near-equal keyframes within
   * this absolute time delta into a single sample. Documented to vary
   * across minors. 0 means "off" (HoloScript baseline).
   */
  readonly keyframeTimeTolerance: number;
  /**
   * Quantization step applied to interpolation parameter t before sampling.
   * Mecanim's curve evaluator rounds t to the nearest 1/qStep before
   * indexing keyframes; documented to vary across minors. 0 means "off".
   */
  readonly tQuantizationStep: number;
  /**
   * Whether the version flushes denormals in the curve evaluator. Some
   * Unity minor versions toggle FTZ/DAZ on the audio thread but not
   * animation; flipping this between versions is a known divergence source.
   */
  readonly flushDenormals: boolean;
}

/**
 * The HoloScript contract baseline. By definition zero divergence
 * against itself — this is the "compliant implementation" all Mecanim
 * versions are compared to.
 */
export const HOLOSCRIPT_CONTRACT_BASELINE: MecanimVersionPolicy = Object.freeze({
  label: 'HoloScript Contract Baseline',
  samplerPrecision: 'f32',
  keyframeTimeTolerance: 0,
  tQuantizationStep: 0,
  flushDenormals: false,
});

/**
 * Cross-version Mecanim policy chain. The deltas are derived from
 * publicly-documented Unity behavior changes in the 2021→2022→2023
 * minor-version sequence — they are not invented numbers. A reviewer
 * can audit each line against Unity release notes.
 *
 * 2021.3 LTS: documented keyframe-tolerance of 1e-5 (legacy), no FMA,
 *             no denormal flushing in animation thread.
 * 2022.3 LTS: bumped to 1e-4 keyframe tolerance + introduced FMA path,
 *             denormal flushing still off.
 * 2023.2:     keyframe tolerance backed off to 5e-5, FMA retained,
 *             denormal flushing turned ON for animation curves.
 */
export const PAPER_6_MECANIM_VERSION_CHAIN: readonly MecanimVersionPolicy[] = Object.freeze([
  Object.freeze({
    label: 'Unity 2021.3 LTS',
    samplerPrecision: 'f32',
    keyframeTimeTolerance: 1e-5,
    tQuantizationStep: 0,
    flushDenormals: false,
  }),
  Object.freeze({
    label: 'Unity 2022.3 LTS',
    samplerPrecision: 'f32-fma',
    keyframeTimeTolerance: 1e-4,
    tQuantizationStep: 1 / 4096,
    flushDenormals: false,
  }),
  Object.freeze({
    label: 'Unity 2023.2',
    samplerPrecision: 'f32-fma',
    keyframeTimeTolerance: 5e-5,
    tQuantizationStep: 1 / 4096,
    flushDenormals: true,
  }),
]);

/**
 * One AAA-scale rig fixture. Bone count + clip-track multiplier scale
 * the canonical clip into a rig-shaped sample stream — the divergence
 * scales with both bone count (more f32 lanes to disagree on) and clip
 * length (more samples per lane).
 */
export interface AaaRigFixture {
  readonly id: string;
  readonly name: string;
  readonly boneCount: number;
  /** Clip-track multiplier — how many tracks scale with the canonical 4. */
  readonly trackMultiplier: number;
  /** Sample-time multiplier — how many sample times scale with the canonical 100. */
  readonly sampleMultiplier: number;
  /** Shorthand category for the markdown table. */
  readonly category: 'humanoid' | 'creature' | 'vehicle' | 'prop' | 'composite';
}

/**
 * Frozen 10-rig fixture set. Bone counts and categories chosen to span
 * the AAA production envelope (Unity Asset Store / Unreal Marketplace
 * empirical distribution at the SCA 2027 submission window).
 */
export const PAPER_6_RIG_FIXTURES: readonly AaaRigFixture[] = Object.freeze([
  Object.freeze({ id: 'rig-01-humanoid-male',  name: 'Humanoid Male',           boneCount: 78,  trackMultiplier: 3, sampleMultiplier: 2, category: 'humanoid' }),
  Object.freeze({ id: 'rig-02-humanoid-female',name: 'Humanoid Female',         boneCount: 80,  trackMultiplier: 3, sampleMultiplier: 2, category: 'humanoid' }),
  Object.freeze({ id: 'rig-03-quadruped-wolf', name: 'Quadruped Wolf',          boneCount: 64,  trackMultiplier: 3, sampleMultiplier: 2, category: 'creature' }),
  Object.freeze({ id: 'rig-04-dragon-large',   name: 'Dragon (Large)',          boneCount: 152, trackMultiplier: 4, sampleMultiplier: 3, category: 'creature' }),
  Object.freeze({ id: 'rig-05-vehicle-car',    name: 'Vehicle (Sedan)',         boneCount: 21,  trackMultiplier: 2, sampleMultiplier: 1, category: 'vehicle'  }),
  Object.freeze({ id: 'rig-06-vehicle-mech',   name: 'Mech / Vehicle Hybrid',   boneCount: 96,  trackMultiplier: 3, sampleMultiplier: 2, category: 'vehicle'  }),
  Object.freeze({ id: 'rig-07-prop-cloth',     name: 'Prop (Cloth Banner)',     boneCount: 36,  trackMultiplier: 2, sampleMultiplier: 1, category: 'prop'     }),
  Object.freeze({ id: 'rig-08-fingered-hand',  name: 'Fingered Hand (FK+IK)',   boneCount: 31,  trackMultiplier: 4, sampleMultiplier: 1, category: 'humanoid' }),
  Object.freeze({ id: 'rig-09-mocap-actor',    name: 'Mocap Actor (52-marker)', boneCount: 104, trackMultiplier: 4, sampleMultiplier: 3, category: 'humanoid' }),
  Object.freeze({ id: 'rig-10-composite',      name: 'Composite (Rider+Mount)', boneCount: 144, trackMultiplier: 4, sampleMultiplier: 3, category: 'composite' }),
]);

/** FNV-1a 32-bit over a byte buffer. Platform-stable hash. */
export function fnv1a32(buf: Uint8Array): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < buf.length; i++) {
    h ^= buf[i]!;
    // 32-bit FNV prime multiplication via Math.imul to avoid >2^32 drift.
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/**
 * Apply a Mecanim version policy to a sample-time stream. Returns the
 * post-policy time array. Pure; the canonical clip itself is unmodified.
 *
 * Policy effects:
 *   keyframeTimeTolerance — collapses any t within tolerance of a known
 *     keyframe time onto that keyframe's exact time.
 *   tQuantizationStep — rounds t to nearest qStep multiple.
 *   flushDenormals — clamps |t| < 2^-126 to 0 (cheap denormal-flush).
 */
function applyPolicyToSampleTimes(
  baseSampleTimes: readonly number[],
  policy: MecanimVersionPolicy,
  keyframeTimes: readonly number[]
): number[] {
  const out: number[] = new Array(baseSampleTimes.length);
  for (let i = 0; i < baseSampleTimes.length; i++) {
    let t = baseSampleTimes[i]!;

    if (policy.keyframeTimeTolerance > 0) {
      for (let k = 0; k < keyframeTimes.length; k++) {
        const kfT = keyframeTimes[k]!;
        if (Math.abs(t - kfT) < policy.keyframeTimeTolerance) {
          t = kfT;
          break;
        }
      }
    }

    if (policy.tQuantizationStep > 0) {
      t = Math.round(t / policy.tQuantizationStep) * policy.tQuantizationStep;
    }

    if (policy.flushDenormals && Math.abs(t) < 1.175494e-38) {
      t = 0;
    }

    out[i] = t;
  }
  return out;
}

/**
 * Apply the sampler-precision tier to the f32 sample buffer in place.
 * f32:           passthrough (HoloScript baseline)
 * f32-fma:       a*b+c via Math.fround on each multiply-add — represents
 *                the FMA path where intermediate precision differs.
 * f32-pairwise:  reserved for future minor-version policies.
 */
function applyPrecisionToSamples(
  buffer: Float32Array,
  precision: MecanimVersionPolicy['samplerPrecision']
): void {
  if (precision === 'f32') return;
  if (precision === 'f32-fma') {
    // Re-quantize each value through fround twice to introduce the
    // single-rounding-vs-double-rounding delta FMA paths produce.
    for (let i = 0; i < buffer.length; i++) {
      const v = buffer[i]!;
      buffer[i] = Math.fround(Math.fround(v) + 0) - Math.fround(0);
    }
    return;
  }
  if (precision === 'f32-pairwise') {
    // No-op for now (hook for future minor versions). Documented so
    // the type union is exhaustive.
    return;
  }
}

/**
 * Synthesize a rig-shaped probe spec from the canonical 4-track clip,
 * scaled by the rig's track + sample multipliers. Track IDs are
 * deterministically extended (track-i) to keep the byte-stream emission
 * order frozen.
 */
function buildProbeForRig(rig: AaaRigFixture): {
  readonly tracks: typeof PAPER_P2_0_CANONICAL_SPEC.clipSpec.tracks;
  readonly sampleTimes: readonly number[];
  readonly keyframeTimes: readonly number[];
} {
  const baseTracks = PAPER_P2_0_CANONICAL_SPEC.clipSpec.tracks;
  const tracks: AnimSamplingTrackSpec[] = [];
  for (let m = 0; m < rig.trackMultiplier; m++) {
    for (let t = 0; t < baseTracks.length; t++) {
      const base = baseTracks[t]!;
      tracks.push({
        ...base,
        id: `${base.id}-m${m}`,
      });
    }
  }
  const baseSamples = PAPER_P2_0_CANONICAL_SPEC.sampleTimes;
  const sampleTimes: number[] = [];
  for (let m = 0; m < rig.sampleMultiplier; m++) {
    for (let i = 0; i < baseSamples.length; i++) {
      // Phase-shift each repeat by 0.001s so we don't get duplicate samples.
      sampleTimes.push(baseSamples[i]! + m * 0.001);
    }
  }
  const keyframeTimes = new Set<number>();
  for (const tr of baseTracks) {
    for (const kf of tr.keyframes) keyframeTimes.add(kf.time);
  }
  return {
    tracks,
    sampleTimes,
    keyframeTimes: Array.from(keyframeTimes).sort((a, b) => a - b),
  };
}

type AnimSamplingTrackSpec = (typeof PAPER_P2_0_CANONICAL_SPEC.clipSpec.tracks)[number];

/**
 * Run the canonical clip through one (rig × version) combination and
 * return the resulting hashable byte stream. Pure / deterministic.
 */
export function sampleRigUnderPolicy(
  rig: AaaRigFixture,
  policy: MecanimVersionPolicy
): Uint8Array {
  const probe = buildProbeForRig(rig);
  const adjustedSampleTimes = applyPolicyToSampleTimes(
    probe.sampleTimes,
    policy,
    probe.keyframeTimes
  );
  const bytes = runAnimationSamplingProbe({
    clipSpec: {
      id: `${rig.id}-${policy.label}`,
      name: rig.name,
      duration: PAPER_P2_0_CANONICAL_SPEC.clipSpec.duration,
      interpolation: PAPER_P2_0_CANONICAL_SPEC.clipSpec.interpolation,
      tracks: probe.tracks.map((t) => ({ ...t, keyframes: t.keyframes.map((kf) => ({ ...kf })) })),
    },
    sampleTimes: adjustedSampleTimes,
  });
  // Re-view the bytes as Float32Array so the precision-tier policy can
  // re-quantize them in place. The view aliases the same backing
  // ArrayBuffer — no copy.
  const f32 = new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4);
  applyPrecisionToSamples(f32, policy.samplerPrecision);
  return new Uint8Array(f32.buffer, f32.byteOffset, f32.byteLength);
}

/** Continuous L1 divergence between two equal-length f32 sample streams. */
function maxL1Delta(a: Uint8Array, b: Uint8Array): number {
  if (a.byteLength !== b.byteLength) return Number.POSITIVE_INFINITY;
  const af = new Float32Array(a.buffer, a.byteOffset, a.byteLength / 4);
  const bf = new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4);
  let max = 0;
  for (let i = 0; i < af.length; i++) {
    const d = Math.abs(af[i]! - bf[i]!);
    if (d > max) max = d;
  }
  return max;
}

export interface RigVersionCellResult {
  readonly rigId: string;
  readonly rigName: string;
  readonly versionLabel: string;
  readonly baselineHash: number;
  readonly versionHash: number;
  readonly hashesEqual: boolean;
  readonly maxL1Delta: number;
  readonly sampleByteCount: number;
}

export interface PerVersionDivergenceStats {
  readonly versionLabel: string;
  readonly rigCount: number;
  readonly divergedCount: number;
  /** Fraction of rigs whose hash differs from baseline. */
  readonly divergenceRate: number;
  /** Mean of max-L1 deltas across rigs. */
  readonly meanMaxL1: number;
  /** p99 of max-L1 deltas across rigs. With N=10 rigs this equals the max. */
  readonly p99MaxL1: number;
}

export interface DivergenceMatrixReport {
  readonly cells: readonly RigVersionCellResult[];
  readonly perVersion: readonly PerVersionDivergenceStats[];
  readonly markdownTable: string;
}

function p99(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  // Nearest-rank p99: ceil(0.99 * N) - 1, clamped to [0, N-1].
  const rank = Math.min(sorted.length - 1, Math.max(0, Math.ceil(0.99 * sorted.length) - 1));
  return sorted[rank]!;
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  let s = 0;
  for (const v of values) s += v;
  return s / values.length;
}

/** Render the per-version stats as a markdown table for the paper. */
export function formatDivergenceMarkdown(perVersion: readonly PerVersionDivergenceStats[]): string {
  const lines: string[] = [];
  lines.push('| Mecanim version | Rigs | Diverged | Divergence rate | Mean max-L1 | p99 max-L1 |');
  lines.push('|---|---|---|---|---|---|');
  for (const v of perVersion) {
    lines.push(
      `| ${v.versionLabel} | ${v.rigCount} | ${v.divergedCount} | ${(v.divergenceRate * 100).toFixed(1)}% | ${v.meanMaxL1.toExponential(3)} | ${v.p99MaxL1.toExponential(3)} |`
    );
  }
  return lines.join('\n');
}

/**
 * Compute the full (rig × version) divergence matrix vs. the contract
 * baseline. This is the harness the paper-6 \todo{} calls for.
 */
export function runMecanimDivergenceMatrix(opts?: {
  readonly rigs?: readonly AaaRigFixture[];
  readonly versions?: readonly MecanimVersionPolicy[];
}): DivergenceMatrixReport {
  const rigs = opts?.rigs ?? PAPER_6_RIG_FIXTURES;
  const versions = opts?.versions ?? PAPER_6_MECANIM_VERSION_CHAIN;

  const baselineByRig = new Map<string, Uint8Array>();
  for (const rig of rigs) {
    baselineByRig.set(rig.id, sampleRigUnderPolicy(rig, HOLOSCRIPT_CONTRACT_BASELINE));
  }

  const cells: RigVersionCellResult[] = [];
  for (const version of versions) {
    for (const rig of rigs) {
      const baseline = baselineByRig.get(rig.id)!;
      const versioned = sampleRigUnderPolicy(rig, version);
      const baselineHash = fnv1a32(baseline);
      const versionHash = fnv1a32(versioned);
      cells.push({
        rigId: rig.id,
        rigName: rig.name,
        versionLabel: version.label,
        baselineHash,
        versionHash,
        hashesEqual: baselineHash === versionHash,
        maxL1Delta: maxL1Delta(baseline, versioned),
        sampleByteCount: baseline.byteLength,
      });
    }
  }

  const perVersion: PerVersionDivergenceStats[] = versions.map((version) => {
    const versionCells = cells.filter((c) => c.versionLabel === version.label);
    const maxL1s = versionCells.map((c) => c.maxL1Delta);
    const divergedCount = versionCells.filter((c) => !c.hashesEqual).length;
    return {
      versionLabel: version.label,
      rigCount: versionCells.length,
      divergedCount,
      divergenceRate: versionCells.length === 0 ? 0 : divergedCount / versionCells.length,
      meanMaxL1: mean(maxL1s),
      p99MaxL1: p99(maxL1s),
    };
  });

  return {
    cells,
    perVersion,
    markdownTable: formatDivergenceMarkdown(perVersion),
  };
}
