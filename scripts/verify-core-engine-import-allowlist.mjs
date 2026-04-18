#!/usr/bin/env node
/**
 * Inventory: production TypeScript under packages/core/src that imports @holoscript/engine.
 * Use this before refactors to measure burn-down; pair with:
 *   npx madge packages/core/src --circular --extensions ts
 * and scripts/check-architecture-coupling.js (mutual pair allowlist).
 *
 * Optional: VERIFY_CORE_ENGINE_IMPORTS_MAX=N — exit 1 if file count > N (default: no limit).
 *
 * Usage: node scripts/verify-core-engine-import-allowlist.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const CORE_SRC = path.join(ROOT, 'packages', 'core', 'src');

const ENGINE_RE = /@holoscript\/engine/;

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (ent.name === '__tests__' || ent.name === 'node_modules') continue;
      walk(p, out);
    } else if (
      ent.isFile() &&
      ent.name.endsWith('.ts') &&
      !ent.name.endsWith('.test.ts') &&
      !ent.name.endsWith('.spec.ts')
    ) {
      out.push(p);
    }
  }
  return out;
}

function main() {
  const files = walk(CORE_SRC);
  const hits = [];

  for (const abs of files) {
    const rel = path.relative(CORE_SRC, abs).split(path.sep).join('/');
    if (rel.includes('__tests__')) continue;

    const text = fs.readFileSync(abs, 'utf8');
    if (!ENGINE_RE.test(text)) continue;

    hits.push(rel);
  }

  hits.sort();

  const max = process.env.VERIFY_CORE_ENGINE_IMPORTS_MAX;
  const maxN = max != null && max !== '' ? parseInt(max, 10) : NaN;

  console.log(
    `[verify-core-engine-imports] Production files under core/src importing @holoscript/engine: ${hits.length}`
  );
  if (hits.length > 0 && hits.length <= 80) {
    for (const h of hits) console.log(`  - ${h}`);
  } else if (hits.length > 80) {
    for (const h of hits.slice(0, 40)) console.log(`  - ${h}`);
    console.log(`  ... and ${hits.length - 40} more`);
  }

  if (!Number.isNaN(maxN) && hits.length > maxN) {
    console.error(
      `[verify-core-engine-imports] FAIL: ${hits.length} files > VERIFY_CORE_ENGINE_IMPORTS_MAX=${maxN}`
    );
    process.exit(1);
  }

  process.exit(0);
}

main();
