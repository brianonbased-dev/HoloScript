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
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
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

function summarizeOutput(stdout = '', stderr = '') {
  return {
    stdoutBytes: Buffer.byteLength(stdout),
    stderrBytes: Buffer.byteLength(stderr),
    stdoutSha256: sha256(stdout),
    stderrSha256: sha256(stderr),
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

async function captureSignal(signal, packageJson) {
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

async function buildReceipt({ manifest, packageJson, manifestPath }) {
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
        capturedSignalsById.set(signal.id, await captureSignal(signal, packageJson));
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

  const receipt = await buildReceipt({
    manifest: readJson(MANIFEST),
    packageJson: readJson(PACKAGE_JSON),
    manifestPath: MANIFEST,
  });
  let lastReceipt = receipt;
  let exitCode =
    receipt.summary.failedSignals > 0 || receipt.filters.unknownApps.length > 0 ? 1 : 0;

  const manifest = readJson(MANIFEST);
  const packageJson = readJson(PACKAGE_JSON);
  const maxIterations = Number.isFinite(ITERATIONS) && ITERATIONS >= 0 ? ITERATIONS : 1;
  const continuous = INTERVAL_MS > 0;
  for (let iteration = 0; maxIterations === 0 || iteration < maxIterations; iteration += 1) {
    const nextReceipt =
      iteration === 0
        ? receipt
        : await buildReceipt({
            manifest,
            packageJson,
            manifestPath: MANIFEST,
          });
    nextReceipt.runner.iteration = {
      index: iteration + 1,
      requestedIterations: maxIterations === 0 ? 'unbounded' : maxIterations,
      intervalMs: INTERVAL_MS,
      continuous,
    };
    appendNdjson(nextReceipt);
    lastReceipt = nextReceipt;
    if (nextReceipt.summary.failedSignals > 0 || nextReceipt.filters.unknownApps.length > 0) {
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
