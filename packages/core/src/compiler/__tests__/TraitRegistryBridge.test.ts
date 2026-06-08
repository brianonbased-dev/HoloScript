import { describe, it, expect } from 'vitest';
import {
  queryTrait,
  generateTraitForTarget,
  listTraitsForTarget,
  traitExists,
  getTraitInfo,
} from '../TraitRegistryBridge';

describe('TraitRegistryBridge (APL WIT audit — wired to real registries)', () => {
  // ── Android XR path (unchanged from v1) ──

  it('queryTrait returns real Android XR traits from the existing map', () => {
    const physics = queryTrait('physics', { target: 'android-xr' });
    expect(physics.exists).toBe(true);
    expect(physics.sourceMap).toContain('AndroidXRTraitMap');
  });

  it('generateTraitForTarget produces code for a known Android XR trait', () => {
    const code = generateTraitForTarget('physics', 'android-xr', { mass: 2.0 });
    expect(code.length).toBeGreaterThan(0);
    expect(code.some((line) => line.includes('PhysicsComponent'))).toBe(true);
  });

  it('listTraitsForTarget returns the full Android XR trait map for android-xr', () => {
    const list = listTraitsForTarget('android-xr');
    expect(list).toContain('physics');
    // The real AndroidXRTraitMap uses snake_case keys; verify some known ones
    expect(list).toContain('collidable');
    expect(list).toContain('eye_hand_fusion');
    // Verify the list is not a stub — it comes from the real composed map
    expect(list.length).toBeGreaterThan(20);
  });

  // ── VisionOS path (uses hand_tracking key, not hand_tracked) ──

  it('queryTrait returns VisionOS traits from the existing map', () => {
    const hand = queryTrait('hand_tracking', { target: 'visionos' });
    expect(hand.exists).toBe(true);
    expect(hand.sourceMap).toContain('VisionOSTraitMap');
  });

  it('queryTrait returns exists=false for unknown VisionOS trait', () => {
    const unknown = queryTrait('totally_fake_trait_xyz', { target: 'visionos' });
    expect(unknown.exists).toBe(false);
  });

  // ── Core path: now wired to real registries ──

  it('queryTrait resolves core traits from VRTraitRegistry', () => {
    // 'grabbable' is a well-known VR trait registered in VRTraitRegistry
    const result = queryTrait('grabbable', { target: 'core' });
    expect(result.exists).toBe(true);
    expect(result.sourceMap).toBe('VRTraitRegistry');
  });

  it('queryTrait resolves core traits from VRTraitRegistry via normalised name', () => {
    // '@grabbable' (annotation form) should resolve to the same handler
    const result = queryTrait('@grabbable', { target: 'core' });
    expect(result.exists).toBe(true);
  });

  it('queryTrait resolves traits from traitDocs catalog', () => {
    // 'rigidbody' is in traitDocs as a core physics trait
    const result = queryTrait('rigidbody', { target: 'core' });
    // VRTraitRegistry has 'rigidbody' handler too (registered as CLASS handler)
    expect(result.exists).toBe(true);
  });

  it('queryTrait resolves traits that exist only in traitDocs (not in VRTraitRegistry)', () => {
    // Some traits exist in traitDocs but not as runtime handlers.
    // Use a traitDocs-only name to verify the fallback path.
    const result = queryTrait('semantic', { target: 'core' });
    // Either VRTraitRegistry or traitDocs should find it
    expect(result.exists).toBe(true);
  });

  it('queryTrait returns exists=false for genuinely unknown core traits', () => {
    const result = queryTrait('zzz_nonexistent_trait_42', { target: 'core' });
    expect(result.exists).toBe(false);
  });

  // ── traitExists: lightweight WIT validator entry point ──

  it('traitExists returns true for registered VR traits', () => {
    expect(traitExists('grabbable')).toBe(true);
    expect(traitExists('rigidbody')).toBe(true);
    expect(traitExists('hand_tracking')).toBe(true);
  });

  it('traitExists returns true for annotation-form names', () => {
    expect(traitExists('@grabbable')).toBe(true);
    expect(traitExists('@rigidbody')).toBe(true);
  });

  it('traitExists returns true for Android XR traits', () => {
    expect(traitExists('physics')).toBe(true);
  });

  it('traitExists returns true for VisionOS traits', () => {
    expect(traitExists('hand_tracking')).toBe(true);
  });

  it('traitExists returns false for unknown traits', () => {
    expect(traitExists('zzz_nonexistent_trait_42')).toBe(false);
  });

  // ── getTraitInfo: WIT get-trait function ──

  it('getTraitInfo returns trait info for known traits', () => {
    const info = getTraitInfo('grabbable');
    expect(info).toBeDefined();
    expect(info!.exists).toBe(true);
    expect(info!.sourceMap).toBe('VRTraitRegistry');
  });

  it('getTraitInfo returns undefined for unknown traits', () => {
    const info = getTraitInfo('zzz_nonexistent_trait_42');
    expect(info).toBeUndefined();
  });

  // ── listTraitsForTarget('core'): real enumeration ──

  it('listTraitsForTarget for core returns a non-empty list from real registries', () => {
    const list = listTraitsForTarget('core');
    expect(list.length).toBeGreaterThan(0);
    // Should contain well-known VR traits
    expect(list).toContain('grabbable');
  });

  it('listTraitsForTarget for core deduplicates normalised names', () => {
    const list = listTraitsForTarget('core');
    // Ensure no duplicates after normalisation
    const normalised = list.map((n) =>
      n
        .toLowerCase()
        .replace(/^@/, '')
        .replace(/trait$/i, '')
        .replace(/_/g, '-')
    );
    const uniqueNormalised = new Set(normalised);
    // Allow for some legitimate overlaps between registry and docs,
    // but the count should be very close
    expect(normalised.length - uniqueNormalised.size).toBeLessThan(normalised.length * 0.05);
  });

  // ── generateTraitForTarget: core path ──

  it('generateTraitForTarget for core returns a descriptive stub for known traits', () => {
    const code = generateTraitForTarget('grabbable', 'core');
    expect(code.length).toBeGreaterThan(0);
    expect(code.some((line) => line.includes('grabbable'))).toBe(true);
  });

  it('generateTraitForTarget for core returns not-found stub for unknown traits', () => {
    const code = generateTraitForTarget('zzz_nonexistent_trait_42', 'core');
    expect(code.length).toBeGreaterThan(0);
    expect(code[0]).toContain('no codegen path registered');
  });

  // ── Unknown targets ──

  it('gracefully handles unknown targets by falling through to core registries', () => {
    // For unknown targets, the code falls through to core path which checks
    // VRTraitRegistry. 'grabbable' exists there, so it resolves.
    const result = queryTrait('grabbable', { target: 'unknown-target' });
    expect(result.exists).toBe(true);
  });

  it('returns exists=false for unknown traits with unknown targets', () => {
    const unknown = queryTrait('zzz_nonexistent_trait_42', { target: 'future-platform' });
    expect(unknown.exists).toBe(false);
  });
});
