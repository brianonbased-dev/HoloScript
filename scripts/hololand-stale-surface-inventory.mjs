#!/usr/bin/env node
/* global console, process */
import { execFileSync } from 'node:child_process';
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

const DEFAULT_MAX_AGE_DAYS = 60;

const GROUP_ROOTS = new Set([
  'examples',
  'packages/platform',
  'packages/ar',
  'packages/adapters',
  'packages/shared',
]);

const DEFAULT_CANDIDATE_ROOTS = [
  'examples',
  'packages/platform',
  'packages/ar',
  'packages/adapters',
  'packages/creation-tools',
  'packages/shared',
  'packages/spatial-builder',
  'packages/base-token-viz',
];

const SKIP_DIRS = new Set([
  '.git',
  '.next',
  '.scratch',
  '.tmp',
  '.venv',
  'coverage',
  'dist',
  'build',
  'out',
  'node_modules',
  'target',
]);

const TEXT_EXTENSIONS = new Set([
  '',
  '.cjs',
  '.css',
  '.holo',
  '.hs',
  '.hsplus',
  '.html',
  '.js',
  '.json',
  '.jsx',
  '.md',
  '.mjs',
  '.mts',
  '.ts',
  '.tsx',
  '.txt',
  '.yaml',
  '.yml',
]);

function normalizePath(path) {
  return path.replace(/\\/g, '/').replace(/^\.\//, '');
}

function parseArgs(argv) {
  const args = {
    root: process.cwd(),
    json: false,
    summary: false,
    maxAgeDays: DEFAULT_MAX_AGE_DAYS,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--root') {
      args.root = argv[index + 1];
      index += 1;
    } else if (arg === '--json') {
      args.json = true;
    } else if (arg === '--summary') {
      args.summary = true;
    } else if (arg === '--max-age-days') {
      args.maxAgeDays = Number(argv[index + 1]);
      index += 1;
    }
  }

  return args;
}

function safeReadJson(path) {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

function walkFiles(root, relativeRoot = '') {
  const absoluteRoot = join(root, relativeRoot);
  if (!existsSync(absoluteRoot)) return [];

  const entries = readdirSync(absoluteRoot, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const relativePath = normalizePath(join(relativeRoot, entry.name));
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      files.push(...walkFiles(root, relativePath));
    } else if (entry.isFile()) {
      files.push(relativePath);
    }
  }

  return files;
}

function listImmediateDirs(root, relativeRoot) {
  const absoluteRoot = join(root, relativeRoot);
  if (!existsSync(absoluteRoot)) return [];

  return readdirSync(absoluteRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !SKIP_DIRS.has(entry.name))
    .map((entry) => normalizePath(join(relativeRoot, entry.name)));
}

function discoverCandidates(root, candidateRoots = DEFAULT_CANDIDATE_ROOTS) {
  const candidates = new Map();

  for (const candidateRoot of candidateRoots) {
    const normalizedRoot = normalizePath(candidateRoot);
    const absoluteRoot = join(root, normalizedRoot);
    if (!existsSync(absoluteRoot)) continue;

    if (!GROUP_ROOTS.has(normalizedRoot)
      && (existsSync(join(absoluteRoot, 'package.json')) || normalizedRoot.startsWith('packages/'))) {
      candidates.set(normalizedRoot, normalizedRoot);
    }

    if (GROUP_ROOTS.has(normalizedRoot)) {
      for (const child of listImmediateDirs(root, normalizedRoot)) {
        candidates.set(child, child);
      }
    }
  }

  return Array.from(candidates.keys()).sort();
}

function readWorkspacePatterns(root) {
  const workspacePath = join(root, 'pnpm-workspace.yaml');
  if (!existsSync(workspacePath)) return [];

  return readFileSync(workspacePath, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .map((line) => line.match(/^-\s+(.+)$/)?.[1]?.replace(/^['"]|['"]$/g, ''))
    .filter(Boolean)
    .map(normalizePath);
}

function matchesWorkspacePattern(candidatePath, pattern) {
  if (pattern.endsWith('/*')) {
    const prefix = pattern.slice(0, -2);
    if (!candidatePath.startsWith(`${prefix}/`)) return false;
    return candidatePath.slice(prefix.length + 1).split('/').length === 1;
  }

  return candidatePath === pattern || candidatePath.startsWith(`${pattern}/`);
}

function workspaceCovered(candidatePath, patterns) {
  return patterns.some((pattern) => matchesWorkspacePattern(candidatePath, pattern));
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

function countGitFiles(root, candidatePath, mode) {
  const args = mode === 'untracked'
    ? ['ls-files', '--others', '--exclude-standard', '--', candidatePath]
    : ['ls-files', '--', candidatePath];
  return runGit(root, args).split(/\r?\n/).filter(Boolean).length;
}

function fileCountStats(root, candidatePath) {
  const files = walkFiles(root, candidatePath);
  const counts = {
    files: files.length,
    ts: 0,
    tsx: 0,
    js: 0,
    jsx: 0,
    holo: 0,
    hs: 0,
    hsplus: 0,
    packageJson: 0,
  };
  let latestMtimeMs = 0;

  for (const file of files) {
    const absolute = join(root, file);
    const stats = statSync(absolute);
    latestMtimeMs = Math.max(latestMtimeMs, stats.mtimeMs);

    const extension = extname(file).toLowerCase();
    if (file.endsWith('package.json')) counts.packageJson += 1;
    if (extension === '.ts' && !file.endsWith('.d.ts')) counts.ts += 1;
    if (extension === '.tsx') counts.tsx += 1;
    if (extension === '.js') counts.js += 1;
    if (extension === '.jsx') counts.jsx += 1;
    if (extension === '.holo') counts.holo += 1;
    if (extension === '.hs') counts.hs += 1;
    if (extension === '.hsplus') counts.hsplus += 1;
  }

  return {
    counts,
    latestMtimeMs,
    latestMtime: latestMtimeMs ? new Date(latestMtimeMs).toISOString() : null,
  };
}

function listReferenceFiles(root) {
  const roots = [
    '.github',
    'apps',
    'config',
    'docs',
    'examples',
    'packages',
    'scripts',
    'source',
    'package.json',
    'pnpm-workspace.yaml',
    'railway.json',
    'Dockerfile',
  ];

  const files = [];
  for (const referenceRoot of roots) {
    const full = join(root, referenceRoot);
    if (!existsSync(full)) continue;

    const stats = statSync(full);
    if (stats.isFile()) {
      files.push(normalizePath(referenceRoot));
    } else {
      files.push(...walkFiles(root, referenceRoot));
    }
  }

  return files
    .filter((file) => TEXT_EXTENSIONS.has(extname(file).toLowerCase()))
    .filter((file) => file !== 'scripts/hololand-stale-surface-inventory.mjs')
    .filter((file) => !/^docs\/audits\/HOLOLAND_STALE_SURFACE_INVENTORY_.*\.md$/.test(file))
    .filter((file) => {
      const stats = statSync(join(root, file));
      return stats.size <= 1_000_000;
    });
}

function candidateNeedles(root, candidatePath) {
  const packageJson = safeReadJson(join(root, candidatePath, 'package.json'));
  const leaf = basename(candidatePath);
  const needles = new Set([candidatePath]);

  if (packageJson?.name) needles.add(String(packageJson.name));
  if (leaf.length >= 6 && leaf.includes('-')) needles.add(leaf);

  return {
    packageName: packageJson?.name ?? null,
    scripts: Object.keys(packageJson?.scripts ?? {}).sort(),
    needles: Array.from(needles),
  };
}

function findReferences(root, candidatePath, referenceFiles, needles) {
  const lowerNeedles = needles.map((needle) => needle.toLowerCase());
  const references = [];

  for (const file of referenceFiles) {
    if (file === candidatePath || file.startsWith(`${candidatePath}/`)) continue;

    const absolute = join(root, file);
    let content = '';
    try {
      content = readFileSync(absolute, 'utf8');
    } catch {
      continue;
    }

    const lines = content.split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
      const lowerLine = lines[index].toLowerCase();
      const matchedNeedle = lowerNeedles.find((needle) => lowerLine.includes(needle));
      if (!matchedNeedle) continue;

      references.push({
        file,
        line: index + 1,
        matched: needles[lowerNeedles.indexOf(matchedNeedle)],
        text: lines[index].trim().slice(0, 240),
      });
    }
  }

  return references;
}

function isDeploymentReference(reference) {
  if (isHistoricalReference(reference)) return false;

  return /railway|vercel|netlify|docker|deploy|production|runtime-readiness|production-readiness|central\.hololand\.io|health check|start\.sh|workflow/i
    .test(`${reference.file} ${reference.text}`);
}

function isProofReference(reference) {
  if (isHistoricalReference(reference)) return false;

  return /holoscript|source contract|builder proof|native proof|runtime atlas|receipt|gate|frontier|enterprise|readiness|validation/i
    .test(`${reference.file} ${reference.text}`);
}

function isHistoricalReference(reference) {
  return reference.file.startsWith('docs/archive/')
    || reference.file.startsWith('docs/audits/');
}

function candidateKind(candidatePath) {
  if (candidatePath.startsWith('examples/')) return 'example';
  if (candidatePath.startsWith('packages/')) return 'package';
  return 'surface';
}

function classifyCandidate({ candidatePath, stats, ageDays, maxAgeDays, deploymentRefs, proofRefs }) {
  const sourceCount = stats.counts.holo + stats.counts.hs + stats.counts.hsplus;
  const tsLikeCount = stats.counts.ts + stats.counts.tsx + stats.counts.js + stats.counts.jsx;
  const reasons = [];

  if (sourceCount > 0) reasons.push(`has ${sourceCount} HoloScript-family source files`);
  if (tsLikeCount > 0) reasons.push(`has ${tsLikeCount} JS/TS bridge files`);
  if (deploymentRefs.length > 0) reasons.push(`has ${deploymentRefs.length} deployment references`);
  if (proofRefs.length > 0) reasons.push(`has ${proofRefs.length} proof/readiness references`);
  if (ageDays !== null && ageDays > maxAgeDays) reasons.push(`latest file is ${ageDays} days old`);

  if (sourceCount > 0 && tsLikeCount === 0) {
    return { status: 'active-proof', reasons };
  }

  if (sourceCount > 0 && tsLikeCount > 0) {
    return { status: 'bridge-debt', reasons };
  }

  if (deploymentRefs.length > 0 || proofRefs.length > 0) {
    return { status: 'watch', reasons };
  }

  if (ageDays !== null && ageDays > maxAgeDays) {
    return { status: 'jetson-archive-candidate', reasons };
  }

  reasons.push('no current proof/deployment evidence found, but age is below threshold');
  return { status: 'watch', reasons };
}

export function scanStaleSurfaces(options = {}) {
  const root = resolve(options.root ?? process.cwd());
  const maxAgeDays = Number.isFinite(options.maxAgeDays)
    ? options.maxAgeDays
    : DEFAULT_MAX_AGE_DAYS;
  const workspacePatterns = readWorkspacePatterns(root);
  const referenceFiles = listReferenceFiles(root);
  const generatedAt = new Date();
  const candidates = discoverCandidates(root, options.candidateRoots);
  const surfaces = [];

  for (const candidatePath of candidates) {
    const stats = fileCountStats(root, candidatePath);
    const ageDays = stats.latestMtimeMs
      ? Math.floor((generatedAt.getTime() - stats.latestMtimeMs) / 86_400_000)
      : null;
    const { packageName, scripts, needles } = candidateNeedles(root, candidatePath);
    const references = findReferences(root, candidatePath, referenceFiles, needles);
    const deploymentRefs = references.filter(isDeploymentReference);
    const proofRefs = references.filter(isProofReference);
    const classification = classifyCandidate({
      candidatePath,
      stats,
      ageDays,
      maxAgeDays,
      deploymentRefs,
      proofRefs,
    });

    surfaces.push({
      path: candidatePath,
      kind: candidateKind(candidatePath),
      status: classification.status,
      reasons: classification.reasons,
      packageName,
      scripts,
      workspaceCovered: workspaceCovered(candidatePath, workspacePatterns),
      trackedFiles: countGitFiles(root, candidatePath, 'tracked'),
      untrackedFiles: countGitFiles(root, candidatePath, 'untracked'),
      latestMtime: stats.latestMtime,
      ageDays,
      counts: stats.counts,
      references: {
        total: references.length,
        deployment: deploymentRefs.length,
        proof: proofRefs.length,
        samples: references.slice(0, 8),
      },
    });
  }

  const byStatus = surfaces.reduce((accumulator, surface) => {
    accumulator[surface.status] = (accumulator[surface.status] ?? 0) + 1;
    return accumulator;
  }, {});

  return {
    schema: 'hololand-stale-surface-inventory/v0.1.0',
    generatedAt: generatedAt.toISOString(),
    root,
    maxAgeDays,
    summary: {
      surfaceCount: surfaces.length,
      byStatus,
      archiveCandidateCount: byStatus['jetson-archive-candidate'] ?? 0,
      watchCount: byStatus.watch ?? 0,
      bridgeDebtCount: byStatus['bridge-debt'] ?? 0,
      activeProofCount: byStatus['active-proof'] ?? 0,
    },
    surfaces,
  };
}

function printSummary(report) {
  console.log(`HoloLand stale surface inventory: ${report.summary.surfaceCount} surfaces`);
  for (const [status, count] of Object.entries(report.summary.byStatus).sort()) {
    console.log(`  ${status}: ${count}`);
  }

  const archiveCandidates = report.surfaces
    .filter((surface) => surface.status === 'jetson-archive-candidate')
    .sort((a, b) => (b.ageDays ?? 0) - (a.ageDays ?? 0));

  if (archiveCandidates.length > 0) {
    console.log('');
    console.log('Top archive candidates:');
    for (const surface of archiveCandidates.slice(0, 12)) {
      const sourceCount = surface.counts.holo + surface.counts.hs + surface.counts.hsplus;
      const bridgeCount = surface.counts.ts + surface.counts.tsx + surface.counts.js + surface.counts.jsx;
      console.log(`  - ${surface.path} (${surface.ageDays}d, source=${sourceCount}, js/ts=${bridgeCount}, refs=${surface.references.total})`);
    }
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = parseArgs(process.argv.slice(2));
  const report = scanStaleSurfaces(args);

  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printSummary(report);
  }
}
