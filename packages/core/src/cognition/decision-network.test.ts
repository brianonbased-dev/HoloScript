import { describe, it, expect } from 'vitest';
import { buildDecisionHolo, renderDecisionSvg, type DecisionEvent } from './decision-network';

const stream: DecisionEvent[] = [
  { id: 'A', label: 'Materialless globes', status: 'problem' },
  {
    id: 'B',
    label: 'Material realism',
    status: 'shipped',
    receipt: 'commit 5ecb0d48b',
    causes: ['A'],
  },
  { id: 'C', label: 'Render != physics', status: 'bug', receipt: 'you caught it', causes: ['B'] },
  { id: 'D', label: 'Geometry gate', status: 'shipped', receipt: 'commit 20f4a047', causes: ['C'] },
  { id: 'E', label: 'Sovereign judge', status: 'judge', receipt: 'lenient', causes: ['C'] },
];

describe('decision-network — auto-laid-out cognition surface', () => {
  it('builds a .holo with a node per event and an edge per cause', () => {
    const holo = buildDecisionHolo(stream);
    for (const id of ['A', 'B', 'C', 'D', 'E']) expect(holo).toContain(`object "${id}"`);
    expect(holo).toContain('label: "Material realism"');
    expect(holo).toContain('receipt: "commit 5ecb0d48b"');
    // one edge per resolvable cause (A<-B, B<-C, C<-D, C<-E = 4)
    expect((holo.match(/geometry: "edge"/g) || []).length).toBe(4);
    expect(holo).toContain('source: "C"; target: "D"');
  });

  it('lays out causes ABOVE effects (topological depth, no hand coordinates)', () => {
    const holo = buildDecisionHolo(stream);
    const zOf = (id: string) => {
      const m = new RegExp(`object "${id}" \\{[^}]*position: \\[[-\\d.]+, 0, ([-\\d.]+)\\]`).exec(
        holo
      );
      return Number(m![1]);
    };
    // top-down projection: deeper (later) nodes get a LARGER z. A(root) < B < C < D.
    expect(zOf('A')).toBeLessThan(zOf('B'));
    expect(zOf('B')).toBeLessThan(zOf('C'));
    expect(zOf('C')).toBeLessThan(zOf('D'));
    // D and E share a depth (both caused by C) -> same row (z), different x (spread).
    expect(zOf('D')).toBeCloseTo(zOf('E'), 5);
  });

  it('colours nodes by status', () => {
    const holo = buildDecisionHolo(stream);
    expect(holo).toMatch(/object "A"[^}]*color: "#6f3a2f"/); // problem
    expect(holo).toMatch(/object "B"[^}]*color: "#2f6f4f"/); // shipped
    expect(holo).toMatch(/object "C"[^}]*color: "#7a5a2f"/); // bug
  });

  it('renders to native SVG (labels, receipts, edges, arrow marker)', () => {
    const svg = renderDecisionSvg(stream, { title: 'test net' });
    expect(svg).toContain('<svg');
    expect(svg).toContain('>Material realism<');
    expect(svg).toContain('>commit 5ecb0d48b<');
    expect(svg).toContain('marker-end="url(#holo-arrow)"');
    expect(svg).toContain('>test net<'); // title
  });

  it('skips edges to unknown causes and survives cycles', () => {
    const cyclic: DecisionEvent[] = [
      { id: 'X', label: 'x', causes: ['Y', 'ghost'] },
      { id: 'Y', label: 'y', causes: ['X'] },
    ];
    const holo = buildDecisionHolo(cyclic); // must not hang
    expect(holo).toContain('object "X"');
    expect(holo).not.toContain('target: "ghost"');
    // only edges between known nodes survive (X<-Y, Y<-X = 2)
    expect((holo.match(/geometry: "edge"/g) || []).length).toBe(2);
  });
});
