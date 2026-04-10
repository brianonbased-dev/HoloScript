#!/usr/bin/env node
/**
 * holo2glb — HoloScript Asset Pipeline
 *
 * Compiles .holo source files into .glb binary 3D assets.
 *
 * Usage:
 *   npx tsx scripts/holo2glb.ts <input.holo> [output.glb]
 *   npx tsx scripts/holo2glb.ts examples/native-assets/fire-dragon.holo
 *   npx tsx scripts/holo2glb.ts examples/native-assets/fire-dragon.holo public/models/dragon.glb
 *
 * Pipeline:
 *   .holo source → HoloCompositionParser → HoloComposition AST → GLTFPipeline → .glb binary
 */

import * as fs from 'fs';
import * as path from 'path';
import { HoloCompositionParser } from '../../core/src/parser/HoloCompositionParser';
import { GLTFPipeline } from '../../core/src/compiler/GLTFPipeline';

// ─── CLI ────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);

if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
  console.log(`
🔮 holo2glb — HoloScript Asset Pipeline

Usage:
  npx tsx scripts/holo2glb.ts <input.holo> [output.glb]

Examples:
  npx tsx scripts/holo2glb.ts ../../examples/native-assets/fire-dragon.holo
  npx tsx scripts/holo2glb.ts ../../examples/native-assets/fire-dragon.holo public/models/dragon.glb

Options:
  --stats     Print detailed compilation statistics
  --json      Output glTF JSON instead of binary GLB
  --help, -h  Show this help message

Pipeline: .holo → Parser → AST → GLTFPipeline → .glb
`);
  process.exit(0);
}

const inputPath = path.resolve(args[0]);
const printStats = args.includes('--stats');
const outputJson = args.includes('--json');

// Determine output path
const cleanArgs = args.filter((a) => !a.startsWith('--'));
let outputPath: string;
if (cleanArgs.length >= 2) {
  outputPath = path.resolve(cleanArgs[1]);
} else {
  const ext = outputJson ? '.gltf' : '.glb';
  outputPath = inputPath.replace(/\.holo$/, ext);
}

// ─── Read source ────────────────────────────────────────────────────────────

if (!fs.existsSync(inputPath)) {
  console.error(`❌ File not found: ${inputPath}`);
  process.exit(1);
}

const source = fs.readFileSync(inputPath, 'utf-8');
const inputName = path.basename(inputPath);
const lineCount = source.split('\n').length;

console.log(`\n🔮 holo2glb — HoloScript Asset Pipeline`);
console.log(
  `   Input:  ${inputName} (${lineCount} lines, ${(source.length / 1024).toFixed(1)} KB)`
);

// ─── Parse ──────────────────────────────────────────────────────────────────

const startParse = performance.now();
const parser = new HoloCompositionParser({ tolerant: true });
const result = parser.parse(source);
const parseTime = performance.now() - startParse;

if (!result.ast) {
  console.error(`\n❌ Parse failed with ${result.errors.length} error(s) — no AST produced:`);
  for (const err of result.errors.slice(0, 10)) {
    const loc = err.loc ? ` (line ${err.loc.line}:${err.loc.column})` : '';
    console.error(`   • ${err.message}${loc}`);
    if (err.suggestion) console.error(`     💡 ${err.suggestion}`);
  }
  if (result.errors.length > 10) {
    console.error(`   ... and ${result.errors.length - 10} more errors`);
  }
  process.exit(1);
}

const ast = result.ast;
const objectCount = countObjects(ast);
const parseStatus = result.errors.length === 0 ? '✅' : '⚠️';

console.log(
  `   Parse:  ${parseStatus} ${parseTime.toFixed(0)}ms — "${ast.name}" (${objectCount} objects, ${result.errors.length} parse warnings)`
);

if (result.errors.length > 0 && printStats) {
  for (const e of result.errors.slice(0, 5)) {
    const loc = e.loc ? ` (L${e.loc.line})` : '';
    console.log(`     ⚠️  ${e.message}${loc}`);
  }
  if (result.errors.length > 5) {
    console.log(`     ... and ${result.errors.length - 5} more`);
  }
}

// ─── Compile ────────────────────────────────────────────────────────────────

const startCompile = performance.now();
const pipeline = new GLTFPipeline({ format: outputJson ? 'gltf' : 'glb' });

let compileResult;
try {
  compileResult = pipeline.compile(ast, 'script-token');
} catch (err: unknown) {
  console.error(`\n❌ Compilation failed: ${err instanceof Error ? err.message : String(err)}`);
  if (printStats && err instanceof Error) console.error(err.stack);
  process.exit(1);
}
const compileTime = performance.now() - startCompile;

// ─── Write output ───────────────────────────────────────────────────────────

fs.mkdirSync(path.dirname(outputPath), { recursive: true });

if (outputJson && compileResult.json) {
  fs.writeFileSync(outputPath, JSON.stringify(compileResult.json, null, 2));
} else if (compileResult.binary) {
  fs.writeFileSync(outputPath, compileResult.binary);
} else {
  console.error('❌ No output data produced');
  process.exit(1);
}

const outputSize = fs.statSync(outputPath).size;
const outputName = path.basename(outputPath);
const stats = compileResult.stats;

console.log(`   Compile: ✅ ${compileTime.toFixed(0)}ms`);
console.log(`   Output: ${outputName} (${(outputSize / 1024).toFixed(1)} KB)`);
console.log(
  `\n   📊 ${stats.meshCount} meshes · ${stats.materialCount} materials · ${stats.totalVertices.toLocaleString()} verts · ${stats.totalTriangles.toLocaleString()} tris`
);
console.log(
  `   ⏱️  Total: ${(parseTime + compileTime).toFixed(0)}ms (parse ${parseTime.toFixed(0)}ms + compile ${compileTime.toFixed(0)}ms)\n`
);

if (printStats) {
  console.log('─── Detailed Stats ────────────────────────────────');
  console.log(`  Nodes:       ${stats.nodeCount}`);
  console.log(`  Meshes:      ${stats.meshCount}`);
  console.log(`  Materials:   ${stats.materialCount}`);
  console.log(`  Animations:  ${stats.animationCount}`);
  console.log(`  Vertices:    ${stats.totalVertices.toLocaleString()}`);
  console.log(`  Triangles:   ${stats.totalTriangles.toLocaleString()}`);
  console.log(`  File size:   ${(outputSize / 1024).toFixed(1)} KB`);
  console.log(`  Compression: ${((1 - outputSize / source.length) * 100).toFixed(0)}% vs source`);
  console.log('');
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function countObjects(comp: any): number {
  let count = 0;
  function walk(objects: any[]) {
    if (!objects) return;
    for (const obj of objects) {
      count++;
      if (obj.children) walk(obj.children);
    }
  }
  walk(comp.objects || []);
  for (const group of comp.spatialGroups || []) {
    walk(group.objects || []);
  }
  return count;
}
