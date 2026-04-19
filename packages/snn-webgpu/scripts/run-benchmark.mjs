import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const pkgRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(pkgRoot, '../..');

function boolEnv(name, defaultValue = false) {
  const raw = process.env[name];
  if (raw == null) return defaultValue;
  return ['1', 'true', 'yes', 'on'].includes(String(raw).toLowerCase());
}

function numEnv(name, defaultValue) {
  const raw = process.env[name];
  if (raw == null) return defaultValue;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultValue;
}

function resolveOptions() {
  const target = process.env.BENCH_TARGET ?? 'auto';
  const strictAdapter = boolEnv('BENCH_STRICT_ADAPTER', target === 'rtx3060');
  const headless = boolEnv('BENCH_HEADLESS', true);
  const timeoutMs = numEnv('BENCH_TIMEOUT_MS', 120000);
  const requireCompleted = boolEnv('BENCH_REQUIRE_COMPLETED', true);
  const commit = process.env.BENCH_COMMIT ?? process.env.GIT_COMMIT ?? 'auto';
  const driver = process.env.BENCH_DRIVER ?? 'auto';
  const outputPath =
    process.env.BENCH_OUTPUT_PATH ?? path.join(repoRoot, '.bench-logs', 'paper-2-lif-throughput-automated.json');

  return {
    target,
    strictAdapter,
    headless,
    timeoutMs,
    requireCompleted,
    commit,
    driver,
    outputPath,
  };
}

async function main() {
  const options = resolveOptions();
  console.log('[SNN-WebGPU Benchmark] Starting automated browser harness...');
  console.log('[SNN-WebGPU Benchmark] Options:', options);

  // Launch Chromium with WebGPU enabled
  const browser = await chromium.launch({
    headless: options.headless,
    args: [
      '--enable-unsafe-webgpu',
      '--disable-vulkan-fallback',
      '--ignore-gpu-blocklist',
      '--use-angle=vulkan'
    ]
  });

  const page = await browser.newPage();
  page.on('console', (msg) => {
    if (msg.type() === 'error' || msg.type() === 'warning') {
      console.log(`[browser:${msg.type()}] ${msg.text()}`);
    }
  });
  page.on('pageerror', (err) => {
    console.log(`[browser:pageerror] ${err.message}`);
  });
  
  // Expose a binding so the page can report when done
  let benchmarkPromiseResolve;
  let settled = false;
  const benchmarkPromise = new Promise(resolve => {
    benchmarkPromiseResolve = resolve;
  });

  await page.exposeFunction('onBenchmarkComplete', (artifact) => {
    if (settled) return;
    settled = true;
    benchmarkPromiseResolve(artifact);
  });

  // Inject a small script to watch for the status change
  const watchScript = `
    setInterval(() => {
      if (window.__PAPER2_LIF_ARTIFACT__ && 
         (window.__PAPER2_LIF_ARTIFACT__.status === 'completed' || 
          window.__PAPER2_LIF_ARTIFACT__.status.includes('error') || 
          window.__PAPER2_LIF_ARTIFACT__.status.includes('aborted'))) {
        window.onBenchmarkComplete(window.__PAPER2_LIF_ARTIFACT__);
      }
    }, 500);
  `;

  await page.addInitScript(watchScript);

  const fileUrl = `file://${path.join(pkgRoot, 'benchmark-gpu.html')}?target=${encodeURIComponent(options.target)}&strictAdapter=${options.strictAdapter ? '1' : '0'}&commit=${encodeURIComponent(options.commit)}&driver=${encodeURIComponent(options.driver)}`;
  console.log(`[SNN-WebGPU Benchmark] Navigating to ${fileUrl}`);
  
  await page.goto(fileUrl);
  
  console.log('[SNN-WebGPU Benchmark] Waiting for benchmark to complete (this may take a while)...');
  
  // Wait for the benchmark to report completion
  const artifact = await Promise.race([
    benchmarkPromise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Benchmark timed out after ${options.timeoutMs} ms`)), options.timeoutMs)
    )
  ]);
  
  await browser.close();

  const outPath = path.resolve(options.outputPath);
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, JSON.stringify(artifact, null, 2));
  console.log(`[SNN-WebGPU Benchmark] Artifact saved to ${outPath}`);

  const isCompleted = artifact?.status === 'completed';
  if (!isCompleted) {
    console.error('[SNN-WebGPU Benchmark] Benchmark finished with non-completed status:', artifact?.status);
    console.error('Failures:', JSON.stringify(artifact?.failures ?? [], null, 2));
    if (options.requireCompleted) {
      process.exit(1);
    }
    console.log('[SNN-WebGPU Benchmark] Non-completed status accepted (BENCH_REQUIRE_COMPLETED=false).');
    return;
  }

  console.log('[SNN-WebGPU Benchmark] Benchmark completed successfully.');
  
  // Print summary
  if (artifact.lif && artifact.lif.peak) {
    console.log(`\n=== RESULTS ===`);
    console.log(`Peak Throughput: ${artifact.lif.peak.throughput_M_per_s} M neurons/s (N=${artifact.lif.peak.neurons})`);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
