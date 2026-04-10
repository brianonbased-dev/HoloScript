#!/usr/bin/env node

/**
 * Version Synchronization Script
 *
 * Ensures version consistency across all HoloScript packages:
 * - Root package.json
 * - All workspace packages (pnpm)
 * - Cargo workspace (Rust)
 * - Unity package.json
 * - Homebrew formula
 * - Chocolatey nuspec
 *
 * Pattern P.005.01: Single source of truth (root package.json)
 *
 * Usage:
 *   pnpm run version:patch   # 3.0.0 → 3.0.1
 *   pnpm run version:minor   # 3.0.0 → 3.1.0
 *   pnpm run version:major   # 3.0.0 → 4.0.0
 *   pnpm run version:prerelease  # 3.0.0 → 3.0.1-beta.0
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// ANSI colors for terminal output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  blue: '\x1b[34m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function error(message) {
  log(`❌ ${message}`, 'red');
  process.exit(1);
}

function success(message) {
  log(`✅ ${message}`, 'green');
}

function info(message) {
  log(`ℹ️  ${message}`, 'blue');
}

// Bump version using semver logic
function bumpVersion(currentVersion, type) {
  const parts = currentVersion.split('-');
  const [major, minor, patch] = parts[0].split('.').map(Number);
  const prerelease = parts[1];

  switch (type) {
    case 'major':
      return `${major + 1}.0.0`;
    case 'minor':
      return `${major}.${minor + 1}.0`;
    case 'patch':
      return `${major}.${minor}.${patch + 1}`;
    case 'prerelease':
      if (prerelease) {
        const [tag, num] = prerelease.split('.');
        return `${major}.${minor}.${patch}-${tag}.${Number(num) + 1}`;
      }
      return `${major}.${minor}.${patch + 1}-beta.0`;
    default:
      error(`Unknown version bump type: ${type}`);
  }
}

// Update package.json file
function updatePackageJson(filePath, newVersion) {
  const pkg = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  pkg.version = newVersion;
  fs.writeFileSync(filePath, JSON.stringify(pkg, null, 2) + '\n');
  success(`Updated: ${filePath}`);
}

// Update Cargo.toml file
function updateCargoToml(filePath, newVersion) {
  let content = fs.readFileSync(filePath, 'utf8');

  // Update [workspace.package] version
  content = content.replace(
    /(\[workspace\.package\]\s+version\s*=\s*)"[^"]+"/,
    `$1"${newVersion}"`
  );

  // Update [package] version if exists
  content = content.replace(/(\[package\][\s\S]*?version\s*=\s*)"[^"]+"/, `$1"${newVersion}"`);

  fs.writeFileSync(filePath, content);
  success(`Updated: ${filePath}`);
}

// Update Homebrew formula
function updateHomebrewFormula(filePath, newVersion) {
  let content = fs.readFileSync(filePath, 'utf8');

  // Update version
  content = content.replace(/version\s*=\s*"[^"]+"/, `version = "${newVersion}"`);

  // Update URL
  content = content.replace(/tags\/v[0-9.]+(-[a-z0-9.]+)?/g, `tags/v${newVersion}`);

  fs.writeFileSync(filePath, content);
  success(`Updated: ${filePath}`);
}

// Update Chocolatey nuspec
function updateChocolateyNuspec(filePath, newVersion) {
  let content = fs.readFileSync(filePath, 'utf8');

  content = content.replace(/<version>[^<]+<\/version>/, `<version>${newVersion}</version>`);

  content = content.replace(/\/v[0-9.]+(-[a-z0-9.]+)?\//g, `/v${newVersion}/`);

  fs.writeFileSync(filePath, content);
  success(`Updated: ${filePath}`);
}

// Update all workspace package.json files
function updateWorkspacePackages(rootDir, newVersion) {
  const packagesDir = path.join(rootDir, 'packages');
  const packages = fs
    .readdirSync(packagesDir, { withFileTypes: true })
    .filter((dirent) => dirent.isDirectory())
    .map((dirent) => dirent.name);

  for (const pkg of packages) {
    const pkgJsonPath = path.join(packagesDir, pkg, 'package.json');
    if (fs.existsSync(pkgJsonPath)) {
      updatePackageJson(pkgJsonPath, newVersion);
    }

    const cargoTomlPath = path.join(packagesDir, pkg, 'Cargo.toml');
    if (fs.existsSync(cargoTomlPath)) {
      updateCargoToml(cargoTomlPath, newVersion);
    }
  }
}

// Main sync function
function syncVersions(bumpType) {
  const rootDir = path.resolve(__dirname, '..');

  log('\n🔄 HoloScript Version Synchronization\n', 'blue');

  // 1. Read current version from root package.json
  const rootPkgPath = path.join(rootDir, 'package.json');
  const rootPkg = JSON.parse(fs.readFileSync(rootPkgPath, 'utf8'));
  const currentVersion = rootPkg.version;

  info(`Current version: ${currentVersion}`);

  // 2. Calculate new version
  const newVersion = bumpVersion(currentVersion, bumpType);
  log(`New version: ${newVersion}\n`, 'green');

  // Confirm with user
  const readline = require('readline').createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  readline.question(`Bump version from ${currentVersion} → ${newVersion}? (y/n) `, (answer) => {
    readline.close();

    if (answer.toLowerCase() !== 'y') {
      log('Cancelled.', 'yellow');
      process.exit(0);
    }

    try {
      // 3. Update root package.json
      info('\n📦 Updating npm packages...');
      updatePackageJson(rootPkgPath, newVersion);

      // 4. Update all workspace packages
      updateWorkspacePackages(rootDir, newVersion);

      // 5. Update Cargo workspace
      info('\n🦀 Updating Cargo workspace...');
      const cargoTomlPath = path.join(rootDir, 'Cargo.toml');
      if (fs.existsSync(cargoTomlPath)) {
        updateCargoToml(cargoTomlPath, newVersion);
      }

      // 6. Update Unity package
      info('\n🎮 Updating Unity package...');
      const unityPkgPath = path.join(rootDir, 'packages', 'unity-sdk', 'package.json');
      if (fs.existsSync(unityPkgPath)) {
        updatePackageJson(unityPkgPath, newVersion);
      }

      // 7. Update Homebrew formula
      info('\n🍺 Updating Homebrew formula...');
      const brewFormulaPath = path.join(rootDir, 'Formula', 'holoscript.rb');
      if (fs.existsSync(brewFormulaPath)) {
        updateHomebrewFormula(brewFormulaPath, newVersion);
      }

      // 8. Update Chocolatey nuspec
      info('\n🍫 Updating Chocolatey package...');
      const chocoNuspecPath = path.join(rootDir, 'chocolatey', 'holoscript.nuspec');
      if (fs.existsSync(chocoNuspecPath)) {
        updateChocolateyNuspec(chocoNuspecPath, newVersion);
      }

      // 9. Git commit (optional)
      info('\n📝 Creating git commit...');
      try {
        execSync(`git add .`, { cwd: rootDir });
        execSync(`git commit -m "chore: bump version to ${newVersion}"`, { cwd: rootDir });
        success(`Git commit created`);

        // Create git tag
        execSync(`git tag v${newVersion}`, { cwd: rootDir });
        success(`Git tag created: v${newVersion}`);
      } catch (err) {
        log(`⚠️  Git commit failed (this is OK if no git repo): ${err.message}`, 'yellow');
      }

      // Done!
      log(`\n✨ Version synchronized successfully!\n`, 'green');
      log(`Next steps:`, 'blue');
      log(`  1. Review changes: git diff`, 'blue');
      log(`  2. Push to remote: git push && git push --tags`, 'blue');
      log(`  3. Publish: pnpm publish`, 'blue');
    } catch (err) {
      error(`Synchronization failed: ${err.message}`);
    }
  });
}

// CLI
const bumpType = process.argv[2];

if (!bumpType || !['major', 'minor', 'patch', 'prerelease'].includes(bumpType)) {
  log('Usage: node sync-versions.js <major|minor|patch|prerelease>', 'yellow');
  process.exit(1);
}

syncVersions(bumpType);
