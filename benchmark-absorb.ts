/**
 * HoloScript Absorb Benchmark Script
 * Runs the codebase absorption pipeline and outputs stats for comparison with GitNexus.
 */
import { CodebaseScanner } from './packages/core/src/codebase/CodebaseScanner.ts';
import { CodebaseGraph } from './packages/core/src/codebase/CodebaseGraph.ts';

async function main() {
  const targetDir = './packages/core/src';

  console.log('=== HoloScript Codebase Absorb Benchmark ===');
  console.log(`Target: ${targetDir}`);
  console.log('');

  // Phase 1: Scan
  const scanStart = Date.now();
  const scanner = new CodebaseScanner();
  const result = await scanner.scan({ rootDir: targetDir });
  const scanElapsed = Date.now() - scanStart;

  const stats = result.stats;

  console.log('--- SCAN PHASE ---');
  console.log(`Time: ${scanElapsed}ms`);
  console.log(`Files scanned: ${stats.totalFiles}`);
  console.log(`Languages: ${JSON.stringify(stats.filesByLanguage)}`);
  console.log(`Symbols: ${stats.totalSymbols}`);
  console.log(`Imports: ${stats.totalImports}`);
  console.log(`Calls: ${stats.totalCalls}`);
  console.log(`Total LOC: ${stats.totalLoc}`);
  console.log(`Errors: ${stats.errors.length}`);
  if (stats.errors.length > 0) {
    console.log('First 5 errors:');
    for (const err of stats.errors.slice(0, 5)) {
      console.log(`  ${JSON.stringify(err)}`);
    }
  }
  console.log('');

  // If tree-sitter failed, still continue with whatever we got
  if (stats.totalFiles === 0 && stats.errors.length > 0) {
    console.log('WARNING: Tree-sitter grammar loading failed. Continuing with partial results.');
    console.log('');
  }

  // Phase 2: Graph
  const graphStart = Date.now();
  const graph = new CodebaseGraph();
  graph.buildFromScanResult(result);
  const graphElapsed = Date.now() - graphStart;

  const symbols = graph.getAllSymbols();

  console.log('--- GRAPH PHASE ---');
  console.log(`Time: ${graphElapsed}ms`);
  console.log(`Total symbols in graph: ${symbols.length}`);

  // Count by type
  const typeCounts: Record<string, number> = {};
  for (const sym of symbols) {
    typeCounts[sym.type] = (typeCounts[sym.type] || 0) + 1;
  }
  console.log(`Symbol types: ${JSON.stringify(typeCounts)}`);
  console.log('');

  // Phase 3: Community Detection
  const commStart = Date.now();
  const communities = graph.detectCommunities();
  const commElapsed = Date.now() - commStart;

  console.log('--- COMMUNITY DETECTION ---');
  console.log(`Time: ${commElapsed}ms`);
  console.log(`Communities: ${communities.size}`);
  for (const [name, files] of communities) {
    console.log(`  ${name}: ${files.length} files`);
  }
  console.log('');

  // Phase 4: Sample queries
  console.log('--- QUERY BENCHMARKS ---');

  // 4a: Find symbols by name
  const q1Start = Date.now();
  const parseResults = graph.findSymbolsByName('CompilerBase');
  const q1Time = Date.now() - q1Start;
  console.log(`findSymbolsByName("CompilerBase"): ${parseResults.length} results in ${q1Time}ms`);

  // 4b: Get callers
  const q2Start = Date.now();
  const callers = graph.getCallersOf('compile');
  const q2Time = Date.now() - q2Start;
  console.log(`getCallersOf("compile"): ${callers.length} results in ${q2Time}ms`);

  // 4c: Get callees
  const q3Start = Date.now();
  const callees = graph.getCalleesOf('CodebaseScanner.scanFile');
  const q3Time = Date.now() - q3Start;
  console.log(`getCalleesOf("CodebaseScanner.scanFile"): ${callees.length} results in ${q3Time}ms`);

  // 4d: Impact analysis
  const q4Start = Date.now();
  const impact = graph.getSymbolImpact('CodebaseGraph');
  const q4Time = Date.now() - q4Start;
  console.log(`getSymbolImpact("CodebaseGraph"): ${impact.size} files in ${q4Time}ms`);

  // 4e: Get imports
  const q5Start = Date.now();
  const sampleFile = result.files[0]?.path ?? '';
  const imports = graph.getImportsOf(sampleFile);
  const q5Time = Date.now() - q5Start;
  console.log(`getImportsOf("${sampleFile}"): ${imports.length} imports in ${q5Time}ms`);

  console.log('');
  console.log('--- TOTALS ---');
  const totalElapsed = Date.now() - scanStart;
  console.log(`Total time: ${totalElapsed}ms (${(totalElapsed / 1000).toFixed(1)}s)`);
  console.log(`Nodes (symbols): ${symbols.length}`);
  console.log(`Edges (imports + calls): ${stats.totalImports + stats.totalCalls}`);
  console.log(`Communities: ${communities.size}`);

  // Output machine-readable JSON summary
  console.log('');
  console.log('=== JSON SUMMARY ===');
  console.log(JSON.stringify({
    tool: 'HoloScript Absorb',
    target: targetDir,
    timing: {
      scan_ms: scanElapsed,
      graph_ms: graphElapsed,
      community_ms: commElapsed,
      total_ms: totalElapsed,
    },
    stats: {
      files: stats.totalFiles,
      symbols: symbols.length,
      imports: stats.totalImports,
      calls: stats.totalCalls,
      edges: stats.totalImports + stats.totalCalls,
      loc: stats.totalLoc,
      communities: communities.size,
      errors: stats.errors.length,
    },
    languages: stats.filesByLanguage,
    symbolTypes: typeCounts,
    queryTimes: {
      findByName_ms: q1Time,
      getCallers_ms: q2Time,
      getCallees_ms: q3Time,
      impactAnalysis_ms: q4Time,
      getImports_ms: q5Time,
    },
  }, null, 2));
}

main().catch((err) => {
  console.error('Benchmark failed:', err);
  process.exit(1);
});
