/**
 * @fileoverview Tests for NormEngine — CRSEC Lifecycle
 */

import { describe, it, expect } from 'vitest';
import { NormEngine } from '../NormEngine';
import { CulturalNorm, BUILTIN_NORMS, criticalMassForChange } from '../../traits/CultureTraits';

describe('NormEngine', () => {
  // ── Norm Registration ────────────────────────────────────────────────────

  describe('Norm Registration', () => {
    it('starts with built-in norms', () => {
      const engine = new NormEngine();
      expect(engine.listNorms().length).toBeGreaterThanOrEqual(BUILTIN_NORMS.length);
    });

    it('registers custom norms', () => {
      const engine = new NormEngine();
      const custom: CulturalNorm = {
        id: 'custom_1',
        name: 'Custom Norm',
        category: 'cooperation',
        description: 'Test norm',
        enforcement: 'soft',
        scope: 'zone',
        activationThreshold: 0.5,
        strength: 'moderate',
      };
      engine.registerNorm(custom);
      expect(engine.getNorm('custom_1')).toBeDefined();
    });
  });

  // ── Agent Adoption ───────────────────────────────────────────────────────

  describe('Adoption', () => {
    it('agents adopt norms', () => {
      const engine = new NormEngine();
      engine.registerAgent('agent1', ['no_griefing']);
      expect(engine.adoptionRate('no_griefing')).toBe(1);
    });

    it('tracks adoption rate across population', () => {
      const engine = new NormEngine();
      engine.registerAgent('a1', ['no_griefing']);
      engine.registerAgent('a2', ['no_griefing']);
      engine.registerAgent('a3');
      expect(engine.adoptionRate('no_griefing')).toBeCloseTo(2 / 3, 2);
    });

    it('agents abandon norms', () => {
      const engine = new NormEngine();
      engine.registerAgent('a1', ['no_griefing']);
      engine.abandon('a1', 'no_griefing');
      expect(engine.adoptionRate('no_griefing')).toBe(0);
    });

    it('norm becomes active when adoption exceeds threshold', () => {
      const engine = new NormEngine({ activationThreshold: 0.5 });
      engine.registerAgent('a1', ['resource_sharing']);
      engine.registerAgent('a2');
      // 50% adoption = threshold → active
      expect(engine.isActive('resource_sharing')).toBe(true);
    });
  });

  // ── Norm Evaluation ──────────────────────────────────────────────────────

  describe('Evaluation', () => {
    it('detects violation of no_griefing', () => {
      const engine = new NormEngine();
      // Make no_griefing active by having all agents adopt it
      engine.registerAgent('a1', ['no_griefing']);
      const violations = engine.evaluate('a1', ['agent:kill'], 'zone_a');
      expect(violations.length).toBeGreaterThan(0);
      expect(violations[0].normId).toBe('no_griefing');
    });

    it('no violation for allowed effects', () => {
      const engine = new NormEngine();
      engine.registerAgent('a1', ['no_griefing']);
      const violations = engine.evaluate('a1', ['render:spawn', 'audio:play'], 'zone_a');
      expect(violations).toHaveLength(0);
    });

    it('inactive norms do not trigger violations', () => {
      const engine = new NormEngine({ activationThreshold: 0.8 });
      engine.registerAgent('a1'); // Does not adopt resource_sharing
      engine.registerAgent('a2');
      // resource_sharing has activationThreshold of 0.5 in built-in, but nobody adopted it
      const violations = engine.evaluate('a1', ['inventory:give'], 'zone_a');
      // No violations because norm is not active
      expect(violations.filter((v) => v.normId === 'resource_sharing')).toHaveLength(0);
    });
  });

  // ── Compliance ───────────────────────────────────────────────────────────

  describe('Compliance', () => {
    it('rewards compliance', () => {
      const engine = new NormEngine({ complianceReward: 0.1, violationPenalty: 0.3 });
      engine.registerAgent('a1', ['no_griefing']);
      // Lower compliance first via a violation
      engine.recordViolation({
        normId: 'no_griefing',
        agentId: 'a1',
        effect: 'agent:kill',
        timestamp: 0,
        severity: 'hard',
        witnessed: [],
      });
      const before = engine.getCompliance('a1', 'no_griefing');
      expect(before).toBeLessThan(1);
      engine.recordCompliance('a1', 'no_griefing');
      const after = engine.getCompliance('a1', 'no_griefing');
      expect(after).toBeGreaterThan(before);
    });

    it('penalizes violations', () => {
      const engine = new NormEngine({ violationPenalty: 0.2 });
      engine.registerAgent('a1', ['no_griefing']);
      const before = engine.getCompliance('a1', 'no_griefing');
      engine.recordViolation({
        normId: 'no_griefing',
        agentId: 'a1',
        effect: 'agent:kill',
        timestamp: 0,
        severity: 'hard',
        witnessed: [],
      });
      const after = engine.getCompliance('a1', 'no_griefing');
      expect(after).toBeLessThan(before);
    });
  });

  // ── Proposals ────────────────────────────────────────────────────────────

  describe('Proposals', () => {
    it('agents propose new norms', () => {
      const engine = new NormEngine();
      engine.registerAgent('a1');
      engine.registerAgent('a2');
      const proposal = engine.proposeNorm('a1', {
        id: 'quiet_zone',
        name: 'Quiet Zone',
        category: 'safety',
        description: 'No audio in library zones',
        enforcement: 'soft',
        scope: 'zone',
        activationThreshold: 0.3,
        strength: 'moderate',
        forbiddenEffects: ['audio:play', 'audio:global'],
      });
      expect(proposal.status).toBe('pending');
    });

    it('proposals are adopted when vote threshold met', () => {
      const engine = new NormEngine({ proposalThreshold: 0.5 });
      engine.registerAgent('a1');
      engine.registerAgent('a2');
      const proposal = engine.proposeNorm('a1', {
        id: 'new_norm',
        name: 'New',
        category: 'cooperation',
        description: 'Test',
        enforcement: 'soft',
        scope: 'zone',
        activationThreshold: 0.3,
        strength: 'moderate',
      });
      engine.vote(proposal.id, 'a1', true);
      engine.vote(proposal.id, 'a2', true);
      expect(proposal.status).toBe('adopted');
      expect(engine.getNorm('new_norm')).toBeDefined();
    });

    it('proposals are rejected when votes fail', () => {
      const engine = new NormEngine({ proposalThreshold: 0.8 });
      engine.registerAgent('a1');
      engine.registerAgent('a2');
      const proposal = engine.proposeNorm('a1', {
        id: 'bad_norm',
        name: 'Bad',
        category: 'authority',
        description: 'Test',
        enforcement: 'hard',
        scope: 'world',
        activationThreshold: 0,
        strength: 'strong',
      });
      engine.vote(proposal.id, 'a1', true);
      engine.vote(proposal.id, 'a2', false); // 50% < 80% threshold
      expect(proposal.status).toBe('rejected');
    });
  });

  // ── Cultural Health ──────────────────────────────────────────────────────

  describe('Cultural Health', () => {
    it('healthy population has high score', () => {
      const engine = new NormEngine();
      engine.registerAgent('a1', ['no_griefing', 'fair_trade']);
      engine.registerAgent('a2', ['no_griefing', 'fair_trade']);
      expect(engine.culturalHealth()).toBe(1); // All compliant
    });

    it('violations decrease health', () => {
      const engine = new NormEngine({ violationPenalty: 0.5 });
      engine.registerAgent('a1', ['no_griefing']);
      engine.recordViolation({
        normId: 'no_griefing',
        agentId: 'a1',
        effect: 'agent:kill',
        timestamp: 0,
        severity: 'hard',
        witnessed: [],
      });
      expect(engine.culturalHealth()).toBeLessThan(1);
    });

    it('empty population has perfect health', () => {
      const engine = new NormEngine();
      expect(engine.culturalHealth()).toBe(1);
    });
  });

  // ── Adoption Curves ──────────────────────────────────────────────────────

  describe('Adoption Curves', () => {
    it('tracks adoption over ticks', () => {
      const engine = new NormEngine();
      engine.registerAgent('a1');
      engine.tick();
      engine.adopt('a1', 'no_griefing');
      engine.tick();
      const curve = engine.adoptionCurve('no_griefing');
      expect(curve).toHaveLength(2);
      expect(curve[0].rate).toBe(0);
      expect(curve[1].rate).toBe(1);
    });
  });

  // ── Stats ────────────────────────────────────────────────────────────────

  describe('Stats', () => {
    it('reports correct stats', () => {
      const engine = new NormEngine();
      engine.registerAgent('a1', ['no_griefing']);
      engine.registerAgent('a2');
      const s = engine.stats();
      expect(s.agents).toBe(2);
      expect(s.norms).toBeGreaterThanOrEqual(BUILTIN_NORMS.length);
      expect(s.activeNorms).toBeGreaterThan(0);
    });
  });

  // ── Critical Mass ────────────────────────────────────────────────────────

  describe('Critical Mass', () => {
    it('weak norms require 2% for change', () => {
      const weakNorm = BUILTIN_NORMS.find((n) => n.strength === 'weak')!;
      expect(criticalMassForChange(weakNorm, 100)).toBe(2);
    });

    it('strong norms require 50% for change', () => {
      const strongNorm = BUILTIN_NORMS.find((n) => n.strength === 'strong')!;
      expect(criticalMassForChange(strongNorm, 100)).toBe(50);
    });

    it('moderate norms require 25% for change', () => {
      const modNorm = BUILTIN_NORMS.find((n) => n.strength === 'moderate')!;
      expect(criticalMassForChange(modNorm, 100)).toBe(25);
    });
  });
});
