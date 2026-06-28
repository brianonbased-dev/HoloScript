#!/usr/bin/env node
/**
 * Run @evolve_program against WASMCompiler.ts with a sovereign proposer.
 *
 * This script wires the generic runEvolution backend to the concrete
 * WASMCompiler fitness oracle in scripts/evolve-wasmcompiler-gate.mjs. The
 * loop proposes full source candidates, writes each proposal into .scratch,
 * gates it with the real WASMCompiler vitest target + WAT-density measurement,
 * and emits a propose-not-ship receipt. It never mutates the tracked target.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const DEFAULT_TARGET = 'packages/core/src/compiler/WASMCompiler.ts';
const DEFAULT_MODEL = 'qwen3:4b-instruct';
const DEFAULT_ENDPOINT = 'http://127.0.0.1:11434';
const DEFAULT_OUT = '.scratch/evolve-wasmcompiler/proposer/receipt.json';
const DEFAULT_BEST_OUT = '.scratch/evolve-wasmcompiler/proposer/best-WASMCompiler.ts';
const DEFAULT_TRACE_OUT = '.scratch/evolve-wasmcompiler/proposer/trace.jsonl';
const DEFAULT_RUN_ROOT = '.scratch/evolve-wasmcompiler/proposer/runs';
const DEFAULT_GOAL =
  'Reduce WASMCompiler WAT output length while preserving every public compiler behavior and passing src/compiler/WASMCompiler.test.ts. Return the full TypeScript source only.';

const args = process.argv.slice(2);

function usage() {
  return `Usage: node scripts/evolve-wasmcompiler-proposer.mjs [options]

Options:
  --target <path>          Target source file (default: ${DEFAULT_TARGET})
  --seed-ref <ref>         Git ref used as the fitness baseline (default: HEAD)
  --endpoint <url>         Ollama endpoint (default: ${DEFAULT_ENDPOINT})
  --model <name>           Ollama proposer model (default: ${DEFAULT_MODEL})
  --goal <text>            Natural-language evolution goal
  --generations <n>        Search generations (default: 1)
  --population <n>         Proposals per generation (default: 1)
  --archive-size <n>       Survivor archive size (default: 2)
  --out <path>             Combined proposer receipt path (default: ${DEFAULT_OUT})
  --best-out <path>        Best candidate path when improved (default: ${DEFAULT_BEST_OUT})
  --trace-out <path>       Graded trace JSONL path (default: ${DEFAULT_TRACE_OUT})
  --run-id <id>            Stable scratch run id (default: timestamp)
  --candidate-dir <path>   Scratch candidate directory
  --gate-dir <path>        Per-candidate gate receipt directory
  --mock-proposer <path>   Return this file as the proposal instead of calling Ollama
  --skip-tests             Forward to the gate; for smoke runs only
  --json                   Print the combined receipt as JSON
  --help                   Show this help`;
}

function argValue(name, fallback = null) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : fallback;
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

function intArg(name, fallback) {
  const raw = argValue(name, String(fallback));
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
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

function runGate({
  target,
  candidatePath,
  seedRef,
  outPath,
  skipTests,
}) {
  const gateArgs = [
    'scripts/evolve-wasmcompiler-gate.mjs',
    '--target',
    rel(target),
    '--seed-ref',
    seedRef,
    '--candidate',
    rel(candidatePath),
    '--out',
    rel(outPath),
    '--json',
  ];
  if (skipTests) gateArgs.push('--skip-tests');

  const result = spawnSync('node', gateArgs, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 32,
  });
  let receipt = null;
  const jsonLine = (result.stdout ?? '').trim().split('\n').filter(Boolean).at(-1);
  if (jsonLine) {
    try {
      receipt = JSON.parse(jsonLine);
    } catch {
      receipt = null;
    }
  }
  if (!receipt && existsSync(outPath)) {
    receipt = JSON.parse(readFileSync(outPath, 'utf8'));
  }
  return {
    exitCode: result.status ?? 1,
    stdoutTail: (result.stdout ?? '').slice(-4000),
    stderrTail: (result.stderr ?? '').slice(-4000),
    receipt,
  };
}

async function main() {
  if (hasFlag('--help')) {
    console.log(usage());
    return 0;
  }

  const target = resolve(REPO_ROOT, argValue('--target', DEFAULT_TARGET));
  if (!existsSync(target)) throw new Error(`target not found: ${rel(target)}`);

  const seedRef = argValue('--seed-ref', 'HEAD');
  const model = argValue('--model', process.env.EVOLVE_PROPOSER_MODEL ?? DEFAULT_MODEL);
  const endpoint = argValue('--endpoint', process.env.EVOLVE_OLLAMA_ENDPOINT ?? DEFAULT_ENDPOINT);
  const goal = argValue('--goal', DEFAULT_GOAL);
  const out = resolve(REPO_ROOT, argValue('--out', DEFAULT_OUT));
  const bestOut = resolve(REPO_ROOT, argValue('--best-out', DEFAULT_BEST_OUT));
  const traceOut = resolve(REPO_ROOT, argValue('--trace-out', DEFAULT_TRACE_OUT));
  const runId = argValue(
    '--run-id',
    new Date().toISOString().replace(/[:.]/g, '-'),
  );
  const runRoot = resolve(REPO_ROOT, DEFAULT_RUN_ROOT, runId);
  const candidateDir = resolve(REPO_ROOT, argValue('--candidate-dir', rel(resolve(runRoot, 'candidates'))));
  const gateDir = resolve(REPO_ROOT, argValue('--gate-dir', rel(resolve(runRoot, 'gates'))));
  const mockProposer = argValue('--mock-proposer', null);
  const skipTests = hasFlag('--skip-tests');
  const jsonOnly = hasFlag('--json');

  mkdirSync(candidateDir, { recursive: true });
  mkdirSync(gateDir, { recursive: true });
  mkdirSync(dirname(out), { recursive: true });
  mkdirSync(dirname(bestOut), { recursive: true });
  mkdirSync(dirname(traceOut), { recursive: true });

  const seedCode = gitShow(seedRef, target);
  const seedSha256 = sha256(seedCode);
  const policy = {
    goal,
    generations: intArg('--generations', 1),
    population: intArg('--population', 1),
    archiveSize: intArg('--archive-size', 2),
    proposerModel: model,
  };

  if (process.env.HOLOSCRIPT_EVOLVE_WASMCOMPILER_TSX !== '1') {
    const rerun = spawnSync('node', ['--import', 'tsx', fileURLToPath(import.meta.url), ...args], {
      cwd: REPO_ROOT,
      env: { ...process.env, HOLOSCRIPT_EVOLVE_WASMCOMPILER_TSX: '1' },
      encoding: 'utf8',
      stdio: 'inherit',
    });
    return rerun.status ?? 1;
  }

  const evolutionEntry = resolve(REPO_ROOT, 'packages/core/src/evolution/index.ts');
  const evolution = await import(pathToFileURL(evolutionEntry).href);
  const {
    makeOllamaProposer,
    runEvolution,
    toGradedTraceRow,
  } = evolution;

  const baseProposer = mockProposer
    ? async () => readFileSync(resolve(REPO_ROOT, mockProposer), 'utf8')
    : makeOllamaProposer(endpoint, model);
  const propose = async (parentCode, promptGoal, activePolicy) =>
    baseProposer(parentCode, promptGoal, activePolicy);

  const gateReceipts = [];
  let gateIndex = 0;
  const gate = async (candidateCode) => {
    const index = gateIndex++;
    const candidatePath = resolve(candidateDir, `candidate-${String(index).padStart(3, '0')}.ts`);
    const gateOut = resolve(gateDir, `gate-${String(index).padStart(3, '0')}.json`);
    writeFileSync(candidatePath, candidateCode, 'utf8');
    const gateRun = runGate({
      target,
      candidatePath,
      seedRef,
      outPath: gateOut,
      skipTests,
    });
    const receipt = gateRun.receipt;
    gateReceipts.push({
      candidate: rel(candidatePath),
      receipt: rel(gateOut),
      exitCode: gateRun.exitCode,
      verifyUrl: receipt?.verifyUrl ?? null,
      passed: receipt?.passed ?? false,
      score: receipt?.measurement?.score ?? null,
      note: receipt?.measurement?.note ?? null,
      candidateSha256: receipt?.candidateSha256 ?? sha256(candidateCode),
      correctnessExitCode: receipt?.correctness?.exitCode ?? null,
    });

    if (candidateCode === seedCode && receipt?.baselineMeasurement?.passed) {
      return { passed: true, score: receipt.baselineMeasurement.score };
    }
    if (!receipt?.passed || !receipt?.measurement) {
      return { passed: false, score: Infinity };
    }
    return { passed: true, score: receipt.measurement.score };
  };

  const traceRows = [];
  const traceRecords = [];
  const result = await runEvolution(seedCode, policy, {
    propose,
    gate,
    onCandidate: (record) => {
      traceRecords.push(record);
      traceRows.push(toGradedTraceRow(record, {
        agentId: 'wasmcompiler-evolve',
        source: 'evolve-wasmcompiler-proposer',
        ts: new Date().toISOString(),
      }));
    },
  });

  writeFileSync(
    traceOut,
    traceRows.map((row) => JSON.stringify(row)).join('\n') + (traceRows.length ? '\n' : ''),
    'utf8',
  );
  if (result.bestCode) {
    writeFileSync(bestOut, result.bestCode, 'utf8');
  }

  const receiptBase = {
    schema: 'holoscript-evolve-wasmcompiler-proposer-v1',
    target: rel(target),
    seed: `git:${seedRef}:${rel(target)}`,
    seedSha256,
    proposer: mockProposer
      ? { kind: 'mock-file', source: rel(resolve(REPO_ROOT, mockProposer)), model }
      : { kind: 'ollama', endpoint, model },
    policy,
    result: result.receipt,
    bestCandidate: result.bestCode ? rel(bestOut) : null,
    trace: rel(traceOut),
    gatedCandidates: gateReceipts,
    gatedTraceRecords: traceRecords.length,
    selfShips: false,
    skipTests,
    ts: new Date().toISOString(),
  };
  const receipt = {
    ...receiptBase,
    verifyUrl: `cael:sha256:${sha256(JSON.stringify(receiptBase))}`,
  };
  writeFileSync(out, JSON.stringify(receipt, null, 2) + '\n', 'utf8');

  if (jsonOnly) {
    console.log(JSON.stringify(receipt));
  } else {
    console.log(
      `[evolve-wasmcompiler-proposer] result=${result.receipt.result} seed=${result.receipt.seedScore} best=${result.receipt.bestScore} receipt=${rel(out)} verify=${receipt.verifyUrl}`,
    );
    if (result.bestCode) {
      console.log(`[evolve-wasmcompiler-proposer] best candidate: ${rel(bestOut)}`);
    }
  }
  return result.receipt.result === 'IMPROVED' ? 0 : 1;
}

main()
  .then((code) => {
    process.exit(code);
  })
  .catch((error) => {
    console.error(`[evolve-wasmcompiler-proposer] ${error?.message ?? error}`);
    process.exit(2);
  });
