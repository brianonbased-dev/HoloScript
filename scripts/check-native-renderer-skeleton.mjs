#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const SCHEMA_VERSION = 'hololand.native-renderer-skeleton-receipt.v0.1.0';
const CONTRACT_SOURCE = 'packages/platform/renderer/src/HololandNativeRenderer.hsplus';
const FIXTURE_SOURCE = 'apps/holoshell/source/holoshell-shell-render.holo';
const DEFAULT_OUTPUT = path.join('.tmp', 'native-renderer-skeleton', 'receipt.json');

function parseArgs(argv = process.argv.slice(2)) {
  const args = { output: DEFAULT_OUTPUT, json: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--output') args.output = argv[++index];
    else if (arg === '--json') args.json = true;
    else if (arg === '--help' || arg === '-h') {
      console.log(`Native renderer skeleton check

Usage:
  node scripts/check-native-renderer-skeleton.mjs [--output <path>] [--json]
`);
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return args;
}

function repoPath(relativePath) {
  return path.resolve(process.cwd(), relativePath);
}

function read(relativePath) {
  return readFileSync(repoPath(relativePath), 'utf8');
}

function sha256(value) {
  return createHash('sha256').update(String(value), 'utf8').digest('hex');
}

function findHoloScriptRoot() {
  const candidates = [
    process.env.HOLOSCRIPT_ROOT,
    path.resolve(process.cwd(), '..', 'HoloScript'),
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (existsSync(path.join(candidate, 'package.json'))) return candidate;
  }
  return null;
}

function findHoloScriptCli(root) {
  if (!root) return null;
  const candidates = [
    process.env.HOLOSCRIPT_CLI,
    path.join(root, 'packages', 'cli', 'dist', 'cli.js'),
    path.join(root, 'packages', 'cli', 'bin', 'holoscript.cjs'),
  ].filter(Boolean);
  return candidates.find((candidate) => existsSync(candidate)) || null;
}

function parseWithHoloScript(relativePath) {
  const root = findHoloScriptRoot();
  const cli = findHoloScriptCli(root);
  if (!root || !cli) {
    return {
      source: relativePath,
      passed: false,
      kind: 'missing_local_holoscript_cli',
      error: 'Set HOLOSCRIPT_ROOT or build ../HoloScript packages/cli before running this check.',
    };
  }

  const result = spawnSync(process.execPath, [cli, 'parse', repoPath(relativePath)], {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
    timeout: 120000,
  });
  return {
    source: relativePath,
    passed: result.status === 0,
    kind: 'local_holoscript_cli',
    status: result.status,
    stdoutTail: String(result.stdout || '').trim().split(/\r?\n/).slice(-4),
    stderrTail: String(result.stderr || result.error?.message || '').trim().split(/\r?\n/).filter(Boolean).slice(-4),
  };
}

function uniqueMatches(text, pattern, group = 1) {
  return [...new Set([...text.matchAll(pattern)].map((match) => match[group]).filter(Boolean))];
}

function countMatches(text, pattern) {
  return [...text.matchAll(pattern)].length;
}

function buildSemanticIr(contractText, fixtureText) {
  const objectNames = uniqueMatches(fixtureText, /object\s+"([^"]+)"/g);
  const lightNames = uniqueMatches(fixtureText, /light\s+"([^"]+)"/g);
  const cameraNames = uniqueMatches(fixtureText, /camera\s+"([^"]+)"/g);
  const geometries = uniqueMatches(fixtureText, /geometry:\s*"([^"]+)"/g);
  const materials = uniqueMatches(fixtureText, /material:\s*"([^"]+)"/g);
  const animations = uniqueMatches(fixtureText, /animate:\s*"([^"]+)"/g);
  const events = [
    ...uniqueMatches(fixtureText, /keyboardShortcut:\s*"([^"]+)"/g),
    ...uniqueMatches(fixtureText, /accessibilityRole:\s*"([^"]+)"/g),
    ...uniqueMatches(fixtureText, /controlPhase:\s*"([^"]+)"/g),
    ...uniqueMatches(fixtureText, /commandSource:\s*"([^"]+)"/g),
  ];
  const transformCount =
    countMatches(fixtureText, /position:\s*\{/g) +
    countMatches(fixtureText, /rotation:\s*\{/g) +
    countMatches(fixtureText, /scale:\s*\{/g);

  return {
    sceneGraph: {
      composition: uniqueMatches(fixtureText, /composition\s+"([^"]+)"/g)[0] || '',
      objectCount: objectNames.length,
      sourceOwnedByHoloScript: true,
    },
    camera: { names: cameraNames, sourceOwnedByHoloScript: cameraNames.length > 0 },
    lights: lightNames.map((name) => ({ name, sourceOwnedByHoloScript: true })),
    geometry: geometries.map((geometry) => ({ geometry, sourceOwnedByHoloScript: true })),
    material: materials.map((material) => ({ material, sourceOwnedByHoloScript: true })),
    transform: { transformCount, sourceOwnedByHoloScript: transformCount > 0 },
    events: events.map((event) => ({ event, sourceOwnedByHoloScript: true })),
    animation: animations.map((animation) => ({ animation, sourceOwnedByHoloScript: true })),
    lifecycle: {
      initialize: contractText.includes('initialize: "create_scene_graph"'),
      compile: contractText.includes('compile: "normalize_semantic_ir"'),
      validate: contractText.includes('validate: "assert_required_renderer_semantics"'),
      render: contractText.includes('render: "adapter_projection_after_receipt"'),
      dispose: contractText.includes('dispose: "release_renderer_resources"'),
      receiptRequired: contractText.includes('receiptRequiredBeforeProjection: true'),
    },
  };
}

function assertReceipt(receipt) {
  const failures = [];
  const required = receipt.assertions || {};
  for (const [name, passed] of Object.entries(required)) {
    if (!passed) failures.push(`missing renderer semantic: ${name}`);
  }
  for (const parser of receipt.parsers) {
    if (!parser.passed) failures.push(`parser failed for ${parser.source}: ${parser.error || parser.stderrTail?.join(' ') || parser.status}`);
  }
  if (!receipt.receipt?.receiptHash) failures.push('missing receipt hash');
  if (failures.length) {
    throw new Error(failures.join('\n'));
  }
}

function writeReceipt(output, receipt) {
  const resolved = repoPath(output);
  mkdirSync(path.dirname(resolved), { recursive: true });
  writeFileSync(resolved, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  return resolved;
}

function run(args) {
  const contractText = read(CONTRACT_SOURCE);
  const fixtureText = read(FIXTURE_SOURCE);
  const semanticIr = buildSemanticIr(contractText, fixtureText);
  const assertions = {
    sceneGraph: semanticIr.sceneGraph.objectCount > 0,
    camera: semanticIr.camera.sourceOwnedByHoloScript,
    lights: semanticIr.lights.length > 0,
    geometry: semanticIr.geometry.length > 0,
    material: semanticIr.material.length > 0,
    transform: semanticIr.transform.sourceOwnedByHoloScript,
    events: semanticIr.events.length > 0,
    animation: semanticIr.animation.length > 0,
    lifecycle: Object.values(semanticIr.lifecycle).every(Boolean),
    adapterOnly: contractText.includes('legacyRendererRole: "adapter_evidence_only"')
      && contractText.includes('r3fMayOnlyAdapt: true'),
  };

  const receiptInput = {
    sourceHash: sha256(contractText),
    fixtureHash: sha256(fixtureText),
    semanticIr,
    assertions,
  };
  const receipt = {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    sources: {
      contract: CONTRACT_SOURCE,
      fixture: FIXTURE_SOURCE,
      adapterEvidence: 'packages/platform/renderer/src/HololandRenderer.ts',
    },
    parsers: [parseWithHoloScript(CONTRACT_SOURCE), parseWithHoloScript(FIXTURE_SOURCE)],
    semanticIr,
    assertions,
    policy: {
      sourceOwnedByHoloScript: true,
      typescriptMayOnlyAdapt: true,
      r3fMayOnlyAdapt: true,
      receiptRequiredBeforeProjection: true,
    },
    receipt: {
      receiptHash: sha256(JSON.stringify(receiptInput)),
      rawRendererCodeIncluded: false,
    },
  };
  assertReceipt(receipt);
  const output = writeReceipt(args.output, receipt);
  return { receipt, output };
}

try {
  const args = parseArgs();
  const { receipt, output } = run(args);
  if (args.json) {
    console.log(JSON.stringify(receipt, null, 2));
  } else {
    console.log('[native-renderer-skeleton] ok');
    console.log(`receipt: ${output}`);
    console.log(`scene objects: ${receipt.semanticIr.sceneGraph.objectCount}`);
    console.log(`lights: ${receipt.semanticIr.lights.length}`);
    console.log(`geometries: ${receipt.semanticIr.geometry.length}`);
    console.log(`materials: ${receipt.semanticIr.material.length}`);
  }
} catch (error) {
  console.error('[native-renderer-skeleton] failed');
  console.error(error.message || error);
  process.exit(1);
}
