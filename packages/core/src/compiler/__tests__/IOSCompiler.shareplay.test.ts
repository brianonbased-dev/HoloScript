import { describe, it, expect, vi } from 'vitest';
import { IOSCompiler } from '../IOSCompiler';
import type { HoloComposition } from '../../parser/HoloCompositionTypes';

vi.mock('../identity/AgentRBAC', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getRBAC: () => ({ checkAccess: () => ({ allowed: true }) }),
  };
});

function makeComposition(overrides: Partial<HoloComposition> = {}): HoloComposition {
  return { name: 'TestScene', objects: [], ...overrides } as HoloComposition;
}

function makeSharePlayComposition(traits: string[] = ['shareplay_session']): HoloComposition {
  return makeComposition({
    objects: [
      {
        name: 'shared_scene',
        properties: [],
        traits: traits.map((t) => ({ name: t, config: {} })),
      },
    ] as any,
  });
}

function allSharePlayTraits(): string[] {
  return [
    'shareplay_session',
    'shareplay_host',
    'shareplay_join',
    'shareplay_sync',
    'shareplay_anchor_local',
    'shareplay_entity_ownership',
    'shareplay_late_join',
    'shareplay_voice_spatial',
    'shareplay_mute_zone',
  ];
}

describe('IOSCompiler — SharePlay Multi-User AR (M.010.12)', () => {
  // =========== Detection ===========

  it('does NOT emit sharePlayFile when no shareplay traits present', () => {
    const compiler = new IOSCompiler();
    const result = compiler.compile(makeComposition(), 'test-token');
    expect(result.sharePlayFile).toBeUndefined();
  });

  it('emits sharePlayFile when shareplay_session trait is present', () => {
    const compiler = new IOSCompiler();
    const result = compiler.compile(makeSharePlayComposition(), 'test-token');
    expect(result.sharePlayFile).toBeDefined();
    expect(typeof result.sharePlayFile).toBe('string');
    expect(result.sharePlayFile!.length).toBeGreaterThan(0);
  });

  it('emits sharePlayFile for any single shareplay trait', () => {
    const compiler = new IOSCompiler();
    for (const trait of allSharePlayTraits()) {
      const result = compiler.compile(makeSharePlayComposition([trait]), 'test-token');
      expect(result.sharePlayFile).toBeDefined();
    }
  });

  // =========== Framework imports ===========

  it('imports GroupActivities framework', () => {
    const compiler = new IOSCompiler();
    const result = compiler.compile(makeSharePlayComposition(), 'test-token');
    expect(result.sharePlayFile).toContain('import GroupActivities');
  });

  it('imports ARKit', () => {
    const compiler = new IOSCompiler();
    const result = compiler.compile(makeSharePlayComposition(), 'test-token');
    expect(result.sharePlayFile).toContain('import ARKit');
  });

  it('imports SwiftUI', () => {
    const compiler = new IOSCompiler();
    const result = compiler.compile(makeSharePlayComposition(), 'test-token');
    expect(result.sharePlayFile).toContain('import SwiftUI');
  });

  it('imports Combine', () => {
    const compiler = new IOSCompiler();
    const result = compiler.compile(makeSharePlayComposition(), 'test-token');
    expect(result.sharePlayFile).toContain('import Combine');
  });

  // =========== HoloGroupActivity ===========

  it('defines HoloGroupActivity conforming to GroupActivity', () => {
    const compiler = new IOSCompiler();
    const result = compiler.compile(makeSharePlayComposition(), 'test-token');
    expect(result.sharePlayFile).toContain('struct HoloGroupActivity: GroupActivity');
    expect(result.sharePlayFile).toContain('GroupActivityMetadata');
  });

  // =========== Codable messages ===========

  it('defines SceneStateDiff Codable struct', () => {
    const compiler = new IOSCompiler();
    const result = compiler.compile(makeSharePlayComposition(), 'test-token');
    expect(result.sharePlayFile).toContain('struct SceneStateDiff: Codable');
  });

  it('defines EntityUpdate Codable struct', () => {
    const compiler = new IOSCompiler();
    const result = compiler.compile(makeSharePlayComposition(), 'test-token');
    expect(result.sharePlayFile).toContain('struct EntityUpdate: Codable');
  });

  it('defines FullStateSnapshot Codable struct', () => {
    const compiler = new IOSCompiler();
    const result = compiler.compile(makeSharePlayComposition(), 'test-token');
    expect(result.sharePlayFile).toContain('struct FullStateSnapshot: Codable');
  });

  // =========== SharePlayManager ===========

  it('generates SharePlayManager class with default className', () => {
    const compiler = new IOSCompiler();
    const result = compiler.compile(makeSharePlayComposition(), 'test-token');
    expect(result.sharePlayFile).toContain('class GeneratedARSceneSharePlayManager');
  });

  it('respects custom className option', () => {
    const compiler = new IOSCompiler({ className: 'MyScene' });
    const result = compiler.compile(makeSharePlayComposition(), 'test-token');
    expect(result.sharePlayFile).toContain('class MySceneSharePlayManager');
  });

  it('contains GroupSession property', () => {
    const compiler = new IOSCompiler();
    const result = compiler.compile(makeSharePlayComposition(), 'test-token');
    expect(result.sharePlayFile).toContain('GroupSession<HoloGroupActivity>');
  });

  it('contains GroupSessionMessenger', () => {
    const compiler = new IOSCompiler();
    const result = compiler.compile(makeSharePlayComposition(), 'test-token');
    expect(result.sharePlayFile).toContain('GroupSessionMessenger');
  });

  // =========== Session lifecycle (shareplay_session) ===========

  it('contains session state machine (waitingForActivation -> joined)', () => {
    const compiler = new IOSCompiler();
    const result = compiler.compile(makeSharePlayComposition(['shareplay_session']), 'test-token');
    expect(result.sharePlayFile).toContain('.waitingForActivation');
    expect(result.sharePlayFile).toContain('.joined');
    expect(result.sharePlayFile).toContain('session.join()');
  });

  it('tracks active participants', () => {
    const compiler = new IOSCompiler();
    const result = compiler.compile(makeSharePlayComposition(), 'test-token');
    expect(result.sharePlayFile).toContain('$activeParticipants');
  });

  // =========== Host authority (shareplay_host) ===========

  it('generates host authority methods when shareplay_host trait present', () => {
    const compiler = new IOSCompiler();
    const result = compiler.compile(
      makeSharePlayComposition(['shareplay_session', 'shareplay_host']),
      'test-token'
    );
    expect(result.sharePlayFile).toContain('func becomeHost()');
    expect(result.sharePlayFile).toContain('broadcastSceneState');
  });

  it('does not emit host methods without shareplay_host', () => {
    const compiler = new IOSCompiler();
    const result = compiler.compile(makeSharePlayComposition(['shareplay_session']), 'test-token');
    expect(result.sharePlayFile).not.toContain('func becomeHost()');
  });

  // =========== Join flow (shareplay_join) ===========

  it('generates join flow when shareplay_join trait present', () => {
    const compiler = new IOSCompiler();
    const result = compiler.compile(
      makeSharePlayComposition(['shareplay_session', 'shareplay_join']),
      'test-token'
    );
    expect(result.sharePlayFile).toContain('func startSharePlay()');
    expect(result.sharePlayFile).toContain('prepareForActivation');
    expect(result.sharePlayFile).toContain('activationPreferred');
  });

  // =========== Sync (shareplay_sync) ===========

  it('generates CRDT-inspired sync when shareplay_sync trait present', () => {
    const compiler = new IOSCompiler();
    const result = compiler.compile(
      makeSharePlayComposition(['shareplay_session', 'shareplay_sync']),
      'test-token'
    );
    expect(result.sharePlayFile).toContain('func sendSceneUpdate');
    expect(result.sharePlayFile).toContain('applySceneDiff');
    expect(result.sharePlayFile).toContain('lastSyncTimestamp');
  });

  it('receives scene diffs via GroupSessionMessenger', () => {
    const compiler = new IOSCompiler();
    const result = compiler.compile(
      makeSharePlayComposition(['shareplay_session', 'shareplay_sync']),
      'test-token'
    );
    expect(result.sharePlayFile).toContain('messenger.messages(of: SceneStateDiff.self)');
  });

  // =========== Local anchor (shareplay_anchor_local) ===========

  it('generates local anchor mapping when shareplay_anchor_local present', () => {
    const compiler = new IOSCompiler();
    const result = compiler.compile(
      makeSharePlayComposition(['shareplay_session', 'shareplay_anchor_local']),
      'test-token'
    );
    expect(result.sharePlayFile).toContain('func calibrateLocalAnchor');
    expect(result.sharePlayFile).toContain('sharedToLocal');
    expect(result.sharePlayFile).toContain('localToShared');
    expect(result.sharePlayFile).toContain('sharedToLocalOffset');
  });

  // =========== Entity ownership (shareplay_entity_ownership) ===========

  it('generates ownership tracking when shareplay_entity_ownership present', () => {
    const compiler = new IOSCompiler();
    const result = compiler.compile(
      makeSharePlayComposition(['shareplay_session', 'shareplay_entity_ownership']),
      'test-token'
    );
    expect(result.sharePlayFile).toContain('func claimOwnership');
    expect(result.sharePlayFile).toContain('func transferOwnership');
    expect(result.sharePlayFile).toContain('func isOwnedByLocal');
    expect(result.sharePlayFile).toContain('OwnershipTransferRequest');
  });

  // =========== Late join (shareplay_late_join) ===========

  it('generates late join support when shareplay_late_join present', () => {
    const compiler = new IOSCompiler();
    const result = compiler.compile(
      makeSharePlayComposition(['shareplay_session', 'shareplay_late_join']),
      'test-token'
    );
    expect(result.sharePlayFile).toContain('func requestFullState');
    expect(result.sharePlayFile).toContain('applyFullSnapshot');
    expect(result.sharePlayFile).toContain('FullStateSnapshot.self');
  });

  // =========== Spatial audio (shareplay_voice_spatial) ===========

  it('generates spatial audio config when shareplay_voice_spatial present', () => {
    const compiler = new IOSCompiler();
    const result = compiler.compile(
      makeSharePlayComposition(['shareplay_session', 'shareplay_voice_spatial']),
      'test-token'
    );
    expect(result.sharePlayFile).toContain('func configureSpatialAudio');
    expect(result.sharePlayFile).toContain('SpatialAudioExperience');
    expect(result.sharePlayFile).toContain('fixedToScene: true');
  });

  // =========== Mute zones (shareplay_mute_zone) ===========

  it('generates mute zone support when shareplay_mute_zone present', () => {
    const compiler = new IOSCompiler();
    const result = compiler.compile(
      makeSharePlayComposition(['shareplay_session', 'shareplay_mute_zone']),
      'test-token'
    );
    expect(result.sharePlayFile).toContain('func addMuteZone');
    expect(result.sharePlayFile).toContain('func audioAttenuation');
    expect(result.sharePlayFile).toContain('struct MuteZone');
  });

  // =========== SwiftUI View ===========

  it('generates SwiftUI SharePlayView', () => {
    const compiler = new IOSCompiler();
    const result = compiler.compile(makeSharePlayComposition(), 'test-token');
    expect(result.sharePlayFile).toContain('struct GeneratedARSceneSharePlayView: View');
  });

  it('SharePlayView contains participant list', () => {
    const compiler = new IOSCompiler();
    const result = compiler.compile(makeSharePlayComposition(), 'test-token');
    expect(result.sharePlayFile).toContain('manager.participants');
  });

  it('SharePlayView shows session status', () => {
    const compiler = new IOSCompiler();
    const result = compiler.compile(makeSharePlayComposition(), 'test-token');
    expect(result.sharePlayFile).toContain('SharePlay Active');
    expect(result.sharePlayFile).toContain('SharePlay Inactive');
  });

  // =========== All traits combined ===========

  it('compiles with all 9 shareplay traits without error', () => {
    const compiler = new IOSCompiler();
    const result = compiler.compile(makeSharePlayComposition(allSharePlayTraits()), 'test-token');
    expect(result.sharePlayFile).toBeDefined();
    expect(result.sharePlayFile!.length).toBeGreaterThan(500);
  });

  it('all traits produce a coherent file with all sections', () => {
    const compiler = new IOSCompiler();
    const result = compiler.compile(makeSharePlayComposition(allSharePlayTraits()), 'test-token');
    const file = result.sharePlayFile!;
    // All major sections present
    expect(file).toContain('HoloGroupActivity');
    expect(file).toContain('SharePlayManager');
    expect(file).toContain('SharePlayView');
    expect(file).toContain('GroupSessionMessenger');
    expect(file).toContain('func becomeHost');
    expect(file).toContain('func startSharePlay');
    expect(file).toContain('func sendSceneUpdate');
    expect(file).toContain('func calibrateLocalAnchor');
    expect(file).toContain('func claimOwnership');
    expect(file).toContain('func requestFullState');
    expect(file).toContain('func configureSpatialAudio');
    expect(file).toContain('func addMuteZone');
  });

  // =========== Session cleanup ===========

  it('generates endSession cleanup method', () => {
    const compiler = new IOSCompiler();
    const result = compiler.compile(makeSharePlayComposition(), 'test-token');
    expect(result.sharePlayFile).toContain('func endSession()');
    expect(result.sharePlayFile).toContain('groupSession?.end()');
  });

  // =========== Does not break other results ===========

  it('still produces viewFile, sceneFile, stateFile, infoPlist alongside sharePlayFile', () => {
    const compiler = new IOSCompiler();
    const result = compiler.compile(makeSharePlayComposition(), 'test-token');
    expect(typeof result.viewFile).toBe('string');
    expect(typeof result.sceneFile).toBe('string');
    expect(typeof result.stateFile).toBe('string');
    expect(typeof result.infoPlist).toBe('string');
    expect(typeof result.sharePlayFile).toBe('string');
  });
});
