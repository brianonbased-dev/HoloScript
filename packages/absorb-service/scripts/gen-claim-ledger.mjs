#!/usr/bin/env node
// A19 receipt 5: regenerate ONLY the Proven by + Status columns of a LEDGER.md.
// --check prints diffs (each with an explanation) and exits 1 on any unexplained diff.
// Without --check, --write rewrites the file in place; default prints the rewritten ledger.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { defaultRoots, emit, extraEvidenceFrom, loadPaper, parseArgs, receipt, resolveInput } from './lib/paper-cli.mjs';

const startedAt = new Date().toISOString();
const args = parseArgs(process.argv.slice(2));
const target = typeof args.check === 'string' ? args.check : args._[0];
if (!target) { console.error('usage: gen-claim-ledger.mjs [--check] <LEDGER.md>'); process.exit(2); }
const paper = await loadPaper();
const roots = defaultRoots(args);
const ledgerPath = resolveInput(target, roots);
const texPath = resolveInput(typeof args.paper === 'string' ? args.paper : 'research/paper-5-graphrag-forge.tex', roots);
const extra = extraEvidenceFrom(args) ?? {};
const ing = paper.loadPaperClaims({ ledgerPath, texPath, roots, extraEvidence: extra });
const source = readFileSync(ledgerPath, 'utf8');
// PAPER_VOICE: never upgrade a hand status that carries a qualifier, e.g.
// "Partial (conclusion not confirmed)": receipts cannot prove a human caveat away.
const RANK = { 'not-yet': 0, unchecked: 0, partial: 1, proven: 2, other: -1 };
const heldByHand = [];
for (const g of ing.generated) {
  const hand = ing.ledger.claims.find((c) => c.row === g.row);
  if (!hand || !/\(/.test(hand.status)) continue;
  if (RANK[paper.normalizeStatus(g.status)] > RANK[paper.normalizeStatus(hand.status)]) {
    heldByHand.push({ row: g.row, hand: hand.status, graph: g.status, explanation: 'hand qualifier: hand status is stricter than the receipts; hand wins' });
    g.status = hand.status;
  }
}

if (args.check) {
  const diffs = paper.diffLedgerCells(ing.ledger, ing.generated).map((d) => {
    const md = ing.graph.getNode(`${ing.claimIds[0].replace(/\d+$/, '')}${d.row}`)?.metadata ?? {};
    const extraPaths = extra[d.row] ?? [];
    let explanation = null;
    if (d.column === 'Status') {
      const hand = paper.normalizeStatus(d.hand);
      if (hand === 'unchecked') explanation = 'hand row is "not yet checked"; graph reports what the receipts show';
      else if (extraPaths.length) explanation = `closed by new A19 receipt(s): ${extraPaths.join(', ')}`;
      else if ((md.mismatch ?? []).length) explanation = 'receipt field contradicts claim (see mismatch)';
      else if (Number(md.missingEvidence ?? 0) > 0) explanation = `stale: ${md.missingEvidence} cited path(s) missing on disk`;
    } else {
      const handPaths = new Set([...d.hand.matchAll(/`([^`]+)`/g)].map((m) => m[1]));
      const graphPaths = [...d.graph.matchAll(/`([^`]+)`/g)].map((m) => m[1]);
      const added = graphPaths.filter((p) => !handPaths.has(p));
      const dropped = [...handPaths].filter((p) => !graphPaths.includes(p));
      const addedOk = added.every((p) => extraPaths.includes(p));
      const droppedOk = dropped.every((p) => !existsSync(paper.resolveRepoPath(p, roots) ?? '') || !/[\/.]/.test(p));
      if (addedOk && droppedOk) {
        explanation = [added.length && `adds A19 receipt(s) ${added.join(', ')}`, dropped.length && `drops non-file/missing cites ${dropped.join(', ')}`]
          .filter(Boolean).join('; ') || 'hand qualifier text only';
      }
    }
    return { ...d, explanation, explained: explanation !== null };
  });
  const unexplained = diffs.filter((d) => !d.explained);
  emit(receipt(process.argv.slice(1).join(' '), startedAt, { ledger: paper.displayPath(ledgerPath, roots), diffCount: diffs.length, unexplainedCount: unexplained.length, diffs, heldByHand }), args);
  process.exit(unexplained.length ? 1 : 0);
}
const rewritten = paper.rewriteLedgerCells(source, ing.generated);
if (args.write) writeFileSync(ledgerPath, rewritten);
else process.stdout.write(rewritten);