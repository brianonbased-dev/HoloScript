#!/usr/bin/env node
/**
 * HoloShell dashboard command for the format-realism gauntlet.
 *
 * This wraps the segmented capture runner with the adoption surface HoloShell
 * needs: current scorecard, previous-run deltas, contact sheet, duplicate-aware
 * board task JSON, and an explicit signed filing path.
 */

import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { runSegmentedCapture } from './format-stress-segmented-capture.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const DEFAULT_MANIFEST = 'experiments/format-realism-gauntlet/manifest.json';
const DEFAULT_AGENT_SURFACE = 'codex-hardware';
const ECOSYSTEM_ROOT =
  process.env.AI_ECOSYSTEM_ROOT || 'C:/Users/josep/.ai-ecosystem';

function usage() {
  return `Usage: node scripts/holoshell-format-gauntlet.mjs [manifest.json] [options]

Options:
  --out <dir>               Output directory. Defaults to runner artifact root/date/flagship.
  --date <yyyy-mm-dd>       Date folder for default output. Defaults to today.
  --width <px>              Screenshot width. Default: 1280.
  --height <px>             Screenshot height. Default: 720.
  --wait-for <ms>           Screenshot stabilization wait. Default: 1000.
  --base-still <png>        Use an existing scene still, then emit segment replay stills.
  --no-replay-stills        Preserve historical static-copy still behavior.
  --dry-run                 Emit receipts without running parse/compile/headless/screenshot.
  --skip-screenshot         Do not invoke screenshot; write placeholder stills.
  --skip-headless           Do not invoke headless runtime.
  --no-open                 Do not open scorecard/contact sheet after the run.
  --file-tasks              File deduped board tasks through the signed /room helper.
  --skip-file-tasks         Only write task JSON and print the filing command. Default.
  --skip-duplicate-search   Do not read the live HoloMesh board before task filing.
  --agent-surface <id>      Surface used for signed task filing. Default: codex-hardware.
  --json                    Print dashboard summary JSON to stdout.
  --help                    Show this help.
`;
}

function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    manifest: DEFAULT_MANIFEST,
    out: undefined,
    date: undefined,
    width: 1280,
    height: 720,
    waitFor: 1000,
    baseStill: undefined,
    replayStills: true,
    dryRun: false,
    skipScreenshot: false,
    skipHeadless: false,
    open: true,
    fileTasks: false,
    duplicateSearch: true,
    agentSurface: DEFAULT_AGENT_SURFACE,
    json: false,
    help: false,
  };

  let positionalSeen = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--out' || arg === '-o') {
      options.out = argv[++i];
    } else if (arg === '--date') {
      options.date = argv[++i];
    } else if (arg === '--width') {
      options.width = Number.parseInt(argv[++i], 10) || options.width;
    } else if (arg === '--height') {
      options.height = Number.parseInt(argv[++i], 10) || options.height;
    } else if (arg === '--wait-for') {
      options.waitFor = Number.parseInt(argv[++i], 10) || options.waitFor;
    } else if (arg === '--base-still') {
      options.baseStill = argv[++i];
    } else if (arg === '--no-replay-stills') {
      options.replayStills = false;
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--skip-screenshot') {
      options.skipScreenshot = true;
    } else if (arg === '--skip-headless') {
      options.skipHeadless = true;
    } else if (arg === '--no-open') {
      options.open = false;
    } else if (arg === '--open') {
      options.open = true;
    } else if (arg === '--file-tasks') {
      options.fileTasks = true;
    } else if (arg === '--skip-file-tasks') {
      options.fileTasks = false;
    } else if (arg === '--skip-duplicate-search') {
      options.duplicateSearch = false;
    } else if (arg === '--agent-surface') {
      options.agentSurface = argv[++i] || options.agentSurface;
    } else if (arg === '--json') {
      options.json = true;
    } else if (!arg.startsWith('-') && !positionalSeen) {
      options.manifest = arg;
      positionalSeen = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function repoPath(path) {
  return isAbsolute(path) ? path : resolve(REPO_ROOT, path);
}

function relRepo(path) {
  return relative(REPO_ROOT, path).replace(/\\/g, '/');
}

function relFrom(from, to) {
  return relative(from, to).replace(/\\/g, '/');
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function writeText(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, value, 'utf8');
}

function flattenBoardTasks(boardData) {
  if (Array.isArray(boardData?.tasks)) return boardData.tasks;
  const board = boardData?.board || {};
  return [
    ...(Array.isArray(board.open) ? board.open : []),
    ...(Array.isArray(board.claimed) ? board.claimed : []),
    ...(Array.isArray(board.inProgress) ? board.inProgress : []),
    ...(Array.isArray(board.blocked) ? board.blocked : []),
  ];
}

function metricSet(scorecard = {}) {
  const coverage = scorecard.coverage || {};
  const visualEvidence = scorecard.visualEvidence || {};
  return {
    commandFailures: Array.isArray(scorecard.commandFailures)
      ? scorecard.commandFailures.length
      : 0,
    segmentsRequested: coverage.segmentsRequested ?? null,
    segmentsWithStill: coverage.segmentsWithStill ?? null,
    uniqueStillHashes: coverage.uniqueStillHashes ?? visualEvidence.uniqueStillHashes ?? null,
    segmentsWithRuntimeEventLog: coverage.segmentsWithRuntimeEventLog ?? null,
    segmentsWithPosePhysicsJson: coverage.segmentsWithPosePhysicsJson ?? null,
    segmentsWithTiming: coverage.segmentsWithTiming ?? null,
    segmentsWithWorldModelPixelReplay: coverage.segmentsWithWorldModelPixelReplay ?? null,
    dynamicReplayBlockedSegments: coverage.dynamicReplayBlockedSegments ?? null,
    highestGapSeverity: scorecard.highestGapSeverity ?? null,
  };
}

const METRIC_LABELS = [
  ['commandFailures', 'Parse/compile/runtime command failures'],
  ['segmentsRequested', 'Segments requested'],
  ['segmentsWithStill', 'Segments with stills'],
  ['uniqueStillHashes', 'Unique still hashes'],
  ['segmentsWithRuntimeEventLog', 'Segments with event logs'],
  ['segmentsWithPosePhysicsJson', 'Segments with pose/physics JSON'],
  ['segmentsWithTiming', 'Segments with timing'],
  ['segmentsWithWorldModelPixelReplay', 'World-model pixel replay segments'],
  ['dynamicReplayBlockedSegments', 'Dynamic replay blocked segments'],
  ['highestGapSeverity', 'Highest gap severity'],
];

function deltaValue(previous, current) {
  if (previous == null || current == null) return 'n/a';
  if (previous === current) return 'stable';
  if (typeof previous === 'number' && typeof current === 'number') {
    const delta = current - previous;
    return delta > 0 ? `+${delta}` : String(delta);
  }
  return `${previous} -> ${current}`;
}

function compareScorecards(previous, current, { dryRun = false } = {}) {
  const prevMetrics = previous ? metricSet(previous.scorecard) : {};
  const currentMetrics = metricSet(current);
  return METRIC_LABELS.map(([key, label]) => ({
    key,
    label,
    previous: prevMetrics[key] ?? null,
    current: currentMetrics[key] ?? null,
    delta: previous ? deltaValue(prevMetrics[key], currentMetrics[key]) : 'no previous run',
    evidenceQuality: dryRun ? 'non-quality' : 'quality',
  }));
}

function collectScorecards(rootDir, scenario, currentScorecardPath) {
  if (!existsSync(rootDir)) return [];
  const currentResolved = resolve(currentScorecardPath);
  const out = [];

  function visit(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        visit(path);
      } else if (entry.isFile() && entry.name === 'scorecard.json') {
        const resolved = resolve(path);
        if (resolved === currentResolved) continue;
        try {
          const scorecard = readJson(path);
          if (scorecard?.scenario !== scenario) continue;
          const time = Number.parseInt(String(Date.parse(scorecard.generatedAt)), 10);
          out.push({
            path,
            scorecard,
            sortTime: Number.isFinite(time) ? time : statSync(path).mtimeMs,
          });
        } catch {
          // Ignore partial or historical scorecards that no longer match the schema.
        }
      }
    }
  }

  visit(rootDir);
  return out.sort((a, b) => b.sortTime - a.sortTime);
}

function buildContactSheet(receipt, outputDir) {
  const stillEvidence = readJson(repoPath(receipt.artifacts.stillEvidence));
  const lines = [
    `# Format Gauntlet Contact Sheet - ${receipt.scenario}`,
    '',
    `Generated: ${receipt.generatedAt}`,
    `Scorecard: [scorecard.json](${relFrom(outputDir, repoPath(receipt.artifacts.scorecard))})`,
    '',
    '| Segment | Mode | Oracle | Still |',
    '| --- | --- | --- | --- |',
  ];

  for (const item of stillEvidence) {
    const still = join(outputDir, item.still || '');
    const stillLink = item.exists ? `![${item.segment}](${relFrom(outputDir, still)})` : 'missing';
    lines.push(
      `| ${item.segment} | ${item.mode || 'unknown'} | ${item.oracleStatus || 'unknown'} | ${stillLink} |`
    );
  }

  const path = join(outputDir, 'contact-sheet.md');
  writeText(path, `${lines.join('\n')}\n`);
  return path;
}

function buildBoardTasks(receipt) {
  const seeds = readJson(repoPath(receipt.artifacts.taskSeeds));
  const tasks = [];
  const seen = new Set();

  for (const seed of Array.isArray(seeds) ? seeds : []) {
    if (!seed?.title || !seed?.description || seen.has(seed.title)) continue;
    seen.add(seed.title);
    tasks.push({
      title: String(seed.title).slice(0, 200),
      description: String(seed.description).slice(0, 2000),
      priority: seed.priority ?? 2,
      role: seed.role || 'build',
      tags: [
        'format-stress',
        'holoshell',
        'gauntlet',
        String(seed.owningSurface || 'runtime')
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '')
          .slice(0, 48),
      ].filter(Boolean),
      source: seed.source || 'format-realism-gauntlet',
    });
  }

  return {
    schema: 'holoshell-format-gauntlet-board-tasks-v1',
    generatedAt: new Date().toISOString(),
    sourceRun: receipt.outputDir,
    tasks,
  };
}

async function loadHolomeshConfig() {
  const envPath = resolve(ECOSYSTEM_ROOT, 'hooks/lib/holomesh-env.mjs');
  if (!existsSync(envPath)) {
    return { status: 'missing-env-helper', tasks: [] };
  }

  try {
    const env = await import(pathToFileURL(envPath).href);
    env.loadLocalEnv?.();
    const cfg = env.getHolomeshRuntimeConfig?.({ loadEnv: false }) || {};
    return {
      status: cfg.apiKey && cfg.teamId ? 'ready' : 'missing-credentials',
      apiKey: cfg.apiKey,
      teamId: cfg.teamId,
      apiBase: cfg.apiBase || 'https://mcp.holoscript.net/api/holomesh',
    };
  } catch (error) {
    return {
      status: 'env-helper-error',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function readLiveBoardTitles() {
  const cfg = await loadHolomeshConfig();
  if (cfg.status !== 'ready') return { status: cfg.status, titles: new Set(), error: cfg.error };

  try {
    const res = await fetch(`${cfg.apiBase}/team/${cfg.teamId}/board?limit=500`, {
      headers: { Authorization: `Bearer ${cfg.apiKey}` },
    });
    if (!res.ok) {
      return { status: 'http-error', titles: new Set(), error: `${res.status} ${res.statusText}` };
    }
    const data = await res.json();
    const titles = new Set(
      flattenBoardTasks(data)
        .map((task) => task?.title)
        .filter(Boolean)
    );
    return { status: 'ok', titles };
  } catch (error) {
    return {
      status: 'network-error',
      titles: new Set(),
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function dedupeTasks(boardTasks, options) {
  const uniqueTasks = [];
  const localTitles = new Set();
  const duplicateLocal = [];

  for (const task of boardTasks.tasks) {
    if (localTitles.has(task.title)) {
      duplicateLocal.push(task.title);
      continue;
    }
    localTitles.add(task.title);
    uniqueTasks.push(task);
  }

  if (!options.duplicateSearch) {
    return {
      status: 'skipped',
      liveDuplicates: [],
      localDuplicates: duplicateLocal,
      tasks: uniqueTasks,
    };
  }

  const board = await readLiveBoardTitles();
  const tasks = uniqueTasks.filter((task) => !board.titles.has(task.title));
  const liveDuplicates = uniqueTasks
    .filter((task) => board.titles.has(task.title))
    .map((task) => task.title);

  return {
    status: board.status,
    error: board.error,
    liveDuplicates,
    localDuplicates: duplicateLocal,
    tasks,
  };
}

function fileTasksWithRoomHelper(taskPath, options) {
  if (!options.fileTasks) {
    return {
      status: 'skipped',
      command: `node ${relRepo(resolve(ECOSYSTEM_ROOT, 'scripts/room-add-tasks.mjs'))} ${relRepo(taskPath)}`,
    };
  }

  const helper = resolve(ECOSYSTEM_ROOT, 'scripts/room-add-tasks.mjs');
  if (!existsSync(helper)) {
    return { status: 'missing-helper', error: helper };
  }

  const result = spawnSync(process.execPath, [helper, taskPath], {
    cwd: ECOSYSTEM_ROOT,
    encoding: 'utf8',
    env: {
      ...process.env,
      HOLOMESH_AGENT_SURFACE: options.agentSurface || DEFAULT_AGENT_SURFACE,
      HOLOMESH_REQUEST_SIGNING: '1',
    },
  });

  return {
    status: result.status === 0 ? 'filed' : 'failed',
    exitCode: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

function openArtifact(path) {
  const absolute = resolve(path);
  if (process.platform === 'win32') {
    return spawnSync('cmd', ['/c', 'start', '', absolute], {
      encoding: 'utf8',
      windowsHide: true,
    });
  }
  if (process.platform === 'darwin') {
    return spawnSync('open', [absolute], { encoding: 'utf8' });
  }
  return spawnSync('xdg-open', [absolute], { encoding: 'utf8' });
}

function writeDashboardReport({ receipt, previous, deltas, contactSheetPath, boardTasksPath, dedupePath, filing, dryRun = false }) {
  const outputDir = repoPath(receipt.outputDir);
  const evidenceBanner = dryRun
    ? '> **Evidence quality: non-quality / command-surface.** This was a dry-run. Dashboard deltas compare placeholder evidence against the previous real scorecard. Do not treat these as visual regressions.'
    : '';
  const lines = [
    `# HoloShell Format Gauntlet Dashboard - ${receipt.scenario}`,
    '',
    `Generated: ${receipt.generatedAt}`,
    `Scorecard: [scorecard.json](${relFrom(outputDir, repoPath(receipt.artifacts.scorecard))})`,
    `Contact sheet: [contact-sheet.md](${relFrom(outputDir, contactSheetPath)})`,
    `Board tasks: [board-tasks.json](${relFrom(outputDir, boardTasksPath)})`,
    `Deduped tasks: [board-tasks-dedupe.json](${relFrom(outputDir, dedupePath)})`,
    dryRun ? `Run mode: **dry-run** (non-quality evidence)` : '',
    '',
    '## Previous Run Delta',
    '',
  ];

  if (evidenceBanner) {
    lines.push(evidenceBanner, '');
  }

  if (previous) {
    lines.push(`Previous scorecard: \`${relRepo(previous.path)}\``);
  } else {
    lines.push('Previous scorecard: none found');
  }

  lines.push('', '| Metric | Previous | Current | Delta | Evidence |', '| --- | --- | --- | --- | --- |');
  for (const row of deltas) {
    lines.push(
      `| ${row.label} | ${row.previous ?? 'n/a'} | ${row.current ?? 'n/a'} | ${row.delta} | ${row.evidenceQuality} |`
    );
  }

  lines.push(
    '',
    '## Task Filing',
    '',
    `Filing status: ${filing.status}`,
    '',
    'Run this command to file deduped tasks with signing if filing was skipped:',
    '',
    '```bash',
    `node ${relRepo(resolve(ECOSYSTEM_ROOT, 'scripts/room-add-tasks.mjs'))} ${relRepo(dedupePath)}`,
    '```',
    ''
  );

  const reportPath = join(outputDir, 'dashboard-report.md');
  writeText(reportPath, `${lines.join('\n')}\n`);
  return reportPath;
}

export async function runHoloShellFormatGauntlet(rawOptions = {}) {
  const options = { ...parseArgs([]), ...rawOptions };
  const receipt = await runSegmentedCapture({
    manifest: options.manifest,
    out: options.out,
    date: options.date,
    width: options.width,
    height: options.height,
    waitFor: options.waitFor,
    baseStill: options.baseStill,
    replayStills: options.replayStills,
    dryRun: options.dryRun,
    skipScreenshot: options.skipScreenshot,
    skipHeadless: options.skipHeadless,
    json: false,
  });

  const outputDir = repoPath(receipt.outputDir);
  const currentScorecardPath = repoPath(receipt.artifacts.scorecard);
  const currentScorecard = readJson(currentScorecardPath);
  const previous = collectScorecards(
    resolve(REPO_ROOT, '.bench-logs/format-stress'),
    currentScorecard.scenario,
    currentScorecardPath
  )[0] || null;
  const deltas = compareScorecards(previous, currentScorecard, { dryRun: options.dryRun });
  const contactSheetPath = buildContactSheet(receipt, outputDir);
  const boardTasks = buildBoardTasks(receipt);
  const boardTasksPath = join(outputDir, 'board-tasks.json');
  writeJson(boardTasksPath, boardTasks);

  const dedupe = await dedupeTasks(boardTasks, options);
  const dedupedTaskBundle = {
    ...boardTasks,
    generatedAt: new Date().toISOString(),
    duplicateSearch: {
      status: dedupe.status,
      error: dedupe.error,
      localDuplicates: dedupe.localDuplicates,
      liveDuplicates: dedupe.liveDuplicates,
      removed: dedupe.localDuplicates.length + dedupe.liveDuplicates.length,
    },
    tasks: dedupe.tasks,
  };
  const dedupePath = join(outputDir, 'board-tasks-dedupe.json');
  writeJson(dedupePath, dedupedTaskBundle);

  const filing = fileTasksWithRoomHelper(dedupePath, options);
  const reportPath = writeDashboardReport({
    receipt,
    previous,
    deltas,
    contactSheetPath,
    boardTasksPath,
    dedupePath,
    filing,
    dryRun: options.dryRun,
  });

  if (options.open) {
    openArtifact(currentScorecardPath);
    openArtifact(contactSheetPath);
  }

  return {
    schema: 'holoshell-format-gauntlet-dashboard-v1',
    generatedAt: new Date().toISOString(),
    scenario: receipt.scenario,
    outputDir: receipt.outputDir,
    dryRun: options.dryRun,
    evidenceQuality: options.dryRun ? 'non-quality' : 'quality',
    artifacts: {
      scorecard: receipt.artifacts.scorecard,
      contactSheet: relRepo(contactSheetPath),
      dashboardReport: relRepo(reportPath),
      boardTasks: relRepo(boardTasksPath),
      dedupedBoardTasks: relRepo(dedupePath),
    },
    previousScorecard: previous ? relRepo(previous.path) : null,
    deltas,
    duplicateSearch: dedupedTaskBundle.duplicateSearch,
    taskCounts: {
      generated: boardTasks.tasks.length,
      deduped: dedupedTaskBundle.tasks.length,
    },
    filing,
  };
}

async function main() {
  const options = parseArgs();
  if (options.help) {
    console.log(usage());
    return;
  }

  const summary = await runHoloShellFormatGauntlet(options);
  if (options.json) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  console.log(`HoloShell gauntlet dashboard complete: ${summary.outputDir}`);
  console.log(`  Scorecard: ${summary.artifacts.scorecard}`);
  console.log(`  Contact sheet: ${summary.artifacts.contactSheet}`);
  console.log(`  Dashboard report: ${summary.artifacts.dashboardReport}`);
  console.log(`  Board tasks: ${summary.artifacts.boardTasks}`);
  console.log(`  Deduped tasks: ${summary.artifacts.dedupedBoardTasks}`);
  console.log(`  Generated tasks: ${summary.taskCounts.generated}`);
  console.log(`  Deduped tasks to file: ${summary.taskCounts.deduped}`);
  console.log(`  Task filing: ${summary.filing.status}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}

