#!/usr/bin/env node
/**
 * Evaluate a WASMCompiler.ts candidate as an @evolve_program fitness target.
 *
 * The script solves the monorepo candidate-isolation problem for one target file:
 * it temporarily applies a candidate source, runs the existing WASMCompiler test
 * gate, measures WAT density, writes a CAEL-anchored receipt, then restores the
 * original file before exiting.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const DEFAULT_TARGET = 'packages/core/src/compiler/WASMCompiler.ts';
const DEFAULT_OUT = '.scratch/evolve-wasmcompiler/wasmcompiler-gate-receipt.json';
const DEFAULT_SCENARIO = 'wasm-evolve-density';
const TEST_ARGS = [
  '--filter',
  '@holoscript/core',
  'exec',
  'vitest',
  'run',
  'src/compiler/WASMCompiler.test.ts',
];

const args = process.argv.slice(2);

function argValue(name, fallback = null) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : fallback;
}

function hasFlag(name) {
  return args.includes(name);
}

function rel(path) {
  return relative(REPO_ROOT, path).replace(/\\/g, '/');
}

function sha256(data) {
  return createHash('sha256').update(data).digest('hex');
}

function gitShow(ref, path) {
  const result = spawnSync('git', ['show', `${ref}:${rel(path)}`], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 16,
  });
  if ((result.status ?? 1) !== 0) {
    throw new Error(`git show ${ref}:${rel(path)} failed: ${(result.stderr || result.stdout || '').slice(0, 500)}`);
  }
  return result.stdout;
}

function run(command, runArgs, label) {
  const started = Date.now();
  const result = spawnSync(command, runArgs, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    shell: process.platform === 'win32',
    maxBuffer: 1024 * 1024 * 16,
  });
  return {
    label,
    command: [command, ...runArgs].join(' '),
    exitCode: result.status ?? 1,
    durationMs: Date.now() - started,
    stdoutTail: (result.stdout ?? '').slice(-4000),
    stderrTail: (result.stderr ?? '').slice(-4000),
  };
}

function loadBaseline(scenarioId) {
  const path = resolve(REPO_ROOT, 'benchmarks/baseline.json');
  if (!existsSync(path)) return null;
  const baseline = JSON.parse(readFileSync(path, 'utf8'));
  const scenario = baseline?.scenarios?.[scenarioId];
  return scenario && typeof scenario === 'object' ? scenario : null;
}

function measureFitness(scenarioId, baselineScenario = undefined) {
  const scratchDir = resolve(REPO_ROOT, '.scratch/evolve-wasmcompiler');
  const measureFile = resolve(scratchDir, 'measure-wasmcompiler.mts');
  const scenario = baselineScenario === undefined ? loadBaseline(scenarioId) : baselineScenario;
  mkdirSync(scratchDir, { recursive: true });
  writeFileSync(
    measureFile,
    `
    import { compileToWASM } from '../../packages/core/src/compiler/WASMCompiler.ts';
    import { scoreWasmCompilerArtifact, wasmFitnessBaselineFromScenario } from '../../packages/core/src/evolution/wasmCompilerFitness.ts';
    const scenario = ${JSON.stringify(scenario)};
    const fixture = {
      name: 'wasm_evolve_density_fixture',
      state: { declarations: { counter: 0, temperature: 25.5, enabled: true } },
      objects: [
        {
          name: 'sensor',
          type: 'object',
          properties: [
            { key: 'value', value: 0 },
            { key: 'active', value: true }
          ],
          traits: [],
          children: []
        },
        {
          name: 'actuator',
          type: 'object',
          properties: [{ key: 'power', value: 100 }],
          traits: [],
          children: []
        }
      ]
    };
    const result = compileToWASM(fixture, { format: 'wat', generateBindings: false });
    const baseline = scenario ? wasmFitnessBaselineFromScenario(${JSON.stringify(scenarioId)}, scenario) : null;
    const measurement = scoreWasmCompilerArtifact(result, { baseline, requireImprovement: Boolean(baseline) });
    console.log(JSON.stringify({
      fixture: 'wasm_evolve_density_fixture',
      artifactKind: result.artifactKind,
      format: result.format,
      measurement
    }));
  `,
    'utf8',
  );
  const result = run('corepack', ['pnpm', 'exec', 'tsx', rel(measureFile)], 'measure');
  if (result.exitCode !== 0) {
    return { ok: false, result };
  }
  try {
    return { ok: true, result, data: JSON.parse(result.stdoutTail.trim().split('\n').at(-1) ?? '{}') };
  } catch (err) {
    return {
      ok: false,
      result: {
        ...result,
        stderrTail: `${result.stderrTail}\nJSON parse error: ${err.message}`,
      },
    };
  }
}

const target = resolve(REPO_ROOT, argValue('--target', DEFAULT_TARGET));
const candidate = resolve(REPO_ROOT, argValue('--candidate', rel(target)));
const seedArg = argValue('--seed', null);
const seedRef = argValue('--seed-ref', 'HEAD');
const seed = seedArg ? resolve(REPO_ROOT, seedArg) : null;
const out = resolve(REPO_ROOT, argValue('--out', DEFAULT_OUT));
const scenarioId = argValue('--scenario', DEFAULT_SCENARIO);
const skipTests = hasFlag('--skip-tests');
const jsonOnly = hasFlag('--json');

if (!existsSync(target)) {
  console.error(`target not found: ${target}`);
  process.exit(2);
}
if (!existsSync(candidate)) {
  console.error(`candidate not found: ${candidate}`);
  process.exit(2);
}

const originalSource = readFileSync(target, 'utf8');
const candidateSource = readFileSync(candidate, 'utf8');
const seedSource = seed && existsSync(seed) ? readFileSync(seed, 'utf8') : gitShow(seedRef, target);
const applySeed = originalSource !== seedSource;
const applyCandidate = seedSource !== candidateSource;
let restored = false;
let exitCode = 1;

try {
  if (applySeed) {
    writeFileSync(target, seedSource, 'utf8');
  }
  const seedMeasured = measureFitness(scenarioId, null);
  if (!seedMeasured.ok) {
    throw new Error(seedMeasured.result?.stderrTail || seedMeasured.result?.stdoutTail || 'seed measurement failed');
  }
  const seedMeasurement = seedMeasured.data.measurement;
  const seedBaselineScenario = {
    watLength: seedMeasurement.watLength,
    memoryTotalSize: seedMeasurement.memoryTotalSize,
    wasmDensity: seedMeasurement.score,
  };

  if (applyCandidate) {
    writeFileSync(target, candidateSource, 'utf8');
  }

  const correctness = skipTests
    ? { label: 'compiler-tests', command: 'skipped', exitCode: 0, durationMs: 0, stdoutTail: '', stderrTail: '' }
    : run('corepack', ['pnpm', ...TEST_ARGS], 'compiler-tests');
  const measured = correctness.exitCode === 0 ? measureFitness(scenarioId, seedBaselineScenario) : { ok: false };

  const measurement = measured.ok ? measured.data.measurement : null;
  const passed = correctness.exitCode === 0 && measured.ok && measurement?.passed === true;
  const receiptBase = {
    schema: 'holoscript-evolve-wasmcompiler-gate-v1',
    target: rel(target),
    seed: seed && existsSync(seed) ? rel(seed) : `git:${seedRef}:${rel(target)}`,
    candidate: rel(candidate),
    candidateApplied: applyCandidate,
    seedSha256: sha256(seedSource),
    candidateSha256: sha256(candidateSource),
    baselineMeasurement: seedMeasured.data.measurement,
    correctness,
    measurement,
    measurementRun: measured.ok ? measured.result : measured.result ?? null,
    passed,
    selfShips: false,
    ts: new Date().toISOString(),
  };
  const anchorPayload = JSON.stringify(receiptBase);
  const receipt = {
    ...receiptBase,
    verifyUrl: `cael:sha256:${sha256(anchorPayload)}`,
  };
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(receipt, null, 2), 'utf8');
  if (jsonOnly) {
    console.log(JSON.stringify(receipt));
  } else {
    console.log(
      `[evolve-wasmcompiler-gate] passed=${passed} score=${measurement?.score ?? 'n/a'} receipt=${rel(out)} verify=${receipt.verifyUrl}`,
    );
  }
  exitCode = passed ? 0 : 1;
} finally {
  if (applyCandidate) {
    writeFileSync(target, originalSource, 'utf8');
    restored = true;
  } else if (applySeed) {
    writeFileSync(target, originalSource, 'utf8');
    restored = true;
  }
  if (!jsonOnly && restored) {
    console.error('[evolve-wasmcompiler-gate] restored original target file');
  }
}

process.exit(exitCode);
