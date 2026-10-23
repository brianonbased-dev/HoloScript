/**
 * claimIngest - build ClaimNetworkGraph claim nodes for a paper from its
 * LEDGER.md (+ optional .tex), link them to receipt files and code symbols,
 * and answer `holo_claim_links` queries (A19). Our own code (PAPER_VOICE 0b).
 *
 * Node IDs (deterministic):
 *   claim:<paper>:<row>          kind 'claim'
 *   paper:<paper> / ledger:<paper> kind 'source'  (role paper|ledger)
 *   loc:<paper>:<file>:L<line>   kind 'source'  (role location)
 *   receipt:<repoPath>           kind 'source'  (role receipt; sha256 + commit)
 *   code:<SymbolObjectId>        kind 'source'  (role code-symbol)
 * Edges (claim -> target): sourced-from (location), discharged-by (receipt,
 * no mismatch), supports (receipt with mismatch, or non-JSON evidence),
 * implemented-by (code symbol).
 *
 * File access is injected (`readFile`) so this stays pure and testable.
 */

import { ClaimNetworkGraph, type ClaimGraphNode, type ClaimProofStatus } from '../ClaimNetworkGraph';
import { makeSymbolObjectId } from '../SymbolObjectId';
import { sha256Hex } from '../AnswerProvenance';
import { parseClaimLedger, normalizeStatus, type ParsedLedger, type GeneratedLedgerCells } from './claimLedger';
import { parseTexStructure } from './texStructure';
import type { ExternalSymbolDefinition } from '../types';

export interface ClaimFieldRule {
  /** Applies when the claim text matches. */
  when: RegExp;
  field: string;
  expected: unknown;
}

/** Field checks: receipt exists but a field contradicts the claim. Kept small and explicit. */
export const DEFAULT_CLAIM_FIELD_RULES: ClaimFieldRule[] = [
  { when: /bootstrap/i, field: 'bootstrap', expected: true },
];

export interface ClaimMismatch {
  field: string;
  expected: unknown;
  actual: unknown;
  receipt: string;
}

export interface ReadResult {
  exists: boolean;
  content?: string | Uint8Array;
}

export interface PaperIngestInput {
  paperId: string;
  ledger: { path: string; text: string };
  tex?: { path: string; text: string };
  /** Reads a repo-relative path as written in the ledger (e.g. `HoloScript/research/...`). */
  readFile: (repoPath: string) => ReadResult;
  gitCommit: string | null;
  /** Extra evidence per claim row (e.g. new replay/binding receipts). */
  extraEvidence?: Record<number, string[]>;
  rules?: ClaimFieldRule[];
}

export interface PaperIngestResult {
  graph: ClaimNetworkGraph;
  ledger: ParsedLedger;
  claimIds: string[];
  generated: GeneratedLedgerCells[];
}

export function paperIdFromPath(path: string): string {
  const m = /paper-(\d+)/i.exec(path.replace(/\\/g, '/'));
  return m ? `p${m[1]}` : 'p0';
}

function findField(value: unknown, field: string): { found: boolean; value?: unknown } {
  const queue: unknown[] = [value];
  while (queue.length) {
    const cur = queue.shift();
    if (cur && typeof cur === 'object') {
      if (!Array.isArray(cur) && Object.prototype.hasOwnProperty.call(cur, field)) {
        return { found: true, value: (cur as Record<string, unknown>)[field] };
      }
      const entries = Array.isArray(cur) ? cur : Object.keys(cur).sort().map((k) => (cur as Record<string, unknown>)[k]);
      queue.push(...entries);
    }
  }
  return { found: false };
}

function toText(content: string | Uint8Array | undefined): string {
  if (content === undefined) return '';
  return typeof content === 'string' ? content : new TextDecoder().decode(content);
}

const toProofStatus = (s: string): ClaimProofStatus =>
  s === 'proven' ? 'proven' : s === 'partial' ? 'labeled' : 'unverified';

function isCodePath(p: string): boolean {
  return /\.(ts|tsx|js|mjs|cjs|py|rs|go)$/.test(p) && !/\/research\//.test(p);
}

function locateInTex(claim: string, texLines: string[]): number | null {
  const nums = claim.match(/\d+\.\d+/g) ?? claim.match(/\b\d{2,}\b/g) ?? [];
  if (nums.length === 0) return null;
  for (let i = 0; i < texLines.length; i += 1) {
    if (texLines[i].trimStart().startsWith('%')) continue;
    if (nums.every((n) => texLines[i].includes(n))) return i + 1;
  }
  for (let i = 0; i < texLines.length; i += 1) {
    if (!texLines[i].trimStart().startsWith('%') && texLines[i].includes(nums[0] as string)) return i + 1;
  }
  return null;
}

export function ingestPaperClaims(input: PaperIngestInput): PaperIngestResult {
  const rules = input.rules ?? DEFAULT_CLAIM_FIELD_RULES;
  const p = input.paperId;
  const ledger = parseClaimLedger(input.ledger.text);
  const graph = new ClaimNetworkGraph();
  const norm = (s: string) => s.replace(/\\/g, '/');

  graph.addNode({ id: `ledger:${p}`, kind: 'source', label: norm(input.ledger.path), metadata: { role: 'ledger', path: norm(input.ledger.path), sha256: sha256Hex(input.ledger.text) } });
  const tex = input.tex ? parseTexStructure(input.tex.text) : null;
  const texLines = input.tex ? input.tex.text.replace(/\r\n?/g, '\n').split('\n') : [];
  if (input.tex) {
    graph.addNode({ id: `paper:${p}`, kind: 'source', label: norm(input.tex.path), metadata: { role: 'paper', path: norm(input.tex.path), sha256: sha256Hex(input.tex.text), sections: tex!.sections.length } });
  }

  const claimIds: string[] = [];
  const generated: GeneratedLedgerCells[] = [];

  for (const row of ledger.claims) {
    const id = `claim:${p}:${row.row}`;
    claimIds.push(id);
    const evidence = [...row.citedPaths, ...(input.extraEvidence?.[row.row] ?? [])];
    const mismatches: ClaimMismatch[] = [];
    const receipts: string[] = [];
    const code: string[] = [];
    let missing = 0;

    const node: ClaimGraphNode = { id, kind: 'claim', label: row.claim, claimKind: 'paper-claim', ownerId: p, metadata: { row: row.row, handStatus: row.status, handProvenBy: row.provenBy, ledgerLine: row.line } };
    graph.addNode(node);

    const locId = `loc:${p}:ledger:L${row.line}`;
    graph.addNode({ id: locId, kind: 'source', metadata: { role: 'location', path: norm(input.ledger.path), line: row.line } });
    graph.addEdge({ from: id, to: locId, kind: 'sourced-from', metadata: { via: 'ledger-row' } });
    if (tex) {
      const line = locateInTex(row.claim, texLines);
      if (line !== null) {
        const section = [...tex.sections].reverse().find((s) => s.lineStart <= line);
        const texLoc = `loc:${p}:tex:L${line}`;
        if (!graph.getNode(texLoc)) {
          graph.addNode({ id: texLoc, kind: 'source', metadata: { role: 'location', path: norm(input.tex!.path), line, section: section?.slug ?? null } });
        }
        graph.addEdge({ from: id, to: texLoc, kind: 'sourced-from', metadata: { via: 'tex-number-match' } });
      }
    }

    for (const raw of evidence) {
      const path = norm(raw);
      const read = input.readFile(path);
      if (!read.exists) {
        missing += 1;
        continue;
      }
      if (isCodePath(path)) {
        const fileName = path.split('/').pop() ?? path;
        const sym = { name: fileName, type: 'file', filePath: path, line: 1, column: 0, language: 'typescript', visibility: 'public' } as ExternalSymbolDefinition;
        const codeId = `code:${makeSymbolObjectId(sym)}`;
        if (!graph.getNode(codeId)) {
          graph.addNode({ id: codeId, kind: 'source', label: path, metadata: { role: 'code-symbol', path, symbolObjectId: makeSymbolObjectId(sym), sha256: sha256Hex(read.content ?? ''), commit: input.gitCommit } });
        }
        graph.addEdge({ from: id, to: codeId, kind: 'implemented-by' });
        code.push(path);
        continue;
      }
      const rid = `receipt:${path}`;
      const text = toText(read.content);
      let rowMismatches: ClaimMismatch[] = [];
      if (/\.json$/i.test(path)) {
        try {
          const json = JSON.parse(text);
          for (const rule of rules) {
            if (!rule.when.test(row.claim)) continue;
            const f = findField(json, rule.field);
            if (f.found && f.value !== rule.expected) {
              rowMismatches.push({ field: rule.field, expected: rule.expected, actual: f.value, receipt: path });
            }
          }
        } catch {
          rowMismatches = [{ field: '(json)', expected: 'parseable JSON', actual: 'parse error', receipt: path }];
        }
      }
      if (!graph.getNode(rid)) {
        graph.addNode({ id: rid, kind: 'source', label: path, metadata: { role: 'receipt', path, sha256: sha256Hex(read.content ?? ''), commit: input.gitCommit } });
      }
      graph.addEdge({ from: id, to: rid, kind: rowMismatches.length ? 'supports' : 'discharged-by', metadata: rowMismatches.length ? { mismatch: rowMismatches } : undefined });
      mismatches.push(...rowMismatches);
      receipts.push(path);
    }

    let status: string;
    if (receipts.length && mismatches.length === 0) status = 'Proven';
    else if (receipts.length || code.length) status = 'Partial';
    else status = 'Not yet';
    const provenBy = [...receipts, ...code].length
      ? [...receipts, ...code].map((x) => `\`${x}\``).join('; ') + (mismatches.length ? ` (mismatch: ${mismatches.map((m) => `${m.field}=${JSON.stringify(m.actual)}`).join(', ')})` : '')
      : 'none found';
    node.proofStatus = toProofStatus(normalizeStatus(status));
    node.metadata = { ...node.metadata, generatedStatus: status, generatedProvenBy: provenBy, mismatch: mismatches, receipts, code, missingEvidence: missing };
    graph.addNode(node);
    generated.push({ row: row.row, provenBy, status });
  }
  return { graph, ledger, claimIds, generated };
}

export interface ClaimLinksResult {
  query: Record<string, string>;
  claims: Array<{
    claimId: string;
    claim: string;
    status: 'proven' | 'partial' | 'not-yet';
    handStatus: string;
    receipts: Array<{ path: string; sha256: string; commit: string | null; edge: string }>;
    codeSymbols: Array<{ path: string; symbolObjectId: string }>;
    locations: Array<{ path: string; line: number }>;
    mismatch: Array<{ field: string; expected: unknown; actual: unknown; receipt: string }>;
  }>;
}

function describeClaim(graph: ClaimNetworkGraph, claimId: string): ClaimLinksResult['claims'][number] | null {
  const node = graph.getNode(claimId);
  if (!node || node.kind !== 'claim') return null;
  const md = node.metadata ?? {};
  const receipts: ClaimLinksResult['claims'][number]['receipts'] = [];
  const codeSymbols: ClaimLinksResult['claims'][number]['codeSymbols'] = [];
  const locations: ClaimLinksResult['claims'][number]['locations'] = [];
  for (const e of graph.getEdges({ from: claimId })) {
    const t = graph.getNode(e.to)?.metadata ?? {};
    if (e.kind === 'sourced-from') locations.push({ path: String(t.path), line: Number(t.line) });
    else if (e.kind === 'implemented-by') codeSymbols.push({ path: String(t.path), symbolObjectId: String(t.symbolObjectId) });
    else receipts.push({ path: String(t.path), sha256: String(t.sha256), commit: (t.commit as string) ?? null, edge: e.kind });
  }
  const gen = normalizeStatus(String(md.generatedStatus ?? ''));
  return {
    claimId,
    claim: node.label ?? '',
    status: gen === 'proven' ? 'proven' : gen === 'partial' ? 'partial' : 'not-yet',
    handStatus: String(md.handStatus ?? ''),
    receipts,
    codeSymbols,
    locations,
    mismatch: ((md.mismatch as ClaimMismatch[]) ?? []).map((m) => ({ ...m })),
  };
}

/** holo_claim_links core: {claimId} -> links; {filePath|symbol} -> every claim citing it. */
export function queryClaimLinks(
  graph: ClaimNetworkGraph,
  q: { claimId?: string; filePath?: string; symbol?: string }
): ClaimLinksResult {
  const query: Record<string, string> = {};
  if (q.claimId) {
    query.claimId = q.claimId;
    const c = describeClaim(graph, q.claimId);
    return { query, claims: c ? [c] : [] };
  }
  const needle = (q.filePath ?? q.symbol ?? '').replace(/\\/g, '/');
  if (q.filePath) query.filePath = needle;
  if (q.symbol) query.symbol = needle;
  const matches = new Set<string>();
  for (const e of graph.getEdges()) {
    const t = graph.getNode(e.to)?.metadata ?? {};
    const hay = [t.path, t.symbolObjectId].filter(Boolean).map(String);
    if (needle && hay.some((h) => h === needle || h.endsWith(`/${needle}`) || h.includes(needle))) {
      if (graph.getNode(e.from)?.kind === 'claim') matches.add(e.from);
    }
  }
  const claims = [...matches].sort().map((id) => describeClaim(graph, id)!).filter(Boolean);
  return { query, claims };
}