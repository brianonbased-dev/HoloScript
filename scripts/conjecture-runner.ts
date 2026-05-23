#!/usr/bin/env tsx

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  GENERATED_GEOMETRY_FAMILY_SUITE,
  PROOF_CARRYING_GEOMETRY_SMOKE_SUITE,
  runConjectureRunner,
  type ConjectureRunnerSuite,
} from '../packages/engine/src/simulation/ConjectureRunner';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SUPPORTED_SUITES = [
  PROOF_CARRYING_GEOMETRY_SMOKE_SUITE,
  GENERATED_GEOMETRY_FAMILY_SUITE,
] as const;

interface CliOptions {
  suite: ConjectureRunnerSuite;
  out: string;
  proposedBy: string;
  includeHashBoundary: boolean;
}

function parseArgs(argv: ReadonlyArray<string>): CliOptions {
  const options: Omit<CliOptions, 'out'> & { out?: string } = {
    suite: PROOF_CARRYING_GEOMETRY_SMOKE_SUITE,
    proposedBy: 'codex-hardware',
    includeHashBoundary: true,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--suite') {
      options.suite = argv[++i] as ConjectureRunnerSuite;
    } else if (arg === '--out') {
      options.out = resolve(REPO_ROOT, argv[++i]);
    } else if (arg === '--proposed-by') {
      options.proposedBy = argv[++i];
    } else if (arg === '--no-hash-boundary') {
      options.includeHashBoundary = false;
    } else if (arg === '--help' || arg === '-h') {
      console.log(
        [
          `Usage: pnpm conjecture:runner [--suite ${SUPPORTED_SUITES.join('|')}] [--out .scratch/conjecture/receipt.json]`,
          '',
          'Runs the HoloScript Conjecture Engine MVP gate: >=1 survivor green receipt',
          'and >=1 falsified counterexample world that re-fails on replay.',
        ].join('\n'),
      );
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!SUPPORTED_SUITES.includes(options.suite)) {
    throw new Error(`Unsupported suite: ${options.suite}`);
  }

  return {
    ...options,
    out: options.out ?? resolve(REPO_ROOT, '.scratch', 'conjecture', `${options.suite}.json`),
  };
}

const options = parseArgs(process.argv.slice(2));
const result = runConjectureRunner({
  suite: options.suite,
  proposedBy: options.proposedBy,
  includeHashBoundary: options.includeHashBoundary,
});

function keyPreview(key: string | null): string | null {
  if (key === null) return null;
  return `${key.slice(0, 96)}... (${key.length} chars)`;
}

mkdirSync(dirname(options.out), { recursive: true });
writeFileSync(options.out, `${JSON.stringify(result, null, 2)}\n`);

console.log(
  JSON.stringify(
    {
      solverType: result.solverType,
      suite: result.suite,
      status: result.status,
      gate: {
        passed: result.gate.passed,
        replayCounterexampleMatched: result.gate.replayCounterexampleMatched,
        survivorReceiptKey: keyPreview(result.gate.survivorReceiptKey),
        falsifiedReceiptKey: keyPreview(result.gate.falsifiedReceiptKey),
      },
      receiptKey: keyPreview(result.receiptKey),
      out: options.out.replace(/\\/g, '/'),
    },
    null,
    2,
  ),
);

if (!result.gate.passed) {
  process.exitCode = 1;
}
