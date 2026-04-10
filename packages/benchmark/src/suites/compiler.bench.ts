/**
 * Incremental Compiler Benchmarks
 *
 * Measures incremental compilation performance:
 * - Full compilation vs incremental
 * - Trait change detection speed
 * - Cache hit rate measurement
 * - Recompilation set calculation
 */

import { readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { Bench } from 'tinybench';
import {
  HoloScriptPlusParser,
  IncrementalCompiler,
  createIncrementalCompiler,
  type HoloComposition,
} from '@holoscript/core';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load fixtures - go up to package root
const fixturesDir = resolve(__dirname, '../../fixtures');
const smallSource = readFileSync(resolve(fixturesDir, 'small.hsplus'), 'utf-8');
const mediumSource = readFileSync(resolve(fixturesDir, 'medium.hsplus'), 'utf-8');
const largeSource = readFileSync(resolve(fixturesDir, 'large.hsplus'), 'utf-8');

// Parse fixtures once
const parser = new HoloScriptPlusParser();
const smallAST = parser.parse(smallSource).ast as HoloComposition;
const mediumAST = parser.parse(mediumSource).ast as HoloComposition;
const largeAST = parser.parse(largeSource).ast as HoloComposition;

// Mock compiler function
const mockCompile = (obj: { name: string }) => `function ${obj.name}() { return <mesh />; }`;

const bench = new Bench({ time: 1000 });

// =============================================================================
// FULL COMPILATION BENCHMARKS
// =============================================================================

bench.add('compile-full-small (fresh)', () => {
  const compiler = createIncrementalCompiler();
  compiler.compile(smallAST, mockCompile);
});

bench.add('compile-full-medium (fresh)', () => {
  const compiler = createIncrementalCompiler();
  compiler.compile(mediumAST, mockCompile);
});

bench.add('compile-full-large (fresh)', () => {
  const compiler = createIncrementalCompiler();
  compiler.compile(largeAST, mockCompile);
});

// =============================================================================
// INCREMENTAL COMPILATION BENCHMARKS
// =============================================================================

// Pre-warm compiler for incremental benchmarks
const warmCompilerSmall = createIncrementalCompiler();
warmCompilerSmall.compile(smallAST, mockCompile);

const warmCompilerMedium = createIncrementalCompiler();
warmCompilerMedium.compile(mediumAST, mockCompile);

const warmCompilerLarge = createIncrementalCompiler();
warmCompilerLarge.compile(largeAST, mockCompile);

bench.add('compile-incremental-small (no changes)', () => {
  warmCompilerSmall.compile(smallAST, mockCompile);
});

bench.add('compile-incremental-medium (no changes)', () => {
  warmCompilerMedium.compile(mediumAST, mockCompile);
});

bench.add('compile-incremental-large (no changes)', () => {
  warmCompilerLarge.compile(largeAST, mockCompile);
});

// =============================================================================
// TRAIT CHANGE DETECTION BENCHMARKS
// =============================================================================

// Create modified ASTs with trait config changes
function modifyTraitConfig(ast: HoloComposition): HoloComposition {
  const modified = JSON.parse(JSON.stringify(ast));
  if (modified.objects?.[0]?.properties) {
    // Modify first property to simulate a change
    const colorProp = modified.objects[0].properties.find(
      (p: { key: string }) => p.key === 'color'
    );
    if (colorProp) {
      colorProp.value = colorProp.value === 'red' ? 'blue' : 'red';
    }
  }
  return modified;
}

bench.add('diff-trait-config-small', () => {
  const modified = modifyTraitConfig(smallAST);
  warmCompilerSmall.diff(smallAST, modified);
});

bench.add('diff-trait-config-medium', () => {
  const modified = modifyTraitConfig(mediumAST);
  warmCompilerMedium.diff(mediumAST, modified);
});

bench.add('diff-trait-config-large', () => {
  const modified = modifyTraitConfig(largeAST);
  warmCompilerLarge.diff(largeAST, modified);
});

// =============================================================================
// RECOMPILATION SET CALCULATION BENCHMARKS
// =============================================================================

// Pre-populate dependency graphs
const depCompiler = createIncrementalCompiler();
depCompiler.compile(mediumAST, mockCompile);

// Add some dependencies to test recompilation set calculation
for (let i = 0; i < 50; i++) {
  const deps = [];
  for (let j = 0; j < Math.min(5, i); j++) {
    deps.push(`item_${i - j - 1}`);
  }
  depCompiler.updateDependencies(`item_${i}`, deps);
}

bench.add('recompilation-set-single-change', () => {
  depCompiler.getRecompilationSet(['item_25']);
});

bench.add('recompilation-set-multiple-changes', () => {
  depCompiler.getRecompilationSet(['item_0', 'item_10', 'item_20', 'item_30', 'item_40']);
});

// =============================================================================
// CACHE SERIALIZATION BENCHMARKS
// =============================================================================

const cacheCompiler = createIncrementalCompiler();
cacheCompiler.compile(mediumAST, mockCompile);
const serializedCache = cacheCompiler.serialize();

bench.add('cache-serialize', () => {
  cacheCompiler.serialize();
});

bench.add('cache-deserialize', () => {
  IncrementalCompiler.deserialize(serializedCache);
});

// =============================================================================
// EXPORT
// =============================================================================

export async function runCompilerBench() {
  await bench.run();

  // Calculate and log cache hit rate
  const stats = warmCompilerMedium.getStats();
  console.log('\n📊 Cache Statistics:');
  console.log(`  Cache size: ${stats.cacheSize} entries`);
  console.log(`  Dependency edges: ${stats.dependencyEdges}`);
  console.log(`  Trait graph objects: ${stats.traitGraphStats.objectCount}`);
  console.log(`  Trait graph traits: ${stats.traitGraphStats.traitCount}`);

  return bench;
}

export { bench };
