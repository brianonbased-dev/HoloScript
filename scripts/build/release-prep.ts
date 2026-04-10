#!/usr/bin/env node
/**
 * HoloScript 3.0 Release Preparation Script
 *
 * Validates all packages are ready for 3.0 release.
 */

import { execSync } from 'child_process';
import { existsSync, readFileSync, readdirSync } from 'fs';
import { join } from 'path';

interface PackageJson {
  name: string;
  version: string;
  private?: boolean;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

interface CheckResult {
  package: string;
  checks: {
    name: string;
    passed: boolean;
    message: string;
  }[];
}

const RELEASE_VERSION = '3.0.0';
const PACKAGES_DIR = join(process.cwd(), 'packages');

const REQUIRED_PACKAGES = [
  'core',
  'cli',
  'lsp',
  'linter',
  'formatter',
  'vscode-extension',
  'holoscript',
  'mcp-server',
];

const NEW_PACKAGES = ['visual', 'compiler-wasm', 'intellij', 'partner-sdk', 'registry'];

// Packages that use different build systems (Rust, Gradle)
const NON_TYPESCRIPT_PACKAGES = ['compiler-wasm', 'intellij'];

function readPackageJson(dir: string): PackageJson | null {
  const pkgPath = join(dir, 'package.json');
  if (!existsSync(pkgPath)) return null;
  return JSON.parse(readFileSync(pkgPath, 'utf-8'));
}

function checkPackage(pkgDir: string, pkgBaseName: string): CheckResult {
  const pkg = readPackageJson(pkgDir);
  const pkgName = pkg?.name || pkgBaseName;
  const isNonTs = NON_TYPESCRIPT_PACKAGES.includes(pkgBaseName);

  const checks: CheckResult['checks'] = [];

  // Check 1: package.json exists (skip for Rust/Java packages)
  if (isNonTs) {
    // Check for Cargo.toml (Rust) or build.gradle (Java)
    const hasCargoToml = existsSync(join(pkgDir, 'Cargo.toml'));
    const hasBuildGradle =
      existsSync(join(pkgDir, 'build.gradle.kts')) || existsSync(join(pkgDir, 'build.gradle'));
    const hasBuildFile = hasCargoToml || hasBuildGradle;
    checks.push({
      name: 'Build config exists',
      passed: hasBuildFile,
      message: hasBuildFile
        ? hasCargoToml
          ? 'Cargo.toml found'
          : 'build.gradle found'
        : 'Missing build config',
    });
  } else {
    checks.push({
      name: 'package.json exists',
      passed: pkg !== null,
      message: pkg ? 'Found' : 'Missing package.json',
    });
  }

  // Check 2: Has src directory
  const hasSrc = existsSync(join(pkgDir, 'src'));
  checks.push({
    name: 'Source directory',
    passed: hasSrc,
    message: hasSrc ? 'src/ found' : 'Missing src/',
  });

  // Check 3: Has README
  const hasReadme = existsSync(join(pkgDir, 'README.md'));
  checks.push({
    name: 'Documentation',
    passed: hasReadme,
    message: hasReadme ? 'README.md found' : 'Missing README.md',
  });

  // Check 4: TypeScript config (skip for non-TS packages)
  if (!isNonTs) {
    const hasTsconfig = existsSync(join(pkgDir, 'tsconfig.json'));
    checks.push({
      name: 'TypeScript config',
      passed: hasTsconfig,
      message: hasTsconfig ? 'tsconfig.json found' : 'Missing tsconfig.json',
    });
  }

  // Check 5: No deprecated traits in dependencies (skip if no package.json)
  if (pkg) {
    const hasDeprecatedTraits = pkg.dependencies?.['@holoscript/deprecated'];
    checks.push({
      name: 'No deprecated deps',
      passed: !hasDeprecatedTraits,
      message: hasDeprecatedTraits ? 'Uses deprecated package' : 'Clean dependencies',
    });
  }

  return { package: pkgName, checks };
}

function main() {
  console.log('🚀 HoloScript 3.0 Release Preparation\n');
  console.log('='.repeat(50));

  const results: CheckResult[] = [];
  let allPassed = true;

  // Check all required packages
  console.log('\n📦 Checking required packages...\n');

  for (const pkg of [...REQUIRED_PACKAGES, ...NEW_PACKAGES]) {
    const pkgDir = join(PACKAGES_DIR, pkg);

    if (!existsSync(pkgDir)) {
      console.log(`  ❌ ${pkg}: Not found`);
      allPassed = false;
      continue;
    }

    const result = checkPackage(pkgDir, pkg);
    results.push(result);

    const failedChecks = result.checks.filter((c) => !c.passed);
    if (failedChecks.length > 0) {
      console.log(`  ⚠️  ${pkg}: ${failedChecks.length} issues`);
      for (const check of failedChecks) {
        console.log(`      - ${check.name}: ${check.message}`);
      }
      allPassed = false;
    } else {
      console.log(`  ✅ ${pkg}: All checks passed`);
    }
  }

  // Summary
  console.log('\n' + '='.repeat(50));
  console.log('\n📊 Release Readiness Summary\n');

  const totalChecks = results.reduce((acc, r) => acc + r.checks.length, 0);
  const passedChecks = results.reduce((acc, r) => acc + r.checks.filter((c) => c.passed).length, 0);

  console.log(`  Total packages: ${results.length}`);
  console.log(`  Checks passed: ${passedChecks}/${totalChecks}`);
  console.log(`  Release ready: ${allPassed ? '✅ YES' : '❌ NO - Fix issues above'}`);

  // Release checklist
  console.log('\n📋 Release Checklist:\n');
  console.log('  [ ] All packages have version 3.0.0');
  console.log('  [ ] CHANGELOG.md updated');
  console.log('  [ ] Migration guide complete (docs/MIGRATION_3.0.md)');
  console.log('  [ ] All tests passing');
  console.log('  [ ] No P0/P1 bugs open');
  console.log('  [ ] Documentation reviewed');

  // Next steps
  console.log('\n🎯 Next Steps:\n');
  console.log('  1. Fix any issues listed above');
  console.log('  2. Run: pnpm test');
  console.log('  3. Run: pnpm build');
  console.log('  4. Create release branch: git checkout -b release/3.0');
  console.log('  5. Update package versions: pnpm version 3.0.0');
  console.log('  6. Publish: pnpm publish --access public');

  process.exit(allPassed ? 0 : 1);
}

main();
