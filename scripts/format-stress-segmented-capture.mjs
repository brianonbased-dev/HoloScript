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
import { createHash } from 'node:crypto';
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

function asRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function propListToObject(properties) {
  const out = {};
  for (const prop of Array.isArray(properties) ? properties : []) {
    const key = prop?.key;
    if (typeof key === 'string') out[key] = prop.value;
  }
  return out;
}

function traitList(traits) {
  return (Array.isArray(traits) ? traits : [])
    .map((trait) => (typeof trait?.name === 'string' ? trait.name : null))
    .filter(Boolean);
}

function unique(values) {
  return [...new Set(values)].sort();
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

function fallbackSceneSnapshot(stagePath) {
  const source = readFileSync(stagePath, 'utf8');
  const objectRe = /\bobject\s+"([^"]+)"(?:\s+using\s+"([^"]+)")?\s*\{([\s\S]*?)^\s*\}/gm;
  const objects = [];
  let match;
  while ((match = objectRe.exec(source))) {
    const body = match[3] || '';
    const property = (name) => {
      const propMatch = body.match(new RegExp(`${name}:\\s*([^\\n]+)`));
      return propMatch ? propMatch[1].trim().replace(/^"|"$/g, '') : undefined;
    };
    objects.push({
      id: match[1],
      type: 'object',
      template: match[2] || null,
      groupPath: [],
      traits: unique([...body.matchAll(/^\s*@([A-Za-z0-9_-]+)/gm)].map((item) => item[1])),
      properties: {
        geometry: property('geometry'),
        color: property('color'),
        position: property('position'),
        rotation: property('rotation'),
        scale: property('scale'),
      },
      transform: {
        position: property('position') ?? null,
        rotation: property('rotation') ?? null,
        scale: property('scale') ?? null,
      },
    });
  }
  return {
    schema: 'format-stress-headless-scene-snapshot-v1',
    source: 'regex-fallback',
    stage: rel(REPO_ROOT, stagePath),
    objectCount: objects.length,
    templateCount: (source.match(/\btemplate\s+"/g) || []).length,
    objects,
  };
}

function buildSceneSnapshotFromAst(ast, stagePath) {
  const composition = asRecord(ast);
  const templates = new Map();
  for (const template of Array.isArray(composition.templates) ? composition.templates : []) {
    if (typeof template?.name === 'string') templates.set(template.name, template);
  }

  const objects = [];
  const pushObject = (object, groupPath = [], parentId = null) => {
    if (!object || typeof object.name !== 'string') return;
    const template = typeof object.template === 'string' ? templates.get(object.template) : null;
    const templateProperties = propListToObject(template?.properties);
    const ownProperties = propListToObject(object.properties);
    const properties = { ...templateProperties, ...ownProperties };
    const traits = unique([...traitList(template?.traits), ...traitList(object.traits)]);
    const sceneObject = {
      id: object.name,
      type: String(object.declarationKind || object.type || 'object').toLowerCase(),
      template: object.template || null,
      parentId,
      groupPath,
      traits,
      properties,
      transform: {
        position: properties.position ?? null,
        rotation: properties.rotation ?? null,
        scale: properties.scale ?? null,
      },
      material: asRecord(properties.material),
      geometry: properties.geometry ?? null,
    };
    objects.push(sceneObject);
    for (const child of Array.isArray(object.children) ? object.children : []) {
      pushObject(child, groupPath, object.name);
    }
  };

  for (const object of Array.isArray(composition.objects) ? composition.objects : []) {
    pushObject(object);
  }
  const visitGroup = (group, groupPath = []) => {
    if (!group || typeof group.name !== 'string') return;
    const nextPath = [...groupPath, group.name];
    for (const object of Array.isArray(group.objects) ? group.objects : []) {
      pushObject(object, nextPath);
    }
    for (const childGroup of Array.isArray(group.groups) ? group.groups : []) {
      visitGroup(childGroup, nextPath);
    }
  };
  for (const group of Array.isArray(composition.spatialGroups) ? composition.spatialGroups : []) {
    visitGroup(group);
  }
  for (const world of Array.isArray(composition.worlds) ? composition.worlds : []) {
    for (const object of Array.isArray(world.children) ? world.children : []) {
      pushObject(object, [world.name || 'world']);
    }
  }

  return {
    schema: 'format-stress-headless-scene-snapshot-v1',
    source: 'HoloCompositionParser',
    stage: rel(REPO_ROOT, stagePath),
    objectCount: objects.length,
    templateCount: templates.size,
    objects,
  };
}

async function loadHeadlessSceneSnapshot(stagePath) {
  try {
    const { HoloCompositionParser } = await import('@holoscript/core');
    const parser = new HoloCompositionParser();
    const result = parser.parse(readFileSync(stagePath, 'utf8'));
    if (result?.success && result.ast) {
      return buildSceneSnapshotFromAst(result.ast, stagePath);
    }
    return {
      ...fallbackSceneSnapshot(stagePath),
      source: 'regex-fallback-after-parser-error',
      parserErrors: result?.errors || [],
    };
  } catch (error) {
    return {
      ...fallbackSceneSnapshot(stagePath),
      source: 'regex-fallback-after-import-error',
      parserError: error instanceof Error ? error.message : String(error),
    };
  }
}

function sceneRuntimeSummary(sceneSnapshot) {
  const objectCount = Number.isFinite(sceneSnapshot?.objectCount) ? sceneSnapshot.objectCount : 0;
  return {
    schema: sceneSnapshot?.schema || 'format-stress-headless-scene-snapshot-v1',
    source: sceneSnapshot?.source || 'unavailable',
    stage: sceneSnapshot?.stage || null,
    objectCount,
    templateCount: Number.isFinite(sceneSnapshot?.templateCount)
      ? sceneSnapshot.templateCount
      : null,
    status: objectCount > 0 ? 'instantiated' : 'missing',
  };
}

function sceneObjectAnchors(sceneSnapshot, limit = 8) {
  return (Array.isArray(sceneSnapshot?.objects) ? sceneSnapshot.objects : [])
    .slice(0, limit)
    .map((object) => ({
      id: object.id,
      type: object.type,
      template: object.template ?? null,
      transform: object.transform ?? {},
      physics: object.physics ?? {},
    }));
}

function readCommandStdoutJson(command) {
  if (!command || command.skipped || !command.stdout) return null;
  const stdoutPath = resolveRepoPath(command.stdout);
  if (!existsSync(stdoutPath)) return null;
  const raw = readFileSync(stdoutPath, 'utf8').trim();
  if (!raw) return null;
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
}

function sceneSnapshotFromHeadlessReceipt(receipt, stagePath, fallbackSnapshot) {
  const scene = asRecord(receipt?.scene);
  const objects = Array.isArray(scene.objects) ? scene.objects : [];
  if (objects.length === 0) return fallbackSnapshot;
  const templates = unique(objects.map((object) => object?.template).filter(Boolean));
  return {
    schema: 'format-stress-headless-scene-snapshot-v1',
    source: 'hs-headless-json',
    runtimeSchema: scene.schema || null,
    stage: rel(REPO_ROOT, stagePath),
    objectCount: Number.isFinite(scene.objectCount) ? scene.objectCount : objects.length,
    templateCount: templates.length,
    runtimeStats: receipt.stats || {},
    objects,
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

function sha256File(filePath) {
  if (!existsSync(filePath)) return null;
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

function buildStillEvidence(receipts, outputDir) {
  return receipts.map((receipt) => {
    const absolutePath = join(outputDir, receipt.still);
    const exists = existsSync(absolutePath);
    return {
      segment: receipt.segment,
      label: receipt.label,
      still: receipt.still,
      exists,
      bytes: exists ? statSync(absolutePath).size : 0,
      sha256: sha256File(absolutePath),
      mode: receipt.stillMode,
      oracleStatus: receipt.oracle.status,
    };
  });
}

function isReplayLikeStillMode(mode) {
  return !['placeholder', 'static-scene-copy'].includes(mode);
}

export function summarizeVisualEvidence(stillEvidence) {
  const existing = stillEvidence.filter((entry) => entry.exists);
  const hashes = existing.map((entry) => entry.sha256).filter(Boolean);
  const uniqueHashCount = new Set(hashes).size;
  const hashCounts = new Map();
  for (const hash of hashes) {
    hashCounts.set(hash, (hashCounts.get(hash) || 0) + 1);
  }

  const replayCandidates = existing.filter((entry) => isReplayLikeStillMode(entry.mode));
  const replayDistinct = replayCandidates.filter(
    (entry) => entry.sha256 && hashCounts.get(entry.sha256) === 1
  );
  const staticCopySegments = existing.filter((entry) => entry.mode === 'static-scene-copy').length;
  const placeholderSegments = existing.filter((entry) => entry.mode === 'placeholder').length;
  const falseGreenRisk =
    existing.length > 1 && uniqueHashCount === 1
      ? 'all-stills-byte-identical'
      : existing.length > uniqueHashCount
        ? 'duplicate-still-hashes'
        : 'none-detected';

  return {
    stillFilesPresent: existing.length,
    uniqueStillHashes: uniqueHashCount,
    replayCandidateSegments: replayCandidates.length,
    replayDistinctSegments: replayDistinct.length,
    capturedReplaySegments: replayDistinct.length,
    replayDistinctSegmentIds: replayDistinct.map((entry) => entry.segment),
    staticCopySegments,
    placeholderSegments,
    staticCopyCoverageBlocked: staticCopySegments > 0,
    dynamicReplayBlockedSegments: stillEvidence.filter(
      (entry) => entry.oracleStatus === 'blocked-dynamic-replay'
    ).length,
    falseGreenRisk,
    visualCoverageStatus:
      replayDistinct.length > 0 && falseGreenRisk === 'none-detected'
        ? 'replay-distinct'
        : staticCopySegments > 0
          ? 'blocked-static-copy'
          : placeholderSegments > 0
            ? 'blocked-placeholder'
            : falseGreenRisk === 'none-detected'
              ? 'no-stills'
              : 'blocked-duplicate-stills',
  };
}

function ownerForSegment(segmentId) {
  if (segmentId === '00_scene_loaded') return 'CLI screenshot and HoloLand visual debugger';
  if (segmentId.includes('grab') || segmentId.includes('release') || segmentId.includes('impact')) {
    return 'engine headless event playback and physics runtime';
  }
  if (segmentId.includes('arc')) return 'physics trajectory solver and deterministic replay';
  return 'HoloLand segmented camera choreography';
}

function posePhysicsFor(segment, index, total, sceneSnapshot) {
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
    sceneObjectCount: Number.isFinite(sceneSnapshot?.objectCount) ? sceneSnapshot.objectCount : 0,
    sceneSnapshotSource: sceneSnapshot?.source || 'unavailable',
    runtimeScene: sceneRuntimeSummary(sceneSnapshot),
    sceneObjectAnchors: sceneObjectAnchors(sceneSnapshot),
    bodies: {
      avatar: {
        position: [Number(avatarX.toFixed(3)), 1.1, 0],
        facing: 'rock-target-line',
      },
      rightHand: {
        position: [
          Number((avatarX + 0.45).toFixed(3)),
          Number((1.2 + progress * 0.5).toFixed(3)),
          0.18,
        ],
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
      'Headless runtime scene objects are real receipt anchors; segment motion is still placeholder.',
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
  sceneSnapshot,
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
    runtimeScene: sceneRuntimeSummary(sceneSnapshot),
    oracle: {
      status,
      owningSurface: owner,
      findings: dynamicSegment
        ? [
            'Static still exists, but segment-specific camera/pose playback is not implemented yet.',
            `Next owner: ${owner}.`,
          ]
        : [
            'Scene-loaded still and command evidence exist; visual realism remains a separate quality ratchet.',
          ],
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
  const screenshotPath = join(
    stillsDir,
    manifest.segments[0]?.expectedStill || '00_scene_loaded.png'
  );

  const commandPlans = [
    ['parse-holo', ['parse', stagePath, '--json']],
    ['parse-hsplus', ['parse', behaviorPath, '--json']],
    ['parse-hs', ['parse', pipelinePath, '--json']],
    [
      'compile-holo-threejs',
      ['compile', stagePath, '--target', 'threejs', '-o', join(compiledDir, 'holo-threejs')],
    ],
    [
      'compile-hsplus-threejs',
      ['compile', behaviorPath, '--target', 'threejs', '-o', join(compiledDir, 'hsplus-threejs')],
    ],
    [
      'compile-hs-node',
      ['compile', pipelinePath, '--target', 'node', '-o', join(compiledDir, 'hs-node.mjs')],
    ],
  ];

  if (!options.skipHeadless) {
    commandPlans.push(['headless-holo', ['headless', stagePath, '--duration', '250', '--json']]);
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

  const fallbackSceneSnapshot = await loadHeadlessSceneSnapshot(stagePath);
  const headlessReceipt = readCommandStdoutJson(
    results.find((command) => command.id === 'headless-holo')
  );
  const sceneSnapshot = sceneSnapshotFromHeadlessReceipt(
    headlessReceipt,
    stagePath,
    fallbackSceneSnapshot
  );

  return { results, screenshotPath, sceneSnapshot };
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
  const {
    results: commandResults,
    screenshotPath,
    sceneSnapshot,
  } = await runEvidenceCommands({
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
      runtimeScene: sceneRuntimeSummary(sceneSnapshot),
      events: [
        { type: 'segment_requested', segment: segment.id, atMs: index * 250 },
        {
          type: 'runtime_scene_snapshot_loaded',
          segment: segment.id,
          atMs: index * 250,
          objectCount: sceneSnapshot.objectCount,
          source: sceneSnapshot.source,
        },
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

    writeJson(posePhysicsPath, posePhysicsFor(segment, index, stills.length, sceneSnapshot));

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
      sceneSnapshot,
    });
    receipt.timing.runnerMs = Date.now() - startedAt;

    const seed = buildTaskSeed(segment, receipt);
    writeJson(taskSeedPath, seed);
    receipts.push(receipt);
    seeds.push(seed);
  }

  const stillEvidence = buildStillEvidence(receipts, outputDir);
  const visualEvidence = summarizeVisualEvidence(stillEvidence);

  const coverage = {
    segmentsRequested: manifest.segments.length,
    segmentsWithStill: receipts.filter((receipt) => existsSync(join(outputDir, receipt.still)))
      .length,
    qualityAdjustedSegmentsWithStill: visualEvidence.capturedReplaySegments,
    uniqueStillHashes: visualEvidence.uniqueStillHashes,
    staticCopySegments: visualEvidence.staticCopySegments,
    placeholderStillSegments: visualEvidence.placeholderSegments,
    dynamicReplayBlockedSegments: visualEvidence.dynamicReplayBlockedSegments,
    falseGreenRisk: visualEvidence.falseGreenRisk,
    segmentsWithRuntimeEventLog: receipts.filter((receipt) =>
      existsSync(join(outputDir, receipt.eventLog))
    ).length,
    segmentsWithPosePhysicsJson: receipts.filter((receipt) =>
      existsSync(join(outputDir, receipt.posePhysicsJson))
    ).length,
    segmentsWithTiming: receipts.filter((receipt) => receipt.timing).length,
    headlessRuntimeSceneObjects: sceneSnapshot.objectCount,
    headlessRuntimeTemplates: sceneSnapshot.templateCount,
    segmentsWithHeadlessSceneObjects: sceneSnapshot.objectCount > 0 ? receipts.length : 0,
  };

  const receiptPayload = {
    schema: 'format-stress-segmented-capture-v1',
    scenario: manifest.flagship,
    generatedAt: new Date().toISOString(),
    manifest: rel(REPO_ROOT, manifestPath),
    outputDir: rel(REPO_ROOT, outputDir),
    command: `node scripts/format-stress-segmented-capture.mjs ${rel(REPO_ROOT, manifestPath)}`,
    commands: commandResults,
    headlessScene: sceneSnapshot,
    segments: receipts,
    coverage,
  };

  writeJson(join(outputDir, 'segment-receipts.json'), receiptPayload);
  writeJson(join(dirname(outputDir), 'segment-receipts.json'), receiptPayload);
  writeJson(join(outputDir, 'still-evidence.json'), stillEvidence);
  writeJson(join(outputDir, 'visual-uniqueness-audit.json'), visualEvidence);
  writeJson(join(outputDir, 'task-seeds.json'), seeds);
  writeJson(join(outputDir, 'scorecard.json'), {
    schema: 'format-realism-gauntlet-scorecard-v1',
    scenario: manifest.flagship,
    generatedAt: receiptPayload.generatedAt,
    qualityMetrics: manifest.qualityMetrics || [],
    coverage,
    visualEvidence,
    commandFailures: commandResults.filter((command) => !command.success),
    highestGapSeverity:
      visualEvidence.dynamicReplayBlockedSegments > 0 ||
      visualEvidence.falseGreenRisk !== 'none-detected'
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
      stillEvidence: rel(REPO_ROOT, join(outputDir, 'still-evidence.json')),
      visualUniquenessAudit: rel(REPO_ROOT, join(outputDir, 'visual-uniqueness-audit.json')),
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
