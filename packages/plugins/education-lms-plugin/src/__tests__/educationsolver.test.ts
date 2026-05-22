/**
 * Education LMS solver tests — education-lms-plugin
 *
 * Reference values verified against:
 *  - Lord FM (1980) Applications of Item Response Theory. ETS.
 *  - Wozniak P (1990) Optimization of Learning. SuperMemo SM-2.
 *  - Bloom BS et al. (1956) Taxonomy of Educational Objectives.
 */

import { describe, it, expect } from 'vitest';
import {
  irtAbilityEstimate,
  sm2Review,
  learningPathOptimizer,
  gradePredictor,
  bloomClassifier,
  quizPsychometrics,
  buildEducationReceipt,
} from '../educationsolver';

// ─── IRT 3PL ─────────────────────────────────────────────────────────────────

describe('irtAbilityEstimate', () => {
  /**
   * Simple 1PL (a=1, c=0): student answers all correctly.
   * MLE θ → unbounded; clamped to +6.
   */
  it('all correct → high positive ability estimate', () => {
    const items = [
      { id: 'i1', b: -1 },
      { id: 'i2', b:  0 },
      { id: 'i3', b:  1 },
    ];
    const responses = [
      { itemId: 'i1', correct: true },
      { itemId: 'i2', correct: true },
      { itemId: 'i3', correct: true },
    ];
    const r = irtAbilityEstimate(items, responses);
    expect(r.abilityTheta).toBeGreaterThan(1);
  });

  it('all incorrect → low negative ability estimate', () => {
    const items = [
      { id: 'i1', b: -1 },
      { id: 'i2', b:  0 },
      { id: 'i3', b:  1 },
    ];
    const responses = [
      { itemId: 'i1', correct: false },
      { itemId: 'i2', correct: false },
      { itemId: 'i3', correct: false },
    ];
    const r = irtAbilityEstimate(items, responses);
    expect(r.abilityTheta).toBeLessThan(-1);
  });

  it('ability near item difficulty for 50/50 pattern', () => {
    // Items with difficulties -1, +1; student gets easy correct, hard wrong
    const items = [{ id: 'easy', b: -2 }, { id: 'hard', b: 2 }];
    const responses = [{ itemId: 'easy', correct: true }, { itemId: 'hard', correct: false }];
    const r = irtAbilityEstimate(items, responses);
    // Ability should be in middle range
    expect(r.abilityTheta).toBeGreaterThan(-2);
    expect(r.abilityTheta).toBeLessThan(2);
  });

  it('testInformation = sum of itemInformation', () => {
    const items = [{ id: 'i1', b: 0 }, { id: 'i2', b: 1 }];
    const responses = [{ itemId: 'i1', correct: true }, { itemId: 'i2', correct: false }];
    const r = irtAbilityEstimate(items, responses);
    const manualSum = r.itemInformation.reduce((s, x) => s + x.information, 0);
    expect(r.testInformation).toBeCloseTo(manualSum, 6);
  });

  it('standardError = 1/sqrt(testInformation)', () => {
    const items = [{ id: 'i1', b: 0 }, { id: 'i2', b: 0.5 }];
    const responses = [{ itemId: 'i1', correct: true }, { itemId: 'i2', correct: true }];
    const r = irtAbilityEstimate(items, responses);
    expect(r.standardError).toBeCloseTo(1 / Math.sqrt(r.testInformation), 4);
  });

  it('itemFit length matches items length', () => {
    const items = [{ id: 'i1', b: 0 }, { id: 'i2', b: 1 }, { id: 'i3', b: -1 }];
    const responses = items.map(it => ({ itemId: it.id, correct: true }));
    const r = irtAbilityEstimate(items, responses);
    expect(r.itemFit).toHaveLength(3);
  });

  it('higher discrimination a → more information near item difficulty', () => {
    // Use mixed responses: easy item correct, hard item wrong → theta stays near 0
    // where discrimination parameter a is most influential
    const itemsLow  = [{ id: 'easy', a: 0.5, b: -2 }, { id: 'hard', a: 0.5, b: 2 }];
    const itemsHigh = [{ id: 'easy', a: 2.0, b: -2 }, { id: 'hard', a: 2.0, b: 2 }];
    const responsesLow  = [{ itemId: 'easy', correct: true }, { itemId: 'hard', correct: false }];
    const responsesHigh = [{ itemId: 'easy', correct: true }, { itemId: 'hard', correct: false }];
    const rLow  = irtAbilityEstimate(itemsLow,  responsesLow);
    const rHigh = irtAbilityEstimate(itemsHigh, responsesHigh);
    // Higher discrimination → higher test information at estimated theta
    expect(rHigh.testInformation).toBeGreaterThan(rLow.testInformation);
  });

  it('throws for empty items', () => {
    expect(() => irtAbilityEstimate([], [])).toThrow();
  });

  it('throws when responses length ≠ items length', () => {
    const items = [{ id: 'i1', b: 0 }];
    expect(() => irtAbilityEstimate(items, [])).toThrow();
  });
});

// ─── SM-2 ─────────────────────────────────────────────────────────────────────

describe('sm2Review', () => {
  /**
   * First review quality=5 (perfect recall):
   * EF' = 2.5 + (0.1 - (5-5)(0.08 + 0)) = 2.5
   * rep=1 → interval=1
   */
  it('first review quality=5 → interval=1, repetitions=1', () => {
    const card = { id: 'c1' };
    const r = sm2Review(card, 5);
    expect(r.interval).toBe(1);
    expect(r.repetitions).toBe(1);
  });

  it('second review quality=5 → interval=6', () => {
    const card = { id: 'c1', interval: 1, repetitions: 1, ef: 2.5 };
    const r = sm2Review(card, 5);
    expect(r.interval).toBe(6);
    expect(r.repetitions).toBe(2);
  });

  it('third review quality=5 → interval = round(6 × EF)', () => {
    const card = { id: 'c1', interval: 6, repetitions: 2, ef: 2.5 };
    const r = sm2Review(card, 5);
    expect(r.interval).toBe(Math.round(6 * 2.5));
  });

  it('quality < 3 resets repetitions to 0 and interval to 1', () => {
    const card = { id: 'c1', interval: 10, repetitions: 4, ef: 2.3 };
    const r = sm2Review(card, 2);
    expect(r.repetitions).toBe(0);
    expect(r.interval).toBe(1);
  });

  it('EF decreases on poor recall (quality=2)', () => {
    const card = { id: 'c1', ef: 2.5 };
    const r = sm2Review(card, 2);
    expect(r.ef).toBeLessThan(2.5);
  });

  it('EF clamped to [1.3, 2.5]', () => {
    const card = { id: 'c1', ef: 1.3 };
    const r0 = sm2Review(card, 0);
    expect(r0.ef).toBeGreaterThanOrEqual(1.3);
    const cardHigh = { id: 'c1', ef: 2.5 };
    const r5 = sm2Review(cardHigh, 5);
    expect(r5.ef).toBeLessThanOrEqual(2.5);
  });

  it('dueDays equals interval', () => {
    const card = { id: 'c1', interval: 6, repetitions: 2, ef: 2.5 };
    const r = sm2Review(card, 4);
    expect(r.dueDays).toBe(r.interval);
  });

  it('throws for quality out of [0,5]', () => {
    // @ts-expect-error testing invalid input
    expect(() => sm2Review({ id: 'c1' }, 6)).toThrow();
  });
});

// ─── Learning Path Optimizer ──────────────────────────────────────────────────

describe('learningPathOptimizer', () => {
  const nodes = [
    { id: 'A', label: 'Algebra',      prerequisites: [],      estimatedMinutes: 60 },
    { id: 'B', label: 'Calculus',     prerequisites: ['A'],   estimatedMinutes: 90 },
    { id: 'C', label: 'Statistics',   prerequisites: ['A'],   estimatedMinutes: 45 },
    { id: 'D', label: 'ML Basics',    prerequisites: ['B','C'], estimatedMinutes: 120 },
  ];

  it('path is in topological order (prerequisites before dependents)', () => {
    const mastery: { nodeId: string; masteryScore: number }[] = [];
    const r = learningPathOptimizer(nodes, mastery);
    const pos = (id: string) => r.path.indexOf(id);
    // A before B and C (if both appear)
    if (pos('A') !== -1 && pos('B') !== -1) expect(pos('A')).toBeLessThan(pos('B'));
    if (pos('A') !== -1 && pos('C') !== -1) expect(pos('A')).toBeLessThan(pos('C'));
  });

  it('mastered nodes excluded from path', () => {
    const mastery = [{ nodeId: 'A', masteryScore: 0.95 }];
    const r = learningPathOptimizer(nodes, mastery);
    expect(r.path).not.toContain('A');
  });

  it('totalMinutes = sum of estimatedMinutes for unmastered path nodes', () => {
    const mastery: { nodeId: string; masteryScore: number }[] = [];
    const r = learningPathOptimizer(nodes, mastery);
    const expected = r.path.reduce((acc, id) => {
      const n = nodes.find(x => x.id === id);
      return acc + (n?.estimatedMinutes ?? 30);
    }, 0);
    expect(r.totalMinutes).toBe(expected);
  });

  it('feasible=true for acyclic DAG', () => {
    const r = learningPathOptimizer(nodes, []);
    expect(r.feasible).toBe(true);
  });

  it('throws if prerequisite node not found', () => {
    const badNodes = [
      { id: 'X', label: 'X', prerequisites: ['MISSING'], estimatedMinutes: 30 },
    ];
    expect(() => learningPathOptimizer(badNodes, [])).toThrow();
  });

  it('throws for empty nodes', () => {
    expect(() => learningPathOptimizer([], [])).toThrow();
  });
});

// ─── Grade Predictor ──────────────────────────────────────────────────────────

describe('gradePredictor', () => {
  it('uniform grades → predictedGrade ≈ score', () => {
    const grades = [
      { weight: 1, score: 0.85, recencyIndex: 1 },
      { weight: 1, score: 0.85, recencyIndex: 2 },
      { weight: 1, score: 0.85, recencyIndex: 3 },
    ];
    const r = gradePredictor(grades);
    expect(r.predictedGrade).toBeCloseTo(0.85, 2);
  });

  it('recent grades weighted more heavily with decay < 1', () => {
    const grades = [
      { weight: 1, score: 0.50, recencyIndex: 1 }, // old, low
      { weight: 1, score: 0.95, recencyIndex: 5 }, // recent, high
    ];
    const r = gradePredictor(grades, 0.5);
    // Should be closer to 0.95 than to plain average
    expect(r.predictedGrade).toBeGreaterThan(0.70);
  });

  it('predictedGrade 0.93+ → letter A, gpa=4.0', () => {
    const grades = [{ weight: 1, score: 0.95, recencyIndex: 1 }];
    const r = gradePredictor(grades);
    expect(r.letterGrade).toBe('A');
    expect(r.gpa).toBe(4.0);
  });

  it('predictedGrade below 0.60 → letter F, gpa=0.0', () => {
    const grades = [{ weight: 1, score: 0.50, recencyIndex: 1 }];
    const r = gradePredictor(grades);
    expect(r.letterGrade).toBe('F');
    expect(r.gpa).toBe(0.0);
  });

  it('throws for empty grades', () => {
    expect(() => gradePredictor([])).toThrow();
  });

  it('throws for decay > 1', () => {
    const grades = [{ weight: 1, score: 0.8, recencyIndex: 1 }];
    expect(() => gradePredictor(grades, 1.5)).toThrow();
  });
});

// ─── Bloom Classifier ─────────────────────────────────────────────────────────

describe('bloomClassifier', () => {
  it('"define the term" → L1 Remember', () => {
    const r = bloomClassifier('define the term photosynthesis');
    expect(r.level).toBe(1);
    expect(r.label).toBe('Remember');
  });

  it('"explain how the algorithm works" → L2 Understand', () => {
    const r = bloomClassifier('explain how the algorithm works and summarize results');
    expect(r.level).toBe(2);
    expect(r.label).toBe('Understand');
  });

  it('"apply the formula to solve the equation" → L3 Apply', () => {
    const r = bloomClassifier('apply the formula to calculate and solve the problem');
    expect(r.level).toBe(3);
    expect(r.label).toBe('Apply');
  });

  it('"analyze and differentiate" → L4 Analyze', () => {
    const r = bloomClassifier('analyze the data and differentiate between approaches');
    expect(r.level).toBe(4);
    expect(r.label).toBe('Analyze');
  });

  it('"evaluate and critique the design" → L5 Evaluate', () => {
    const r = bloomClassifier('evaluate and critique the design choices and assess tradeoffs');
    expect(r.level).toBe(5);
    expect(r.label).toBe('Evaluate');
  });

  it('"design and create a new system" → L6 Create', () => {
    const r = bloomClassifier('design and create a new system, then develop the plan');
    expect(r.level).toBe(6);
    expect(r.label).toBe('Create');
  });

  it('unrecognized text → L1 with confidence=0', () => {
    const r = bloomClassifier('the quick brown fox');
    expect(r.level).toBe(1);
    expect(r.confidence).toBe(0);
  });
});

// ─── Quiz Psychometrics ───────────────────────────────────────────────────────

describe('quizPsychometrics', () => {
  /**
   * 5 students, 3 items
   * Easy item (p=1), medium (p=0.6), hard (p=0.2)
   */
  const responses = [
    [1, 1, 1], // student 1: 3/3
    [1, 1, 0], // student 2: 2/3
    [1, 1, 0], // student 3: 2/3
    [1, 0, 0], // student 4: 1/3
    [1, 0, 0], // student 5: 1/3
  ];
  const itemIds = ['easy', 'medium', 'hard'];

  it('pValues correct for each item', () => {
    const r = quizPsychometrics(responses, itemIds);
    expect(r.pValues[0]).toBeCloseTo(1.0, 4); // all got easy
    expect(r.pValues[1]).toBeCloseTo(0.6, 4); // 3/5
    expect(r.pValues[2]).toBeCloseTo(0.2, 4); // 1/5
  });

  it('meanScore = average total score', () => {
    const r = quizPsychometrics(responses, itemIds);
    const expected = (3 + 2 + 2 + 1 + 1) / 5;
    expect(r.meanScore).toBeCloseTo(expected, 4);
  });

  it('cronbachAlpha in [0, 1] for valid quiz', () => {
    const r = quizPsychometrics(responses, itemIds);
    expect(r.cronbachAlpha).toBeGreaterThanOrEqual(0);
    expect(r.cronbachAlpha).toBeLessThanOrEqual(1);
  });

  it('perfect item (p=1) has 0 discrimination index', () => {
    const r = quizPsychometrics(responses, itemIds);
    // Easy item everyone got right → no discrimination
    expect(r.discriminationIndices[0]).toBeCloseTo(0, 4);
  });

  it('hard item shows positive discrimination', () => {
    const r = quizPsychometrics(responses, itemIds);
    // High scorers got hard item; low scorers did not → positive D
    expect(r.discriminationIndices[2]).toBeGreaterThan(0);
  });

  it('itemCount and n correct', () => {
    const r = quizPsychometrics(responses, itemIds);
    expect(r.itemCount).toBe(3);
    expect(r.n).toBe(5);
  });

  it('poorItems includes items with D < 0.2', () => {
    const r = quizPsychometrics(responses, itemIds);
    for (const id of r.poorItems) {
      const idx = itemIds.indexOf(id);
      expect(r.discriminationIndices[idx]).toBeLessThan(0.2);
    }
  });

  it('throws for < 2 respondents', () => {
    expect(() => quizPsychometrics([[1, 0]], itemIds)).toThrow();
  });
});

// ─── Receipt ─────────────────────────────────────────────────────────────────

describe('buildEducationReceipt', () => {
  it('plugin=education-lms and CAEL event correct', () => {
    const items = [{ id: 'i1', b: 0 }];
    const irt = irtAbilityEstimate(items, [{ itemId: 'i1', correct: true }]);
    const receipt = buildEducationReceipt({ irt, converged: true });
    expect(receipt.plugin).toBe('education-lms');
    expect(receipt.cael.event).toBe('education_lms.learning_analysis');
    expect(receipt.payloadHash).toBeTruthy();
  });

  it('accepted=true for converged result', () => {
    const receipt = buildEducationReceipt({ converged: true });
    expect(receipt.acceptance.accepted).toBe(true);
  });

  it('accepted=false when quiz has poor reliability (α < 0.70)', () => {
    // Psychometrics with very low cronbach alpha triggers a violation
    const badPsychometrics = {
      itemCount: 3,
      n: 10,
      pValues: [0.5, 0.5, 0.5],
      discriminationIndices: [0.05, 0.05, 0.05],  // all poor → > 50% poor items
      cronbachAlpha: 0.30,  // below 0.70 threshold
      meanScore: 1.5,
      stdDevScore: 0.5,
      poorItems: ['i1', 'i2', 'i3'],
    };
    const receipt = buildEducationReceipt({ psychometrics: badPsychometrics, converged: true });
    expect(receipt.acceptance.accepted).toBe(false);
    expect(receipt.acceptance.violations.length).toBeGreaterThan(0);
  });

  it('uses provided runId', () => {
    const receipt = buildEducationReceipt({ converged: true }, { runId: 'edu-run-99' });
    expect(receipt.runId).toBe('edu-run-99');
  });
});
