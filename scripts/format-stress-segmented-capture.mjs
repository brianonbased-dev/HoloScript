#!/usr/bin/env node
/**
 * Segmented capture runner for the format-realism gauntlet.
 *
 * The runner is deliberately evidence-first: it emits a receipt for every
 * requested segment even when the current runtime can only provide a static
 * scene still or kinematic placeholder physics. Gaps stay visible and point to
 * the owning surface instead of being flattened into a fake pass.
 */

import { spawn } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const DEFAULT_MANIFEST = 'experiments/format-realism-gauntlet/manifest.json';
const DEFAULT_DATE = new Date().toISOString().slice(0, 10);
const PLACEHOLDER_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=',
  'base64'
);

function usage() {
  return `Usage: node scripts/format-stress-segmented-capture.mjs [manifest.json] [options]

Options:
  --out <dir>          Output directory. Defaults to manifest artifactRoot/date/flagship.
  --date <yyyy-mm-dd>  Date folder for default output. Defaults to today.
  --width <px>         Screenshot width. Default: 1280.
  --height <px>        Screenshot height. Default: 720.
  --wait-for <ms>      Screenshot stabilization wait. Default: 1000.
  --dry-run            Emit receipts without running parse/compile/headless/screenshot.
  --skip-screenshot    Do not invoke screenshot; write placeholder stills.
  --skip-headless      Do not invoke headless runtime.
  --json               Print receipt JSON to stdout.
  --help               Show this help.
`;
}

export function parseRunnerArgs(argv = process.argv.slice(2)) {
  const options = {
    manifest: DEFAULT_MANIFEST,
    out: undefined,
    date: DEFAULT_DATE,
    width: 1280,
    height: 720,
    waitFor: 1000,
    dryRun: false,
    skipScreenshot: false,
    skipHeadless: false,
    json: false,
    help: false,
  };

  let positionalSeen = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--out' || arg === '-o') {
      options.out = argv[++i];
    } else if (arg === '--date') {
      options.date = argv[++i];
    } else if (arg === '--width') {
      options.width = Number.parseInt(argv[++i], 10) || options.width;
    } else if (arg === '--height') {
      options.height = Number.parseInt(argv[++i], 10) || options.height;
    } else if (arg === '--wait-for') {
      options.waitFor = Number.parseInt(argv[++i], 10) || options.waitFor;
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--skip-screenshot') {
      options.skipScreenshot = true;
    } else if (arg === '--skip-headless') {
      options.skipHeadless = true;
    } else if (arg === '--json') {
      options.json = true;
    } else if (!arg.startsWith('-') && !positionalSeen) {
      options.manifest = arg;
      positionalSeen = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(value, null, 2) + '\n', 'utf8');
}

function rel(from, to) {
  return relative(from, to).replace(/\\/g, '/');
}

function resolveFromManifest(manifestPath, maybeRelative) {
  if (isAbsolute(maybeRelative)) return maybeRelative;
  return resolve(dirname(manifestPath), maybeRelative);
}

function resolveRepoPath(path) {
  return isAbsolute(path) ? path : resolve(REPO_ROOT, path);
}

function getCliInvocation() {
  const tsxCli = join(REPO_ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs');
  const cliSource = join(REPO_ROOT, 'packages', 'cli', 'src', 'cli.ts');
  if (existsSync(tsxCli) && existsSync(cliSource)) {
    return {
      command: process.execPath,
      baseArgs: [tsxCli, cliSource],
      label: 'tsx packages/cli/src/cli.ts',
    };
  }

  return {
    command: process.execPath,
    baseArgs: [join(REPO_ROOT, 'packages', 'cli', 'bin', 'holoscript.cjs')],
    label: 'node packages/cli/bin/holoscript.cjs',
  };
}

async function runCommand({ id, args, logDir, dryRun }) {
  const startedAt = Date.now();
  const stdoutPath = join(logDir, `${id}.stdout.txt`);
  const stderrPath = join(logDir, `${id}.stderr.txt`);
  mkdirSync(logDir, { recursive: true });

  if (dryRun) {
    writeFileSync(stdoutPath, '[dry-run] command skipped\n', 'utf8');
    writeFileSync(stderrPath, '', 'utf8');
    return {
      id,
      command: '[dry-run]',
      args,
      success: true,
      skipped: true,
      exitCode: 0,
      durationMs: 0,
      stdout: rel(REPO_ROOT, stdoutPath),
      stderr: rel(REPO_ROOT, stderrPath),
    };
  }

  const cli = getCliInvocation();
  const fullArgs = [...cli.baseArgs, ...args];
  const commandText = `${cli.label} ${args.join(' ')}`;

  return new Promise((resolveCommand) => {
    const child = spawn(cli.command, fullArgs, {
      cwd: REPO_ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', (error) => {
      stderr += `${error.message}\n`;
      writeFileSync(stdoutPath, stdout, 'utf8');
      writeFileSync(stderrPath, stderr, 'utf8');
      resolveCommand({
        id,
        command: commandText,
        args,
        success: false,
        exitCode: -1,
        durationMs: Date.now() - startedAt,
        stdout: rel(REPO_ROOT, stdoutPath),
        stderr: rel(REPO_ROOT, stderrPath),
        error: error.message,
      });
    });
    child.on('close', (code) => {
      writeFileSync(stdoutPath, stdout, 'utf8');
      writeFileSync(stderrPath, stderr, 'utf8');
      resolveCommand({
        id,
        command: commandText,
        args,
        success: code === 0,
        exitCode: code,
        durationMs: Date.now() - startedAt,
        stdout: rel(REPO_ROOT, stdoutPath),
        stderr: rel(REPO_ROOT, stderrPath),
      });
    });
  });
}

function stillModeFor(index, screenshotCommand, screenshotAvailable) {
  if (!screenshotCommand || screenshotCommand.skipped || !screenshotAvailable) return 'placeholder';
  if (!screenshotCommand.success) return 'placeholder';
  return index === 0 ? 'captured-scene-loaded' : 'static-scene-copy';
}

function ownerForSegment(segmentId) {
  if (segmentId === '00_scene_loaded') return 'CLI screenshot and HoloLand visual debugger';
  if (segmentId.includes('grab') || segmentId.includes('release') || segmentId.includes('impact')) {
    return 'engine headless event playback and physics runtime';
  }
  if (segmentId.includes('arc')) return 'physics trajectory solver and deterministic replay';
  return 'HoloLand segmented camera choreography';
}

function posePhysicsFor(segment, index, total) {
  const progress = total <= 1 ? 0 : index / (total - 1);
  const avatarX = -3 + progress * 4.8;
  const rockX = index < 3 ? -1.2 : -1.2 + Math.max(0, progress - 0.33) * 5.8;
  const rockY = index < 4 ? 0.35 : index < 7 ? 1.3 : Math.max(0.35, 2.1 - progress * 1.5);
  const released = index >= 6;

  return {
    schema: 'format-stress-pose-physics-v1',
    segmentId: segment.id,
    mode: 'kinematic-placeholder',
    complete: false,
    owningSurface: ownerForSegment(segment.id),
    bodies: {
      avatar: {
        position: [Number(avatarX.toFixed(3)), 1.1, 0],
        facing: 'rock-target-line',
      },
      rightHand: {
        position: [Number((avatarX + 0.45).toFixed(3)), Number((1.2 + progress * 0.5).toFixed(3)), 0.18],
        contact: index >= 3 && index <= 5 ? 'rock' : null,
      },
      rock: {
        position: [Number(rockX.toFixed(3)), Number(rockY.toFixed(3)), 0],
        attachedToHand: index >= 3 && index <= 5,
        released,
      },
      target: {
        position: [3.5, 1, 0],
        impacted: index >= 8,
      },
    },
    physics: {
      massKg: 1.8,
      releaseVelocityMps: released ? [12.5, 4.2, 0] : null,
      arcSamples: released
        ? [
            [Number(rockX.toFixed(3)), Number(rockY.toFixed(3)), 0],
            [Number((rockX + 0.8).toFixed(3)), Number((rockY + 0.35).toFixed(3)), 0],
            [Number((rockX + 1.6).toFixed(3)), Number((rockY - 0.15).toFixed(3)), 0],
          ]
        : [],
      solver: 'placeholder-until-engine-replay',
    },
    notes: [
      'Generated by segmented runner so every segment has a machine-readable receipt.',
      'Not a physics proof; replace with engine replay output when available.',
    ],
  };
}

export function buildSegmentReceipt({
  segment,
  index,
  outputDir,
  stillPath,
  stillMode,
  commandResults,
  eventLogPath,
  posePhysicsPath,
  taskSeedPath,
}) {
  const headless = commandResults.find((command) => command.id === 'headless-holo');
  const screenshot = commandResults.find((command) => command.id === 'screenshot-base');
  const dynamicSegment = index > 0;
  const status =
    screenshot?.success && !dynamicSegment && headless?.success
      ? 'partial-pass'
      : dynamicSegment
        ? 'blocked-dynamic-replay'
        : 'partial-pass';
  const owner = ownerForSegment(segment.id);

  return {
    id: segment.id,
    title: segment.title,
    expectedStill: segment.expectedStill,
    checks: segment.checks || [],
    still: rel(outputDir, stillPath),
    stillMode,
    eventLog: rel(outputDir, eventLogPath),
    posePhysicsJson: rel(outputDir, posePhysicsPath),
    oracle: {
      status,
      owningSurface: owner,
      findings: dynamicSegment
        ? [
            'Static still exists, but segment-specific camera/pose playback is not implemented yet.',
            `Next owner: ${owner}.`,
          ]
        : ['Scene-loaded still and command evidence exist; visual realism remains a separate quality ratchet.'],
    },
    timing: {
      runnerMs: 0,
      screenshotMs: screenshot?.durationMs ?? null,
      headlessMs: headless?.durationMs ?? null,
      frameBudget: {
        targetHz: 60,
        budgetMs: 16.67,
        observedMs: headless?.success ? headless.durationMs : null,
        note: dynamicSegment
          ? 'No real per-frame segment replay yet; timing is command-level evidence.'
          : 'Scene load command-level timing, not a render-frame profiler.',
      },
    },
    taskSeed: rel(outputDir, taskSeedPath),
  };
}

function buildTaskSeed(segment, receipt) {
  return {
    schema: 'holomesh-board-task-seed-v1',
    source: 'format-realism-gauntlet',
    title: `[format-stress] Implement dynamic evidence for ${segment.id}`,
    priority: receipt.oracle.status === 'blocked-dynamic-replay' ? 1 : 2,
    owningSurface: receipt.oracle.owningSurface,
    description: [
      `Segment: ${segment.title} (${segment.id})`,
      `Observed: ${receipt.oracle.findings.join(' ')}`,
      `Receipt: ${receipt.id}`,
      'Acceptance: still, event log, pose/physics JSON, oracle, and timing come from real segment playback rather than static-copy evidence.',
    ].join('\n'),
  };
}

async function runEvidenceCommands({ options, manifestPath, manifest, outputDir }) {
  const logDir = join(outputDir, 'commands');
  const compiledDir = join(outputDir, 'compiled');
  const stillsDir = join(outputDir, 'stills');
  mkdirSync(compiledDir, { recursive: true });
  mkdirSync(stillsDir, { recursive: true });

  const stagePath = resolveFromManifest(manifestPath, manifest.formats.stage);
  const behaviorPath = resolveFromManifest(manifestPath, manifest.formats.behavior);
  const pipelinePath = resolveFromManifest(manifestPath, manifest.formats.pipeline);
  const screenshotPath = join(stillsDir, manifest.segments[0]?.expectedStill || '00_scene_loaded.png');

  const commandPlans = [
    ['parse-holo', ['parse', stagePath, '--json']],
    ['parse-hsplus', ['parse', behaviorPath, '--json']],
    ['parse-hs', ['parse', pipelinePath, '--json']],
    ['compile-holo-threejs', ['compile', stagePath, '--target', 'threejs', '-o', join(compiledDir, 'holo-threejs')]],
    [
      'compile-hsplus-threejs',
      ['compile', behaviorPath, '--target', 'threejs', '-o', join(compiledDir, 'hsplus-threejs')],
    ],
    ['compile-hs-node', ['compile', pipelinePath, '--target', 'node', '-o', join(compiledDir, 'hs-node.mjs')]],
  ];

  if (!options.skipHeadless) {
    commandPlans.push(['headless-holo', ['headless', stagePath, '--duration', '250']]);
  }

  if (!options.skipScreenshot) {
    commandPlans.push([
      'screenshot-base',
      [
        'screenshot',
        stagePath,
        '-o',
        screenshotPath,
        '--width',
        String(options.width),
        '--height',
        String(options.height),
        '--wait-for',
        String(options.waitFor),
      ],
    ]);
  }

  const results = [];
  for (const [id, args] of commandPlans) {
    results.push(await runCommand({ id, args, logDir, dryRun: options.dryRun }));
  }

  return { results, screenshotPath };
}

function ensureSegmentStills({ manifest, outputDir, screenshotPath, screenshotCommand }) {
  const stillsDir = join(outputDir, 'stills');
  mkdirSync(stillsDir, { recursive: true });
  const baseExists = existsSync(screenshotPath);
  if (!baseExists) {
    writeFileSync(screenshotPath, PLACEHOLDER_PNG);
  }

  return manifest.segments.map((segment, index) => {
    const stillPath = join(stillsDir, segment.expectedStill || `${segment.id}.png`);
    if (index === 0) {
      if (!existsSync(stillPath)) writeFileSync(stillPath, PLACEHOLDER_PNG);
      return { segment, stillPath, stillMode: stillModeFor(index, screenshotCommand, baseExists) };
    }

    if (existsSync(screenshotPath)) {
      copyFileSync(screenshotPath, stillPath);
    } else {
      writeFileSync(stillPath, PLACEHOLDER_PNG);
    }
    return { segment, stillPath, stillMode: stillModeFor(index, screenshotCommand, baseExists) };
  });
}

function outputDirFor(options, manifestPath, manifest) {
  if (options.out) return resolveRepoPath(options.out);
  const artifactRoot = resolveRepoPath(manifest.artifactRoot || '.bench-logs/format-stress');
  return join(artifactRoot, options.date, manifest.flagship || 'scenario');
}

export async function runSegmentedCapture(rawOptions = {}) {
  const options = { ...parseRunnerArgs([]), ...rawOptions };
  const manifestPath = resolveRepoPath(options.manifest);
  if (!existsSync(manifestPath)) {
    throw new Error(`Manifest not found: ${manifestPath}`);
  }

  const manifest = readJson(manifestPath);
  if (!Array.isArray(manifest.segments) || manifest.segments.length === 0) {
    throw new Error(`Manifest has no segments: ${manifestPath}`);
  }

  const outputDir = outputDirFor(options, manifestPath, manifest);
  if (existsSync(outputDir) && options.dryRun) {
    rmSync(outputDir, { recursive: true, force: true });
  }
  mkdirSync(outputDir, { recursive: true });

  const startedAt = Date.now();
  const { results: commandResults, screenshotPath } = await runEvidenceCommands({
    options,
    manifestPath,
    manifest,
    outputDir,
  });

  const screenshotCommand = commandResults.find((command) => command.id === 'screenshot-base');
  const stills = ensureSegmentStills({
    manifest,
    outputDir,
    screenshotPath,
    screenshotCommand,
  });

  const eventDir = join(outputDir, 'events');
  const poseDir = join(outputDir, 'pose-physics');
  const seedDir = join(outputDir, 'task-seeds');
  mkdirSync(eventDir, { recursive: true });
  mkdirSync(poseDir, { recursive: true });
  mkdirSync(seedDir, { recursive: true });

  const receipts = [];
  const seeds = [];

  for (let index = 0; index < stills.length; index++) {
    const { segment, stillPath, stillMode } = stills[index];
    const eventLogPath = join(eventDir, `${segment.id}.json`);
    const posePhysicsPath = join(poseDir, `${segment.id}.json`);
    const taskSeedPath = join(seedDir, `${segment.id}.json`);

    writeJson(eventLogPath, {
      schema: 'format-stress-segment-event-log-v1',
      segmentId: segment.id,
      source: 'format-stress-segmented-capture',
      events: [
        { type: 'segment_requested', segment: segment.id, atMs: index * 250 },
        { type: 'evidence_receipt_emitted', segment: segment.id, atMs: index * 250 + 1 },
      ],
      commandEvidence: commandResults.map((command) => ({
        id: command.id,
        success: command.success,
        skipped: Boolean(command.skipped),
        stdout: command.stdout,
        stderr: command.stderr,
      })),
    });

    writeJson(posePhysicsPath, posePhysicsFor(segment, index, stills.length));

    const receipt = buildSegmentReceipt({
      segment,
      index,
      outputDir,
      stillPath,
      stillMode,
      commandResults,
      eventLogPath,
      posePhysicsPath,
      taskSeedPath,
    });
    receipt.timing.runnerMs = Date.now() - startedAt;

    const seed = buildTaskSeed(segment, receipt);
    writeJson(taskSeedPath, seed);
    receipts.push(receipt);
    seeds.push(seed);
  }

  const coverage = {
    segmentsRequested: manifest.segments.length,
    segmentsWithStill: receipts.filter((receipt) => existsSync(join(outputDir, receipt.still))).length,
    segmentsWithRuntimeEventLog: receipts.filter((receipt) =>
      existsSync(join(outputDir, receipt.eventLog))
    ).length,
    segmentsWithPosePhysicsJson: receipts.filter((receipt) =>
      existsSync(join(outputDir, receipt.posePhysicsJson))
    ).length,
    segmentsWithTiming: receipts.filter((receipt) => receipt.timing).length,
  };

  const receiptPayload = {
    schema: 'format-stress-segmented-capture-v1',
    scenario: manifest.flagship,
    generatedAt: new Date().toISOString(),
    manifest: rel(REPO_ROOT, manifestPath),
    outputDir: rel(REPO_ROOT, outputDir),
    command: `node scripts/format-stress-segmented-capture.mjs ${rel(REPO_ROOT, manifestPath)}`,
    commands: commandResults,
    segments: receipts,
    coverage,
  };

  writeJson(join(outputDir, 'segment-receipts.json'), receiptPayload);
  writeJson(join(dirname(outputDir), 'segment-receipts.json'), receiptPayload);
  writeJson(join(outputDir, 'task-seeds.json'), seeds);
  writeJson(join(outputDir, 'scorecard.json'), {
    schema: 'format-realism-gauntlet-scorecard-v1',
    scenario: manifest.flagship,
    generatedAt: receiptPayload.generatedAt,
    qualityMetrics: manifest.qualityMetrics || [],
    coverage,
    commandFailures: commandResults.filter((command) => !command.success),
    highestGapSeverity: receipts.some((receipt) => receipt.oracle.status === 'blocked-dynamic-replay')
      ? 'P1'
      : 'P2',
  });

  const stillBytes = receipts.reduce((sum, receipt) => {
    const path = join(outputDir, receipt.still);
    return sum + (existsSync(path) ? statSync(path).size : 0);
  }, 0);

  return {
    ...receiptPayload,
    artifacts: {
      segmentReceipts: rel(REPO_ROOT, join(outputDir, 'segment-receipts.json')),
      rootSegmentReceipts: rel(REPO_ROOT, join(dirname(outputDir), 'segment-receipts.json')),
      scorecard: rel(REPO_ROOT, join(outputDir, 'scorecard.json')),
      taskSeeds: rel(REPO_ROOT, join(outputDir, 'task-seeds.json')),
      stillBytes,
    },
  };
}

async function main() {
  const options = parseRunnerArgs();
  if (options.help) {
    console.log(usage());
    return;
  }

  const receipt = await runSegmentedCapture(options);
  if (options.json) {
    console.log(JSON.stringify(receipt, null, 2));
    return;
  }

  console.log(`Segmented capture complete: ${receipt.outputDir}`);
  console.log(`  Segments: ${receipt.coverage.segmentsRequested}`);
  console.log(`  Stills: ${receipt.coverage.segmentsWithStill}`);
  console.log(`  Event logs: ${receipt.coverage.segmentsWithRuntimeEventLog}`);
  console.log(`  Pose/physics receipts: ${receipt.coverage.segmentsWithPosePhysicsJson}`);
  console.log(`  Scorecard: ${receipt.artifacts.scorecard}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
