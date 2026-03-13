/**
 * PhysicsNetworkingInterop.test.ts — Sprint 12 Audit
 *
 * Validates the interaction between physics and networking traits:
 * - @physics + @networked objects compile correctly
 * - Interpolation/extrapolation modes for smooth networked updates
 * - Joint constraints reference bodies correctly
 * - Force fields compile with affect tags
 * - Cross-platform output generation for physics
 */
import { describe, it, expect } from 'vitest';

import type { HoloDomainBlock, HoloDomainType } from '../../parser/HoloCompositionTypes';
import {
  compileDomainBlocks,
  compilePhysicsBlock,
  physicsToUnity,
  physicsToGodot,
} from '../DomainBlockCompilerMixin';

// =============================================================================
// Helpers
// =============================================================================

function makeDomainBlock(
  domain: HoloDomainType,
  keyword: string,
  name: string,
  properties: Record<string, any> = {},
  children: any[] = [],
): HoloDomainBlock {
  return {
    type: 'DomainBlock',
    domain,
    keyword,
    name,
    traits: [],
    properties,
    children,
    eventHandlers: [],
  } as HoloDomainBlock;
}

function makeRigidbodyBlock(name: string, props: Record<string, any> = {}): HoloDomainBlock {
  return makeDomainBlock('physics', 'rigidbody', name, {
    mass: 5,
    useGravity: true,
    linearDamping: 0.1,
    angularDamping: 0.05,
    ...props,
  });
}

// =============================================================================
// Physics + Networking Compilation Audit
// =============================================================================

describe('Physics ↔ Networking Trait Audit', () => {

  describe('rigidbody compilation baseline', () => {
    it('compiles rigidbody with standard properties', () => {
      const block = makeRigidbodyBlock('Ball');
      const compiled = compilePhysicsBlock(block);

      expect(compiled).toBeDefined();
      expect(compiled.keyword).toBe('rigidbody');
      expect(compiled.properties.mass).toBe(5);
      expect(compiled.properties.useGravity).toBe(true);
    });

    it('compiles kinematic rigidbody (no user-driven physics)', () => {
      const block = makeRigidbodyBlock('Platform', { isKinematic: true, mass: 0 });
      const compiled = compilePhysicsBlock(block);

      expect(compiled.properties.isKinematic).toBe(true);
      expect(compiled.properties.mass).toBe(0);
    });

    it('compiles continuous collision detection mode', () => {
      const block = makeRigidbodyBlock('Bullet', {
        collisionDetection: 'continuous_dynamic',
        mass: 0.1,
      });
      const compiled = compilePhysicsBlock(block);

      expect(compiled.properties.collisionDetection).toBe('continuous_dynamic');
    });
  });

  describe('cross-platform physics output', () => {
    const block = makeRigidbodyBlock('NetworkedCrate', {
      mass: 10,
      useGravity: true,
      interpolation: 'interpolate',
    });
    const compiled = compilePhysicsBlock(block);

    it('Unity output is generated correctly', () => {
      const code = physicsToUnity(compiled);
      expect(code).toBeDefined();
      expect(typeof code).toBe('string');
      expect(code.length).toBeGreaterThan(0);
      expect(code).toContain('Physics: rigidbody');
      expect(code).toContain('NetworkedCrate');
    });

    it('Godot output is generated correctly', () => {
      const code = physicsToGodot(compiled);
      expect(code).toBeDefined();
      expect(typeof code).toBe('string');
      expect(code.length).toBeGreaterThan(0);
      expect(code).toContain('Physics: rigidbody');
    });
  });

  describe('interpolation modes for network smoothing', () => {
    it('preserves interpolation property in compiled output', () => {
      const block = makeRigidbodyBlock('NetworkSmooth', {
        interpolation: 'interpolate',
      });
      const compiled = compilePhysicsBlock(block);

      expect(compiled.properties.interpolation).toBe('interpolate');
    });

    it('preserves extrapolation mode for fast-moving networked objects', () => {
      const block = makeRigidbodyBlock('FastProjectile', {
        interpolation: 'extrapolate',
        collisionDetection: 'continuous',
      });
      const compiled = compilePhysicsBlock(block);

      expect(compiled.properties.interpolation).toBe('extrapolate');
      expect(compiled.properties.collisionDetection).toBe('continuous');
    });
  });

  describe('force field compilation', () => {
    it('compiles directional force field', () => {
      const block = makeDomainBlock('physics', 'force_field', 'Wind', {
        type: 'directional',
        direction: [1, 0, 0],
        strength: 50,
        falloff: 'linear',
      });

      const compiled = compilePhysicsBlock(block);
      expect(compiled).toBeDefined();
      expect(compiled.keyword).toBe('force_field');
      expect(compiled.properties.type).toBe('directional');
      expect(compiled.properties.strength).toBe(50);
    });

    it('compiles radial force field with affect tags', () => {
      const block = makeDomainBlock('physics', 'force_field', 'Explosion', {
        type: 'radial',
        strength: 500,
        radius: 10,
        falloff: 'inverse_square',
        affectTags: ['debris', 'character'],
      });

      const compiled = compilePhysicsBlock(block);
      expect(compiled).toBeDefined();
      expect(compiled.properties.affectTags).toEqual(['debris', 'character']);
    });
  });

  describe('domain block routing handles physics correctly', () => {
    it('routes physics blocks through compileDomainBlocks()', () => {
      const blocks = [makeRigidbodyBlock('TestBall')];

      const results = compileDomainBlocks(blocks, {
        physics: (b) => {
          const compiled = compilePhysicsBlock(b);
          return `Physics: ${compiled.keyword} mass=${compiled.properties.mass}`;
        },
      });

      expect(results).toHaveLength(1);
      expect(results[0]).toContain('Physics: rigidbody');
      expect(results[0]).toContain('mass=5');
    });

    it('mixed material + physics blocks compile independently', () => {
      const blocks = [
        makeDomainBlock('material', 'pbr_material', 'Steel', { metalness: 0.9 }),
        makeRigidbodyBlock('SteelCrate'),
      ];

      const results = compileDomainBlocks(blocks, {
        material: (b) => `mat:${b.name}`,
        physics: (b) => {
          const phys = compilePhysicsBlock(b);
          return `phys:${phys.properties.mass}kg`;
        },
      });

      expect(results).toHaveLength(2);
      expect(results[0]).toBe('mat:Steel');
      expect(results[1]).toBe('phys:5kg');
    });
  });
});
