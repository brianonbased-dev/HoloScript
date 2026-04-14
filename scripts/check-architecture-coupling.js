#!/usr/bin/env node

/**
 * Architecture Coupling Guard
 *
 * Detects direct mutual workspace dependency pairs and fails on any pair not
 * explicitly allowlisted. This protects against introducing new circular
 * package-level coupling while we gradually unwind existing legacy pairs.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const WORKSPACE_DIRS = ['packages', 'services'];
// Runtime fields create actual circular dep risk at build/runtime.
// devDependencies are only needed at dev/test time — mutual devDep pairs are
// tracked as warnings but do NOT fail the build.
const RUNTIME_DEP_FIELDS = ['dependencies', 'peerDependencies'];
const ALL_DEP_FIELDS = ['dependencies', 'devDependencies', 'peerDependencies'];

// Known legacy RUNTIME mutual-coupling pairs (kept explicit until refactor lands).
// Note: core<->framework was removed — framework is only in core's devDependencies,
// so it's a dev-time dependency only (not a runtime cycle).
// Note: core<->mesh was removed — mesh is only in mesh reverse-dep via devDependencies.
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

function loadWorkspacePackages() {
  const packages = [];

  for (const workspaceDir of WORKSPACE_DIRS) {
    const dirPath = path.join(ROOT, workspaceDir);
    if (!fs.existsSync(dirPath)) continue;

    for (const entry of fs.readdirSync(dirPath)) {
      const pkgPath = path.join(dirPath, entry, 'package.json');
      if (!fs.existsSync(pkgPath)) continue;

      const json = readJson(pkgPath);
      if (!json.name) continue;

      packages.push({
        name: json.name,
        filePath: pkgPath,
        json,
      });
    }
  }

  return packages;
}

function buildWorkspaceDependencyGraph(packages, fields) {
  const knownNames = new Set(packages.map((p) => p.name));
  const graph = new Map();

  for (const pkg of packages) {
    const deps = new Set();

    for (const field of fields) {
      const group = pkg.json[field] || {};
      for (const depName of Object.keys(group)) {
        if (knownNames.has(depName) && depName !== pkg.name) {
          deps.add(depName);
        }
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
        if (!pairs.includes(pair)) {
          pairs.push(pair);
        }
      }
    }
  }
  pairs.sort();
  return pairs;
}

function main() {
  const packages = loadWorkspacePackages();

  // Runtime graph: only dependencies + peerDependencies (actual runtime risk).
  const runtimeGraph = buildWorkspaceDependencyGraph(packages, RUNTIME_DEP_FIELDS);
  // Full graph: includes devDependencies (shows dev-time coupling as warnings).
  const fullGraph = buildWorkspaceDependencyGraph(packages, ALL_DEP_FIELDS);

  const runtimeMutualPairs = findMutualPairs(runtimeGraph);
  const allMutualPairs = findMutualPairs(fullGraph);
  const devOnlyPairs = allMutualPairs.filter((p) => !runtimeMutualPairs.includes(p));

  const violations = runtimeMutualPairs.filter((pair) => !ALLOWED_MUTUAL_PAIRS.has(pair));
  const knownLegacyPairs = runtimeMutualPairs.filter((pair) => ALLOWED_MUTUAL_PAIRS.has(pair));

  console.log('Architecture Coupling Summary');
  console.log(`- Workspace packages scanned: ${packages.length}`);
  console.log(`- Runtime mutual dependency pairs: ${runtimeMutualPairs.length}`);

  if (knownLegacyPairs.length > 0) {
    console.log('- Known legacy runtime pairs (tracked):');
    for (const pair of knownLegacyPairs) {
      console.log(`  - ${pair}`);
    }
  }

  if (devOnlyPairs.length > 0) {
    console.log('- Dev-only mutual pairs (warnings, not build failures):');
    for (const pair of devOnlyPairs) {
      console.log(`  [warn] ${pair}`);
    }
  }

  if (violations.length > 0) {
    console.error('\nNew runtime mutual dependency pairs detected (not allowlisted):');
    for (const pair of violations) {
      console.error(`  - ${pair}`);
    }
    console.error('\nFailing build to prevent architecture drift.');
    process.exit(1);
  }

  console.log('\nArchitecture coupling check passed (no new runtime mutual pairs).');
}

main();
