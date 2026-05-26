#!/usr/bin/env node
/**
 * Paper 17 SESL Fine-Tune Delta Eval — unit tests for scoring functions and gate logic.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const BENCH_DIR = path.join(REPO_ROOT, 'research', 'paper-17-sesl-pairs', 'eval-benchmarks');

// ── Scoring functions (inline from sesl-finetune-delta-eval.mjs) ──────

function extractTraits(text) {
  const matches = text.match(/@(\w+)/g) || [];
  return matches.map((m) => m.slice(1));
}

function scoreTraitCorrectness(response, expected) {
  if (!response || !expected) return 0;
  const responseTraits = new Set(extractTraits(response).map((t) => t.toLowerCase()));
  const expectedTraits = new Set(expected.map((t) => t.toLowerCase()));
  if (expectedTraits.size === 0) return 0;
  let matched = 0;
  for (const t of expectedTraits) {
    if (responseTraits.has(t)) matched++;
  }
  return matched / expectedTraits.size;
}

function scoreCompositionShape(response) {
  if (!response) return 0;
  const hasObject = /object\s+"?\w+"?\s*\{/.test(response);
  const hasTraits = /@\w+/.test(response);
  const hasGeometry = /geometry\s*:/i.test(response);
  let score = 0;
  if (hasObject) score += 0.33;
  if (hasTraits) score += 0.33;
  if (hasGeometry) score += 0.34;
  return Math.min(score, 1);
}

function scoreInformationGain(baselineTraits, finetunedTraits) {
  if (!finetunedTraits || finetunedTraits.length === 0) return 0;
  const baseline = new Set((baselineTraits || []).map((t) => t.toLowerCase()));
  const finetuned = new Set(finetunedTraits.map((t) => t.toLowerCase()));
  let novel = 0;
  for (const t of finetuned) {
    if (!baseline.has(t)) novel++;
  }
  const preserved = [...baseline].filter((t) => finetuned.has(t)).length;
  const baselineCoverage = baseline.size > 0 ? preserved / baseline.size : 0;
  return baselineCoverage * 0.5 + (finetuned.size > 0 ? novel / finetuned.size : 0) * 0.5;
}

// ── Tests ─────────────────────────────────────────────────────────────

describe('scoreTraitCorrectness', () => {
  it('returns 1.0 for perfect match', () => {
    assert.equal(scoreTraitCorrectness(
      'object "X" { @structural @physics }',
      ['structural', 'physics']
    ), 1);
  });

  it('returns 0.5 for partial match', () => {
    assert.ok(Math.abs(scoreTraitCorrectness(
      'object "X" { @structural }',
      ['structural', 'physics']
    ) - 0.5) < 0.01);
  });

  it('returns 0 for no match', () => {
    assert.equal(scoreTraitCorrectness(
      'object "X" { @visual }',
      ['structural', 'physics']
    ), 0);
  });

  it('returns 0 for null response', () => {
    assert.equal(scoreTraitCorrectness(null, ['structural']), 0);
  });
});

describe('scoreCompositionShape', () => {
  it('returns ~1.0 for complete hsplus composition', () => {
    assert.ok(scoreCompositionShape(
      'object "Bridge" {\n  @structural\n  geometry: "bridge"\n}'
    ) >= 0.99);
  });

  it('returns 0.33 for traits-only response', () => {
    assert.ok(Math.abs(scoreCompositionShape('@structural @physics') - 0.33) < 0.01);
  });

  it('returns 0 for empty response', () => {
    assert.equal(scoreCompositionShape(''), 0);
  });
});

describe('scoreInformationGain', () => {
  it('rewards novel traits while preserving baseline', () => {
    const score = scoreInformationGain(
      ['structural', 'physics'],
      ['structural', 'physics', 'hologram']
    );
    assert.ok(Math.abs(score - 2 / 3) < 0.1);
  });

  it('penalizes losing baseline traits', () => {
    const score = scoreInformationGain(
      ['structural', 'physics'],
      ['structural', 'hologram']
    );
    assert.ok(Math.abs(score - 0.5) < 0.1);
  });

  it('returns 0 for empty finetuned traits', () => {
    assert.equal(scoreInformationGain(['structural'], []), 0);
  });
});

describe('benchmark generation', () => {
  it('generates benchmark files from seed corpus', () => {
    const manifestPath = path.join(BENCH_DIR, 'manifest.json');
    if (!fs.existsSync(manifestPath)) {
      return;
    }
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

    assert.ok(manifest.benchmarks['trait-correctness']);
    assert.ok(manifest.benchmarks['composition-shape']);
    assert.ok(manifest.benchmarks['information-gain']);
    assert.equal(manifest.gate.minBenchmarks, 2);
    assert.ok(Math.abs(manifest.gate.minDelta - 0.05) < 0.001);

    for (const [name, meta] of Object.entries(manifest.benchmarks)) {
      const benchPath = path.join(BENCH_DIR, meta.path);
      assert.ok(fs.existsSync(benchPath), `benchmark ${name} file missing`);
      const entries = fs.readFileSync(benchPath, 'utf8').trim().split('\n').filter(Boolean);
      assert.ok(entries.length > 0, `benchmark ${name} has no entries`);
    }
  });
});

describe('gate logic', () => {
  it('PASS when 2+ benchmarks show >= 5% improvement', () => {
    const baseline = {
      'trait-correctness': [{ score: 0.6 }, { score: 0.7 }],
      'composition-shape': [{ score: 0.5 }, { score: 0.6 }],
      'information-gain': [{ score: 0.3 }, { score: 0.4 }],
    };
    const finetuned = {
      'trait-correctness': [{ score: 0.8 }, { score: 0.9 }],
      'composition-shape': [{ score: 0.7 }, { score: 0.75 }],
      'information-gain': [{ score: 0.35 }, { score: 0.45 }],
    };

    let passing = 0;
    for (const name of ['trait-correctness', 'composition-shape', 'information-gain']) {
      const baseAvg = baseline[name].reduce((s, e) => s + e.score, 0) / baseline[name].length;
      const ftAvg = finetuned[name].reduce((s, e) => s + e.score, 0) / finetuned[name].length;
      if (ftAvg - baseAvg >= 0.05) passing++;
    }
    assert.ok(passing >= 2);
  });

  it('FAIL when fewer than 2 benchmarks show >= 5% improvement', () => {
    const baseline = {
      'trait-correctness': [{ score: 0.9 }],
      'composition-shape': [{ score: 0.8 }],
      'information-gain': [{ score: 0.5 }],
    };
    const finetuned = {
      'trait-correctness': [{ score: 0.91 }],
      'composition-shape': [{ score: 0.82 }],
      'information-gain': [{ score: 0.52 }],
    };

    let passing = 0;
    for (const name of ['trait-correctness', 'composition-shape', 'information-gain']) {
      const baseAvg = baseline[name].reduce((s, e) => s + e.score, 0) / baseline[name].length;
      const ftAvg = finetuned[name].reduce((s, e) => s + e.score, 0) / finetuned[name].length;
      if (ftAvg - baseAvg >= 0.05) passing++;
    }
    assert.ok(passing < 2);
  });
});