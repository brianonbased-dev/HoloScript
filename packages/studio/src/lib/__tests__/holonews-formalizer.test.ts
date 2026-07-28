/**
 * HoloNews Formalizer unit tests — Phase A (T-NEWS-CAPTURE-CLAIM).
 *
 * Verifies:
 * 1. Sensorless sessions → `captured · unverified` (Formalizer abstains)
 * 2. Measured-sensor sessions → `proven` with a valid CAEL trace + verifyUrl
 * 3. Edge cases: missing nativeCamera, unfinalized runtime, zero pose confidence
 * 4. The generated CAEL traceJSONL passes hash-chain verification
 * 5. The `proven` label is structurally impossible without a finalized runtime +
 *    non-zero pose confidence (honesty boundary from G.911 / F.123)
 */

import { describe, expect, it } from 'vitest';
import { formalizerDischarge } from '@/lib/holonews-formalizer';
import type { ScanSession, NativeCameraScanEvidence } from '@/lib/reconstruction-scan-store';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function baseSession(overrides: Partial<ScanSession> = {}): ScanSession {
  return {
    token: 'test-token-abc123',
    createdAt: '2026-06-21T00:00:00.000Z',
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    status: 'done',
    scanKind: 'room',
    weightStrategy: 'distill',
    ...overrides,
  };
}

function measuredNativeCamera(poseConfidence = 0.85, anchorRevision = 2): NativeCameraScanEvidence {
  return {
    source: 'mediaDevices.getUserMedia',
    startedAtIso: '2026-06-21T00:00:01.000Z',
    updatedAtIso: '2026-06-21T00:00:05.000Z',
    frameCount: 12,
    frameBytes: 12 * 48,
    frameDigest: 'abc123def456abc123def456abc123def456abc123def456abc123def456abc1',
    width: 4,
    height: 4,
    stride: 3,
    lastFrameIndex: 11,
    firstFrameHash: 'firsthash',
    lastFrameHash: 'lasthash',
    holomap: {
      runtime: 'finalized',
      replayFingerprint: 'holonews-replay:sha256:aabbcc112233aabbcc112233aabbcc112233',
      framesStepped: 12,
      pointCount: 320,
      anchorRevision,
      lastPoseConfidence: poseConfidence,
    },
  };
}

function sensorlessNativeCamera(): NativeCameraScanEvidence {
  return {
    source: 'mediaDevices.getUserMedia',
    startedAtIso: '2026-06-21T00:00:01.000Z',
    updatedAtIso: '2026-06-21T00:00:05.000Z',
    frameCount: 10,
    frameBytes: 10 * 48,
    frameDigest: 'sensorlesshashsensorlesshashsensorlesshashsensorlesshashsensorl',
    width: 4,
    height: 4,
    stride: 3,
    lastFrameIndex: 9,
    holomap: {
      runtime: 'finalized',
      replayFingerprint: 'holonews-replay:sha256:sensorless000111222333',
      framesStepped: 10,
      pointCount: 280,
      // lastPoseConfidence is 0 / absent → sensorless luminance path
      lastPoseConfidence: 0,
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('formalizerDischarge — sensorless abstain (G.911)', () => {
  it('abstains on session with no nativeCamera evidence (video-upload path)', async () => {
    const session = baseSession();
    const claim = await formalizerDischarge(session);
    expect(claim.claimLabel).toBe('captured · unverified');
    expect(claim.captureKind).toBe('sensorless');
    expect((claim as { abstainReason?: string }).abstainReason).toMatch(/no native-camera/i);
  });

  it('abstains when holomap runtime is not finalized', async () => {
    const nc = measuredNativeCamera();
    nc.holomap!.runtime = 'active';
    const session = baseSession({ nativeCamera: nc });
    const claim = await formalizerDischarge(session);
    expect(claim.claimLabel).toBe('captured · unverified');
    expect((claim as { abstainReason?: string }).abstainReason).toMatch(/not finalized/i);
  });

  it('abstains when replayFingerprint is absent', async () => {
    const nc = measuredNativeCamera();
    delete nc.holomap!.replayFingerprint;
    const session = baseSession({ nativeCamera: nc });
    const claim = await formalizerDischarge(session);
    expect(claim.claimLabel).toBe('captured · unverified');
    expect((claim as { abstainReason?: string }).abstainReason).toMatch(/replayFingerprint/i);
  });

  it('abstains when framesStepped is 0', async () => {
    const nc = measuredNativeCamera();
    nc.holomap!.framesStepped = 0;
    const session = baseSession({ nativeCamera: nc });
    const claim = await formalizerDischarge(session);
    expect(claim.claimLabel).toBe('captured · unverified');
    expect((claim as { abstainReason?: string }).abstainReason).toMatch(/zero frames/i);
  });

  it('abstains on sensorless path (zero pose confidence)', async () => {
    const session = baseSession({ nativeCamera: sensorlessNativeCamera() });
    const claim = await formalizerDischarge(session);
    expect(claim.claimLabel).toBe('captured · unverified');
    expect((claim as { abstainReason?: string }).abstainReason).toMatch(/zero pose confidence/i);
  });
});

describe('formalizerDischarge — measured path discharge (Phase A)', () => {
  it('discharges a measured scan → proven with CAEL trace', async () => {
    const session = baseSession({ nativeCamera: measuredNativeCamera() });
    const claim = await formalizerDischarge(session);

    expect(claim.claimLabel).toBe('proven');
    expect(claim.captureKind).toBe('measured');
  });

  it('returns a valid caelTraceId and verifyUrl', async () => {
    const session = baseSession({ nativeCamera: measuredNativeCamera() });
    const claim = await formalizerDischarge(session);

    expect(claim.captureKind).toBe('measured');
    if (claim.captureKind !== 'measured') return; // TypeScript narrowing

    expect(claim.caelTraceId).toMatch(/^cael:/);
    expect(claim.verifyUrl).toMatch(/verify-cael\?traceId=/);
    expect(claim.replayFingerprint).toBe(
      'holonews-replay:sha256:aabbcc112233aabbcc112233aabbcc112233'
    );
  });

  it('embeds the correct pointCount and frameCount', async () => {
    const session = baseSession({ nativeCamera: measuredNativeCamera() });
    const claim = await formalizerDischarge(session);

    expect(claim.captureKind).toBe('measured');
    if (claim.captureKind !== 'measured') return;

    expect(claim.pointCount).toBe(320);
    expect(claim.frameCount).toBe(12);
  });

  it('attributes arcore-depth sensor path when anchorRevision > 0', async () => {
    const session = baseSession({ nativeCamera: measuredNativeCamera(0.8, 3) });
    const claim = await formalizerDischarge(session);

    expect(claim.captureKind).toBe('measured');
    if (claim.captureKind !== 'measured') return;
    expect(claim.sensorPath).toBe('arcore-depth');
  });

  it('attributes depth-pose sensor path when anchorRevision is 0', async () => {
    const session = baseSession({ nativeCamera: measuredNativeCamera(0.75, 0) });
    const claim = await formalizerDischarge(session);

    expect(claim.captureKind).toBe('measured');
    if (claim.captureKind !== 'measured') return;
    expect(claim.sensorPath).toBe('depth-pose');
  });
});

describe('formalizerDischarge — CAEL trace integrity', () => {
  it('produces a traceJSONL with a valid hash chain (3 entries)', async () => {
    const session = baseSession({ nativeCamera: measuredNativeCamera() });
    const claim = await formalizerDischarge(session);

    expect(claim.captureKind).toBe('measured');
    if (claim.captureKind !== 'measured') return;

    const lines = claim.traceJSONL.split('\n').filter(Boolean);
    expect(lines).toHaveLength(3); // init + solve + final
    // Each line is valid JSON
    for (const line of lines) {
      expect(() => JSON.parse(line)).not.toThrow();
    }
    // Events in order
    const entries = lines.map((l) => JSON.parse(l) as { event: string });
    expect(entries[0].event).toBe('init');
    expect(entries[1].event).toBe('solve');
    expect(entries[2].event).toBe('final');
  });

  it('embeds solverType=holonews-capture in the init entry', async () => {
    const session = baseSession({ nativeCamera: measuredNativeCamera() });
    const claim = await formalizerDischarge(session);

    expect(claim.captureKind).toBe('measured');
    if (claim.captureKind !== 'measured') return;

    const initEntry = JSON.parse(claim.traceJSONL.split('\n')[0]) as {
      payload: { solverType: string };
    };
    expect(initEntry.payload.solverType).toBe('holonews-capture');
  });

  it('embeds replayFingerprint as geometryHash in the init entry', async () => {
    const session = baseSession({ nativeCamera: measuredNativeCamera() });
    const claim = await formalizerDischarge(session);

    expect(claim.captureKind).toBe('measured');
    if (claim.captureKind !== 'measured') return;

    const initEntry = JSON.parse(claim.traceJSONL.split('\n')[0]) as {
      payload: { geometryHash: string };
    };
    expect(initEntry.payload.geometryHash).toBe(
      'holonews-replay:sha256:aabbcc112233aabbcc112233aabbcc112233'
    );
  });

  it('hash chain is self-consistent: each entry prevHash matches predecessor', async () => {
    const session = baseSession({ nativeCamera: measuredNativeCamera() });
    const claim = await formalizerDischarge(session);

    expect(claim.captureKind).toBe('measured');
    if (claim.captureKind !== 'measured') return;

    const lines = claim.traceJSONL.split('\n').filter(Boolean);
    const entries = lines.map((l) => JSON.parse(l) as { prevHash: string; hash: string });

    // First entry's prevHash must be the genesis sentinel
    expect(entries[0].prevHash).toBe('cael.genesis');
    // Each subsequent entry's prevHash must match the previous entry's hash
    for (let i = 1; i < entries.length; i++) {
      expect(entries[i].prevHash).toBe(entries[i - 1].hash);
    }
  });

  it('two independent discharges of the same scan produce different runIds', async () => {
    const session = baseSession({ nativeCamera: measuredNativeCamera() });
    const claim1 = await formalizerDischarge(session);
    const claim2 = await formalizerDischarge(session);

    expect(claim1.captureKind).toBe('measured');
    expect(claim2.captureKind).toBe('measured');
    if (claim1.captureKind !== 'measured' || claim2.captureKind !== 'measured') return;

    // runIds differ (timestamp + random suffix)
    const runId1 = (JSON.parse(claim1.traceJSONL.split('\n')[0]) as { runId: string }).runId;
    const runId2 = (JSON.parse(claim2.traceJSONL.split('\n')[0]) as { runId: string }).runId;
    expect(runId1).not.toBe(runId2);
  });
});

describe('formalizerDischarge — honesty boundary (F.123)', () => {
  it('proven is unreachable without measured-sensor evidence', async () => {
    const sensorlessCases: ScanSession[] = [
      // No nativeCamera at all
      baseSession(),
      // Sensorless nativeCamera (zero pose confidence)
      baseSession({ nativeCamera: sensorlessNativeCamera() }),
      // Active (not finalized) runtime
      baseSession({
        nativeCamera: {
          ...measuredNativeCamera(),
          holomap: { ...measuredNativeCamera().holomap!, runtime: 'active' },
        },
      }),
    ];

    for (const session of sensorlessCases) {
      const claim = await formalizerDischarge(session);
      // F.123: proven is structurally unreachable without the receipt
      expect(claim.claimLabel).not.toBe('proven');
      expect(claim.claimLabel).toBe('captured · unverified');
    }
  });
});
