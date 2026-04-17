import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import crypto from 'crypto';

/**
 * D.011 Reproducibility Harness
 * Executes N benchmark loops to establish a statistically significant baseline (e.g. N=12).
 * Collates Node version, lockfile hashes, and timestamps into an artifact payload.
 */

const N_RUNS = process.env.N_RUNS ? parseInt(process.env.N_RUNS) : 12;
const OUTPUT_DIR = path.resolve(process.cwd(), 'docs/benchmark-artifacts');

if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const runDir = path.join(OUTPUT_DIR, `d011-${timestamp}`);
fs.mkdirSync(runDir, { recursive: true });

// 1. Gather Environment Data
const nodeInfo = process.version;
const platformInfo = `${process.platform} ${process.arch}`;
let lockfileHash = 'unknown';

try {
  const fileBuffer = fs.readFileSync(path.join(process.cwd(), 'pnpm-lock.yaml'));
  const hashSum = crypto.createHash('sha256');
  hashSum.update(fileBuffer);
  lockfileHash = hashSum.digest('hex');
} catch (e) {
  console.warn('Could not hash pnpm-lock.yaml');
}

const metadata = {
  timestamp,
  node_version: nodeInfo,
  platform: platformInfo,
  lockfile_sha256: lockfileHash,
  runs: N_RUNS,
  seed_mode: 'random' // Can be configured in CI if necessary
};

fs.writeFileSync(path.join(runDir, 'metadata.json'), JSON.stringify(metadata, null, 2));

console.log(`[D.011] Beginning N=${N_RUNS} benchmark runs.`);
console.log(`[D.011] Artifacts will be saved to: ${runDir}`);

// 2. Execute Benchmark Runs
const summaryData = [];

for (let i = 1; i <= N_RUNS; i++) {
  console.log(`\n--- Run ${i} of ${N_RUNS} ---`);
  try {
    const rawOutput = execSync('pnpm --filter @holoscript/benchmark run bench:ci', { encoding: 'utf-8', stdio: 'pipe' });
    const runArtifactPath = path.join(runDir, `run-${i}.json`);
    
    // We assume the CI output is a valid JSON block somewhere or the last line.
    // To be safe we just save the raw stdout.
    fs.writeFileSync(runArtifactPath, rawOutput);
    console.log(`[D.011] Run ${i} completed.`);
    
    summaryData.push({ run: i, status: 'success', outputFile: `run-${i}.json` });
  } catch (error) {
    console.error(`[D.011] Run ${i} failed. Skipping.`);
    fs.writeFileSync(path.join(runDir, `run-${i}-error.log`), String(error.stdout || error.message));
    summaryData.push({ run: i, status: 'failed', errorFile: `run-${i}-error.log` });
  }
}

// 3. Generate Summary
const summaryPath = path.join(runDir, 'summary.json');
fs.writeFileSync(summaryPath, JSON.stringify({ metadata, results: summaryData }, null, 2));

console.log(`\n[D.011] Reproducibility harness complete. Summary saved at ${summaryPath}`);
process.exit(0);
