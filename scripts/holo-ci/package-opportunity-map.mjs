#!/usr/bin/env node
/**
 * Builds a package-fostering map from recent Git history, package manifests,
 * documentation coverage, release/consumption manifests, and the local Absorb
 * graph cache when available.
 *
 * This is intentionally a report, not a gate. Use it before promoting,
 * deprecating, or creating package surfaces.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const __dirname = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const JSON_OUT = args.includes('--json');
const SELF_TEST = args.includes('--self-test');
const rootIdx = args.indexOf('--root');
const sinceIdx = args.indexOf('--since');
const topIdx = args.indexOf('--top');
const graphCacheIdx = args.indexOf('--graph-cache');

const ROOT = rootIdx >= 0 ? resolve(args[rootIdx + 1]) : resolve(__dirname, '..', '..');
const SINCE = sinceIdx >= 0 ? args[sinceIdx + 1] : '180 days ago';
const TOP = topIdx >= 0 ? Number(args[topIdx + 1]) : 12;
const GRAPH_CACHE =
  graphCacheIdx >= 0
    ? resolve(args[graphCacheIdx + 1])
    : join(homedir(), '.holoscript', 'graph-cache.json');

const MANIFESTS = {
  release: join(ROOT, 'scripts', 'holo-ci', 'npm-v1-release-manifest.json'),
  consumption: join(ROOT, 'scripts', 'holo-ci', 'package-consumption-manifest.json'),
  utilities: join(ROOT, 'scripts', 'holo-ci', 'fleet-utilities-manifest.json'),
  publishAllowlist: join(ROOT, 'scripts', 'holo-ci', 'publish-surface-allowlist.json'),
};

function readJson(path, fallback = null) {
  if (!existsSync(path)) return fallback;
  return JSON.parse(readFileSync(path, 'utf8'));
}

function normalizeRepoPath(value) {
  return String(value || '').replace(/\\/g, '/');
}

function normalizePackageName(name) {
  return String(name || '').replace(/^@[^/]+\//, '');
}

function sortedSet(values) {
  return [...new Set(values.filter(Boolean))].sort();
}

function safeIncludes(haystack, needle) {
  return haystack.includes(String(needle || ''));
}

function isGeneratedWasmPackManifest(root, manifestPath) {
  const rel = normalizeRepoPath(relative(root, manifestPath));
  return /^packages\/compiler-wasm\/pkg(?:-node|-bundler)?\/package\.json$/.test(rel);
}

function walkPackageJsons(root) {
  const roots = [join(root, 'packages')];
  const found = [];

  for (const packagesRoot of roots) {
    if (!existsSync(packagesRoot)) continue;
    for (const entry of readdirSync(packagesRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const direct = join(packagesRoot, entry.name, 'package.json');
      if (existsSync(direct)) found.push(direct);

      const nestedRoot = join(packagesRoot, entry.name);
      for (const nested of readdirSync(nestedRoot, { withFileTypes: true })) {
        if (!nested.isDirectory()) continue;
        const nestedPackage = join(nestedRoot, nested.name, 'package.json');
        if (existsSync(nestedPackage) && !isGeneratedWasmPackManifest(root, nestedPackage)) {
          found.push(nestedPackage);
        }
      }
    }
  }

  return sortedSet(found);
}

function readPackages(root) {
  return walkPackageJsons(root)
    .map((manifestPath) => {
      const manifest = readJson(manifestPath);
      const packageDir = normalizeRepoPath(relative(root, dirname(manifestPath)));
      return {
        name: manifest.name,
        dir: packageDir,
        dirBase: basename(packageDir),
        private: manifest.private === true,
        description: manifest.description || '',
        manifestPath: normalizeRepoPath(relative(root, manifestPath)),
      };
    })
    .filter((pkg) => pkg.name)
    .sort((a, b) => a.dir.localeCompare(b.dir));
}

function docCandidates(pkg) {
  const nameBase = normalizePackageName(pkg.name);
  return sortedSet([
    `${pkg.dirBase}.md`,
    `${nameBase}.md`,
    `${nameBase.replace(/^wasm$/, 'compiler-wasm')}.md`,
  ]).map((file) => `docs/packages/${file}`);
}

function packageDocPath(root, pkg) {
  return docCandidates(pkg).find((candidate) => existsSync(join(root, candidate))) || null;
}

function readText(path) {
  return existsSync(path) ? readFileSync(path, 'utf8') : '';
}

function laneSets(root) {
  const release = readJson(MANIFESTS.release, {});
  const consumption = readJson(MANIFESTS.consumption, {});
  const utilities = readJson(MANIFESTS.utilities, {});
  const publishAllowlist = readJson(MANIFESTS.publishAllowlist, {});

  return {
    releaseCandidates: new Set(
      (release.candidatePackages || []).map((item) =>
        typeof item === 'string' ? item : item?.name
      )
    ),
    consumedNpm: new Set((consumption.npmPackages || []).map((item) => item.name)),
    consumedPypiDirs: new Set(
      (consumption.pypiPackages || []).map((item) => normalizeRepoPath(item.packageDir))
    ),
    utilityNpm: new Set((utilities.utilities || []).map((item) => item.packageName).filter(Boolean)),
    utilityPypiDirs: new Set(
      (utilities.utilities || [])
        .map((item) => item.pypiPackage)
        .filter(Boolean)
        .flatMap((name) =>
          (consumption.pypiPackages || [])
            .filter((item) => item.name === name)
            .map((item) => normalizeRepoPath(item.packageDir))
        )
    ),
    publishAllowlist: new Set(publishAllowlist.packages || []),
    pypiNames: new Set((consumption.pypiPackages || []).map((item) => item.name)),
    root,
  };
}

function packageForPath(file, packages) {
  const normalized = normalizeRepoPath(file);
  return packages
    .slice()
    .sort((a, b) => b.dir.length - a.dir.length)
    .find((pkg) => normalized === pkg.dir || normalized.startsWith(`${pkg.dir}/`));
}

function collectGitHistory(root, since, packages) {
  const stdout = execFileSync(
    'git',
    [
      'log',
      `--since=${since}`,
      '--name-only',
      '--pretty=format:__COMMIT__%x09%H%x09%cs%x09%s',
      '--',
      'packages',
      'package.json',
      'pnpm-lock.yaml',
      'scripts/holo-ci',
      'docs/packages',
      'docs/handbooks',
      'docs/PACKAGE_OWNERSHIP.md',
    ],
    { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }
  );

  const packageStats = new Map();
  const orphanPackageDirs = new Map();
  const touchedPaths = new Map();
  let commit = null;
  const seenPackageCommit = new Set();
  const commitIds = new Set();

  function ensurePackage(pkg) {
    if (!packageStats.has(pkg.name)) {
      packageStats.set(pkg.name, {
        name: pkg.name,
        dir: pkg.dir,
        commits: 0,
        files: 0,
        manifestTouches: 0,
      });
    }
    return packageStats.get(pkg.name);
  }

  for (const rawLine of stdout.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    if (line.startsWith('__COMMIT__\t')) {
      const [, hash, date, ...subjectParts] = line.split('\t');
      commit = { hash, date, subject: subjectParts.join('\t') };
      commitIds.add(hash);
      continue;
    }

    touchedPaths.set(line, (touchedPaths.get(line) || 0) + 1);
    const pkg = packageForPath(line, packages);
    if (pkg) {
      const stats = ensurePackage(pkg);
      stats.files += 1;
      if (line === pkg.manifestPath) stats.manifestTouches += 1;
      const packageCommitKey = `${pkg.name}:${commit?.hash || '<unknown>'}`;
      if (!seenPackageCommit.has(packageCommitKey)) {
        seenPackageCommit.add(packageCommitKey);
        stats.commits += 1;
      }
      continue;
    }

    const orphanMatch = normalizeRepoPath(line).match(/^packages\/([^/]+)(?:\/|$)/);
    if (orphanMatch) {
      const key = `packages/${orphanMatch[1]}`;
      const row = orphanPackageDirs.get(key) || { dir: key, files: 0, commits: new Set() };
      row.files += 1;
      if (commit?.hash) row.commits.add(commit.hash);
      orphanPackageDirs.set(key, row);
    }
  }

  return {
    commitCount: commitIds.size,
    packageStats,
    touchedPaths,
    orphanPackageDirs: [...orphanPackageDirs.values()].map((row) => ({
      dir: row.dir,
      files: row.files,
      commits: row.commits.size,
    })),
  };
}

function readGraphCache(cachePath, packages) {
  if (!existsSync(cachePath)) {
    return { available: false, path: cachePath, packages: new Map() };
  }

  const stat = statSync(cachePath);
  const outer = readJson(cachePath, {});
  const graph = outer.graphJson ? JSON.parse(outer.graphJson) : {};
  const packageCounts = new Map();
  const graphRoot = normalizeRepoPath(outer.rootDir || graph.rootDir || '');
  const rootPackage = packages
    .slice()
    .sort((a, b) => b.dir.length - a.dir.length)
    .find((pkg) => {
      const normalizedDir = normalizeRepoPath(pkg.dir).toLowerCase();
      const root = graphRoot.toLowerCase();
      return root.endsWith(`/${normalizedDir}`) || root.endsWith(`/${pkg.dirBase.toLowerCase()}`);
    });

  for (const file of graph.files || []) {
    const normalized = normalizeRepoPath(file.path);
    const pkg = packages.find((candidate) => {
      const needle = `/${candidate.dir}/`.toLowerCase();
      return normalized.toLowerCase().includes(needle);
    }) || rootPackage;
    if (!pkg) continue;
    const row = packageCounts.get(pkg.name) || { graphFiles: 0, graphSymbols: 0 };
    row.graphFiles += 1;
    row.graphSymbols += Array.isArray(file.symbols) ? file.symbols.length : 0;
    packageCounts.set(pkg.name, row);
  }

  return {
    available: true,
    path: cachePath,
    lastWriteTime: stat.mtime.toISOString(),
    timestamp: outer.timestamp ? new Date(outer.timestamp).toISOString() : null,
    gitCommitHash: outer.gitCommitHash || null,
    rootDir: graphRoot || null,
    stats: outer.stats || {},
    packages: packageCounts,
  };
}

function buildRows({ packages, lanes, history, graph, root }) {
  const governanceText = readText(join(root, 'docs', 'packages', 'governance.md'));
  const ownershipText = readText(join(root, 'docs', 'PACKAGE_OWNERSHIP.md'));

  return packages.map((pkg) => {
    const historyRow = history.packageStats.get(pkg.name) || {
      commits: 0,
      files: 0,
      manifestTouches: 0,
    };
    const graphRow = graph.packages.get(pkg.name) || { graphFiles: 0, graphSymbols: 0 };
    const docPath = packageDocPath(root, pkg);
    const publicSurface = !pkg.private;
    const row = {
      name: pkg.name,
      dir: pkg.dir,
      public: publicSurface,
      publishAllowlisted: lanes.publishAllowlist.has(pkg.name),
      releaseCandidate: lanes.releaseCandidates.has(pkg.name),
      fleetConsumed: lanes.consumedNpm.has(pkg.name),
      fleetUtility: lanes.utilityNpm.has(pkg.name),
      docsPath: docPath,
      hasDocs: Boolean(docPath),
      hasGovernance: safeIncludes(governanceText, pkg.name),
      hasOwnership: safeIncludes(ownershipText, pkg.name),
      commits: historyRow.commits,
      changedFiles: historyRow.files,
      manifestTouches: historyRow.manifestTouches,
      graphFiles: graphRow.graphFiles,
      graphSymbols: graphRow.graphSymbols,
    };
    row.score =
      row.commits * 5 +
      row.changedFiles +
      row.manifestTouches * 3 +
      row.graphFiles * 2 +
      row.graphSymbols * 0.1 +
      (row.public && !row.hasDocs ? 25 : 0) +
      (row.public && !row.hasGovernance ? 12 : 0) +
      (row.public && !row.hasOwnership ? 8 : 0) +
      (row.fleetConsumed ? 10 : 0) +
      (row.releaseCandidate ? 8 : 0);
    return row;
  });
}

function buildRecommendations(rows, history) {
  const hotPublic = rows
    .filter((row) => row.public && (row.commits > 0 || row.graphFiles > 0))
    .sort((a, b) => b.score - a.score);

  const recommendations = [];

  for (const row of hotPublic) {
    const gaps = [];
    if (!row.hasDocs) gaps.push('package docs');
    if (!row.hasGovernance) gaps.push('governance row');
    if (!row.hasOwnership) gaps.push('ownership row');
    if (!gaps.length) continue;
    recommendations.push({
      kind: 'foster-existing-package',
      package: row.name,
      dir: row.dir,
      score: Number(row.score.toFixed(1)),
      evidence: {
        commits: row.commits,
        changedFiles: row.changedFiles,
        graphFiles: row.graphFiles,
        graphSymbols: row.graphSymbols,
      },
      gaps,
    });
  }

  for (const row of history.orphanPackageDirs.sort((a, b) => b.commits - a.commits || b.files - a.files)) {
    if (row.commits === 0) continue;
    recommendations.push({
      kind: 'new-package-candidate',
      dir: row.dir,
      score: row.commits * 5 + row.files,
      evidence: {
        commits: row.commits,
        changedFiles: row.files,
      },
      note: 'Only scaffold a new package after confirming no existing package owns this cluster.',
    });
  }

  return recommendations.sort((a, b) => b.score - a.score);
}

function buildMap(root = ROOT, since = SINCE) {
  const packages = readPackages(root);
  const lanes = laneSets(root);
  const history = collectGitHistory(root, since, packages);
  const graph = readGraphCache(GRAPH_CACHE, packages);
  const rows = buildRows({ packages, lanes, history, graph, root });
  const recommendations = buildRecommendations(rows, history);

  return {
    ok: true,
    since,
    root,
    history: {
      commitCount: history.commitCount,
    },
    graph: {
      available: graph.available,
      path: graph.path,
      lastWriteTime: graph.lastWriteTime,
      timestamp: graph.timestamp,
      gitCommitHash: graph.gitCommitHash,
      rootDir: graph.rootDir,
      packages: [...graph.packages.entries()]
        .map(([name, row]) => ({ name, ...row }))
        .sort((a, b) => b.graphFiles - a.graphFiles || b.graphSymbols - a.graphSymbols),
    },
    packages: rows.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name)),
    recommendations,
  };
}

function runSelfTest() {
  assert.equal(
    isGeneratedWasmPackManifest('C:/repo', 'C:/repo/packages/compiler-wasm/pkg/package.json'),
    true
  );
  assert.equal(
    isGeneratedWasmPackManifest('C:/repo', 'C:/repo/packages/compiler-wasm/pkg-node/package.json'),
    true
  );
  assert.equal(
    isGeneratedWasmPackManifest('C:/repo', 'C:/repo/packages/compiler-wasm/pkg-bundler/package.json'),
    true
  );
  assert.equal(
    isGeneratedWasmPackManifest('C:/repo', 'C:/repo/packages/compiler-wasm/package.json'),
    false
  );

  const root = 'C:/repo';
  const packages = [
    {
      name: '@scope/hot',
      dir: 'packages/hot',
      dirBase: 'hot',
      private: false,
      manifestPath: 'packages/hot/package.json',
      description: '',
    },
    {
      name: '@scope/private',
      dir: 'packages/private',
      dirBase: 'private',
      private: true,
      manifestPath: 'packages/private/package.json',
      description: '',
    },
  ];
  const lanes = {
    releaseCandidates: new Set(['@scope/hot']),
    consumedNpm: new Set(['@scope/hot']),
    utilityNpm: new Set(['@scope/hot']),
    publishAllowlist: new Set(['@scope/hot']),
  };
  const history = {
    packageStats: new Map([
      ['@scope/hot', { commits: 3, files: 5, manifestTouches: 1 }],
      ['@scope/private', { commits: 5, files: 9, manifestTouches: 0 }],
    ]),
    orphanPackageDirs: [{ dir: 'packages/unowned', commits: 2, files: 4 }],
  };
  const graph = {
    packages: new Map([['@scope/hot', { graphFiles: 2, graphSymbols: 10 }]]),
  };
  const rows = buildRows({
    packages,
    lanes,
    history,
    graph,
    root,
  });
  const hot = rows.find((row) => row.name === '@scope/hot');
  assert.equal(hot.public, true);
  assert.equal(hot.hasDocs, false);
  assert.equal(hot.graphFiles, 2);

  const recommendations = buildRecommendations(rows, history);
  assert.equal(recommendations[0].kind, 'foster-existing-package');
  assert.equal(recommendations[0].package, '@scope/hot');
  assert.ok(recommendations.some((item) => item.kind === 'new-package-candidate'));
  console.log('[package-opportunity-map] self-test PASS');
}

function printHuman(map) {
  console.log(`[package-opportunity-map] since: ${map.since}`);
  console.log(`[package-opportunity-map] git commits scanned: ${map.history.commitCount}`);
  if (map.graph.available) {
    const graphPackages = map.graph.packages
      .slice(0, 5)
      .map((row) => `${row.name} (${row.graphFiles} files/${row.graphSymbols} symbols)`)
      .join(', ');
    const rootHint = map.graph.rootDir ? ` root=${normalizeRepoPath(map.graph.rootDir)}` : '';
    console.log(
      `[package-opportunity-map] absorb cache: ${map.graph.lastWriteTime || '<unknown>'} commit=${map.graph.gitCommitHash || '<unknown>'}${rootHint}`
    );
    console.log(`[package-opportunity-map] absorb package coverage: ${graphPackages || '<none>'}`);
  } else {
    console.log(`[package-opportunity-map] absorb cache: missing at ${map.graph.path}`);
  }

  console.log('[package-opportunity-map] top package opportunities:');
  for (const row of map.packages.slice(0, TOP)) {
    const flags = [
      row.public ? 'public' : 'private',
      row.releaseCandidate ? 'v1' : null,
      row.fleetConsumed ? 'fleet-consumed' : null,
      row.publishAllowlisted ? 'allowlisted' : null,
      row.hasDocs ? 'docs' : 'missing-docs',
      row.hasGovernance ? 'governed' : 'missing-governance',
      row.hasOwnership ? 'owned' : 'missing-owner',
    ]
      .filter(Boolean)
      .join(', ');
    console.log(
      `  - ${row.name}: score=${row.score.toFixed(1)} commits=${row.commits} files=${row.changedFiles} graph=${row.graphFiles}/${row.graphSymbols} [${flags}]`
    );
  }

  console.log('[package-opportunity-map] recommendations:');
  for (const item of map.recommendations.slice(0, TOP)) {
    if (item.kind === 'foster-existing-package') {
      console.log(
        `  - foster ${item.package}: ${item.gaps.join(', ')} (commits=${item.evidence.commits}, graph=${item.evidence.graphFiles}/${item.evidence.graphSymbols})`
      );
    } else {
      console.log(
        `  - consider new package at ${item.dir}: commits=${item.evidence.commits}, files=${item.evidence.changedFiles}`
      );
    }
  }
}

if (SELF_TEST) {
  runSelfTest();
} else {
  const map = buildMap();
  if (JSON_OUT) {
    console.log(JSON.stringify(map, null, 2));
  } else {
    printHuman(map);
  }
}
