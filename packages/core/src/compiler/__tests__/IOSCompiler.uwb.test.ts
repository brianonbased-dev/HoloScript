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

function makeUWBComposition(traits: string[] = ['uwb_discover']): HoloComposition {
  return makeComposition({
    objects: [
      {
        name: 'uwb_scene',
        properties: [],
        traits: traits.map((t) => ({ name: t, config: {} })),
      },
    ] as any,
  });
}

function allUWBTraits(): string[] {
  return [
    'uwb_discover',
    'uwb_range',
    'uwb_direction',
    'uwb_handoff',
    'uwb_anchor_peer',
    'uwb_controller',
  ];
}

describe('IOSCompiler — UWB Positioning (M.010.13)', () => {
  // =========== Detection ===========

  it('does NOT emit uwbPositioningFile when no uwb traits present', () => {
    const compiler = new IOSCompiler();
    const result = compiler.compile(makeComposition(), 'test-token');
    expect(result.uwbPositioningFile).toBeUndefined();
  });

  it('emits uwbPositioningFile when uwb_discover trait is present', () => {
    const compiler = new IOSCompiler();
    const result = compiler.compile(makeUWBComposition(), 'test-token');
    expect(result.uwbPositioningFile).toBeDefined();
    expect(typeof result.uwbPositioningFile).toBe('string');
    expect(result.uwbPositioningFile!.length).toBeGreaterThan(0);
  });

  it('emits uwbPositioningFile for any single uwb trait', () => {
    const compiler = new IOSCompiler();
    for (const trait of allUWBTraits()) {
      const result = compiler.compile(makeUWBComposition([trait]), 'test-token');
      expect(result.uwbPositioningFile).toBeDefined();
    }
  });

  // =========== Framework imports ===========

  it('imports NearbyInteraction framework', () => {
    const compiler = new IOSCompiler();
    const result = compiler.compile(makeUWBComposition(), 'test-token');
    expect(result.uwbPositioningFile).toContain('import NearbyInteraction');
  });

  it('imports MultipeerConnectivity framework', () => {
    const compiler = new IOSCompiler();
    const result = compiler.compile(makeUWBComposition(), 'test-token');
    expect(result.uwbPositioningFile).toContain('import MultipeerConnectivity');
  });

  it('imports ARKit', () => {
    const compiler = new IOSCompiler();
    const result = compiler.compile(makeUWBComposition(), 'test-token');
    expect(result.uwbPositioningFile).toContain('import ARKit');
  });

  it('imports Combine when useCombine is true', () => {
    const compiler = new IOSCompiler({ useCombine: true });
    const result = compiler.compile(makeUWBComposition(), 'test-token');
    expect(result.uwbPositioningFile).toContain('import Combine');
  });

  // =========== Header comments ===========

  it('includes iOS 16+ requirement comment', () => {
    const compiler = new IOSCompiler();
    const result = compiler.compile(makeUWBComposition(), 'test-token');
    expect(result.uwbPositioningFile).toContain('iOS 16+');
    expect(result.uwbPositioningFile).toContain('Nearby Interaction');
  });

  // =========== Peer model ===========

  it('emits UWBPeer struct', () => {
    const compiler = new IOSCompiler();
    const result = compiler.compile(makeUWBComposition(), 'test-token');
    expect(result.uwbPositioningFile).toContain('struct UWBPeer: Identifiable, Hashable');
    expect(result.uwbPositioningFile).toContain('NIDiscoveryToken');
  });

  // =========== NISession setup ===========

  it('emits NISession setup with isSupported guard', () => {
    const compiler = new IOSCompiler();
    const result = compiler.compile(makeUWBComposition(), 'test-token');
    expect(result.uwbPositioningFile).toContain('NISession.isSupported');
    expect(result.uwbPositioningFile).toContain('NISession()');
  });

  it('emits NINearbyPeerConfiguration for ranging', () => {
    const compiler = new IOSCompiler();
    const result = compiler.compile(makeUWBComposition(), 'test-token');
    expect(result.uwbPositioningFile).toContain('NINearbyPeerConfiguration');
  });

  // =========== Discovery (uwb_discover) ===========

  it('emits startDiscovery/stopDiscovery when uwb_discover present', () => {
    const compiler = new IOSCompiler();
    const result = compiler.compile(makeUWBComposition(['uwb_discover']), 'test-token');
    expect(result.uwbPositioningFile).toContain('func startDiscovery()');
    expect(result.uwbPositioningFile).toContain('func stopDiscovery()');
    expect(result.uwbPositioningFile).toContain('MCNearbyServiceBrowser');
    expect(result.uwbPositioningFile).toContain('MCNearbyServiceAdvertiser');
  });

  it('does NOT emit discovery methods without uwb_discover', () => {
    const compiler = new IOSCompiler();
    const result = compiler.compile(makeUWBComposition(['uwb_range']), 'test-token');
    expect(result.uwbPositioningFile).not.toContain('func startDiscovery()');
  });

  // =========== Ranging (uwb_range) ===========

  it('emits distanceToPeer and nearestPeer when uwb_range present', () => {
    const compiler = new IOSCompiler();
    const result = compiler.compile(makeUWBComposition(['uwb_range']), 'test-token');
    expect(result.uwbPositioningFile).toContain('func distanceToPeer');
    expect(result.uwbPositioningFile).toContain('func nearestPeer');
  });

  it('does NOT emit ranging methods without uwb_range', () => {
    const compiler = new IOSCompiler();
    const result = compiler.compile(makeUWBComposition(['uwb_discover']), 'test-token');
    expect(result.uwbPositioningFile).not.toContain('func distanceToPeer');
  });

  // =========== Direction (uwb_direction) ===========

  it('emits direction methods when uwb_direction present', () => {
    const compiler = new IOSCompiler();
    const result = compiler.compile(makeUWBComposition(['uwb_direction']), 'test-token');
    expect(result.uwbPositioningFile).toContain('func directionToPeer');
    expect(result.uwbPositioningFile).toContain('func azimuthToPeer');
    expect(result.uwbPositioningFile).toContain('func elevationToPeer');
    expect(result.uwbPositioningFile).toContain('simd_float3');
  });

  it('does NOT emit direction methods without uwb_direction', () => {
    const compiler = new IOSCompiler();
    const result = compiler.compile(makeUWBComposition(['uwb_discover']), 'test-token');
    expect(result.uwbPositioningFile).not.toContain('func directionToPeer');
  });

  // =========== Handoff (uwb_handoff) ===========

  it('emits handoff methods when uwb_handoff present', () => {
    const compiler = new IOSCompiler();
    const result = compiler.compile(
      makeUWBComposition(['uwb_handoff', 'uwb_range']),
      'test-token'
    );
    expect(result.uwbPositioningFile).toContain('func handoffEntity');
    expect(result.uwbPositioningFile).toContain('func handoffToNearest');
    expect(result.uwbPositioningFile).toContain('uwb_handoff');
  });

  it('emits didReceiveHandoff delegate method with uwb_handoff', () => {
    const compiler = new IOSCompiler();
    const result = compiler.compile(makeUWBComposition(['uwb_handoff']), 'test-token');
    expect(result.uwbPositioningFile).toContain('didReceiveHandoff');
  });

  it('does NOT emit handoff without uwb_handoff', () => {
    const compiler = new IOSCompiler();
    const result = compiler.compile(makeUWBComposition(['uwb_discover']), 'test-token');
    expect(result.uwbPositioningFile).not.toContain('func handoffEntity');
  });

  // =========== Peer Anchor (uwb_anchor_peer) ===========

  it('emits anchorPosition when uwb_anchor_peer present', () => {
    const compiler = new IOSCompiler();
    const result = compiler.compile(makeUWBComposition(['uwb_anchor_peer']), 'test-token');
    expect(result.uwbPositioningFile).toContain('func anchorPosition');
    expect(result.uwbPositioningFile).toContain('SCNVector3');
  });

  // =========== Controller (uwb_controller) ===========

  it('emits controllerTransform when uwb_controller present', () => {
    const compiler = new IOSCompiler();
    const result = compiler.compile(makeUWBComposition(['uwb_controller']), 'test-token');
    expect(result.uwbPositioningFile).toContain('func controllerTransform');
    expect(result.uwbPositioningFile).toContain('SCNMatrix4');
  });

  // =========== Delegate extensions ===========

  it('emits NISessionDelegate extension', () => {
    const compiler = new IOSCompiler();
    const result = compiler.compile(makeUWBComposition(), 'test-token');
    expect(result.uwbPositioningFile).toContain('NISessionDelegate');
    expect(result.uwbPositioningFile).toContain('didUpdate nearbyObjects');
  });

  it('emits MCSessionDelegate extension', () => {
    const compiler = new IOSCompiler();
    const result = compiler.compile(makeUWBComposition(), 'test-token');
    expect(result.uwbPositioningFile).toContain('MCSessionDelegate');
    expect(result.uwbPositioningFile).toContain('didChange state: MCSessionState');
  });

  it('emits MCNearbyServiceBrowserDelegate extension', () => {
    const compiler = new IOSCompiler();
    const result = compiler.compile(makeUWBComposition(), 'test-token');
    expect(result.uwbPositioningFile).toContain('MCNearbyServiceBrowserDelegate');
  });

  it('emits MCNearbyServiceAdvertiserDelegate extension', () => {
    const compiler = new IOSCompiler();
    const result = compiler.compile(makeUWBComposition(), 'test-token');
    expect(result.uwbPositioningFile).toContain('MCNearbyServiceAdvertiserDelegate');
  });

  // =========== All traits combined ===========

  it('emits all sections when all uwb traits present', () => {
    const compiler = new IOSCompiler();
    const result = compiler.compile(makeUWBComposition(allUWBTraits()), 'test-token');
    const file = result.uwbPositioningFile!;

    // Discovery
    expect(file).toContain('func startDiscovery()');
    // Ranging
    expect(file).toContain('func distanceToPeer');
    expect(file).toContain('func nearestPeer');
    // Direction
    expect(file).toContain('func directionToPeer');
    expect(file).toContain('func azimuthToPeer');
    expect(file).toContain('func elevationToPeer');
    // Handoff
    expect(file).toContain('func handoffEntity');
    expect(file).toContain('func handoffToNearest');
    // Anchor
    expect(file).toContain('func anchorPosition');
    // Controller
    expect(file).toContain('func controllerTransform');
    // Delegate
    expect(file).toContain('didReceiveHandoff');
  });

  // =========== SwiftUI Preview ===========

  it('emits SwiftUI preview', () => {
    const compiler = new IOSCompiler();
    const result = compiler.compile(makeUWBComposition(), 'test-token');
    expect(result.uwbPositioningFile).toContain('UWBPreview');
    expect(result.uwbPositioningFile).toContain('#Preview');
  });

  // =========== Class naming ===========

  it('uses custom className in generated code', () => {
    const compiler = new IOSCompiler({ className: 'MyAR' });
    const result = compiler.compile(makeUWBComposition(), 'test-token');
    expect(result.uwbPositioningFile).toContain('MyARUWBManager');
    expect(result.uwbPositioningFile).toContain('MyARUWBDelegate');
    expect(result.uwbPositioningFile).toContain('MyARUWBPreview');
  });

  // =========== Token exchange ===========

  it('emits token exchange helpers', () => {
    const compiler = new IOSCompiler();
    const result = compiler.compile(makeUWBComposition(), 'test-token');
    expect(result.uwbPositioningFile).toContain('shareDiscoveryToken');
    expect(result.uwbPositioningFile).toContain('startRanging');
    expect(result.uwbPositioningFile).toContain('NINearbyPeerConfiguration');
  });

  // =========== Cleanup ===========

  it('emits invalidate cleanup method', () => {
    const compiler = new IOSCompiler();
    const result = compiler.compile(makeUWBComposition(), 'test-token');
    expect(result.uwbPositioningFile).toContain('func invalidate()');
  });
});
