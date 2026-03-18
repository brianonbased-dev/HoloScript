#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const POLICY_FILE = path.join(ROOT, 'scripts', 'version-policy.json');
const WORKSPACE_DIRS = ['packages', 'services'];
const args = new Set(process.argv.slice(2));
const strict = args.has('--strict');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function parseMajor(version) {
  const match = String(version || '').trim().match(/^(\d+)\./);
  return match ? Number(match[1]) : null;
}

function loadWorkspacePackages() {
  const all = [];
  for (const dir of WORKSPACE_DIRS) {
    const base = path.join(ROOT, dir);
    if (!fs.existsSync(base)) continue;
    for (const child of fs.readdirSync(base)) {
      const pkgPath = path.join(base, child, 'package.json');
      if (!fs.existsSync(pkgPath)) continue;
      const json = readJson(pkgPath);
      all.push({
        name: json.name,
        version: json.version,
        private: !!json.private,
        filePath: pkgPath,
      });
    }
  }
  return all;
}

function main() {
  if (!fs.existsSync(POLICY_FILE)) {
    console.error(`Missing policy file: ${POLICY_FILE}`);
    process.exit(1);
  }

  const policy = readJson(POLICY_FILE);
  const packages = loadWorkspacePackages();
  const byName = new Map(packages.map((p) => [p.name, p]));
  const laneAssignments = new Map();
  const violations = [];
  const unmanaged = [];

  for (const lane of policy.lanes || []) {
    for (const pkgName of lane.packages || []) {
      const pkg = byName.get(pkgName);
      if (!pkg) {
        violations.push({
          type: 'missing-package',
          lane: lane.name,
          message: `${lane.name}: package not found in workspace: ${pkgName}`,
        });
        continue;
      }
      if (laneAssignments.has(pkgName)) {
        violations.push({
          type: 'duplicate-assignment',
          lane: lane.name,
          message: `${pkgName} assigned to multiple lanes: ${laneAssignments.get(pkgName)} and ${lane.name}`,
        });
        continue;
      }
      laneAssignments.set(pkgName, lane.name);

      if (lane.enforce === 'major') {
        const major = parseMajor(pkg.version);
        if (major === null) {
          violations.push({
            type: 'invalid-version',
            lane: lane.name,
            message: `${pkgName}@${pkg.version}: invalid semver format`,
          });
          continue;
        }
        if (major !== lane.targetMajor) {
          violations.push({
            type: 'major-mismatch',
            lane: lane.name,
            message: `${pkgName}@${pkg.version}: expected major ${lane.targetMajor}.x`,
          });
        }
      }
    }
  }

  for (const pkg of packages) {
    if (!laneAssignments.has(pkg.name)) {
      unmanaged.push(pkg);
    }
  }

  const laneCounts = {};
  for (const [, laneName] of laneAssignments.entries()) {
    laneCounts[laneName] = (laneCounts[laneName] || 0) + 1;
  }

  console.log('Version lane summary:');
  for (const lane of policy.lanes || []) {
    const count = laneCounts[lane.name] || 0;
    console.log(`  - ${lane.name}: ${count} package(s)`);
  }

  if (unmanaged.length > 0) {
    console.log(`\nUnmanaged packages (${unmanaged.length}):`);
    for (const pkg of unmanaged.sort((a, b) => a.name.localeCompare(b.name))) {
      console.log(`  - ${pkg.name}@${pkg.version}`);
    }
  }

  if (violations.length > 0) {
    console.log(`\nPolicy violations (${violations.length}):`);
    for (const v of violations) {
      console.log(`  - ${v.message}`);
    }
    process.exit(1);
  }

  if (strict && unmanaged.length > 0) {
    console.log('\nStrict mode enabled: unmanaged packages are not allowed.');
    process.exit(1);
  }

  console.log('\nVersion policy check passed.');
}

main();
