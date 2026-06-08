#!/usr/bin/env node
/**
 * HoloShell Local Reality Node
 *
 * Minimal local proof that a .holo source can project one HoloShell object into
 * deterministic shell-object state and emit a CAEL-style receipt without
 * launching browsers, external seats, or mutating local state.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  chainReceipt,
  hashValue,
  sha256Bytes,
  stageReceipt,
  withHash,
} from './holoshell/chain/receipts.mjs';

export const VERSION = '0.1.0';
export const WORKFLOW = 'holoshell-local-reality-node';
export const SCHEMA_VERSION = 'holoscript.holoshell.local-reality-node.receipt.v0.1.0';
export const DEFAULT_SOURCE =
  'experiments/holoshell-human-os-frontier/flagship-readiness-room.holo';
export const DEFAULT_OUT = '.scratch/holoshell-local-reality-node/local-reality-node-receipt.json';

const DEFAULT_OPERATION = 'inspect';

function parseArgs(argv) {
  const args = {
    source: DEFAULT_SOURCE,
    object: '',
    out: DEFAULT_OUT,
    operation: DEFAULT_OPERATION,
    now: '',
    json: false,
    selfTest: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--source') args.source = argv[++index] || '';
    else if (arg === '--object') args.object = argv[++index] || '';
    else if (arg === '--out') args.out = argv[++index] || '';
    else if (arg === '--operation') args.operation = argv[++index] || DEFAULT_OPERATION;
    else if (arg === '--now') args.now = argv[++index] || '';
    else if (arg === '--json') args.json = true;
    else if (arg === '--self-test' || arg === 'self-test') args.selfTest = true;
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
  process.stdout.write(`HoloShell Local Reality Node ${VERSION}

Usage:
  node scripts/holoshell-local-reality-node.mjs --source <room.holo> [--object <name>] [--out <receipt.json>]
  node scripts/holoshell-local-reality-node.mjs --self-test

Options:
  --source <path>     .holo file to load. Defaults to ${DEFAULT_SOURCE}
  --object <name>     Object name to operate. Defaults to first object in source.
  --operation <name>  Local read-only operation label. Defaults to inspect.
  --out <path>        Receipt output path. Defaults to ${DEFAULT_OUT}
  --json              Print the full receipt JSON.
`);
}

function repoRoot() {
  return resolve(dirname(fileURLToPath(import.meta.url)), '..');
}

function resolveRepoPath(filePath, root = repoRoot()) {
  return isAbsolute(filePath) ? filePath : resolve(root, filePath);
}

function toRepoPath(filePath, root = repoRoot()) {
  return relative(root, resolve(filePath)).replace(/\\/g, '/');
}

function writeJson(filePath, value, root = repoRoot()) {
  const resolved = resolveRepoPath(filePath, root);
  mkdirSync(dirname(resolved), { recursive: true });
  writeFileSync(resolved, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  return resolved;
}

function nowIso(args = {}) {
  const value = args.now || new Date().toISOString();
  if (Number.isNaN(Date.parse(value))) throw new Error(`Invalid ISO timestamp: ${value}`);
  return value;
}

function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function extractCompositionName(source) {
  const match = source.match(/\bcomposition\s+(?:"([^"]+)"|([A-Za-z0-9_:-]+))/);
  return match?.[1] || match?.[2] || 'implicit';
}

function findMatchingBrace(source, openIndex) {
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = openIndex; index < source.length; index += 1) {
    const char = source[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === '{') depth += 1;
    else if (char === '}') {
      depth -= 1;
      if (depth === 0) return index;
    }
  }

  return -1;
}

export function extractHoloObjects(source) {
  const cleaned = stripComments(source);
  const objects = [];
  const objectPattern =
    /\bobject\s+(?:"([^"]+)"|([A-Za-z0-9_:-]+))(?:\s+using\s+(?:"([^"]+)"|([A-Za-z0-9_:-]+)))?\s*\{/g;

  let match;
  while ((match = objectPattern.exec(cleaned)) !== null) {
    const openIndex = cleaned.indexOf('{', match.index);
    const closeIndex = findMatchingBrace(cleaned, openIndex);
    if (closeIndex === -1) {
      throw new Error(`Unclosed object block for ${match[1] || match[2]}`);
    }
    const body = cleaned.slice(openIndex + 1, closeIndex);
    objects.push({
      name: match[1] || match[2],
      template: match[3] || match[4] || null,
      body,
      start: match.index,
      end: closeIndex + 1,
    });
    objectPattern.lastIndex = closeIndex + 1;
  }

  return objects;
}

function findValueText(body, key) {
  const pattern = new RegExp(`(^|\\n)\\s*${key}\\s*:`, 'm');
  const match = pattern.exec(body);
  if (!match) return undefined;

  let index = match.index + match[0].length;
  while (/\s/.test(body[index] || '') && body[index] !== '\n') index += 1;

  const first = body[index];
  if (first === '"' || first === "'") {
    const quote = first;
    let escaped = false;
    for (let cursor = index + 1; cursor < body.length; cursor += 1) {
      const char = body[cursor];
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) return body.slice(index, cursor + 1).trim();
    }
  }

  if (first === '[' || first === '{') {
    const close = first === '[' ? ']' : '}';
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let cursor = index; cursor < body.length; cursor += 1) {
      const char = body[cursor];
      if (inString) {
        if (escaped) escaped = false;
        else if (char === '\\') escaped = true;
        else if (char === '"') inString = false;
        continue;
      }
      if (char === '"') inString = true;
      else if (char === first) depth += 1;
      else if (char === close) {
        depth -= 1;
        if (depth === 0) return body.slice(index, cursor + 1).trim();
      }
    }
  }

  const newline = body.indexOf('\n', index);
  return body.slice(index, newline === -1 ? body.length : newline).trim();
}

function parseHoloValue(text) {
  if (text === undefined) return undefined;
  const trimmed = text.trim().replace(/,$/, '');
  if (!trimmed) return undefined;
  if (/^".*"$/.test(trimmed)) return JSON.parse(trimmed);
  if (/^'.*'$/.test(trimmed)) return trimmed.slice(1, -1);
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  if (trimmed === 'null') return null;
  if (/^-?\d+(?:\.\d+)?$/.test(trimmed)) return Number(trimmed);
  if (trimmed.startsWith('[')) return parseArrayValue(trimmed);
  if (trimmed.startsWith('{')) return parseObjectValue(trimmed);
  return trimmed;
}

function parseArrayValue(text) {
  try {
    return JSON.parse(text);
  } catch {
    const inner = text.slice(1, -1).trim();
    if (!inner) return [];
    return inner.split(',').map((item) => parseHoloValue(item.trim()));
  }
}

function parseObjectValue(text) {
  const body = text.replace(/^\{/, '').replace(/\}$/, '');
  const entries = {};
  const keyPattern = /(^|\n)\s*([A-Za-z0-9_:-]+)\s*:/g;
  let match;

  while ((match = keyPattern.exec(body)) !== null) {
    const key = match[2];
    const value = findValueText(body.slice(match.index), key);
    if (value !== undefined) entries[key] = parseHoloValue(value);
  }

  return entries;
}

function extractTraits(body) {
  return [...body.matchAll(/(^|\n)\s*@([A-Za-z0-9_:-]+)/g)].map((match) => match[2]);
}

function slug(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function normalizePermissionEnvelope(value) {
  const text = String(value || '').toLowerCase();
  if (text.includes('break_glass')) return 'break_glass';
  if (text.includes('guarded_execute')) return 'guarded_execute';
  return 'read_only';
}

function pruneUndefined(value) {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined));
}

export function projectShellObject({ sourcePath, sourceHash, compositionName, objectBlock }) {
  const properties = parseHoloValue(findValueText(objectBlock.body, 'properties')) || {};
  const material = parseHoloValue(findValueText(objectBlock.body, 'material')) || undefined;
  const permissionHint = properties.defaultEnvelope || properties.approvalPolicy;

  const projected = pruneUndefined({
    id: `shell-object:${slug(objectBlock.name)}`,
    objectName: objectBlock.name,
    compositionName,
    sourcePath,
    sourceHoloHash: sourceHash,
    template: objectBlock.template || undefined,
    label: parseHoloValue(findValueText(objectBlock.body, 'label')),
    geometry: parseHoloValue(findValueText(objectBlock.body, 'geometry')),
    position: parseHoloValue(findValueText(objectBlock.body, 'position')),
    scale: parseHoloValue(findValueText(objectBlock.body, 'scale')),
    color: parseHoloValue(findValueText(objectBlock.body, 'color')),
    material,
    traits: extractTraits(objectBlock.body),
    properties,
    state: {
      selected: true,
      visible: true,
      localOnly: true,
      mutationExecuted: false,
      permissionEnvelope: normalizePermissionEnvelope(permissionHint),
    },
  });

  return projected;
}

function isNonEmptyObject(value) {
  return Boolean(
    value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length > 0
  );
}

export function validateLocalRealityNodeReceipt(receipt) {
  const errors = [];
  const sourceHash = receipt?.sourceHoloHash || receipt?.source?.holoHash;
  if (!/^sha256:[a-f0-9]{64}$/.test(String(sourceHash || ''))) {
    errors.push('source .holo hash missing or invalid');
  }
  if (!isNonEmptyObject(receipt?.projectedState)) {
    errors.push('projected state is empty');
  }
  if (!receipt?.projectedState?.id) errors.push('projected state id missing');
  if (!receipt?.projectedState?.objectName) errors.push('projected state objectName missing');
  if (!isNonEmptyObject(receipt?.projectedState?.state))
    errors.push('projected shell-object runtime state is empty');
  if (receipt?.operation?.mutationExecuted !== false) {
    errors.push('local reality node proof must not execute mutations');
  }
  if (!receipt?.cael?.chain?.hash) errors.push('CAEL-style chain receipt hash missing');
  return errors;
}

export function buildLocalRealityNodeReceipt(options = {}) {
  const root = options.root || repoRoot();
  const sourcePath = options.source || DEFAULT_SOURCE;
  const absoluteSource = resolveRepoPath(sourcePath, root);
  if (!existsSync(absoluteSource)) throw new Error(`Source .holo not found: ${sourcePath}`);

  const sourceBytes = readFileSync(absoluteSource);
  const sourceText = sourceBytes.toString('utf8');
  const sourceHash = `sha256:${sha256Bytes(sourceBytes)}`;
  const sourceRepoPath = toRepoPath(absoluteSource, root);
  const compositionName = extractCompositionName(sourceText);
  const objects = extractHoloObjects(sourceText);
  if (objects.length === 0) throw new Error(`No object declarations found in ${sourceRepoPath}`);

  const selectedObject = options.object
    ? objects.find((object) => object.name === options.object)
    : objects[0];
  if (!selectedObject) {
    throw new Error(`Object not found in ${sourceRepoPath}: ${options.object}`);
  }

  const generatedAt = nowIso(options);
  const projectedState = projectShellObject({
    sourcePath: sourceRepoPath,
    sourceHash,
    compositionName,
    objectBlock: selectedObject,
  });
  const operation = {
    name: options.operation || DEFAULT_OPERATION,
    objectId: projectedState.id,
    permissionEnvelope: 'read_only',
    outcome: 'success',
    mutationExecuted: false,
    stateHash: hashValue(projectedState),
  };

  const loadStage = stageReceipt({
    name: 'load-source-holo',
    input: { sourcePath: sourceRepoPath },
    output: { sourceHoloHash: sourceHash, bytes: sourceBytes.byteLength },
    honestScope: 'local filesystem read only',
  });
  const projectionStage = stageReceipt({
    name: 'project-shell-object-state',
    input: { sourceHoloHash: sourceHash, objectName: selectedObject.name },
    output: projectedState,
    metrics: { projectedFieldCount: Object.keys(projectedState).length },
    honestScope: 'deterministic local projection; no external runtime',
  });
  const operationStage = stageReceipt({
    name: 'operate-local-shell-object',
    input: { objectId: projectedState.id, operation: operation.name },
    output: operation,
    honestScope: 'read_only local operation; no mutation executed',
  });
  const chain = chainReceipt({
    name: WORKFLOW,
    stages: [loadStage, projectionStage, operationStage],
    metrics: { objectCount: objects.length, selectedObject: selectedObject.name },
    honestScope: 'minimal proof, not a full HoloLand shell runtime',
  });

  const receipt = withHash({
    schemaVersion: SCHEMA_VERSION,
    kind: 'holoshell-local-reality-node-receipt',
    id: `hlrn-${sourceHash.slice('sha256:'.length, 'sha256:'.length + 12)}-${slug(selectedObject.name)}`,
    workflow: WORKFLOW,
    generatedAt,
    source: {
      path: sourceRepoPath,
      format: 'holo',
      hashAlgorithm: 'sha256',
      holoHash: sourceHash,
      sizeBytes: sourceBytes.byteLength,
    },
    sourceHoloHash: sourceHash,
    projectedState,
    operation,
    cael: {
      style: 'stage-chain',
      events: [
        {
          type: 'source_loaded',
          at: generatedAt,
          sourceHoloHash: sourceHash,
          stageHash: loadStage.hash,
        },
        {
          type: 'shell_object_projected',
          at: generatedAt,
          shellObjectId: projectedState.id,
          stateHash: operation.stateHash,
          stageHash: projectionStage.hash,
        },
        {
          type: 'local_operation_recorded',
          at: generatedAt,
          shellObjectId: projectedState.id,
          operation: operation.name,
          mutationExecuted: false,
          stageHash: operationStage.hash,
        },
      ],
      stages: [loadStage, projectionStage, operationStage],
      chain,
    },
    validation: {
      sourceHashPresent: true,
      projectedStateNonEmpty: true,
      mutationExecuted: false,
    },
    verificationCommands: [
      'node scripts/holoshell-local-reality-node.mjs --self-test',
      'node scripts/__tests__/holoshell-local-reality-node.test.mjs',
    ],
  });

  const errors = validateLocalRealityNodeReceipt(receipt);
  if (errors.length > 0) {
    throw new Error(`local reality node receipt invalid: ${errors.join('; ')}`);
  }

  return receipt;
}

function runSelfTest() {
  const receipt = buildLocalRealityNodeReceipt({
    now: '2026-05-26T00:00:00.000Z',
    object: 'OutcomePedestal',
  });
  const errors = validateLocalRealityNodeReceipt(receipt);
  if (errors.length > 0) throw new Error(errors.join('; '));
  if (receipt.projectedState.objectName !== 'OutcomePedestal') {
    throw new Error('self-test selected the wrong shell object');
  }
  return { ok: true, receiptId: receipt.id, sourceHoloHash: receipt.sourceHoloHash };
}

function runCli() {
  const args = parseArgs(process.argv.slice(2));
  if (args.selfTest) {
    const result = runSelfTest();
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }

  const receipt = buildLocalRealityNodeReceipt(args);
  const written = writeJson(args.out, receipt);
  if (args.json) {
    process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
  } else {
    process.stdout.write(
      `${JSON.stringify(
        {
          ok: true,
          out: written,
          receiptId: receipt.id,
          sourceHoloHash: receipt.sourceHoloHash,
          shellObjectId: receipt.projectedState.id,
          projectedFieldCount: Object.keys(receipt.projectedState).length,
        },
        null,
        2
      )}\n`
    );
  }
}

if (import.meta.url === pathToFileURL(resolve(process.argv[1] || '')).href) {
  try {
    runCli();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${JSON.stringify({ ok: false, error: message }, null, 2)}\n`);
    process.exit(1);
  }
}
