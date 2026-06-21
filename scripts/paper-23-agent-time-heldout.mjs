#!/usr/bin/env node
/**
 * Paper 23 Agent-Time held-out evaluator.
 *
 * Fetches the full HoloMesh /board/done log, builds a chronological 70/30
 * train/test split, and compares task-type mean inter-completion predictions
 * against a global-mean baseline.
 *
 * Required env:
 *   HOLOMESH_API_KEY or HOLOMESH_KEY or HOLOSCRIPT_API_KEY
 *   HOLOMESH_TEAM_ID
 *
 * Usage:
 *   node scripts/paper-23-agent-time-heldout.mjs \
 *     --out research/paper-23-agent-time/heldout-mae-20260621.json
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const args = parseArgs(process.argv.slice(2));
const apiBase = args.apiBase || process.env.HOLOMESH_API_BASE || 'https://mcp.holoscript.net/api/holomesh';
const apiKey = args.apiKey || process.env.HOLOMESH_API_KEY || process.env.HOLOMESH_KEY || process.env.HOLOSCRIPT_API_KEY;
const teamId = args.teamId || process.env.HOLOMESH_TEAM_ID;
const pageLimit = clampInt(args.pageLimit, 1, 1000, 1000);
const trainRatio = clampNumber(args.trainRatio, 0.1, 0.9, 0.7);
const outPath = resolve(args.out || `research/paper-23-agent-time/heldout-mae-${dateSlug(new Date())}.json`);

if (!apiKey || !teamId) {
  console.error('[paper-23-heldout] Missing HOLOMESH_API_KEY/HOLOMESH_TEAM_ID.');
  process.exit(2);
}

const fetchedAt = new Date();
const doneLog = await fetchDoneLog({ apiBase, apiKey, teamId, pageLimit });
const entries = doneLog.entries
  .map(normalizeEntry)
  .filter((entry) => Number.isFinite(entry.completedAtMs))
  .sort((a, b) => a.completedAtMs - b.completedAtMs || a.taskId.localeCompare(b.taskId));

if (entries.length < 10) {
  console.error(`[paper-23-heldout] Need >=10 completed tasks, got ${entries.length}.`);
  process.exit(3);
}

entries.forEach((entry, index) => {
  entry.index = index;
  entry.taskType = classifyTaskType(entry.title);
});

const splitIndex = Math.max(1, Math.min(entries.length - 1, Math.floor(entries.length * trainRatio)));
const observations = buildInterCompletionObservations(entries, splitIndex);
const trainObservations = observations.filter((obs) => obs.currentIndex < splitIndex && obs.previousIndex < splitIndex);
const testObservations = observations.filter((obs) => obs.currentIndex >= splitIndex);

if (!trainObservations.length || !testObservations.length) {
  console.error(
    `[paper-23-heldout] Empty train/test observations: train=${trainObservations.length}, test=${testObservations.length}.`
  );
  process.exit(4);
}

const globalMeanSec = mean(trainObservations.map((obs) => obs.actualSec));
const byTypeTrain = groupBy(trainObservations, (obs) => obs.taskType);
const typeModels = {};
for (const [taskType, rows] of byTypeTrain) {
  typeModels[taskType] = {
    n: rows.length,
    meanSec: round(mean(rows.map((obs) => obs.actualSec)), 3),
  };
}

const scored = testObservations.map((obs) => {
  const model = typeModels[obs.taskType];
  const typePredSec = model?.meanSec ?? globalMeanSec;
  const globalPredSec = globalMeanSec;
  return {
    ...obs,
    typePredSec: round(typePredSec, 3),
    globalPredSec: round(globalPredSec, 3),
    typeAbsErrorSec: round(Math.abs(typePredSec - obs.actualSec), 3),
    globalAbsErrorSec: round(Math.abs(globalPredSec - obs.actualSec), 3),
    typeTrainN: model?.n ?? 0,
  };
});

const typeMae = mean(scored.map((row) => row.typeAbsErrorSec));
const globalMae = mean(scored.map((row) => row.globalAbsErrorSec));
const improvementPct = globalMae > 0 ? ((globalMae - typeMae) / globalMae) * 100 : 0;
const perType = Object.fromEntries(
  [...groupBy(scored, (row) => row.taskType).entries()]
    .map(([taskType, rows]) => [
      taskType,
      {
        testN: rows.length,
        trainN: typeModels[taskType]?.n ?? 0,
        maeTypeAwareSec: round(mean(rows.map((row) => row.typeAbsErrorSec)), 3),
        maeGlobalMeanSec: round(mean(rows.map((row) => row.globalAbsErrorSec)), 3),
        improvementPct: improvement(rows),
        meanActualSec: round(mean(rows.map((row) => row.actualSec)), 3),
      },
    ])
    .sort((a, b) => b[1].testN - a[1].testN || a[0].localeCompare(b[0]))
);

const artifact = {
  generatedAt: new Date().toISOString(),
  fetchedAt: fetchedAt.toISOString(),
  source: {
    apiBase,
    teamId,
    endpoint: `/team/${teamId}/board/done`,
    reportedDoneCount: doneLog.count,
    fetchedEntries: doneLog.entries.length,
    pageLimit,
  },
  split: {
    strategy: 'chronological-70-30',
    trainRatio,
    splitIndex,
    trainEntries: splitIndex,
    testEntries: entries.length - splitIndex,
    trainStart: entries[0]?.completedAt,
    trainEnd: entries[splitIndex - 1]?.completedAt,
    testStart: entries[splitIndex]?.completedAt,
    testEnd: entries[entries.length - 1]?.completedAt,
  },
  model: {
    target: 'same-task-type inter-completion seconds',
    taskTypePredictor: 'mean inter-completion seconds per broad title-derived task type',
    baseline: 'global mean inter-completion seconds from the training split',
    globalMeanSec: round(globalMeanSec, 3),
    typeModels,
    classifierRules: [
      'title containing RecursiveMAS -> recursive-mas',
      'title containing paper marker or Paper <number> -> paper',
      'title containing program-wide -> program-wide',
      'title containing PSF -> psf',
      'title containing security/signing/audit/vault -> security',
      'title containing idea-seed/platform/language/vrr -> idea-seed',
      'title containing studio/sidebar/ui/panel -> studio',
      'title containing holo/holoscript/holomesh/hololand -> holoscript',
      'otherwise -> other',
    ],
  },
  totals: {
    completions: entries.length,
    trainObservations: trainObservations.length,
    testObservations: testObservations.length,
    boundaryTestObservations: scored.filter((row) => row.previousIndex < splitIndex).length,
    taskTypesTrain: Object.keys(typeModels).length,
    taskTypesTest: Object.keys(perType).length,
  },
  metrics: {
    maeTypeAwareSec: round(typeMae, 3),
    maeGlobalMeanSec: round(globalMae, 3),
    improvementPct: round(improvementPct, 3),
    supportsFortyPctClaim: improvementPct >= 40,
  },
  perType,
  caveats: [
    'Done-log entries provide completion timestamps, not claimedAt timestamps; target is inter-completion cadence, not exact open-to-done latency.',
    'The first held-out observation for each task type may use the final training-set event as its previous same-type timestamp, matching chronological forecasting at the split boundary.',
    'Task type is title-derived and intentionally broad to match the seed paper classifier.',
  ],
};

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf-8');
console.log(
  JSON.stringify(
    {
      ok: true,
      outPath,
      completions: artifact.totals.completions,
      testObservations: artifact.totals.testObservations,
      maeTypeAwareSec: artifact.metrics.maeTypeAwareSec,
      maeGlobalMeanSec: artifact.metrics.maeGlobalMeanSec,
      improvementPct: artifact.metrics.improvementPct,
      supportsFortyPctClaim: artifact.metrics.supportsFortyPctClaim,
    },
    null,
    2
  )
);

function parseArgs(argv) {
  const out = {};
  for (const arg of argv) {
    if (!arg.startsWith('--')) continue;
    const eq = arg.indexOf('=');
    if (eq === -1) out[arg.slice(2)] = true;
    else out[arg.slice(2, eq)] = arg.slice(eq + 1);
  }
  return out;
}

async function fetchDoneLog({ apiBase, apiKey, teamId, pageLimit }) {
  const entries = [];
  let count = null;
  for (let offset = 0; ; offset += pageLimit) {
    const url = `${apiBase.replace(/\/$/, '')}/team/${encodeURIComponent(teamId)}/board/done?limit=${pageLimit}&offset=${offset}`;
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!response.ok) {
      throw new Error(`GET ${url} failed: ${response.status} ${await response.text()}`);
    }
    const page = await response.json();
    if (typeof page.count === 'number') count = page.count;
    entries.push(...(Array.isArray(page.entries) ? page.entries : []));
    if (!page.hasMore || !page.entries?.length) break;
  }
  return { count, entries };
}

function normalizeEntry(raw) {
  const completedAt = raw.timestamp || raw.completedAt || raw.createdAt || '';
  const completedAtMs = Date.parse(completedAt);
  return {
    taskId: String(raw.taskId || raw.id || ''),
    title: String(raw.title || ''),
    completedAt,
    completedAtMs,
    commitHash: raw.commitHash ? String(raw.commitHash) : null,
    completedBy: raw.completedBy ? String(raw.completedBy) : null,
  };
}

function classifyTaskType(title) {
  const s = title.toLowerCase();
  if (s.includes('recursivemas')) return 'recursive-mas';
  if (/\[paper-|paper\s+\d+|paper row|tvcg|msr|neurips|siggraph|usenix|pldi|iclr/.test(s)) return 'paper';
  if (s.includes('program-wide')) return 'program-wide';
  if (/\bpsf\b|\[psf\]/.test(s)) return 'psf';
  if (/security|signing|audit|vault|adversarial|byzantine|sycophancy/.test(s)) return 'security';
  if (/idea-seed|^\[[^\]]*(platform|language|vrr)|\bplatform\b|\blanguage\b/.test(s)) return 'idea-seed';
  if (/studio|sidebar|panel|ui\b|view component/.test(s)) return 'studio';
  if (/holo|holoscript|holomesh|hololand/.test(s)) return 'holoscript';
  return 'other';
}

function buildInterCompletionObservations(entries, splitIndex) {
  const previousByType = new Map();
  const observations = [];
  for (const entry of entries) {
    const prev = previousByType.get(entry.taskType);
    if (prev) {
      const actualSec = (entry.completedAtMs - prev.completedAtMs) / 1000;
      if (Number.isFinite(actualSec) && actualSec >= 0) {
        observations.push({
          taskType: entry.taskType,
          taskId: entry.taskId,
          title: entry.title,
          completedAt: entry.completedAt,
          currentIndex: entry.index,
          previousTaskId: prev.taskId,
          previousCompletedAt: prev.completedAt,
          previousIndex: prev.index,
          crossesSplitBoundary: prev.index < splitIndex && entry.index >= splitIndex,
          actualSec: round(actualSec, 3),
        });
      }
    }
    previousByType.set(entry.taskType, entry);
  }
  return observations;
}

function groupBy(rows, fn) {
  const map = new Map();
  for (const row of rows) {
    const key = fn(row);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
  }
  return map;
}

function mean(values) {
  const filtered = values.filter((value) => Number.isFinite(value));
  return filtered.length ? filtered.reduce((sum, value) => sum + value, 0) / filtered.length : 0;
}

function improvement(rows) {
  const typeMae = mean(rows.map((row) => row.typeAbsErrorSec));
  const globalMae = mean(rows.map((row) => row.globalAbsErrorSec));
  return round(globalMae > 0 ? ((globalMae - typeMae) / globalMae) * 100 : 0, 3);
}

function clampInt(value, min, max, fallback) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function clampNumber(value, min, max, fallback) {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function round(value, digits = 3) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function dateSlug(date) {
  return date.toISOString().slice(0, 10).replace(/-/g, '');
}
