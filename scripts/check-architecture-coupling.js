#!/usr/bin/env node

/**
 * Architecture Coupling Guard
 *
 * Detects direct mutual workspace dependency pairs and fails on any pair not
 * explicitly allowlisted. Workspace discovery follows the root package.json,
 * so nested plugin and benchmark packages cannot silently escape the guard.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
// Runtime fields create actual circular dependency risk at build/runtime.
// devDependencies are only needed at dev/test time; mutual dev-only pairs are
// tracked as warnings but do not fail the build.
const RUNTIME_DEP_FIELDS = ['dependencies', 'peerDependencies'];
const ALL_DEP_FIELDS = ['dependencies', 'devDependencies', 'peerDependencies'];

// Known legacy RUNTIME mutual-coupling pairs (kept explicit until refactor lands).
// Note: core<->framework was removed: framework is only in core's devDependencies.
// Note: core<->mesh was removed: mesh is only a reverse devDependency of core.
const ALLOWED_MUTUAL_PAIRS = new Set([
  normalizePair('@holoscript/core', '@holoscript/engine'),
  normalizePair('@holoscript/core', '@holoscript/platform'),
]);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''));
}

function normalizePair(a, b) {
  return [a, b].sort().join(' <-> ');
}

function loadWorkspaceGlobs(root = ROOT) {
  const manifest = readJson(path.join(root, 'package.json'));
  const workspaces = Array.isArray(manifest.workspaces)
    ? manifest.workspaces
    : manifest.workspaces?.packages;

  if (!Array.isArray(workspaces)) {
    throw new Error('root package.json must declare workspaces as an array');
  }

  return workspaces;
}

function expandWorkspaceGlob(root, workspaceGlob) {
  const segments = workspaceGlob.replace(/\\/g, '/').split('/').filter(Boolean);
  const results = [];

  function visit(currentPath, index) {
    if (index === segments.length) {
      const manifestPath = path.join(currentPath, 'package.json');
      if (fs.existsSync(manifestPath)) results.push(manifestPath);
      return;
    }

    const segment = segments[index];
    if (segment === '*') {
      if (!fs.existsSync(currentPath)) return;
      for (const entry of fs.readdirSync(currentPath, { withFileTypes: true })) {
        if (entry.isDirectory()) visit(path.join(currentPath, entry.name), index + 1);
      }
      return;
    }

    if (segment.includes('*')) {
      throw new Error(`unsupported workspace glob segment: ${segment}`);
    }
    visit(path.join(currentPath, segment), index + 1);
  }

  visit(root, 0);
  return results.sort();
}

function loadWorkspacePackages(options = {}) {
  const root = options.root || ROOT;
  const workspaceGlobs = options.workspaceGlobs || loadWorkspaceGlobs(root);
  const packages = [];
  const seenManifestPaths = new Set();

  for (const workspaceGlob of workspaceGlobs) {
    for (const manifestPath of expandWorkspaceGlob(root, workspaceGlob)) {
      const canonicalPath = path.resolve(manifestPath);
      if (seenManifestPaths.has(canonicalPath)) continue;
      seenManifestPaths.add(canonicalPath);

      const json = readJson(manifestPath);
      if (!json.name) continue;

      packages.push({
        name: json.name,
        filePath: manifestPath,
        json,
      });
    }
  }

  return packages.sort((a, b) => a.name.localeCompare(b.name));
}

function buildWorkspaceDependencyGraph(packages, fields) {
  const knownNames = new Set(packages.map((pkg) => pkg.name));
  const graph = new Map();

  for (const pkg of packages) {
    const deps = new Set();

    for (const field of fields) {
      const group = pkg.json[field] || {};
      for (const depName of Object.keys(group)) {
        if (knownNames.has(depName) && depName !== pkg.name) deps.add(depName);
      }
    }

    graph.set(pkg.name, deps);
  }

  return graph;
}

function findMutualPairs(graph) {
  const pairs = [];
  for (const [name, deps] of graph.entries()) {
    for (const dep of deps) {
      const reverseDeps = graph.get(dep);
      if (reverseDeps && reverseDeps.has(name)) {
        const pair = normalizePair(name, dep);
        if (!pairs.includes(pair)) pairs.push(pair);
      }
    }
  }
  return pairs.sort();
}

function analyzeArchitecture(options = {}) {
  const packages = loadWorkspacePackages(options);
  const allowedMutualPairs = options.allowedMutualPairs || ALLOWED_MUTUAL_PAIRS;
  const runtimeGraph = buildWorkspaceDependencyGraph(packages, RUNTIME_DEP_FIELDS);
  const fullGraph = buildWorkspaceDependencyGraph(packages, ALL_DEP_FIELDS);
  const runtimeMutualPairs = findMutualPairs(runtimeGraph);
  const allMutualPairs = findMutualPairs(fullGraph);
  const devOnlyPairs = allMutualPairs.filter((pair) => !runtimeMutualPairs.includes(pair));

  return {
    packages,
    runtimeMutualPairs,
    devOnlyPairs,
    violations: runtimeMutualPairs.filter((pair) => !allowedMutualPairs.has(pair)),
    knownLegacyPairs: runtimeMutualPairs.filter((pair) => allowedMutualPairs.has(pair)),
  };
}

function runArchitectureCheck(options = {}) {
  const log = options.log || console.log;
  const error = options.error || console.error;
  const result = analyzeArchitecture(options);

  log('Architecture Coupling Summary');
  log(`- Workspace packages scanned: ${result.packages.length}`);
  log(`- Runtime mutual dependency pairs: ${result.runtimeMutualPairs.length}`);

  if (result.knownLegacyPairs.length > 0) {
    log('- Known legacy runtime pairs (tracked):');
    for (const pair of result.knownLegacyPairs) log(`  - ${pair}`);
  }

  if (result.devOnlyPairs.length > 0) {
    log('- Dev-only mutual pairs (warnings, not build failures):');
    for (const pair of result.devOnlyPairs) log(`  [warn] ${pair}`);
  }

  if (result.violations.length > 0) {
    error('\nNew runtime mutual dependency pairs detected (not allowlisted):');
    for (const pair of result.violations) error(`  - ${pair}`);
    error('\nFailing build to prevent architecture drift.');
    return { ...result, ok: false };
  }

  log('\nArchitecture coupling check passed (no new runtime mutual pairs).');
  return { ...result, ok: true };
}

function main() {
  const result = runArchitectureCheck();
  if (!result.ok) process.exitCode = 1;
}

if (require.main === module) main();

module.exports = {
  ALL_DEP_FIELDS,
  ALLOWED_MUTUAL_PAIRS,
  RUNTIME_DEP_FIELDS,
  analyzeArchitecture,
  buildWorkspaceDependencyGraph,
  expandWorkspaceGlob,
  findMutualPairs,
  loadWorkspaceGlobs,
  loadWorkspacePackages,
  normalizePair,
  runArchitectureCheck,
};
