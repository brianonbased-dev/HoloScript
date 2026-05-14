#!/usr/bin/env node
/**
 * Paper Scaling Envelope
 *
 * Emits a scaling memo from a measured subsystem baseline plus explicit
 * runtime/memory growth models. The first preset targets Paper 12 HoloLand.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const SCHEMA = 'holoscript.paper-scaling-envelope.v1';

export function buildPaper12ScalingEnvelope(options = {}) {
  const root = resolve(options.root ?? REPO_ROOT);
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const sourceArtifact = '.bench-logs/2026-04-27-paper-12-scene-suite-overhead.md';
  const sourceText = readText(root, sourceArtifact);
  const measured = parsePaper12SceneSuite(sourceText ?? '');

  const baselineObjects = 20;
  const annotationsPerObject = 4;
  const peakExportMs = measured.large?.usdExportMeanMs ?? 0.843;
  const bytesPerObject = 256;
  const bytesPerAnnotation = 96;
  const targets = [50, 500, 5000].map((objects) => {
    const annotationCount = objects * annotationsPerObject;
    const projectedRuntimeMs = round3(peakExportMs * (objects / baselineObjects));
    const projectedMemoryMB = round3(
      (objects * bytesPerObject + annotationCount * bytesPerAnnotation) / 1024 ** 2
    );
    return {
      objects,
      annotationsPerObject,
      annotationCount,
      projectedRuntimeMs,
      projectedMemoryMB,
      bottleneck: objects >= 5000 ? 'export batch scheduling and plugin serialization' : 'linear export serialization',
    };
  });

  const body = {
    schemaVersion: SCHEMA,
    generatedAt,
    generatedBy: 'scripts/paper-scaling-envelope.mjs',
    paper: {
      id: '12',
      title: 'HoloLand',
      target: "I3D '27 (Nov '26)",
      memoPath: 'research/paper-12-hololand-scaling.md',
    },
    subsystem: 'scene-suite parser/export path',
    quantifiedN: {
      baseline: `${baselineObjects} objects x ${annotationsPerObject} annotations/object`,
      targets: targets.map((target) => `${target.objects} objects`),
    },
    bottleneckModel: {
      asymptoticClass: 'O(o * a)',
      variables: {
        o: 'scene object count',
        a: 'annotations or traits per object',
      },
      primaryBottleneck: 'plugin export serialization',
      secondaryBottleneck: 'batch scheduling once scenes exceed 5,000 objects',
      evidence: sourceArtifact,
    },
    measuredBaseline: {
      sourceArtifact,
      sourceArtifactHash: hashFileIfPresent(resolve(root, sourceArtifact)),
      suiteScenes: measured.sceneCount,
      aggregateWarmParseMeanMs: measured.aggregate?.warmParseMeanMs,
      aggregateUsdExportMeanMs: measured.aggregate?.usdExportMeanMs,
      peakScene: measured.large,
    },
    growthModel: {
      runtimeFormula: `T(o,a=${annotationsPerObject}) = ${peakExportMs}ms * (o / ${baselineObjects})`,
      memoryFormula: `M(o,a) = o * ${bytesPerObject}B + (o*a) * ${bytesPerAnnotation}B`,
      targets,
    },
    scaleOutPlan: [
      'Batch exports by shard/zone before object count exceeds 500.',
      'At 500 objects, keep one worker per export batch and persist intermediate manifests.',
      'At 5,000 objects, split scene-suite export into independent shard jobs and merge provenance manifests.',
    ],
    paperCitation:
      'Cite research/paper-12-hololand-scaling.md from a Scaling/Scalability paragraph or section in paper-12-holo-i3d.tex.',
  };

  return {
    envelopeId: `scaling_${sha256Canonical(body).slice(0, 16)}`,
    envelopeHash: `sha256:${sha256Canonical(body)}`,
    ...body,
  };
}

export function renderScalingMemo(envelope) {
  const rows = envelope.growthModel.targets
    .map(
      (target) =>
        `| ${target.objects} | ${target.annotationCount} | ${target.projectedRuntimeMs} | ${target.projectedMemoryMB} | ${target.bottleneck} |`
    )
    .join('\n');

  return `# Paper 12 HoloLand Scaling Envelope

**Schema:** \`${envelope.schemaVersion}\`
**Envelope:** \`${envelope.envelopeId}\`
**Hash:** \`${envelope.envelopeHash}\`
**Generated:** ${envelope.generatedAt}

## Scope

This memo covers the HoloLand ${envelope.subsystem}. It is the scaling memo
surface that Paper 12 can cite for the audit-matrix \`scalingMemo\` column.

## Quantified N

- Baseline: ${envelope.quantifiedN.baseline}
- Targets: ${envelope.quantifiedN.targets.join(', ')}

## Bottleneck Model

- Asymptotic class: \`${envelope.bottleneckModel.asymptoticClass}\`
- Variables: \`o\` = ${envelope.bottleneckModel.variables.o}; \`a\` = ${envelope.bottleneckModel.variables.a}
- Primary bottleneck: ${envelope.bottleneckModel.primaryBottleneck}
- Secondary bottleneck: ${envelope.bottleneckModel.secondaryBottleneck}

## Measured Baseline

- Evidence: \`${envelope.measuredBaseline.sourceArtifact}\`
- Aggregate warm parse mean: ${envelope.measuredBaseline.aggregateWarmParseMeanMs} ms
- Aggregate USD export mean: ${envelope.measuredBaseline.aggregateUsdExportMeanMs} ms
- Peak scene export: ${envelope.measuredBaseline.peakScene?.usdExportMeanMs} ms at ${envelope.measuredBaseline.peakScene?.objects} objects

## Growth Table

| Objects | Annotations | Projected runtime ms | Projected memory MB | Bottleneck |
|---:|---:|---:|---:|---|
${rows}

## Scale-Out Plan

${envelope.scaleOutPlan.map((step) => `- ${step}`).join('\n')}

## Paper Citation

Use a Scaling or Scalability heading in \`paper-12-holo-i3d.tex\` and cite this
memo path directly:

\`\`\`tex
\\paragraph{Scaling.}
The HoloLand scene-suite export path scales as $O(o a)$ in object count $o$ and
annotations per object $a$; the measured baseline and scale-out plan are in
\\texttt{research/paper-12-hololand-scaling.md}.
\`\`\`
`;
}

export function writeScalingEnvelope(envelope, options) {
  const jsonOut = options.jsonOut ? resolve(options.jsonOut) : undefined;
  const memoOut = options.memoOut ? resolve(options.memoOut) : undefined;
  if (jsonOut) {
    mkdirSync(dirname(jsonOut), { recursive: true });
    writeFileSync(jsonOut, `${JSON.stringify(envelope, null, 2)}\n`, 'utf8');
  }
  if (memoOut) {
    mkdirSync(dirname(memoOut), { recursive: true });
    writeFileSync(memoOut, renderScalingMemo(envelope), 'utf8');
  }
  return { jsonOut, memoOut };
}

function parsePaper12SceneSuite(markdown) {
  const sceneRows = [];
  for (const line of markdown.split(/\r?\n/)) {
    if (!line.startsWith('|')) continue;
    const cells = line.split('|').map((cell) => cell.trim()).filter(Boolean);
    if (cells.length < 8 || cells[0] === 'Scene' || cells[0].startsWith('---')) continue;
    const [scene, objects, traitsPerObject, holoLoc, coldParseMeanMs, warmParseMeanMs, warmColdRatio, usdExportMeanMs] = cells;
    const numeric = {
      scene,
      objects: Number(objects),
      traitsPerObject: Number(traitsPerObject),
      holoLoc: Number(holoLoc),
      coldParseMeanMs: Number(coldParseMeanMs),
      warmParseMeanMs: Number(warmParseMeanMs),
      warmColdRatio: Number(warmColdRatio),
      usdExportMeanMs: Number(usdExportMeanMs),
    };
    if (Number.isFinite(numeric.objects)) sceneRows.push(numeric);
  }
  return {
    sceneCount: sceneRows.length,
    large: sceneRows.find((row) => row.scene === 'large') ?? sceneRows.at(-1),
    aggregate: {
      warmParseMeanMs: parseAggregateValue(markdown, 'HoloScript warm parse (ms)'),
      usdExportMeanMs: parseAggregateValue(markdown, 'OpenUSD plugin export (ms)'),
    },
  };
}

function parseAggregateValue(markdown, label) {
  const line = markdown.split(/\r?\n/).find((candidate) => candidate.includes(`| ${label} |`));
  if (!line) return undefined;
  const cells = line.split('|').map((cell) => cell.trim()).filter(Boolean);
  const value = Number(cells[1]);
  return Number.isFinite(value) ? value : undefined;
}

function readText(root, relativePath) {
  const path = resolve(root, relativePath);
  return existsSync(path) ? readFileSync(path, 'utf8') : undefined;
}

function hashFileIfPresent(path) {
  return existsSync(path)
    ? `sha256:${createHash('sha256').update(readFileSync(path)).digest('hex')}`
    : null;
}

function sha256Canonical(value) {
  return createHash('sha256').update(JSON.stringify(sortForJson(value))).digest('hex');
}

function sortForJson(value) {
  if (Array.isArray(value)) return value.map(sortForJson);
  if (!value || typeof value !== 'object') return value;
  const out = {};
  for (const key of Object.keys(value).sort()) {
    const child = value[key];
    if (child !== undefined) out[key] = sortForJson(child);
  }
  return out;
}

function round3(value) {
  return Math.round(value * 1000) / 1000;
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--') continue;
    if (arg === '--help' || arg === '-h') args.help = true;
    else if (arg === '--json-out') args.jsonOut = argv[++i];
    else if (arg.startsWith('--json-out=')) args.jsonOut = arg.slice('--json-out='.length);
    else if (arg === '--memo-out') args.memoOut = argv[++i];
    else if (arg.startsWith('--memo-out=')) args.memoOut = arg.slice('--memo-out='.length);
    else if (arg === '--generated-at') args.generatedAt = argv[++i];
    else if (arg.startsWith('--generated-at=')) args.generatedAt = arg.slice('--generated-at='.length);
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

if (process.argv[1] && import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`) {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log('Usage: node scripts/paper-scaling-envelope.mjs --json-out docs/public/evidence/paper-12-hololand-scaling-envelope.json --memo-out research/paper-12-hololand-scaling.md');
    process.exit(0);
  }
  const envelope = buildPaper12ScalingEnvelope({ generatedAt: args.generatedAt });
  const out = writeScalingEnvelope(envelope, {
    jsonOut: args.jsonOut,
    memoOut: args.memoOut,
  });
  if (!args.jsonOut && !args.memoOut) console.log(renderScalingMemo(envelope));
  if (out.jsonOut) console.error(`[paper-scaling-envelope] wrote ${out.jsonOut}`);
  if (out.memoOut) console.error(`[paper-scaling-envelope] wrote ${out.memoOut}`);
  console.error(`[paper-scaling-envelope] ${envelope.envelopeId} ${envelope.envelopeHash}`);
}
