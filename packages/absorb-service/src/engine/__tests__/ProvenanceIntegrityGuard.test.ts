/**
 * Provenance Integrity Guard — adversarial test suite (F.069)
 *
 * Validates that every cited file:line in a GraphRAG answer resolves to a
 * real span in the absorbed codebase graph. The guard must:
 * 1. Flag fabricated citations (file not in graph, or line not in any symbol span)
 * 2. Reject answers with zero resolvable citations
 * 3. Accept answers where at least one citation resolves
 * 4. Handle exact line match when endLine is absent
 */

import { describe, it, expect } from 'vitest';
import { validateCitations, filterAnswerCitations, type Citation } from '../ProvenanceIntegrityGuard';
import type { CodebaseGraph } from '../CodebaseGraph';

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Build a minimal CodebaseGraph stub that responds to getSymbolsInFile().
 * We only need the query interface; no graph construction needed.
 */
function makeGraphStub(
  fileSymbols: Record<string, Array<{ name: string; line: number; endLine?: number }>>,
): CodebaseGraph {
  const symbolsByFile = new Map<string, Array<{ name: string; line: number; endLine?: number }>>();
  for (const [file, syms] of Object.entries(fileSymbols)) {
    symbolsByFile.set(file, syms);
  }

  return {
    getSymbolsInFile: (filePath: string) => {
      const syms = symbolsByFile.get(filePath) ?? [];
      return syms.map((s) => ({
        name: s.name,
        type: 'function' as const,
        language: 'typescript' as const,
        visibility: 'public' as const,
        filePath,
        line: s.line,
        endLine: s.endLine,
        column: 0,
      }));
    },
  } as unknown as CodebaseGraph;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ProvenanceIntegrityGuard', () => {
  it('flags a fabricated citation whose file does not exist in the graph', () => {
    const graph = makeGraphStub({
      'packages/core/src/index.ts': [
        { name: 'main', line: 1, endLine: 10 },
      ],
    });

    const result = validateCitations(
      [{ name: 'fakeFn', file: 'nonexistent/file.ts', line: 42 }],
      graph,
    );

    expect(result.passed).toBe(false);
    expect(result.unresolvedCount).toBe(1);
    expect(result.resolvedCount).toBe(0);
    expect(result.unresolved[0]!.name).toBe('fakeFn');
    expect(result.rejectionReason).toContain('unresolvable');
  });

  it('flags a citation whose line falls outside all symbol spans in the file', () => {
    const graph = makeGraphStub({
      'packages/core/src/parser.ts': [
        { name: 'parseExpression', line: 10, endLine: 25 },
        { name: 'tokenize', line: 30, endLine: 45 },
      ],
    });

    // Line 99 is not within any symbol span
    const result = validateCitations(
      [{ name: 'parseExpression', file: 'packages/core/src/parser.ts', line: 99 }],
      graph,
    );

    expect(result.passed).toBe(false);
    expect(result.unresolvedCount).toBe(1);
    expect(result.rejectionReason).toContain('unresolvable');
  });

  it('rejects an answer with zero citations (no grounding at all)', () => {
    const graph = makeGraphStub({});
    const result = validateCitations([], graph);

    expect(result.passed).toBe(false);
    expect(result.rejectionReason).toContain('No citations');
  });

  it('resolves a citation whose line falls within a known symbol span', () => {
    const graph = makeGraphStub({
      'packages/core/src/compiler.ts': [
        { name: 'compileToTarget', line: 15, endLine: 40 },
      ],
    });

    // Line 20 is within [15, 40]
    const result = validateCitations(
      [{ name: 'compileToTarget', file: 'packages/core/src/compiler.ts', line: 20 }],
      graph,
    );

    expect(result.passed).toBe(true);
    expect(result.resolvedCount).toBe(1);
    expect(result.resolved[0]!.matchedSymbol!.name).toBe('compileToTarget');
  });

  it('requires exact line match when endLine is absent', () => {
    const graph = makeGraphStub({
      'packages/core/src/utils.ts': [
        { name: 'helper', line: 5 }, // no endLine → exact match only
      ],
    });

    // Exact match works
    const exact = validateCitations(
      [{ name: 'helper', file: 'packages/core/src/utils.ts', line: 5 }],
      graph,
    );
    expect(exact.passed).toBe(true);
    expect(exact.resolvedCount).toBe(1);

    // Off-by-one fails when there's no span
    const offByOne = validateCitations(
      [{ name: 'helper', file: 'packages/core/src/utils.ts', line: 6 }],
      graph,
    );
    expect(offByOne.resolvedCount).toBe(0);
    expect(offByOne.unresolvedCount).toBe(1);
  });

  it('accepts an answer with mixed resolved and unresolved citations', () => {
    const graph = makeGraphStub({
      'packages/core/src/real.ts': [
        { name: 'realFn', line: 10, endLine: 20 },
      ],
    });

    const result = validateCitations(
      [
        { name: 'realFn', file: 'packages/core/src/real.ts', line: 15 }, // resolves
        { name: 'fakeFn', file: 'packages/core/src/fake.ts', line: 1 }, // file not in graph
      ],
      graph,
    );

    expect(result.passed).toBe(true);
    expect(result.resolvedCount).toBe(1);
    expect(result.unresolvedCount).toBe(1);
    expect(result.resolved[0]!.name).toBe('realFn');
    expect(result.unresolved[0]!.name).toBe('fakeFn');
  });

  it('rejects when all citations fail resolution despite a non-empty graph', () => {
    const graph = makeGraphStub({
      'packages/core/src/exists.ts': [
        { name: 'someFn', line: 5, endLine: 10 },
      ],
    });

    // All citations point to wrong lines in an existing file
    const result = validateCitations(
      [
        { name: 'someFn', file: 'packages/core/src/exists.ts', line: 999 },
        { name: 'otherFn', file: 'packages/core/src/exists.ts', line: 888 },
      ],
      graph,
    );

    expect(result.passed).toBe(false);
    expect(result.unresolvedCount).toBe(2);
    expect(result.resolvedCount).toBe(0);
  });

  it('resolves citation at the exact start line of a span', () => {
    const graph = makeGraphStub({
      'packages/engine/src/sim.ts': [
        { name: 'simulate', line: 100, endLine: 150 },
      ],
    });

    const result = validateCitations(
      [{ name: 'simulate', file: 'packages/engine/src/sim.ts', line: 100 }],
      graph,
    );

    expect(result.passed).toBe(true);
    expect(result.resolvedCount).toBe(1);
  });

  it('resolves citation at the exact end line of a span', () => {
    const graph = makeGraphStub({
      'packages/engine/src/sim.ts': [
        { name: 'simulate', line: 100, endLine: 150 },
      ],
    });

    const result = validateCitations(
      [{ name: 'simulate', file: 'packages/engine/src/sim.ts', line: 150 }],
      graph,
    );

    expect(result.passed).toBe(true);
    expect(result.resolvedCount).toBe(1);
  });

  // ── filterAnswerCitations ──────────────────────────────────────────────

  it('filterAnswerCitations returns null when all citations are unresolvable', () => {
    const graph = makeGraphStub({});
    const result = filterAnswerCitations(
      [{ name: 'x', file: 'nope.ts', line: 1 }],
      graph,
    );

    expect(result).toBeNull();
  });

  it('filterAnswerCitations returns only resolved citations when some pass', () => {
    const graph = makeGraphStub({
      'packages/core/src/real.ts': [
        { name: 'realFn', line: 10, endLine: 20 },
      ],
    });

    const result = filterAnswerCitations(
      [
        { name: 'realFn', file: 'packages/core/src/real.ts', line: 15 },
        { name: 'fakeFn', file: 'nope.ts', line: 1 },
      ],
      graph,
    );

    expect(result).not.toBeNull();
    expect(result!.citations).toHaveLength(1);
    expect(result!.citations[0]!.name).toBe('realFn');
    expect(result!.guard.resolvedCount).toBe(1);
    expect(result!.guard.unresolvedCount).toBe(1);
  });

  it('injecting a fabricated citation into an otherwise valid answer flags it', () => {
    // F.069 adversarial test: inject a fabricated citation and verify the guard
    // catches it while preserving the real citation
    const graph = makeGraphStub({
      'packages/absorb-service/src/engine/GraphRAGEngine.ts': [
        { name: 'queryWithLLM', line: 252, endLine: 299 },
        { name: 'handleAskCodebase', line: 212, endLine: 389 },
      ],
    });

    // Real citation + fabricated citation injected
    const citations: Citation[] = [
      { name: 'queryWithLLM', file: 'packages/absorb-service/src/engine/GraphRAGEngine.ts', line: 260 },
      // FABRICATED: this file doesn't exist in the graph
      { name: 'neverExisted', file: 'packages/absorb-service/src/engine/FakeFile.ts', line: 1 },
      // FABRICATED: right file, but line 9999 is outside any symbol span
      { name: 'queryWithLLM', file: 'packages/absorb-service/src/engine/GraphRAGEngine.ts', line: 9999 },
    ];

    const result = validateCitations(citations, graph);

    // The real citation resolves
    expect(result.passed).toBe(true);
    expect(result.resolvedCount).toBe(1);
    expect(result.resolved[0]!.name).toBe('queryWithLLM');

    // Both fabricated citations are flagged
    expect(result.unresolvedCount).toBe(2);
    expect(result.unresolved.map((c) => c.line)).toEqual([1, 9999]);
  });
});