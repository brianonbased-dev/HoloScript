import { describe, expect, it } from 'vitest';
import { parseClaimLedger, diffLedgerCells, rewriteLedgerCells } from '../paper/claimLedger';
import { ingestPaperClaims, queryClaimLinks } from '../paper/claimIngest';
import { ClaimNetworkGraph, type ClaimGraphEdgeKind } from '../ClaimNetworkGraph';

const LEDGER = [
  '# Paper 5 ledger',
  '',
  '## Claims',
  '',
  '| # | Claim | Proven by | Status |',
  '|---|---|---|---|',
  '| 1 | Retrieval works | `HoloScript/r/a.json` | Proven |',
  '| 2 | Bootstrap CI holds | `HoloScript/r/b.json` | Partial (no bootstrap) |',
  '| 3 | Same as above | same file | Not yet checked |',
  '| 4 | Code path | `HoloScript/packages/x/src/A.ts` | Proven |',
].join('\n');

const files: Record<string, string> = {
  'HoloScript/r/a.json': '{"ok":true}',
  'HoloScript/r/b.json': '{"stats":{"bootstrap":false}}',
  'HoloScript/packages/x/src/A.ts': 'export function a() {}',
};
const run = () => ingestPaperClaims({
  paperId: 'p5',
  ledger: { path: 'ai-ecosystem/research/paper-5-data/LEDGER.md', text: LEDGER },
  readFile: (p) => (p in files ? { exists: true, content: files[p] } : { exists: false }),
  gitCommit: 'abc',
});

describe('claim ledger + ingest', () => {
  it('parses rows; "same file" inherits paths', () => {
    const l = parseClaimLedger(LEDGER);
    expect(l.claims.map((c) => c.row)).toEqual([1, 2, 3, 4]);
    expect(l.claims[2].citedPaths).toEqual(['HoloScript/r/b.json']);
  });

  it('creates claim:p5:N nodes with sourced-from and receipt edges pinned by sha256 + commit', () => {
    const r = run();
    expect(r.claimIds).toEqual(['claim:p5:1', 'claim:p5:2', 'claim:p5:3', 'claim:p5:4']);
    const kinds = new Set(r.graph.getEdges().map((e) => e.kind));
    expect(kinds.has('sourced-from')).toBe(true);
    expect(kinds.has('discharged-by')).toBe(true);
    expect(kinds.has('implemented-by')).toBe(true);
    const links = queryClaimLinks(r.graph, { claimId: 'claim:p5:1' });
    expect(links.claims[0].receipts[0]).toMatchObject({ path: 'HoloScript/r/a.json', commit: 'abc' });
    expect(links.claims[0].receipts[0].sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('reports the bootstrap mismatch as partial', () => {
    const c = queryClaimLinks(run().graph, { claimId: 'claim:p5:2' }).claims[0];
    expect(c.status).toBe('partial');
    expect(c.mismatch.map(({ field, expected, actual }) => ({ field, expected, actual }))).toEqual([
      { field: 'bootstrap', expected: true, actual: false },
    ]);
  });

  it('reverse lookup by file path and code symbol link', () => {
    const r = run();
    expect(queryClaimLinks(r.graph, { filePath: 'HoloScript/r/b.json' }).claims.map((c) => c.claimId)).toEqual(['claim:p5:2', 'claim:p5:3']);
    expect(queryClaimLinks(r.graph, { claimId: 'claim:p5:4' }).claims[0].codeSymbols.length).toBe(1);
  });

  it('implemented-by is a registered ClaimGraphEdgeKind', () => {
    const g = new ClaimNetworkGraph();
    g.addNode({ id: 'c', kind: 'claim', label: 'c' } as never);
    g.addNode({ id: 's', kind: 'source', label: 's' } as never);
    const kind: ClaimGraphEdgeKind = 'implemented-by';
    g.addEdge({ from: 'c', to: 's', kind } as never);
    expect(g.getEdges().map((e) => e.kind)).toEqual(['implemented-by']);
  });

  it('generator rewrites only Proven by + Status', () => {
    const r = run();
    const out = rewriteLedgerCells(LEDGER, r.generated);
    const a = LEDGER.split('\n');
    const b = out.split('\n');
    expect(b.length).toBe(a.length);
    a.forEach((line, i) => {
      if (!line.startsWith('| ') || /^\| #/.test(line)) expect(b[i]).toBe(line);
      else expect(b[i].split('|').slice(0, 3)).toEqual(line.split('|').slice(0, 3));
    });
    expect(diffLedgerCells(parseClaimLedger(out), r.generated)).toEqual([]);
  });
});