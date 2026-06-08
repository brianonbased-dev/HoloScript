/**
 * Invariant tests for the SESL coverage-gap analyzer.
 *
 * Must prove:
 * 1. Deterministic (same input → identical report).
 * 2. Totals always add up (sanity check invariant).
 * 3. Correctly classifies each exclusion category on synthetic fixtures.
 * 4. Reproduces the target 2164 eligible / 2836 gap on a 5000-row fixture.
 */

import { describe, it, expect } from 'vitest';
import { analyzeCoverageGap, toMarkdown } from '../sesl-coverage-gap-analysis.mjs';

function makeRow(overrides = {}) {
  const id = overrides.pair_id || `pair-${Math.random().toString(36).slice(2, 8)}`;
  const has = (k) => k in overrides;
  return {
    schemaVersion: 'paper17.sesl.phase1.v1',
    pair_id: id,
    source_pair_id: id,
    prompt_text: overrides.prompt || `prompt ${id}`,
    holo: overrides.holo || `object "Obj" { geometry: "box" }`,
    hsplus: overrides.hsplus || `object "Obj" { geometry: "box" }`,
    outcome: overrides.outcome ?? 'success',
    simContractCheck: has('simContractCheck')
      ? overrides.simContractCheck
      : {
          passed: true,
          contractId: 'cid-test',
          solverType: 'paper17-sesl-smoke',
          violations: 0,
        },
    cael_trace: has('cael_trace')
      ? overrides.cael_trace
      : {
          format: 'cael.v1.json',
          path: 'cael-traces/test.json',
          traceHash: 'abc',
          entryCount: 4,
          hashChain: { valid: true },
          hash_chain_valid: true,
        },
    provenance: {
      phase0_source: overrides.phase0_source || 'fixture',
      trait_family_set: overrides.trait_family_set || ['structural'],
      composition_shape_hash: overrides.shape || `shape-${id}`,
      kind: overrides.kind,
      novel_combination: overrides.novel_combination,
    },
    ...overrides.extra,
  };
}

describe('analyzeCoverageGap', () => {
  it('is deterministic', () => {
    const rows = [makeRow({ pair_id: 'a', shape: 's1' }), makeRow({ pair_id: 'b', shape: 's2' })];
    const r1 = analyzeCoverageGap(rows, { now: 0 });
    const r2 = analyzeCoverageGap(rows, { now: 0 });
    expect(r1).toEqual(r2);
  });

  it('totals add up on the real 10-row seed corpus', () => {
    // The real corpus has 10 success rows, no exclusions
    const rows = [
      makeRow({ pair_id: '001', shape: 's001', trait_family_set: ['structural'] }),
      makeRow({ pair_id: '002', shape: 's002', trait_family_set: ['interaction', 'physics'] }),
      makeRow({ pair_id: '003', shape: 's003', trait_family_set: ['hologram', 'visual'] }),
      makeRow({ pair_id: '004', shape: 's004', trait_family_set: ['iot', 'network'] }),
      makeRow({ pair_id: '005', shape: 's005', trait_family_set: ['audio', 'interaction'] }),
      makeRow({ pair_id: '006', shape: 's006', trait_family_set: ['structural', 'physics'] }),
      makeRow({ pair_id: '007', shape: 's007', trait_family_set: ['visual', 'iot'] }),
      makeRow({ pair_id: '008', shape: 's008', trait_family_set: ['network', 'audio'] }),
      makeRow({ pair_id: '009', shape: 's009', trait_family_set: ['structural', 'hologram'] }),
      makeRow({ pair_id: '010', shape: 's010', trait_family_set: ['interaction', 'iot'] }),
    ];
    const r = analyzeCoverageGap(rows, { target: 5000 });
    expect(r.totalRows).toBe(10);
    expect(r.rewardHackExcluded).toBe(0);
    expect(r.noTraceRows).toBe(0);
    expect(r.solverFailRows).toBe(0);
    expect(r.staticOnlyRows).toBe(0);
    expect(r.runtimeEligible).toBe(10);
    expect(r.gap).toBe(4990);
    expect(r.checks.totalAddsUp).toBe(true);
    expect(r.checks.gapCorrect).toBe(true);
  });

  it('detects reward-hack verbatim rows', () => {
    const rows = [
      makeRow({ pair_id: 'ok', shape: 's1', kind: 'synth', novel_combination: true }),
      makeRow({ pair_id: 'bad1', shape: 's2', kind: 'verbatim' }),
      makeRow({ pair_id: 'bad2', shape: 's3', kind: 'synth', novel_combination: false }),
    ];
    const r = analyzeCoverageGap(rows);
    expect(r.rewardHackExcluded).toBe(2);
    expect(r.runtimeEligible).toBe(1);
  });

  it('detects duplicate composition shapes when >3 repeats', () => {
    const rows = Array.from({ length: 5 }, (_, i) =>
      makeRow({ pair_id: `d${i}`, shape: 'same-shape', kind: 'synth', novel_combination: true })
    );
    const r = analyzeCoverageGap(rows);
    // First 3 are allowed, extras 4+5 are hacks
    expect(r.rewardHackExcluded).toBe(2);
    expect(r.runtimeEligible).toBe(3);
  });

  it('detects exact duplicate holo/hsplus/prompt rows', () => {
    const rows = [
      makeRow({ pair_id: 'a', holo: 'X', hsplus: 'X', prompt: 'P' }),
      makeRow({ pair_id: 'b', holo: 'X', hsplus: 'X', prompt: 'P' }),
    ];
    const r = analyzeCoverageGap(rows);
    expect(r.rewardHackExcluded).toBe(1);
    expect(r.runtimeEligible).toBe(1);
  });

  it('classifies no-trace rows', () => {
    const rows = [makeRow({ pair_id: 'ok' }), makeRow({ pair_id: 'bad', cael_trace: null })];
    const r = analyzeCoverageGap(rows);
    expect(r.noTraceRows).toBe(1);
    expect(r.runtimeEligible).toBe(1);
  });

  it('classifies static-only rows (no solver invoked)', () => {
    const rows = [
      makeRow({ pair_id: 'ok' }),
      makeRow({
        pair_id: 'static',
        simContractCheck: { passed: false, contractId: 'cid', solverType: '', violations: 0 },
      }),
    ];
    const r = analyzeCoverageGap(rows);
    expect(r.staticOnlyRows).toBe(1);
    expect(r.runtimeEligible).toBe(1);
    expect(r.solverFailRows).toBe(0);
  });

  it('classifies solver-fail rows with reason aggregation', () => {
    const rows = [
      makeRow({ pair_id: 'ok' }),
      makeRow({
        pair_id: 'fail1',
        simContractCheck: {
          passed: false,
          contractId: 'cid',
          solverType: 'thermal',
          violations: 2,
        },
      }),
      makeRow({
        pair_id: 'fail2',
        simContractCheck: {
          passed: false,
          contractId: 'cid',
          solverType: 'thermal',
          violations: 3,
        },
      }),
    ];
    const r = analyzeCoverageGap(rows);
    expect(r.solverFailRows).toBe(2);
    expect(r.runtimeEligible).toBe(1);
    expect(r.solverFailReasons.thermal).toEqual({ count: 2, totalViolations: 5 });
  });

  it('identifies static-only families', () => {
    const rows = [
      makeRow({ pair_id: 'ok', trait_family_set: ['structural'] }),
      makeRow({
        pair_id: 'static-only',
        trait_family_set: ['ancient'],
        simContractCheck: { passed: false, contractId: 'cid', solverType: '', violations: 0 },
      }),
    ];
    const r = analyzeCoverageGap(rows);
    expect(r.staticOnlyFamilies).toContain('ancient');
    expect(r.staticOnlyFamilies).not.toContain('structural');
  });

  it('reproduces 2164 eligible / 2836 gap on a 5000-row fixture', () => {
    // Build a deterministic 5000-row fixture with controlled ratios
    const rows = [];
    let idCounter = 0;
    const nextId = () => {
      idCounter += 1;
      return `f${String(idCounter).padStart(5, '0')}`;
    };

    // 1. Reward-hack: 800 verbatim + 300 synth-no-novel = 1100
    for (let i = 0; i < 800; i++) {
      rows.push(
        makeRow({
          pair_id: nextId(),
          shape: `hack-${i}`,
          kind: 'verbatim',
          trait_family_set: ['structural'],
        })
      );
    }
    for (let i = 0; i < 300; i++) {
      rows.push(
        makeRow({
          pair_id: nextId(),
          shape: `hack2-${i}`,
          kind: 'synth',
          novel_combination: false,
          trait_family_set: ['interaction'],
        })
      );
    }

    // 2. No trace: 500 rows
    for (let i = 0; i < 500; i++) {
      rows.push(
        makeRow({
          pair_id: nextId(),
          shape: `notrace-${i}`,
          cael_trace: null,
          trait_family_set: ['visual'],
        })
      );
    }

    // 3. Static-only (no solver): 436 rows
    for (let i = 0; i < 436; i++) {
      rows.push(
        makeRow({
          pair_id: nextId(),
          shape: `static-${i}`,
          simContractCheck: { passed: false, contractId: 'cid', solverType: '', violations: 0 },
          trait_family_set: ['audio'],
        })
      );
    }

    // 4. Solver fail: 800 rows
    for (let i = 0; i < 800; i++) {
      rows.push(
        makeRow({
          pair_id: nextId(),
          shape: `fail-${i}`,
          simContractCheck: {
            passed: false,
            contractId: 'cid',
            solverType: i < 400 ? 'structural' : 'cfd',
            violations: 1 + (i % 3),
          },
          trait_family_set: ['physics'],
        })
      );
    }

    // 5. Runtime eligible: 2164 rows
    for (let i = 0; i < 2164; i++) {
      rows.push(
        makeRow({
          pair_id: nextId(),
          shape: `good-${i}`,
          kind: 'synth',
          novel_combination: true,
          trait_family_set: ['structural', 'interaction'],
        })
      );
    }

    const r = analyzeCoverageGap(rows, { target: 5000 });
    expect(r.totalRows).toBe(5000);
    expect(r.rewardHackExcluded).toBe(1100);
    expect(r.noTraceRows).toBe(500);
    expect(r.staticOnlyRows).toBe(436);
    expect(r.solverFailRows).toBe(800);
    expect(r.runtimeEligible).toBe(2164);
    expect(r.gap).toBe(2836);
    expect(r.checks.totalAddsUp).toBe(true);
    expect(r.checks.gapCorrect).toBe(true);
  });
});

describe('toMarkdown', () => {
  it('renders a report without crashing', () => {
    const rows = [makeRow({ pair_id: 'a' }), makeRow({ pair_id: 'b' })];
    const r = analyzeCoverageGap(rows);
    const md = toMarkdown(r);
    expect(md).toContain('SESL Coverage Gap Analysis');
    expect(md).toContain('Total rows read');
    expect(md).toContain('Runtime eligible');
    expect(md).toContain('Totals add up: PASS');
  });
});
