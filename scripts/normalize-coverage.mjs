/**
 * Normalize workspace coverage scripts across packages.
 *
 * Adds `test:coverage` to packages that have `test` but lack it.
 * Adds `test` + `test:coverage` to packages with source code but no test script.
 * Generates a report of changes made.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const rootDir = path.resolve(path.dirname(__filename), '..');

const packagesDir = path.join(rootDir, 'packages');
const servicesDir = path.join(rootDir, 'services');

function findPackageJsonDirs(dir) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const subDir = path.join(dir, entry.name);
    const packageJsonPath = path.join(subDir, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      results.push(subDir);
    }
    // Also check one level deeper (e.g. packages/plugins/*)
    for (const subEntry of fs.readdirSync(subDir, { withFileTypes: true })) {
      if (!subEntry.isDirectory()) continue;
      const nestedDir = path.join(subDir, subEntry.name);
      const nestedPackageJson = path.join(nestedDir, 'package.json');
      if (fs.existsSync(nestedPackageJson)) {
        results.push(nestedDir);
      }
    }
  }
  return results;
}

const packageDirs = [
  ...findPackageJsonDirs(packagesDir),
  ...findPackageJsonDirs(servicesDir),
];

const changes = [];
const skipped = [];

for (const pkgDir of packageDirs.sort()) {
  const packageJsonPath = path.join(pkgDir, 'package.json');
  const raw = fs.readFileSync(packageJsonPath, 'utf8');
  const pkg = JSON.parse(raw);

  const hasSrc = fs.existsSync(path.join(pkgDir, 'src'));
  const hasVitestConfig =
    fs.existsSync(path.join(pkgDir, 'vitest.config.ts')) ||
    fs.existsSync(path.join(pkgDir, 'vitest.config.js')) ||
    fs.existsSync(path.join(pkgDir, 'vitest.config.mjs'));

  const scripts = pkg.scripts || {};
  const hasTest = Boolean(scripts.test);
  const hasCoverage = Boolean(scripts['test:coverage']);

  // Skip packages that already have coverage
  if (hasCoverage) {
    skipped.push({ name: pkg.name, reason: 'already has test:coverage' });
    continue;
  }

  // Determine the appropriate test command
  let testCommand = 'vitest run';
  let coverageCommand = 'vitest run --coverage';

  // If the package uses a custom vitest runner (like core), keep its pattern
  if (scripts.test && scripts.test.includes('run-vitest.mjs')) {
    coverageCommand = scripts.test.replace(/run-vitest.mjs/, 'run-vitest.mjs --coverage');
  }

  // If the package has --passWithNoTests in its test script, mirror that
  if (scripts.test && scripts.test.includes('--passWithNoTests')) {
    testCommand = scripts.test;
    coverageCommand = scripts.test.replace('vitest run', 'vitest run --coverage');
  }

  if (!hasTest && !hasSrc) {
    skipped.push({ name: pkg.name, reason: 'no src, no tests, no coverage needed' });
    continue;
  }

  const newScripts = { ...scripts };

  if (!hasTest) {
    // Package has source but no test script — add minimal test entry
    if (hasVitestConfig || hasSrc) {
      newScripts.test = 'vitest run --passWithNoTests';
      newScripts['test:coverage'] = 'vitest run --coverage --passWithNoTests';
      changes.push({
        name: pkg.name,
        dir: path.relative(rootDir, pkgDir),
        added: ['test', 'test:coverage'],
        reason: 'had src but no test script',
      });
    } else {
      skipped.push({ name: pkg.name, reason: 'no src and no test script' });
      continue;
    }
  } else {
    // Has test but no coverage
    newScripts['test:coverage'] = coverageCommand;
    changes.push({
      name: pkg.name,
      dir: path.relative(rootDir, pkgDir),
      added: ['test:coverage'],
      reason: 'had test but no test:coverage',
    });
  }

  pkg.scripts = newScripts;
  fs.writeFileSync(packageJsonPath, JSON.stringify(pkg, null, 2) + '\n');
}

console.log('=== Coverage Normalization Report ===\n');
console.log(`Modified ${changes.length} packages:`);
for (const c of changes) {
  console.log(`  ${c.name} (${c.dir}): +${c.added.join(', +')} (${c.reason})`);
}

console.log(`\nSkipped ${skipped.length} packages:`);
for (const s of skipped) {
  console.log(`  ${s.name}: ${s.reason}`);
}

console.log('\nDone.');
