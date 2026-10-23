#!/usr/bin/env node
// A19 receipt 1: ingest a paper + LEDGER into a claim graph.
// node scripts/ingest-papers.mjs --paper <tex> --ledger <LEDGER.md> --out <file> [--receipt-dir HoloScript/research/...]
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { defaultRoots, emit, extraEvidenceFrom, loadPaper, parseArgs, receipt, resolveInput } from './lib/paper-cli.mjs';

const startedAt = new Date().toISOString();
const args = parseArgs(process.argv.slice(2));
if (typeof args.ledger !== 'string') { console.error('--ledger is required'); process.exit(2); }
const paper = await loadPaper();
const roots = defaultRoots(args);
const ledgerPath = resolveInput(args.ledger, roots);
const texPath = typeof args.paper === 'string' ? resolveInput(args.paper, roots) : undefined;
const ing = paper.loadPaperClaims({ ledgerPath, texPath, roots, extraEvidence: extraEvidenceFrom(args) });
const n = ing.ledger.claims.length;
const expected = Array.from({ length: n }, (_, i) => `${ing.claimIds[0]?.replace(/\d+$/, '') ?? 'claim:p0:'}${i + 1}`);
const missing = expected.filter((id) => !ing.graph.getNode(id));
const result = {
  paper: texPath ? paper.displayPath(texPath, roots) : null,
  ledger: paper.displayPath(ledgerPath, roots),
  claimRowsLive: n,
  claimIds: ing.claimIds,
  allClaimsPresent: missing.length === 0 && n > 0,
  missing,
  nodeCount: ing.graph.getNodes().length,
  edgeCount: ing.graph.getEdges().length,
  edgesByKind: ing.graph.getEdges().reduce((a, e) => ((a[e.kind] = (a[e.kind] ?? 0) + 1), a), {}),
  generated: ing.generated,
};
const rec = receipt(process.argv.slice(1).join(' '), startedAt, result);
if (typeof args.out === 'string') {
  const out = resolve(process.cwd(), args.out);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, `${JSON.stringify({ ...rec, graph: ing.graph.toJSON() }, null, 2)}\n`);
}
emit(rec, args);
process.exit(result.allClaimsPresent ? 0 : 1);