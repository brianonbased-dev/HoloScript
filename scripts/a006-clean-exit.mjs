#!/usr/bin/env node
// Write the canonical A-006 bug-hunt clean-exit artifact.

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const VALID_STATUS = new Set(['quiet', 'false-positive', 'bug']);

function parseArgs(argv) {
  const args = {
    date: new Date().toISOString().slice(0, 10),
    status: '',
    summary: '',
    window: 'last 48h',
    candidate: 'none',
    evidence: '',
    followup: 'none',
    force: false,
  };

  for (const arg of argv) {
    if (arg === '--force') {
      args.force = true;
      continue;
    }
    const match = arg.match(/^--([^=]+)=(.*)$/);
    if (!match) continue;
    const [, key, value] = match;
    if (Object.hasOwn(args, key)) args[key] = value;
  }
  return args;
}

function fail(message) {
  console.error(`[a006-clean-exit] ${message}`);
  process.exit(1);
}

function renderArtifact(args) {
  return `# A-006 Bug Hunt — ${args.date}

**Routine**: A-006 Bug Hunting
**Status**: ${args.status}
**Scan window**: ${args.window}
**Candidate**: ${args.candidate}
**Evidence**: ${args.evidence || 'not provided'}
**Follow-up owner**: ${args.followup}

## Outcome

${args.summary}

## Routine-Health Contract

This file is the canonical clean-exit marker for A-006. A-001 should classify
this run as FIRED-TRIAGED, not FIRED-EMPTY, because A-006 completed and left an
explicit result artifact.
`;
}

const args = parseArgs(process.argv.slice(2));
if (!VALID_STATUS.has(args.status)) {
  fail(`--status must be one of: ${Array.from(VALID_STATUS).join(', ')}`);
}
if (!args.summary.trim()) {
  fail('--summary is required');
}

const outDir = resolve('docs/bugs');
const outPath = resolve(outDir, `${args.date}-a006-${args.status}.md`);
if (existsSync(outPath) && !args.force) {
  fail(`${outPath} already exists; pass --force to overwrite`);
}

mkdirSync(outDir, { recursive: true });
writeFileSync(outPath, renderArtifact(args));
console.log(outPath);
