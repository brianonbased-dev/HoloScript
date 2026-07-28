#!/usr/bin/env node
/**
 * Audit the official HoloAbsorb umbrella against the built package, MCP tool
 * surface, repository evidence paths, and an optional HoloMesh thread snapshot.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '../../..');

function parseArgs(argv) {
  const options = { out: null, board: null, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const raw = argv[i];
    if (raw === '--help') {
      options.help = true;
      continue;
    }
    const [flag, inline] = raw.split('=', 2);
    const value = inline ?? argv[i + 1];
    if (inline === undefined && value && !value.startsWith('--')) i += 1;
    if (flag === '--out') options.out = value;
    if (flag === '--board') options.board = value;
  }
  return options;
}

function usage() {
  return [
    'Usage: node packages/absorb-service/scripts/audit-holoabsorb.mjs [options]',
    '',
    'Options:',
    '  --out=PATH    Write the JSON audit receipt to PATH',
    '  --board=PATH  Validate a HoloAbsorb thread snapshot and workstream coverage',
    '  --help        Show this message',
  ].join('\n');
}

function unique(values) {
  return [...new Set(values)];
}

function loadJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function auditThreadSnapshot(snapshot, manifest) {
  const tasks = Array.isArray(snapshot.tasks) ? snapshot.tasks : [];
  const coverage = Array.isArray(snapshot.coverage) ? snapshot.coverage : [];
  const relations = Array.isArray(snapshot.relations) ? snapshot.relations : [];
  const taskIds = tasks.map((task) => task.id);
  const duplicateTaskIds = taskIds.filter((id, index) => taskIds.indexOf(id) !== index);
  const knownTaskIds = new Set(taskIds);
  const requiredWorkstreams = manifest.workstreams.map((workstream) => workstream.id);
  const coveredWorkstreams = new Set(coverage.map((entry) => entry.workstreamId));
  const missingWorkstreams = requiredWorkstreams.filter((id) => !coveredWorkstreams.has(id));
  const danglingReferences = unique(
    [...coverage, ...relations]
      .flatMap((entry) => entry.taskIds ?? [])
      .filter((id) => !knownTaskIds.has(id))
  );
  const umbrellaPresent = knownTaskIds.has(manifest.coordination.umbrellaTaskId);
  const errors = [];
  if (duplicateTaskIds.length > 0) {
    errors.push(`Duplicate HoloAbsorb thread IDs: ${unique(duplicateTaskIds).join(', ')}`);
  }
  if (missingWorkstreams.length > 0) {
    errors.push(`Missing HoloAbsorb workstream threads: ${missingWorkstreams.join(', ')}`);
  }
  if (danglingReferences.length > 0) {
    errors.push(`Dangling HoloAbsorb thread references: ${danglingReferences.join(', ')}`);
  }
  if (!umbrellaPresent) {
    errors.push(`Umbrella task is absent: ${manifest.coordination.umbrellaTaskId}`);
  }

  return {
    schemaVersion: 'holoscript.holoabsorb.thread-audit.v1',
    status: errors.length === 0 ? 'pass' : 'fail',
    source: snapshot.source ?? 'unknown',
    capturedAt: snapshot.capturedAt ?? null,
    taskCount: tasks.length,
    coverageCount: coverage.length,
    relationCount: relations.length,
    missingWorkstreams,
    duplicateTaskIds: unique(duplicateTaskIds),
    danglingReferences,
    umbrellaPresent,
    relations,
    errors,
  };
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.help) {
    console.log(usage());
    return 0;
  }

  const productModulePath = resolve(repoRoot, 'packages/absorb-service/dist/holoabsorb/index.js');
  const mcpModulePath = resolve(repoRoot, 'packages/absorb-service/dist/mcp/index.js');
  if (!existsSync(productModulePath) || !existsSync(mcpModulePath)) {
    throw new Error(
      'HoloAbsorb dist entry points are missing. Run `pnpm --filter @holoscript/absorb-service build` first.'
    );
  }

  const product = await import(pathToFileURL(productModulePath).href);
  const mcp = await import(pathToFileURL(mcpModulePath).href);
  const manifest = product.buildHoloAbsorbManifest();
  const declaredPaths = unique(
    manifest.capabilities.flatMap((capability) => capability.evidencePaths)
  );
  const observedPaths = declaredPaths.filter((path) => existsSync(resolve(repoRoot, path)));
  const observedToolNames = unique(
    [
      mcp.absorbServiceTools,
      mcp.absorbTypescriptTools,
      mcp.codebaseTools,
      mcp.graphRagTools,
      mcp.oracleTools,
      mcp.knowledgeExtractionTools,
    ]
      .filter(Array.isArray)
      .flatMap((tools) => tools.map((tool) => tool.name))
  );
  const manifestAudit = product.auditHoloAbsorbManifest({
    observedPaths,
    observedToolNames,
  });

  let threadAudit = null;
  if (options.board) {
    const boardPath = resolve(repoRoot, options.board);
    threadAudit = auditThreadSnapshot(loadJson(boardPath), manifest);
  }

  const errors = [...manifestAudit.errors, ...(threadAudit?.errors ?? [])];
  const receipt = {
    schemaVersion: 'holoscript.holoabsorb.repository-audit.v1',
    productName: manifest.productName,
    status: errors.length === 0 ? 'pass' : 'fail',
    auditedAt: new Date().toISOString(),
    repoRoot,
    manifestAudit,
    threadAudit,
    observed: {
      toolCount: observedToolNames.length,
      toolNames: observedToolNames,
      evidencePathCount: observedPaths.length,
      evidencePaths: observedPaths,
    },
    errors,
  };

  if (options.out) {
    const outPath = resolve(repoRoot, options.out);
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
    console.log(`HoloAbsorb audit ${receipt.status.toUpperCase()} -> ${outPath}`);
  } else {
    console.log(JSON.stringify(receipt, null, 2));
  }
  return receipt.status === 'pass' ? 0 : 1;
}

const thisFile = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === thisFile) {
  main().then(
    (code) => process.exit(code),
    (error) => {
      console.error(`[audit-holoabsorb] ${error instanceof Error ? error.stack : error}`);
      process.exit(1);
    }
  );
}
