import { describe, it, expect } from 'vitest';
import {
  HARDWARE_RECEIPT_METADATA_SCHEMA_VERSION,
  isPortableHardwareReceiptMetadata,
  validatePortableHardwareReceiptMetadata,
  type PortableHardwareReceiptMetadata,
} from '../HardwareReceiptMetadata';

function buildReceipt(
  overrides: Partial<PortableHardwareReceiptMetadata> = {}
): PortableHardwareReceiptMetadata {
  return {
    schemaVersion: HARDWARE_RECEIPT_METADATA_SCHEMA_VERSION,
    target: {
      id: 'quest3-webxr-holotunnel',
      kind: 'headset',
      architecture: 'arm64',
      artifactKind: 'webxr-room',
    },
    device: {
      vendor: 'Meta',
      model: 'Quest 3',
      accelerator: 'Adreno GPU',
      driverVersions: { browser: 'Chrome WebXR runtime' },
      deviceHash: 'sha256:device-redacted',
    },
    runtime: {
      name: 'WebXR',
      version: 'immersive-vr',
      hostOS: 'Horizon OS',
      adapterFingerprint: 'webxr-adapter:quest3',
    },
    compilerVersion: '6.1.0',
    constraints: [
      {
        id: 'vr-frame-budget',
        description: 'Sustained VR frame budget',
        limit: 11.1,
        unit: 'ms',
        source: 'HoloScript VR validation policy',
      },
    ],
    measuredResults: [
      {
        metric: 'frame_time_p95',
        value: 9.8,
        unit: 'ms',
        method: 'local headset probe',
        sampleCount: 240,
        tolerance: 0.5,
      },
    ],
    replayInputs: [
      {
        kind: 'composition',
        uri: 'holoscript://rooms/holotunnel/replay-input',
        sha256:
          '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      },
    ],
    provenance: {
      capturedAt: '2026-05-20T19:45:00Z',
      sourceCompositionHash: 'sha256:composition-hash',
      commit: 'abc1234',
      commandHash: 'sha256:probe-command',
      trustReceiptId: 'trust_2026-05-20T19-45-00Z_abc123',
      simulationContractId: 'simulation-contract-holotunnel',
    },
    owner: {
      agent: 'codex-hardware',
      team: 'HoloMesh',
    },
    ...overrides,
  };
}

describe('validatePortableHardwareReceiptMetadata', () => {
  it('TRUE case: accepts complete portable hardware metadata', () => {
    const result = validatePortableHardwareReceiptMetadata(buildReceipt());
    expect(result).toEqual({ valid: true, errors: [] });
  });

  it('FALSE case: rejects missing target, device, runtime, compiler, provenance, and owner', () => {
    const result = validatePortableHardwareReceiptMetadata({
      schemaVersion: HARDWARE_RECEIPT_METADATA_SCHEMA_VERSION,
      constraints: [],
      measuredResults: [],
      replayInputs: [],
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        'Missing target',
        'Missing device',
        'Missing runtime',
        'Missing receipt.compilerVersion',
        'Missing provenance',
        'Missing owner',
      ])
    );
  });

  it('FALSE case: rejects receipts without measurements or replay inputs', () => {
    const result = validatePortableHardwareReceiptMetadata(
      buildReceipt({
        measuredResults: [],
        replayInputs: [],
      })
    );

    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        'measuredResults must include at least one measurement',
        'replayInputs must include at least one replay input',
      ])
    );
  });

  it('FALSE case: rejects incomplete measurement and replay rows', () => {
    const result = validatePortableHardwareReceiptMetadata(
      buildReceipt({
        measuredResults: [
          {
            metric: '',
            value: Number.NaN,
            unit: '',
            method: '',
          },
        ],
        replayInputs: [
          {
            kind: '',
            uri: '',
            sha256: '',
          },
        ],
      })
    );

    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        'Missing measuredResults[0].metric',
        'Missing measuredResults[0].value',
        'Missing measuredResults[0].unit',
        'Missing measuredResults[0].method',
        'Missing replayInputs[0].kind',
        'Missing replayInputs[0].uri',
        'Missing replayInputs[0].sha256',
      ])
    );
  });
});

describe('isPortableHardwareReceiptMetadata', () => {
  it('narrows valid receipt metadata', () => {
    const receipt: unknown = buildReceipt();
    expect(isPortableHardwareReceiptMetadata(receipt)).toBe(true);
  });

  it('rejects non-object receipt metadata', () => {
    expect(isPortableHardwareReceiptMetadata(null)).toBe(false);
  });
});
