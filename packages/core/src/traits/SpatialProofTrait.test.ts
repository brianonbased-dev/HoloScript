/**
 * SpatialProofTrait + SpatialProofComposer round-trip tests.
 *
 * Validates: trait declaration validation, deterministic canonical hash,
 * required-sensor enforcement, clock-skew enforcement, signer adapter
 * round-trip, and chain-mismatch rejection.
 *
 * Sovereign HoloScript primitive (NMoS build-internal — replaces XYO).
 */

import { describe, it, expect } from 'vitest';

import { SpatialProofTrait } from './SpatialProofTrait';
import {
  composeSpatialProof,
  canonicalPayloadHash,
  createMockSignerAdapter,
  type SpatialProofPayload,
  type SpatialProofSensors,
} from './SpatialProofComposer';

const NOW = 1_778_443_543_252; // fixed wallclock for deterministic tests
const VALID_CONTRACT = '0x' + 'a'.repeat(40);
const VALID_SIGNER_ADDR = '0x' + 'b'.repeat(40);

const baseSensors: SpatialProofSensors = {
  gps: { lat: 37.7749, lon: -122.4194, accuracy_m: 5, captured_at: NOW - 100 },
  imu: null,
  camera_anchor: null,
  wallclock: NOW,
};

const baseConfig = {
  chain: 'base' as const,
  attestation_contract: VALID_CONTRACT,
  clock_skew_tolerance_ms: 5000,
  required_sensors: ['gps', 'wallclock'] as const,
  provenance_class: 'spatial-proof-v1' as const,
  evidence_pack_kind: 'physical-sensor-evidence',
};

describe('SpatialProofTrait.validate', () => {
  it('accepts a minimal valid config', () => {
    expect(SpatialProofTrait.validate({ attestation_contract: VALID_CONTRACT })).toBe(true);
  });

  it('rejects a missing attestation_contract', () => {
    expect(() => SpatialProofTrait.validate({} as never)).toThrow(/attestation_contract is required/);
  });

  it('rejects a malformed attestation_contract', () => {
    expect(() =>
      SpatialProofTrait.validate({ attestation_contract: 'not-an-address' })
    ).toThrow(/0x-prefixed 20-byte address/);
  });

  it('accepts the local-test-mock placeholder', () => {
    expect(SpatialProofTrait.validate({ attestation_contract: 'local-test-mock' })).toBe(true);
  });

  it('rejects a negative clock-skew tolerance', () => {
    expect(() =>
      SpatialProofTrait.validate({
        attestation_contract: VALID_CONTRACT,
        clock_skew_tolerance_ms: -1,
      })
    ).toThrow(/non-negative/);
  });

  it('rejects an unknown sensor in required_sensors', () => {
    expect(() =>
      SpatialProofTrait.validate({
        attestation_contract: VALID_CONTRACT,
        required_sensors: ['gps', 'magnetometer' as never],
      })
    ).toThrow(/unknown sensor 'magnetometer'/);
  });
});

describe('SpatialProofTrait.compile', () => {
  it('emits web scaffolding referencing the composer + Geolocation API', () => {
    const out = SpatialProofTrait.compile({ attestation_contract: VALID_CONTRACT }, 'web');
    expect(out).toContain('composeSpatialProof');
    expect(out).toContain('navigator.geolocation');
    expect(out).toContain('eth_sendTransaction');
    expect(out).not.toContain('eth_signTypedData_v4');
  });

  it('emits node scaffolding without browser sensor APIs', () => {
    const out = SpatialProofTrait.compile({ attestation_contract: VALID_CONTRACT }, 'node');
    expect(out).toContain('composeSpatialProof');
    expect(out).not.toContain('navigator.geolocation');
    expect(out).toContain('eth_sendTransaction');
  });

  it('emits generic scaffolding for unknown targets', () => {
    const out = SpatialProofTrait.compile({ attestation_contract: VALID_CONTRACT }, 'cobol');
    expect(out).toContain('composeSpatialProof');
    expect(out).toContain('eth_sendTransaction');
  });
});

describe('SpatialProofComposer round-trip', () => {
  const signer = createMockSignerAdapter({
    signer_address: VALID_SIGNER_ADDR,
    chain: 'base',
    block_number: 42,
  });

  it('produces an evidence-pack entry with stable hash + receipt', async () => {
    const entry = await composeSpatialProof({
      config: baseConfig,
      sensors: baseSensors,
      signer,
      nowMs: () => NOW,
    });

    expect(entry.kind).toBe('spatial-proof-v1');
    expect(entry.payload_hash).toMatch(/^0x[0-9a-f]+$/);
    expect(entry.receipt.signer_address).toBe(VALID_SIGNER_ADDR);
    expect(entry.receipt.tx_hash).toMatch(/^0xmock-/);
    expect(entry.receipt.block_number).toBe(42);
    expect(entry.payload.sensor_keys_present).toEqual(['gps', 'wallclock']);
    expect(entry.composer_version).toMatch(/spatial-proof-composer\//);
  });

  it('produces the same canonical hash regardless of sensor object property order', () => {
    const a: SpatialProofPayload = {
      provenance_class: 'spatial-proof-v1',
      evidence_pack_kind: 'physical-sensor-evidence',
      chain: 'base',
      attestation_contract: VALID_CONTRACT,
      sensors: { gps: baseSensors.gps, imu: null, camera_anchor: null, wallclock: NOW },
      sensor_keys_present: ['gps', 'wallclock'],
    };
    // Same logical content, different insertion order — must hash identically.
    const b: SpatialProofPayload = {
      sensor_keys_present: ['gps', 'wallclock'],
      sensors: { wallclock: NOW, camera_anchor: null, imu: null, gps: baseSensors.gps },
      attestation_contract: VALID_CONTRACT,
      chain: 'base',
      evidence_pack_kind: 'physical-sensor-evidence',
      provenance_class: 'spatial-proof-v1',
    } as SpatialProofPayload;

    expect(canonicalPayloadHash(a)).toBe(canonicalPayloadHash(b));
  });

  it('produces different hashes for different GPS coordinates', () => {
    const a = canonicalPayloadHash({
      provenance_class: 'spatial-proof-v1',
      evidence_pack_kind: 'physical-sensor-evidence',
      chain: 'base',
      attestation_contract: VALID_CONTRACT,
      sensors: { gps: { lat: 1, lon: 1, accuracy_m: 5, captured_at: NOW }, imu: null, camera_anchor: null, wallclock: NOW },
      sensor_keys_present: ['gps', 'wallclock'],
    });
    const b = canonicalPayloadHash({
      provenance_class: 'spatial-proof-v1',
      evidence_pack_kind: 'physical-sensor-evidence',
      chain: 'base',
      attestation_contract: VALID_CONTRACT,
      sensors: { gps: { lat: 2, lon: 2, accuracy_m: 5, captured_at: NOW }, imu: null, camera_anchor: null, wallclock: NOW },
      sensor_keys_present: ['gps', 'wallclock'],
    });
    expect(a).not.toBe(b);
  });

  it('rejects payloads missing a required sensor', async () => {
    await expect(
      composeSpatialProof({
        config: baseConfig,
        sensors: { ...baseSensors, gps: null },
        signer,
        nowMs: () => NOW,
      })
    ).rejects.toThrow(/required sensor 'gps' is missing/);
  });

  it('rejects sensor timestamps outside clock-skew tolerance', async () => {
    await expect(
      composeSpatialProof({
        config: baseConfig,
        sensors: { ...baseSensors, gps: { ...baseSensors.gps!, captured_at: NOW - 60_000 } },
        signer,
        nowMs: () => NOW,
      })
    ).rejects.toThrow(/exceeds clock-skew tolerance/);
  });

  it('rejects a signer that returns a chain mismatch', async () => {
    const wrongChainSigner = createMockSignerAdapter({
      signer_address: VALID_SIGNER_ADDR,
      chain: 'polygon',
    });
    await expect(
      composeSpatialProof({
        config: baseConfig,
        sensors: baseSensors,
        signer: wrongChainSigner,
        nowMs: () => NOW,
      })
    ).rejects.toThrow(/signer reported chain 'polygon' but config chain is 'base'/);
  });

  it('respects required_sensors=imu — fails until imu reading is supplied', async () => {
    const cfg = { ...baseConfig, required_sensors: ['gps', 'imu', 'wallclock'] as const };
    await expect(
      composeSpatialProof({ config: cfg, sensors: baseSensors, signer, nowMs: () => NOW })
    ).rejects.toThrow(/required sensor 'imu' is missing/);

    const withImu: SpatialProofSensors = {
      ...baseSensors,
      imu: {
        acceleration: { x: 0, y: 0, z: 9.8 },
        rotation: { alpha: 0, beta: 0, gamma: 0 },
        captured_at: NOW - 50,
      },
    };
    const entry = await composeSpatialProof({ config: cfg, sensors: withImu, signer, nowMs: () => NOW });
    expect(entry.payload.sensor_keys_present).toEqual(['gps', 'imu', 'wallclock']);
  });
});
