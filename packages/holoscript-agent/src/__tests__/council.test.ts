import { describe, it, expect } from 'vitest';
import { convergeCouncil, renderCouncil, type CouncilSeat } from '../council.js';
import type { GroundingEntry } from '../citation-grounding.js';

const corpus: GroundingEntry[] = [
  { id: 'W.810', content: 'the GPU root cause' },
  { id: 'F.126', content: 'native authoring doctrine' },
  { id: 'D.101', content: 'build-the-language freeze' },
];

describe('convergeCouncil', () => {
  it('corroborates citations raised by >=2 peers, marks one-peer ones single-source', () => {
    const seats: CouncilSeat[] = [
      { peer: 'jetson', answer: 'I rely on W.810 and F.126.' },
      { peer: 'laptop', answer: 'W.810 is the key; also D.101.' },
    ];
    const c = convergeCouncil(seats, corpus);
    expect(c.corroborated).toEqual(['W.810']); // both peers cited it, and it resolves
    expect(c.singleSource).toEqual(['D.101', 'F.126']); // each raised by exactly one peer
    expect(c.confabulated).toEqual([]);
  });

  it('collects confabulated citations across seats (deduped union) and never corroborates them', () => {
    const seats: CouncilSeat[] = [
      { peer: 'a', answer: 'Per W.999 do X.' },
      { peer: 'b', answer: 'Also W.999, and W.888.' },
    ];
    const c = convergeCouncil(seats, corpus);
    // W.999 cited by 2 peers but resolves to NOTHING → never corroborated, just confabulated.
    expect(c.corroborated).toEqual([]);
    expect(c.singleSource).toEqual([]);
    expect(c.confabulated).toEqual(['W.888', 'W.999']);
  });

  it('a seat citing the same id twice counts as one corroborating voice (no self-corroboration)', () => {
    const seats: CouncilSeat[] = [
      { peer: 'a', answer: 'W.810 and again W.810.' },
      { peer: 'b', answer: 'unrelated, cites F.126.' },
    ];
    const c = convergeCouncil(seats, corpus);
    expect(c.corroborated).toEqual([]); // W.810 only from ONE distinct seat
    expect(c.singleSource).toEqual(['F.126', 'W.810']);
  });
});

describe('renderCouncil', () => {
  it('renders the tiers + per-seat answers', () => {
    const c = convergeCouncil(
      [
        { peer: 'jetson/correctness', answer: 'W.810 fixes it.' },
        { peer: 'laptop/skeptic', answer: 'Agree W.810; but W.999 is unproven.' },
      ],
      corpus
    );
    const out = renderCouncil('how to fix the GPU?', c);
    expect(out).toContain('[Council of 2 peer(s) re "how to fix the GPU?"]');
    expect(out).toContain('Corroborated (≥2 peers, verified): W.810');
    expect(out).toContain('confabulated, do NOT rely on: W.999');
    expect(out).toContain('— jetson/correctness:');
    expect(out).toContain('— laptop/skeptic:');
  });
});
