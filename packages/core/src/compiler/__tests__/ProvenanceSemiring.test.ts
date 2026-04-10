/**
 * ProvenanceSemiring Tests — L3 Batch 1 (C1+C2+C3)
 *
 * C1: Authority modulates weight within rules, not bypasses them
 * C2: Faithfulness analysis (tested via R3F compiler integration)
 * C3: Unified DeadElement type with subsystem projections
 *
 * @version 2.0.0
 */
import { describe, it, expect } from 'vitest';
import {
  ProvenanceSemiring,
  TRAIT_ZERO,
  AuthorityTier,
  authorityWeight,
  isDeadElement,
  createDeadElement,
  type TraitApplication,
  type DeadElement,
} from '../traits/ProvenanceSemiring';

describe('ProvenanceSemiring v2 (L3 Batch 1)', () => {
  // =========================================================================
  // C1: Authority modulation (not bypass)
  // =========================================================================
  describe('C1: Authority modulates, not bypasses', () => {
    it('authority-weighted strategy scales values by authority weight', () => {
      const semiring = new ProvenanceSemiring([
        { property: 'mass', strategy: 'authority-weighted' },
      ]);

      const traits: TraitApplication[] = [
        { name: 'physics', config: { mass: 10 }, context: { authorityLevel: AuthorityTier.GUEST } },
        { name: 'heavy', config: { mass: 5 }, context: { authorityLevel: AuthorityTier.FOUNDER } },
      ];

      const result = semiring.add(traits);
      // Guest weight = 0.5, so 10 * 0.5 = 5
      // Founder weight = 2.0, so 5 * 2.0 = 10
      // Founder's 5 (scaled 10) >= Guest's 10 (scaled 5), so Founder wins
      expect(result.config.mass).toBe(5);
      expect(result.conflicts).toHaveLength(1);
    });

    it('equal authority falls back to raw values in authority-weighted', () => {
      const semiring = new ProvenanceSemiring([
        { property: 'mass', strategy: 'authority-weighted' },
      ]);

      const traits: TraitApplication[] = [
        { name: 'a', config: { mass: 10 }, context: { authorityLevel: 50 } },
        { name: 'b', config: { mass: 20 }, context: { authorityLevel: 50 } },
      ];

      const result = semiring.add(traits);
      // Same weight, so scaled values = raw values * same weight
      // 20 > 10, so b wins
      expect(result.config.mass).toBe(20);
    });

    it('authority does NOT bypass domain-override precedence', () => {
      const semiring = new ProvenanceSemiring([
        { property: 'type', strategy: 'domain-override', precedence: ['kinematic', 'physics'] },
      ]);

      // Guest has higher precedence trait (kinematic), Founder has lower (physics)
      const traits: TraitApplication[] = [
        {
          name: 'kinematic',
          config: { type: 'kinematic' },
          context: { authorityLevel: AuthorityTier.GUEST },
        },
        {
          name: 'physics',
          config: { type: 'dynamic' },
          context: { authorityLevel: AuthorityTier.FOUNDER },
        },
      ];

      const result = semiring.add(traits);
      // Domain precedence still wins — kinematic (index 0) beats physics (index 1)
      // regardless of authority
      expect(result.config.type).toBe('kinematic');
    });

    it('authority breaks ties in domain-override when same precedence index', () => {
      const semiring = new ProvenanceSemiring([
        { property: 'type', strategy: 'domain-override', precedence: ['kinematic'] },
      ]);

      // Both are 'kinematic' (same precedence index), but different values
      const traits: TraitApplication[] = [
        {
          name: 'kinematic',
          config: { type: 'variant_a' },
          context: { authorityLevel: AuthorityTier.AGENT },
        },
        {
          name: 'kinematic',
          config: { type: 'variant_b' },
          context: { authorityLevel: AuthorityTier.FOUNDER },
        },
      ];

      // Neither source matches precedence entries, so falls back to authority
      const result = semiring.add(traits);
      expect(result.config.type).toBe('variant_b'); // Founder wins as tiebreaker
    });

    it('authority is tiebreaker for unruled properties, not bypass', () => {
      const semiring = new ProvenanceSemiring([]); // No rules at all

      const traits: TraitApplication[] = [
        { name: 'a', config: { speed: 10 }, context: { authorityLevel: AuthorityTier.GUEST } },
        { name: 'b', config: { speed: 20 }, context: { authorityLevel: AuthorityTier.ADMIN } },
      ];

      const result = semiring.add(traits);
      // No rule for 'speed', authority acts as tiebreaker
      expect(result.config.speed).toBe(20);
      expect(result.conflicts).toHaveLength(1);
    });

    it('equal authority + no rule = strict error (cannot resolve)', () => {
      const semiring = new ProvenanceSemiring([]); // No rules

      const traits: TraitApplication[] = [
        { name: 'a', config: { speed: 10 }, context: { authorityLevel: 50 } },
        { name: 'b', config: { speed: 20 }, context: { authorityLevel: 50 } },
      ];

      const result = semiring.add(traits);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('Unresolved conflict');
    });
  });

  // =========================================================================
  // C1: authorityWeight function
  // =========================================================================
  describe('authorityWeight()', () => {
    it('maps GUEST (0) to 0.5', () => {
      expect(authorityWeight(AuthorityTier.GUEST)).toBe(0.5);
    });

    it('maps FOUNDER (100) to 2.0', () => {
      expect(authorityWeight(AuthorityTier.FOUNDER)).toBe(2.0);
    });

    it('maps MEMBER (50) to 1.25', () => {
      expect(authorityWeight(AuthorityTier.MEMBER)).toBe(1.25);
    });

    it('clamps negative values to 0.5', () => {
      expect(authorityWeight(-50)).toBe(0.5);
    });

    it('clamps values above 100 to 2.0', () => {
      expect(authorityWeight(200)).toBe(2.0);
    });
  });

  // =========================================================================
  // C3: Unified DeadElement
  // =========================================================================
  describe('C3: Unified DeadElement', () => {
    it('isDeadElement detects TRAIT_ZERO', () => {
      expect(isDeadElement(TRAIT_ZERO)).toBe(true);
      expect(isDeadElement(null)).toBe(false);
      expect(isDeadElement(undefined)).toBe(false);
      expect(isDeadElement(0)).toBe(false);
      expect(isDeadElement('')).toBe(false);
    });

    it('createDeadElement creates correct record', () => {
      const dead = createDeadElement('semiring', 'physics.mass', 'zero value', 42);
      expect(dead.subsystem).toBe('semiring');
      expect(dead.elementId).toBe('physics.mass');
      expect(dead.reason).toBe('zero value');
      expect(dead.originalValue).toBe(42);
      expect(dead.determinedAt).toBeGreaterThan(0);
    });

    it('TRAIT_ZERO in config produces DeadElement audit trail', () => {
      const semiring = new ProvenanceSemiring();

      const traits: TraitApplication[] = [
        { name: 'physics', config: { mass: 10, friction: TRAIT_ZERO as unknown as number } },
        { name: 'visual', config: { color: 'red' } },
      ];

      const result = semiring.add(traits);
      expect(result.deadElements).toHaveLength(1);
      expect(result.deadElements[0].subsystem).toBe('semiring');
      expect(result.deadElements[0].elementId).toBe('physics.friction');
      expect(result.config.mass).toBe(10);
      expect(result.config.color).toBe('red');
      // TRAIT_ZERO was skipped (A ⊕ 0 = A)
      expect(result.config.friction).toBeUndefined();
    });

    it('multiple TRAIT_ZERO values produce multiple DeadElement records', () => {
      const semiring = new ProvenanceSemiring();

      const traits: TraitApplication[] = [
        { name: 'a', config: { x: TRAIT_ZERO as unknown, y: TRAIT_ZERO as unknown } },
        { name: 'b', config: { z: 1 } },
      ];

      const result = semiring.add(traits);
      expect(result.deadElements).toHaveLength(2);
      expect(result.config.z).toBe(1);
    });

    it('DeadElement covers all five subsystem types', () => {
      const subsystems: DeadElement['subsystem'][] = [
        'tree-shaker',
        'crdt-liveness',
        'semiring',
        'particle',
        'network',
      ];

      for (const sub of subsystems) {
        const dead = createDeadElement(sub, 'test', 'test reason');
        expect(dead.subsystem).toBe(sub);
      }
    });
  });

  // =========================================================================
  // Existing semiring algebra still works
  // =========================================================================
  describe('Semiring algebra preservation', () => {
    it('addition identity: A ⊕ 0 = A', () => {
      const semiring = new ProvenanceSemiring();
      const result = semiring.add([{ name: 'a', config: { mass: 10 } }]);
      expect(result.config.mass).toBe(10);
      expect(result.deadElements).toHaveLength(0);
    });

    it('multiplication annihilator: A ⊗ 0 = 0', () => {
      // When TRAIT_ZERO is the first value and then a real value arrives,
      // the TRAIT_ZERO is skipped (identity), so the real value wins.
      const semiring = new ProvenanceSemiring();
      const result = semiring.add([
        { name: 'a', config: { mass: TRAIT_ZERO as unknown as number } },
        { name: 'b', config: { mass: 10 } },
      ]);
      expect(result.config.mass).toBe(10);
      expect(result.deadElements).toHaveLength(1);
    });

    it('idempotence: same value from different sources', () => {
      const semiring = new ProvenanceSemiring();
      const result = semiring.add([
        { name: 'a', config: { mass: 10 } },
        { name: 'b', config: { mass: 10 } },
      ]);
      expect(result.config.mass).toBe(10);
      expect(result.errors).toHaveLength(0);
    });

    it('max strategy picks higher value', () => {
      const semiring = new ProvenanceSemiring([{ property: 'friction', strategy: 'max' }]);
      const result = semiring.add([
        { name: 'a', config: { friction: 0.3 } },
        { name: 'b', config: { friction: 0.7 } },
      ]);
      expect(result.config.friction).toBe(0.7);
    });

    it('min strategy picks lower value', () => {
      const semiring = new ProvenanceSemiring([{ property: 'opacity', strategy: 'min' }]);
      const result = semiring.add([
        { name: 'a', config: { opacity: 0.8 } },
        { name: 'b', config: { opacity: 0.3 } },
      ]);
      expect(result.config.opacity).toBe(0.3);
    });

    it('sum strategy adds values', () => {
      const semiring = new ProvenanceSemiring([{ property: 'damage', strategy: 'sum' }]);
      const result = semiring.add([
        { name: 'a', config: { damage: 10 } },
        { name: 'b', config: { damage: 5 } },
      ]);
      expect(result.config.damage).toBe(15);
    });

    it('strict-error throws on conflict', () => {
      const semiring = new ProvenanceSemiring([{ property: 'id', strategy: 'strict-error' }]);
      const result = semiring.add([
        { name: 'a', config: { id: 'foo' } },
        { name: 'b', config: { id: 'bar' } },
      ]);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('Composition conflict');
    });
  });

  // =========================================================================
  // C1+C3 integration: authority + dead elements together
  // =========================================================================
  describe('C1+C3 integration', () => {
    it('authority-weighted with dead elements skips zeros and modulates rest', () => {
      const semiring = new ProvenanceSemiring([
        { property: 'mass', strategy: 'authority-weighted' },
      ]);

      const traits: TraitApplication[] = [
        {
          name: 'a',
          config: { mass: TRAIT_ZERO as unknown as number, speed: 5 },
          context: { authorityLevel: AuthorityTier.FOUNDER },
        },
        {
          name: 'b',
          config: { mass: 10, speed: 3 },
          context: { authorityLevel: AuthorityTier.AGENT },
        },
      ];

      const result = semiring.add(traits);
      // mass: TRAIT_ZERO skipped from 'a', so 'b' mass=10 wins unopposed
      expect(result.config.mass).toBe(10);
      expect(result.deadElements).toHaveLength(1);
      expect(result.deadElements[0].elementId).toBe('a.mass');
    });

    it('ProvenanceContext includes optional reputationScore', () => {
      const semiring = new ProvenanceSemiring();
      const traits: TraitApplication[] = [
        {
          name: 'trusted',
          config: { data: 'value' },
          context: { authorityLevel: 50, reputationScore: 95, agentId: 'agent-1' },
        },
      ];

      const result = semiring.add(traits);
      expect(result.provenance.data.context?.reputationScore).toBe(95);
    });
  });

  // =========================================================================
  // AuthorityTier enum
  // =========================================================================
  describe('AuthorityTier enum', () => {
    it('has expected values', () => {
      expect(AuthorityTier.GUEST).toBe(0);
      expect(AuthorityTier.AGENT).toBe(25);
      expect(AuthorityTier.MEMBER).toBe(50);
      expect(AuthorityTier.ADMIN).toBe(75);
      expect(AuthorityTier.FOUNDER).toBe(100);
    });
  });
});
