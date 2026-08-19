#!/usr/bin/env node
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  appendTerminalEvents,
  DEFAULT_EVENT_LOG_PATH,
  EVENT_SCHEMA_VERSION,
  REQUIRED_CAPABILITY_LANE,
  SOURCE_PATH,
  UPSTREAM_TERMINAL_EVENT_STREAM_LABEL,
} from './holoshell-terminal-event-stream.mjs';

export const TERMINAL_RUNNER_SCHEMA_VERSION = 'hololand.holoshell.terminal-runner.v0.1.0';
export const TERMINAL_RUNNER_ADAPTER = 'scripts/holoshell-terminal-runner.mjs';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..');
const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_OUTPUT_LIMIT = 5 * 1024 * 1024;
const DEFAULT_EVENT_TEXT_LIMIT = 4096;

function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function eventIdFor(seed) {
  return `ote_${sha256(seed).slice(0, 20)}`;
}

function relativeDisplayPath(filePath) {
  if (!filePath) return '';
  return path.isAbsolute(filePath)
    ? path.relative(REPO_ROOT, filePath).replace(/\\/g, '/')
    : String(filePath).replace(/\\/g, '/');
}

function cleanText(value, limit = DEFAULT_EVENT_TEXT_LIMIT) {
  return String(value || '')
    .replace(/\u001b\[[0-9;]*m/gu, '')
    .replace(/\r\n/gu, '\n')
    .slice(0, limit);
}

function makeTerminalRunEvent({
  runId,
  sessionId,
  commandId,
  label,
  sourceReceipt,
  nativeEventKind,
  type,
  lifecycle,
  sequence,
  generatedAt,
  severity = 'info',
  summary,
  redactedText = '',
  exitCode = null,
  timedOut = false,
  permissionEnvelope = 'read_only',
}) {
  const eventSeed = [
    sessionId,
    runId,
    nativeEventKind,
    sequence,
    sha256(redactedText).slice(0, 16),
    exitCode ?? '',
    timedOut ? 'timeout' : '',
  ].join('|');
  return {
    schemaVersion: EVENT_SCHEMA_VERSION,
    eventId: eventIdFor(eventSeed),
    runId,
    readOnlyExecutionId: runId,
    sessionId,
    receiptHash: runId,
    sourceReceipt: relativeDisplayPath(sourceReceipt),
    source: SOURCE_PATH,
    upstreamSource: UPSTREAM_TERMINAL_EVENT_STREAM_LABEL,
    requiredCapabilityLane: REQUIRED_CAPABILITY_LANE,
    generatedAt,
    type,
    nativeEventKind,
    lifecycle,
    sequence,
    severity,
    summary,
    commandId,
    label,
    permissionEnvelope,
    redactedText,
    exitCode,
    timedOut,
    endpointExecutesCommand: false,
    endpointExecutesReadOnlyAdapter: true,
    endpointExecutesRawCommand: false,
    browserMayOwnExecution: false,
    browserMayExecuteTerminalCommand: false,
    adapterSpawnedByEndpoint: true,
    rawCommandLineIncluded: false,
    rawSecretsIncluded: false,
    destructiveActionsTaken: false,
    desktopAutomationExecuted: false,
    receiptRequired: true,
  };
}

export async function runTerminalProcessLifecycle({
  executable = process.execPath,
  args = [],
  cwd = REPO_ROOT,
  env = process.env,
  eventLogPath = DEFAULT_EVENT_LOG_PATH,
  sessionId = process.env.HOLOSHELL_SESSION_ID || 'holoshell:cli',
  runId = `otr_${Date.now().toString(36)}`,
  commandId = 'terminal_run',
  label = 'Terminal run',
  sourceReceipt = '',
  timeoutMs = DEFAULT_TIMEOUT_MS,
  outputLimit = DEFAULT_OUTPUT_LIMIT,
  permissionEnvelope = 'read_only',
} = {}) {
  const events = [];
  const startedAt = new Date().toISOString();
  let sequence = 0;
  let stdout = '';
  let stderr = '';
  let stdoutBytes = 0;
  let stderrBytes = 0;
  let stdoutTruncated = false;
  let stderrTruncated = false;
  let timedOut = false;
  let child = null;

  function append(event) {
    events.push(event);
    appendTerminalEvents(eventLogPath, [event]);
  }

  append(makeTerminalRunEvent({
    runId,
    sessionId,
    commandId,
    label,
    sourceReceipt,
    nativeEventKind: 'run.started',
    type: 'process',
    lifecycle: 'started',
    sequence: sequence++,
    generatedAt: startedAt,
    summary: `Read-only native adapter ${label} started.`,
    permissionEnvelope,
  }));

  try {
    child = spawn(executable, args, {
      cwd,
      env,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    const completedAt = new Date().toISOString();
    const stderrText = cleanText(error.message || error);
    append(makeTerminalRunEvent({
      runId,
      sessionId,
      commandId,
      label,
      sourceReceipt,
      nativeEventKind: 'stderr.chunk',
      type: 'stderr',
      lifecycle: 'output',
      sequence: sequence++,
      generatedAt: completedAt,
      severity: 'error',
      summary: `Read-only native adapter ${label} failed to spawn.`,
      redactedText: stderrText,
      permissionEnvelope,
    }));
    append(makeTerminalRunEvent({
      runId,
      sessionId,
      commandId,
      label,
      sourceReceipt,
      nativeEventKind: 'run.exited',
      type: 'exit',
      lifecycle: 'exited',
      sequence: sequence++,
      generatedAt: completedAt,
      severity: 'error',
      summary: `Read-only native adapter ${label} exited before spawn.`,
      exitCode: 1,
      permissionEnvelope,
    }));
    return {
      schemaVersion: TERMINAL_RUNNER_SCHEMA_VERSION,
      adapter: TERMINAL_RUNNER_ADAPTER,
      runId,
      sessionId,
      commandId,
      label,
      status: 'spawn_failed',
      ok: false,
      exitCode: 1,
      signal: null,
      timedOut: false,
      startedAt,
      completedAt,
      eventLog: relativeDisplayPath(eventLogPath),
      eventCount: events.length,
      eventIds: events.map((event) => event.eventId),
      nativeEventKinds: Array.from(new Set(events.map((event) => event.nativeEventKind))).sort(),
      stdout,
      stderr: stderrText,
      stdoutPreview: '',
      stderrPreview: stderrText,
      stdoutTruncated,
      stderrTruncated: false,
      endpointExecutesCommand: false,
      endpointExecutesReadOnlyAdapter: true,
      endpointExecutesRawCommand: false,
      destructiveActionsTaken: false,
      desktopAutomationExecuted: false,
    };
  }

  child.stdout.on('data', (chunk) => {
    const text = cleanText(chunk);
    if (stdoutBytes < outputLimit) {
      const remaining = outputLimit - stdoutBytes;
      stdout += text.slice(0, remaining);
    } else {
      stdoutTruncated = true;
    }
    stdoutBytes += Buffer.byteLength(text, 'utf8');
    if (stdoutBytes > outputLimit) stdoutTruncated = true;
    append(makeTerminalRunEvent({
      runId,
      sessionId,
      commandId,
      label,
      sourceReceipt,
      nativeEventKind: 'stdout.chunk',
      type: 'stdout',
      lifecycle: 'output',
      sequence: sequence++,
      generatedAt: new Date().toISOString(),
      severity: 'info',
      summary: `Read-only native adapter ${label} produced stdout.`,
      redactedText: text,
      permissionEnvelope,
    }));
  });

  child.stderr.on('data', (chunk) => {
    const text = cleanText(chunk);
    if (stderrBytes < outputLimit) {
      const remaining = outputLimit - stderrBytes;
      stderr += text.slice(0, remaining);
    } else {
      stderrTruncated = true;
    }
    stderrBytes += Buffer.byteLength(text, 'utf8');
    if (stderrBytes > outputLimit) stderrTruncated = true;
    append(makeTerminalRunEvent({
      runId,
      sessionId,
      commandId,
      label,
      sourceReceipt,
      nativeEventKind: 'stderr.chunk',
      type: 'stderr',
      lifecycle: 'output',
      sequence: sequence++,
      generatedAt: new Date().toISOString(),
      severity: 'attention',
      summary: `Read-only native adapter ${label} produced stderr.`,
      redactedText: text,
      permissionEnvelope,
    }));
  });

  const timeout = setTimeout(() => {
    timedOut = true;
    child.kill();
  }, Math.max(1, Number(timeoutMs || DEFAULT_TIMEOUT_MS)));

  const { code, signal } = await new Promise((resolve) => {
    child.once('error', (error) => {
      stderr += cleanText(error.message || error);
    });
    child.once('close', (closeCode, closeSignal) => {
      resolve({ code: closeCode, signal: closeSignal });
    });
  });
  clearTimeout(timeout);

  const completedAt = new Date().toISOString();
  const exitCode = Number.isInteger(code) ? code : (timedOut ? 124 : 1);
  const ok = exitCode === 0 && !timedOut;
  append(makeTerminalRunEvent({
    runId,
    sessionId,
    commandId,
    label,
    sourceReceipt,
    nativeEventKind: 'run.exited',
    type: 'exit',
    lifecycle: 'exited',
    sequence: sequence++,
    generatedAt: completedAt,
    severity: ok ? 'info' : 'error',
    summary: `Read-only native adapter ${label} exited with code ${exitCode}.`,
    exitCode,
    timedOut,
    permissionEnvelope,
  }));

  return {
    schemaVersion: TERMINAL_RUNNER_SCHEMA_VERSION,
    adapter: TERMINAL_RUNNER_ADAPTER,
    runId,
    sessionId,
    commandId,
    label,
    status: ok ? 'completed' : (timedOut ? 'timed_out' : 'failed'),
    ok,
    exitCode,
    signal,
    timedOut,
    startedAt,
    completedAt,
    eventLog: relativeDisplayPath(eventLogPath),
    eventCount: events.length,
    eventIds: events.map((event) => event.eventId),
    nativeEventKinds: Array.from(new Set(events.map((event) => event.nativeEventKind))).sort(),
    stdout,
    stderr,
    stdoutPreview: cleanText(stdout, 800),
    stderrPreview: cleanText(stderr, 800),
    stdoutTruncated,
    stderrTruncated,
    endpointExecutesCommand: false,
    endpointExecutesReadOnlyAdapter: true,
    endpointExecutesRawCommand: false,
    destructiveActionsTaken: false,
    desktopAutomationExecuted: false,
  };
}
