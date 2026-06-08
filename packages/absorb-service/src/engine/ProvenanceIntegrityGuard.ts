/**
 * Provenance Integrity Guard
 *
 * Validates that every cited file:line in a GraphRAG answer resolves to a real
 * span in the absorbed codebase graph. Drops citations that don't resolve,
 * flags them as unresolvable, and rejects the entire answer if zero citations
 * are resolvable.
 *
 * This protects Absorb's core value proposition: answers grounded in real
 * file:line citations (F.069, task cykp).
 */

import type { CodebaseGraph } from './CodebaseGraph';
import type { ExternalSymbolDefinition } from './types';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Citation {
  name: string;
  file: string;
  line: number;
}

export interface ValidatedCitation extends Citation {
  /** Whether the citation resolves to a real span in the graph */
  resolved: boolean;
  /** When resolved, the symbol that matched */
  matchedSymbol?: ExternalSymbolDefinition;
}

export interface ProvenanceGuardResult {
  /** Original citations, each annotated with resolved status */
  citations: ValidatedCitation[];
  /** Citations that resolved to real spans */
  resolved: ValidatedCitation[];
  /** Citations that did NOT resolve (fabricated, stale, or wrong) */
  unresolved: ValidatedCitation[];
  /** Number of resolved citations */
  resolvedCount: number;
  /** Number of unresolved citations */
  unresolvedCount: number;
  /** Whether the answer passes the integrity guard (≥1 resolved citation) */
  passed: boolean;
  /** Reason for guard rejection, if any */
  rejectionReason?: string;
}

// ─── Guard ────────────────────────────────────────────────────────────────────

/**
 * Validate that every cited file:line in a GraphRAG answer resolves to a
 * real symbol span in the absorbed codebase graph.
 *
 * Resolution rules:
 * 1. The file must exist in the graph (known file path).
 * 2. The cited line must fall within [symbol.line, symbol.endLine ?? symbol.line]
 *    for some symbol in that file.
 * 3. If no endLine is available, exact line match is required.
 *
 * Citations that fail resolution are flagged `resolved: false` and removed
 * from the valid set. If ALL citations are unresolvable, the guard rejects
 * the answer (`passed: false`).
 */
export function validateCitations(
  citations: Citation[],
  graph: CodebaseGraph
): ProvenanceGuardResult {
  const validated: ValidatedCitation[] = [];
  const resolved: ValidatedCitation[] = [];
  const unresolved: ValidatedCitation[] = [];

  for (const cit of citations) {
    const symbolsInFile = graph.getSymbolsInFile(cit.file);

    if (symbolsInFile.length === 0) {
      // File not in graph at all
      const vc: ValidatedCitation = { ...cit, resolved: false };
      validated.push(vc);
      unresolved.push(vc);
      continue;
    }

    // Check if cited line falls within any symbol's span in this file
    const matched = symbolsInFile.find((sym) => {
      const startLine = sym.line;
      const endLine = sym.endLine ?? sym.line;
      return cit.line >= startLine && cit.line <= endLine;
    });

    if (matched) {
      const vc: ValidatedCitation = {
        ...cit,
        resolved: true,
        matchedSymbol: matched,
      };
      validated.push(vc);
      resolved.push(vc);
    } else {
      const vc: ValidatedCitation = { ...cit, resolved: false };
      validated.push(vc);
      unresolved.push(vc);
    }
  }

  const passed = resolved.length > 0;
  const result: ProvenanceGuardResult = {
    citations: validated,
    resolved,
    unresolved,
    resolvedCount: resolved.length,
    unresolvedCount: unresolved.length,
    passed,
  };

  if (!passed) {
    result.rejectionReason =
      unresolved.length > 0
        ? `All ${unresolved.length} citation(s) are unresolvable — no cited file:line matches a real span in the absorbed graph`
        : 'No citations provided — answer has no grounding';
  }

  return result;
}

/**
 * Filter an LLMAnswer's citations, keeping only resolved ones.
 * Returns null if the guard rejects the answer (zero resolvable citations).
 */
export function filterAnswerCitations(
  citations: Citation[],
  graph: CodebaseGraph
): { citations: Citation[]; guard: ProvenanceGuardResult } | null {
  const result = validateCitations(citations, graph);
  if (!result.passed) return null;
  return {
    citations: result.resolved.map(({ name, file, line }) => ({ name, file, line })),
    guard: result,
  };
}
