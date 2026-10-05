import { describe, expect, it } from 'vitest';
import { fuseHybridScore, HybridLexicalIndex, scoreLexicalMatch } from '../HybridRetrieval';
import type { ExternalSymbolDefinition } from '../types';

function symbol(overrides: Partial<ExternalSymbolDefinition> = {}): ExternalSymbolDefinition {
  return {
    name: 'safe-commit.ps1',
    type: 'file',
    language: 'plaintext',
    visibility: 'internal',
    filePath: 'scripts/safe-commit.ps1',
    line: 1,
    column: 0,
    ...overrides,
  };
}

describe('HoloAbsorb hybrid retrieval scoring', () => {
  it('recognizes a named kebab-case file inside a longer agent query', () => {
    const match = scoreLexicalMatch(
      'safe-commit atomic wrapper that uses git commit --only with explicit paths',
      symbol(),
      'plaintext file safe-commit.ps1 in scripts/safe-commit.ps1'
    );

    expect(match.exactMatch).toBe(true);
    expect(match.matchKind).toBe('exact-name');
    expect(match.score).toBeGreaterThan(0.75);
    expect(fuseHybridScore(0.1, match.score, match.exactMatch)).toBeGreaterThan(0.99);
  });

  it('matches camel-case symbols without requiring the caller to know casing', () => {
    const match = scoreLexicalMatch(
      'graph rag engine',
      symbol({
        name: 'GraphRAGEngine',
        type: 'class',
        language: 'typescript',
        filePath: 'src/engine/GraphRAGEngine.ts',
      })
    );

    expect(match).toMatchObject({
      exactMatch: true,
      matchKind: 'exact-name',
    });
  });

  it('does not label a generic one-token path stem exact inside prose', () => {
    const match = scoreLexicalMatch(
      'semantic search index for code',
      symbol({
        name: 'index.ts',
        language: 'typescript',
        filePath: 'src/index.ts',
      })
    );

    expect(match.exactMatch).toBe(false);
    expect(match.matchKind).toBe('lexical');
  });

  it('prioritizes the earliest named phrase and does not inflate repeated query tokens', () => {
    const index = new HybridLexicalIndex([
      { symbol: symbol() },
      {
        symbol: symbol({
          name: 'gitCommit',
          type: 'function',
          language: 'typescript',
          filePath: 'src/git-commit.ts',
        }),
      },
    ]);
    const scores = index.score(
      'safe-commit atomic wrapper that uses git commit --only with explicit paths'
    );

    expect(scores.get(0)?.exactMatch).toBe(true);
    expect(scores.get(1)?.exactMatch).toBe(true);
    expect(scores.get(0)?.score).toBeGreaterThan(scores.get(1)?.score ?? 0);
    expect(scores.get(0)?.score).toBeLessThanOrEqual(1);
    expect(scores.get(1)?.score).toBeLessThanOrEqual(1);
  });

  it('weights words by how rare they are, so a one-word name like `code` is not a near-exact hit for prose', () => {
    const ts = (name: string, filePath: string) =>
      symbol({ name, type: 'function', language: 'typescript', filePath });
    const entries = [
      { symbol: ts('buildWorktreeFingerprintFreshnessStatus', 'src/mcp/tools.ts') },
      // "code" is a common name: 40 components each hold a value named code.
      ...Array.from({ length: 40 }, (_, i) => ({ symbol: ts('code', `src/ui/Panel${i}.tsx`) })),
      ...Array.from({ length: 40 }, (_, i) => ({ symbol: ts(`render${i}`, `src/ui/View${i}.tsx`) })),
    ];
    const scores = new HybridLexicalIndex(entries).score(
      'how does the code decide whether the worktree fingerprint freshness is current'
    );
    const freshness = scores.get(0)?.score ?? 0;
    const commonName = scores.get(1)?.score ?? 0;
    expect(freshness).toBeGreaterThan(2 * commonName);
    expect(commonName).toBeLessThan(0.25);
  });

  it('fuses as a probabilistic OR, so strong word evidence beats a slightly higher flat vector score', () => {
    // Measured on HoloScript 2026-10-05: an unrelated trait handler at v=0.76
    // with no word evidence outranked the right function at v=0.69, l=0.63.
    expect(fuseHybridScore(0.69, 0.63, false)).toBeGreaterThan(fuseHybridScore(0.76, 0, false));
    expect(fuseHybridScore(0.69, 0.63, false)).toBeCloseTo(1 - 0.31 * 0.37, 4);
    expect(fuseHybridScore(0.8, 0, false)).toBe(0.8);
  });
});
