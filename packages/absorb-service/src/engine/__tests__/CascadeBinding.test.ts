import { describe, expect, it } from 'vitest';
import { CascadeBinder, verifyCascadeChain, computeEvidenceHash, canonicalJson, hashCanonical } from '../AnswerProvenance';
import { CASCADE_LAYERS, runCascade, replayAnswer } from '../paper/cascadeReplay';
import { CodebaseGraph } from '../CodebaseGraph';
import { PaperAdapter } from '../adapters/PaperAdapter';

function chain(query = 'q') {
  const b = new CascadeBinder(query);
  b.add('keyword', ['a', 'b']);
  b.add('graph', ['a', 'b', 'c']);
  b.add('embed', ['b', 'a']);
  b.add('llm', { answer: 'x', citations: ['b'] }, 'recorded-extractive-no-model');
  return b.records();
}

async function docGraph() {
  const a = new PaperAdapter();
  const src = '# Retrieval\n\nGraph retrieval with [spec](./spec.md).\n\n## Cascade binding\n\nkeyword graph embed llm\n\n## Replay\n\nreplay envelope\n';
  const tree = await a.parse(src, 'docs/a.md');
  const g = new CodebaseGraph();
  g.buildFromScanResult({
    rootDir: '.', rootDirs: ['.'],
    files: [{ path: 'docs/a.md', language: 'markdown', symbols: a.extractSymbols(tree, 'docs/a.md'), imports: [], calls: [], loc: 10, sizeBytes: src.length }],
    stats: { totalFiles: 1, filesByLanguage: {}, totalSymbols: 0, symbolsByType: {}, totalImports: 0, totalCalls: 0, totalLoc: 10, durationMs: 0, errors: [] },
  } as never);
  return g;
}

describe('CascadeBinding', () => {
  it('chains every layer input to the previous output', () => {
    const l = chain();
    expect(l.map((x) => x.layer)).toEqual([...CASCADE_LAYERS]);
    for (let i = 1; i < l.length; i += 1) expect(l[i].inputHash).toBe(l[i - 1].outputHash);
    expect(verifyCascadeChain(l, { query: 'q', expectedLayers: [...CASCADE_LAYERS] }).ok).toBe(true);
  });

  it.each([0, 1, 2, 3])('tampering layer %i fails at that layer', (i) => {
    const l = chain();
    l[i] = { ...l[i], output: ['tampered'] };
    const v = verifyCascadeChain(l, { query: 'q' });
    expect(v.ok).toBe(false);
    expect(v.failedAt).toBe(i);
    expect(v.failedLayer).toBe(CASCADE_LAYERS[i]);
  });

  it('a re-hashed tampered layer breaks the next link', () => {
    const l = chain();
    l[1] = { ...l[1], output: ['z'], outputHash: hashCanonical(['z']) };
    const v = verifyCascadeChain(l, { query: 'q' });
    expect(v.failedAt).toBe(2);
    expect(v.failedLayer).toBe('embed');
  });

  it('wrong query fails at keyword; wrong layer order is rejected', () => {
    expect(verifyCascadeChain(chain(), { query: 'other' }).failedLayer).toBe('keyword');
    expect(verifyCascadeChain(chain().reverse(), { expectedLayers: [...CASCADE_LAYERS] }).ok).toBe(false);
  });

  it('evidence hash is order independent; canonical JSON sorts keys', () => {
    expect(computeEvidenceHash([{ filePath: 'b', line: 1 }, { filePath: 'a', line: 2 }])).toBe(
      computeEvidenceHash([{ filePath: 'a', line: 2 }, { filePath: 'b', line: 1 }])
    );
    expect(canonicalJson({ b: 1, a: [2, { d: 1, c: 0 }] })).toBe('{"a":[2,{"c":0,"d":1}],"b":1}');
  });

  it('runCascade is deterministic and replays against the same snapshot', async () => {
    const q = 'cascade binding replay';
    const a1 = runCascade(await docGraph(), q, { gitCommitHash: 'c1' });
    const a2 = runCascade(await docGraph(), q, { gitCommitHash: 'c1' });
    expect(a1.envelope).toEqual(a2.envelope);
    expect(a1.results.length).toBeGreaterThan(0);
    expect(a1.envelope.cascadeLayers.map((l) => l.layer)).toEqual([...CASCADE_LAYERS]);
    expect(replayAnswer(await docGraph(), a1, 'c1').pass).toBe(true);
    expect(replayAnswer(await docGraph(), a1, 'c2').sameCommit).toBe(false);
  });
});