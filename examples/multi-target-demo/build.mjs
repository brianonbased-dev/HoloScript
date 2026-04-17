#!/usr/bin/env node
/**
 * Multi-Target Demo — Build Harness
 *
 * Compiles scene.holo to all 5 demo targets:
 *   - out/threejs/scene.js         (Three.js)
 *   - out/r3f/Scene.jsx            (React Three Fiber)
 *   - out/unity/Scene.cs           (Unity C#)
 *   - out/unreal/Scene.md          (Unreal Blueprint export descriptor)
 *   - out/usd/scene.usda           (USD ASCII)
 *
 * Usage:
 *   node build.mjs              # compile all 5
 *   node build.mjs --target usd # compile one
 *   node build.mjs --time       # benchmark + report
 *
 * This harness uses the @holoscript/core compilers directly. The intent is that
 * any future compile target just adds an entry to TARGETS below — the flagship
 * demo stays as a single .holo file.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCENE = path.join(__dirname, 'scene.holo');
const OUT = path.join(__dirname, 'out');

const TARGETS = [
  { name: 'threejs', outFile: 'scene.js', compiler: 'ThreeJSCompiler' },
  { name: 'r3f', outFile: 'Scene.jsx', compiler: 'R3FCompiler' },
  { name: 'unity', outFile: 'Scene.cs', compiler: 'UnityCompiler' },
  { name: 'unreal', outFile: 'Scene.md', compiler: 'UnrealCompiler' },
  { name: 'usd', outFile: 'scene.usda', compiler: 'USDCompiler' },
];

async function loadCompilers() {
  // Resolve from the workspace. In a published scenario this would be a
  // plain import from @holoscript/core.
  const mod = await import('@holoscript/core').catch(async () => {
    // Dev fallback: resolve from monorepo path if not yet npm-installed.
    const repoRoot = path.resolve(__dirname, '..', '..');
    return import(path.join(repoRoot, 'packages', 'core', 'dist', 'index.js'));
  });
  return mod;
}

function parseSource() {
  return fs.readFileSync(SCENE, 'utf-8');
}

async function compileOne(target, core, source) {
  const Compiler = core[target.compiler];
  if (!Compiler) {
    return {
      target: target.name,
      ok: false,
      error: `Compiler ${target.compiler} not found in @holoscript/core exports`,
    };
  }
  const t0 = performance.now();
  try {
    const instance = new Compiler();
    // Compilers expose compile(source) -> string | { code, ... }
    const result = await instance.compile(source);
    const code = typeof result === 'string' ? result : (result?.code ?? JSON.stringify(result, null, 2));
    const outDir = path.join(OUT, target.name);
    fs.mkdirSync(outDir, { recursive: true });
    const outFile = path.join(outDir, target.outFile);
    fs.writeFileSync(outFile, code);
    return {
      target: target.name,
      ok: true,
      durationMs: performance.now() - t0,
      bytes: code.length,
      outFile: path.relative(__dirname, outFile),
    };
  } catch (err) {
    return {
      target: target.name,
      ok: false,
      durationMs: performance.now() - t0,
      error: err.message ?? String(err),
    };
  }
}

async function main() {
  const args = process.argv.slice(2);
  const targetFilter = args.includes('--target') ? args[args.indexOf('--target') + 1] : null;
  const timeMode = args.includes('--time');

  console.log('HoloScript Multi-Target Demo — build harness');
  console.log('Source:', path.relative(process.cwd(), SCENE));
  console.log();

  const core = await loadCompilers();
  const source = parseSource();
  const selected = targetFilter ? TARGETS.filter(t => t.name === targetFilter) : TARGETS;

  const results = [];
  for (const t of selected) {
    const r = await compileOne(t, core, source);
    results.push(r);
    if (r.ok) {
      console.log(`  OK   ${r.target.padEnd(8)} -> ${r.outFile.padEnd(36)} ${r.bytes} bytes  ${r.durationMs.toFixed(1)} ms`);
    } else {
      console.log(`  FAIL ${r.target.padEnd(8)} -> ${r.error}`);
    }
  }

  if (timeMode) {
    const ok = results.filter(r => r.ok);
    const total = ok.reduce((s, r) => s + r.durationMs, 0);
    console.log();
    console.log(`Total compile time: ${total.toFixed(1)} ms across ${ok.length}/${selected.length} targets`);
    console.log(`Average: ${(total / Math.max(1, ok.length)).toFixed(1)} ms per target`);
  }

  console.log();
  const failed = results.filter(r => !r.ok);
  if (failed.length > 0) {
    console.log(`${failed.length} target(s) failed. See errors above.`);
    process.exit(1);
  }
  console.log(`All ${results.length} targets compiled successfully.`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
