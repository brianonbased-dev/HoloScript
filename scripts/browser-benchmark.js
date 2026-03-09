/**
 * Browser Benchmark Script
 *
 * This script can be pasted into the browser console to run real WASM vs
 * TypeScript benchmarks in the browser environment.
 *
 * Usage:
 * 1. Run: cd packages/studio && npm run dev
 * 2. Navigate to http://localhost:3100
 * 3. Open DevTools console (F12)
 * 4. Copy and paste this script
 * 5. View results in console
 *
 * The script will:
 * - Test WASM initialization and compilation
 * - Compare against TypeScript fallback
 * - Show speedup factors
 * - Display results in table format
 */

(async () => {
  console.log('🚀 Starting Browser WASM Performance Benchmark...\n');

  // Import benchmark harness if available
  try {
    const { runBenchmark } = await import('@holoscript/studio');

    // Test source
    const testSource = `composition "BenchmarkScene" {
  environment { skybox: "nebula"; ambient_light: 0.4 }
  
  template "InteractiveOrb" {
    @grabbable @collidable @glowing @physics
    geometry: "sphere"; color: "#00ffff"
    physics: { type: "dynamic"; mass: 1.0; restitution: 0.7 }
    onGrab: { this.color = "#ff00ff" }
  }

  spatial_group "Arena" {
    object "Orb_1" using "InteractiveOrb" { position: [0, 1.5, -2] }
    object "Orb_2" using "InteractiveOrb" { position: [3, 1.5, -2] }
  }
}`;

    // Run benchmark
    console.log('📊 Running 50-iteration benchmark...\n');
    const result = await runBenchmark({
      iterations: 50,
      source: testSource,
      testWasm: true,
    });

    // Display results
    console.log('📈 BENCHMARK RESULTS\n');
    console.log('Source Size:', result.typescript.sourceLength, 'chars');
    console.log('Iterations:', result.typescript.iterations, '\n');

    // Show summary table
    console.table(result.summary);

    // Show detailed metrics if WASM available
    if (result.wasm) {
      console.log('\n✅ WASM BENCHMARK SUCCESSFUL\n');

      if (result.speedup) {
        console.log('⚡ SPEEDUP FACTORS:');
        console.log(`  Initialize: ${result.speedup.init.toFixed(2)}x faster`);
        console.log(`  Parse:      ${result.speedup.parse.toFixed(2)}x faster`);
        console.log(`  Compile:    ${result.speedup.compile.toFixed(2)}x faster`);

        const avgSpeedup = ((result.speedup.parse + result.speedup.compile) / 2).toFixed(2);
        console.log(`  Average:    ${avgSpeedup}x faster`);
      }

      console.log('\n📊 DETAILED METRICS:');
      console.log('\nTypeScript Backend:');
      console.log(`  Init:      ${result.typescript.timings.initMs.toFixed(2)}ms`);
      console.log(`  Parse avg: ${result.typescript.timings.parseMs.toFixed(2)}ms`);
      console.log(`  Parse P95: ${result.typescript.timings.parseP95Ms.toFixed(2)}ms`);
      console.log(`  Compile avg: ${result.typescript.timings.compileMs.toFixed(2)}ms`);
      console.log(`  Compile P95: ${result.typescript.timings.compileP95Ms.toFixed(2)}ms`);

      console.log('\nWASM Backend:');
      console.log(`  Init:      ${result.wasm.timings.initMs.toFixed(2)}ms`);
      console.log(`  Parse avg: ${result.wasm.timings.parseMs.toFixed(2)}ms`);
      console.log(`  Parse P95: ${result.wasm.timings.parseP95Ms.toFixed(2)}ms`);
      console.log(`  Compile avg: ${result.wasm.timings.compileMs.toFixed(2)}ms`);
      console.log(`  Compile P95: ${result.wasm.timings.compileP95Ms.toFixed(2)}ms`);
    } else {
      console.log('⚠️  WASM NOT AVAILABLE - Using TypeScript Fallback\n');
      console.log('This is expected if:');
      console.log('  - WASM binary failed to load');
      console.log('  - /wasm/holoscript.wasm not found');
      console.log('  - Worker creation failed');
      console.log('\nCheck Network tab in DevTools for WASM fetch errors.');
    }

    // Show budget status
    console.log('\n✅ BUDGET COMPLIANCE:');
    if (result.typescript.budgetCheck.withinBudget) {
      console.log('TypeScript: PASS ✓');
    } else {
      console.log('TypeScript: FAIL ✗');
      console.log('Violations:', result.typescript.budgetCheck.violations);
    }

    if (result.wasm?.budgetCheck) {
      if (result.wasm.budgetCheck.withinBudget) {
        console.log('WASM:       PASS ✓');
      } else {
        console.log('WASM:       FAIL ✗');
        console.log('Violations:', result.wasm.budgetCheck.violations);
      }
    }

    console.log('\n✨ Benchmark Complete!');
  } catch (error) {
    console.error('❌ Benchmark Failed:', error);
    console.log('\nMake sure to:');
    console.log('1. Run: cd packages/studio && npm run dev');
    console.log('2. Wait for dev server to start');
    console.log('3. Navigate to http://localhost:3100');
    console.log('4. Run this script in the console');
  }
})();
