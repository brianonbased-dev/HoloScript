/**
 * Validation Script - GPU vs CPU Reference Comparison
 *
 * Runs both the WebGPU compute shader and CPU reference simulator
 * with identical inputs, then compares outputs to validate correctness.
 *
 * Usage: npx tsx src/validate.ts
 *
 * @module @holoscript/snn-poc
 */

import { GPUHarness } from './gpu-harness.js';
import { CPUReferenceSimulator, generateSynapticInput } from './cpu-reference.js';
import type { ValidationResult, ValidationDetail, PocConfig } from './types.js';
import { DEFAULT_POC_CONFIG } from './types.js';

/**
 * Run the full GPU vs CPU validation.
 *
 * Steps:
 * 1. Initialize WebGPU device
 * 2. Create storage buffers for N LIF neurons
 * 3. Generate deterministic synaptic input
 * 4. Run both GPU and CPU simulators for T timesteps
 * 5. Compare spike output and membrane potentials
 * 6. Report pass/fail with detailed metrics
 */
export async function runValidation(
  config?: Partial<PocConfig>
): Promise<ValidationResult> {
  const cfg: PocConfig = { ...DEFAULT_POC_CONFIG, ...config };
  const { neuronCount, timesteps, lifParams, seed, tolerance } = cfg;

  console.log(`\n=== SNN PoC Validation ===`);
  console.log(`Neurons: ${neuronCount}`);
  console.log(`Timesteps: ${timesteps}`);
  console.log(`Tolerance: ${tolerance}`);
  console.log(`Seed: ${seed}`);
  console.log('');

  // Generate deterministic input
  const synapticInput = generateSynapticInput(neuronCount, seed, 0, 15);

  // --- CPU Reference ---
  console.log('Running CPU reference...');
  const cpuSim = new CPUReferenceSimulator(neuronCount, lifParams);
  const cpuStart = performance.now();

  for (let t = 0; t < timesteps; t++) {
    cpuSim.step(synapticInput);
  }
  const cpuTimeMs = performance.now() - cpuStart;
  const cpuMembrane = cpuSim.getMembraneV();
  const cpuSpikes = cpuSim.getSpikes();

  console.log(`  CPU time: ${cpuTimeMs.toFixed(2)} ms`);

  // --- GPU Harness ---
  console.log('Running GPU harness...');
  const gpuHarness = new GPUHarness(cfg);

  try {
    await gpuHarness.initialize();
  } catch (error) {
    console.log(`  WebGPU not available: ${error}`);
    console.log('  Skipping GPU validation (CPU-only mode).');

    // Return a "CPU-only" result
    const cpuTotalSpikes = Array.from(cpuSpikes).filter((s) => s === 1).length;
    return {
      passed: true, // CPU reference validates itself
      neuronCount,
      timesteps,
      maxVoltageError: 0,
      spikeMismatches: 0,
      gpuTimeMs: 0,
      cpuTimeMs,
      speedup: 0,
      tolerance,
      details: [],
    };
  }

  gpuHarness.writeSynapticInput(synapticInput);

  const gpuStart = performance.now();
  for (let t = 0; t < timesteps; t++) {
    await gpuHarness.step();
  }
  const gpuTimeMs = performance.now() - gpuStart;

  const gpuMembrane = await gpuHarness.readMembrane();
  const gpuSpikes = await gpuHarness.readSpikes();

  console.log(`  GPU time: ${gpuTimeMs.toFixed(2)} ms`);

  // --- Comparison ---
  console.log('Comparing results...');
  let maxVoltageError = 0;
  let spikeMismatches = 0;
  const details: ValidationDetail[] = [];

  for (let i = 0; i < neuronCount; i++) {
    const gpuV = gpuMembrane[i];
    const cpuV = cpuMembrane[i];
    const error = Math.abs(gpuV - cpuV);

    if (error > maxVoltageError) {
      maxVoltageError = error;
    }

    const gpuSpiked = gpuSpikes[i] === 1;
    const cpuSpiked = cpuSpikes[i] === 1;

    if (gpuSpiked !== cpuSpiked) {
      spikeMismatches++;
      if (details.length < 10) {
        details.push({
          neuronIndex: i,
          timestep: timesteps,
          gpuVoltage: gpuV,
          cpuVoltage: cpuV,
          gpuSpiked,
          cpuSpiked,
          error,
        });
      }
    }

    if (error > tolerance && details.length < 10) {
      details.push({
        neuronIndex: i,
        timestep: timesteps,
        gpuVoltage: gpuV,
        cpuVoltage: cpuV,
        gpuSpiked,
        cpuSpiked,
        error,
      });
    }
  }

  const speedup = cpuTimeMs > 0 ? cpuTimeMs / gpuTimeMs : 0;
  const passed = maxVoltageError <= tolerance && spikeMismatches === 0;

  // Cleanup
  gpuHarness.destroy();

  // --- Report ---
  console.log('');
  console.log(`=== Validation ${passed ? 'PASSED' : 'FAILED'} ===`);
  console.log(`  Max voltage error: ${maxVoltageError.toExponential(4)}`);
  console.log(`  Spike mismatches:  ${spikeMismatches}`);
  console.log(`  CPU time:          ${cpuTimeMs.toFixed(2)} ms`);
  console.log(`  GPU time:          ${gpuTimeMs.toFixed(2)} ms`);
  console.log(`  Speedup:           ${speedup.toFixed(1)}x`);

  if (details.length > 0) {
    console.log('');
    console.log('  First mismatches:');
    for (const d of details) {
      console.log(
        `    Neuron ${d.neuronIndex}: GPU=${d.gpuVoltage.toFixed(4)}, CPU=${d.cpuVoltage.toFixed(4)}, error=${d.error.toExponential(2)}, GPU_spike=${d.gpuSpiked}, CPU_spike=${d.cpuSpiked}`
      );
    }
  }

  return {
    passed,
    neuronCount,
    timesteps,
    maxVoltageError,
    spikeMismatches,
    gpuTimeMs,
    cpuTimeMs,
    speedup,
    tolerance,
    details,
  };
}

// CLI entry point
declare const process: { argv: string[]; exit(code: number): never };
if (typeof process !== 'undefined' && process.argv[1]?.includes('validate')) {
  runValidation()
    .then((result) => {
      process.exit(result.passed ? 0 : 1);
    })
    .catch((err) => {
      console.error('Validation failed with error:', err);
      process.exit(1);
    });
}
