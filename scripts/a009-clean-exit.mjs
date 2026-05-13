#!/usr/bin/env node
// Write the canonical A-009 Example-freshness clean-exit artifact.
//
// Mirrors scripts/a020-clean-exit.mjs (this repo) and scripts/a006-clean-exit.mjs
// (HoloScript repo). Every A-009 run must produce a marker in docs/examples-health/
// so A-001 routine-health can verify firing without reading the routine's own logs.
//
// Status values:
//   gaps-filed   — routine compiled stress-tests and emitted at least one A-009-*.json
//                  gap-seed to HoloScript/research/audit-reports/gaps-pending/
//   no-gaps      — clean run, all stress-tests compiled, no artist requests pending
//   partial      — stress-test phase ran but at least one composition was unreachable
//                  or the trait-request phase was skipped
//   error        — routine errored before completing Phase A (stress-test compilation)
//
// Usage:
//   node scripts/a009-clean-exit.mjs \
//     --status=no-gaps \
//     --compositions-tested=12 \
//     --gaps-emitted=0 \
//     --seed-path=none \
//     --summary="12 stress-test combos compiled clean; no artist requests pending"

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const VALID_STATUS = new Set(['gaps-filed', 'no-gaps', 'partial', 'error']);

function parseArgs(argv) {
  const args = {
    date: new Date().toISOString().slice(0, 10),
    status: '',
    compositionsTested: '0',
    gapsEmitted: '0',
    seedPath: 'none',
    failedCompositions: 'none',
    summary: '',
    force: false,
  };

  for (const arg of argv) {
    if (arg === '--force') {
      args.force = true;
      continue;
    }
    const match = arg.match(/^--([^=]+)=(.*)$/);
    if (!match) continue;
    const [, rawKey, value] = match;
    const key = rawKey.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    if (Object.hasOwn(args, key)) args[key] = value;
  }
  return args;
}

function fail(message) {
  console.error(`[a009-clean-exit] ${message}`);
  process.exit(1);
}

function renderArtifact(args) {
  return `# A-009 Example Freshness + Artist Stress-Test — ${args.date}

**Routine**: A-009 example freshness + artist stress-test
**Status**: ${args.status}
**Compositions tested**: ${args.compositionsTested}
**Gaps emitted**: ${args.gapsEmitted}
**Seed path**: ${args.seedPath}
**Failed compositions**: ${args.failedCompositions}

## Outcome

${args.summary || '(no summary provided)'}

## Verification

A-001 routine-health treats this marker as the canonical signal that A-009 fired.
Status interpretation:

- \`gaps-filed\` / \`no-gaps\` → FIRED-OK
- \`partial\` → FIRED-DEGRADED (at least one composition unreachable; see "Failed compositions" above)
- \`error\` → FIRED-DEGRADED (routine errored before completing stress-test phase; investigate and re-run manually)

If this marker is missing for any UTC date after 22:30 UTC, A-001 should classify
the day as a scheduler miss for A-009. FIRED-EMPTY (gap-seed silence with no
clean-exit marker) for ≥3 consecutive days crosses the F.031 threshold.

## See also

- Routine spec: \`docs/AGENT_AUTOMATIONS.md\` § A-009
- Implementation guide: \`docs/A-009-IMPLEMENTATION.md\`
- Schema: \`HoloScript/research/audit-reports/A-009-SCHEMA.md\`
- Local ingest hook: \`hooks/sessionstart/ingest-a009-gaps.mjs\`
`;
}

function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!args.status) fail('Missing required --status=<gaps-filed|no-gaps|partial|error>');
  if (!VALID_STATUS.has(args.status)) {
    fail(`Invalid --status=${args.status}. Valid: ${[...VALID_STATUS].join(', ')}`);
  }
  if (!args.summary) fail('Missing required --summary="<one-line>"');

  const dir = resolve('docs/examples-health');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  const filename = `${args.date}-a009-${args.status}.md`;
  const path = resolve(dir, filename);

  if (existsSync(path) && !args.force) {
    fail(`Marker already exists: ${path}. Use --force to overwrite.`);
  }

  writeFileSync(path, renderArtifact(args), 'utf8');
  console.log(`[a009-clean-exit] wrote ${path}`);
}

main();
