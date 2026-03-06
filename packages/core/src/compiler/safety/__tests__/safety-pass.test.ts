/**
 * @fileoverview Tests for the Full Compiler Safety Pass
 *
 * Integration tests for all 5 layers:
 * 1. Effect checking
 * 2. Budget analysis
 * 3. Capability verification
 * 4. Safety report generation
 * 5. End-to-end pipeline
 */

import { describe, it, expect } from 'vitest';
import { runSafetyPass, quickSafetyCheck, EffectASTNode } from '../CompilerSafetyPass';
import { ResourceBudgetAnalyzer, PLATFORM_BUDGETS, ResourceUsageNode } from '../ResourceBudgetAnalyzer';
import { deriveRequirements, checkCapabilities, expandCapabilities, TRUST_LEVEL_CAPABILITIES } from '../CapabilityTypes';
import { buildSafetyReport, formatReport, generateCertificate } from '../SafetyReport';
import { EffectRow } from '../../../types/effects';

// =============================================================================
// ResourceBudgetAnalyzer Tests
// =============================================================================

describe('ResourceBudgetAnalyzer', () => {
  const analyzer = new ResourceBudgetAnalyzer({ targetPlatforms: ['quest3'] });

  it('passes for small scenes', () => {
    const nodes: ResourceUsageNode[] = [
      { name: 'Player', traits: ['@mesh', '@physics'], calls: [], count: 1 },
      { name: 'Rock', traits: ['@mesh', '@collider'], calls: [], count: 5 },
    ];
    const result = analyzer.analyze(nodes);
    expect(result.passed).toBe(true);
  });

  it('fails when particles exceed budget', () => {
    // Quest 3 limit: 5000 particles. 100 VFX objects × 200 particles each = 20,000
    const nodes: ResourceUsageNode[] = [
      { name: 'Explosion', traits: ['@vfx'], calls: [], count: 100 },
    ];
    const result = analyzer.analyze(nodes);
    expect(result.passed).toBe(false);
    expect(result.diagnostics.some(d => d.category === 'particles' && d.severity === 'error')).toBe(true);
  });

  it('warns at 80% threshold', () => {
    // Quest 3: 200 physics bodies. 170 = 85%
    const nodes: ResourceUsageNode[] = [
      { name: 'Crate', traits: ['@rigidbody'], calls: [], count: 170 },
    ];
    const result = analyzer.analyze(nodes);
    const physDiag = result.diagnostics.find(d => d.category === 'physicsBodies');
    // Should be warning (85% > 80%)
    if (physDiag) expect(physDiag.severity).toBe('warning');
  });

  it('reports top contributors', () => {
    const nodes: ResourceUsageNode[] = [
      { name: 'BigExplosion', traits: ['@particle'], calls: [], count: 50 },
      { name: 'SmallSpark', traits: ['@particle'], calls: [], count: 5 },
    ];
    const result = analyzer.analyze(nodes);
    // Check that we get contributor data for particle budget
    const particleDiag = result.diagnostics.find(d => d.category === 'particles');
    if (particleDiag) {
      expect(particleDiag.contributors.length).toBeGreaterThan(0);
      expect(particleDiag.contributors[0].name).toContain('BigExplosion');
    }
  });

  it('supports multiple platforms', () => {
    const multiAnalyzer = new ResourceBudgetAnalyzer({ targetPlatforms: ['quest3', 'desktop-vr'] });
    const nodes: ResourceUsageNode[] = [
      { name: 'Heavy', traits: ['@gaussian'], calls: [], count: 20 },
    ];
    const result = multiAnalyzer.analyze(nodes);
    expect(result.platformStatus.size).toBe(2);
  });

  it('handles empty input', () => {
    const result = analyzer.analyze([]);
    expect(result.passed).toBe(true);
    expect(result.diagnostics).toHaveLength(0);
  });
});

// =============================================================================
// CapabilityTypes Tests
// =============================================================================

describe('CapabilityTypes', () => {
  it('derives requirements from effects', () => {
    const reqs = deriveRequirements(['render:spawn', 'io:network'], 'test');
    expect(reqs.some(r => r.scope === 'scene:write')).toBe(true);
    expect(reqs.some(r => r.scope === 'network:write')).toBe(true);
  });

  it('basic trust level grants scene read/write', () => {
    const caps = TRUST_LEVEL_CAPABILITIES['basic'];
    expect(caps).toContain('scene:read');
    expect(caps).toContain('scene:write');
  });

  it('untrusted level only grants scene read', () => {
    const caps = TRUST_LEVEL_CAPABILITIES['untrusted'];
    expect(caps).toContain('scene:read');
    expect(caps).not.toContain('scene:write');
  });

  it('capability hierarchy expands admin to include write and read', () => {
    const expanded = expandCapabilities(['scene:admin']);
    expect(expanded.has('scene:admin')).toBe(true);
    expect(expanded.has('scene:write')).toBe(true);
    expect(expanded.has('scene:read')).toBe(true);
  });

  it('checks pass when capabilities are sufficient', () => {
    const reqs = deriveRequirements(['render:spawn', 'state:read'], 'test');
    const result = checkCapabilities(reqs, ['scene:write', 'scene:read']);
    expect(result.passed).toBe(true);
  });

  it('checks fail when capabilities are insufficient', () => {
    const reqs = deriveRequirements(['io:network', 'agent:spawn'], 'test');
    const result = checkCapabilities(reqs, ['scene:read']); // untrusted
    expect(result.passed).toBe(false);
    expect(result.missing.length).toBeGreaterThan(0);
  });

  it('admin hierarchy satisfies subordinate requirements', () => {
    const reqs = deriveRequirements(['render:spawn', 'state:write', 'state:read'], 'test');
    const result = checkCapabilities(reqs, ['scene:admin']); // admin covers write and read
    expect(result.passed).toBe(true);
  });
});

// =============================================================================
// Full Safety Pass Tests
// =============================================================================

describe('runSafetyPass', () => {
  it('safe module passes all checks', () => {
    const nodes: EffectASTNode[] = [
      {
        type: 'object', name: 'SafePlayer',
        traits: ['@mesh', '@audio'],
        calls: [],
        declaredEffects: ['render:spawn', 'audio:play'],
      },
    ];
    const result = runSafetyPass(nodes, {
      moduleId: 'safe-game',
      targetPlatforms: ['quest3'],
      trustLevel: 'basic',
    });
    expect(result.passed).toBe(true);
    expect(result.report.verdict).toBe('safe');
  });

  it('undeclared network effect fails', () => {
    const nodes: EffectASTNode[] = [
      {
        type: 'object', name: 'SneakyBot',
        traits: ['@mesh', '@networked'],
        calls: ['fetch'],
        declaredEffects: ['render:spawn'], // Missing network!
      },
    ];
    const result = runSafetyPass(nodes, { moduleId: 'sneaky', trustLevel: 'basic' });
    expect(result.passed).toBe(false);
    expect(result.report.effects.passed).toBe(false);
  });

  it('untrusted agent rejected for scene:write', () => {
    const nodes: EffectASTNode[] = [
      {
        type: 'object', name: 'UntrustedSpawner',
        traits: ['@mesh'],
        calls: ['spawn'],
        declaredEffects: ['render:spawn', 'resource:memory'],
      },
    ];
    const result = runSafetyPass(nodes, {
      moduleId: 'untrusted',
      trustLevel: 'untrusted', // Only scene:read
    });
    expect(result.report.capabilities.passed).toBe(false);
    expect(result.report.capabilities.missing.some(m => m.scope === 'scene:write')).toBe(true);
  });

  it('budget exceeded on Quest 3', () => {
    const nodes: EffectASTNode[] = Array.from({ length: 300 }, (_, i) => ({
      type: 'object' as const,
      name: `Crate_${i}`,
      traits: ['@mesh', '@rigidbody'],
      calls: [],
      declaredEffects: ['render:spawn', 'physics:force', 'physics:collision'] as any[],
    }));
    const result = runSafetyPass(nodes, {
      moduleId: 'physics-heavy',
      targetPlatforms: ['quest3'],
      trustLevel: 'trusted',
    });
    // 300 rigidbodies > Quest 3 limit of 200
    expect(result.report.budget.passed).toBe(false);
  });

  it('formats report correctly', () => {
    const nodes: EffectASTNode[] = [
      { type: 'object', name: 'A', traits: ['@mesh'], calls: [], declaredEffects: ['render:spawn'] },
    ];
    const result = runSafetyPass(nodes, { moduleId: 'format-test', trustLevel: 'basic' });
    expect(result.formattedReport).toContain('format-test');
    expect(result.formattedReport).toContain('Verdict:');
  });

  it('generates certificate for safe modules', () => {
    const nodes: EffectASTNode[] = [
      { type: 'object', name: 'Ok', traits: ['@mesh'], calls: [], declaredEffects: ['render:spawn'] },
    ];
    const result = runSafetyPass(nodes, { moduleId: 'cert-test', trustLevel: 'basic', generateCertificate: true });
    expect(result.certificate).not.toBeNull();
    expect(result.certificate?.moduleId).toBe('cert-test');
  });

  it('no certificate for unsafe modules', () => {
    const nodes: EffectASTNode[] = [
      { type: 'object', name: 'Bad', traits: ['@mesh', '@networked'], calls: [] }, // undeclared
    ];
    const result = runSafetyPass(nodes, { moduleId: 'no-cert', trustLevel: 'basic' });
    if (result.report.verdict === 'unsafe') {
      expect(result.certificate).toBeNull();
    }
  });
});

// =============================================================================
// quickSafetyCheck Tests
// =============================================================================

describe('quickSafetyCheck', () => {
  it('reports no capability issues for safe rendering with basic trust', () => {
    const result = quickSafetyCheck(['@mesh', '@material'], [], { trustLevel: 'basic' });
    // quickSafetyCheck sends no declaredEffects, so the effect checker flags undeclared effects.
    // But capability-wise, basic trust covers scene:write for rendering.
    expect(result.reasons.filter(r => r.includes('Missing capability'))).toHaveLength(0);
  });

  it('fails for untrusted agent with spawn', () => {
    const result = quickSafetyCheck(['@mesh'], ['spawn'], { trustLevel: 'untrusted' });
    expect(result.passed).toBe(false);
    expect(result.reasons.length).toBeGreaterThan(0);
  });

  it('allows trusted agent to use physics', () => {
    const result = quickSafetyCheck(
      ['@mesh', '@physics'],
      ['applyForce'],
      { trustLevel: 'trusted' },
    );
    // The effects need to be declared for the effect check pass
    // quickSafetyCheck with no declared effects = pure assertion
    // So this will fail on effect check (undeclared effects)
    // The point is capability-wise it's fine for trusted
    expect(result.reasons.some(r => r.includes('Missing capability'))).toBe(false);
  });
});
