#!/usr/bin/env node

import { execSync } from 'node:child_process';
import fs from 'node:fs';

const baseRef = process.env.BASE_REF;
const headRef = process.env.HEAD_REF;
const eventPath = process.env.GITHUB_EVENT_PATH;

if (!baseRef || !headRef) {
  console.error('❌ BASE_REF and HEAD_REF are required.');
  process.exit(2);
}

const run = (command) => execSync(command, { encoding: 'utf8' }).trim();

const normalize = (p) => p.replace(/\\/g, '/');

const isBypassedByLabel = () => {
  if (!eventPath || !fs.existsSync(eventPath)) return false;

  try {
    const raw = fs.readFileSync(eventPath, 'utf8');
    const event = JSON.parse(raw);
    const labels = event?.pull_request?.labels ?? [];
    const names = labels.map((l) => String(l?.name ?? '').toLowerCase());
    return names.includes('ts-bridge-only');
  } catch {
    return false;
  }
};

const changedFilesRaw = run(`git diff --name-only --diff-filter=ACMR ${baseRef}...${headRef}`);
const changedFiles = changedFilesRaw ? changedFilesRaw.split('\n').map(normalize) : [];

if (changedFiles.length === 0) {
  console.log('✅ No changed files detected.');
  process.exit(0);
}

const isHoloScriptFile = (file) => /\.(holo|hs|hsplus)$/i.test(file);
const isTypeScriptLike = (file) => /\.(ts|tsx|js|jsx)$/i.test(file);

const inFeatureDomain = (file) =>
  file.startsWith('packages/platform/') ||
  file.startsWith('packages/ar/') ||
  file.startsWith('packages/adapters/') ||
  file.startsWith('examples/');

const isExcludedTsPath = (file) =>
  file.startsWith('docs/') ||
  file.startsWith('.github/') ||
  file.startsWith('scripts/') ||
  file.includes('/__tests__/') ||
  file.endsWith('.test.ts') ||
  file.endsWith('.test.tsx') ||
  file.endsWith('.spec.ts') ||
  file.endsWith('.spec.tsx') ||
  file.endsWith('.d.ts');

const holoscriptChanges = changedFiles.filter(isHoloScriptFile);
const featureTsChanges = changedFiles.filter(
  (file) => isTypeScriptLike(file) && inFeatureDomain(file) && !isExcludedTsPath(file),
);

const bypassed = isBypassedByLabel();

if (featureTsChanges.length > 0 && holoscriptChanges.length === 0 && !bypassed) {
  console.error('❌ HoloScript Source Contract violation detected.');
  console.error('');
  console.error('Feature-domain TypeScript files changed without HoloScript source changes:');
  for (const file of featureTsChanges) {
    console.error(`  - ${file}`);
  }
  console.error('');
  console.error('To pass this check, either:');
  console.error('  1) Include relevant .holo/.hs/.hsplus changes in this PR, or');
  console.error('  2) Apply the PR label: ts-bridge-only (with rationale).');
  process.exit(1);
}

if (bypassed) {
  console.log('⚠️  Source contract check bypassed via ts-bridge-only label.');
}

console.log('✅ HoloScript Source Contract check passed.');
console.log(`   Feature TS changes: ${featureTsChanges.length}`);
console.log(`   HoloScript changes: ${holoscriptChanges.length}`);