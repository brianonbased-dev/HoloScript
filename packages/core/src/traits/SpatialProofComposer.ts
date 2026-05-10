/**
 * SpatialProofComposer
 *
 * Deterministic runtime composer for `@spatialProof` traits. Takes
 * already-collected sensor inputs + a SignerAdapter, produces a typed
 * evidence-pack entry with a stable canonical hash and an attestation
 * receipt. Pure function; no platform sensor APIs, no live network calls
 * here — adapters inject those.
 *
 * Safe-signing contract (W.GOLD.514 / F.041): signers MUST submit via
 * eth_sendTransaction with the EIP-712-style payload hash as calldata.
 * The chain enforces the from-arg; servers verify by recovering the
 * signer from the on-chain tx. NEVER trust eth_signTypedData_v4 from-arg.
 *
 * @sovereignty NMoS build-internal — replaces XYO bridge
 * @version 0.1.0
 */

import type {
  SpatialProofChain,
  SpatialProofConfig,
  SpatialProofProvenanceClass,
  SpatialProofRequiredSensor,
} from './SpatialProofTrait';

// =============================================================================
// PUBLIC TYPES
// =============================================================================

export interface GpsReading {
  /** Latitude in decimal degrees. */
  lat: number;
  /** Longitude in decimal degrees. */
  lon: number;
  /** Reported horizontal accuracy in meters. */
  accuracy_m: number;
  /** Sensor capture timestamp in unix ms. */
  captured_at: number;
}

export interface ImuReading {
  /** Acceleration on x/y/z in m/s^2 (DeviceMotion-compatible). */
  acceleration: { x: number; y: number; z: number };
  /** Rotation rate alpha/beta/gamma in deg/s. */
  rotation: { alpha: number; beta: number; gamma: number };
  /** Sensor capture timestamp in unix ms. */
  captured_at: number;
}

export interface CameraAnchorReading {
  /**
   * Opaque anchor id from the upstream HoloMap reconstruction or
   * ARKit/ARCore frame. Verifier consumes this without interpreting.
   */
  anchor_id: string;
  /** Reconstruction confidence 0..1 if available, else null. */
  confidence: number | null;
  /** Sensor capture timestamp in unix ms. */
  captured_at: number;
}

export interface SpatialProofSensors {
  gps: GpsReading | null;
  imu: ImuReading | null;
  camera_anchor: CameraAnchorReading | null;
  /** Wallclock at composition time in unix ms. Always required. */
  wallclock: number;
}

export interface SpatialProofPayload {
  provenance_class: SpatialProofProvenanceClass;
  evidence_pack_kind: string;
  chain: SpatialProofChain;
  attestation_contract: string;
  sensors: SpatialProofSensors;
  /** Sorted list of sensor keys actually supplied (for canonicalization stability). */
  sensor_keys_present: SpatialProofRequiredSensor[];
}

export interface AttestationReceipt {
  /** On-chain tx hash from eth_sendTransaction. */
  tx_hash: string;
  /** Recovered signer (chain-enforced from-arg). */
  signer_address: string;
  /** Block number where the tx was included. */
  block_number: number;
  /** Chain on which the tx was submitted. */
  chain: SpatialProofChain;
}

export interface SignerAdapter {
  /**
   * Submit attestation via eth_sendTransaction with payloadHash as calldata.
   * Implementation MUST NOT use eth_signTypedData_v4 (W.GOLD.514 / F.041).
   * Returns a receipt with the on-chain tx-hash + recovered signer + block.
   */
  attest(payload: SpatialProofPayload, payloadHash: string): Promise<AttestationReceipt>;
}

export interface SpatialProofEvidenceEntry {
  /** Provenance schema class. */
  kind: SpatialProofProvenanceClass;
  /** Stable canonical hash of the payload (hex string, 0x-prefixed). */
  payload_hash: string;
  /** The full payload (sensor readings + config metadata). */
  payload: SpatialProofPayload;
  /** Attestation receipt from the safe-signing path. */
  receipt: AttestationReceipt;
  /** Composer version that produced this entry. */
  composer_version: string;
}

export interface ComposeSpatialProofInput {
  config: Required<SpatialProofConfig>;
  sensors: SpatialProofSensors;
  signer: SignerAdapter;
  /** Optional: overrides Date.now() for deterministic tests. */
  nowMs?: () => number;
}

export const COMPOSER_VERSION = 'spatial-proof-composer/0.1.0';

// =============================================================================
// COMPOSER
// =============================================================================

/**
 * Compose a SpatialProof evidence-pack entry from supplied sensors.
 * Validates required sensors are present, validates clock-skew, computes
 * canonical payload hash, calls signer.attest(), returns the entry.
 */
export async function composeSpatialProof(
  input: ComposeSpatialProofInput
): Promise<SpatialProofEvidenceEntry> {
  const { config, sensors, signer } = input;
  const now = (input.nowMs ?? Date.now)();

  validateRequiredSensors(config.required_sensors, sensors);
  validateClockSkew(config.clock_skew_tolerance_ms, sensors, now);

  const sensorKeysPresent = enumerateSensorKeys(sensors);

  const payload: SpatialProofPayload = {
    provenance_class: config.provenance_class,
    evidence_pack_kind: config.evidence_pack_kind,
    chain: config.chain,
    attestation_contract: config.attestation_contract,
    sensors,
    sensor_keys_present: sensorKeysPresent,
  };

  const payloadHash = canonicalPayloadHash(payload);

  const receipt = await signer.attest(payload, payloadHash);

  if (receipt.chain !== config.chain) {
    throw new Error(
      `SpatialProofComposer: signer reported chain '${receipt.chain}' but config chain is '${config.chain}'`
    );
  }

  return {
    kind: config.provenance_class,
    payload_hash: payloadHash,
    payload,
    receipt,
    composer_version: COMPOSER_VERSION,
  };
}

// =============================================================================
// VALIDATION
// =============================================================================

function validateRequiredSensors(
  required: SpatialProofRequiredSensor[],
  sensors: SpatialProofSensors
): void {
  for (const key of required) {
    if (key === 'wallclock') {
      if (typeof sensors.wallclock !== 'number' || !Number.isFinite(sensors.wallclock)) {
        throw new Error('SpatialProofComposer: required sensor wallclock missing or invalid');
      }
      continue;
    }
    if (sensors[key] == null) {
      throw new Error(`SpatialProofComposer: required sensor '${key}' is missing`);
    }
  }
}

function validateClockSkew(
  toleranceMs: number,
  sensors: SpatialProofSensors,
  nowMs: number
): void {
  const samples: number[] = [sensors.wallclock];
  if (sensors.gps) samples.push(sensors.gps.captured_at);
  if (sensors.imu) samples.push(sensors.imu.captured_at);
  if (sensors.camera_anchor) samples.push(sensors.camera_anchor.captured_at);

  for (const ts of samples) {
    if (typeof ts !== 'number' || !Number.isFinite(ts)) {
      throw new Error('SpatialProofComposer: invalid timestamp on a sensor reading');
    }
    if (Math.abs(ts - nowMs) > toleranceMs) {
      throw new Error(
        `SpatialProofComposer: timestamp ${ts} exceeds clock-skew tolerance ${toleranceMs}ms from now ${nowMs}`
      );
    }
  }
}

function enumerateSensorKeys(sensors: SpatialProofSensors): SpatialProofRequiredSensor[] {
  const keys: SpatialProofRequiredSensor[] = [];
  if (sensors.gps != null) keys.push('gps');
  if (sensors.imu != null) keys.push('imu');
  if (sensors.camera_anchor != null) keys.push('camera_anchor');
  if (typeof sensors.wallclock === 'number' && Number.isFinite(sensors.wallclock)) {
    keys.push('wallclock');
  }
  keys.sort();
  return keys;
}

// =============================================================================
// CANONICAL HASH
// =============================================================================

/**
 * Stable canonical hash over the payload. Sorts keys deterministically so
 * the same logical inputs always produce the same hash regardless of
 * insertion order. Uses a non-cryptographic FNV-1a 32-bit hash for the
 * v0.1 scaffolding — production must replace with EIP-712 typed-data
 * encoder + keccak256 to be on-chain-verifiable. Marked `internal` so
 * downstream callers don't pin against the v0.1 hash representation.
 *
 * @internal
 */
export function canonicalPayloadHash(payload: SpatialProofPayload): string {
  const canonical = canonicalSerialize(payload);
  // FNV-1a 32-bit; placeholder. Replace with keccak256(eip712Encode(payload))
  // before any production attestation.
  let hash = 0x811c9dc5;
  for (let i = 0; i < canonical.length; i++) {
    hash ^= canonical.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `0x${hash.toString(16).padStart(8, '0')}`;
}

function canonicalSerialize(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return 'null';
  const t = typeof value;
  if (t === 'number') return Number.isFinite(value as number) ? String(value) : 'null';
  if (t === 'string') return JSON.stringify(value);
  if (t === 'boolean') return String(value);
  if (Array.isArray(value)) {
    return `[${value.map(canonicalSerialize).join(',')}]`;
  }
  if (t === 'object') {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    const entries = keys.map((k) => `${JSON.stringify(k)}:${canonicalSerialize(obj[k])}`);
    return `{${entries.join(',')}}`;
  }
  return 'null';
}

// =============================================================================
// MOCK SIGNER (test fixture)
// =============================================================================

/**
 * Deterministic mock signer adapter for tests. Production code MUST use a
 * real signer that submits eth_sendTransaction on the configured chain.
 *
 * @internal
 */
export function createMockSignerAdapter(opts: {
  signer_address: string;
  chain: SpatialProofChain;
  block_number?: number;
}): SignerAdapter {
  return {
    async attest(_payload, payloadHash) {
      return {
        tx_hash: `0xmock-${payloadHash.slice(2, 10)}`,
        signer_address: opts.signer_address,
        block_number: opts.block_number ?? 1,
        chain: opts.chain,
      };
    },
  };
}
