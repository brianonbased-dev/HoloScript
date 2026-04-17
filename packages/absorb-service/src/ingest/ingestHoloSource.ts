/**
 * ingestHoloSource — canonical entry point for `.holo` / `.hsplus` intake.
 *
 * This is the sanctioned dogfooding path enforced by NORTH_STAR DT-14 and
 * the `holoscript/no-regex-hs-parsing` ESLint rule. Every absorb-service
 * consumer that reads HoloScript source SHOULD route through this function
 * rather than hand-rolling regex / split() / tokenization.
 *
 * The function:
 *   1. Parses the source via `@holoscript/core` (`parseHolo` / `parseHoloPartial`).
 *   2. Builds a ReferenceGraph natively from the HoloComposition AST,
 *      preserving byte-precise `loc` ranges on every definition.
 *   3. Returns `{ ast, graph, errors, warnings }` with `errors.length === 0`
 *      indicating a clean parse.
 *
 * Partial mode (`tolerant: true`, default) never throws — useful for REPL,
 * LSP, and live-preview contexts. Strict mode uses `parseHolo` and surfaces
 * all parse errors without constructing a graph.
 *
 * @see NORTH_STAR.md DT-14
 * @see packages/absorb-service/src/analysis/ReferenceGraph.ts
 * @see memory/feedback_no-regex-hs-parsing.md
 */

import { parseHolo } from '@holoscript/core';
import type { HoloComposition, HoloParseError } from '@holoscript/core';
import { ReferenceGraph } from '../analysis/ReferenceGraph';

/**
 * Structural shape for parser warnings — mirrors `HoloParseWarning` in
 * `@holoscript/core` without requiring the type to be re-exported from
 * the public barrel (it is, in the current source, but not yet in
 * the hand-crafted `dist/index.d.ts`).
 */
export interface IngestHoloSourceWarning {
  message: string;
  loc?: { line: number; column: number };
}

export interface IngestHoloSourceOptions {
  /**
   * File path to attribute definitions to. Defaults to 'input.holo'.
   */
  filePath?: string;
  /**
   * When true (default), uses `parseHoloPartial` — never throws, returns
   * a best-effort AST even on malformed input. Set to false for strict
   * mode (CI gates, batch pipelines) where any parse error should halt.
   */
  tolerant?: boolean;
  /**
   * When true (default), the returned graph is finalized — edges built,
   * entry points identified. Set to false when ingesting multiple files
   * into the same graph; the caller must invoke `graph.finalize()` after
   * the last file.
   */
  finalize?: boolean;
  /**
   * Reuse an existing graph for multi-file ingestion. When omitted,
   * a fresh `ReferenceGraph` is allocated.
   */
  graph?: ReferenceGraph;
}

export interface IngestHoloSourceResult {
  ast: HoloComposition | null;
  graph: ReferenceGraph;
  errors: HoloParseError[];
  warnings: IngestHoloSourceWarning[];
  /**
   * True when the parse produced at least one error (graph may still
   * be populated with partial definitions in tolerant mode).
   */
  partial: boolean;
}

/**
 * Parse HoloScript source and build a reference graph.
 *
 * Routes through `parseHolo` with `tolerant: true` (default) so the
 * caller never throws on incomplete input — the REPL / LSP / live-preview
 * contract. Set `tolerant: false` for strict CI gates.
 */
export function ingestHoloSource(
  source: string,
  options: IngestHoloSourceOptions = {}
): IngestHoloSourceResult {
  const filePath = options.filePath ?? 'input.holo';
  const tolerant = options.tolerant ?? true;
  const shouldFinalize = options.finalize ?? true;
  const graph = options.graph ?? new ReferenceGraph();

  const parseResult = parseHolo(source, { locations: true, tolerant });
  const ast = parseResult.ast ?? null;
  if (ast) {
    graph.buildFromHoloComposition(ast, filePath);
  }

  if (shouldFinalize) {
    graph.finalize();
  }

  return {
    ast,
    graph,
    errors: parseResult.errors ?? [],
    warnings: (parseResult.warnings ?? []) as IngestHoloSourceWarning[],
    partial: (parseResult.errors?.length ?? 0) > 0,
  };
}
