/**
 * Therapy & clinical psychology solver tests — therapy-plugin
 *
 * Reference values verified against:
 *  - Kroenke K, Spitzer R, Williams J (2001) J. Gen. Intern. Med. 16:606-613
 *  - Spitzer R, Kroenke K, Williams J, Löwe B (2006) JAMA 295:2201-2207
 *  - Jacobson N, Truax P (1991) J. Consult. Clin. Psychol. 59(1):12-19
 *
 * CLINICAL DISCLAIMER: This test suite validates DECISION SUPPORT math only.
 * Output must be reviewed by a qualified mental health professional.
 */

import { describe, it, expect } from 'vitest';
import {
  phq9Score,
  gad7Score,
  treatmentOutcome,
  riskStratification,
  stageOfChange,
  buildTherapyReceipt,
} from '../therapysolver';

// ─── PHQ-9 ────────────────────────────────────────────────────────────────────

describe('phq9Score', () => {
  /**
   * PHQ-9 scoring (Kroenke 2001):
   * 0-4: None, 5-9: Mild, 10-14: Moderate, 15-19: Moderately Severe, 20-27: Severe
   */
  it('all zeros → score=0, severity=none', () => {
    const r = phq9Score([0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(r.totalScore).toBe(0);
    expect(r.severity).toBe('none');
    expect(r.positiveScreening).toBe(false);
  });

  it('all threes → score=27, severity=severe', () => {
    const r = phq9Score([3, 3, 3, 3, 3, 3, 3, 3, 3]);
    expect(r.totalScore).toBe(27);
    expect(r.severity).toBe('severe');
    expect(r.positiveScreening).toBe(true);
  });

  it('score=10 → positive screening', () => {
    // 2+2+2+1+1+1+1+0+0 = 10
    const r = phq9Score([2, 2, 2, 1, 1, 1, 1, 0, 0]);
    expect(r.totalScore).toBe(10);
    expect(r.positiveScreening).toBe(true);
  });

  it('item9 (suicidal ideation) tracked correctly', () => {
    const r = phq9Score([0, 0, 0, 0, 0, 0, 0, 0, 2]); // only item 9 endorsed
    expect(r.item9Score).toBe(2);
  });

  it('score 5-9 → mild', () => {
    const r = phq9Score([1, 1, 1, 1, 1, 0, 0, 0, 0]); // score=5
    expect(r.severity).toBe('mild');
  });

  it('score 10-14 → moderate', () => {
    const r = phq9Score([2, 2, 2, 2, 1, 1, 0, 0, 0]); // score=10
    expect(r.severity).toBe('moderate');
  });

  it('score 15-19 → moderately-severe', () => {
    const r = phq9Score([2, 2, 2, 2, 2, 2, 1, 1, 1]); // score=15
    expect(r.severity).toBe('moderately-severe');
  });

  it('throws for wrong response count', () => {
    expect(() => phq9Score([1, 2, 3] as any)).toThrow();
  });

  it('throws for out-of-range response', () => {
    expect(() => phq9Score([0, 0, 0, 0, 0, 0, 0, 0, 4] as any)).toThrow();
  });
});

// ─── GAD-7 ────────────────────────────────────────────────────────────────────

describe('gad7Score', () => {
  it('all zeros → minimal anxiety', () => {
    const r = gad7Score([0, 0, 0, 0, 0, 0, 0]);
    expect(r.severity).toBe('minimal');
    expect(r.positiveScreening).toBe(false);
  });

  it('all threes → severe anxiety', () => {
    const r = gad7Score([3, 3, 3, 3, 3, 3, 3]);
    expect(r.totalScore).toBe(21);
    expect(r.severity).toBe('severe');
    expect(r.positiveScreening).toBe(true);
  });

  it('score=10 → positive anxiety screening', () => {
    const r = gad7Score([2, 2, 2, 1, 1, 1, 1]); // score=10
    expect(r.positiveScreening).toBe(true);
  });

  it('score 5-9 → mild', () => {
    const r = gad7Score([1, 1, 1, 1, 1, 0, 0]); // score=5
    expect(r.severity).toBe('mild');
  });

  it('throws for wrong item count', () => {
    expect(() => gad7Score([1, 2, 3] as any)).toThrow();
  });
});

// ─── Treatment Outcome (RCI) ──────────────────────────────────────────────────

describe('treatmentOutcome', () => {
  /**
   * Jacobson-Truax: RCI = (post-pre) / SEdiff, where SEdiff = SD×√2×√(1-r)
   * |RCI| ≥ 1.96 → reliable change
   */
  it('large improvement → direction=improved', () => {
    // PHQ9: pre=20, post=5, SD=5, reliability=0.84 → SEdiff=5×√2×√(0.16)=2.83
    // RCI = (5-20)/2.83 = -5.3 → reliable, improved
    const r = treatmentOutcome(20, 5, 5, 0.84, 10);
    expect(r.direction).toBe('improved');
    expect(r.reliableChange).toBe(true);
  });

  it('score deterioration → direction=deteriorated', () => {
    const r = treatmentOutcome(5, 20, 5, 0.84, 10);
    expect(r.direction).toBe('deteriorated');
  });

  it('small change within error → no-change', () => {
    // pre=10, post=11, tiny change below RCI threshold
    const r = treatmentOutcome(10, 11, 5, 0.50, 10);
    expect(r.direction).toBe('no-change');
  });

  it('scoreDelta = post − pre', () => {
    const r = treatmentOutcome(15, 8, 4, 0.84, 10);
    expect(r.scoreDelta).toBe(8 - 15);
  });

  it('clinicallySignificant requires reliable change AND crossing cutoff', () => {
    // pre=20 (above cutoff=10), post=5 (below cutoff) + reliable change
    const r = treatmentOutcome(20, 5, 5, 0.84, 10);
    expect(r.clinicallySignificant).toBe(true);
  });

  it('throws for zero SD', () => {
    expect(() => treatmentOutcome(15, 8, 0, 0.84, 10)).toThrow();
  });
});

// ─── Risk Stratification ──────────────────────────────────────────────────────

describe('riskStratification', () => {
  it('has plan → crisis risk level', () => {
    const r = riskStratification({
      suicidalIdeationScore: 3,
      recentSelfHarm: true,
      hasPlan: true,
      hasAccess: true,
      protectiveFactors: 0,
    });
    expect(r.riskLevel).toBe('crisis');
  });

  it('no risk factors → low risk', () => {
    const r = riskStratification({
      suicidalIdeationScore: 0,
      recentSelfHarm: false,
      hasPlan: false,
      hasAccess: false,
      protectiveFactors: 4,
    });
    expect(r.riskLevel).toBe('low');
  });

  it('riskScore in [0, 100]', () => {
    const r = riskStratification({
      suicidalIdeationScore: 2,
      recentSelfHarm: true,
      hasPlan: false,
      hasAccess: true,
      protectiveFactors: 1,
    });
    expect(r.riskScore).toBeGreaterThanOrEqual(0);
    expect(r.riskScore).toBeLessThanOrEqual(100);
  });

  it('risk factors listed for active ideation', () => {
    const r = riskStratification({
      suicidalIdeationScore: 3,
      recentSelfHarm: false,
      hasPlan: false,
      hasAccess: false,
      protectiveFactors: 0,
    });
    expect(r.riskFactors).toContain('active suicidal ideation');
  });

  it('recommendedAction is non-empty string', () => {
    const r = riskStratification({
      suicidalIdeationScore: 0,
      recentSelfHarm: false,
      hasPlan: false,
      hasAccess: false,
      protectiveFactors: 2,
    });
    expect(typeof r.recommendedAction).toBe('string');
    expect(r.recommendedAction.length).toBeGreaterThan(0);
  });
});

// ─── Stage of Change ──────────────────────────────────────────────────────────

describe('stageOfChange', () => {
  it('score=0 → precontemplation', () => {
    expect(stageOfChange(0)).toBe('precontemplation');
  });

  it('score=30 → contemplation', () => {
    expect(stageOfChange(30)).toBe('contemplation');
  });

  it('score=50 → preparation', () => {
    expect(stageOfChange(50)).toBe('preparation');
  });

  it('score=70 → action', () => {
    expect(stageOfChange(70)).toBe('action');
  });

  it('score=100 → maintenance', () => {
    expect(stageOfChange(100)).toBe('maintenance');
  });

  it('throws for score > 100', () => {
    expect(() => stageOfChange(101)).toThrow();
  });
});

// ─── Receipt ─────────────────────────────────────────────────────────────────

describe('buildTherapyReceipt', () => {
  it('plugin=therapy and CAEL event correct', () => {
    const receipt = buildTherapyReceipt({ converged: true });
    expect(receipt.plugin).toBe('therapy');
    expect(receipt.cael.event).toBe('therapy.clinical_analysis');
    expect(receipt.payloadHash).toBeTruthy();
  });

  it('accepted=true for low-risk, sub-threshold scores', () => {
    const phq9 = phq9Score([0, 1, 0, 1, 0, 0, 0, 0, 0]); // score=2, none
    const gad7 = gad7Score([0, 1, 0, 1, 0, 0, 0]);         // score=2, minimal
    const risk = riskStratification({ suicidalIdeationScore: 0, recentSelfHarm: false, hasPlan: false, hasAccess: false, protectiveFactors: 3 });
    const receipt = buildTherapyReceipt({ phq9, gad7, risk, converged: true });
    expect(receipt.acceptance.accepted).toBe(true);
  });

  it('accepted=false for positive PHQ-9 screen', () => {
    const phq9 = phq9Score([2, 2, 2, 2, 2, 0, 0, 0, 0]); // score=10 → positive
    expect(phq9.positiveScreening).toBe(true);
    const receipt = buildTherapyReceipt({ phq9, converged: true });
    expect(receipt.acceptance.accepted).toBe(false);
    expect(receipt.acceptance.violations.length).toBeGreaterThan(0);
  });

  it('accepted=false for positive GAD-7 screen', () => {
    const gad7 = gad7Score([2, 2, 2, 2, 1, 1, 0]); // score=10 → positive
    expect(gad7.positiveScreening).toBe(true);
    const receipt = buildTherapyReceipt({ gad7, converged: true });
    expect(receipt.acceptance.accepted).toBe(false);
  });

  it('accepted=false for crisis risk level', () => {
    const risk = riskStratification({ suicidalIdeationScore: 3, recentSelfHarm: true, hasPlan: true, hasAccess: true, protectiveFactors: 0 });
    const receipt = buildTherapyReceipt({ risk, converged: true });
    expect(receipt.acceptance.accepted).toBe(false);
  });

  it('uses provided runId', () => {
    const receipt = buildTherapyReceipt({ converged: true }, { runId: 'therapy-session-42' });
    expect(receipt.runId).toBe('therapy-session-42');
  });
});
