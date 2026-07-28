#!/usr/bin/env node
/**
 * Unified HoloAbsorb rebenchmark runner.
 *
 * Builds the current package, audits umbrella ownership and HoloMesh thread
 * coverage, then runs the existing Paper 5 and Paper 26 harnesses without
 * duplicating their benchmark logic. Every subprocess, hardware fact, claim
 * boundary, and output path is captured in one timestamped receipt.
 */
import { cpus, freemem, hostname, platform, release, totalmem } from 'node:os';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '../../..');
const defaultStamp = new Date().toISOString().replace(/[:.]/g, '-');

function parseArgs(argv) {
  const options = {
    outDir: `research/holoabsorb-artifacts/${defaultStamp}`,
    board: 'research/holoabsorb-artifacts/2026-07-26-board-snapshot.json',
    skipBuild: false,
    withXenova: false,
    paper5Trials: 100,
    paper5MaxFiles: 500,
    paper5Dataset: 'packages/absorb-service/benchmarks/paper-5-retrieval-v1.json',
    hybridRepo: 'packages/absorb-service',
    hybridMaxFiles: 2_000,
    help: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const raw = argv[i];
    if (raw === '--skip-build') options.skipBuild = true;
    if (raw === '--with-xenova') options.withXenova = true;
    if (raw === '--help') options.help = true;
    const [flag, inline] = raw.split('=', 2);
    const value = inline ?? argv[i + 1];
    if (inline === undefined && value && !value.startsWith('--')) i += 1;
    if (flag === '--out-dir') options.outDir = value;
    if (flag === '--board') options.board = value;
    if (flag === '--paper5-trials') options.paper5Trials = positiveInt(value, flag);
    if (flag === '--paper5-max-files') options.paper5MaxFiles = positiveInt(value, flag);
    if (flag === '--paper5-dataset') options.paper5Dataset = value;
    if (flag === '--hybrid-repo') options.hybridRepo = value;
    if (flag === '--hybrid-max-files') options.hybridMaxFiles = positiveInt(value, flag);
  }
  return options;
}

function positiveInt(value, flag) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${flag} must be a positive integer`);
  }
  return parsed;
}

function usage() {
  return [
    'Usage: node packages/absorb-service/scripts/bench-holoabsorb.mjs [options]',
    '',
    'Options:',
    '  --out-dir=PATH          Timestamped receipt directory',
    '  --board=PATH            HoloAbsorb thread snapshot for coverage audit',
    '  --skip-build            Reuse the existing absorb-service dist',
    '  --with-xenova           Include the optional Paper 26 model-download ablation',
    '  --paper5-trials=N       Paper 5 timing samples (default 100)',
    '  --paper5-max-files=N    Paper 5 accuracy scan cap (default 500)',
    '  --paper5-dataset=PATH   Frozen Paper 5 retrieval corpus',
    '  --hybrid-repo=PATH      Real-code root for the visual-focus ablation',
    '                           (default packages/absorb-service)',
    '  --hybrid-max-files=N    Full-corpus ceiling for that root (default 2000)',
    '  --help                  Show this message',
  ].join('\n');
}

function commandText(command, args) {
  return [command, ...args]
    .map((part) => (/[\s"]/u.test(part) ? JSON.stringify(part) : part))
    .join(' ');
}

function runStep({ id, command, args, outDir, env = {} }) {
  const startedAt = new Date().toISOString();
  const start = performance.now();
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    env: { ...process.env, ...env },
    encoding: 'utf8',
    maxBuffer: 128 * 1024 * 1024,
    windowsHide: true,
    shell: process.platform === 'win32' && command.toLowerCase().endsWith('.cmd'),
  });
  const durationMs = Math.round(performance.now() - start);
  const stdoutPath = resolve(outDir, `${id}.stdout.log`);
  const stderrPath = resolve(outDir, `${id}.stderr.log`);
  writeFileSync(stdoutPath, result.stdout ?? '', 'utf8');
  writeFileSync(stderrPath, result.stderr ?? '', 'utf8');
  const code = result.status ?? 1;
  console.error(`[holoabsorb] ${id}: ${code === 0 ? 'PASS' : 'FAIL'} (${durationMs}ms)`);
  return {
    id,
    status: code === 0 ? 'pass' : 'fail',
    exitCode: code,
    startedAt,
    durationMs,
    command: commandText(command, args),
    stdoutPath: relative(repoRoot, stdoutPath).replace(/\\/g, '/'),
    stderrPath: relative(repoRoot, stderrPath).replace(/\\/g, '/'),
    spawnError: result.error ? String(result.error.stack ?? result.error) : null,
  };
}

function safeJson(path) {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    return { parseError: String(error) };
  }
}

function safeText(path) {
  return existsSync(path) ? readFileSync(path, 'utf8') : '';
}

function parsePaper26HoloGraph(stdout) {
  return stdout
    .split(/\r?\n/u)
    .map((line) =>
      line.match(
        /^%\s+(\d+)\s+\|\s+(\d+)\s+\|\s+(\d+)\s+\|\s+([\d.]+)\s+\|\s+([\d.]+)\s+\|\s+([\d.]+)\s+\|\s+([\d.]+)\s+\|\s+([\d.]+)×/u
      )
    )
    .filter(Boolean)
    .map((match) => ({
      files: Number(match[1]),
      symbols: Number(match[2]),
      events: Number(match[3]),
      holoGraphQueryUs: Number(match[4]),
      embeddingQueryUs: Number(match[5]),
      holoGraphRecall: Number(match[6]),
      embeddingRecallAt10: Number(match[7]),
      speedup: Number(match[8]),
    }));
}

function parsePaper26HoloEmbed(stdout) {
  return Object.fromEntries(
    stdout
      .split(/\r?\n/u)
      .map((line) => line.match(/^%\s+(structural|holoembed)\s+\|\s+([\d.]+)%/u))
      .filter(Boolean)
      .map((match) => [match[1], Number(match[2]) / 100])
  );
}

function summarizePaper5Accuracy(artifact) {
  if (!artifact) return null;
  return {
    status: artifact.status,
    bootstrap: artifact.bootstrap,
    evaluationStage: artifact.evaluation_stage,
    publicationReady: artifact.publication_ready,
    dataset: artifact.dataset
      ? {
          id: artifact.dataset.id,
          path: artifact.dataset.path,
          sha256: artifact.dataset.sha256,
          auditStatus: artifact.dataset.audit?.status ?? null,
        }
      : null,
    embeddingProvider: artifact.embedding_provider,
    corpus: artifact.corpus,
    querySet: artifact.query_set,
    systems: artifact.systems?.map((system) => ({
      name: system.name,
      status: system.status,
      pAt5: system.p_at_5 ?? null,
      mrr: system.mrr ?? null,
      confidenceIntervals: system.confidence_intervals ?? null,
      deltaVsKeyword: system.delta_vs_keyword ?? null,
      byCategory: system.by_category ?? null,
      runtimeMs: system.runtime_ms ?? null,
    })),
  };
}

function metricDelta(current, legacy, systemName, metric) {
  const currentSystem = current?.systems?.find((system) => system.name === systemName);
  const legacySystem = legacy?.systems?.find((system) => system.name === systemName);
  const currentValue = currentSystem?.[metric];
  const legacyValue = legacySystem?.[metric];
  return typeof currentValue === 'number' && typeof legacyValue === 'number'
    ? Math.round((currentValue - legacyValue) * 1000) / 1000
    : null;
}

function gitValue(args) {
  const result = spawnSync('git', args, {
    cwd: repoRoot,
    encoding: 'utf8',
    windowsHide: true,
  });
  return result.status === 0 ? result.stdout.trim() : null;
}

function hardwareReceipt() {
  const nvidia = spawnSync(
    'nvidia-smi',
    ['--query-gpu=name,driver_version,memory.total', '--format=csv,noheader'],
    { cwd: repoRoot, encoding: 'utf8', windowsHide: true }
  );
  return {
    hostname: hostname(),
    platform: `${platform()} ${release()}`,
    architecture: process.arch,
    node: process.version,
    cpuModel: cpus()[0]?.model ?? null,
    logicalCpuCount: cpus().length,
    totalMemoryBytes: totalmem(),
    freeMemoryBytesAtStart: freemem(),
    gpuInventory: nvidia.status === 0 ? nvidia.stdout.trim().split(/\r?\n/u).filter(Boolean) : [],
    nvidiaSmiStatus: nvidia.status === 0 ? 'available' : 'unavailable',
  };
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.help) {
    console.log(usage());
    return 0;
  }

  const outDir = resolve(repoRoot, options.outDir);
  mkdirSync(outDir, { recursive: true });
  const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
  const node = process.execPath;
  const steps = [];
  const startedAt = new Date().toISOString();
  const hardware = hardwareReceipt();
  const commit = gitValue(['rev-parse', 'HEAD']);
  const worktreeStatusAtStart = gitValue(['status', '--short']);

  if (!options.skipBuild) {
    steps.push(
      runStep({
        id: 'absorb-service-build',
        command: pnpm,
        args: ['--filter', '@holoscript/absorb-service', 'build'],
        outDir,
      })
    );
  }

  const scanDeterminismPath = resolve(outDir, 'scan-determinism.json');
  steps.push(
    runStep({
      id: 'scan-determinism',
      command: node,
      args: [
        'packages/absorb-service/scripts/verify-scan-determinism.mjs',
        `--out=${relative(repoRoot, scanDeterminismPath).replace(/\\/g, '/')}`,
      ],
      outDir,
    })
  );

  const paper5DatasetAuditPath = resolve(outDir, 'paper-5-dataset-audit.json');
  steps.push(
    runStep({
      id: 'paper-5-dataset-audit',
      command: node,
      args: [
        'packages/absorb-service/scripts/verify-paper-5-dataset.mjs',
        `--dataset=${options.paper5Dataset}`,
        `--out=${relative(repoRoot, paper5DatasetAuditPath).replace(/\\/g, '/')}`,
      ],
      outDir,
    })
  );

  const umbrellaAuditPath = resolve(outDir, 'holoabsorb-umbrella-audit.json');
  const auditArgs = [
    'packages/absorb-service/scripts/audit-holoabsorb.mjs',
    `--out=${relative(repoRoot, umbrellaAuditPath).replace(/\\/g, '/')}`,
  ];
  if (options.board) auditArgs.push(`--board=${options.board}`);
  steps.push(
    runStep({
      id: 'holoabsorb-umbrella-audit',
      command: node,
      args: auditArgs,
      outDir,
    })
  );

  const transportBenchmarkPath = resolve(outDir, 'holoabsorb-transport-resilience.json');
  steps.push(
    runStep({
      id: 'holoabsorb-transport-resilience',
      command: node,
      args: [
        'packages/absorb-service/scripts/bench-holoabsorb-transport.mjs',
        `--out=${relative(repoRoot, transportBenchmarkPath).replace(/\\/g, '/')}`,
      ],
      outDir,
    })
  );

  const refreshBenchmarkPath = resolve(outDir, 'holoabsorb-refresh-benchmark.json');
  steps.push(
    runStep({
      id: 'holoabsorb-refresh-benchmark',
      command: node,
      args: [
        'packages/absorb-service/scripts/bench-holoabsorb-refresh.mjs',
        `--out=${relative(repoRoot, refreshBenchmarkPath).replace(/\\/g, '/')}`,
      ],
      outDir,
    })
  );

  const hybridBenchmarkPath = resolve(outDir, 'holoabsorb-hybrid-visual-focus.json');
  steps.push(
    runStep({
      id: 'holoabsorb-hybrid-visual-focus',
      command: node,
      args: [
        'packages/absorb-service/scripts/bench-holoabsorb-hybrid.mjs',
        '--visual-focus-only',
        `--repo=${resolve(repoRoot, options.hybridRepo)}`,
        `--max-files=${options.hybridMaxFiles}`,
        `--out=${relative(repoRoot, hybridBenchmarkPath).replace(/\\/g, '/')}`,
      ],
      outDir,
    })
  );

  const paper5AccuracyPath = resolve(outDir, 'paper-5-accuracy-holoembed.json');
  steps.push(
    runStep({
      id: 'paper-5-accuracy-holoembed',
      command: node,
      args: [
        'packages/absorb-service/scripts/bench-paper-5-accuracy.mjs',
        `--out=${relative(repoRoot, paper5AccuracyPath).replace(/\\/g, '/')}`,
        `--max-files=${options.paper5MaxFiles}`,
        `--dataset=${options.paper5Dataset}`,
        '--provider=holoembed',
      ],
      outDir,
    })
  );

  const paper5LegacyAccuracyPath = resolve(outDir, 'paper-5-accuracy-structural.json');
  steps.push(
    runStep({
      id: 'paper-5-accuracy-structural',
      command: node,
      args: [
        'packages/absorb-service/scripts/bench-paper-5-accuracy.mjs',
        `--out=${relative(repoRoot, paper5LegacyAccuracyPath).replace(/\\/g, '/')}`,
        `--max-files=${options.paper5MaxFiles}`,
        `--dataset=${options.paper5Dataset}`,
        '--provider=structural',
      ],
      outDir,
    })
  );

  const paper5TimingPath = resolve(outDir, 'paper-5-timing.json');
  steps.push(
    runStep({
      id: 'paper-5-timing',
      command: node,
      args: [
        'packages/absorb-service/scripts/bench-paper-5-gpu.mjs',
        `--out=${relative(repoRoot, paper5TimingPath).replace(/\\/g, '/')}`,
        `--trials=${options.paper5Trials}`,
        '--queries=30',
        '--max-symbols=384',
      ],
      outDir,
    })
  );

  const paper26HoloGraphArgs = [
    '--filter',
    '@holoscript/absorb-service',
    'exec',
    'vitest',
    'run',
    'src/engine/__tests__/Paper26Benchmark.test.ts',
    '--reporter=verbose',
    '--testNamePattern=EventEdge',
  ];
  steps.push(
    runStep({
      id: 'paper-26-holograph',
      command: pnpm,
      args: paper26HoloGraphArgs,
      outDir,
    })
  );
  steps.push(
    runStep({
      id: 'paper-26-holoembed',
      command: pnpm,
      args: [
        '--filter',
        '@holoscript/absorb-service',
        'exec',
        'vitest',
        'run',
        'src/engine/__tests__/Paper26Table2NLRecall.test.ts',
        '--reporter=verbose',
      ],
      outDir,
    })
  );
  if (options.withXenova) {
    steps.push(
      runStep({
        id: 'paper-26-xenova-ablation',
        command: pnpm,
        args: [
          '--filter',
          '@holoscript/absorb-service',
          'exec',
          'vitest',
          'run',
          'src/engine/__tests__/Paper26Benchmark.test.ts',
          '--reporter=verbose',
          '--testNamePattern=Xenova',
        ],
        outDir,
      })
    );
  }

  const accuracy = safeJson(paper5AccuracyPath);
  const legacyAccuracy = safeJson(paper5LegacyAccuracyPath);
  const paper5DatasetAudit = safeJson(paper5DatasetAuditPath);
  const scanDeterminism = safeJson(scanDeterminismPath);
  const timing = safeJson(paper5TimingPath);
  const umbrellaAudit = safeJson(umbrellaAuditPath);
  const transportBenchmark = safeJson(transportBenchmarkPath);
  const refreshBenchmark = safeJson(refreshBenchmarkPath);
  const hybridBenchmark = safeJson(hybridBenchmarkPath);
  const paper26HoloGraphMeasurements = parsePaper26HoloGraph(
    safeText(resolve(outDir, 'paper-26-holograph.stdout.log'))
  );
  const paper26HoloEmbedRecall = parsePaper26HoloEmbed(
    safeText(resolve(outDir, 'paper-26-holoembed.stdout.log'))
  );
  const failedSteps = steps.filter((step) => step.status === 'fail');
  const receipt = {
    schemaVersion: 'holoscript.holoabsorb.rebenchmark.v3',
    productName: 'HoloAbsorb',
    status: failedSteps.length === 0 ? 'pass' : 'fail',
    startedAt,
    completedAt: new Date().toISOString(),
    repo: {
      root: repoRoot,
      commit,
      worktreeDirtyAtStart: Boolean(worktreeStatusAtStart),
      worktreeStatusAtStart,
    },
    hardware,
    options: {
      ...options,
      outDir: relative(repoRoot, outDir).replace(/\\/g, '/'),
    },
    steps,
    summaries: {
      scanDeterminism,
      umbrellaAuditStatus: umbrellaAudit?.status ?? null,
      transportResilience: transportBenchmark
        ? {
            status: transportBenchmark.status,
            performanceByScale: transportBenchmark.performanceByScale,
            checks: transportBenchmark.checks,
            failedChecks: transportBenchmark.failedChecks,
          }
        : null,
      refreshBenchmark: refreshBenchmark
        ? {
            status: refreshBenchmark.status,
            fixture: refreshBenchmark.fixture,
            measurements: refreshBenchmark.measurements,
            checks: refreshBenchmark.checks,
          }
        : null,
      hybridVisualFocus: hybridBenchmark
        ? {
            status: hybridBenchmark.status,
            benchmarkProfile: hybridBenchmark.benchmarkProfile,
            claimBoundary: hybridBenchmark.claimBoundary,
            implementation: hybridBenchmark.implementation,
            repo: hybridBenchmark.repo,
            corpus: hybridBenchmark.corpus,
            checks: hybridBenchmark.checks,
            visualDisambiguation: hybridBenchmark.measurements?.visualDisambiguation
              ? {
                  methodology: hybridBenchmark.measurements.visualDisambiguation.methodology,
                  claimBoundary: hybridBenchmark.measurements.visualDisambiguation.claimBoundary,
                  caseSet: hybridBenchmark.measurements.visualDisambiguation.caseSet,
                  summary: hybridBenchmark.measurements.visualDisambiguation.summary,
                  check: hybridBenchmark.measurements.visualDisambiguation.check,
                }
              : null,
          }
        : null,
      paper5Accuracy: {
        datasetAudit: paper5DatasetAudit,
        current: summarizePaper5Accuracy(accuracy),
        legacyFloor: summarizePaper5Accuracy(legacyAccuracy),
        currentMinusLegacy: {
          semanticOnly: {
            pAt5: metricDelta(accuracy, legacyAccuracy, 'semantic-only', 'p_at_5'),
            mrr: metricDelta(accuracy, legacyAccuracy, 'semantic-only', 'mrr'),
          },
          hybrid: {
            pAt5: metricDelta(accuracy, legacyAccuracy, 'hybrid', 'p_at_5'),
            mrr: metricDelta(accuracy, legacyAccuracy, 'hybrid', 'mrr'),
          },
          graphRag: {
            pAt5: metricDelta(accuracy, legacyAccuracy, 'graph-rag', 'p_at_5'),
            mrr: metricDelta(accuracy, legacyAccuracy, 'graph-rag', 'mrr'),
          },
        },
      },
      paper5Timing: timing
        ? {
            status: timing.status,
            captureClass: timing.capture_class,
            trials: timing.trials,
            stages: timing.stages,
          }
        : null,
      paper26: {
        status: steps
          .filter((step) => step.id.startsWith('paper-26-'))
          .every((step) => step.status === 'pass')
          ? 'pass'
          : 'fail',
        xenovaAblation: options.withXenova ? 'attempted' : 'skipped-by-default',
        outputs: steps
          .filter((step) => step.id.startsWith('paper-26-'))
          .map((step) => step.stdoutPath),
        holoGraphMeasurements: paper26HoloGraphMeasurements,
        nlCodeRecallAt10: paper26HoloEmbedRecall,
      },
    },
    claimBoundaries: [
      'The accuracy arms are admitted only after two identical sequential scans produce the same source-corpus SHA-256.',
      'Paper 5 accuracy uses 54 frozen held-out queries, balanced across dependency, impact, and reasoning, with executable source-anchor verification and multi-relevance judgments.',
      'Paper 5 labels are not independently assigned by multiple human annotators and have not been replicated on an external codebase; this receipt is not publication-ready.',
      'Paper 5 timing is a bounded synthetic GraphRAG workload unless captureClass is an explicitly verified hardware capture.',
      'Paper 26 HoloGraph event latency uses synthetic event corpora.',
      'Paper 26 HoloEmbed recall uses name-derived NL queries over a 50-symbol synthetic corpus.',
      'The changed-symbol refresh benchmark uses a deterministic synthetic Git corpus and does not claim production-monorepo throughput.',
      'The transport-resilience benchmark is a deterministic synthetic lifecycle workload and does not claim network throughput or end-to-end MCP latency.',
      'The visual-focus ablation is package-scoped real code, not a whole-monorepo retrieval claim. It freezes fixed duplicate-symbol targets before applying any visual selection; correct, stale, and wrong-but-resolved selections are separate arms over the same case set.',
      'Visual focus is collision-safe graph.holo selection intent and structured graph evidence, not literal image-pixel vision. Wrong resolved selections may steer retrieval and are reported as caller intent rather than hidden model accuracy.',
      options.withXenova
        ? 'The optional Xenova ablation was attempted and its subprocess result is recorded.'
        : 'The optional Xenova model-download ablation was not run; no Xenova comparison is claimed.',
      'A dirty-worktree flag is recorded because peer changes may coexist in this shared repository.',
    ],
    residualGaps: [
      'Commission independent multi-human relevance annotation without exposing system rankings to annotators.',
      'Replicate the frozen protocol on at least one external codebase and report inter-annotator agreement.',
      'Add separate non-visual graph and provenance ablations; the visual-focus arm isolates only explicit graph.holo selection intent.',
      'Run target-hardware timing captures separately on verified RTX 3060 and Jetson/Orin lanes.',
      'Reconcile the paper prose and strict claim map only after the corresponding measured receipt exists.',
    ],
  };
  const receiptPath = resolve(outDir, 'holoabsorb-rebenchmark.json');
  writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  console.log(`HoloAbsorb rebenchmark ${receipt.status.toUpperCase()} -> ${receiptPath}`);
  return receipt.status === 'pass' ? 0 : 1;
}

const thisFile = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === thisFile) {
  main().then(
    (code) => process.exit(code),
    (error) => {
      console.error(`[bench-holoabsorb] ${error instanceof Error ? error.stack : error}`);
      process.exit(1);
    }
  );
}
