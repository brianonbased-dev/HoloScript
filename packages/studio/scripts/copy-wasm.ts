#!/usr/bin/env tsx
/**
 * copy-wasm.ts — Copies built WASM component artifacts from holoscript-component
 * to the studio's public/wasm/ directory for serving.
 *
 * Run: npx tsx scripts/copy-wasm.ts
 * Or:  pnpm wasm:copy  (via package.json script)
 *
 * Artifacts copied:
 *   holoscript.core.wasm  — Main parser/compiler/engine WASM binary (~298 KB)
 *   holoscript.core2.wasm — WASI shim WASM (~12 KB)
 *   holoscript.js         — jco-generated JS bindings (~324 KB)
 *   holoscript.d.ts       — TypeScript type definitions
 */

import { cpSync, mkdirSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const STUDIO_ROOT = resolve(import.meta.dirname ?? __dirname, '..');
const COMPONENT_DIST = resolve(STUDIO_ROOT, '..', 'holoscript-component', 'dist');
const OUTPUT_DIR = join(STUDIO_ROOT, 'public', 'wasm');

// Files to copy (glob-matched from holoscript-component/dist/)
const COPY_FILES = [
  'holoscript.core.wasm',
  'holoscript.core2.wasm',
  'holoscript.js',
  'holoscript.d.ts',
];

function main() {
  // Verify source exists
  if (!existsSync(COMPONENT_DIST)) {
    console.error(`❌ holoscript-component dist/ not found at: ${COMPONENT_DIST}`);
    console.error('   Run: cd packages/holoscript-component && npm run build');
    process.exit(1);
  }

  // Ensure output directory exists
  mkdirSync(OUTPUT_DIR, { recursive: true });

  let copied = 0;
  let totalBytes = 0;

  for (const file of COPY_FILES) {
    const src = join(COMPONENT_DIST, file);
    const dest = join(OUTPUT_DIR, file);

    if (!existsSync(src)) {
      console.warn(`⚠️  Skipping ${file} (not found in dist/)`);
      continue;
    }

    cpSync(src, dest);
    const size = statSync(dest).size;
    totalBytes += size;
    copied++;
    console.log(`  ✓ ${file} (${(size / 1024).toFixed(1)} KB)`);
  }

  // Also copy the interfaces directory for TypeScript consumers
  const interfacesDir = join(COMPONENT_DIST, 'interfaces');
  if (existsSync(interfacesDir)) {
    const destInterfaces = join(OUTPUT_DIR, 'interfaces');
    cpSync(interfacesDir, destInterfaces, { recursive: true });
    const interfaceFiles = readdirSync(interfacesDir);
    copied += interfaceFiles.length;
    console.log(`  ✓ interfaces/ (${interfaceFiles.length} type definitions)`);
  }

  console.log(`\n✅ Copied ${copied} files (${(totalBytes / 1024).toFixed(1)} KB total) → public/wasm/`);
}

main();
