#!/usr/bin/env node

/**
 * Hotspot Test Coverage Guard
 *
 * Enforces baseline test-file presence for high-churn packages that have
 * historically lacked tests.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

const HOTSPOT_PACKAGES = [
  'agent-setup',
  'connector-moltbook',
  'connectors',
  'holoscript-agent',
  'python-bindings',
  'snn-poc',
  'store',
];

const TEST_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.py'];

function isTestFile(fileName) {
  const normalized = fileName.replace(/\\/g, '/');
  return (
    normalized.includes('.test.') ||
    normalized.includes('.spec.') ||
    /(^|\/)test_/i.test(normalized) ||
    /(^|\/)tests\//i.test(normalized)
  );
}

function walk(dir, files = []) {
  if (!fs.existsSync(dir)) return files;

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name.startsWith('.')) {
      continue;
    }

    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath, files);
      continue;
    }

    files.push(fullPath);
  }

  return files;
}

function findPackageDir(pkgDirName) {
  const packagesDir = path.join(ROOT, 'packages', pkgDirName);
  if (fs.existsSync(packagesDir)) return packagesDir;

  const servicesDir = path.join(ROOT, 'services', pkgDirName);
  if (fs.existsSync(servicesDir)) return servicesDir;

  return null;
}

function main() {
  const missing = [];

  for (const pkgDirName of HOTSPOT_PACKAGES) {
    const pkgDir = findPackageDir(pkgDirName);
    if (!pkgDir) {
      missing.push({ pkgDirName, reason: 'package directory not found' });
      continue;
    }

    const files = walk(pkgDir);
    const testFiles = files.filter((f) => {
      const lower = f.toLowerCase();
      const ext = path.extname(lower);
      return TEST_EXTENSIONS.includes(ext) && isTestFile(lower);
    });

    if (testFiles.length === 0) {
      missing.push({ pkgDirName, reason: 'no test files found' });
    }
  }

  console.log('Hotspot Test Coverage Summary');
  console.log(`- Packages checked: ${HOTSPOT_PACKAGES.length}`);
  console.log(`- Packages missing tests: ${missing.length}`);

  if (missing.length > 0) {
    console.error('\nMissing baseline tests in hotspot packages:');
    for (const m of missing) {
      console.error(`  - ${m.pkgDirName}: ${m.reason}`);
    }
    process.exit(1);
  }

  console.log('\nHotspot test coverage check passed.');
}

main();
