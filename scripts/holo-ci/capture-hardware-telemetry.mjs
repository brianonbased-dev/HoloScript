#!/usr/bin/env node
/**
 * Build a manifest-driven hardware telemetry receipt bundle.
 *
 * Default mode is plan-only: every declared signal is represented, but command
 * execution is skipped unless the caller explicitly opts into safe source
 * classes. This keeps telemetry capture useful for public-readiness evidence
 * without turning the manifest into an arbitrary command runner.
 */

import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const SELF_TEST = args.includes('--self-test');
const EXECUTE_REPO = args.includes('--execute-repo');
const EXECUTE_LIVE = args.includes('--execute-live');
const JSON_OUT = args.includes('--json') || !args.includes('--summary');
const rootIdx = args.indexOf('--root');
const manifestIdx = args.indexOf('--manifest');
const appIdx = args.indexOf('--app');
const outIdx = args.indexOf('--out');
const ndjsonIdx = args.indexOf('--ndjson');
const timeoutIdx = args.indexOf('--timeout-ms');
const intervalIdx = args.indexOf('--interval-ms');
const iterationsIdx = args.indexOf('--iterations');
const EXTERNAL_RECEIPT_SCHEMA = 'holoscript.hardware-telemetry-source-receipt/v1';
const MAX_RECEIPT_FILES = 200;
const MAX_RECEIPT_BYTES = 1024 * 1024;
const ROOT = rootIdx >= 0 ? resolve(args[rootIdx + 1]) : resolve(__dirname, '..', '..');
const MANIFEST =
  manifestIdx >= 0
    ? resolve(args[manifestIdx + 1])
    : join(ROOT, 'scripts', 'holo-ci', 'hardware-app-envelopes-manifest.json');
const PACKAGE_JSON = join(ROOT, 'package.json');
const TIMEOUT_MS = timeoutIdx >= 0 ? Number(args[timeoutIdx + 1]) : 30_000;
const INTERVAL_MS = intervalIdx >= 0 ? Number(args[intervalIdx + 1]) : 0;
const ITERATIONS = iterationsIdx >= 0 ? Number(args[iterationsIdx + 1]) : INTERVAL_MS > 0 ? 2 : 1;
const REQUESTED_APPS =
  appIdx >= 0
    ? new Set(
        String(args[appIdx + 1] || '')
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean)
      )
    : null;

function flagValues(flag) {
  const values = [];
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] !== flag) continue;
    const next = args[index + 1];
    if (!next || next.startsWith('--')) continue;
    values.push(
      ...String(next)
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean)
    );
  }
  return values;
}

const RECEIPT_FILES = flagValues('--receipt');
const RECEIPT_DIRS = flagValues('--receipt-dir');

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function stableJson(value) {
  return JSON.stringify(value, Object.keys(value).sort());
}

function nowIso() {
  return new Date().toISOString();
}

function sourceDescriptor(source = {}) {
  if (source.tool) return `${source.kind}:${source.tool}`;
  if (source.script) return `${source.kind}:${source.script}`;
  if (source.command) return `${source.kind}:${source.command}`;
  if (source.path) return `${source.kind}:${source.path}`;
  return source.kind || 'unknown';
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function getPathValue(value, path) {
  let cursor = value;
  for (const part of path.split('.')) {
    if (!isObject(cursor) || !(part in cursor)) return undefined;
    cursor = cursor[part];
  }
  return cursor;
}

function stringValues(value, paths) {
  const values = [];
  for (const path of paths) {
    const candidate = getPathValue(value, path);
    if (typeof candidate === 'string' && candidate.trim()) {
      values.push(candidate.trim());
    }
  }
  return values;
}

function firstString(value, paths) {
  return stringValues(value, paths)[0];
}

function displayReceiptPath(path) {
  const relativePath = relative(ROOT, path);
  if (relativePath && !relativePath.startsWith('..') && !relativePath.includes(':')) {
    return relativePath.replace(/\\/g, '/');
  }
  return basename(path);
}

function receiptSourceDescriptor(receipt) {
  const source = getPathValue(receipt, 'source');
  if (typeof source === 'string') return source;
  if (isObject(source)) return sourceDescriptor(source);
  const sourceKind = firstString(receipt, ['sourceKind', 'kind', 'source.kind']);
  const tool = firstString(receipt, ['tool', 'mcpTool', 'source.tool', 'result.tool']);
  const script = firstString(receipt, ['script', 'source.script', 'result.script']);
  const command = firstString(receipt, ['command', 'source.command', 'result.command']);
  const path = firstString(receipt, ['path', 'source.path', 'result.path']);
  if (sourceKind) return sourceDescriptor({ kind: sourceKind, tool, script, command, path });
  if (tool) return `mcp-tool:${tool}`;
  if (command) return `ecosystem-command:${command}`;
  if (script) return `repo-command:${script}`;
  if (path) return `runtime-library:${path}`;
  return undefined;
}

function receiptStatus(receipt) {
  if (receipt.ok === true || receipt.success === true) return { category: 'captured', value: 'ok' };
  if (receipt.ok === false || receipt.success === false)
    return { category: 'failed', value: 'failed' };

  const raw = firstString(receipt, [
    'status',
    'state',
    'outcome',
    'result.status',
    'result.state',
    'result.outcome',
    'receipt.status',
    'health.status',
    'evidence.status',
  ]);
  const value = String(raw || '')
    .trim()
    .toLowerCase();
  if (!value) return { category: 'unknown', value: 'unknown' };

  const captured = new Set([
    'captured',
    'success',
    'succeeded',
    'passed',
    'pass',
    'ok',
    'verified',
    'current',
    'live',
    'healthy',
    'connected',
  ]);
  const failed = new Set([
    'failed',
    'fail',
    'error',
    'errored',
    'timeout',
    'timed_out',
    'denied',
    'blocked',
    'refused',
    'stale',
    'invalid',
    'partial',
    'degraded',
    'unhealthy',
    'disconnected',
  ]);

  if (captured.has(value)) return { category: 'captured', value };
  if (failed.has(value)) return { category: 'failed', value };
  return { category: 'unknown', value };
}

function receiptMatchesSignal(receipt, signal) {
  const signalIds = stringValues(receipt, [
    'signalId',
    'signal_id',
    'telemetrySignalId',
    'telemetry_signal_id',
    'telemetry.signalId',
    'signal.id',
    'evidence.signalId',
  ]);
  if (signalIds.includes(signal.id)) return 'signalId';

  const source = signal.source || {};
  const expectedSource = sourceDescriptor(source);
  const receiptSource = receiptSourceDescriptor(receipt);
  if (receiptSource && receiptSource === expectedSource) return 'source';

  if (source.tool) {
    const tools = stringValues(receipt, [
      'tool',
      'mcpTool',
      'source.tool',
      'result.tool',
      'receipt.tool',
      'evidence.tool',
    ]);
    if (tools.includes(source.tool)) return 'tool';
  }

  if (source.script) {
    const scripts = stringValues(receipt, [
      'script',
      'source.script',
      'result.script',
      'receipt.script',
      'evidence.script',
    ]);
    if (scripts.includes(source.script)) return 'script';
  }

  if (source.command) {
    const commands = stringValues(receipt, [
      'command',
      'source.command',
      'result.command',
      'receipt.command',
      'evidence.command',
    ]);
    if (commands.includes(source.command)) return 'command';
  }

  return null;
}

function sanitizeExternalReceipt(
  { body, entryIndex, sha256: receiptSha256, sourcePath },
  matchedBy
) {
  const status = receiptStatus(body);
  const evidence = {
    schema: firstString(body, ['schema', 'receipt.schema']),
    receiptId: firstString(body, ['receiptId', 'id', 'receipt.id', 'result.receiptId']),
    producer: firstString(body, ['producer', 'skill', 'agent', 'source.producer']),
    matchedBy,
    capturedAt: firstString(body, [
      'capturedAt',
      'timestamp',
      'generatedAt',
      'createdAt',
      'receipt.capturedAt',
      'result.capturedAt',
    ]),
    sourceFile: displayReceiptPath(sourcePath),
    entryIndex,
    sourceSha256: receiptSha256,
    status: status.value,
  };
  return Object.fromEntries(Object.entries(evidence).filter(([, value]) => value !== undefined));
}

function externalReceiptCapture(signal, externalReceipts) {
  const matches = [];
  for (const receipt of externalReceipts) {
    const matchedBy = receiptMatchesSignal(receipt.body, signal);
    if (matchedBy) matches.push({ receipt, matchedBy, status: receiptStatus(receipt.body) });
  }

  const captured = matches.find((match) => match.status.category === 'captured');
  if (captured) {
    return {
      status: 'captured',
      evidence: {
        externalReceipt: sanitizeExternalReceipt(captured.receipt, captured.matchedBy),
      },
    };
  }

  const failed = matches.find((match) => match.status.category === 'failed');
  if (failed) {
    return {
      status: 'failed',
      reason: `external receipt status ${failed.status.value}`,
      evidence: {
        externalReceipt: sanitizeExternalReceipt(failed.receipt, failed.matchedBy),
      },
    };
  }

  if (matches.length > 0) {
    const [unknown] = matches;
    return {
      status: 'pending',
      reason: `external receipt matched ${signal.id} but status was not recognized`,
      evidence: {
        externalReceipt: sanitizeExternalReceipt(unknown.receipt, unknown.matchedBy),
      },
    };
  }

  return null;
}

function summarizeOutput(stdout = '', stderr = '') {
  return {
    stdoutBytes: Buffer.byteLength(stdout),
    stderrBytes: Buffer.byteLength(stderr),
    stdoutSha256: sha256(stdout),
    stderrSha256: sha256(stderr),
  };
}

function receiptFileLooksRelevant(path) {
  return /\.(json|jsonl|ndjson)$/i.test(path);
}

function collectReceiptDirFiles(dir, state) {
  if (state.files.length >= MAX_RECEIPT_FILES) return;
  let entries = [];
  try {
    entries = readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name)
    );
  } catch (error) {
    state.errors.push(
      `receipt dir unreadable ${displayReceiptPath(dir)}: ${error instanceof Error ? error.message : String(error)}`
    );
    return;
  }

  for (const entry of entries) {
    if (state.files.length >= MAX_RECEIPT_FILES) {
      state.warnings.push(`receipt file scan capped at ${MAX_RECEIPT_FILES} file(s)`);
      return;
    }
    const entryPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      collectReceiptDirFiles(entryPath, state);
    } else if (entry.isFile() && receiptFileLooksRelevant(entryPath)) {
      state.files.push(entryPath);
    }
  }
}

function expandReceiptPayload(payload) {
  if (Array.isArray(payload)) return payload;
  if (isObject(payload) && Array.isArray(payload.receipts)) return payload.receipts;
  if (isObject(payload) && Array.isArray(payload.entries)) return payload.entries;
  if (isObject(payload)) return [payload];
  return [];
}

function parseReceiptFile(path, text) {
  const trimmed = text.trim();
  if (!trimmed) return [];
  try {
    return expandReceiptPayload(JSON.parse(trimmed));
  } catch (jsonError) {
    const entries = [];
    const lines = trimmed.split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index].trim();
      if (!line) continue;
      try {
        entries.push(JSON.parse(line));
      } catch (lineError) {
        throw new Error(
          `could not parse ${displayReceiptPath(path)} as JSON or NDJSON (line ${index + 1}: ${
            lineError instanceof Error ? lineError.message : String(lineError)
          }; JSON parse: ${jsonError instanceof Error ? jsonError.message : String(jsonError)})`
        );
      }
    }
    return entries;
  }
}

function loadExternalReceipts({ receiptFiles = RECEIPT_FILES, receiptDirs = RECEIPT_DIRS } = {}) {
  const state = {
    requestedFiles: receiptFiles.map((path) => resolve(path)),
    requestedDirs: receiptDirs.map((path) => resolve(path)),
    files: [],
    loaded: [],
    warnings: [],
    errors: [],
  };

  for (const file of state.requestedFiles) {
    state.files.push(file);
  }
  for (const dir of state.requestedDirs) {
    if (!existsSync(dir)) {
      state.errors.push(`receipt dir not found: ${displayReceiptPath(dir)}`);
      continue;
    }
    collectReceiptDirFiles(dir, state);
  }

  const uniqueFiles = [...new Set(state.files)];
  for (const file of uniqueFiles) {
    if (!existsSync(file)) {
      state.errors.push(`receipt file not found: ${displayReceiptPath(file)}`);
      continue;
    }
    let stat;
    try {
      stat = statSync(file);
    } catch (error) {
      state.errors.push(
        `receipt file unreadable ${displayReceiptPath(file)}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      continue;
    }
    if (!stat.isFile()) {
      state.warnings.push(`skipping non-file receipt path: ${displayReceiptPath(file)}`);
      continue;
    }
    if (stat.size > MAX_RECEIPT_BYTES) {
      state.warnings.push(
        `skipping receipt file over ${MAX_RECEIPT_BYTES} bytes: ${displayReceiptPath(file)}`
      );
      continue;
    }

    const text = readFileSync(file, 'utf8');
    const fileSha256 = sha256(text);
    let entries;
    try {
      entries = parseReceiptFile(file, text);
    } catch (error) {
      state.errors.push(error instanceof Error ? error.message : String(error));
      continue;
    }
    for (let entryIndex = 0; entryIndex < entries.length; entryIndex += 1) {
      const body = entries[entryIndex];
      if (!isObject(body)) {
        state.warnings.push(
          `skipping non-object receipt entry ${entryIndex} in ${displayReceiptPath(file)}`
        );
        continue;
      }
      state.loaded.push({
        body,
        entryIndex,
        sha256: fileSha256,
        sourcePath: file,
      });
    }
  }

  return {
    requestedFiles: state.requestedFiles.map(displayReceiptPath),
    requestedDirs: state.requestedDirs.map(displayReceiptPath),
    scannedFiles: uniqueFiles.map(displayReceiptPath),
    loaded: state.loaded,
    warnings: state.warnings,
    errors: state.errors,
  };
}

function corepackInvocation(script) {
  if (process.platform === 'win32') {
    return {
      file: process.env.ComSpec || 'cmd.exe',
      args: ['/d', '/s', '/c', `corepack pnpm run ${script}`],
    };
  }
  return {
    file: 'corepack',
    args: ['pnpm', 'run', script],
  };
}

function appSignals(manifest, app) {
  const byId = new Map((manifest.telemetrySignals || []).map((signal) => [signal.id, signal]));
  return (app.continuousCapability?.telemetrySignalIds || []).map((id) => byId.get(id) || { id });
}

function shouldExecuteSignal(signal) {
  const source = signal.source || {};
  if (source.kind === 'repo-command') {
    return EXECUTE_REPO;
  }
  if (source.kind === 'live-service') {
    return EXECUTE_LIVE;
  }
  return false;
}

async function captureRepoCommand(signal, packageJson) {
  const source = signal.source || {};
  if (!source.script) {
    return {
      status: 'failed',
      reason: 'repo-command source has no script field',
    };
  }
  if (!packageJson.scripts?.[source.script]) {
    return {
      status: 'failed',
      reason: `package.json script not found: ${source.script}`,
    };
  }

  const startedAt = Date.now();
  const invocation = corepackInvocation(source.script);
  try {
    const { stdout, stderr } = await execFileAsync(invocation.file, invocation.args, {
      cwd: ROOT,
      timeout: TIMEOUT_MS,
      windowsHide: true,
      maxBuffer: 1024 * 1024 * 4,
    });
    return {
      status: 'captured',
      durationMs: Date.now() - startedAt,
      command: `corepack pnpm run ${source.script}`,
      exitCode: 0,
      evidence: summarizeOutput(stdout, stderr),
    };
  } catch (error) {
    const stdout = typeof error.stdout === 'string' ? error.stdout : '';
    const stderr = typeof error.stderr === 'string' ? error.stderr : '';
    return {
      status: 'failed',
      durationMs: Date.now() - startedAt,
      command: `corepack pnpm run ${source.script}`,
      exitCode: typeof error.code === 'number' ? error.code : 1,
      reason: error.message,
      evidence: summarizeOutput(stdout, stderr),
    };
  }
}

function extractCurlUrl(command) {
  const match = String(command || '').match(/\bcurl\s+(https?:\/\/\S+)/);
  return match ? match[1].replace(/^['"]|['"]$/g, '') : null;
}

async function captureLiveService(signal) {
  const source = signal.source || {};
  const url = extractCurlUrl(source.command);
  if (!url) {
    return {
      status: 'failed',
      reason: 'live-service source must be a curl URL command',
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const startedAt = Date.now();
  try {
    const response = await fetch(url, { signal: controller.signal });
    const text = await response.text();
    let jsonKeys = [];
    try {
      const parsed = JSON.parse(text);
      jsonKeys = Object.keys(parsed).sort();
    } catch {
      jsonKeys = [];
    }
    return {
      status: response.ok ? 'captured' : 'failed',
      durationMs: Date.now() - startedAt,
      url,
      httpStatus: response.status,
      evidence: {
        bodyBytes: Buffer.byteLength(text),
        bodySha256: sha256(text),
        jsonKeys,
      },
      ...(response.ok ? {} : { reason: `HTTP ${response.status}` }),
    };
  } catch (error) {
    return {
      status: 'failed',
      durationMs: Date.now() - startedAt,
      url,
      reason: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timer);
  }
}

async function captureSignal(signal, packageJson, externalReceipts = []) {
  const source = signal.source || {};
  const base = {
    id: signal.id,
    label: signal.label,
    source: sourceDescriptor(source),
    sourceKind: source.kind || 'unknown',
    requiredFields: signal.requiredFields || [],
    captureCadence: signal.captureCadence,
    retention: signal.retention,
    privacyBoundary: signal.privacyBoundary,
    failureMode: signal.failureMode,
  };

  if (!shouldExecuteSignal(signal)) {
    const externalCapture = externalReceiptCapture(signal, externalReceipts);
    if (externalCapture) {
      return {
        ...base,
        ...externalCapture,
      };
    }
    return {
      ...base,
      status: 'pending',
      reason:
        source.kind === 'repo-command'
          ? 'repo command execution requires --execute-repo'
          : source.kind === 'live-service'
            ? 'live service execution requires --execute-live'
            : `${source.kind || 'unknown'} sources are custody or MCP receipt sources and are not executed by this repo-local runner`,
    };
  }

  const result =
    source.kind === 'repo-command'
      ? await captureRepoCommand(signal, packageJson)
      : await captureLiveService(signal);
  return { ...base, ...result };
}

async function buildReceipt({ manifest, packageJson, manifestPath, externalReceiptIngest }) {
  const externalReceipts = externalReceiptIngest?.loaded || [];
  const selectedApps = (manifest.apps || []).filter(
    (app) => !REQUESTED_APPS || REQUESTED_APPS.has(app.id)
  );
  const unknownApps = REQUESTED_APPS
    ? [...REQUESTED_APPS].filter((id) => !(manifest.apps || []).some((app) => app.id === id))
    : [];
  const appReceipts = [];
  const capturedSignalsById = new Map();

  for (const app of selectedApps) {
    const signals = [];
    for (const signal of appSignals(manifest, app)) {
      if (!capturedSignalsById.has(signal.id)) {
        capturedSignalsById.set(
          signal.id,
          await captureSignal(signal, packageJson, externalReceipts)
        );
      }
      signals.push({ ...capturedSignalsById.get(signal.id) });
    }

    const failed = signals.filter((signal) => signal.status === 'failed');
    const pending = signals.filter((signal) => signal.status === 'pending');
    const status = failed.length > 0 ? 'degraded' : pending.length > 0 ? 'partial' : 'captured';

    appReceipts.push({
      appId: app.id,
      label: app.label,
      hardwareClass: app.hardwareClass,
      captureMode: app.continuousCapability?.captureMode,
      status,
      generatedAt: nowIso(),
      staleAfter: app.continuousCapability?.staleAfter,
      readinessRequires: app.continuousCapability?.readinessRequires || [],
      retentionPolicy: app.continuousCapability?.retentionPolicy,
      privacyBoundary: app.continuousCapability?.privacyBoundary,
      failureResponse: app.continuousCapability?.failureResponse,
      signalSummary: {
        total: signals.length,
        captured: signals.filter((signal) => signal.status === 'captured').length,
        pending: pending.length,
        failed: failed.length,
      },
      degradationReasons: [
        ...failed.map((signal) => `${signal.id}: ${signal.reason || 'failed'}`),
        ...pending.map((signal) => `${signal.id}: ${signal.reason || 'pending'}`),
      ],
      signals,
    });
  }

  const allSignals = appReceipts.flatMap((app) => app.signals);
  return {
    schema: 'holoscript.hardware-telemetry-capture/v1',
    generatedAt: nowIso(),
    runner: {
      script: 'scripts/holo-ci/capture-hardware-telemetry.mjs',
      mode: {
        executeRepo: EXECUTE_REPO,
        executeLive: EXECUTE_LIVE,
        executeMcp: false,
        executeEcosystem: false,
        externalReceipts: externalReceipts.length > 0,
      },
      externalReceiptSchema: EXTERNAL_RECEIPT_SCHEMA,
      externalReceiptIngest: externalReceiptIngest
        ? {
            requestedFiles: externalReceiptIngest.requestedFiles,
            requestedDirs: externalReceiptIngest.requestedDirs,
            scannedFiles: externalReceiptIngest.scannedFiles,
            loadedReceipts: externalReceipts.length,
            warnings: externalReceiptIngest.warnings,
            errors: externalReceiptIngest.errors,
          }
        : {
            requestedFiles: [],
            requestedDirs: [],
            scannedFiles: [],
            loadedReceipts: 0,
            warnings: [],
            errors: [],
          },
    },
    manifest: {
      path: manifestPath,
      schema: manifest.schema,
      sha256: sha256(stableJson(manifest)),
    },
    filters: {
      requestedApps: REQUESTED_APPS ? [...REQUESTED_APPS].sort() : 'all',
      unknownApps,
    },
    summary: {
      apps: appReceipts.length,
      capturedApps: appReceipts.filter((app) => app.status === 'captured').length,
      partialApps: appReceipts.filter((app) => app.status === 'partial').length,
      degradedApps: appReceipts.filter((app) => app.status === 'degraded').length,
      signals: allSignals.length,
      capturedSignals: allSignals.filter((signal) => signal.status === 'captured').length,
      pendingSignals: allSignals.filter((signal) => signal.status === 'pending').length,
      failedSignals: allSignals.filter((signal) => signal.status === 'failed').length,
    },
    appReceipts,
  };
}

function writeOutput(receipt) {
  const outPath = outIdx >= 0 ? resolve(args[outIdx + 1]) : null;
  const payload = `${JSON.stringify(receipt, null, 2)}\n`;
  if (outPath) {
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, payload, 'utf8');
  }
  if (JSON_OUT || !outPath) {
    process.stdout.write(payload);
  } else {
    console.log(
      `[hardware-telemetry] ${receipt.summary.apps} app(s), ${receipt.summary.capturedSignals}/${receipt.summary.signals} signal(s) captured, ${receipt.summary.pendingSignals} pending, ${receipt.summary.failedSignals} failed`
    );
    console.log(`[hardware-telemetry] wrote ${outPath}`);
  }
}

function appendNdjson(receipt) {
  if (ndjsonIdx < 0) return;
  const ndjsonPath = resolve(args[ndjsonIdx + 1]);
  mkdirSync(dirname(ndjsonPath), { recursive: true });
  appendFileSync(ndjsonPath, `${JSON.stringify(receipt)}\n`, 'utf8');
}

async function runSelfTest() {
  const manifest = {
    schema: 'holoscript.hardware-app-envelopes/v1',
    telemetrySignals: [
      {
        id: 'metrics',
        label: 'Metrics',
        source: { kind: 'mcp-tool', tool: 'get_telemetry_metrics' },
        captureCadence: 'on check',
        retention: 'latest',
        privacyBoundary: 'aggregate only',
        requiredFields: ['status'],
        failureMode: 'degrade',
      },
    ],
    apps: [
      {
        id: 'app',
        label: 'App',
        hardwareClass: 'workstation',
        continuousCapability: {
          captureMode: 'test',
          telemetrySignalIds: ['metrics'],
          staleAfter: '24h',
          readinessRequires: ['metrics'],
          retentionPolicy: 'latest',
          privacyBoundary: 'aggregate only',
          failureResponse: 'degrade',
        },
      },
    ],
  };
  const receipt = await buildReceipt({
    manifest,
    packageJson: { scripts: {} },
    manifestPath: '<self-test>',
  });
  const [app] = receipt.appReceipts;
  if (receipt.schema !== 'holoscript.hardware-telemetry-capture/v1') {
    throw new Error('self-test receipt schema mismatch');
  }
  if (!app || app.status !== 'partial' || app.signalSummary.pending !== 1) {
    throw new Error('self-test expected a partial app with one pending signal');
  }
  const externalReceipt = await buildReceipt({
    manifest,
    packageJson: { scripts: {} },
    manifestPath: '<self-test>',
    externalReceiptIngest: {
      requestedFiles: ['<self-test>'],
      requestedDirs: [],
      scannedFiles: ['<self-test>'],
      warnings: [],
      errors: [],
      loaded: [
        {
          body: {
            schema: EXTERNAL_RECEIPT_SCHEMA,
            signalId: 'metrics',
            status: 'success',
            producer: 'self-test',
            capturedAt: nowIso(),
          },
          entryIndex: 0,
          sha256: sha256('self-test'),
          sourcePath: join(ROOT, 'self-test-receipt.json'),
        },
      ],
    },
  });
  const [externalApp] = externalReceipt.appReceipts;
  if (
    !externalApp ||
    externalApp.status !== 'captured' ||
    externalApp.signalSummary.captured !== 1
  ) {
    throw new Error('self-test expected external source receipt to capture the signal');
  }
  console.log('[hardware-telemetry] self-test PASS');
}

async function main() {
  if (SELF_TEST) {
    await runSelfTest();
    return;
  }
  const missing = [
    ['hardware app envelope manifest', MANIFEST],
    ['package.json', PACKAGE_JSON],
  ].filter(([, path]) => !existsSync(path));
  if (missing.length) {
    for (const [label, path] of missing) {
      console.error(`[hardware-telemetry] missing ${label}: ${path}`);
    }
    process.exitCode = 1;
    return;
  }

  const externalReceiptIngest = loadExternalReceipts();
  const receipt = await buildReceipt({
    manifest: readJson(MANIFEST),
    packageJson: readJson(PACKAGE_JSON),
    manifestPath: MANIFEST,
    externalReceiptIngest,
  });
  let lastReceipt = receipt;
  let exitCode =
    receipt.summary.failedSignals > 0 ||
    receipt.filters.unknownApps.length > 0 ||
    externalReceiptIngest.errors.length > 0
      ? 1
      : 0;

  const manifest = readJson(MANIFEST);
  const packageJson = readJson(PACKAGE_JSON);
  const maxIterations = Number.isFinite(ITERATIONS) && ITERATIONS >= 0 ? ITERATIONS : 1;
  const continuous = INTERVAL_MS > 0;
  for (let iteration = 0; maxIterations === 0 || iteration < maxIterations; iteration += 1) {
    const nextExternalReceiptIngest =
      iteration === 0 ? externalReceiptIngest : loadExternalReceipts();
    const nextReceipt =
      iteration === 0
        ? receipt
        : await buildReceipt({
            manifest,
            packageJson,
            manifestPath: MANIFEST,
            externalReceiptIngest: nextExternalReceiptIngest,
          });
    nextReceipt.runner.iteration = {
      index: iteration + 1,
      requestedIterations: maxIterations === 0 ? 'unbounded' : maxIterations,
      intervalMs: INTERVAL_MS,
      continuous,
    };
    appendNdjson(nextReceipt);
    lastReceipt = nextReceipt;
    if (
      nextReceipt.summary.failedSignals > 0 ||
      nextReceipt.filters.unknownApps.length > 0 ||
      nextExternalReceiptIngest.errors.length > 0
    ) {
      exitCode = 1;
    }
    if (continuous && (maxIterations === 0 || iteration + 1 < maxIterations)) {
      await sleep(INTERVAL_MS);
    }
  }

  writeOutput(lastReceipt);
  process.exitCode = exitCode;
}

main().catch((error) => {
  console.error(`[hardware-telemetry] ${error instanceof Error ? error.stack : String(error)}`);
  process.exitCode = 1;
});
