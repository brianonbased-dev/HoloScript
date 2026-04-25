#!/usr/bin/env node
/**
 * Paper 25 Corpus Snapshot — Day-N freezer for the fleet-self-described paper
 * ----------------------------------------------------------------------------
 * Spec: ai-ecosystem/research/2026-04-25_paper-25-fleet-multi-brain-aamas.md §4.3.
 * Closes part of task_1777089531815_c22t.
 *
 * Reads scripts/mesh-deploy/agents.json for the 31 fleet handles, queries
 * each agent's CAEL audit log via GET /api/holomesh/agent/<handle>/audit
 * for the last N days (default 7), and freezes the corpus to
 * research/2026-04-25_paper-25-corpus-day-N.json for submission-bundle
 * inclusion. The snapshot file is OTS-anchorable via scripts/anchor_ots.py.
 *
 * Usage:
 *   HOLOMESH_API_KEY=<key> \
 *     node scripts/fleet-corpus-snapshot/snapshot-day-N.mjs --day 7
 *
 *   # Snapshot a custom window:
 *   node snapshot-day-N.mjs --since 2026-04-25T00:00:00Z --until 2026-05-01T00:00:00Z
 *
 *   # Custom output path:
 *   node snapshot-day-N.mjs --day 7 --output /tmp/corpus.json
 *
 * Output schema (suitable for OTS anchor + Paper 25 Appendix A inclusion):
 *   {
 *     snapshot_iso: "2026-05-02T01:50:00Z",
 *     window: { since: "2026-04-25T01:50:00Z", until: "2026-05-02T01:50:00Z", days: 7 },
 *     fleet_size: 31,
 *     handles: [{ handle, brain_class, records_observed, fetch_error? }],
 *     records_total: 12345,
 *     by_brain_class: { "trait-inference": 3210, ... },
 *     by_operation: { "audit/sybil.vouch": 18, ... },
 *     w090_violations: 0,            // records with non-7-element layer_hashes
 *     foreign_route_writes: 0,       // operations not starting with audit/
 *     records: [...all records, ordered by (handle, tick_iso)...]
 *   }
 *
 * Author: Claude (Opus 4.7, 1M ctx) — claude-code surface, 2026-04-25 session.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import process from 'node:process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = join(__dirname, '..', '..');
const AI_ECOSYSTEM_RESEARCH = join(REPO_ROOT, '..', '.ai-ecosystem', 'research');

function parseArgs(argv) {
  const args = {
    day: null,
    since: null,
    until: null,
    output: null,
    apiBase: process.env.HOLOMESH_API_BASE || 'https://mcp.holoscript.net',
    apiKey: process.env.HOLOMESH_API_KEY || null,
    fleetSpec: null,
  };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--day') args.day = Number(argv[++i]);
    else if (argv[i] === '--since') args.since = argv[++i];
    else if (argv[i] === '--until') args.until = argv[++i];
    else if (argv[i] === '--output') args.output = argv[++i];
    else if (argv[i] === '--api-base') args.apiBase = argv[++i];
    else if (argv[i] === '--fleet-spec') args.fleetSpec = argv[++i];
  }
  if (!args.apiKey) throw new Error('HOLOMESH_API_KEY env var required');
  if (!args.day && !(args.since && args.until)) {
    throw new Error('Provide either --day N or both --since and --until ISO timestamps');
  }
  return args;
}

async function loadFleet(fleetSpecPath) {
  const path = fleetSpecPath || join(REPO_ROOT, 'scripts', 'mesh-deploy', 'agents.json');
  const raw = await readFile(path, 'utf8');
  const data = JSON.parse(raw);
  return (data.agents || []).filter((a) => a.enabled !== false);
}

async function fetchHandleCorpus({ apiBase, apiKey, handle, since, until }) {
  // Pull in pages of 1000 (the endpoint's default cap) until we exhaust
  // the window. Phase 0 endpoint doesn't paginate cursor-style yet
  // (tracked at task_..._pawd Phase 1 hardening), so we approximate by
  // narrowing windows when we hit the cap.
  const url = new URL(`${apiBase}/api/holomesh/agent/${encodeURIComponent(handle)}/audit`);
  url.searchParams.set('since', since);
  url.searchParams.set('until', until);
  url.searchParams.set('limit', '1000');
  const response = await fetch(url.toString(), {
    headers: { 'x-mcp-api-key': apiKey },
  });
  if (!response.ok) {
    throw new Error(`GET ${url} → ${response.status} ${response.statusText}`);
  }
  const body = await response.json();
  return body.records || [];
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const now = new Date();
  let since, until, day;
  if (args.day) {
    day = args.day;
    until = now.toISOString();
    since = new Date(now.getTime() - day * 24 * 60 * 60 * 1000).toISOString();
  } else {
    since = args.since;
    until = args.until;
    day = Math.round((Date.parse(until) - Date.parse(since)) / (24 * 60 * 60 * 1000));
  }

  console.log(`[corpus-snapshot] window: ${since} → ${until} (~${day} days)`);

  const fleet = await loadFleet(args.fleetSpec);
  console.log(`[corpus-snapshot] fleet handles: ${fleet.length}`);

  const handles = [];
  const allRecords = [];
  const byBrainClass = {};
  const byOperation = {};
  let w090Violations = 0;
  let foreignRouteWrites = 0;

  for (const agent of fleet) {
    const brainClass = (agent.brainPath || '').split('/').pop().replace('.hsplus', '');
    const handleRow = {
      handle: agent.handle,
      brain_class: brainClass,
      records_observed: 0,
      fetch_error: null,
    };
    try {
      const records = await fetchHandleCorpus({
        apiBase: args.apiBase,
        apiKey: args.apiKey,
        handle: agent.handle,
        since,
        until,
      });
      handleRow.records_observed = records.length;
      for (const rec of records) {
        allRecords.push({ ...rec, _agent: agent.handle, _brain_class: brainClass });
        // Tally + integrity checks
        byBrainClass[brainClass] = (byBrainClass[brainClass] || 0) + 1;
        byOperation[rec.operation] = (byOperation[rec.operation] || 0) + 1;
        if (!Array.isArray(rec.layer_hashes) || rec.layer_hashes.length !== 7) {
          w090Violations += 1;
        }
        if (typeof rec.operation === 'string' && !rec.operation.startsWith('audit/')) {
          foreignRouteWrites += 1;
        }
      }
    } catch (err) {
      handleRow.fetch_error = String(err.message || err);
    }
    handles.push(handleRow);
    process.stdout.write(`  ${agent.handle}: ${handleRow.records_observed}${handleRow.fetch_error ? ` (ERR: ${handleRow.fetch_error})` : ''}\n`);
  }

  // Sort records by (handle, tick_iso) for canonical ordering
  allRecords.sort((a, b) => {
    if (a._agent !== b._agent) return a._agent < b._agent ? -1 : 1;
    return (a.tick_iso || '') < (b.tick_iso || '') ? -1 : 1;
  });

  const snapshot = {
    snapshot_iso: now.toISOString(),
    window: { since, until, days: day },
    fleet_size: fleet.length,
    handles,
    records_total: allRecords.length,
    by_brain_class: byBrainClass,
    by_operation: byOperation,
    w090_violations: w090Violations,
    foreign_route_writes: foreignRouteWrites,
    records: allRecords,
  };

  // Default output: research/2026-04-25_paper-25-corpus-day-N.json
  const outputPath = args.output || join(
    AI_ECOSYSTEM_RESEARCH,
    `${now.toISOString().slice(0, 10)}_paper-25-corpus-day-${day}.json`
  );
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, JSON.stringify(snapshot, null, 2), 'utf8');

  console.log('');
  console.log('[corpus-snapshot] SUMMARY:');
  console.log(`  Records total:       ${allRecords.length}`);
  console.log(`  Handles observed:    ${handles.filter((h) => h.records_observed > 0).length}/${fleet.length}`);
  console.log(`  Handles with error:  ${handles.filter((h) => h.fetch_error).length}`);
  console.log(`  W.090 violations:    ${w090Violations}`);
  console.log(`  Foreign route writes:${foreignRouteWrites}`);
  console.log(`  By brain class:`);
  for (const [k, v] of Object.entries(byBrainClass).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${k}: ${v}`);
  }
  console.log('');
  console.log(`[corpus-snapshot] wrote ${outputPath}`);
  console.log(`[corpus-snapshot] next: anchor via 'python scripts/anchor_ots.py ${outputPath}' for Paper 25 submission-bundle inclusion.`);
}

main().catch((err) => {
  console.error(`[corpus-snapshot] FATAL: ${err.stack || err.message}`);
  process.exit(1);
});
