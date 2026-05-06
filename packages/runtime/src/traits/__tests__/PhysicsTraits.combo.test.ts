import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { ClothTrait, FluidTrait, SoftBodyTrait } from '../PhysicsTraits';
import { TraitSystem, type TraitContext } from '../TraitSystem';

function makePhysicsTraitSystem(): TraitSystem {
  const system = new TraitSystem({} as TraitContext['physicsWorld']);
  system.register(ClothTrait);
  system.register(SoftBodyTrait);
  system.register(FluidTrait);
  return system;
}

function expectFinitePositionBuffer(mesh: THREE.Mesh): void {
  const posAttr = mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
  for (const value of posAttr.array) {
    expect(Number.isFinite(value)).toBe(true);
  }
}

describe('PhysicsTraits cloth + fluid + soft_body combo', () => {
  it('keeps mesh positions finite when cloth replaces geometry after soft_body attach', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial());
    const system = makePhysicsTraitSystem();

    system.apply(mesh, 'soft_body', { stiffness: 0.5, damping: 0.05, pressure: 1.0 });
    system.apply(mesh, 'cloth', { resolution: 5, size: 2, stiffness: 0.9 });
    system.apply(mesh, 'fluid', { particle_count: 8 });

    for (let i = 0; i < 3; i++) {
      system.update(0.016);
    }

    expectFinitePositionBuffer(mesh);
    expect(mesh.children).toHaveLength(1);
    expect(mesh.children[0]).toBeInstanceOf(THREE.Points);
  });
});
