/**
 * @fileoverview Integration tests for barrel exports + marketplace seeding
 *
 * Tests that all new barrel exports (safety, platform, culture, marketplace,
 * runtime) are accessible and functional. Also tests marketplace seed data.
 */

import { describe, it, expect } from 'vitest';
import {
  // Safety
  runSafetyPass, quickSafetyCheck, EffectRow, dangerLevel,
  isSafeTraitSet, TRAIT_EFFECTS, knownTraits, knownBuiltins,
  // Platform
  XR_ALL_PLATFORMS, XR_PLATFORM_CAPABILITIES,
  platformCategory, embodimentFor, agentBudgetFor, hasCapability,
  // Culture
  BUILTIN_NORMS, normsByCategory, criticalMassForChange,
  // Marketplace
  MarketplaceRegistry, createSubmission, verifySubmission, publishSubmission,
  // Runtime
  gateCheck, RuntimeMonitor, CultureRuntime,
} from '../index';

// =============================================================================
// BARREL EXPORT VERIFICATION
// =============================================================================

describe('Barrel Export Verification', () => {
  describe('Safety exports', () => {
    it('runSafetyPass returns report', () => {
      const result = runSafetyPass([
        { type: 'object', name: 'TestObj', traits: ['@mesh'], calls: [], declaredEffects: ['render:spawn'] },
      ], {
        moduleId: 'barrel-test', targetPlatforms: ['quest3'], trustLevel: 'basic', generateCertificate: false,
      });
      expect(result.report).toBeDefined();
      expect(result.report.verdict).toBeDefined();
      expect(result.report.dangerScore).toBeGreaterThanOrEqual(0);
    });

    it('quickSafetyCheck works', () => {
      const result = quickSafetyCheck(['@mesh'], [], 'basic');
      expect(result).toBeDefined();
    });

    it('EffectRow + dangerLevel work', () => {
      const row = new EffectRow(['render:spawn']);
      const level = dangerLevel(row);
      expect(typeof level).toBe('number');
      expect(level).toBeGreaterThanOrEqual(0);
    });

    it('trait effects are accessible', () => {
      expect(knownTraits().length).toBeGreaterThanOrEqual(5);
      expect(knownBuiltins().length).toBeGreaterThanOrEqual(1);
      expect(TRAIT_EFFECTS['@mesh']).toBeDefined();
    });
  });

  describe('Platform exports', () => {
    it('all platforms available', () => {
      expect(XR_ALL_PLATFORMS.length).toBeGreaterThanOrEqual(15);
    });

    it('platform category resolves', () => {
      expect(platformCategory('quest3')).toBe('vr');
      expect(platformCategory('ios')).toBe('mobile');
      expect(platformCategory('android-auto')).toBe('automotive');
    });

    it('capabilities work', () => {
      expect(hasCapability('quest3', 'handTracking')).toBe(true);
      expect(hasCapability('web', 'handTracking')).toBe(false);
      expect(agentBudgetFor('quest3')).toBe(5);
      expect(embodimentFor('quest3')).toBe('Avatar3D');
    });
  });

  describe('Culture exports', () => {
    it('builtin norms accessible', () => {
      expect(BUILTIN_NORMS.length).toBeGreaterThanOrEqual(8);
    });

    it('normsByCategory works', () => {
      const safety = normsByCategory('safety');
      expect(safety.length).toBeGreaterThanOrEqual(1);
    });

    it('criticalMass calculates', () => {
      const mass = criticalMassForChange(BUILTIN_NORMS[0], 100);
      expect(mass).toBeGreaterThan(0);
    });
  });

  describe('Marketplace exports', () => {
    it('full pipeline works', () => {
      const registry = new MarketplaceRegistry();
      const sub = createSubmission({
        metadata: {
          id: '@test/barrel-pkg', name: 'Barrel Test', description: 'test',
          category: 'object', version: { major: 1, minor: 0, patch: 0 },
          publisher: { id: 'p1', name: 'T', did: 'did:key:z6MkT', verified: true, trustLevel: 'trusted' },
          tags: ['test'], platforms: ['quest3'], license: 'MIT',
          dependencies: [], createdAt: '2026-01-01', updatedAt: '2026-01-01',
        },
        nodes: [{ type: 'object', name: 'Obj', traits: ['@mesh'], calls: [], declaredEffects: ['render:spawn'] }],
        assets: [], bundleSizeBytes: 100,
      });
      verifySubmission(sub);
      expect(sub.status).toBe('verified');
      publishSubmission(sub);
      expect(sub.status).toBe('published');
      registry.publish(sub);
      expect(registry.stats().totalPackages).toBe(1);
    });
  });

  describe('Runtime exports', () => {
    it('RuntimeMonitor works', () => {
      const monitor = new RuntimeMonitor('quest3');
      const snap = monitor.report({ particles: 100 });
      expect(snap.overBudget).toBe(false);
      expect(monitor.getFrameBudget().frameBudgetMs).toBe(11.1);
    });

    it('CultureRuntime works', () => {
      const runtime = new CultureRuntime();
      runtime.agentJoin('agent1');
      expect(runtime.dashboard().agents).toBe(1);
      runtime.tick();
      expect(runtime.dashboard().tickCount).toBe(1);
    });

    it('gateCheck works', () => {
      const manifest = { packageId: '@test/gate', version: { major: 1, minor: 0, patch: 0 }, safetyVerdict: 'safe' as const, dangerScore: 2, installedAt: '2026-01-01', targetPlatforms: ['quest3'] };
      const report = { verdict: 'safe' as const, dangerScore: 2, effects: { categories: [], totalEffects: 0, violations: [] }, budget: { diagnostics: [] }, capabilities: { missing: [] } };
      const decision = gateCheck(manifest, report, 0);
      expect(decision.allowed).toBe(true);
    });
  });
});
