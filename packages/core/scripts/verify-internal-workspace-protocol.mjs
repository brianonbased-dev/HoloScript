#!/usr/bin/env node
/**
 * Fail fast if any in-repo HoloScript package reference in package.json
 * drifts from `workspace:*`. Keeps pnpm CI/install resolving workspace
 * packages consistently (cache + link stability).
 */
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkgPath = join(__dirname, '..', 'package.json');
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));

const REQUIRED = 'workspace:*';

/** Packages published/managed inside this monorepo (not npm semver). */
function isInternalWorkspaceDep(name) {
  return name.startsWith('@holoscript/') || name.startsWith('holoscript-');
}

const sections = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'];
const errors = [];

for (const section of sections) {
  const block = pkg[section];
  if (!block || typeof block !== 'object') continue;
  for (const [name, spec] of Object.entries(block)) {
    if (!isInternalWorkspaceDep(name)) continue;
    if (spec !== REQUIRED) {
      errors.push(`${section}: "${name}" must be "${REQUIRED}", got ${JSON.stringify(spec)}`);
    }
  }
}

if (errors.length > 0) {
  console.error(
    '[verify-internal-workspace-protocol] Internal HoloScript dependencies must use workspace:*:\n' +
      errors.join('\n')
  );
  process.exit(1);
}

console.log('[verify-internal-workspace-protocol] OK — internal deps use workspace:*');
