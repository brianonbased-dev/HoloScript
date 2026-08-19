#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCHEMA_VERSION = 'hololand.holoshell.brain-intent-gate.v0.1.0';
const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..');
const DEFAULT_TMP = path.join('.tmp', 'holoshell');
const DEFAULT_OUTPUT = path.join(DEFAULT_TMP, 'brain-intent-gate-latest.json');
const DEFAULT_JS_OUTPUT = path.join(DEFAULT_TMP, 'brain-intent-gate-latest.js');
const DEFAULT_SOURCE_RECEIPT = path.join(DEFAULT_TMP, 'brain-intent-gate-holoscript-receipt.json');
const DEFAULT_HOLOSCRIPT_REPO = process.env.HOLOSCRIPT_REPO || path.resolve(REPO_ROOT, '..', 'HoloScript');
const DEFAULT_CASE = path.join('research', 'brain-intent-eval', 'cases', 'holoshell-room-marathon.case.json');

function parseArgs(argv) {
  const args = {
    holoscriptRepo: DEFAULT_HOLOSCRIPT_REPO,
    casePath: DEFAULT_CASE,
    output: DEFAULT_OUTPUT,
    jsOutput: DEFAULT_JS_OUTPUT,
    sourceReceipt: DEFAULT_SOURCE_RECEIPT,
    gateLabel: 'holoshell_room_marathon_execute',
    strict: false,
    json: false,
    selfTest: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--holoscript-repo') args.holoscriptRepo = argv[++index] || args.holoscriptRepo;
    else if (arg === '--case') args.casePath = argv[++index] || args.casePath;
    else if (arg === '--output') args.output = argv[++index] || args.output;
    else if (arg === '--js-output') args.jsOutput = argv[++index] || args.jsOutput;
    else if (arg === '--source-receipt') args.sourceReceipt = argv[++index] || args.sourceReceipt;
    else if (arg === '--gate-label') args.gateLabel = argv[++index] || args.gateLabel;
    else if (arg === '--strict') args.strict = true;
    else if (arg === '--json') args.json = true;
    else if (arg === '--self-test') args.selfTest = true;
    else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return args;
}

function printHelp() {
  console.log(`HoloShell brain intent gate

Usage:
  node scripts/holoshell-brain-intent-gate.mjs [options]

Options:
  --holoscript-repo <path>  HoloScript checkout. Defaults to ../HoloScript.
  --case <path>             HoloScript brain-intent case path.
  --output <path>           Local HoloLand gate receipt.
  --js-output <path>        Browser bootstrap JS.
  --source-receipt <path>   HoloScript eval receipt path.
  --gate-label <id>         Runtime gate label.
  --strict                  Exit 1 when the gate blocks.
  --self-test               Assert runtime gate invariants.
  --json                    Print JSON.
  -h, --help                Show this help.
`);
}

function resolveRepoPath(filePath) {
  return path.isAbsolute(filePath) ? filePath : path.resolve(REPO_ROOT, filePath);
}

function readJson(filePath, fallback = null) {
  const resolved = resolveRepoPath(filePath);
  if (!existsSync(resolved)) return fallback;
  return JSON.parse(readFileSync(resolved, 'utf8'));
}

function writeJson(filePath, value) {
  const resolved = resolveRepoPath(filePath);
  mkdirSync(path.dirname(resolved), { recursive: true });
  writeFileSync(resolved, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  return resolved;
}

function writeBrowserBootstrap(filePath, gate) {
  const resolved = resolveRepoPath(filePath);
  mkdirSync(path.dirname(resolved), { recursive: true });
  const payload = JSON.stringify(gate, null, 2).replace(/<\/script/gi, '<\\/script');
  writeFileSync(resolved, `window.HOLOSHELL_BRAIN_INTENT_GATE = ${payload};\n`, 'utf8');
  return resolved;
}

function hashValue(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function runHoloScriptGate(args) {
  const holoscriptRepo = path.resolve(args.holoscriptRepo);
  const script = path.join(holoscriptRepo, 'scripts', 'evaluate-brain-intent-loop.mjs');
  if (!existsSync(script)) {
    return {
      ok: false,
      status: 127,
      stdout: '',
      stderr: `HoloScript evaluator not found: ${script}`,
      error: '',
    };
  }

  const sourceReceipt = resolveRepoPath(args.sourceReceipt);
  const cli = [
    script,
    '--case',
    args.casePath,
    '--output',
    sourceReceipt,
    '--runtime-gate',
    '--gate-label',
    args.gateLabel,
    '--strict',
  ];
  const result = spawnSync(process.execPath, cli, {
    cwd: holoscriptRepo,
    encoding: 'utf8',
    windowsHide: true,
    maxBuffer: 10 * 1024 * 1024,
  });
  return {
    ok: result.status === 0,
    status: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    error: result.error ? result.error.message : '',
    sourceReceipt,
    holoscriptRepo,
  };
}

function buildGate(args) {
  const startedAt = new Date().toISOString();
  const result = runHoloScriptGate(args);
  const sourceReceipt = readJson(args.sourceReceipt, null);
  const sourceSummary = sourceReceipt?.summary || {};
  const sourceGate = sourceReceipt?.gate || {};
  const allowed = Boolean(result.ok && sourceGate.allowed && sourceReceipt?.enforcementBoundary?.runtimeBlocking);
  const failedCheckIds = Array.isArray(sourceGate.failedCheckIds) ? sourceGate.failedCheckIds : [];
  const blockedReason = allowed
    ? ''
    : result.stderr.trim()
      || result.error
      || (failedCheckIds.length ? `Failed brain-intent checks: ${failedCheckIds.join(', ')}` : 'Brain-intent runtime gate blocked execution.');
  const outputPath = resolveRepoPath(args.output);
  const jsOutputPath = resolveRepoPath(args.jsOutput);
  return {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    gateId: `hsbig-${Date.now().toString(36)}-${hashValue({ casePath: args.casePath, startedAt }).slice(0, 10)}`,
    sourceAnchors: {
      source: 'apps/holoshell/source/holoshell-hardware-control.hsplus',
      home: 'apps/holoshell/source/holoshell-home.hsplus',
      adapter: 'scripts/holoshell-brain-intent-gate.mjs',
      holoscriptEvaluator: path.join(path.resolve(args.holoscriptRepo), 'scripts', 'evaluate-brain-intent-loop.mjs'),
      casePath: path.join(path.resolve(args.holoscriptRepo), args.casePath),
    },
    gate: {
      label: args.gateLabel,
      allowed,
      status: allowed ? 'allow' : 'block',
      runtimeBlocking: true,
      blockedReason,
      failedCheckIds,
    },
    holoscriptReceipt: sourceReceipt || null,
    command: {
      status: result.status,
      ok: result.ok,
      stdout: result.stdout.trim(),
      stderr: result.stderr.trim(),
      error: result.error,
    },
    summary: {
      status: allowed ? 'pass' : 'blocked',
      executionAllowed: allowed,
      runtimeBlocking: true,
      caseId: sourceReceipt?.case?.caseId || '',
      receiptStatus: sourceSummary.status || 'missing',
      score: sourceSummary.score || 0,
      passed: sourceSummary.passed || 0,
      total: sourceSummary.total || 0,
      failedCheckCount: failedCheckIds.length,
      blockedReason,
    },
    output: {
      latestPath: outputPath,
      browserBootstrap: jsOutputPath,
      sourceReceiptPath: resolveRepoPath(args.sourceReceipt),
    },
  };
}

function assertSelfTest(gate) {
  const failures = [];
  if (gate.schemaVersion !== SCHEMA_VERSION) failures.push('schemaVersion mismatch');
  if (!gate.gate.runtimeBlocking) failures.push('expected runtime-blocking gate');
  if (!gate.summary.caseId) failures.push('expected HoloScript case id');
  if (!gate.holoscriptReceipt?.enforcementBoundary?.runtimeBlocking) failures.push('expected HoloScript runtime gate receipt');
  if (!gate.summary.executionAllowed) failures.push(gate.summary.blockedReason || 'expected passing HoloShell brain-intent gate');
  if (failures.length) throw new Error(`Self-test failed:\n- ${failures.join('\n- ')}`);
}

try {
  const args = parseArgs(process.argv.slice(2));
  const gate = buildGate(args);
  const output = writeJson(args.output, gate);
  writeBrowserBootstrap(args.jsOutput, gate);
  if (args.selfTest) assertSelfTest(gate);
  if (args.json) {
    console.log(JSON.stringify(gate, null, 2));
  } else {
    console.log(`HoloShell brain intent gate: ${output}`);
    console.log(`Status: ${gate.summary.status}`);
    console.log(`Execution allowed: ${gate.summary.executionAllowed ? 'yes' : 'no'}`);
    console.log(`Case: ${gate.summary.caseId || 'missing'}`);
  }
  if (args.strict && !gate.summary.executionAllowed) process.exit(1);
} catch (error) {
  console.error(`holoshell-brain-intent-gate failed: ${error.message}`);
  process.exit(1);
}
