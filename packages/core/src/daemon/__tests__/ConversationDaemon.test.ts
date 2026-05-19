import { describe, it, expect } from 'vitest';
import {
  assertDaemonFieldSeparation,
  DaemonFieldSeparationError,
  makeDefaultConversationDaemon,
  makeEmptyContextDelta,
  type ConversationDaemon,
  type ConversationDaemonTurn,
} from '../ConversationDaemon';

function baseValidDaemon(): ConversationDaemon {
  return makeDefaultConversationDaemon('d1', 'owner1', 'Lumi', 'care-v1');
}

describe('makeDefaultConversationDaemon', () => {
  it('produces a structurally valid daemon', () => {
    const d = baseValidDaemon();
    expect(d.daemonId).toBe('d1');
    expect(d.ownerId).toBe('owner1');
    expect(d.displayName).toBe('Lumi');
    expect(d.careProfile).toBe('care-v1');
    expect(d.ownerPolicy).toBe('private');
    expect(d.memoryPolicy.ownerScoped).toBe(true);
  });

  it('defaults to read-only, no autonomous mutations', () => {
    const d = baseValidDaemon();
    expect(d.permissionProfile.readOnly).toBe(true);
    expect(d.permissionProfile.autonomousMutations).toBe(false);
    expect(d.permissionProfile.breakGlassAllowed).toBe(false);
    expect(d.dispatchPolicy.receiptRequired).toBe(true);
    expect(d.dispatchPolicy.maxAutonomousActionsPerSession).toBe(0);
  });

  it('sets brittneyRehydrationChannel channelId from ownerId:daemonId', () => {
    const d = baseValidDaemon();
    expect(d.brittneyRehydrationChannel.channelId).toBe('owner1:d1');
    expect(d.brittneyRehydrationChannel.enabled).toBe(true);
  });

  it('passes assertDaemonFieldSeparation without modification', () => {
    const d = baseValidDaemon();
    expect(() => assertDaemonFieldSeparation(d)).not.toThrow();
  });
});

describe('assertDaemonFieldSeparation', () => {
  it('throws when break-glass is enabled with empty custodyScope', () => {
    const d = baseValidDaemon();
    d.permissionProfile.breakGlassAllowed = true;
    d.permissionProfile.custodyScope = [];
    expect(() => assertDaemonFieldSeparation(d)).toThrow(DaemonFieldSeparationError);
    expect(() => assertDaemonFieldSeparation(d)).toThrow('break-glass requires an explicit custodyScope');
  });

  it('does not throw when break-glass is enabled with a custodyScope', () => {
    const d = baseValidDaemon();
    d.permissionProfile.breakGlassAllowed = true;
    d.permissionProfile.custodyScope = ['holoshell:room:42'];
    expect(() => assertDaemonFieldSeparation(d)).not.toThrow();
  });

  it('throws when brittneyRehydrationChannel.channelId is empty', () => {
    const d = baseValidDaemon();
    d.brittneyRehydrationChannel.channelId = '';
    expect(() => assertDaemonFieldSeparation(d)).toThrow(DaemonFieldSeparationError);
    expect(() => assertDaemonFieldSeparation(d)).toThrow('channelId is required');
  });

  it('throws when autonomousMutations is true but receiptRequired is false', () => {
    const d = baseValidDaemon();
    d.permissionProfile.readOnly = false;
    d.permissionProfile.autonomousMutations = true;
    d.dispatchPolicy.receiptRequired = false;
    expect(() => assertDaemonFieldSeparation(d)).toThrow(DaemonFieldSeparationError);
    expect(() => assertDaemonFieldSeparation(d)).toThrow('autonomous mutations require receiptRequired');
  });

  it('does not throw when autonomousMutations is true with receiptRequired true', () => {
    const d = baseValidDaemon();
    d.permissionProfile.readOnly = false;
    d.permissionProfile.autonomousMutations = true;
    d.dispatchPolicy.receiptRequired = true;
    expect(() => assertDaemonFieldSeparation(d)).not.toThrow();
  });
});

describe('makeEmptyContextDelta', () => {
  it('returns a zero-significance delta with empty collections', () => {
    const delta = makeEmptyContextDelta();
    expect(delta.significanceScore).toBe(0);
    expect(delta.newIntentSignals).toHaveLength(0);
    expect(delta.newReceiptRefs).toHaveLength(0);
    expect(delta.capabilityUpdates).toHaveLength(0);
    expect(delta.careSignalHistory).toHaveLength(0);
    expect(Object.keys(delta.updatedPreferences)).toHaveLength(0);
  });

  it('significanceScore=0 is below the default minimumDeltaSignificance threshold', () => {
    const d = baseValidDaemon();
    const delta = makeEmptyContextDelta();
    // Empty turns should not forward to the Brittney field
    expect(delta.significanceScore).toBeLessThan(d.brittneyRehydrationChannel.minimumDeltaSignificance);
  });
});

describe('ConversationDaemonTurn structural contract', () => {
  it('turn shape satisfies required fields', () => {
    const turn: ConversationDaemonTurn = {
      turnId: 'turn-001',
      daemonId: 'd1',
      surfaceId: 'holoshell:room:home',
      userUtterance: 'What tasks are open?',
      extractedArtifacts: [],
      urgency: 'low',
      consentBoundary: 'read_only',
      contextDelta: makeEmptyContextDelta(),
      requiredApproval: false,
      receiptLinks: [],
      timestamp: new Date().toISOString(),
    };
    expect(turn.turnId).toBeTruthy();
    expect(turn.contextDelta.significanceScore).toBe(0);
    // Raw utterance is NOT the durable memory — contextDelta is
    expect(turn.contextDelta).toBeDefined();
  });
});
