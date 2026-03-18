#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const POLICY_FILE = path.join(ROOT, 'scripts', 'version-policy.json');
const ROOT_PKG = path.join(ROOT, 'package.json');

const bumpType = process.argv[2];
const allowed = new Set(['patch', 'minor', 'major', 'prerelease']);
if (!allowed.has(bumpType)) {
  console.error('Usage: node scripts/sync-versions.js <patch|minor|major|prerelease> [--lane <name>]');
  process.exit(1);
}

function parseVersion(v) {
  const m = String(v).match(/^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/);
  if (!m) return null;
  return {
    major: Number(m[1]),
    minor: Number(m[2]),
    patch: Number(m[3]),
    pre: m[4] || null,
  };
}

function formatVersion(v) {
  return `${v.major}.${v.minor}.${v.patch}${v.pre ? `-${v.pre}` : ''}`;
}

function bump(v, type) {
  const next = { ...v };
  if (type === 'major') {
    next.major += 1;
    next.minor = 0;
    next.patch = 0;
    next.pre = null;
  } else if (type === 'minor') {
    next.minor += 1;
    next.patch = 0;
    next.pre = null;
  } else if (type === 'patch') {
    next.patch += 1;
    next.pre = null;
  } else if (type === 'prerelease') {
    if (!next.pre) {
      next.pre = 'rc.0';
    } else {
      const parts = next.pre.split('.');
      const last = Number(parts[parts.length - 1]);
      if (Number.isFinite(last)) {
        parts[parts.length - 1] = String(last + 1);
        next.pre = parts.join('.');
      } else {
        next.pre = `${next.pre}.1`;
      }
    }
  }
  return next;
}

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function writeJson(p, obj) {
  fs.writeFileSync(p, JSON.stringify(obj, null, 2) + '\n');
}

const laneArgIndex = process.argv.indexOf('--lane');
const laneFilter = laneArgIndex >= 0 ? process.argv[laneArgIndex + 1] : null;

if (!fs.existsSync(POLICY_FILE) || !fs.existsSync(ROOT_PKG)) {
  console.error('Missing policy or root package.json');
  process.exit(1);
}

const policy = readJson(POLICY_FILE);
const rootPkg = readJson(ROOT_PKG);
const rootParsed = parseVersion(rootPkg.version);
if (!rootParsed) {
  console.error(`Invalid root version: ${rootPkg.version}`);
  process.exit(1);
}

const nextRoot = bump(rootParsed, bumpType);
rootPkg.version = formatVersion(nextRoot);
writeJson(ROOT_PKG, rootPkg);

const lanes = (policy.lanes || []).filter((lane) => lane.sync === true);
const selected = laneFilter ? lanes.filter((l) => l.name === laneFilter) : lanes;

if (laneFilter && selected.length === 0) {
  console.error(`No sync-enabled lane named: ${laneFilter}`);
  process.exit(1);
}

let updated = 0;
for (const lane of selected) {
  for (const pkgName of lane.packages || []) {
    const short = pkgName.startsWith('@') ? pkgName.split('/')[1] : pkgName;
    const pkgPath = path.join(ROOT, 'packages', short, 'package.json');
    if (!fs.existsSync(pkgPath)) continue;
    const pkg = readJson(pkgPath);
    const parsed = parseVersion(pkg.version);
    if (!parsed) continue;

    parsed.major = nextRoot.major;
    if (bumpType === 'major') {
      parsed.minor = 0;
      parsed.patch = 0;
    } else if (bumpType === 'minor') {
      parsed.minor += 1;
      parsed.patch = 0;
    } else if (bumpType === 'patch') {
      parsed.patch += 1;
    } else if (bumpType === 'prerelease') {
      parsed.pre = parsed.pre ? `${parsed.pre}.1` : 'rc.0';
    }

    pkg.version = formatVersion(parsed);
    writeJson(pkgPath, pkg);
    updated++;
  }
}

console.log(`Bumped root to ${rootPkg.version}; updated ${updated} package(s).`);
console.log('Run: node scripts/check-version-policy.js');
