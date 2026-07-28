import { describe, it, expect } from 'vitest';
import {
  extractCitations,
  groundCitations,
  annotateGrounding,
  type GroundingEntry,
} from '../citation-grounding.js';

describe('extractCitations', () => {
  it('finds the ecosystem ID forms and dedupes in first-seen order', () => {
    const text =
      'Per W.810 and F.126, see also W.GOLD.550, G.GOLD.004, I.020 and task_1782002213704_e1vn. Again W.810.';
    expect(extractCitations(text)).toEqual([
      'W.810',
      'F.126',
      'W.GOLD.550',
      'G.GOLD.004',
      'I.020',
      'task_1782002213704_e1vn',
    ]);
  });

  it('does NOT match ordinary prose that looks ID-ish', () => {
    // lowercase prefixes / no digits → not citations (avoids "e.g.", "v.2", "p.m" false positives)
    expect(extractCitations('e.g. the v.2 build at 3.14 p.m. is fine')).toEqual([]);
  });

  it('returns [] for empty/missing text', () => {
    expect(extractCitations('')).toEqual([]);
  });
});

describe('groundCitations', () => {
  const corpus: GroundingEntry[] = [
    { id: 'W.810', content: 'ollama desktop context OOM root cause' },
    { id: 'k1', content: 'the placement swing is documented in F.126 and D.101' },
  ];

  it('grounds by entry id AND by appearance in content; flags the rest as confabulated', () => {
    const text =
      'I rely on W.810 (real id), F.126 (in content), D.101 (in content), and W.999 (invented).';
    const r = groundCitations(text, corpus);
    expect(r.grounded.sort()).toEqual(['D.101', 'F.126', 'W.810']);
    expect(r.confabulated).toEqual(['W.999']);
  });

  it('fail-closed: an empty corpus grounds nothing (every citation unverified)', () => {
    const r = groundCitations('claims W.810 and F.126', []);
    expect(r.grounded).toEqual([]);
    expect(r.confabulated).toEqual(['W.810', 'F.126']);
  });

  it('no citations → empty result, not an error', () => {
    const r = groundCitations('a plain answer with no citations', corpus);
    expect(r).toEqual({ citations: [], grounded: [], confabulated: [] });
  });

  it('content match is whole-token: a cited W.1 does NOT ground against content "W.126"', () => {
    // The confabulation-gate-defeating bug: raw substring would treat "W.126" as
    // grounding "W.1". Boundary-anchored matching must reject it as confabulated.
    const r = groundCitations('relies on W.1', [{ id: 'k', content: 'the real entry is W.126' }]);
    expect(r.grounded).toEqual([]);
    expect(r.confabulated).toEqual(['W.1']);
  });
});

describe('annotateGrounding', () => {
  it('appends a verified-count footer and lists confabulated IDs', () => {
    const r = groundCitations('uses W.810 and W.999', [{ id: 'W.810', content: 'x' }]);
    const out = annotateGrounding('uses W.810 and W.999', r);
    expect(out).toContain('[citation grounding: 1/2 citations verified');
    expect(out).toContain('UNVERIFIED');
    expect(out).toContain('W.999');
  });

  it('leaves citation-free text unchanged', () => {
    const text = 'no citations here';
    const r = groundCitations(text, []);
    expect(annotateGrounding(text, r)).toBe(text);
  });
});
