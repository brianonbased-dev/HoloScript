import { describe, expect, it } from 'vitest';
import {
  TARGET_DEVICE_PROOF_RECEIPT_VERSION,
  cloneHoloShellTargetDeviceProofReceipt,
  isSupportedTargetDeviceKind,
  isSupportedTargetDeviceProofCheckKind,
  isSupportedTargetDeviceProofStatus,
  type HoloShellTargetDeviceProofReceipt,
  validateHoloShellTargetDeviceProofReceipt,
} from '../holoshell-target-device-proof-receipts';

function makeBlockedReceipt(): HoloShellTargetDeviceProofReceipt {
  return {
    schemaVersion: TARGET_DEVICE_PROOF_RECEIPT_VERSION,
    id: 'target_device_proof_001',
    scenario: 'two-agent-handoff-catch',
    generatedAt: '2026-05-19T20:58:00Z',
    target: {
      kind: 'webxr-headset',
      label: 'Quest target device',
      transport: 'adb',
    },
    status: 'blocked',
    checks: [
      {
        id: 'webxr-compile',
        kind: 'compile',
        status: 'pass',
        artifactPath: '.bench-logs/format-stress/target-compiles/webxr',
      },
      {
        id: 'chrome-webgpu',
        kind: 'browser-acceleration',
        status: 'pass',
        artifactPath: '.bench-logs/format-stress/browser-webgpu-probe.json',
      },
      {
        id: 'adb-presence',
        kind: 'device-presence',
        status: 'blocked',
        command: 'adb devices -l',
        detail: 'No attached target device was reported.',
      },
    ],
    blockedReason: 'No attached headset/device for target-frame capture.',
    hash: 'hash_001',
    hashAlgorithm: 'sha256',
    verificationCommands: [
      {
        command: 'adb devices -l',
        description: 'Verify target-device presence before WebXR frame capture.',
      },
    ],
  };
}

describe('target-device proof support guards', () => {
  it('recognizes supported kinds, statuses, and check types', () => {
    expect(isSupportedTargetDeviceKind('webxr-headset')).toBe(true);
    expect(isSupportedTargetDeviceProofStatus('blocked')).toBe(true);
    expect(isSupportedTargetDeviceProofCheckKind('frame-capture')).toBe(true);
    expect(isSupportedTargetDeviceKind('toaster')).toBe(false);
  });
});

describe('validateHoloShellTargetDeviceProofReceipt', () => {
  it('accepts a blocked target-device proof with compile/browser evidence', () => {
    expect(validateHoloShellTargetDeviceProofReceipt(makeBlockedReceipt())).toEqual([]);
  });

  it('requires blockedReason when the proof is blocked', () => {
    const receipt = { ...makeBlockedReceipt(), blockedReason: undefined };
    expect(validateHoloShellTargetDeviceProofReceipt(receipt)).toContain(
      'HoloShellTargetDeviceProofReceipt.blockedReason is required when status=blocked.'
    );
  });

  it('requires frames when the proof passes', () => {
    const receipt = { ...makeBlockedReceipt(), status: 'pass' as const, blockedReason: undefined };
    expect(validateHoloShellTargetDeviceProofReceipt(receipt)).toContain(
      'HoloShellTargetDeviceProofReceipt.frames are required when status=pass.'
    );
  });

  it('accepts pass receipts with target frame evidence', () => {
    const receipt: HoloShellTargetDeviceProofReceipt = {
      ...makeBlockedReceipt(),
      status: 'pass',
      blockedReason: undefined,
      frames: [
        {
          segmentId: '07_catch_constraint',
          frameArtifactPath: '.bench-logs/device-frame.png',
          capturedAt: '2026-05-19T20:59:00Z',
          observedFrameMs: 10.8,
          budgetMs: 11.1,
          provenanceHash: 'frame_hash',
        },
      ],
    };
    expect(validateHoloShellTargetDeviceProofReceipt(receipt)).toEqual([]);
  });
});

describe('cloneHoloShellTargetDeviceProofReceipt', () => {
  it('returns an independent copy', () => {
    const original = {
      ...makeBlockedReceipt(),
      frames: [
        {
          segmentId: '09_receipt_panel',
          frameArtifactPath: '.bench-logs/frame.png',
          capturedAt: '2026-05-19T21:00:00Z',
        },
      ],
      metadata: { source: 'format-stress' },
    };
    const clone = cloneHoloShellTargetDeviceProofReceipt(original);
    expect(clone).toEqual(original);
    expect(clone).not.toBe(original);
    expect(clone.target).not.toBe(original.target);
    expect(clone.checks).not.toBe(original.checks);
    expect(clone.frames).not.toBe(original.frames);
    expect(clone.metadata).not.toBe(original.metadata);
  });
});
