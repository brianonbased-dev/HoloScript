#!/usr/bin/env node

/**
 * Version Management Script
 *
 * Handles semantic versioning bumping and changelog generation
 * Usage: node scripts/version.js [major|minor|patch|prerelease]
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const PACKAGES = ['packages/core', 'packages/cli', 'packages/infinityassistant'];

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n');
}

function bumpVersion(version, bumpType) {
  const parts = version.split(/[.-]/);
  const major = parseInt(parts[0]);
  const minor = parseInt(parts[1]);
  const patch = parseInt(parts[2]);
  const prerelease = parts[3];

  switch (bumpType) {
    case 'major':
      return `${major + 1}.0.0`;
    case 'minor':
      return `${major}.${minor + 1}.0`;
    case 'patch':
      return `${major}.${minor}.${patch + 1}`;
    case 'prerelease':
      return `${major}.${minor}.${patch + 1}-alpha.1`;
    default:
      return version;
  }
}

function updatePackageVersions(newVersion) {
  for (const pkgPath of PACKAGES) {
    const pkgJsonPath = path.join(pkgPath, 'package.json');
    if (fs.existsSync(pkgJsonPath)) {
      const pkg = readJson(pkgJsonPath);
      pkg.version = newVersion;
      writeJson(pkgJsonPath, pkg);
      console.log(`✓ Updated ${pkgPath} to ${newVersion}`);
    }
  }

  // Update root package.json
  const rootPkg = readJson('package.json');
  rootPkg.version = newVersion;
  writeJson('package.json', rootPkg);
  console.log(`✓ Updated root package.json to ${newVersion}`);
}

function createChangelog(newVersion) {
  const changelogPath = 'CHANGELOG.md';
  let changelog = '';

  if (fs.existsSync(changelogPath)) {
    changelog = fs.readFileSync(changelogPath, 'utf-8');
  }

  const date = new Date().toISOString().split('T')[0];
  const header = `## [${newVersion}] - ${date}\n\n### Added\n- \n\n### Changed\n- \n\n### Fixed\n- \n\n### Removed\n- \n\n`;

  fs.writeFileSync(changelogPath, header + changelog);
  console.log(`✓ Created CHANGELOG entry for ${newVersion}`);
}

function commitAndTag(version) {
  try {
    execSync('git add -A');
    execSync(`git commit -m "chore: bump version to ${version}"`);
    execSync(`git tag -a v${version} -m "Release ${version}"`);
    console.log(`✓ Created git tag v${version}`);
  } catch (error) {
    console.error('Git operation failed:', error.message);
  }
}

function main() {
  const bumpType = process.argv[2] || 'patch';
  const validTypes = ['major', 'minor', 'patch', 'prerelease'];

  if (!validTypes.includes(bumpType)) {
    console.error(`Invalid bump type: ${bumpType}`);
    console.error(`Valid types: ${validTypes.join(', ')}`);
    process.exit(1);
  }

  // Get current version
  const rootPkg = readJson('package.json');
  const currentVersion = rootPkg.version;
  const newVersion = bumpVersion(currentVersion, bumpType);

  console.log(`\n📦 Bumping version from ${currentVersion} to ${newVersion} (${bumpType})\n`);

  // Update versions
  updatePackageVersions(newVersion);

  // Update changelog
  createChangelog(newVersion);

  // Commit and tag
  commitAndTag(newVersion);

  console.log(`\n✅ Version bump complete! Next step: git push --tags\n`);
}

main();
