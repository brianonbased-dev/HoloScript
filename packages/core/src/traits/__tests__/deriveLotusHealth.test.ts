import { describe, it, expect } from 'vitest';
import {
  deriveLotusHealth,
  paperHealth,
  bloomForPaperHealth,
  type PapersStatusDoc,
  type PaperStatusRow,
} from '../deriveLotusHealth';

/** Build a 16-pillar row from a compact token list (pads with ✅ to 16). */
function row(rowId: string, title: string, tokens: string[], retired = false): PaperStatusRow {
  const padded = [...tokens];
  while (padded.length < 16) padded.push('✅');
  const pillars: PaperStatusRow['pillars'] = {};
  padded.forEach((t, i) => {
    pillars[`pillar${i}`] = { token: t as '✅' | '⚠️' | '❌' | '➖' };
  });
  return { rowId, title, retired, pillars };
}

describe('paperHealth — token reduction', () => {
  it('weights ✅=1, ⚠️=0.5, ❌=0 and excludes ➖ from the denominator', () => {
    const r = row('x', 'x', ['✅', '✅', '⚠️', '❌', '➖'].concat(Array(11).fill('✅')));
    const h = paperHealth(r);
    // 13✅ + 1⚠️ + 1❌ over 15 applicable (the ➖ excluded) = (13 + 0.5) / 15
    expect(h.passing).toBe(13);
    expect(h.failing).toBe(1);
    expect(h.partial).toBe(1);
    expect(h.health).toBeCloseTo(13.5 / 15, 5);
  });
});

describe('bloomForPaperHealth — structural token mapping', () => {
  it('retired papers are dead petals (wilted) regardless of health', () => {
    expect(bloomForPaperHealth(0.95, true, 0)).toBe('wilted');
  });
  it('several failing pillars + low health wilt (failed/contradicted benchmarks)', () => {
    expect(bloomForPaperHealth(0.633, false, 3)).toBe('wilted');
  });
  it('opens with health when not failing', () => {
    expect(bloomForPaperHealth(0.95, false, 0)).toBe('full');
    expect(bloomForPaperHealth(0.8, false, 0)).toBe('blooming');
    expect(bloomForPaperHealth(0.6, false, 0)).toBe('budding');
    expect(bloomForPaperHealth(0.3, false, 0)).toBe('sealed');
  });
});

describe('deriveLotusHealth — structural readiness proxy', () => {
  // Mirrors the real docs/public/papers-status.json shape: a retired IK paper
  // with 5 reds, a desk-rejected capstone with 3 reds, and healthy papers.
  const doc: PapersStatusDoc = {
    schema: 'paper-audit-matrix.v3',
    generatedAt: '2026-06-10T06:44:14.000Z',
    scriptCommit: 'fixture-commit',
    papers: [
      row('7', 'Verifiable IK', ['❌', '❌', '❌', '❌', '❌', '⚠️', '➖'], true), // retired, 5 reds
      row('TVCG', 'Trust by Construction', ['❌', '❌', '❌', '⚠️', '⚠️', '⚠️', '⚠️', '⚠️', '➖']), // 3 reds, 5 warns
      row('10', 'HS Core', ['⚠️']), // mostly green
      row('2', 'SNN Acceleration', []), // all green
    ],
  };

  it('wilts the retired IK petal and the failing capstone, blooms the rest', () => {
    const out = deriveLotusHealth(doc);
    const by = Object.fromEntries(out.perPaper.map((p) => [p.rowId, p]));
    expect(by['7'].bloom).toBe('wilted'); // retired → dead petal
    expect(by['TVCG'].bloom).toBe('wilted'); // 3 reds, health < 0.7 → wilted
    expect(by['10'].bloom).toBe('full'); // 15✅ + 1⚠️ ≈ 0.97
    expect(by['2'].bloom).toBe('full'); // all ✅
    expect(by['2'].basis).toBe('structural-readiness-proxy');
    expect(by['2'].claimSupport).toBe('unverified');
  });

  it('reports an aggregate below full for the supplied token mix', () => {
    const out = deriveLotusHealth(doc);
    expect(out.aggregate).toBeLessThan(1);
    expect(out.aggregate).toBeGreaterThan(0.5);
    expect(out.basis).toBe('structural-readiness-proxy');
    expect(out.claimSupport).toBe('unverified');
    expect(out.sourceSchema).toBe('paper-audit-matrix.v3');
    expect(out.sourceScriptCommit).toBe('fixture-commit');
    expect(out.generatedAt).toBe('2026-06-10T06:44:14.000Z');
  });

  it('is deterministic — same audit in, same flower out', () => {
    expect(deriveLotusHealth(doc)).toEqual(deriveLotusHealth(doc));
  });

  it('keeps an all-green structural bloom explicitly unverified', () => {
    const structurallyGreen = row('green', 'Structurally Green Paper', []);
    structurallyGreen.pillars.evidencePair = {
      token: '✅',
      scope: 'paper-wide-path-presence',
      claimSupport: 'unverified',
    };
    const out = deriveLotusHealth({
      schema: 'paper-audit-matrix.v3',
      papers: [structurallyGreen],
    });

    expect(out.aggregate).toBe(1);
    expect(out.aggregateBloom).toBe('full');
    expect(out.basis).toBe('structural-readiness-proxy');
    expect(out.claimSupport).toBe('unverified');
    expect(out.sourceClaimSupport).toEqual(['unverified']);
    expect(out.perPaper[0]).toMatchObject({
      health: 1,
      bloom: 'full',
      basis: 'structural-readiness-proxy',
      claimSupport: 'unverified',
      sourceClaimSupport: ['unverified'],
    });
  });
});
