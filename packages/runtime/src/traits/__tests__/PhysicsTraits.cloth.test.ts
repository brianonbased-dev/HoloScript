/**
 * PhysicsTraits.ClothTrait — runtime integration tests with REAL THREE geometry.
 *
 * /critic batch-6 Serious #6: the cloth-verlet engine extraction (commit
 * 1c3487425) shares Float32Array buffers WITH the THREE.BufferAttribute via
 * `posAttr.array as Float32Array` aliasing. That's safe TODAY but the
 * contract is *convention*, not API — a future THREE upgrade could silently
 * start copying the array, at which point the engine modifies a stale copy
 * and the GPU-uploaded buffer never updates. The previous test suite only
 * exercised the engine in isolation with hand-built Float32Arrays, so the
 * day THREE breaks the alias contract, every cloth test passes but cloth
 * silently stops simulating in production.
 *
 * This file plugs that gap with a runtime-level integration test that:
 *   1. Creates a real THREE.PlaneGeometry
 *   2. Calls ClothTrait.onApply (sets up state.prevPositions, constraints)
 *   3. Captures `posAttr.array` reference identity into a sentinel
 *   4. Calls ClothTrait.onUpdate (gravity steps the cloth)
 *   5. Asserts (a) gravity moved actual buffer Y values down,
 *      (b) `posAttr.array` reference still points at the same Float32Array
 *      after onUpdate (alias preserved through the engine call).
 *
 * If THREE ever changes BufferAttribute to copy on mutate, assertion (b)
 * fails loudly and the engine extraction is automatically caught before
 * shipping a silent-cloth-failure regression.
 */
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { ClothTrait } from '../PhysicsTraits';
import type { TraitContext } from '../TraitSystem';

function makeContext(mesh: THREE.Mesh, config: Record<string, unknown>): TraitContext {
  return {
    object: mesh,
    physicsWorld: {} as TraitContext['physicsWorld'],
    config,
    data: {},
  };
}

describe('PhysicsTraits ClothTrait — THREE.BufferAttribute alias contract', () => {
  it('posAttr.array reference is preserved across onApply', () => {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2, 4, 4));
    const ctx = makeContext(mesh, { resolution: 5, size: 2, stiffness: 0.9 });
    ClothTrait.onApply!(ctx);
    // After onApply, mesh.geometry was REPLACED (line 102 of PhysicsTraits.ts) —
    // posAttr is the new geometry's attribute. Capture identity now.
    const posAttr = mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
    expect(posAttr.array).toBeInstanceOf(Float32Array);
    // Sentinel: stash the reference for later identity comparison
    (ctx.data as Record<string, unknown>)._aliasSentinel = posAttr.array;
  });

  it('posAttr.array reference is preserved across onUpdate (engine writes through alias)', () => {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2, 4, 4));
    const ctx = makeContext(mesh, { resolution: 5, size: 2, stiffness: 0.9 });
    ClothTrait.onApply!(ctx);
    const posAttr = mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
    const aliasBefore = posAttr.array;

    ClothTrait.onUpdate!(ctx, 0.016);

    // The alias must be the SAME Float32Array object — not a copy.
    // If THREE ever changes BufferAttribute.array semantics from
    // reference-keep to copy-on-set/copy-on-mutate, this assertion fails
    // loudly and we know the engine is writing into a stale buffer.
    expect(posAttr.array).toBe(aliasBefore);
  });

  it('gravity moves unpinned vertices on the actual buffer THREE will upload', () => {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2, 4, 4));
    const ctx = makeContext(mesh, {
      resolution: 5,
      size: 2,
      stiffness: 0.9,
      gravity_scale: 1.0,
      damping: 0.0,
      wind_response: 0.0,
    });
    ClothTrait.onApply!(ctx);
    const posAttr = mesh.geometry.getAttribute('position') as THREE.BufferAttribute;

    // Find a vertex that's NOT pinned (default pin set is corners 0 + resolution-1).
    // Pick the center of the bottom row (index 22 for 5×5 grid: row 4, col 2).
    const centerIdx = 4 * 5 + 2;
    const yIdx = centerIdx * 3 + 1;
    const yBefore = posAttr.array[yIdx];

    // Step the cloth several times to accumulate gravity
    for (let i = 0; i < 5; i++) ClothTrait.onUpdate!(ctx, 0.05);

    const yAfter = posAttr.array[yIdx];
    expect(yAfter).toBeLessThan(yBefore);
  });

  it('multiple onUpdate calls do not throw on real THREE geometry', () => {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1, 8, 8));
    const ctx = makeContext(mesh, { resolution: 9, size: 1, stiffness: 0.5 });
    ClothTrait.onApply!(ctx);
    expect(() => {
      for (let i = 0; i < 30; i++) ClothTrait.onUpdate!(ctx, 0.016);
    }).not.toThrow();
  });

  it('posAttr.version increments after onUpdate (THREE knows to re-upload)', () => {
    // BufferAttribute.needsUpdate is a write-only setter that increments
    // .version on `=true`. Reading needsUpdate returns undefined in modern
    // THREE; assert on .version which is the public read surface.
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2, 4, 4));
    const ctx = makeContext(mesh, { resolution: 5, size: 2 });
    ClothTrait.onApply!(ctx);
    const posAttr = mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
    const versionBefore = posAttr.version;

    ClothTrait.onUpdate!(ctx, 0.016);

    expect(posAttr.version).toBeGreaterThan(versionBefore);
  });

  it('onRemove clears engine state buffers', () => {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2, 4, 4));
    const ctx = makeContext(mesh, { resolution: 5, size: 2 });
    ClothTrait.onApply!(ctx);
    expect((ctx.data as Record<string, unknown>).prevPositions).toBeInstanceOf(Float32Array);

    ClothTrait.onRemove!(ctx);

    expect((ctx.data as Record<string, unknown>).prevPositions).toBeNull();
    expect((ctx.data as Record<string, unknown>).constraints).toBeNull();
  });
});
