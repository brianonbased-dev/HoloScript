/**
 * Spatial Proof Trait
 *
 * Sovereign HoloScript primitive for proof-of-physical-location and sensor
 * data — the build-internal answer to bridging XYO Layer One (founder
 * ruling 2026-05-10; D.036 Neural Map of Superiority; F.046 NMoS bar).
 *
 * Composes GPS + IMU + camera-derived positional anchors + sensor signatures
 * into a typed payload, hashes deterministically, and emits a HoloScript
 * provenance entry signed by the agent's x402 seat-wallet via the safe
 * eth_sendTransaction calldata path (NOT eth_signTypedData_v4 from-arg
 * trust — see W.GOLD.514 / F.041).
 *
 * The trait declaration here is compose-time scaffolding (validate + emit
 * target-specific code). The deterministic runtime composer that produces
 * verifiable evidence-pack entries lives in `SpatialProofComposer.ts`.
 *
 * @version 0.1.0
 * @sovereignty NMoS build-internal — replaces XYO bridge
 * @sourceRefs research/2026-05-10_neural-map-of-superiority.md (D.036)
 *             research/2026-05-10_xyo-layer-one-competitor-CALIBRATION.md
 *             memory/feedback_neural-map-of-superiority.md (F.046)
 */

import type { TraitHandler } from './TraitTypes';

// =============================================================================
// TYPES
// =============================================================================

export type SpatialProofChain = 'base' | 'base-sepolia' | 'polygon' | 'optimism' | 'local-test';
export type SpatialProofProvenanceClass = 'spatial-proof-v1';
export type SpatialProofRequiredSensor = 'gps' | 'imu' | 'camera_anchor' | 'wallclock';

/**
 * Compose-time configuration for a `@spatialProof` trait declaration.
 * Resolved into target-specific scaffolding by `compile()`.
 */
export interface SpatialProofConfig {
  /** Chain on which the attestation tx is submitted. Default: 'base'. */
  chain?: SpatialProofChain;

  /**
   * Address of the attestation contract that records the proof hash.
   * In test/local-only contexts this can be a placeholder; the chain
   * enforces the from-arg, so an off-chain mock signer is acceptable
   * for unit tests but unsafe for production attestations.
   */
  attestation_contract: string;

  /** Maximum allowed skew between sensor timestamps (ms). Default: 5000. */
  clock_skew_tolerance_ms?: number;

  /**
   * Required sensors. Composer rejects payloads missing any of these.
   * Default: ['gps', 'wallclock']. Add 'imu' / 'camera_anchor' when those
   * adapters are available on the deployment surface.
   */
  required_sensors?: SpatialProofRequiredSensor[];

  /** Provenance schema class. Default: 'spatial-proof-v1'. */
  provenance_class?: SpatialProofProvenanceClass;

  /**
   * Evidence-pack kind label used when this trait emits into a CURE /
   * SimulationContract evidence pack. Default: 'physical-sensor-evidence'.
   */
  evidence_pack_kind?: string;
}

const DEFAULT_CHAIN: SpatialProofChain = 'base';
const DEFAULT_CLOCK_SKEW_MS = 5000;
const DEFAULT_REQUIRED_SENSORS: SpatialProofRequiredSensor[] = ['gps', 'wallclock'];
const DEFAULT_PROVENANCE_CLASS: SpatialProofProvenanceClass = 'spatial-proof-v1';
const DEFAULT_EVIDENCE_PACK_KIND = 'physical-sensor-evidence';

function resolved(config: SpatialProofConfig): Required<SpatialProofConfig> {
  return {
    chain: config.chain ?? DEFAULT_CHAIN,
    attestation_contract: config.attestation_contract,
    clock_skew_tolerance_ms: config.clock_skew_tolerance_ms ?? DEFAULT_CLOCK_SKEW_MS,
    required_sensors: config.required_sensors ?? [...DEFAULT_REQUIRED_SENSORS],
    provenance_class: config.provenance_class ?? DEFAULT_PROVENANCE_CLASS,
    evidence_pack_kind: config.evidence_pack_kind ?? DEFAULT_EVIDENCE_PACK_KIND,
  };
}

// =============================================================================
// TRAIT HANDLER
// =============================================================================

export const SpatialProofTrait: TraitHandler<SpatialProofConfig> = {
  name: 'spatial_proof',

  validate(config: SpatialProofConfig): boolean {
    if (typeof config.attestation_contract !== 'string' || config.attestation_contract.trim() === '') {
      throw new Error('SpatialProofTrait: attestation_contract is required');
    }
    if (config.attestation_contract !== 'local-test-mock' && !/^0x[a-fA-F0-9]{40}$/.test(config.attestation_contract)) {
      throw new Error(
        `SpatialProofTrait: attestation_contract must be a 0x-prefixed 20-byte address, got '${config.attestation_contract}'`
      );
    }
    const skew = config.clock_skew_tolerance_ms;
    if (skew !== undefined && (!Number.isFinite(skew) || skew < 0)) {
      throw new Error('SpatialProofTrait: clock_skew_tolerance_ms must be a non-negative number');
    }
    const sensors = config.required_sensors;
    if (sensors !== undefined) {
      if (!Array.isArray(sensors) || sensors.length === 0) {
        throw new Error('SpatialProofTrait: required_sensors must be a non-empty array if provided');
      }
      const allowed: SpatialProofRequiredSensor[] = ['gps', 'imu', 'camera_anchor', 'wallclock'];
      for (const sensor of sensors) {
        if (!allowed.includes(sensor)) {
          throw new Error(
            `SpatialProofTrait: required_sensors contains unknown sensor '${sensor}'. Allowed: ${allowed.join(', ')}`
          );
        }
      }
    }
    return true;
  },

  compile(config: SpatialProofConfig, target: string): string {
    const self = this as unknown as Record<string, (c: SpatialProofConfig) => string>;
    switch (target) {
      case 'web':
      case 'react-three-fiber':
      case 'webxr':
        return self.compileWeb(config);
      case 'node':
      case 'node-service':
      case 'mcp-server':
        return self.compileNode(config);
      default:
        return self.compileGeneric(config);
    }
  },

  compileWeb(config: SpatialProofConfig): string {
    const r = resolved(config);
    return `
// SpatialProof — web/react-three-fiber/webxr scaffolding (sovereign, NMoS build-internal)
// Sensor adapters: W3C Geolocation API + DeviceMotion + (optional) HoloMap camera anchor.
// Signing path: eth_sendTransaction with EIP-712 hash as calldata (W.GOLD.514 / F.041 safe path).
import { composeSpatialProof } from '@holoscript/core/traits/SpatialProofComposer';

export const spatialProofConfig = ${JSON.stringify(r, null, 2)};

export async function captureSpatialProof(signer, opts = {}) {
  const wallclock = Date.now();
  const gps = await new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject(new Error('Geolocation API unavailable'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lon: p.coords.longitude, accuracy_m: p.coords.accuracy, captured_at: p.timestamp }),
      (err) => reject(err),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  });
  const imu = opts.imu ?? null; // wire DeviceMotion listener separately; pass last reading here
  const cameraAnchor = opts.cameraAnchor ?? null; // optional HoloMap reconstruction byproduct
  return composeSpatialProof({
    config: spatialProofConfig,
    sensors: { gps, imu, camera_anchor: cameraAnchor, wallclock },
    signer,
  });
}
`.trim();
  },

  compileNode(config: SpatialProofConfig): string {
    const r = resolved(config);
    return `
// SpatialProof — node/server scaffolding (sovereign, NMoS build-internal)
// Server-side composition (e.g. inside an MCP tool) — sensor inputs come from
// the calling agent's payload, not from a browser sensor API. Signing remains
// eth_sendTransaction with EIP-712 hash as calldata (W.GOLD.514 / F.041).
import { composeSpatialProof } from '@holoscript/core/traits/SpatialProofComposer';

export const spatialProofConfig = ${JSON.stringify(r, null, 2)};

export async function attestSpatialProof(sensors, signer) {
  return composeSpatialProof({ config: spatialProofConfig, sensors, signer });
}
`.trim();
  },

  compileGeneric(config: SpatialProofConfig): string {
    const r = resolved(config);
    return `
// SpatialProof — generic scaffolding (sovereign, NMoS build-internal).
// Wire your platform's sensor adapter + x402 seat-wallet signer into composeSpatialProof.
// Signing path: eth_sendTransaction with EIP-712 hash as calldata (W.GOLD.514 / F.041).
const spatialProofConfig = ${JSON.stringify(r, null, 2)};
`.trim();
  },
};

export default SpatialProofTrait;
