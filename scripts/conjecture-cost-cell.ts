#!/usr/bin/env tsx

/**
 * Conjecture cost-cell study (P36 measure).
 *
 * Instruments ConjectureRunner to record candidates-generated-per-accepted-conjecture
 * and per-probe runtime, then runs at increasing scale (10/100/1000 candidates)
 * to produce a cost-cell table + scaling curve.
 *
 * Usage:
 *   pnpm conjecture:cost-cell
 *   pnpm conjecture:cost-cell --scales 10 100 1000
 *   pnpm conjecture:cost-cell --suite generated-geometry-family
 *   pnpm conjecture:cost-cell --out .scratch/conjecture/cost-cell.json
 *
 * Output:
 *   A JSON artifact with per-scale cost-cell results and a summary table.
 *   Also writes a Markdown research artifact to research/ with the cost-cell
 *   table and scaling curve.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PROOF_CARRYING_GEOMETRY_SMOKE_SUITE,
  GENERATED_GEOMETRY_FAMILY_SUITE,
  runConjectureCostCell,
  type ConjectureRunnerSuite,
  type ConjectureCostCellResult,
} from '../packages/engine/src/simulation/ConjectureRunner';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SUPPORTED_SUITES = [
  PROOF_CARRYING_GEOMETRY_SMOKE_SUITE,
  GENERATED_GEOMETRY_FAMILY_SUITE,
] as const;

const DEFAULT_SCALES = [10, 100, 1000];

interface CliOptions {
  suite: ConjectureRunnerSuite;
  scales: number[];
  out: string;
  proposedBy: string;
  includeHashBoundary: boolean;
}

function parseArgs(argv: ReadonlyArray<string>): CliOptions {
  const options: Omit<CliOptions, 'out' | 'scales'> & { out?: string; scales?: number[] } = {
    suite: PROOF_CARRYING_GEOMETRY_SMOKE_SUITE,
    proposedBy: 'cost-cell-study',
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
    } else if (arg === '--scales') {
      const scales: number[] = [];
      while (i + 1 < argv.length && /^\d+$/.test(argv[i + 1])) {
        scales.push(Number(argv[++i]));
      }
      options.scales = scales;
    } else if (arg === '--help' || arg === '-h') {
      console.log(
        [
          `Usage: pnpm conjecture:cost-cell [--suite ${SUPPORTED_SUITES.join('|')}] [--scales 10 100 1000] [--out path]`,
          '',
          'Runs the ConjectureRunner cost-cell study at multiple candidate scales.',
          'Produces a JSON artifact with per-scale results and a Markdown summary.',
          '',
          'Options:',
          '  --suite <suite>                    Suite to benchmark (default: proof-carrying-geometry-smoke)',
          '  --scales <n1> <n2> ...             Candidate scale points (default: 10 100 1000)',
          '  --out <path>                       Output JSON path (default: .scratch/conjecture/cost-cell.json)',
          '  --proposed-by <name>               proposedBy field (default: cost-cell-study)',
          '  --no-hash-boundary                 Exclude hash-boundary scenario',
        ].join('\n')
      );
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!SUPPORTED_SUITES.includes(options.suite as (typeof SUPPORTED_SUITES)[number])) {
    throw new Error(`Unsupported suite: ${options.suite}`);
  }

  return {
    ...options,
    scales: options.scales ?? DEFAULT_SCALES,
    out: options.out ?? resolve(REPO_ROOT, '.scratch', 'conjecture', 'cost-cell.json'),
  };
}

function formatMs(ms: number): string {
  if (ms < 1) return `${(ms * 1000).toFixed(0)}us`;
  if (ms < 1000) return `${ms.toFixed(2)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function buildMarkdownReport(
  results: ConjectureCostCellResult[],
  suite: string,
  proposedBy: string
): string {
  const now = new Date().toISOString().slice(0, 10);
  const lines: string[] = [
    `# Conjecture Cost-Cell Study`,
    '',
    `> **Date**: ${now}`,
    `> **Suite**: ${suite}`,
    `> **Proposed by**: ${proposedBy}`,
    `> **Task**: task_1779822893705_ko16 (P36 measure)`,
    '',
    `## Summary`,
    '',
    `Candidates-per-accepted-conjecture and per-probe runtime across increasing candidate scale.`,
    '',
    `## Cost-Cell Table`,
    '',
    `| Scale | Candidates | Survived | Falsified | C/A Ratio | Total Runner | Total Probe | Mean Cand. | Median Cand. | Max Cand. |`,
    `|------:|-----------:|---------:|----------:|----------:|------------:|------------:|------------:|-------------:|-----------:|`,
  ];

  for (const r of results) {
    const ca = r.candidatesPerAcceptedConjecture?.toFixed(2) ?? 'N/A';
    lines.push(
      `| ${r.scaleCandidateCount} | ${r.survivedCount + r.falsifiedCount + r.undecidedCount} | ${r.survivedCount} | ${r.falsifiedCount} | ${ca} | ${formatMs(r.totalRunnerMs)} | ${formatMs(r.totalProbeMs)} | ${formatMs(r.meanCandidateProbeMs)} | ${formatMs(r.medianCandidateProbeMs)} | ${formatMs(r.maxCandidateProbeMs)} |`
    );
  }

  lines.push('');
  lines.push('## Per-Probe-Type Aggregate');
  lines.push('');

  // Collect all probe types across scales
  const probeIds = new Set<string>();
  for (const r of results) {
    for (const agg of r.probeTypeAggregate) {
      probeIds.add(agg.probeId);
    }
  }

  lines.push(`| Probe ID | Scale | Invocations | Total (ms) | Mean (ms) |`);
  lines.push(`|----------|------:|------------:|-----------:|----------:|`);

  for (const probeId of [...probeIds].sort()) {
    for (const r of results) {
      const agg = r.probeTypeAggregate.find((a) => a.probeId === probeId);
      if (agg) {
        lines.push(
          `| ${probeId} | ${r.scaleCandidateCount} | ${agg.invocationCount} | ${agg.totalMs.toFixed(3)} | ${agg.meanMs.toFixed(3)} |`
        );
      }
    }
  }

  lines.push('');
  lines.push('## Scaling Curve');
  lines.push('');
  lines.push('```');

  // Simple text scaling curve: candidates vs total runner ms
  const maxRunnerMs = Math.max(...results.map((r) => r.totalRunnerMs));
  const width = 60;
  for (const r of results) {
    const barLen = maxRunnerMs > 0 ? Math.round((r.totalRunnerMs / maxRunnerMs) * width) : 0;
    const bar = '#'.repeat(barLen);
    lines.push(
      `${String(r.scaleCandidateCount).padStart(5)} | ${bar} ${formatMs(r.totalRunnerMs)}`
    );
  }

  lines.push('```');
  lines.push('');
  lines.push('## Reproducibility');
  lines.push('');
  lines.push('```bash');
  lines.push(
    `pnpm conjecture:cost-cell --suite ${suite} --scales ${results.map((r) => r.scaleCandidateCount).join(' ')}`
  );
  lines.push('```');
  lines.push('');
  lines.push('*Artifact generated by `scripts/conjecture-cost-cell.ts`.*');

  return lines.join('\n');
}

function main(): void {
  const options = parseArgs(process.argv.slice(2));
  const results: ConjectureCostCellResult[] = [];

  console.log(
    `Conjecture Cost-Cell Study: suite=${options.suite}, scales=${options.scales.join(', ')}`
  );

  for (const scale of options.scales) {
    console.log(`  Running scale=${scale}...`);
    const result = runConjectureCostCell({
      suite: options.suite,
      proposedBy: options.proposedBy,
      candidateScale: scale,
      includeHashBoundary: options.includeHashBoundary,
    });
    results.push(result);

    const ca = result.candidatesPerAcceptedConjecture?.toFixed(2) ?? 'N/A';
    console.log(
      `  scale=${scale}: candidates=${result.scaleCandidateCount}, ` +
        `survived=${result.survivedCount}, falsified=${result.falsifiedCount}, ` +
        `C/A=${ca}, totalRunner=${formatMs(result.totalRunnerMs)}, ` +
        `totalProbe=${formatMs(result.totalProbeMs)}, ` +
        `meanCand=${formatMs(result.meanCandidateProbeMs)}`
    );
  }

  // Write JSON artifact
  mkdirSync(dirname(options.out), { recursive: true });
  const jsonArtifact = {
    meta: {
      date: new Date().toISOString(),
      suite: options.suite,
      proposedBy: options.proposedBy,
      scales: options.scales,
      task: 'task_1779822893705_ko16',
    },
    results,
  };
  writeFileSync(options.out, `${JSON.stringify(jsonArtifact, null, 2)}\n`);

  // Write Markdown research artifact
  const mdReport = buildMarkdownReport(results, options.suite, options.proposedBy);
  const mdPath = resolve(
    REPO_ROOT,
    'research',
    `${new Date().toISOString().slice(0, 10)}_conjecture-cost-cell-study.md`
  );
  mkdirSync(dirname(mdPath), { recursive: true });
  writeFileSync(mdPath, mdReport);

  console.log('');
  console.log(`JSON artifact: ${options.out.replace(/\\/g, '/')}`);
  console.log(`Markdown report: ${mdPath.replace(/\\/g, '/')}`);
}

main();
