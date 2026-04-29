/**
 * Lotus Gate 3 — Matrix-derived evidence provider
 *
 * Parses a snapshot of `ai-ecosystem/research/paper-audit-matrix.md`
 * and emits PetalEvidence records for the 16 lotus petals.
 *
 * This is the "Brittney path" for Gate 3: instead of reading a static
 * fixture (the v1 evidence-provider), the parser walks the matrix table
 * row-by-row and translates audit columns into bloom-state primitives.
 * The same `derivePetalBloomState` is then applied to the parser output.
 *
 * Gate 3 measures the agreement rate between this parser-derived path
 * and a hand-curated human-baseline of the same snapshots. Disagreement
 * surfaces parser fragility (the matrix's audit columns are not 1:1 with
 * bloom-state primitives — `stubCount` and `benchmarkTodoCount` need
 * proxies from the available columns).
 *
 * Mapping (matrix paper number/code -> fixture paper_id):
 *   0c  -> cael
 *   1   -> trust-by-replay        (USENIX Sec — formerly "MCP Trust")
 *   2   -> snn
 *   3   -> crdt
 *   4   -> sandboxed-sim
 *   5   -> graphrag
 *   6   -> p2-0-contracted-animation
 *   7   -> p2-1-ik
 *   8   -> p2-2-unified-sim-anim
 *   9   -> p2-3-verifiable-motion
 *   10  -> p3-s1-hs-core-ir
 *   11  -> p3-s2-hsplus-traits
 *   12  -> p3-s3-holo-composition
 *   13  -> p3-center
 *   C2  -> (unmapped — no fixture petal)
 *   UI  -> capstone-notation-cognition
 *
 * `trust-by-construction` (TVCG) is intentionally OFF-MATRIX per the
 * 2026-04-24 refresh ("HELD per I.009"). The parser surfaces it as
 * hasDraft:true, no-stubs, no-benchmark-todos, no-anchors — matching the
 * fixture _note exactly. Older snapshots (pre-2026-04-24) have no TVCG
 * row at all; the parser falls back to the same defaults.
 *
 * @see ../../lib/brittney/lotus/derive-bloom-state.ts — pure derivation
 * @see ../../lib/brittney/lotus/__fixtures__/petal-evidence-snapshot.json — fixture for comparison
 */

import type { PetalEvidence } from '../../lib/brittney/lotus/derive-bloom-state';

/** Matrix row code (`0c`, `1`, `13`, `C2`, `UI`) -> fixture paper_id. */
export const MATRIX_TO_FIXTURE_ID: Record<string, string> = {
  '0c': 'cael',
  '1': 'trust-by-replay',
  '2': 'snn',
  '3': 'crdt',
  '4': 'sandboxed-sim',
  '5': 'graphrag',
  '6': 'p2-0-contracted-animation',
  '7': 'p2-1-ik',
  '8': 'p2-2-unified-sim-anim',
  '9': 'p2-3-verifiable-motion',
  '10': 'p3-s1-hs-core-ir',
  '11': 'p3-s2-hsplus-traits',
  '12': 'p3-s3-holo-composition',
  '13': 'p3-center',
  UI: 'capstone-notation-cognition',
};

/** Petals that the matrix doesn't track — defaults applied. */
export const OFF_MATRIX_PETALS = new Set<string>(['trust-by-construction']);

/** All 16 fixture paper_ids. */
export const ALL_FIXTURE_PAPER_IDS = [
  'trust-by-construction',
  'cael',
  'trust-by-replay',
  'snn',
  'crdt',
  'sandboxed-sim',
  'graphrag',
  'capstone-notation-cognition',
  'p2-0-contracted-animation',
  'p2-1-ik',
  'p2-2-unified-sim-anim',
  'p2-3-verifiable-motion',
  'p3-s1-hs-core-ir',
  'p3-s2-hsplus-traits',
  'p3-s3-holo-composition',
  'p3-center',
];

/** Cell value semantics in matrix audit columns. */
type Mark = 'pass' | 'partial' | 'fail' | 'na' | 'skeleton' | 'unknown';

function classifyMark(cell: string): Mark {
  if (!cell) return 'unknown';
  const c = cell.trim();
  if (c.includes('✅')) return 'pass';
  if (c.includes('🟡')) return 'skeleton';
  if (c.includes('⚠')) return 'partial';
  if (c.includes('❌')) return 'fail';
  if (c.includes('➖')) return 'na';
  return 'unknown';
}

/**
 * Parse the LOC column. Older matrices use `🟡 238` for skeletons; newer
 * use bare numbers. Commas may or may not be present (`1,485` vs `1485`).
 */
function parseLOC(cell: string): { loc: number; isSkeleton: boolean } {
  const isSkeleton = cell.includes('🟡');
  const match = cell.match(/(\d[\d,]*)/);
  const loc = match ? parseInt(match[1].replace(/,/g, ''), 10) : 0;
  return { loc, isSkeleton };
}

/**
 * Parse the Anchor column (`OTS/Base`). Format: `✅/✅`, `✅/❌`, `❌/❌`, etc.
 * Returns the OTS and Base statuses separately.
 */
function parseAnchor(cell: string): { ots: boolean; base: boolean } {
  // Strip whitespace, split on / and read first/second.
  const compact = cell.replace(/\s+/g, '');
  const ots = /✅\/[✅❌]/.test(compact)
    ? true
    : /✅/.test(compact.split('/')[0] || '');
  const baseStr = compact.split('/')[1] || '';
  const base = baseStr.includes('✅');
  return { ots, base };
}

/**
 * Parse the Repro D.011 cell. Newer matrices include `RTX bench` markers.
 * We use this to derive `benchmarkTodoCount` — if the cell shows ❌ or ⚠️
 * for the bench line, we count it as 1 pending benchmark; ✅ means no
 * benchmark todo.
 */
function parseBenchmarkSignal(cell: string): { hasBenchTodo: boolean } {
  // Look for "RTX bench" with a marker.
  const rtxMatch = cell.match(/RTX\s*bench[^✅⚠❌]*([✅⚠❌])/);
  if (rtxMatch) {
    const mark = rtxMatch[1];
    return { hasBenchTodo: mark === '❌' || mark === '⚠' };
  }
  // Older format: cell starts with ✅/⚠/❌ (overall verdict).
  // ❌ = "no benchmark", ⚠️ = "partial benchmark", ✅ = "complete".
  // Treat ❌ and ⚠️ as bench todo present.
  const trimmed = cell.trim();
  if (trimmed.startsWith('✅')) return { hasBenchTodo: false };
  if (trimmed.startsWith('❌') || trimmed.startsWith('⚠')) return { hasBenchTodo: true };
  return { hasBenchTodo: true };
}

/**
 * Parse the Staleness column for open-todo-count.
 * Format: `❌ 5 todo / 0d`, `⚠️ 1 todo / 0d`, `✅ 0 todo / 7d`.
 * Open-todo-count is the proxy for `stubCount` (matrix doesn't report
 * \stub{} markers directly; \todo{} markers are the closest signal).
 */
function parseStalenessTodos(cell: string): number {
  const match = cell.match(/(\d+)\s*todo/);
  return match ? parseInt(match[1], 10) : 0;
}

/**
 * Detect retraction notes (Paper 7 was retired into Paper 8 in 2026-04-24).
 */
function detectRetracted(cell: string): boolean {
  return /retired|RETIRED|retract/i.test(cell);
}

interface ParsedRow {
  code: string; // matrix paper number (`0c`, `1`, `UI`, `C2`, `13`...)
  paperName: string;
  loc: number;
  isSkeleton: boolean;
  empClaims: Mark;
  reproD011: Mark;
  reproRaw: string;
  citations: Mark;
  anchorOts: boolean;
  anchorBase: boolean;
  novelty: Mark;
  threatModel: Mark;
  venueFit: Mark;
  staleness?: string;
  rawRow: string;
  retracted: boolean;
  hasBenchTodo: boolean;
  todoCount: number;
}

/**
 * Pull the Matrix table out of the snapshot. Returns the rows under the
 * `## Matrix` heading, stopping at the next `##` header. Tolerant of
 * blank lines inside the table block (older snapshots have blank lines
 * between table and column-definitions).
 */
function extractMatrixRows(matrixMd: string): string[] {
  const lines = matrixMd.split(/\r?\n/);
  let inMatrix = false;
  let inTable = false;
  const tableLines: string[] = [];
  for (const line of lines) {
    if (/^##\s+Matrix\b/.test(line)) {
      inMatrix = true;
      continue;
    }
    if (inMatrix && /^##\s+/.test(line) && !/^##\s+Matrix\b/.test(line)) {
      // Hit next section.
      break;
    }
    if (!inMatrix) continue;
    // Detect table. Header row starts with `| #`.
    if (/^\|\s*#\s*\|/.test(line)) {
      inTable = true;
      continue;
    }
    if (inTable) {
      // Skip the separator row (`|---|---|...`).
      if (/^\|\s*-+/.test(line)) continue;
      // Stop at the first blank or non-pipe line after the table started.
      if (!line.trim().startsWith('|')) {
        if (line.trim() === '') continue; // tolerate stray blanks
        break;
      }
      tableLines.push(line);
    }
  }
  return tableLines;
}

/**
 * Split a markdown table row into cells. Naive but the matrix never has
 * escaped pipes inside cells (verified by reading 10 snapshots).
 */
function splitRow(row: string): string[] {
  // Strip leading/trailing |, then split on |.
  return row
    .replace(/^\s*\|/, '')
    .replace(/\|\s*$/, '')
    .split('|')
    .map((c) => c.trim());
}

/**
 * Parse a single matrix row into a structured ParsedRow.
 * The matrix has had two column counts in its history:
 *   - 11 columns (2026-04-18 oldest): #, Paper, Target, LOC, Emp.claims,
 *     Repro D.011, Citations, Anchor (OTS/Base), Novelty, Threat model, Venue fit
 *   - 16 columns (2026-04-19+): adds Cal story, Twin test, Decoder cost,
 *     Scaling memo, Staleness
 * We detect by cell count and read accordingly.
 */
function parseMatrixRow(row: string): ParsedRow | null {
  const cells = splitRow(row);
  if (cells.length < 11) return null; // not a data row
  const [code, paperName, , locCell, empClaims, reproD011, citations, anchor, novelty, threatModel, venueFit, ...rest] =
    cells;
  if (!code || code === '#') return null;

  const { loc, isSkeleton } = parseLOC(locCell);
  const { ots, base } = parseAnchor(anchor);
  const { hasBenchTodo } = parseBenchmarkSignal(reproD011);
  const retracted = detectRetracted(reproD011) || detectRetracted(paperName);

  // Staleness lives as the LAST cell when 16 columns are present.
  let staleness: string | undefined;
  let todoCount = 0;
  if (rest.length >= 5) {
    staleness = rest[rest.length - 1];
    todoCount = parseStalenessTodos(staleness);
  } else {
    // Older 11-col matrix: no Staleness column. Fall back to counting
    // todos by parsing the empClaims hint (it sometimes mentions "todo").
    const todoMatch = empClaims.match(/(\d+)\s*⚠?todo/);
    todoCount = todoMatch ? parseInt(todoMatch[1], 10) : 0;
  }

  return {
    code,
    paperName,
    loc,
    isSkeleton,
    empClaims: classifyMark(empClaims),
    reproD011: classifyMark(reproD011),
    reproRaw: reproD011,
    citations: classifyMark(citations),
    anchorOts: ots,
    anchorBase: base,
    novelty: classifyMark(novelty),
    threatModel: classifyMark(threatModel),
    venueFit: classifyMark(venueFit),
    staleness,
    rawRow: row,
    retracted,
    hasBenchTodo,
    todoCount,
  };
}

/**
 * Translate a ParsedRow into PetalEvidence. The translation is the
 * load-bearing decision layer for Gate 3 — change it and the agreement
 * rate changes.
 *
 * Core mapping rules:
 *   - hasDraft        := loc > 0 (any paper code present in matrix means
 *                       draft exists; older skeletons still have LOC>0)
 *   - stubCount       := todoCount (open-\todo{} markers are the matrix's
 *                       proxy for \stub{} markers; matrix doesn't surface
 *                       \stub{} directly per W.103)
 *   - benchmarkTodoCount := 1 if RTX bench is partial/missing, else 0
 *   - otsAnchored     := matrix Anchor cell OTS half is ✅
 *   - baseAnchored    := matrix Anchor cell Base half is ✅
 *   - anchorMismatch  := false (matrix doesn't track active mismatch
 *                       state at row-level; matrix-wide caveat is in the
 *                       2026-04-24 Refresh prose, not row data)
 *   - retracted       := matrix paperName / reproD011 contains "retired"
 *                       or "retract"
 */
export function rowToEvidence(row: ParsedRow, paperId: string, venue: string): PetalEvidence {
  const hasDraft = row.loc > 0;
  return {
    paperId,
    venue,
    hasDraft,
    stubCount: hasDraft ? row.todoCount : 0,
    benchmarkTodoCount: hasDraft && row.hasBenchTodo ? 1 : 0,
    otsAnchored: row.anchorOts,
    baseAnchored: row.anchorBase,
    anchorMismatch: false,
    retracted: row.retracted || undefined,
  };
}

/**
 * Off-matrix petal default — used for `trust-by-construction` and any
 * petal whose row is missing in the snapshot.
 *
 * Per the 2026-04-24 matrix refresh: TVCG is HELD per I.009; intentionally
 * not anchored. The fixture _note matches this: hasDraft:true, no stubs,
 * no benchmark todos, no anchors. We replicate that here.
 */
function offMatrixDefault(paperId: string, venue: string): PetalEvidence {
  if (paperId === 'trust-by-construction') {
    return {
      paperId,
      venue,
      hasDraft: true,
      stubCount: 0,
      benchmarkTodoCount: 0,
      otsAnchored: false,
      baseAnchored: false,
      anchorMismatch: false,
    };
  }
  // For unmatched petals, treat as sealed (no draft).
  return {
    paperId,
    venue,
    hasDraft: false,
    stubCount: 0,
    benchmarkTodoCount: 0,
    otsAnchored: false,
    baseAnchored: false,
    anchorMismatch: false,
  };
}

/** Hardcoded venues per fixture (keep in sync with garden.holo). */
const VENUES: Record<string, string> = {
  'trust-by-construction': 'IEEE TVCG 2026',
  cael: 'AAMAS 2026',
  'trust-by-replay': 'USENIX Security 2026',
  snn: 'NeurIPS 2026',
  crdt: 'ECOOP 2027',
  'sandboxed-sim': 'USENIX Security 2026',
  graphrag: 'ICSE 2027',
  'capstone-notation-cognition': 'UIST 2027',
  'p2-0-contracted-animation': 'SCA 2027',
  'p2-1-ik': 'SIGGRAPH 2027 short / I3D 2027',
  'p2-2-unified-sim-anim': 'SIGGRAPH 2027',
  'p2-3-verifiable-motion': 'SIGGRAPH Asia 2027',
  'p3-s1-hs-core-ir': 'PLDI 2027',
  'p3-s2-hsplus-traits': 'ECOOP 2027',
  'p3-s3-holo-composition': 'I3D 2027',
  'p3-center': 'SIGGRAPH 2028',
};

/**
 * Parse a matrix snapshot (markdown text) into evidence for ALL 16 lotus
 * petals. Returns a Map keyed by fixture paper_id. Off-matrix petals
 * (`trust-by-construction`) get default evidence.
 */
export function parseMatrixSnapshot(matrixMd: string): Map<string, PetalEvidence> {
  const result = new Map<string, PetalEvidence>();
  const tableRows = extractMatrixRows(matrixMd);
  const parsedByCode = new Map<string, ParsedRow>();
  for (const row of tableRows) {
    const parsed = parseMatrixRow(row);
    if (parsed) parsedByCode.set(parsed.code, parsed);
  }

  for (const paperId of ALL_FIXTURE_PAPER_IDS) {
    const venue = VENUES[paperId] ?? 'unknown';
    if (OFF_MATRIX_PETALS.has(paperId)) {
      result.set(paperId, offMatrixDefault(paperId, venue));
      continue;
    }
    // Find matrix code that maps to this paper_id.
    const code = Object.entries(MATRIX_TO_FIXTURE_ID).find(([, pid]) => pid === paperId)?.[0];
    if (!code) {
      // Unmapped petal (shouldn't happen for the 16 in fixture).
      result.set(paperId, offMatrixDefault(paperId, venue));
      continue;
    }
    const row = parsedByCode.get(code);
    if (!row) {
      // Petal not in this snapshot's matrix yet (e.g., older snapshot
      // pre-introduction of a paper). Treat as sealed.
      result.set(paperId, {
        paperId,
        venue,
        hasDraft: false,
        stubCount: 0,
        benchmarkTodoCount: 0,
        otsAnchored: false,
        baseAnchored: false,
        anchorMismatch: false,
      });
      continue;
    }
    result.set(paperId, rowToEvidence(row, paperId, venue));
  }
  return result;
}
