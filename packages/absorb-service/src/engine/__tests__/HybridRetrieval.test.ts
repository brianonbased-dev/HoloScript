import { describe, expect, it } from 'vitest';
import {
  fuseHybridScore,
  HybridLexicalIndex,
  scoreLexicalMatch,
} from '../HybridRetrieval';
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
});
