#!/usr/bin/env node
/**
 * nmos-to-board.mjs — Auto-file board tasks for actionable competitor gaps.
 *
 * Reads docs/strategy/competitor-gap-matrix.json and POSTs board tasks for
 * every gap that meets the filing criteria, then writes the assigned task ID
 * back into the JSON so the field stays populated on subsequent runs.
 *
 * Filing criteria (a gap is filed when ALL of these hold):
 *   - boardTaskId is null or undefined
 *   - status is NOT 'watch' and NOT 'shipped'
 *   - classification is NOT 'WATCH'
 *   - direction is NOT 'watch'
 *   (i.e. every actionable BUILD-INTERNAL / ABSORB / BRIDGE gap that hasn't
 *    been filed yet and isn't a pure monitor entry)
 *
 * Usage:
 *   node scripts/nmos-to-board.mjs
 *   node scripts/nmos-to-board.mjs --dry-run
 *   node scripts/nmos-to-board.mjs --input docs/strategy/competitor-gap-matrix.json
 *   node scripts/nmos-to-board.mjs --filter BUILD-INTERNAL
 *
 * Options:
 *   --dry-run          Print tasks that would be filed without posting or patching JSON.
 *   --input <path>     Override the default matrix JSON path.
 *   --filter <class>   Only file gaps whose classification contains <class>
 *                      (e.g. "BUILD-INTERNAL", "ABSORB", "BRIDGE").
 *   --no-write-back    Skip writing boardTaskId values back to the JSON file.
 *   --max <N>          File at most N tasks (default: all qualifying).
 *
 * Called from:
 *   /room scout cycle  — populate board after each NMoS classification run
 *   /founder NMoS ruling — manually after a gap is reclassified
 *
 * Sources:
 *   competitor-gap-matrix.json
 *   idea-run-12 card 7
 *   idea-run-13 WIRE card "Register competitor-gap-matrix follow-up tasks"
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

// ── Resolve paths ─────────────────────────────────────────────────────────────
const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');

const args = process.argv.slice(2);

const dryRun = args.includes('--dry-run');
const noWriteBack = args.includes('--no-write-back');

const inputIdx = args.indexOf('--input');
const matrixPath = inputIdx >= 0
  ? resolve(args[inputIdx + 1])
  : resolve(REPO_ROOT, 'docs', 'strategy', 'competitor-gap-matrix.json');

const filterIdx = args.indexOf('--filter');
const classFilter = filterIdx >= 0 ? args[filterIdx + 1] : null;

const maxIdx = args.indexOf('--max');
const maxTasks = maxIdx >= 0 ? parseInt(args[maxIdx + 1], 10) : Infinity;

// ── Load matrix ───────────────────────────────────────────────────────────────
console.log(`[nmos-to-board] matrix=${matrixPath}`);
const raw = readFileSync(matrixPath, 'utf-8');
/** @type {import('./render-competitor-gap-matrix.mjs').CompetitorGapMatrix} */
const matrix = JSON.parse(raw);

// ── Collect qualifying gaps ───────────────────────────────────────────────────
/**
 * Classification strings that block filing (pure monitor entries).
 * WATCH classifications and gaps with direction:'watch' or status:'watch'
 * are excluded — they have no execution surface by design.
 */
const SKIP_CLASSIFICATIONS = ['WATCH'];

/** @type {Array<{vertical: object, gap: object}>} */
const qualifying = [];

for (const vertical of matrix.verticals ?? []) {
  const classification = vertical.nmos?.classification ?? '';
  const isWatchClass = SKIP_CLASSIFICATIONS.some((c) =>
    classification.toUpperCase().startsWith(c)
  );
  if (isWatchClass) continue;
  if (classFilter && !classification.includes(classFilter)) continue;

  for (const gap of vertical.gaps ?? []) {
    // Already filed
    if (gap.boardTaskId) continue;
    // Pure monitor entries — no execution surface
    if (gap.status === 'watch' || gap.status === 'shipped') continue;
    if (gap.direction === 'watch') continue;

    qualifying.push({ vertical, gap });
    if (qualifying.length >= maxTasks) break;
  }
  if (qualifying.length >= maxTasks) break;
}

console.log(`[nmos-to-board] qualifying gaps=${qualifying.length}`);

if (qualifying.length === 0) {
  console.log('[nmos-to-board] Nothing to file. All qualifying gaps already have boardTaskId.');
  process.exit(0);
}

// ── Build task payloads ───────────────────────────────────────────────────────
/**
 * Priority mapping: severity (P0–P3) → board priority (1 = highest).
 * P0 → 1, P1 → 2, P2 → 3, P3 → 4; anything else → 3.
 */
function severityToPriority(sev) {
  const map = { P0: 1, P1: 2, P2: 3, P3: 4 };
  return map[sev] ?? 3;
}

/**
 * Role mapping: direction → board role.
 * catch-up gaps are engineering work; differentiator gaps are strategy+eng.
 */
function directionToRole(direction, classification) {
  if (classification.includes('BUILD-INTERNAL')) return 'build';
  if (classification.includes('ABSORB')) return 'build';
  if (direction === 'catch-up') return 'build';
  if (direction === 'differentiator') return 'build';
  return 'flex';
}

/**
 * Build a board task description capped at 2000 chars (HoloMesh server limit).
 * Includes gap metadata, needed response, evidence pointers, and NMoS context.
 */
function buildDescription(vertical, gap) {
  const nmos = vertical.nmos ?? {};
  const classification = nmos.classification ?? 'UNKNOWN';
  const score = nmos.score ?? '?/5';
  const bars = (nmos.bars_passed ?? []).join(', ') || 'none';
  const vitality = nmos.vitality ?? 'unknown';

  const lines = [
    `**Gap ID**: ${gap.id} | **Competitor**: ${vertical.competitor} | **Vertical**: ${vertical.vertical}`,
    `**NMoS**: ${classification} (${score}) — bars passed: ${bars}`,
    `**Vitality**: ${vitality}`,
    '',
    `**HoloScript state**: ${gap.holoscriptState ?? '—'}`,
    '',
    `**Needed response**: ${gap.neededResponse ?? '—'}`,
  ];

  if (gap.evidence?.length) {
    lines.push('', `**Evidence**: ${gap.evidence.slice(0, 3).join('; ')}`);
  }

  if (nmos.threat_level) {
    lines.push('', `**Threat level**: ${nmos.threat_level}`);
  }

  lines.push('', `Source: docs/strategy/competitor-gap-matrix.json (${gap.id})`);

  const full = lines.join('\n');
  if (full.length <= 2000) return full;

  // Truncate to stay under the server cap while keeping the source pointer
  const suffix = '\n…[truncated] Source: docs/strategy/competitor-gap-matrix.json';
  return full.slice(0, 2000 - suffix.length) + suffix;
}

const tasks = qualifying.map(({ vertical, gap }) => ({
  _gapId: gap.id,   // internal — stripped before POST
  _verticalIndex: matrix.verticals.indexOf(vertical),  // for write-back
  _gapIndex: vertical.gaps.indexOf(gap),               // for write-back
  title: `[NMoS] ${gap.id}: ${gap.title}`,
  description: buildDescription(vertical, gap),
  priority: severityToPriority(gap.severity),
  role: directionToRole(gap.direction, vertical.nmos?.classification ?? ''),
  tags: ['nmos', 'competitor-gap', gap.id, vertical.competitor.toLowerCase().replace(/[^a-z0-9]+/g, '-')],
}));

// ── Dry-run output ────────────────────────────────────────────────────────────
if (dryRun) {
  console.log('\n[nmos-to-board] DRY RUN — tasks that would be filed:\n');
  for (const task of tasks) {
    console.log(`  [P${task.priority}] ${task.title}`);
    console.log(`    role=${task.role} tags=${task.tags.join(',')}`);
    console.log(`    description (${task.description.length} chars)`);
    console.log();
  }
  console.log(`[nmos-to-board] Total: ${tasks.length} task(s) would be filed.`);
  process.exit(0);
}

// ── Load HoloMesh credentials and POST ───────────────────────────────────────
// Dynamic import so the script is runnable in dry-run without the ai-ecosystem
// hooks on PATH.
const AI_ECO = resolve(process.env.HOME ?? process.env.USERPROFILE ?? '', '.ai-ecosystem');

let loadLocalEnv, getHolomeshRuntimeConfig, createHolomeshHttpClient, signingSeatIdFor, buildSignedEnvelope;
try {
  // Use pathToFileURL so Windows absolute paths work with ESM dynamic import
  ({ loadLocalEnv, getHolomeshRuntimeConfig } = await import(
    pathToFileURL(resolve(AI_ECO, 'hooks', 'lib', 'holomesh-env.mjs')).href
  ));
  ({ createHolomeshHttpClient } = await import(
    pathToFileURL(resolve(AI_ECO, 'hooks', 'lib', 'holomesh-http.mjs')).href
  ));
  ({ signingSeatIdFor, buildSignedEnvelope } = await import(
    pathToFileURL(resolve(AI_ECO, 'hooks', 'lib', 'holomesh-signing.mjs')).href
  ));
} catch (err) {
  console.error(`[nmos-to-board] Failed to load HoloMesh hooks from ${AI_ECO}:`);
  console.error(`  ${err.message}`);
  console.error('  Ensure ~/.ai-ecosystem/hooks/lib/ is present or use --dry-run.');
  process.exit(1);
}

loadLocalEnv();
const cfg = getHolomeshRuntimeConfig({ loadEnv: false });
if (!cfg.apiKey || !cfg.teamId) {
  console.error('[nmos-to-board] Missing HOLOMESH_API_KEY or HOLOMESH_TEAM_ID.');
  process.exit(1);
}

// Phase 3 strict signing
let bodyTransform;
const surface = process.env.HOLOMESH_AGENT_SURFACE
  || process.env.HOLOMESH_RESOLVED_SURFACE
  || 'claudecode';
try {
  const seatId = signingSeatIdFor(surface);
  bodyTransform = async (body) => buildSignedEnvelope(body, { seatId });
} catch (err) {
  if (process.env.HOLOMESH_HTTP_DEBUG) {
    process.stderr.write(`[nmos-to-board] signing setup failed (${err.message}), sending unsigned\n`);
  }
}

const http = createHolomeshHttpClient({
  apiKey: cfg.apiKey,
  timeoutMs: Number(process.env.HOLOMESH_HTTP_TIMEOUT_MS) || 60000,
  ...(bodyTransform ? { bodyTransform } : {}),
});
const base = `/api/holomesh/team/${cfg.teamId}`;

// Strip internal metadata fields before POST
const postTasks = tasks.map(({ _gapId, _verticalIndex, _gapIndex, ...rest }) => rest);

console.log(`\n[nmos-to-board] Posting ${postTasks.length} task(s) to board…`);
const post = await http.post(`${base}/board`, { tasks: postTasks });
if (!post) {
  console.error('[nmos-to-board] POST /board failed (no response).');
  process.exit(1);
}

const returned = Array.isArray(post.tasks) ? post.tasks : [];
const added = post.added ?? returned.length;
console.log(
  `[nmos-to-board] POST ok: requested=${tasks.length} added=${added} returned=${returned.length}`
);

// ── Verify returned IDs exist on board ────────────────────────────────────────
const verified = [];
const phantom = [];

for (const returnedTask of returned) {
  const id = returnedTask?.id;
  if (!id) {
    phantom.push({ id: '?', title: returnedTask?.title ?? '?' });
    continue;
  }
  const detail = await http.get(`${base}/board/${id}`);
  const present =
    detail?.task?.id === id ||
    detail?.id === id ||
    (Array.isArray(detail?.tasks) && detail.tasks.some((t) => t?.id === id));

  if (present) {
    verified.push({ id, title: returnedTask.title ?? '' });
  } else {
    phantom.push({ id, title: returnedTask.title ?? '' });
  }
}

console.log('\n[nmos-to-board] Verification results:');
for (const v of verified) {
  console.log(`  OK ${v.id} | ${v.title}`);
}
if (phantom.length) {
  for (const p of phantom) {
    console.log(`  PHANTOM ${p.id} | ${p.title}`);
  }
}
console.log(`  verified=${verified.length} phantom=${phantom.length}`);

// ── Write boardTaskId back into matrix JSON ───────────────────────────────────
if (!noWriteBack && verified.length > 0) {
  // Map returned task titles → verified IDs
  const titleToId = new Map(verified.map((v) => [v.title, v.id]));

  let writeBackCount = 0;
  for (const task of tasks) {
    const id = titleToId.get(task.title);
    if (!id) continue;
    const vertical = matrix.verticals[task._verticalIndex];
    if (!vertical) continue;
    const gap = vertical.gaps[task._gapIndex];
    if (!gap) continue;
    gap.boardTaskId = id;
    writeBackCount++;
  }

  if (writeBackCount > 0) {
    writeFileSync(matrixPath, JSON.stringify(matrix, null, 2) + '\n', 'utf-8');
    console.log(
      `\n[nmos-to-board] Wrote boardTaskId for ${writeBackCount} gap(s) back to ${matrixPath}`
    );
  }
}

if (phantom.length > 0) {
  console.error(
    `\n[nmos-to-board] WARNING: ${phantom.length} task(s) returned by POST but not found on board.`
  );
  process.exit(2);
}

console.log('\n[nmos-to-board] Done.');
