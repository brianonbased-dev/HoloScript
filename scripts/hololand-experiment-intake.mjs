#!/usr/bin/env node
/* global console, process */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
} from 'node:fs';
import {
  basename,
  extname,
  join,
  relative,
  resolve,
} from 'node:path';
import { pathToFileURL } from 'node:url';

const DEFAULT_EXPERIMENT_ROOT = 'experiments/holoshell-human-os-frontier';
const DEFAULT_APP_SOURCE_ROOT = 'apps/holoshell/source';

const CORE_TYPES = ['room', 'policy', 'pipeline'];

const TYPE_SUFFIXES = [
  { type: 'room', suffix: '-room.holo' },
  { type: 'policy', suffix: '-policy.hsplus' },
  { type: 'pipeline', suffix: '-pipeline.hs' },
];

function normalizePath(path) {
  return path.replace(/\\/g, '/').replace(/^\.\//, '');
}

function parseArgs(argv) {
  const args = {
    root: process.cwd(),
    experimentRoot: DEFAULT_EXPERIMENT_ROOT,
    appSourceRoot: DEFAULT_APP_SOURCE_ROOT,
    json: false,
    summary: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--root') {
      args.root = argv[index + 1];
      index += 1;
    } else if (arg === '--experiment-root') {
      args.experimentRoot = argv[index + 1];
      index += 1;
    } else if (arg === '--app-source-root') {
      args.appSourceRoot = argv[index + 1];
      index += 1;
    } else if (arg === '--json') {
      args.json = true;
    } else if (arg === '--summary') {
      args.summary = true;
    }
  }

  return args;
}

function runGit(root, args) {
  try {
    return execFileSync('git', args, {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    return '';
  }
}

function readTrackedFileSet(root, experimentRoot) {
  const output = runGit(root, ['ls-files', '--', experimentRoot]);
  return new Set(output.split(/\r?\n/).filter(Boolean).map(normalizePath));
}

function listExperimentFiles(root, experimentRoot) {
  const absoluteRoot = join(root, experimentRoot);
  if (!existsSync(absoluteRoot)) return [];

  return readdirSync(absoluteRoot, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => normalizePath(join(experimentRoot, entry.name)))
    .sort();
}

function parseExperimentFile(filePath) {
  const fileName = basename(filePath);

  for (const { type, suffix } of TYPE_SUFFIXES) {
    if (fileName.endsWith(suffix)) {
      return {
        workflow: fileName.slice(0, -suffix.length),
        type,
        sourceLike: true,
      };
    }
  }

  if (extname(fileName) === '.mjs') {
    return {
      workflow: fileName.slice(0, -4),
      type: 'utility',
      sourceLike: false,
    };
  }

  return {
    workflow: fileName,
    type: 'unknown',
    sourceLike: false,
  };
}

function appSourcePath(appSourceRoot, workflow, type) {
  const suffixByType = {
    room: 'room.holo',
    policy: 'policy.hsplus',
    pipeline: 'pipeline.hs',
  };
  return normalizePath(join(appSourceRoot, `holoshell-${workflow}-${suffixByType[type]}`));
}

function sha256File(path) {
  const hash = createHash('sha256');
  hash.update(readFileSync(path));
  return hash.digest('hex');
}

function promotedSourceChecks(root, appSourceRoot, workflow, filesByType) {
  return CORE_TYPES
    .filter((type) => filesByType.has(type))
    .map((type) => {
      const experimentPath = filesByType.get(type).path;
      const promotedPath = appSourcePath(appSourceRoot, workflow, type);
      if (!existsSync(join(root, promotedPath))) return null;

      const experimentSha256 = sha256File(join(root, experimentPath));
      const promotedSha256 = sha256File(join(root, promotedPath));
      return {
        type,
        experimentPath,
        promotedPath,
        experimentSha256,
        promotedSha256,
        contentMatches: experimentSha256 === promotedSha256,
      };
    })
    .filter(Boolean);
}

function relatedAppSourceFiles(root, appSourceRoot, workflow) {
  const absoluteRoot = join(root, appSourceRoot);
  if (!existsSync(absoluteRoot)) return [];

  const fragments = workflow.split('-').filter((part) => part.length >= 4);
  if (fragments.length === 0) return [];

  return readdirSync(absoluteRoot, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => normalizePath(join(appSourceRoot, entry.name)))
    .filter((file) => {
      const lower = basename(file).toLowerCase();
      return fragments.some((fragment) => lower.includes(fragment.toLowerCase()));
    })
    .sort();
}

function countByStatus(groups) {
  return groups.reduce((accumulator, group) => {
    accumulator[group.status] = (accumulator[group.status] ?? 0) + 1;
    return accumulator;
  }, {});
}

function classifyCoreGroup({ present, untrackedFileCount, exactPromotedSourceChecks }) {
  const presentCoreCount = CORE_TYPES.filter((type) => present[type]).length;
  const missing = CORE_TYPES.filter((type) => !present[type]);
  const allPresentCorePromoted = exactPromotedSourceChecks.length >= presentCoreCount
    && presentCoreCount > 0;
  const hasPromotedDrift = exactPromotedSourceChecks.some((entry) => !entry.contentMatches);

  if (allPresentCorePromoted && !hasPromotedDrift) {
    return {
      status: 'duplicate-of-app-source',
      recommendedAction: 'archive_duplicate_after_checksum',
      missing,
    };
  }

  if (hasPromotedDrift) {
    return {
      status: 'promoted-drift',
      recommendedAction: 'diff_promoted_sources_then_merge_or_archive_superseded_variant',
      missing,
    };
  }

  if (exactPromotedSourceChecks.length > 0) {
    return {
      status: 'partially-promoted',
      recommendedAction: 'compare_promoted_sources_then_complete_or_archive',
      missing,
    };
  }

  if (missing.length === 0 && untrackedFileCount > 0) {
    return {
      status: 'promote-or-archive',
      recommendedAction: 'read_validate_then_promote_or_archive_to_jetson',
      missing,
    };
  }

  if (missing.length === 0) {
    return {
      status: 'tracked-intake',
      recommendedAction: 'keep_visible_until_promoted_or_boarded',
      missing,
    };
  }

  return {
    status: 'incomplete-intake',
    recommendedAction: 'complete_trio_or_file_explicit_archive_task',
    missing,
  };
}

function buildCoreGroup(root, appSourceRoot, workflow, files) {
  const filesByType = new Map(files.map((file) => [file.type, file]));
  const present = Object.fromEntries(CORE_TYPES.map((type) => [type, filesByType.has(type)]));
  const exactPromotedSourceChecks = promotedSourceChecks(root, appSourceRoot, workflow, filesByType);
  const exactPromotedSources = exactPromotedSourceChecks.map((entry) => entry.promotedPath);
  const trackedFileCount = files.filter((file) => file.tracked).length;
  const untrackedFileCount = files.filter((file) => !file.tracked).length;
  const classification = classifyCoreGroup({
    present,
    untrackedFileCount,
    exactPromotedSourceChecks,
  });

  return {
    workflow,
    kind: 'workflow-trio',
    status: classification.status,
    recommendedAction: classification.recommendedAction,
    files,
    present,
    missing: classification.missing,
    trackedFileCount,
    untrackedFileCount,
    exactPromotedSources,
    exactPromotedSourceChecks,
    relatedAppSourceFiles: relatedAppSourceFiles(root, appSourceRoot, workflow)
      .filter((file) => !exactPromotedSources.includes(file))
      .slice(0, 8),
  };
}

function buildUtilityGroup(workflow, files) {
  const trackedFileCount = files.filter((file) => file.tracked).length;
  const untrackedFileCount = files.filter((file) => !file.tracked).length;

  return {
    workflow,
    kind: 'utility',
    status: 'utility-watch',
    recommendedAction: 'keep_or_archive_with_parent_workflow_receipt',
    files,
    present: {},
    missing: [],
    trackedFileCount,
    untrackedFileCount,
    exactPromotedSources: [],
    exactPromotedSourceChecks: [],
    relatedAppSourceFiles: [],
  };
}

export function scanHumanOsFrontierExperiments(options = {}) {
  const root = resolve(options.root ?? process.cwd());
  const experimentRoot = normalizePath(options.experimentRoot ?? DEFAULT_EXPERIMENT_ROOT);
  const appSourceRoot = normalizePath(options.appSourceRoot ?? DEFAULT_APP_SOURCE_ROOT);
  const trackedFiles = options.trackedFiles
    ? new Set(options.trackedFiles.map(normalizePath))
    : readTrackedFileSet(root, experimentRoot);
  const files = listExperimentFiles(root, experimentRoot)
    .map((filePath) => {
      const parsed = parseExperimentFile(filePath);
      const absolutePath = join(root, filePath);
      return {
        path: filePath,
        name: basename(filePath),
        workflow: parsed.workflow,
        type: parsed.type,
        sourceLike: parsed.sourceLike,
        tracked: trackedFiles.has(filePath),
        sizeBytes: statSync(absolutePath).size,
      };
    });

  const workflowBuckets = new Map();
  const utilityBuckets = new Map();
  for (const file of files) {
    const buckets = CORE_TYPES.includes(file.type) ? workflowBuckets : utilityBuckets;
    if (!buckets.has(file.workflow)) buckets.set(file.workflow, []);
    buckets.get(file.workflow).push(file);
  }

  const groups = [
    ...Array.from(workflowBuckets.entries())
      .map(([workflow, bucket]) => buildCoreGroup(root, appSourceRoot, workflow, bucket)),
    ...Array.from(utilityBuckets.entries())
      .map(([workflow, bucket]) => buildUtilityGroup(workflow, bucket)),
  ].sort((a, b) => a.workflow.localeCompare(b.workflow));
  const sourceGroups = groups.filter((group) => group.kind === 'workflow-trio');
  const byStatus = countByStatus(groups);

  return {
    schema: 'hololand-experiment-intake/v0.1.0',
    generatedAt: new Date().toISOString(),
    root,
    experimentRoot,
    appSourceRoot,
    summary: {
      groupCount: groups.length,
      workflowCount: sourceGroups.length,
      sourceFileCount: files.filter((file) => file.sourceLike).length,
      untrackedSourceFileCount: files.filter((file) => file.sourceLike && !file.tracked).length,
      trackedSourceFileCount: files.filter((file) => file.sourceLike && file.tracked).length,
      byStatus,
      duplicateWorkflowCount: byStatus['duplicate-of-app-source'] ?? 0,
      promoteOrArchiveWorkflowCount: byStatus['promote-or-archive'] ?? 0,
      trackedIntakeWorkflowCount: byStatus['tracked-intake'] ?? 0,
      incompleteWorkflowCount: byStatus['incomplete-intake'] ?? 0,
    },
    groups,
  };
}

function printSummary(report) {
  console.log(`HoloLand Human OS experiment intake: ${report.summary.workflowCount} workflows`);
  console.log(`  source files: ${report.summary.sourceFileCount}`);
  console.log(`  tracked source files: ${report.summary.trackedSourceFileCount}`);
  console.log(`  untracked source files: ${report.summary.untrackedSourceFileCount}`);
  console.log('');
  for (const [status, count] of Object.entries(report.summary.byStatus).sort()) {
    console.log(`  ${status}: ${count}`);
  }

  const printableStatuses = [
    'duplicate-of-app-source',
    'promoted-drift',
    'promote-or-archive',
    'partially-promoted',
    'tracked-intake',
    'incomplete-intake',
    'utility-watch',
  ];

  for (const status of printableStatuses) {
    const matches = report.groups.filter((group) => group.status === status);
    if (matches.length === 0) continue;

    console.log('');
    console.log(`${status}:`);
    for (const group of matches) {
      const files = group.files.map((file) => `${file.type}${file.tracked ? ':tracked' : ':untracked'}`).join(', ');
      console.log(`  - ${group.workflow} (${files}) -> ${group.recommendedAction}`);
      if (group.exactPromotedSources.length > 0) {
        console.log(`    promoted: ${group.exactPromotedSources.join(', ')}`);
      }
      const drift = group.exactPromotedSourceChecks.filter((entry) => !entry.contentMatches);
      if (drift.length > 0) {
        console.log(`    drift: ${drift.map((entry) => `${entry.type}:${entry.experimentSha256.slice(0, 12)}!=${entry.promotedSha256.slice(0, 12)}`).join(', ')}`);
      }
      if (group.missing.length > 0) {
        console.log(`    missing: ${group.missing.join(', ')}`);
      }
    }
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = parseArgs(process.argv.slice(2));
  const report = scanHumanOsFrontierExperiments(args);

  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printSummary(report);
  }
}
