#!/usr/bin/env node
/**
 * validate-dockerfile-build.mjs
 *
 * Pre-push audit: validates packages in the studio Dockerfile for the class of
 * failures exposed after || true suppression removal (2568f997e).
 *
 * Reliable check (no false positives from pnpm hoisting):
 *   - Does the package's tsconfig.json exclude test files?
 *     If not AND test files exist in src/, tsc --emitDeclarationOnly will pick
 *     them up. If those test files import removed/renamed exports, the build fails.
 *
 * Note: for packages using `npx tsc -p tsconfig.build.json` (e.g. framework),
 * checks tsconfig.build.json instead of tsconfig.json.
 *
 * Usage:
 *   node scripts/validate-dockerfile-build.mjs          # audit all
 *   node scripts/validate-dockerfile-build.mjs platform # audit one package
 *
 * Exit 0 = all pass, 1 = failures found.
 */

import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const DOCKERFILE = join(ROOT, 'packages/studio/Dockerfile');

// ─── Parse Dockerfile for packages+tsconfig used ─────────────────────────────

const dockerfileText = readFileSync(DOCKERFILE, 'utf8');

// For each package: { pkgName, tsConfigFile }
// tsConfigFile is what the Dockerfile passes to tsc (null = bare tsc, uses tsconfig.json)
const PACKAGES_TO_CHECK = [];

for (const line of dockerfileText.split('\n')) {
  const trimmed = line.trim();
  if (!trimmed.includes('tsc')) continue;

  const pkgMatch = trimmed.match(/cd packages\/([\w-]+)/);
  if (!pkgMatch) continue;
  const pkgName = pkgMatch[1];

  // Detect -p tsconfig.build.json or similar
  const pFlag = trimmed.match(/-p\s+([\w./]+\.json)/);
  const tsConfigFile = pFlag ? pFlag[1] : 'tsconfig.json';

  if (!PACKAGES_TO_CHECK.find(p => p.pkgName === pkgName)) {
    PACKAGES_TO_CHECK.push({ pkgName, tsConfigFile });
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function readJson(path) {
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return null; }
}

function walkTs(dir, files = []) {
  if (!existsSync(dir)) return files;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (entry === 'node_modules' || entry === 'dist') continue;
      walkTs(full, files);
    } else if (entry.endsWith('.ts') || entry.endsWith('.tsx')) {
      files.push(full);
    }
  }
  return files;
}

function isTestFile(absPath) {
  return absPath.includes('__tests__') ||
    absPath.endsWith('.test.ts') ||
    absPath.endsWith('.test.tsx') ||
    absPath.endsWith('.spec.ts') ||
    absPath.endsWith('.spec.tsx');
}

/** Check if a tsconfig exclude list covers test files */
function tsConfigExcludesTests(tsconfig) {
  const excl = tsconfig.exclude ?? [];
  return excl.some(e =>
    e.includes('__tests__') ||
    e.includes('test.') ||
    e.includes('spec.'),
  );
}

// ─── Audit one package ────────────────────────────────────────────────────────

function auditPackage({ pkgName, tsConfigFile }) {
  const pkgDir = join(ROOT, 'packages', pkgName);
  const srcDir = join(pkgDir, 'src');
  const failures = [];
  const warnings = [];

  // Load the tsconfig the Dockerfile actually uses
  const tsconfigPath = join(pkgDir, tsConfigFile);
  const tsconfig = readJson(tsconfigPath);

  if (!tsconfig) {
    // Missing tsconfig means tsc compiles everything — risky if test files exist
    const testFiles = walkTs(srcDir).filter(isTestFile);
    if (testFiles.length > 0) {
      failures.push(
        `${tsConfigFile} missing — tsc will include ALL .ts files. ` +
        `${testFiles.length} test file(s) exist in src/. ` +
        `If they import removed exports, the build fails.`,
      );
    } else {
      warnings.push(`${tsConfigFile} missing (currently safe — no test files in src/)`);
    }
    return { pkgName, tsConfigFile, failures, warnings };
  }

  // Check if tsconfig excludes tests
  if (!tsConfigExcludesTests(tsconfig)) {
    const allTs = walkTs(srcDir);
    const testFiles = allTs.filter(isTestFile);
    if (testFiles.length > 0) {
      failures.push(
        `${tsConfigFile} has no test-file exclusions, ` +
        `${testFiles.length} test file(s) in src/ will be type-checked:\n` +
        testFiles.slice(0, 4).map(f => `    ${f.replace(ROOT + '\\', '').replace(ROOT + '/', '')}`).join('\n') +
        (testFiles.length > 4 ? `\n    ... and ${testFiles.length - 4} more` : ''),
      );
    } else {
      warnings.push(`${tsConfigFile} has no test exclusions (safe now — 0 test files in src/)`);
    }
  }

  return { pkgName, tsConfigFile, failures, warnings };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const targetArg = process.argv[2];
const packagesToCheck = targetArg
  ? PACKAGES_TO_CHECK.filter(p => p.pkgName === targetArg)
  : PACKAGES_TO_CHECK;

if (packagesToCheck.length === 0) {
  if (targetArg) {
    console.error(`Package "${targetArg}" not found in Dockerfile tsc steps.`);
  } else {
    console.error('No packages found in Dockerfile. Check Dockerfile path.');
  }
  process.exit(1);
}

console.log(`\n🔍 Dockerfile tsconfig audit — ${packagesToCheck.length} package(s)\n`);

let totalFailures = 0;
let totalWarnings = 0;

for (const entry of packagesToCheck) {
  const { pkgName, tsConfigFile, failures, warnings } = auditPackage(entry);
  const icon = failures.length > 0 ? '❌' : warnings.length > 0 ? '⚠️ ' : '✅';
  const status = failures.length > 0 ? 'FAIL' : warnings.length > 0 ? 'WARN' : 'PASS';
  const label = tsConfigFile !== 'tsconfig.json' ? ` (${tsConfigFile})` : '';
  console.log(`${icon} ${pkgName.padEnd(22)} ${status}${label}`);
  for (const f of failures) console.log(`     ✗ ${f}`);
  for (const w of warnings) console.log(`     ~ ${w}`);
  totalFailures += failures.length;
  totalWarnings += warnings.length;
}

console.log(`\n${'─'.repeat(60)}`);
console.log(`Failures: ${totalFailures}  Warnings: ${totalWarnings}  Packages: ${packagesToCheck.length}`);

if (totalFailures > 0) {
  console.log('\nFix these issues before pushing to avoid Railway build failures.\n');
  process.exit(1);
} else {
  console.log('\nAll packages pass. Safe to push.\n');
  process.exit(0);
}
