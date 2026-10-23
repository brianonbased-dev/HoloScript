/**
 * claimLedger - parse and regenerate a paper claims LEDGER.md (A19).
 *
 * Reads the `## Claims` table (`| # | Claim in the paper | Proven by | Status |`)
 * and the hand-owned "Row 1" block. The generator side rewrites ONLY the
 * `Proven by` and `Status` cells; the claim text and Row 1 stay hand-owned.
 * Deterministic: same bytes in, same rows out.
 */

export interface LedgerClaimRow {
  row: number;
  claim: string;
  provenBy: string;
  status: string;
  /** 1-based line of the table row in the ledger file. */
  line: number;
  /** Backticked repo paths found in the Proven-by cell. */
  citedPaths: string[];
}

export interface ParsedLedger {
  title: string;
  /** Hand-owned Row 1 bullet fields (key -> text), e.g. `target`, `bar`. */
  row1: Record<string, string>;
  claims: LedgerClaimRow[];
  /** 1-based line of the claims table header, or -1. */
  tableLine: number;
}

export type NormalizedStatus = 'proven' | 'partial' | 'not-yet' | 'unchecked' | 'other';

export function normalizeStatus(status: string): NormalizedStatus {
  const s = status.trim().toLowerCase();
  if (s.startsWith('proven')) return 'proven';
  if (s.startsWith('partial')) return 'partial';
  if (s.startsWith('not yet checked')) return 'unchecked';
  if (s.startsWith('not yet')) return 'not-yet';
  return 'other';
}

export function splitTableRow(line: string): string[] {
  const inner = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  const cells: string[] = [];
  let cur = '';
  let inCode = false;
  for (let i = 0; i < inner.length; i += 1) {
    const ch = inner[i];
    if (ch === '`') inCode = !inCode;
    if (ch === '\\' && inner[i + 1] === '|') {
      cur += '|';
      i += 1;
      continue;
    }
    if (ch === '|' && !inCode) {
      cells.push(cur.trim());
      cur = '';
      continue;
    }
    cur += ch;
  }
  cells.push(cur.trim());
  return cells;
}

const PATH_IN_TICKS = /`([^`\s]+\/[^`\s]+\.[A-Za-z0-9]+)`/g;

export function parseClaimLedger(source: string): ParsedLedger {
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  const title = (lines.find((l) => /^#\s/.test(l)) ?? '').replace(/^#\s+/, '').trim();
  const row1: Record<string, string> = {};
  const claims: LedgerClaimRow[] = [];
  let section = '';
  let tableLine = -1;
  let previousPaths: string[] = [];

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const h2 = /^##\s+(.*)$/.exec(line);
    if (h2) {
      section = h2[1].trim().toLowerCase();
      continue;
    }
    if (section.startsWith('row 1')) {
      const m = /^- \*\*([^*]+?):?\*\*:?\s*(.*)$/.exec(line);
      if (m) row1[m[1].trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '')] = m[2].trim();
      continue;
    }
    if (section === 'claims' && line.trim().startsWith('|')) {
      const cells = splitTableRow(line);
      if (cells[0] === '#') {
        tableLine = i + 1;
        continue;
      }
      if (/^-+$/.test(cells[0].replace(/:/g, ''))) continue;
      const row = Number.parseInt(cells[0], 10);
      if (!Number.isFinite(row) || cells.length < 4) continue;
      const provenBy = cells[2];
      let citedPaths = [...provenBy.matchAll(PATH_IN_TICKS)].map((m) => m[1]);
      if (citedPaths.length === 0 && /^same file/i.test(provenBy)) citedPaths = previousPaths;
      if (citedPaths.length) previousPaths = citedPaths;
      claims.push({ row, claim: cells[1], provenBy, status: cells[3], line: i + 1, citedPaths });
    }
  }
  return { title, row1, claims, tableLine };
}

export interface GeneratedLedgerCells {
  row: number;
  provenBy: string;
  status: string;
}

export interface LedgerCellDiff {
  row: number;
  column: 'Proven by' | 'Status';
  hand: string;
  graph: string;
}

/** Compare hand ledger cells against graph-generated cells (Proven by, Status only). */
export function diffLedgerCells(
  hand: ParsedLedger,
  generated: GeneratedLedgerCells[]
): LedgerCellDiff[] {
  const byRow = new Map(generated.map((g) => [g.row, g]));
  const out: LedgerCellDiff[] = [];
  for (const row of hand.claims) {
    const g = byRow.get(row.row);
    if (!g) continue;
    if (normalizeStatus(row.status) !== normalizeStatus(g.status)) {
      out.push({ row: row.row, column: 'Status', hand: row.status, graph: g.status });
    }
    const handPaths = [...row.citedPaths].sort().join(',');
    const graphPaths = [...g.provenBy.matchAll(PATH_IN_TICKS)].map((m) => m[1]).sort().join(',');
    if (handPaths !== graphPaths) {
      out.push({ row: row.row, column: 'Proven by', hand: row.provenBy, graph: g.provenBy });
    }
  }
  return out;
}

/** Rewrite only the Proven-by and Status cells of the claims table. */
export function rewriteLedgerCells(source: string, generated: GeneratedLedgerCells[]): string {
  const parsed = parseClaimLedger(source);
  const byRow = new Map(generated.map((g) => [g.row, g]));
  const eol = source.includes('\r\n') ? '\r\n' : '\n';
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  for (const row of parsed.claims) {
    const g = byRow.get(row.row);
    if (!g) continue;
    const esc = (s: string) => s.replace(/\|/g, '\\|');
    lines[row.line - 1] = `| ${row.row} | ${row.claim} | ${esc(g.provenBy)} | ${esc(g.status)} |`;
  }
  return lines.join(eol);
}