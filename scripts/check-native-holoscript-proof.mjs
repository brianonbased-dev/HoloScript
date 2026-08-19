#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';

const SCHEMA_VERSION = 'hololand.native-proof-harness.v1';
const DEFAULT_OUTPUT = path.join('.tmp', 'native-holoscript-proof', 'receipt.json');

const proofCases = [
  {
    id: 'frontier-shard-0',
    source: 'examples/native-authoring-pipeline/asset_world_pipeline.holo',
    role: 'source-to-asset-world-tool-behavior-receipt',
    requiredSignals: [
      ['native composition', /composition\s+"NativeAuthoringPipeline"/],
      ['asset pack', /asset_pack\s*:/],
      ['world assembly', /world_assembly\s*:/],
      ['authoring tool', /author_tool\s*:\s*"holoscript-native-author"/],
      ['player-visible verb', /player_verb\s*:\s*"restore"/],
      ['receipt writer', /action\s+write_receipt/],
      ['runtime validation receipt', /runtime_validated/],
    ],
  },
  {
    id: 'twin-universe',
    source: 'examples/twin-universe/first_playable_slice.holo',
    role: 'source-to-twin-universe-player-loop-receipt',
    requiredSignals: [
      ['native composition', /composition\s+"TwinUniverseFirstPlayableSlice"/],
      ['universe layer', /universe_layer\s*:/],
      ['geo anchors', /geo_anchors\s*:/],
      ['privacy rule', /privacy_rules\s*:/],
      ['player quest', /quest_type\s*:\s*"location_aware"/],
      ['browser behavior', /action\s+play_browser_preview/],
      ['mobile behavior', /action\s+play_mobile_ar_entry/],
      ['receipt writer', /action\s+write_receipt/],
    ],
  },
  {
    id: 'npc-steward',
    source: 'examples/native-authoring-pipeline/asset_world_pipeline.holo',
    role: 'source-to-npc-behavior-reputation-receipt',
    requiredSignals: [
      ['npc template', /template\s+"NPCSteward"/],
      ['npc manifest', /npc\s*:\s*\{/],
      ['sovereign traits', /sovereign_traits\s*:/],
      ['dialogue register', /dialogue_register\s*:\s*"warm_precise_frontier"/],
      ['player-visible NPC object', /object\s+"MiraWayfinder"\s+using\s+"NPCSteward"/],
      ['npc behavior tick', /action\s+tick_npc/],
      ['npc receipt', /write_receipt\("npc_tick"/],
    ],
  },
];

function parseArgs(argv) {
  const args = {
    output: DEFAULT_OUTPUT,
    skipHardware: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--') {
      continue;
    } else if (arg === '--output') {
      args.output = argv[++index];
    } else if (arg === '--skip-hardware') {
      args.skipHardware = true;
    } else if (arg === '--help' || arg === '-h') {
      console.log(`HoloLand native HoloScript proof harness

Usage:
  node scripts/check-native-holoscript-proof.mjs [options]
  pnpm check:native-proof -- [options]

Options:
  --output <path>    Write the proof receipt to this path.
  --skip-hardware   Skip the local hardware baseline receipt.
  -h, --help        Show this help.

Environment:
  HOLOSCRIPT_ROOT    HoloScript checkout path. Defaults to ../HoloScript.
  HOLOSCRIPT_CLI     Explicit HoloScript CLI JS/CJS entrypoint.
  HOLOLAND_ALLOW_PNPM_HOLOSCRIPT_FALLBACK=1
                    Permit pnpm exec fallback when no local CLI is present.
`);
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return args;
}

function run(command, args, options = {}) {
  if (process.platform === 'win32' && command === 'pnpm') {
    const quote = (arg) => {
      const value = String(arg);
      return /\s/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
    };
    const commandLine = ['pnpm', ...args.map(quote)].join(' ');
    return spawnSync('cmd.exe', ['/d', '/s', '/c', commandLine], {
      encoding: 'utf8',
      windowsHide: true,
      ...options,
    });
  }

  return spawnSync(command, args, {
    encoding: 'utf8',
    windowsHide: true,
    ...options,
  });
}

function text(value) {
  return String(value ?? '').trim();
}

function repoPath(relativePath) {
  return path.resolve(process.cwd(), relativePath);
}

function findHoloScriptRoot() {
  const candidates = [
    process.env.HOLOSCRIPT_ROOT,
    path.resolve(process.cwd(), '..', 'HoloScript'),
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (existsSync(path.join(candidate, 'package.json'))) {
      return candidate;
    }
  }

  throw new Error('Unable to find HoloScript root. Set HOLOSCRIPT_ROOT to run parser validation.');
}

function findHoloScriptCli(holoscriptRoot) {
  const candidates = [
    process.env.HOLOSCRIPT_CLI,
    path.join(holoscriptRoot, 'packages', 'cli', 'bin', 'holoscript.cjs'),
    path.join(holoscriptRoot, 'packages', 'cli', 'dist', 'cli.js'),
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return path.resolve(candidate);
    }
  }

  return null;
}

function allowPnpmFallback() {
  return /^(1|true|yes)$/i.test(process.env.HOLOLAND_ALLOW_PNPM_HOLOSCRIPT_FALLBACK ?? '');
}

function parserCommandFor(holoscriptRoot, absoluteSource) {
  const cliPath = findHoloScriptCli(holoscriptRoot);

  if (cliPath) {
    return {
      kind: 'local_holoscript_cli',
      command: process.execPath,
      args: [cliPath, 'parse', absoluteSource],
      cwd: holoscriptRoot,
      cliPath,
    };
  }

  if (!allowPnpmFallback()) {
    return {
      kind: 'missing_local_holoscript_cli',
      command: null,
      args: [],
      cwd: holoscriptRoot,
      cliPath: null,
      error:
        'Unable to find a local HoloScript CLI entrypoint. Set HOLOSCRIPT_CLI, build packages/cli, or set HOLOLAND_ALLOW_PNPM_HOLOSCRIPT_FALLBACK=1 to permit pnpm exec.',
    };
  }

  return {
    kind: 'pnpm_exec_fallback',
    command: 'pnpm',
    args: ['exec', 'holoscript', 'parse', absoluteSource],
    cwd: holoscriptRoot,
    cliPath: null,
  };
}

function validateSignals(sourceText, requiredSignals) {
  return requiredSignals.map(([label, pattern]) => ({
    label,
    passed: pattern.test(sourceText),
  }));
}

function parseSource(holoscriptRoot, absoluteSource) {
  const parserCommand = parserCommandFor(holoscriptRoot, absoluteSource);
  const commandReceipt = {
    kind: parserCommand.kind,
    executable: parserCommand.command,
    args: parserCommand.args,
    cwd: parserCommand.cwd,
    cliPath: parserCommand.cliPath,
  };

  if (!parserCommand.command) {
    return {
      passed: false,
      status: null,
      command: commandReceipt,
      error: parserCommand.error,
      stdout: '',
      stderr: '',
    };
  }

  const result = run(parserCommand.command, parserCommand.args, {
    cwd: parserCommand.cwd,
    timeout: 120000,
  });

  return {
    passed: result.status === 0,
    status: result.status,
    command: commandReceipt,
    error: result.error?.message,
    stdout: text(result.stdout),
    stderr: text(result.stderr),
  };
}

function validateProofCase(holoscriptRoot, proofCase) {
  const absoluteSource = repoPath(proofCase.source);
  const sourceText = readFileSync(absoluteSource, 'utf8');
  const signalResults = validateSignals(sourceText, proofCase.requiredSignals);
  const parser = parseSource(holoscriptRoot, absoluteSource);
  const passed = parser.passed && signalResults.every((signal) => signal.passed);

  return {
    id: proofCase.id,
    role: proofCase.role,
    source: proofCase.source,
    parser,
    signals: signalResults,
    passed,
  };
}

function runHardwareReceipt(outputPath) {
  const hardwareOutput = outputPath.replace(/\.json$/i, '.hardware.json');
  const result = run(process.execPath, [
    'scripts/hardware-audit.mjs',
    '--self-test',
    '--no-browser',
    '--output',
    hardwareOutput,
  ], {
    cwd: process.cwd(),
    timeout: 120000,
  });

  let receipt = null;
  if (existsSync(hardwareOutput)) {
    receipt = JSON.parse(readFileSync(hardwareOutput, 'utf8'));
  }

  return {
    passed: result.status === 0,
    status: result.status,
    output: hardwareOutput,
    error: result.error?.message,
    stdout: text(result.stdout),
    stderr: text(result.stderr),
    receiptSummary: receipt?.summary ?? null,
  };
}

function writeReceipt(outputPath, receipt) {
  mkdirSync(path.dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const outputPath = path.resolve(args.output);
  const holoscriptRoot = findHoloScriptRoot();
  const caseResults = proofCases.map((proofCase) => validateProofCase(holoscriptRoot, proofCase));
  const hardware = args.skipHardware ? { skipped: true, passed: true } : runHardwareReceipt(outputPath);
  const passed = caseResults.every((proofCase) => proofCase.passed) && hardware.passed;

  const receipt = {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    holoscriptRoot,
    status: passed ? 'pass' : 'fail',
    proofCases: caseResults,
    hardware,
  };

  writeReceipt(outputPath, receipt);

  console.log(`NativeProofReceipt: ${receipt.status}`);
  console.log(`Output: ${outputPath}`);
  for (const proofCase of caseResults) {
    const marker = proofCase.passed ? 'PASS' : 'FAIL';
    console.log(`${marker} ${proofCase.id} - ${proofCase.role}`);
  }
  if (hardware.skipped) {
    console.log('SKIP hardware - local hardware audit skipped');
  } else {
    console.log(`${hardware.passed ? 'PASS' : 'FAIL'} hardware - ${hardware.output}`);
  }

  if (!passed) {
    process.exit(1);
  }
}

main();
