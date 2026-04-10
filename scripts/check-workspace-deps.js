#!/usr/bin/env node

/**
 * Workspace Dependency Checker
 *
 * Scans all package.json files for @holoscript/* dependencies that don't use
 * the pnpm workspace:^ protocol. Prevents hardcoded versions from breaking
 * installs when local packages are ahead of published npm versions.
 *
 * Rule: W.HOLO.13 — Workspace Protocol Must Be Enforced
 *
 * Usage:
 *   node scripts/check-workspace-deps.js        # Check only
 *   node scripts/check-workspace-deps.js --fix   # Auto-fix to workspace:^
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const WORKSPACE_DIRS = ['packages', 'services'];
const SCOPE = '@holoscript/';
const DEP_FIELDS = ['dependencies', 'devDependencies', 'peerDependencies'];
const fix = process.argv.includes('--fix');

let violations = 0;
let fixed = 0;

for (const dir of WORKSPACE_DIRS) {
  const base = path.join(ROOT, dir);
  if (!fs.existsSync(base)) continue;

  for (const pkg of fs.readdirSync(base)) {
    const pkgJson = path.join(base, pkg, 'package.json');
    if (!fs.existsSync(pkgJson)) continue;

    const content = fs.readFileSync(pkgJson, 'utf8').replace(/^\uFEFF/, '');
    const json = JSON.parse(content);
    let dirty = false;

    for (const field of DEP_FIELDS) {
      const deps = json[field];
      if (!deps) continue;

      for (const [name, version] of Object.entries(deps)) {
        if (!name.startsWith(SCOPE)) continue;
        if (version.startsWith('workspace:')) continue;

        violations++;
        const rel = path.relative(ROOT, pkgJson).replace(/\\/g, '/');
        console.log(`  ${rel}: ${field}.${name} = "${version}" (should be "workspace:^")`);

        if (fix) {
          deps[name] = 'workspace:^';
          dirty = true;
          fixed++;
        }
      }
    }

    if (dirty) {
      fs.writeFileSync(pkgJson, JSON.stringify(json, null, 2) + '\n');
    }
  }
}

if (violations === 0) {
  console.log('  All @holoscript/* dependencies use workspace: protocol.');
  process.exit(0);
} else if (fix) {
  console.log(`\n  Fixed ${fixed} violation(s). Run pnpm install to update lockfile.`);
  process.exit(0);
} else {
  console.log(`\n  Found ${violations} violation(s). Run with --fix to auto-correct.`);
  process.exit(1);
}
