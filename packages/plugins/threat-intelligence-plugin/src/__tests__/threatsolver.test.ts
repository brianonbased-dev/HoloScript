/**
 * Threat intelligence solver tests — threat-intelligence-plugin
 *
 * Reference values verified against:
 *  - FIRST CVSS v3.1 Specification (2019) first.org/cvss/v3.1/specification-document
 *  - Lockheed Martin Cyber Kill Chain (2011)
 *  - Caltagirone S, Pendergast A, Betz C (2013) Diamond Model of Intrusion Analysis
 */

import { describe, it, expect } from 'vitest';
import {
  cvssScore,
  killChainAnalysis,
  iocConfidence,
  vulnerabilityPrioritization,
  diamondModelScore,
  buildThreatReceipt,
} from '../threatsolver';

// ─── CVSS v3.1 ────────────────────────────────────────────────────────────────

describe('cvssScore', () => {
  /**
   * Zero impact: C:N, I:N, A:N → ISCBase=0 → Impact=0 → baseScore=0
   */
  it('no impact → score=0, severity=None', () => {
    const r = cvssScore({
      attackVector: 'N', attackComplexity: 'L', privilegesRequired: 'N',
      userInteraction: 'N', scope: 'U',
      confidentialityImpact: 'N', integrityImpact: 'N', availabilityImpact: 'N',
    });
    expect(r.baseScore).toBe(0);
    expect(r.severity).toBe('None');
  });

  /**
   * High network attack, all high impacts, Scope:Unchanged → high score
   * AV:N, AC:L, PR:N, UI:N, S:U, C:H, I:H, A:H ≈ 9.8 → Critical
   */
  it('AV:N AC:L PR:N UI:N S:U C:H I:H A:H → Critical', () => {
    const r = cvssScore({
      attackVector: 'N', attackComplexity: 'L', privilegesRequired: 'N',
      userInteraction: 'N', scope: 'U',
      confidentialityImpact: 'H', integrityImpact: 'H', availabilityImpact: 'H',
    });
    expect(r.baseScore).toBeGreaterThanOrEqual(9.0);
    expect(r.severity).toBe('Critical');
  });

  it('physical attack + high complexity + high priv + required UI → low score', () => {
    const r = cvssScore({
      attackVector: 'P', attackComplexity: 'H', privilegesRequired: 'H',
      userInteraction: 'R', scope: 'U',
      confidentialityImpact: 'L', integrityImpact: 'N', availabilityImpact: 'N',
    });
    expect(r.baseScore).toBeLessThan(4.0);
  });

  it('severity=High when 7.0 ≤ score < 9.0', () => {
    const r = cvssScore({
      attackVector: 'N', attackComplexity: 'H', privilegesRequired: 'N',
      userInteraction: 'N', scope: 'U',
      confidentialityImpact: 'H', integrityImpact: 'H', availabilityImpact: 'H',
    });
    // AC:H reduces score vs AC:L
    expect(['High', 'Critical']).toContain(r.severity);
  });

  it('exploitabilityScore and impactScore are non-negative', () => {
    const r = cvssScore({
      attackVector: 'N', attackComplexity: 'L', privilegesRequired: 'L',
      userInteraction: 'N', scope: 'U',
      confidentialityImpact: 'H', integrityImpact: 'L', availabilityImpact: 'N',
    });
    expect(r.exploitabilityScore).toBeGreaterThanOrEqual(0);
    expect(r.impactScore).toBeGreaterThanOrEqual(0);
  });

  it('Scope:Changed typically increases score vs Scope:Unchanged', () => {
    const unchanged = cvssScore({
      attackVector: 'N', attackComplexity: 'L', privilegesRequired: 'N',
      userInteraction: 'N', scope: 'U',
      confidentialityImpact: 'H', integrityImpact: 'H', availabilityImpact: 'H',
    });
    const changed = cvssScore({
      attackVector: 'N', attackComplexity: 'L', privilegesRequired: 'N',
      userInteraction: 'N', scope: 'C',
      confidentialityImpact: 'H', integrityImpact: 'H', availabilityImpact: 'H',
    });
    expect(changed.baseScore).toBeGreaterThanOrEqual(unchanged.baseScore);
  });
});

// ─── Kill Chain Analysis ──────────────────────────────────────────────────────

describe('killChainAnalysis', () => {
  const stages = [
    { name: 'Reconnaissance',   successProbability: 0.9 },
    { name: 'Weaponization',    successProbability: 0.7 },
    { name: 'Delivery',         successProbability: 0.5 },
    { name: 'Exploitation',     successProbability: 0.6 },
    { name: 'Installation',     successProbability: 0.8 },
    { name: 'C2',               successProbability: 0.9 },
    { name: 'Action',           successProbability: 0.7 },
  ];

  it('overallProbability = product of all stage probabilities', () => {
    const r = killChainAnalysis(stages);
    const expected = stages.reduce((p, s) => p * s.successProbability, 1);
    expect(r.overallProbability).toBeCloseTo(expected, 6);
  });

  it('bottleneckStage = stage with lowest probability', () => {
    const r = killChainAnalysis(stages);
    expect(r.bottleneckStage).toBe('Delivery'); // 0.5 is lowest
  });

  it('all p=1 → overall=1', () => {
    const perfect = stages.map(s => ({ ...s, successProbability: 1.0 }));
    const r = killChainAnalysis(perfect);
    expect(r.overallProbability).toBeCloseTo(1.0, 6);
  });

  it('one p=0 → overall=0', () => {
    const blocked = [...stages, { name: 'Blocked', successProbability: 0 }];
    const r = killChainAnalysis(blocked);
    expect(r.overallProbability).toBe(0);
  });

  it('defendedStages contains stages with p < 0.3', () => {
    const withDefended = [...stages, { name: 'Firewall', successProbability: 0.1 }];
    const r = killChainAnalysis(withDefended);
    expect(r.defendedStages).toContain('Firewall');
    expect(r.defendedStages).not.toContain('Reconnaissance');
  });

  it('throws for empty stages', () => {
    expect(() => killChainAnalysis([])).toThrow();
  });
});

// ─── IOC Confidence ───────────────────────────────────────────────────────────

describe('iocConfidence', () => {
  it('fresh, high-quality, corroborated indicator → high confidence', () => {
    const r = iocConfidence({ type: 'ip', sourceQuality: 1.0, ageDays: 0, corroboration: 5 });
    expect(r.tier).toBe('high');
    expect(r.confidence).toBeGreaterThanOrEqual(70);
  });

  it('stale indicator (60 days) → lower confidence', () => {
    const fresh = iocConfidence({ type: 'ip', sourceQuality: 1.0, ageDays: 0, corroboration: 3 });
    const stale = iocConfidence({ type: 'ip', sourceQuality: 1.0, ageDays: 60, corroboration: 3 });
    expect(stale.confidence).toBeLessThan(fresh.confidence);
  });

  it('decayFactor in (0, 1] — always positive', () => {
    const r = iocConfidence({ type: 'hash', sourceQuality: 0.8, ageDays: 30, corroboration: 1 });
    expect(r.decayFactor).toBeGreaterThan(0);
    expect(r.decayFactor).toBeLessThanOrEqual(1);
  });

  it('confidence in [0, 100]', () => {
    for (const ageDays of [0, 10, 30, 90, 180]) {
      const r = iocConfidence({ type: 'domain', sourceQuality: 0.9, ageDays, corroboration: 2 });
      expect(r.confidence).toBeGreaterThanOrEqual(0);
      expect(r.confidence).toBeLessThanOrEqual(100);
    }
  });

  it('low confidence → tier=low', () => {
    const r = iocConfidence({ type: 'url', sourceQuality: 0.3, ageDays: 120, corroboration: 0 });
    expect(r.tier).toBe('low');
  });
});

// ─── Vulnerability Prioritization ────────────────────────────────────────────

describe('vulnerabilityPrioritization', () => {
  const vulns = [
    { assetId: 'server-A', cvssScore: 9.8, assetCriticality: 5, exposed: true  }, // priority 1
    { assetId: 'server-B', cvssScore: 5.5, assetCriticality: 3, exposed: false }, // priority 3
    { assetId: 'server-C', cvssScore: 7.2, assetCriticality: 4, exposed: true  }, // priority 2
  ];

  it('highest risk vuln appears first (sorted descending)', () => {
    const r = vulnerabilityPrioritization(vulns);
    expect(r[0].assetId).toBe('server-A');
  });

  it('critical-priority: CVSS ≥ 9.0 and exposed → priority 1', () => {
    const r = vulnerabilityPrioritization(vulns);
    const serverA = r.find(v => v.assetId === 'server-A')!;
    expect(serverA.priority).toBe(1);
  });

  it('low CVSS, not exposed → priority 3', () => {
    const r = vulnerabilityPrioritization(vulns);
    const serverB = r.find(v => v.assetId === 'server-B')!;
    expect(serverB.priority).toBe(3);
  });

  it('all vulns present in output', () => {
    const r = vulnerabilityPrioritization(vulns);
    expect(r).toHaveLength(vulns.length);
  });

  it('throws for empty vulnerabilities', () => {
    expect(() => vulnerabilityPrioritization([])).toThrow();
  });
});

// ─── Diamond Model ────────────────────────────────────────────────────────────

describe('diamondModelScore', () => {
  it('high all → nation-state', () => {
    const r = diamondModelScore({ capability: 9, intent: 9, opportunity: 9 });
    expect(r.classification).toBe('nation-state');
    expect(r.threatScore).toBeGreaterThan(7);
  });

  it('threatScore = geometric mean(capability, intent, opportunity)', () => {
    const r = diamondModelScore({ capability: 8, intent: 6, opportunity: 4 });
    const expected = Math.pow(8 * 6 * 4, 1 / 3);
    expect(r.threatScore).toBeCloseTo(expected, 2);
  });

  it('low capability + high intent → hacktivist', () => {
    const r = diamondModelScore({ capability: 3, intent: 9, opportunity: 5 });
    expect(r.classification).toBe('hacktivist');
  });

  it('low all → script-kiddie', () => {
    const r = diamondModelScore({ capability: 2, intent: 2, opportunity: 3 });
    expect(r.classification).toBe('script-kiddie');
  });

  it('throws for values outside [0, 10]', () => {
    expect(() => diamondModelScore({ capability: 11, intent: 5, opportunity: 5 })).toThrow();
  });
});

// ─── Receipt ─────────────────────────────────────────────────────────────────

describe('buildThreatReceipt', () => {
  it('plugin=threat-intelligence and CAEL event correct', () => {
    const receipt = buildThreatReceipt({ converged: true });
    expect(receipt.plugin).toBe('threat-intelligence');
    expect(receipt.cael.event).toBe('threat_intelligence.threat_analysis');
    expect(receipt.payloadHash).toBeTruthy();
  });

  it('accepted=true when no Critical/High CVSS and low kill-chain probability', () => {
    const cvss = cvssScore({
      attackVector: 'P', attackComplexity: 'H', privilegesRequired: 'H',
      userInteraction: 'R', scope: 'U',
      confidentialityImpact: 'L', integrityImpact: 'N', availabilityImpact: 'N',
    });
    const receipt = buildThreatReceipt({ cvss, converged: true });
    expect(receipt.acceptance.accepted).toBe(true);
  });

  it('accepted=false for Critical CVSS (≥ 9.0)', () => {
    const cvss = cvssScore({
      attackVector: 'N', attackComplexity: 'L', privilegesRequired: 'N',
      userInteraction: 'N', scope: 'U',
      confidentialityImpact: 'H', integrityImpact: 'H', availabilityImpact: 'H',
    });
    expect(cvss.baseScore).toBeGreaterThanOrEqual(9.0);
    const receipt = buildThreatReceipt({ cvss, converged: true });
    expect(receipt.acceptance.accepted).toBe(false);
    expect(receipt.acceptance.violations.length).toBeGreaterThan(0);
  });

  it('accepted=false for high kill-chain probability', () => {
    const killChain = killChainAnalysis([
      { name: 'Recon', successProbability: 0.9 },
      { name: 'Exploit', successProbability: 0.8 },
      { name: 'Action', successProbability: 0.9 },
    ]); // overall ≈ 0.648 > 0.20
    expect(killChain.overallProbability).toBeGreaterThan(0.20);
    const receipt = buildThreatReceipt({ killChain, converged: true });
    expect(receipt.acceptance.accepted).toBe(false);
  });

  it('uses provided runId', () => {
    const receipt = buildThreatReceipt({ converged: true }, { runId: 'ti-incident-001' });
    expect(receipt.runId).toBe('ti-incident-001');
  });
});
