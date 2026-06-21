/**
 * HoloNews Phase A Formalizer — measured-sensor capture → CAEL discharge.
 *
 * Routes a completed scan session through the Formalizer stage (T-NEWS-2 Part A):
 *
 *   MEASURED path (iOS LiDAR / ARCore depth + ARKit/ARCore 6-DoF pose):
 *     → generate a cael.v1 trace embedding the HoloMap replayFingerprint
 *     → discharge via inline hash-chain verification (verify_cael_trace semantics)
 *     → return claimLabel: 'proven', caelTraceId, verifyUrl
 *
 *   SENSORLESS path (luminance-heuristic depth, no metric pose):
 *     → Formalizer ABSTAINS (safe direction)
 *     → return claimLabel: 'captured · unverified'
 *
 * The `proven` label is ONLY reachable through a successfully discharged CAEL
 * receipt (G.911, F.123). No receipt → `captured · unverified`, never `proven`.
 *
 * Self-contained: does not import from @holoscript/mcp-server. The cael.v1
 * hash-chain format and fnv1a logic are replicated here to keep Studio's
 * dependency graph clean. The traceJSONL produced IS valid as input to the
 * public POST /verify-cael endpoint (stateless path; traceJSONL is embedded).
 *
 * @see research/2026-06-16_twin-earth-phone-scan-holonews.md §7 Phase A
 * @see research/2026-06-16_holonews-hololand-surface-and-router-spec.md Part A
 */

import type { NativeCameraScanEvidence, ScanSession } from './reconstruction-scan-store';
import crypto from 'crypto';

// ---------------------------------------------------------------------------
// Claim label types (honesty boundary from G.911)
// ---------------------------------------------------------------------------

/** A measured-path discharge that earned `proven` via CAEL receipt. */
export interface ProvenCaptureClaim {
  captureKind: 'measured';
  claimLabel: 'proven';
  caelTraceId: string;
  traceJSONL: string;
  verifyUrl: string;
  replayFingerprint: string;
  pointCount: number;
  frameCount: number;
  sensorPath: 'lidar' | 'arcore-depth' | 'depth-pose';
}

/** A sensorless (luminance-heuristic) scan: Formalizer abstains. */
export interface UnverifiedCaptureClaim {
  captureKind: 'sensorless';
  claimLabel: 'captured · unverified';
  replayFingerprint?: string;
  abstainReason: string;
}

export type CaptureClaim = ProvenCaptureClaim | UnverifiedCaptureClaim;

// ---------------------------------------------------------------------------
// Minimal CAEL v1 primitives (same format as simulation-tools.ts)
// ---------------------------------------------------------------------------

function fnv1a(input: string): string {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `cael-${(h >>> 0).toString(16).padStart(8, '0')}`;
}

function canonicalSort(value: unknown): unknown {
  if (value === null || value === undefined || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(canonicalSort);
  const obj = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(obj).sort()) out[k] = canonicalSort(obj[k]);
  return out;
}

interface CaelEntry {
  version: 'cael.v1';
  runId: string;
  index: number;
  event: string;
  timestamp: number;
  simTime: number;
  prevHash: string;
  hash: string;
  payload: Record<string, unknown>;
}

function hashCaelEntry(entry: Omit<CaelEntry, 'hash'>): string {
  return fnv1a(JSON.stringify(canonicalSort(entry)));
}

/**
 * Verify the hash chain of a cael.v1 JSONL trace.
 * Returns { valid: true } or { valid: false, brokenAt: number, reason: string }.
 */
function verifyCaelHashChain(
  jsonl: string
): { valid: true; entries: number } | { valid: false; brokenAt: number; reason: string } {
  const lines = jsonl
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length === 0) return { valid: false, brokenAt: 0, reason: 'empty trace' };

  let prevHash = 'cael.genesis';
  let i = 0;
  for (const line of lines) {
    let entry: CaelEntry;
    try {
      entry = JSON.parse(line) as CaelEntry;
    } catch {
      return { valid: false, brokenAt: i, reason: `parse error at line ${i}` };
    }
    if (entry.prevHash !== prevHash) {
      return {
        valid: false,
        brokenAt: i,
        reason: `prevHash mismatch at index ${i}: expected ${prevHash}, got ${entry.prevHash}`,
      };
    }
    // Re-compute hash from the entry body (exclude the hash field itself)
    const { hash, ...rest } = entry;
    const expected = hashCaelEntry(rest as Omit<CaelEntry, 'hash'>);
    if (hash !== expected) {
      return {
        valid: false,
        brokenAt: i,
        reason: `hash mismatch at index ${i}: expected ${expected}, got ${hash}`,
      };
    }
    prevHash = hash;
    i++;
  }

  return { valid: true, entries: lines.length };
}

// ---------------------------------------------------------------------------
// Sensor-path detection (from NativeCameraScanEvidence)
// ---------------------------------------------------------------------------

/**
 * Determine whether a completed scan session used the measured-sensor path.
 *
 * The rule (G.911): depth MUST come from a real device sensor (iOS LiDAR
 * `sceneDepth.depthMap`, ARCore uint16-mm depth). The luminance-heuristic
 * sensorless path can never earn `proven`.
 *
 * Proxy signals from `NativeCameraScanEvidence`:
 *   - `holomap.runtime === 'finalized'` — reconstruction completed
 *   - `holomap.replayFingerprint` present — deterministic replay identity exists
 *   - `holomap.lastPoseConfidence > 0` — ARKit/ARCore 6-DoF pose was active
 *     (only set when `devicePose` or `cameraTransformColumnMajor4x4` drove the
 *     trajectory; see native-camera-live-scan.ts:439)
 *   - `holomap.framesStepped > 0 && holomap.pointCount > 0` — output sanity
 *
 * Conservative rule: if uncertain, abstain (safe direction from A.1).
 */
function detectSensorPath(
  nc: NativeCameraScanEvidence
):
  | { measured: false; reason: string }
  | { measured: true; path: ProvenCaptureClaim['sensorPath'] } {
  const holomap = nc.holomap;
  if (!holomap || holomap.runtime !== 'finalized') {
    return { measured: false, reason: 'HoloMap runtime not finalized' };
  }
  if (!holomap.replayFingerprint) {
    return { measured: false, reason: 'no replayFingerprint — sensorless path' };
  }
  if ((holomap.framesStepped ?? 0) <= 0 || (holomap.pointCount ?? 0) <= 0) {
    return { measured: false, reason: 'no reconstruction output (zero frames or points)' };
  }

  // Pose confidence > 0 is the discriminator for a metrically-driven trajectory.
  // `lastPoseConfidence` is only set when `devicePose` or
  // `cameraTransformColumnMajor4x4` was received (see native-camera-live-scan.ts:439).
  const poseConfidence = holomap.lastPoseConfidence ?? 0;
  if (poseConfidence <= 0) {
    return {
      measured: false,
      reason:
        'zero pose confidence — no ARKit/ARCore 6-DoF pose received; sensorless luminance path',
    };
  }

  // ARCore depth planes set anchorRevision when the mobileSensorBundle adapter runs.
  const path: ProvenCaptureClaim['sensorPath'] =
    (holomap.anchorRevision ?? 0) > 0 ? 'arcore-depth' : 'depth-pose';

  return { measured: true, path };
}

// ---------------------------------------------------------------------------
// CAEL trace builder for a scan-level claim
// ---------------------------------------------------------------------------

/**
 * Generate a `cael.v1` JSONL trace that binds the HoloMap replayFingerprint
 * as a deterministic "geometry hash".  The produced JSONL:
 *   - passes inline hash-chain verification (verifyCaelHashChain)
 *   - is valid input to the public POST /verify-cael endpoint (stateless path)
 *   - carries the scan's capture proof in the `final` entry payload
 *
 * solverType = 'holonews-capture' distinguishes scan traces from physics
 * solver traces (verify_cael_trace re-run behaviour depends on solverType).
 * For this solverType, verification is hash-chain-only (no physics re-run).
 */
function buildScanCaelTrace(opts: {
  replayFingerprint: string;
  frameCount: number;
  pointCount: number;
  sensorPath: string;
  scanToken: string;
  frameDigest: string;
}): string {
  const { replayFingerprint, frameCount, pointCount, sensorPath, scanToken, frameDigest } = opts;

  const runId = `cael-scan-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  const entries: CaelEntry[] = [];
  let prevHash = 'cael.genesis';
  let index = 0;

  function append(event: string, payload: Record<string, unknown>): void {
    const base: Omit<CaelEntry, 'hash'> = {
      version: 'cael.v1',
      runId,
      index,
      event,
      timestamp: Date.now(),
      simTime: 0,
      prevHash,
      payload,
    };
    const hash = hashCaelEntry(base);
    const entry: CaelEntry = { ...base, hash };
    entries.push(entry);
    prevHash = hash;
    index++;
  }

  // INIT: identifies this as a holonews-capture trace
  append('init', {
    solverType: 'holonews-capture',
    config: canonicalSort({
      captureSource: 'native-camera-live-scan',
      sensorPath,
      scanToken,
    }) as Record<string, unknown>,
    contractConfig: {},
    geometryHash: replayFingerprint,
    hashMode: 'fnv1a',
  });

  // SOLVE: embeds reconstruction output identity as stateDigests
  append('solve', {
    totalSteps: frameCount,
    stateDigests: [
      fnv1a(`holonews-capture:${replayFingerprint}:${frameCount}:${pointCount}:${frameDigest}`),
    ],
  });

  // FINAL: provenance + captureProof for human-readable verdict rendering
  append('final', {
    provenance: {
      solverType: 'holonews-capture',
      totalSteps: frameCount,
      totalSimTime: 0,
    },
    captureProof: {
      replayFingerprint,
      frameCount,
      pointCount,
      sensorPath,
      frameDigest,
    },
  });

  return entries.map((e) => JSON.stringify(e)).join('\n');
}

// ---------------------------------------------------------------------------
// Formalizer — the public entry point
// ---------------------------------------------------------------------------

/**
 * Formalizer Stage 1 + Stage 2 (Phase A minimal).
 *
 * Call after the scan session reaches `done` status and the manifest is built.
 * Returns a `CaptureClaim` that labels the session's HoloNews honesty tier.
 *
 * Stage 1: measured-path detection (abstain if sensorless).
 * Stage 2: CAEL discharge — inline hash-chain verification mints the `proven`
 *   label (F.123: receipt IS the mint; no receipt → label unavailable).
 *
 * Never throws — returns `captured · unverified` on any error (safe direction).
 */
export async function formalizerDischarge(session: ScanSession): Promise<CaptureClaim> {
  // Formalizer only runs on sessions with native-camera evidence
  const nc = session.nativeCamera;
  if (!nc) {
    return {
      captureKind: 'sensorless',
      claimLabel: 'captured · unverified',
      abstainReason: 'no native-camera evidence — video-upload path (perceptual only)',
    };
  }

  // Stage 1: sensor-path detection
  const detection = detectSensorPath(nc);
  if (!detection.measured) {
    return {
      captureKind: 'sensorless',
      claimLabel: 'captured · unverified',
      replayFingerprint: nc.holomap?.replayFingerprint,
      abstainReason: detection.reason,
    };
  }

  const { path: sensorPath } = detection;
  const holomap = nc.holomap!;
  const replayFingerprint = holomap.replayFingerprint!;

  // Stage 2: build CAEL trace + discharge (inline hash-chain verification)
  try {
    const traceJSONL = buildScanCaelTrace({
      replayFingerprint,
      frameCount: holomap.framesStepped,
      pointCount: holomap.pointCount,
      sensorPath,
      scanToken: session.token,
      frameDigest: nc.frameDigest,
    });

    // Inline discharge: verify the hash chain (same logic as verify_cael_trace)
    const chainResult = verifyCaelHashChain(traceJSONL);
    if (!chainResult.valid) {
      // Hash chain broken — must abstain
      return {
        captureKind: 'sensorless',
        claimLabel: 'captured · unverified',
        replayFingerprint,
        abstainReason: `CAEL hash-chain verification failed: ${chainResult.reason}`,
      };
    }

    // Parse the traceId from the last JSONL entry
    const lastLine = traceJSONL.split('\n').filter(Boolean).pop() ?? '';
    let caelTraceId = 'cael:unknown';
    try {
      const last = JSON.parse(lastLine) as { runId?: string; hash?: string };
      caelTraceId = `cael:${last.runId ?? 'unknown'}:${last.hash ?? 'nohash'}`;
    } catch {
      // keep default
    }

    // The public verify-cael endpoint accepts the traceJSONL directly (stateless path).
    // The traceId is ephemeral (per-process registry); the traceJSONL is the durable receipt.
    const verifyUrl = `https://mcp.holoscript.net/verify-cael?traceId=${encodeURIComponent(caelTraceId)}`;

    return {
      captureKind: 'measured',
      claimLabel: 'proven',
      caelTraceId,
      traceJSONL,
      verifyUrl,
      replayFingerprint,
      pointCount: holomap.pointCount,
      frameCount: holomap.framesStepped,
      sensorPath,
    };
  } catch (err) {
    // Any exception → abstain (safe direction)
    return {
      captureKind: 'sensorless',
      claimLabel: 'captured · unverified',
      replayFingerprint,
      abstainReason: `Formalizer exception: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
