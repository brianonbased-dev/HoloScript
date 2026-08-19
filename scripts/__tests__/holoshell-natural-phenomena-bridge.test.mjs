import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  TEMPLATE_CLAMPS,
  SCENE_LIBRARY,
  TEMPERAMENT_SCENE_MAP,
  bubbleDensityFromContext,
  fireActivityFromRuntime,
  leafActivityFromContext,
  sceneFromPersonalization,
  computeBridge,
  applyBridge,
} from '../holoshell-natural-phenomena-bridge.mjs';

describe('bubbleDensityFromContext', () => {
  it('floors empty signal at template min (4)', () => {
    expect(bubbleDensityFromContext({})).toBe(TEMPLATE_CLAMPS.bubbleDensityMin);
  });

  it('sums visible objects + recent receipts', () => {
    expect(bubbleDensityFromContext({ visibleShellObjectCount: 8, recentReceiptCount: 3 })).toBe(11);
  });

  it('caps at template max (40)', () => {
    expect(bubbleDensityFromContext({ visibleShellObjectCount: 500, recentReceiptCount: 0 }))
      .toBe(TEMPLATE_CLAMPS.bubbleDensityMax);
  });

  it('coerces non-number garbage to floor (false-case)', () => {
    expect(bubbleDensityFromContext({ visibleShellObjectCount: 'banana', recentReceiptCount: null }))
      .toBe(TEMPLATE_CLAMPS.bubbleDensityMin);
  });
});

describe('fireActivityFromRuntime', () => {
  it('returns idleFloor when nothing is happening', () => {
    const v = fireActivityFromRuntime({ toolCallCount: 0, actionProposalCount: 0, windowMs: 60_000 });
    expect(v).toBeCloseTo(0.15, 5);
  });

  it('respects template ceiling (2.0) on flood', () => {
    const v = fireActivityFromRuntime({
      toolCallCount: 9999,
      actionProposalCount: 9999,
      windowMs: 60_000,
    });
    expect(v).toBeLessThanOrEqual(TEMPLATE_CLAMPS.fireActivityMax);
    // tanh saturates near 1 — formula maxes at 0.15 + 0.4 + 0.6 = 1.15, well under 2.0.
    expect(v).toBeCloseTo(1.15, 2);
  });

  it('moderate activity falls in the warm-orange band (<1.5, >0.2)', () => {
    const v = fireActivityFromRuntime({
      toolCallCount: 3,
      actionProposalCount: 2,
      windowMs: 60_000,
    });
    expect(v).toBeGreaterThan(0.2);
    expect(v).toBeLessThan(1.5);
  });

  it('treats sub-second window as if it were 1s (avoid divide-by-tiny strobe)', () => {
    // toolCallCount=1 over 100ms would explode without the safeWindow floor.
    const v = fireActivityFromRuntime({ toolCallCount: 1, windowMs: 100 });
    expect(v).toBeLessThanOrEqual(TEMPLATE_CLAMPS.fireActivityMax);
  });

  it('honors missing window with the 60s default', () => {
    const v = fireActivityFromRuntime({ toolCallCount: 6 });
    // 6 calls / minute => tanh(6/3)*0.4 + 0 + 0.15 ≈ 0.536
    expect(v).toBeGreaterThan(0.4);
    expect(v).toBeLessThan(0.7);
  });
});

describe('leafActivityFromContext', () => {
  it('floors at template min when no pending or recent', () => {
    expect(leafActivityFromContext({})).toBe(TEMPLATE_CLAMPS.leafActivityLevelMin);
  });

  it('weights pending approvals heavier than ambient receipt rate', () => {
    const onlyPending = leafActivityFromContext({ pendingApprovalCount: 3 });
    const onlyReceipts = leafActivityFromContext({ recentReceiptCount: 3, windowMs: 60_000 });
    expect(onlyPending).toBeGreaterThan(onlyReceipts);
  });

  it('caps at template ceiling (3.0)', () => {
    const v = leafActivityFromContext({ pendingApprovalCount: 9999 });
    expect(v).toBe(TEMPLATE_CLAMPS.leafActivityLevelMax);
  });
});

describe('sceneFromPersonalization', () => {
  it('returns preferredScene when explicit and valid', () => {
    expect(sceneFromPersonalization({ preferredScene: 'ZenGardenScene' })).toBe('ZenGardenScene');
  });

  it('rejects preferredScene not in the library (no off-list scenes)', () => {
    expect(sceneFromPersonalization({ preferredScene: 'TotallyMadeUpScene' })).toBeNull();
  });

  it('falls back to temperament map when preferredScene absent', () => {
    expect(sceneFromPersonalization({ temperament: 'reflective' })).toBe('ZenGardenScene');
    expect(sceneFromPersonalization({ temperament: 'expansive' })).toBe('MountainLakeScene');
    expect(sceneFromPersonalization({ temperament: 'warm' })).toBe('NightCampfireScene');
    expect(sceneFromPersonalization({ temperament: 'curious' })).toBe('WarmLibraryScene');
    expect(sceneFromPersonalization({ temperament: 'gentle' })).toBe('UnderwaterScene');
  });

  it('case-insensitive temperament match', () => {
    expect(sceneFromPersonalization({ temperament: 'REFLECTIVE' })).toBe('ZenGardenScene');
  });

  it('returns null on empty profile — preserves D.051 (no signal -> no router mutation)', () => {
    expect(sceneFromPersonalization({})).toBeNull();
    expect(sceneFromPersonalization(null)).toBeNull();
    expect(sceneFromPersonalization()).toBeNull();
  });

  it('every temperament destination is in the canonical scene library', () => {
    for (const scene of Object.values(TEMPERAMENT_SCENE_MAP)) {
      expect(SCENE_LIBRARY).toContain(scene);
    }
  });
});

describe('computeBridge', () => {
  it('emits the 3 always-present template calls', () => {
    const result = computeBridge({});
    const targets = result.calls.map((c) => `${c.template}.${c.action}`);
    expect(targets).toEqual([
      'BubbleField.set_density',
      'FireSource.set_activity',
      'LeafField.set_incoming_rate',
    ]);
    expect(result.summary.sceneMutationApplied).toBe(false);
  });

  it('appends the router call only when personalization produces a scene', () => {
    const withScene = computeBridge({
      personalization: { temperament: 'reflective', producedAt: '2026-05-18T00:00:00Z' },
    });
    const targets = withScene.calls.map((c) => `${c.template}.${c.action}`);
    expect(targets).toContain('HoloShellRouter.set_brittney_scene');
    expect(withScene.summary.routerScene).toBe('ZenGardenScene');
    expect(withScene.summary.sceneMutationApplied).toBe(true);
  });

  it('shape-checks: every call has template + action + argument', () => {
    const result = computeBridge({
      context: {
        summary: { visibleShellObjectCount: 5, recentReceiptCount: 2 },
        approvalSummary: { pendingApprovalCount: 1 },
      },
      runtime: { toolCallCount: 4, actionProposalCount: 1, windowMs: 60_000, turnId: 'turn-1' },
      personalization: { preferredScene: 'WarmLibraryScene', producedAt: '2026-05-18T00:01:00Z' },
    });
    for (const call of result.calls) {
      expect(typeof call.template).toBe('string');
      expect(typeof call.action).toBe('string');
      expect(call.argument).toBeDefined();
    }
  });
});

describe('applyBridge — I/O + receipt envelope', () => {
  let dir;
  let paths;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'phenomena-bridge-'));
    paths = {
      contextReceipt: join(dir, 'ctx.json'),
      runtimeReceipt: join(dir, 'turn.json'),
      personalizationProfile: join(dir, 'profile.json'),
      bridgeReceipt: join(dir, 'bridge-receipt.json'),
    };
  });

  it('returns skipped + empty mapping when no receipts exist', () => {
    const result = applyBridge({ paths });
    // No previous receipt, no inputs — should APPLY with floor values, not error.
    expect(result.skipped).toBe(false);
    expect(result.summary.bubbleDensity).toBe(TEMPLATE_CLAMPS.bubbleDensityMin);
    expect(result.summary.fireActivity).toBeCloseTo(0.15, 5);
    expect(result.summary.routerScene).toBeNull();
    expect(existsSync(paths.bridgeReceipt)).toBe(true);
  });

  it('REJECTS context when redacted=false (BridgeConsumesRedactedOnly)', () => {
    writeFileSync(paths.contextReceipt, JSON.stringify({
      summary: { visibleShellObjectCount: 999 },
      privacyBoundary: { redacted: false },
      receipt: { contextHash: 'unredacted-hash' },
    }), 'utf8');
    const result = applyBridge({ paths });
    expect(result.skipped).toBe(true);
    expect(result.skipReason).toBe('context-not-redacted');
    // Critically: no calls applied, no bubble density derived from un-redacted source
    expect(result.summary).toBeUndefined();
  });

  it('REJECTS adapter-style component flags when any privacy bool is true', () => {
    // Live shape — privacyBoundary has no derived "redacted" field, only
    // rawCommandsIncluded / rawWindowTitlesIncluded / secretsIncluded.
    writeFileSync(paths.contextReceipt, JSON.stringify({
      summary: { visibleShellObjectCount: 5 },
      privacyBoundary: {
        rawCommandsIncluded: true,    // <-- leak
        rawWindowTitlesIncluded: false,
        secretsIncluded: false,
      },
      receipt: { contextHash: 'leaky' },
    }), 'utf8');
    const result = applyBridge({ paths });
    expect(result.skipped).toBe(true);
    expect(result.skipReason).toBe('context-not-redacted');
  });

  it('ACCEPTS adapter-style component flags when all three are false (live receipt shape)', () => {
    writeFileSync(paths.contextReceipt, JSON.stringify({
      summary: { visibleShellObjectCount: 18, recentReceiptCount: 14, pendingApprovalCount: 3 },
      approvalSummary: { pendingApprovalCount: 3 },
      privacyBoundary: {
        rawCommandsIncluded: false,
        rawWindowTitlesIncluded: false,
        secretsIncluded: false,
      },
      receipt: { contextHash: 'live-shape-1' },
    }), 'utf8');
    const result = applyBridge({ paths });
    expect(result.skipped).toBe(false);
    expect(result.summary.bubbleDensity).toBe(32); // 18+14, within cap
    expect(result.redactedConfirmed).toBe(true);
  });

  it('idempotency: rerun with identical source hashes returns skipped=no-signal-change', () => {
    writeFileSync(paths.contextReceipt, JSON.stringify({
      summary: { visibleShellObjectCount: 6, recentReceiptCount: 1, pendingApprovalCount: 0 },
      approvalSummary: { pendingApprovalCount: 0 },
      privacyBoundary: { redacted: true },
      receipt: { contextHash: 'sha256:stable-1' },
    }), 'utf8');
    const first = applyBridge({ paths });
    expect(first.skipped).toBe(false);
    const second = applyBridge({ paths });
    expect(second.skipped).toBe(true);
    expect(second.skipReason).toBe('no-signal-change');
    // Same bridgeApplyId — second call returns the persisted receipt + rebuilds reEvaluatedAt
    expect(second.bridgeApplyId).toBe(first.bridgeApplyId);
    expect(second.reEvaluatedAt).toBeTruthy();
  });

  it('writes a parseable receipt with source provenance', () => {
    writeFileSync(paths.contextReceipt, JSON.stringify({
      summary: { visibleShellObjectCount: 10, recentReceiptCount: 4, pendingApprovalCount: 2 },
      approvalSummary: { pendingApprovalCount: 2 },
      privacyBoundary: { redacted: true },
      receipt: { contextHash: 'sha256:provenance-1' },
    }), 'utf8');
    writeFileSync(paths.runtimeReceipt, JSON.stringify({
      turnId: 'turn-prov-1',
      toolCallCount: 3,
      actionProposalCount: 1,
      windowMs: 60_000,
    }), 'utf8');
    writeFileSync(paths.personalizationProfile, JSON.stringify({
      producedAt: '2026-05-18T00:00:00Z',
      producedBy: '@holoscript/aibrittney',
      temperament: 'warm',
    }), 'utf8');

    const result = applyBridge({ paths });
    expect(result.skipped).toBe(false);
    expect(result.receiptType).toBe('hololand.holoshell.natural-phenomena-bridge.v0.1.0');
    expect(result.sourceHashes).toEqual({
      context: 'sha256:provenance-1',
      runtime: 'turn-prov-1',
      personalization: '2026-05-18T00:00:00Z',
    });
    expect(result.summary.routerScene).toBe('NightCampfireScene');

    const onDisk = JSON.parse(readFileSync(paths.bridgeReceipt, 'utf8'));
    expect(onDisk.bridgeApplyId).toBe(result.bridgeApplyId);
    expect(onDisk.calls.length).toBe(4); // 3 phenomena + 1 router
  });
});
