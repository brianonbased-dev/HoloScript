#!/usr/bin/env node
import crypto from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..');

const SCHEMA = 'hololand.human-os.asset-shard-visual-witness-receipt.v0.1.0';
const DEFAULTS = {
  manifest: 'apps/holoshell/enterprise-gates/creator-asset-shard-room/package-gate.json',
  archivePlan: 'docs/audits/hololand-experiment-archive-plan-2026-06-30.json',
  visualWitness: '.tmp/holoshell/self-test/imported-shard-visual-witness.json',
  playableWitness: '.tmp/holoshell/self-test/playable-shard-witness.json',
  output: 'docs/audits/hololand-asset-shard-2-visual-witness-receipt-2026-06-30.json',
  markdownOutput: 'docs/audits/HOLOLAND_ASSET_SHARD_2_VISUAL_WITNESS_RECEIPT_2026-06-30.md',
};

const REQUIRED_PROMOTED_TRIO = [
  'apps/holoshell/source/holoshell-asset-shard-2-room.holo',
  'apps/holoshell/source/holoshell-asset-shard-2-policy.hsplus',
  'apps/holoshell/source/holoshell-asset-shard-2-pipeline.hs',
];

const SUPERSEDED_V1_TRIO = [
  'experiments/holoshell-human-os-frontier/asset-folder-playable-shard-room.holo',
  'experiments/holoshell-human-os-frontier/asset-folder-playable-shard-policy.hsplus',
  'experiments/holoshell-human-os-frontier/asset-folder-playable-shard-pipeline.hs',
];

function parseArgs(argv) {
  const args = { ...DEFAULTS, json: false, assert: true };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--manifest') args.manifest = argv[++index] || args.manifest;
    else if (arg === '--archive-plan') args.archivePlan = argv[++index] || args.archivePlan;
    else if (arg === '--visual-witness') args.visualWitness = argv[++index] || args.visualWitness;
    else if (arg === '--playable-witness') args.playableWitness = argv[++index] || args.playableWitness;
    else if (arg === '--output') args.output = argv[++index] || args.output;
    else if (arg === '--markdown-output') args.markdownOutput = argv[++index] || args.markdownOutput;
    else if (arg === '--no-assert') args.assert = false;
    else if (arg === '--json') args.json = true;
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
  console.log(`HoloLand asset-shard-2 visual witness receipt

Usage:
  node scripts/hololand-asset-shard-visual-witness-receipt.mjs [options]

Options:
  --manifest <path>          Creator asset-shard enterprise gate manifest.
  --archive-plan <path>      Human OS archive plan JSON.
  --visual-witness <path>    Imported shard visual witness JSON.
  --playable-witness <path>  Playable shard witness JSON.
  --output <path>            Receipt JSON output.
  --markdown-output <path>   Human-readable receipt output.
  --no-assert                Write fail receipt without exiting non-zero.
  --json                     Print receipt JSON.
`);
}

function resolveRepoPath(filePath) {
  return path.isAbsolute(filePath) ? filePath : path.resolve(REPO_ROOT, filePath);
}

function publicPath(filePath) {
  return path.relative(REPO_ROOT, resolveRepoPath(filePath)).replace(/\\/g, '/');
}

function readJson(filePath) {
  return JSON.parse(readFileSync(resolveRepoPath(filePath), 'utf8'));
}

function writeJson(filePath, value) {
  const target = resolveRepoPath(filePath);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  return publicPath(target);
}

function writeText(filePath, value) {
  const target = resolveRepoPath(filePath);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, `${value.trimEnd()}\n`, 'utf8');
  return publicPath(target);
}

function sha256File(filePath) {
  return crypto.createHash('sha256').update(readFileSync(resolveRepoPath(filePath))).digest('hex');
}

function fileRecord(filePath) {
  const resolved = resolveRepoPath(filePath);
  const exists = existsSync(resolved);
  return {
    path: publicPath(resolved),
    exists,
    sizeBytes: exists ? statSync(resolved).size : 0,
    sha256: exists ? sha256File(resolved) : '',
  };
}

function addCheck(checks, id, status, target, evidence = {}, notes = []) {
  checks.push({ id, status, target, evidence, notes });
}

function hasPlanFile(archivePlan, sourcePath, reason) {
  return (archivePlan.files || []).some((file) => file.sourcePath === sourcePath && (!reason || file.archiveReason === reason));
}

function buildReceipt(args) {
  const manifest = readJson(args.manifest);
  const archivePlan = readJson(args.archivePlan);
  const visualWitness = readJson(args.visualWitness);
  const playableWitness = readJson(args.playableWitness);
  const checks = [];

  const sourcePaths = [manifest.sourcePath, ...(manifest.supportingSourcePaths || [])].filter(Boolean);
  const promotedSources = REQUIRED_PROMOTED_TRIO.map(fileRecord);
  const workflowSource = manifest.sourcePath ? fileRecord(manifest.sourcePath) : null;
  const supersededSources = SUPERSEDED_V1_TRIO.map(fileRecord);

  addCheck(
    checks,
    'creator-gate-manifest',
    manifest.id === 'creator-asset-shard-room' ? 'pass' : 'fail',
    'Creator asset-shard enterprise gate manifest is loaded.',
    {
      manifest: publicPath(args.manifest),
      id: manifest.id,
      sourcePath: manifest.sourcePath,
      supportingSourcePaths: manifest.supportingSourcePaths || [],
    }
  );

  const missingPromoted = REQUIRED_PROMOTED_TRIO.filter((sourcePath) => !sourcePaths.includes(sourcePath));
  addCheck(
    checks,
    'promoted-app-source-trio',
    missingPromoted.length === 0 && promotedSources.every((source) => source.exists && source.sizeBytes > 0) ? 'pass' : 'fail',
    'Creator gate names the promoted asset-shard-2 app-source trio and each file is present.',
    { required: REQUIRED_PROMOTED_TRIO, missingFromManifest: missingPromoted, promotedSources }
  );

  addCheck(
    checks,
    'visual-witness-receipt',
    visualWitness.status === 'pass' &&
      visualWitness.screenshot?.sha256 &&
      visualWitness.domWitness?.sha256 &&
      Array.isArray(visualWitness.domWitness?.missingText) &&
      visualWitness.domWitness.missingText.length === 0 &&
      visualWitness.shardWitness?.sourceAssetsMutated === false
      ? 'pass'
      : 'fail',
    'Imported shard visual witness renders in a local browser with screenshot and DOM evidence.',
    {
      receipt: publicPath(args.visualWitness),
      status: visualWitness.status,
      screenshot: visualWitness.screenshot,
      domWitness: visualWitness.domWitness,
      shardWitness: visualWitness.shardWitness,
    }
  );

  addCheck(
    checks,
    'playable-shard-witness',
    playableWitness.status === 'pass' &&
      playableWitness.screenshot?.sha256 &&
      playableWitness.domWitness?.sha256 &&
      Array.isArray(playableWitness.domWitness?.missingText) &&
      playableWitness.domWitness.missingText.length === 0 &&
      playableWitness.shardWitness?.sourceAssetsMutated === false
      ? 'pass'
      : 'fail',
    'PlayableShardWitnessReceipt is present and source assets remain read-only.',
    {
      receipt: publicPath(args.playableWitness),
      status: playableWitness.status,
      screenshot: playableWitness.screenshot,
      domWitness: playableWitness.domWitness,
      shardWitness: playableWitness.shardWitness,
    }
  );

  const missingV1PlanRows = SUPERSEDED_V1_TRIO.filter(
    (sourcePath) => !hasPlanFile(archivePlan, sourcePath, 'superseded-by-asset-shard-2')
  );
  addCheck(
    checks,
    'asset-folder-v1-archive-plan',
    missingV1PlanRows.length === 0 && supersededSources.every((source) => source.exists)
      ? 'pass'
      : 'fail',
    'Superseded asset-folder-playable-shard v1 trio is visible and listed as superseded in the Jetson archive plan.',
    {
      archivePlan: publicPath(args.archivePlan),
      requiredV1Sources: SUPERSEDED_V1_TRIO,
      missingV1PlanRows,
      supersededSources,
    }
  );

  const failedChecks = checks.filter((check) => check.status !== 'pass');
  const archiveCandidateStatus = failedChecks.length === 0
    ? 'candidate_ready_for_jetson_archive_receipt'
    : 'blocked';

  return {
    schema: SCHEMA,
    generatedAt: new Date().toISOString(),
    status: failedChecks.length === 0 ? 'pass' : 'fail',
    taskId: 'task_1782803168047_x79q',
    purpose: 'Refresh the Human OS asset-shard-2 visual witness and decide whether asset-folder-playable-shard v1 can advance to Jetson archive candidate status.',
    enterpriseGate: {
      id: manifest.id,
      title: manifest.title,
      manifest: publicPath(args.manifest),
      sourcePath: manifest.sourcePath,
      supportingSourcePaths: manifest.supportingSourcePaths || [],
      requiredReceipts: manifest.requiredReceipts || [],
    },
    promotedAppSource: {
      workflowSource,
      requiredTrio: REQUIRED_PROMOTED_TRIO,
      files: promotedSources,
    },
    witness: {
      visualWitnessReceipt: publicPath(args.visualWitness),
      playableShardWitnessReceipt: publicPath(args.playableWitness),
      visualWitnessStatus: visualWitness.status,
      playableWitnessStatus: playableWitness.status,
      screenshotSha256: visualWitness.screenshot?.sha256 || '',
      domSha256: visualWitness.domWitness?.sha256 || '',
      playableScreenshotSha256: playableWitness.screenshot?.sha256 || '',
      playableDomSha256: playableWitness.domWitness?.sha256 || '',
      sourceAssetsMutated: Boolean(
        visualWitness.shardWitness?.sourceAssetsMutated || playableWitness.shardWitness?.sourceAssetsMutated
      ),
      missingText: [
        ...(visualWitness.domWitness?.missingText || []),
        ...(playableWitness.domWitness?.missingText || []),
      ],
    },
    archiveDecision: {
      supersededWorkflow: 'asset-folder-playable-shard',
      replacementWorkflow: 'asset-shard-2',
      status: archiveCandidateStatus,
      deletionAllowed: false,
      transferExecuted: false,
      nextRequiredReceipt: 'task_1782803168047_djor must create and verify the Jetson archive tarball/manifest before any removal commit.',
      supersededSources,
    },
    checks,
    failedChecks: failedChecks.map((check) => check.id),
  };
}

function renderMarkdown(receipt) {
  const sourceRows = receipt.promotedAppSource.files
    .map((source) => `| \`${source.path}\` | ${source.exists ? 'yes' : 'no'} | \`${source.sha256.slice(0, 12)}\` |`)
    .join('\n');
  const checkRows = receipt.checks
    .map((check) => `| \`${check.id}\` | ${check.status} | ${check.target} |`)
    .join('\n');
  const supersededRows = receipt.archiveDecision.supersededSources
    .map((source) => `| \`${source.path}\` | ${source.exists ? 'yes' : 'no'} | \`${source.sha256.slice(0, 12)}\` |`)
    .join('\n');

  return `# HoloLand Asset-Shard-2 Visual Witness Receipt - 2026-06-30

Status: ${receipt.status}. No file was moved, deleted, hidden, or archived by
this receipt.

## Purpose

This receipt refreshes the visual witness for the promoted
\`asset-shard-2\` creator gate and records whether the superseded
\`asset-folder-playable-shard\` v1 trio can advance to Jetson archive candidate
status.

## Result

| Field | Value |
| --- | --- |
| Enterprise gate | \`${receipt.enterpriseGate.id}\` |
| Visual witness | ${receipt.witness.visualWitnessStatus} |
| Playable shard witness | ${receipt.witness.playableWitnessStatus} |
| Source assets mutated | ${receipt.witness.sourceAssetsMutated} |
| Archive decision | \`${receipt.archiveDecision.status}\` |
| Deletion allowed | ${receipt.archiveDecision.deletionAllowed} |
| Transfer executed | ${receipt.archiveDecision.transferExecuted} |

## Promoted App Source

| Source | Exists | SHA256 prefix |
| --- | --- | --- |
${sourceRows}

## Witness Evidence

- Visual witness receipt: \`${receipt.witness.visualWitnessReceipt}\`
- Playable shard witness receipt: \`${receipt.witness.playableShardWitnessReceipt}\`
- Visual screenshot SHA256: \`${receipt.witness.screenshotSha256}\`
- Visual DOM SHA256: \`${receipt.witness.domSha256}\`
- Playable screenshot SHA256: \`${receipt.witness.playableScreenshotSha256}\`
- Playable DOM SHA256: \`${receipt.witness.playableDomSha256}\`

## Superseded V1 Sources

These files remain present. They are only cleared for the next Jetson archive
receipt, not for deletion.

| Source | Exists | SHA256 prefix |
| --- | --- | --- |
${supersededRows}

## Checks

| Check | Status | Target |
| --- | --- | --- |
${checkRows}

## Next Gate

${receipt.archiveDecision.nextRequiredReceipt}
`;
}

const args = parseArgs(process.argv.slice(2));
const receipt = buildReceipt(args);
receipt.outputs = {
  json: writeJson(args.output, receipt),
  markdown: writeText(args.markdownOutput, renderMarkdown(receipt)),
};

if (args.json) console.log(JSON.stringify(receipt, null, 2));
else {
  console.log(`HoloLand asset-shard-2 visual witness receipt: ${receipt.status}`);
  console.log(`JSON: ${receipt.outputs.json}`);
  console.log(`Markdown: ${receipt.outputs.markdown}`);
}

if (args.assert && receipt.status !== 'pass') {
  console.error(`Failed checks: ${receipt.failedChecks.join(', ')}`);
  process.exit(1);
}
