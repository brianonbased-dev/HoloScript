#!/usr/bin/env tsx

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  GENERATED_GEOMETRY_FAMILY_SUITE,
  PROOF_CARRYING_GEOMETRY_SMOKE_SUITE,
  attachSemanticAdvisoriesToRunnerResult,
  runConjectureRunner,
  type ConjectureRunnerSuite,
} from '../packages/engine/src/simulation/ConjectureRunner';
// RATCHET: NUMERIC_SEQUENCE_SMOKE_SUITE and PROOF_CARRYING_SDF_SUITE were never exported from ConjectureRunner
import type { ConjecturePriorArtEntry } from '../packages/engine/src/simulation/ConjectureEngine';
import {
  buildSemanticCorpusIndex,
  deserializeIndex,
  type SemanticCorpusIndex,
} from '../packages/engine/src/simulation/SemanticCorpusIndex';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_SEMANTIC_CORPUS = resolve(
  REPO_ROOT,
  'scripts',
  'conjecture-corpus',
  'corpus.arxiv.v2.json'
);
const SUPPORTED_SUITES = [
  PROOF_CARRYING_GEOMETRY_SMOKE_SUITE,
  GENERATED_GEOMETRY_FAMILY_SUITE,
  // RATCHET: NUMERIC_SEQUENCE_SMOKE_SUITE and PROOF_CARRYING_SDF_SUITE removed — never exported
] as const;

interface CliOptions {
  suite: ConjectureRunnerSuite;
  out: string;
  proposedBy: string;
  includeHashBoundary: boolean;
  semanticAdvisory: boolean;
  semanticCorpus: string;
  semanticIndex: string;
  semanticThreshold?: number;
}

function parseArgs(argv: ReadonlyArray<string>): CliOptions {
  const options: Omit<CliOptions, 'out'> & { out?: string } = {
    suite: PROOF_CARRYING_GEOMETRY_SMOKE_SUITE,
    proposedBy: 'codex-hardware',
    includeHashBoundary: true,
    semanticAdvisory: false,
    semanticCorpus: DEFAULT_SEMANTIC_CORPUS,
    semanticIndex: '',
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
    } else if (arg === '--semantic-advisory') {
      options.semanticAdvisory = true;
    } else if (arg === '--semantic-corpus') {
      options.semanticAdvisory = true;
      options.semanticCorpus = resolve(REPO_ROOT, argv[++i]);
    } else if (arg === '--semantic-index') {
      options.semanticAdvisory = true;
      options.semanticIndex = resolve(REPO_ROOT, argv[++i]);
    } else if (arg === '--semantic-threshold') {
      options.semanticAdvisory = true;
      options.semanticThreshold = Number(argv[++i]);
    } else if (arg === '--help' || arg === '-h') {
      console.log(
        [
          `Usage: pnpm conjecture:runner [--suite ${SUPPORTED_SUITES.join('|')}] [--out .scratch/conjecture/receipt.json]`,
          '',
          'Runs the HoloScript Conjecture Engine MVP gate: >=1 survivor green receipt',
          'and >=1 falsified counterexample world that re-fails on replay.',
          '',
          'Semantic advisory options:',
          '  --semantic-advisory                 Attach learned-semantic novelty advisory beside the receipt',
          '  --semantic-corpus <path>            Build an advisory index from a corpus JSON entries array',
          '  --semantic-index <path>             Use a prebuilt serialized SemanticCorpusIndex',
          '  --semantic-threshold <0..1>         Override advisory near-duplicate threshold',
        ].join('\n')
      );
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!SUPPORTED_SUITES.includes(options.suite)) {
    throw new Error(`Unsupported suite: ${options.suite}`);
  }
  if (
    options.semanticThreshold !== undefined &&
    (!Number.isFinite(options.semanticThreshold) ||
      options.semanticThreshold < 0 ||
      options.semanticThreshold > 1)
  ) {
    throw new Error('--semantic-threshold must be finite and between 0 and 1');
  }

  return {
    ...options,
    out: options.out ?? resolve(REPO_ROOT, '.scratch', 'conjecture', `${options.suite}.json`),
  };
}

function keyPreview(key: string | null): string | null {
  if (key === null) return null;
  return `${key.slice(0, 96)}... (${key.length} chars)`;
}

function readPriorArtCorpus(path: string): ReadonlyArray<ConjecturePriorArtEntry> {
  const parsed = JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/u, '')) as
    | {
        entries?: unknown;
      }
    | unknown[];
  const entries = Array.isArray(parsed) ? parsed : parsed.entries;
  if (!Array.isArray(entries)) {
    throw new Error(`Semantic corpus must be an array or { entries: [...] }: ${path}`);
  }
  return entries.map((entry, index) => {
    const row = entry as Partial<ConjecturePriorArtEntry> & { title?: string };
    if (typeof row.statement !== 'string' || row.statement.length === 0) {
      throw new Error(`Semantic corpus entry ${index} has no statement`);
    }
    return {
      id: String(row.id || `prior.${index}`),
      source: String(row.source || row.title || `semantic-corpus:${index}`),
      statement: row.statement,
      ...(row.title ? { title: row.title } : {}),
    };
  });
}

async function loadSemanticIndex(options: CliOptions): Promise<SemanticCorpusIndex> {
  if (options.semanticIndex) {
    return deserializeIndex(readFileSync(options.semanticIndex, 'utf8').replace(/^\uFEFF/u, ''));
  }
  return buildSemanticCorpusIndex(readPriorArtCorpus(options.semanticCorpus));
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const result = runConjectureRunner({
    suite: options.suite,
    proposedBy: options.proposedBy,
    includeHashBoundary: options.includeHashBoundary,
  });

  let output: unknown = result;
  let semanticAdvisorySummary: unknown = null;
  if (options.semanticAdvisory) {
    const wrapped = await attachSemanticAdvisoriesToRunnerResult(
      result,
      await loadSemanticIndex(options),
      options.semanticThreshold === undefined ? {} : { threshold: options.semanticThreshold }
    );
    output = wrapped;
    semanticAdvisorySummary = wrapped.semanticAdvisorySummary;
  }

  mkdirSync(dirname(options.out), { recursive: true });
  writeFileSync(options.out, `${JSON.stringify(output, null, 2)}\n`);

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
        semanticAdvisory: semanticAdvisorySummary,
        out: options.out.replace(/\\/g, '/'),
      },
      null,
      2
    )
  );

  if (!result.gate.passed) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(`[conjecture-runner] ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
