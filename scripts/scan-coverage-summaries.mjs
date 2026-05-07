#!/usr/bin/env node

/**
 * Coverage Summary Scanner
 *
 * Recursively finds coverage/coverage-summary.json under packages/* and services/*,
 * reads them, and outputs a consolidated JSON report.
 *
 * Usage:
 *   node scripts/scan-coverage-summaries.mjs
 *   node scripts/scan-coverage-summaries.mjs --json > coverage-report.json
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const rootDir = path.resolve(path.dirname(__filename), '..');

const args = new Set(process.argv.slice(2));
const writeCentral = args.has('--write-central');

const searchRoots = [
  path.join(rootDir, 'packages'),
  path.join(rootDir, 'services'),
];

function findCoverageSummaries(dir, results = []) {
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const subDir = path.join(dir, entry.name);
    const summaryPath = path.join(subDir, 'coverage', 'coverage-summary.json');
    if (fs.existsSync(summaryPath)) {
      results.push({ packageDir: subDir, summaryPath });
    }
    // Also recurse one level deeper for nested packages (e.g. packages/plugins/*)
    for (const subEntry of fs.readdirSync(subDir, { withFileTypes: true })) {
      if (!subEntry.isDirectory()) continue;
      const nestedDir = path.join(subDir, subEntry.name);
      const nestedSummary = path.join(nestedDir, 'coverage', 'coverage-summary.json');
      if (fs.existsSync(nestedSummary)) {
        results.push({ packageDir: nestedDir, summaryPath: nestedSummary });
      }
    }
  }
  return results;
}

function readSummary(summaryPath) {
  try {
    const raw = fs.readFileSync(summaryPath, 'utf8');
    const data = JSON.parse(raw);
    const total = data.total || {};
    return {
      statements: total.statements?.pct ?? null,
      branches: total.branches?.pct ?? null,
      functions: total.functions?.pct ?? null,
      lines: total.lines?.pct ?? null,
    };
  } catch (err) {
    return { error: err.message };
  }
}

const found = [];
for (const searchRoot of searchRoots) {
  found.push(...findCoverageSummaries(searchRoot));
}

found.sort((a, b) => a.packageDir.localeCompare(b.packageDir));

const report = {
  scannedAt: new Date().toISOString(),
  rootDir,
  summaries: [],
};

for (const { packageDir, summaryPath } of found) {
  const relPackage = path.relative(rootDir, packageDir);
  const summary = readSummary(summaryPath);
  const entry = {
    package: relPackage.replace(/\\/g, '/'),
    summaryPath: summaryPath.replace(/\\/g, '/'),
    ...summary,
  };
  report.summaries.push(entry);
}

if (writeCentral) {
  const centralDir = path.join(rootDir, '.holoscript', 'coverage');
  fs.mkdirSync(centralDir, { recursive: true });
  const centralPath = path.join(centralDir, 'coverage-summaries.json');
  fs.writeFileSync(centralPath, JSON.stringify(report, null, 2));
  console.log(`Wrote central report: ${centralPath}`);
}

console.log(JSON.stringify(report, null, 2));
