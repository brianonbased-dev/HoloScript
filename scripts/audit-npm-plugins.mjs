#!/usr/bin/env node
/**
 * Lists packages under packages/plugins and checks the npm registry for each @holoscript/* name.
 * No auth required. Bulk publish still needs npm login and workspace:* → semver peer fixes.
 */
import { readFileSync, readdirSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const PLUGINS = join(ROOT, 'packages', 'plugins');

function viewVersion(name) {
  try {
    const v = execSync(`npm view ${JSON.stringify(name)} version`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 20000,
    }).trim();
    return v || null;
  } catch {
    return null;
  }
}

async function main() {
  const dirs = readdirSync(PLUGINS, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  const rows = [];
  for (const dir of dirs.sort()) {
    const pkgPath = join(PLUGINS, dir, 'package.json');
    if (!existsSync(pkgPath)) continue;
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
    const name = pkg.name;
    if (!name) continue;
    const latest = viewVersion(name);
    rows.push({ dir, name, npmLatest: latest, unpublished: !latest });
  }

  const unpublished = rows.filter((r) => r.unpublished);
  console.log(
    JSON.stringify(
      {
        total: rows.length,
        published: rows.length - unpublished.length,
        unpublishedCount: unpublished.length,
        packages: rows,
      },
      null,
      2
    )
  );

  if (unpublished.length) {
    console.error('\n# Unpublished packages (run after npm login + peer dep semver):');
    for (const r of unpublished) {
      console.error(`# pnpm --filter ${JSON.stringify(r.name)} publish --access public`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
