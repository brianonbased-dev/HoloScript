/**
 * Quality Gates Tests
 *
 * Validates the three-tier progressive quality gate system.
 */

import { describe, it, expect } from 'vitest';
import {
  QualityTier,
  RiskProfile,
  QualityGatePipeline,
  createLintCheck,
  createTypeCheck,
  createSemanticCheck,
  createSecurityAuditCheck,
  createProductionExportCheck,
  createCoverageCheck,
  getRequiredTier,
  getTierThreshold,
  type QualityContext,
} from '../QualityGates';

function createTestContext(overrides: Partial<QualityContext> = {}): QualityContext {
  return {
    source: '',
    target: 'unity',
    affectedFiles: [],
    isProduction: false,
    metadata: {},
    ...overrides,
  };
}

describe('QualityGates', () => {
  describe('Tier mapping', () => {
    it('should map LOW risk to Tier 1 (autonomous)', () => {
      expect(getRequiredTier(RiskProfile.LOW)).toBe(QualityTier.TIER_1_AUTONOMOUS);
    });

    it('should map MEDIUM risk to Tier 2 (notify)', () => {
      expect(getRequiredTier(RiskProfile.MEDIUM)).toBe(QualityTier.TIER_2_NOTIFY);
    });

    it('should map HIGH risk to Tier 3 (approval)', () => {
      expect(getRequiredTier(RiskProfile.HIGH)).toBe(QualityTier.TIER_3_APPROVAL);
    });

    it('should map CRITICAL risk to Tier 3 (approval)', () => {
      expect(getRequiredTier(RiskProfile.CRITICAL)).toBe(QualityTier.TIER_3_APPROVAL);
    });
  });

  describe('Confidence thresholds', () => {
    it('should have 70% threshold for Tier 1', () => {
      expect(getTierThreshold(QualityTier.TIER_1_AUTONOMOUS)).toBe(0.7);
    });

    it('should have 85% threshold for Tier 2', () => {
      expect(getTierThreshold(QualityTier.TIER_2_NOTIFY)).toBe(0.85);
    });

    it('should have 95% threshold for Tier 3', () => {
      expect(getTierThreshold(QualityTier.TIER_3_APPROVAL)).toBe(0.95);
    });
  });

  describe('Lint check (Tier 1)', () => {
    it('should pass clean source', async () => {
      const check = createLintCheck();
      const ctx = createTestContext({ source: 'object Cube { @grabbable }' });
      const result = await check.execute(ctx);

      expect(result.passed).toBe(true);
      expect(result.confidence).toBeGreaterThan(0.7);
    });

    it('should detect unbalanced braces', async () => {
      const check = createLintCheck();
      const ctx = createTestContext({ source: 'object Cube { @grabbable' });
      const result = await check.execute(ctx);

      expect(result.passed).toBe(false);
      expect(result.findings.some((f) => f.rule === 'balanced-braces')).toBe(true);
    });
  });

  describe('Type check (Tier 1)', () => {
    it('should pass valid position', async () => {
      const check = createTypeCheck();
      const ctx = createTestContext({ source: 'position: [1, 2, 3]' });
      const result = await check.execute(ctx);

      expect(result.passed).toBe(true);
    });

    it('should flag invalid position component count', async () => {
      const check = createTypeCheck();
      const ctx = createTestContext({ source: 'position: [1, 2]' });
      const result = await check.execute(ctx);

      expect(result.passed).toBe(false);
      expect(result.findings.some((f) => f.rule === 'position-type')).toBe(true);
    });
  });

  describe('Semantic check (Tier 2)', () => {
    it('should detect trait conflicts', async () => {
      const check = createSemanticCheck();
      const ctx = createTestContext({
        source: 'object Cube { @physics @static }',
      });
      const result = await check.execute(ctx);

      expect(result.findings.some((f) => f.rule === 'trait-conflict')).toBe(true);
    });

    it('should detect missing dependencies', async () => {
      const check = createSemanticCheck();
      const ctx = createTestContext({
        source: 'object Cube { @throwable }',
      });
      const result = await check.execute(ctx);

      expect(result.findings.some((f) => f.rule === 'missing-dependency')).toBe(true);
    });
  });

  describe('Security audit (Tier 3)', () => {
    it('should detect eval patterns', async () => {
      const check = createSecurityAuditCheck();
      const ctx = createTestContext({
        source: 'eval(userInput)',
      });
      const result = await check.execute(ctx);

      expect(result.passed).toBe(false);
      expect(result.findings.some((f) => f.rule === 'no-eval')).toBe(true);
    });

    it('should detect hardcoded secrets', async () => {
      const check = createSecurityAuditCheck();
      const ctx = createTestContext({
        source: 'api_key = "sk-1234567890abcdef"',
      });
      const result = await check.execute(ctx);

      expect(result.passed).toBe(false);
      expect(result.findings.some((f) => f.rule === 'no-secrets')).toBe(true);
    });

    it('should pass clean source', async () => {
      const check = createSecurityAuditCheck();
      const ctx = createTestContext({
        source: 'object Cube { @grabbable @physics }',
      });
      const result = await check.execute(ctx);

      expect(result.passed).toBe(true);
      expect(result.confidence).toBeGreaterThan(0.9);
    });
  });

  describe('Production export (Tier 3)', () => {
    it('should skip for non-production builds', async () => {
      const check = createProductionExportCheck();
      const ctx = createTestContext({ isProduction: false });
      const result = await check.execute(ctx);

      expect(result.passed).toBe(true);
    });

    it('should require version for production builds', async () => {
      const check = createProductionExportCheck();
      const ctx = createTestContext({
        isProduction: true,
        metadata: {},
      });
      const result = await check.execute(ctx);

      expect(result.passed).toBe(false);
      expect(result.findings.some((f) => f.rule === 'prod-version')).toBe(true);
    });
  });

  describe('QualityGatePipeline', () => {
    it('should create default pipeline with all tiers', () => {
      const pipeline = QualityGatePipeline.createDefault();
      expect(pipeline).toBeDefined();
    });

    it('should run Tier 1 checks autonomously', async () => {
      const pipeline = QualityGatePipeline.createDefault();
      const ctx = createTestContext({
        source: 'object Cube { @grabbable @physics }',
      });
      const result = await pipeline.run(ctx);

      expect(result.tiers.length).toBeGreaterThanOrEqual(1);
      expect(result.tiers[0].tier).toBe(QualityTier.TIER_1_AUTONOMOUS);
    });

    it('should block on Tier 1 failure', async () => {
      const pipeline = QualityGatePipeline.createDefault();
      const ctx = createTestContext({
        source: 'object Cube { @grabbable @physics', // unbalanced
      });
      const result = await pipeline.run(ctx);

      expect(result.passed).toBe(false);
    });

    it('should run Tier 2 for medium risk', async () => {
      const pipeline = QualityGatePipeline.createDefault();
      const ctx = createTestContext({
        source: 'object Cube { @grabbable @collidable @physics }',
        affectedFiles: ['packages/core/src/file.ts', 'packages/lsp/src/file.ts'],
      });
      const result = await pipeline.run(ctx);

      // Should have at least 2 tiers (Tier 1 + Tier 2)
      expect(result.tiers.length).toBeGreaterThanOrEqual(2);
    });

    it('should generate notifications for Tier 2', async () => {
      const pipeline = QualityGatePipeline.createDefault();
      const ctx = createTestContext({
        source: 'object Cube { @throwable }', // missing @grabbable
        affectedFiles: ['packages/core/src/a.ts', 'packages/lsp/src/b.ts'],
      });
      const result = await pipeline.run(ctx);

      expect(result.notifications.length).toBeGreaterThan(0);
    });

    it('should request approval for production builds', async () => {
      const pipeline = QualityGatePipeline.createDefault();
      const ctx = createTestContext({
        source: 'object Cube { @grabbable @collidable }',
        isProduction: true,
        agentToken: 'test-token',
        metadata: { version: '1.0.0', changelog: 'Initial' },
      });
      const result = await pipeline.run(ctx);

      expect(result.approvalRequests.length).toBeGreaterThan(0);
    });

    it('should track total execution time', async () => {
      const pipeline = QualityGatePipeline.createDefault();
      const ctx = createTestContext({
        source: 'object Cube { @grabbable }',
      });
      const result = await pipeline.run(ctx);

      expect(result.totalDurationMs).toBeGreaterThanOrEqual(0);
    });
  });
});
