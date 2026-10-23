#!/usr/bin/env node
// A19 receipt 2: node scripts/claim-links.mjs claim:p5:4 [--ledger ...] [--paper ...]
//                node scripts/claim-links.mjs --file <repoPath> | --symbol <name>
import { defaultRoots, emit, extraEvidenceFrom, loadPaper, parseArgs, receipt, resolveInput } from './lib/paper-cli.mjs';

const startedAt = new Date().toISOString();
const args = parseArgs(process.argv.slice(2));
const paper = await loadPaper();
const roots = defaultRoots(args);
const ledgerPath = resolveInput(typeof args.ledger === 'string' ? args.ledger : 'research/paper-5-data/LEDGER.md', roots);
const texPath = resolveInput(typeof args.paper === 'string' ? args.paper : 'research/paper-5-graphrag-forge.tex', roots);
const ing = paper.loadPaperClaims({ ledgerPath, texPath, roots, extraEvidence: extraEvidenceFrom(args) });
const q = { claimId: args._[0], filePath: typeof args.file === 'string' ? args.file : undefined, symbol: typeof args.symbol === 'string' ? args.symbol : undefined };
emit(receipt(process.argv.slice(1).join(' '), startedAt, paper.queryClaimLinks(ing.graph, q)), args);