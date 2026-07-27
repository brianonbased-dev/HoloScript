#!/usr/bin/env node
/**
 * Fail-closed readiness audit for the frozen Paper 5 visual-agent v4 study.
 *
 * The audit distinguishes executable render/image plumbing from external
 * corpus, independent annotation, and multi-family model custody. Missing
 * inputs produce a durable `blocked` receipt rather than an invented result.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  auditPaper5VisualV4Dataset,
  auditPaper5VisualV4ExecutionPlan,
  buildVerifiedImageContentPart,
  renderPaper5VisualV4Png,
} from './lib/paper-5-visual-v4.mjs';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(scriptDir, '..');
const repoRoot = resolve(packageRoot, '../..');
const defaultProtocol = resolve(
  packageRoot,
  'benchmarks/paper-5-visual-agent-study-v4.json'
);

function parseArgs(argv) {
  const options = {
    protocol: defaultProtocol,
    dataset: '',
    executionPlan: '',
    out: '.scratch/paper-5-visual-v4-readiness.json',
    requireReady: false,
    help: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const raw = argv[index];
    if (!raw.startsWith('--')) continue;
    const [flag, inline] = raw.slice(2).split('=', 2);
    const next = inline ?? argv[index + 1];
    if (inline === undefined && next && !next.startsWith('--')) index += 1;
    if (flag === 'protocol') options.protocol = resolve(next || defaultProtocol);
    if (flag === 'dataset') options.dataset = resolve(next || '');
    if (flag === 'execution-plan') options.executionPlan = resolve(next || '');
    if (flag === 'out') options.out = next || options.out;
    if (flag === 'require-ready') options.requireReady = true;
    if (flag === 'help') options.help = true;
  }
  return options;
}

function usage() {
  return [
    'Usage: node packages/absorb-service/scripts/audit-paper-5-visual-v4.mjs [options]',
    '',
    'Options:',
    '  --protocol=PATH          Frozen v4 protocol',
    '  --dataset=PATH           Sealed external annotated dataset',
    '  --execution-plan=PATH    Three-family vision execution plan',
    '  --out=PATH               Readiness receipt path',
    '  --require-ready          Exit non-zero unless every gate passes',
    '  --help                   Show this message',
  ].join('\n');
}

function readJsonIfPresent(path) {
  return path && existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : null;
}

function gitValue(args) {
  const result = spawnSync('git', args, {
    cwd: repoRoot,
    encoding: 'utf8',
    windowsHide: true,
  });
  return result.status === 0 ? result.stdout.trim() : null;
}

export function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.help) {
    console.log(usage());
    return 0;
  }
  const protocolRaw = readFileSync(options.protocol, 'utf8');
  const protocol = JSON.parse(protocolRaw);
  const dataset = readJsonIfPresent(options.dataset);
  const executionPlan = readJsonIfPresent(options.executionPlan) ?? dataset?.executionPlan ?? null;
  const repoCommit = gitValue(['rev-parse', 'HEAD']);
  const trackedStatusAtStart = gitValue(['status', '--short', '--untracked-files=no']);
  const datasetAudit = auditPaper5VisualV4Dataset({ protocol, protocolRaw, dataset });
  const executionAudit = auditPaper5VisualV4ExecutionPlan({ protocol, executionPlan });

  const candidates = Array.from({ length: protocol.design.candidateCount }, (_, index) => ({
    alias: `c${index + 1}`,
  }));
  const rendered = renderPaper5VisualV4Png({
    candidates,
    relations: [{ fromAlias: 'c1', toAlias: 'c2', type: 'imports' }],
    width: Number(protocol.design.visualProjection.width),
    height: Number(protocol.design.visualProjection.height),
  });
  const imageInput = buildVerifiedImageContentPart(rendered.png, rendered.receipt.sha256);
  const implementationChecks = [
    {
      id: 'deterministic-png-renderer',
      pass:
        rendered.receipt.mimeType === 'image/png' &&
        rendered.receipt.width === Number(protocol.design.visualProjection.width) &&
        rendered.receipt.height === Number(protocol.design.visualProjection.height),
      detail: rendered.receipt,
    },
    {
      id: 'actual-image-content-part',
      pass:
        imageInput.receipt.actualImageBytes === true &&
        imageInput.receipt.sha256 === rendered.receipt.sha256,
      detail: imageInput.receipt,
    },
  ];
  const implementationStatus = implementationChecks.every((item) => item.pass)
    ? 'pass'
    : 'fail';
  const status =
    implementationStatus === 'pass' &&
    datasetAudit.status === 'pass' &&
    executionAudit.status === 'pass'
      ? 'ready'
      : 'blocked';
  const receipt = {
    schemaVersion: 'holoscript.paper5.visual-v4-readiness.v1',
    kind: 'Paper5VisualV4ReadinessReceipt',
    status,
    capturedAt: new Date().toISOString(),
    repo: {
      commit: repoCommit,
      trackedWorktreeDirtyAtStart: Boolean(trackedStatusAtStart),
      trackedStatusAtStart,
    },
    protocol: {
      id: protocol.protocolId,
      path: relative(repoRoot, options.protocol).replace(/\\/gu, '/'),
      sha256: datasetAudit.protocolSha256,
    },
    inputs: {
      datasetPath: options.dataset
        ? relative(repoRoot, options.dataset).replace(/\\/gu, '/')
        : null,
      executionPlanPath: options.executionPlan
        ? relative(repoRoot, options.executionPlan).replace(/\\/gu, '/')
        : null,
    },
    implementation: {
      status: implementationStatus,
      checks: implementationChecks,
    },
    dataset: datasetAudit,
    execution: executionAudit,
    blockers: [
      ...(datasetAudit.status === 'pass' ? [] : datasetAudit.errors),
      ...(executionAudit.status === 'pass' ? [] : executionAudit.errors),
    ],
    claimBoundary: [
      'A PASS implementation check proves deterministic PNG bytes and a verified multimodal content part only.',
      'READY requires a sealed external dataset, independent annotations, and three independently receipted vision-capable model families.',
      'BLOCKED is not a failed hypothesis and does not authorize a visual-accuracy claim.',
    ],
  };
  const outPath = resolve(repoRoot, options.out);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  console.log(
    `Paper 5 visual v4 readiness ${status.toUpperCase()} -> ${relative(repoRoot, outPath).replace(
      /\\/gu,
      '/'
    )}`
  );
  return options.requireReady && status !== 'ready' ? 1 : 0;
}

const thisFile = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === thisFile) {
  try {
    process.exitCode = main();
  } catch (error) {
    console.error(
      `[audit-paper-5-visual-v4] ${error instanceof Error ? error.stack : String(error)}`
    );
    process.exitCode = 1;
  }
}
