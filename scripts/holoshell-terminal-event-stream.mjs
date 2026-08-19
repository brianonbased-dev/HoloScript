#!/usr/bin/env node
import crypto from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const STREAM_SCHEMA_VERSION = 'hololand.holoshell.terminal-event-stream.v0.1.0';
export const EVENT_SCHEMA_VERSION = 'hololand.holoshell.terminal-event.v0.1.0';
export const SOURCE_PATH = 'apps/holoshell/source/holoshell-terminal-event-stream.hsplus';
export const ADAPTER_PATH = 'scripts/holoshell-terminal-event-stream.mjs';
export const DEFAULT_RECEIPT_PATH = '.tmp/holoshell/operator-terminal.json';
export const DEFAULT_EVENT_LOG_PATH = '.tmp/holoshell/operator-terminal-events.jsonl';
export const DEFAULT_OUT_PATH = '.tmp/holoshell/operator-terminal-events.json';
export const UPSTREAM_TERMINAL_EVENT_STREAM_SCHEMA =
  'holoscript.holoshell.native-terminal-event-stream.v0.1.0';
export const UPSTREAM_TERMINAL_EVENT_STREAM_SOURCE =
  'experiments/holoshell-human-os-frontier/native-terminal-event-stream.hsplus';
export const UPSTREAM_TERMINAL_EVENT_STREAM_LABEL =
  `HoloScript:${UPSTREAM_TERMINAL_EVENT_STREAM_SOURCE}`;
export const REQUIRED_CAPABILITY_LANE = 'terminal_event_read';
export const REQUIRED_EVENT_KINDS = [
  'run.started',
  'stdout.chunk',
  'stderr.chunk',
  'artifact.detected',
  'approval.required',
  'run.exited',
  'receipt.written',
];

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..');
const HOLOSCRIPT_ROOT = process.env.HOLOSCRIPT_ROOT || path.resolve(REPO_ROOT, '..', 'HoloScript');

function repoPath(filePath) {
  return path.isAbsolute(filePath) ? filePath : path.resolve(REPO_ROOT, filePath);
}

function holoscriptPath(filePath) {
  return path.isAbsolute(filePath) ? filePath : path.resolve(HOLOSCRIPT_ROOT, filePath);
}

function relativeDisplayPath(filePath) {
  return path.isAbsolute(filePath) ? path.relative(REPO_ROOT, filePath).replace(/\\/g, '/') : filePath.replace(/\\/g, '/');
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function readJsonIfPresent(filePath) {
  const absolutePath = repoPath(filePath);
  if (!existsSync(absolutePath)) return null;
  return JSON.parse(readFileSync(absolutePath, 'utf8'));
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function sanitizeSummary(value, fallback) {
  const text = String(value || fallback || '').replace(/\s+/g, ' ').trim();
  return text.slice(0, 220);
}

function eventIdFor(seed) {
  return `ote_${sha256(seed).slice(0, 20)}`;
}

export function upstreamTerminalEventStreamSnapshot() {
  const resolved = holoscriptPath(UPSTREAM_TERMINAL_EVENT_STREAM_SOURCE);
  const present = existsSync(resolved);
  const text = present ? readFileSync(resolved, 'utf8') : '';
  const schemaObserved = text.includes(UPSTREAM_TERMINAL_EVENT_STREAM_SCHEMA);
  const laneObserved = text.includes(`"${REQUIRED_CAPABILITY_LANE}"`);
  const matchedEventKinds = REQUIRED_EVENT_KINDS.filter((kind) => text.includes(`"${kind}"`));
  const missingEventKinds = REQUIRED_EVENT_KINDS.filter((kind) => !matchedEventKinds.includes(kind));
  const ready = present && schemaObserved && laneObserved && missingEventKinds.length === 0;
  return {
    schemaVersion: UPSTREAM_TERMINAL_EVENT_STREAM_SCHEMA,
    source: UPSTREAM_TERMINAL_EVENT_STREAM_LABEL,
    present,
    schemaObserved,
    laneObserved,
    status: ready ? 'ready' : (present ? 'incomplete' : 'missing'),
    requiredCapabilityLane: REQUIRED_CAPABILITY_LANE,
    requiredEventKindCount: REQUIRED_EVENT_KINDS.length,
    matchedEventKindCount: matchedEventKinds.length,
    matchedEventKinds,
    missingEventKinds,
    browserMayConsumeEvents: true,
    browserMayOwnExecution: false,
    receiptRequired: true,
  };
}

export function eventsFromOperatorTerminalReceipt(receipt, {
  sessionId = 'holoshell:unknown',
  sourceReceipt = DEFAULT_RECEIPT_PATH,
} = {}) {
  if (!receipt || receipt.schemaVersion !== 'hololand.holoshell.operator-terminal.v0.1.0') return [];

  const receiptHash = receipt.receipt?.terminalHash || sha256(JSON.stringify(receipt));
  const generatedAt = receipt.generatedAt || new Date().toISOString();
  const base = {
    schemaVersion: EVENT_SCHEMA_VERSION,
    sessionId,
    receiptHash,
    sourceReceipt: relativeDisplayPath(sourceReceipt),
    source: SOURCE_PATH,
    upstreamSource: UPSTREAM_TERMINAL_EVENT_STREAM_LABEL,
    requiredCapabilityLane: REQUIRED_CAPABILITY_LANE,
    generatedAt,
    endpointExecutesCommand: false,
    destructiveActionsTaken: false,
    desktopAutomationExecuted: false,
  };
  const commands = safeArray(receipt.commands?.human);
  const routeStatus = receipt.route?.laptopBridgeStatus || receipt.summary?.status || 'unknown';
  const events = [
    {
      ...base,
      eventId: eventIdFor(`${sessionId}|${receiptHash}|process|0`),
      type: 'process',
      nativeEventKind: 'run.started',
      lifecycle: 'observed',
      severity: routeStatus === 'ready' ? 'info' : 'attention',
      summary: sanitizeSummary(
        `Operator terminal receipt observed for ${receipt.route?.primarySurfaceUrl || 'HoloShell'}; laptop bridge ${routeStatus}.`,
        'Operator terminal receipt observed.'
      ),
      data: {
        primarySurfaceUrl: receipt.route?.primarySurfaceUrl || '',
        laptopBridgeStatus: routeStatus,
        mode: receipt.summary?.mode || 'agent',
      },
    },
    {
      ...base,
      eventId: eventIdFor(`${sessionId}|${receiptHash}|artifact|1`),
      type: 'artifact',
      nativeEventKind: 'receipt.written',
      lifecycle: 'written',
      severity: 'info',
      summary: sanitizeSummary(`Terminal receipt artifact ${String(receiptHash).slice(0, 16)} is available for browser run cards.`),
      artifact: {
        kind: 'operator_terminal_receipt',
        path: relativeDisplayPath(sourceReceipt),
        hash: receiptHash,
      },
    },
    {
      ...base,
      eventId: eventIdFor(`${sessionId}|${receiptHash}|command_catalog|2`),
      type: 'command_catalog',
      nativeEventKind: 'artifact.detected',
      lifecycle: 'catalogued',
      severity: 'info',
      summary: sanitizeSummary(`${commands.length} read-only or consent-gated terminal command route(s) catalogued.`),
      commandCount: commands.length,
      commands: commands.map((command) => ({
        id: command.id || '',
        label: command.label || command.id || 'Terminal action',
        flow: command.flow || 'operator_terminal',
        permissionEnvelope: command.permissionEnvelope || 'read_only_projection',
        approvalRequired: command.approvalRequired ?? 'classified_by_intent',
        receipt: command.receipt || '',
      })),
    },
  ];

  return events;
}

export function readTerminalEventLog(eventLogPath = DEFAULT_EVENT_LOG_PATH, { limit = 100 } = {}) {
  const absolutePath = repoPath(eventLogPath);
  if (!existsSync(absolutePath)) return [];
  return readFileSync(absolutePath, 'utf8')
    .split(/\r?\n/u)
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .slice(-Math.max(1, limit));
}

export function appendTerminalEvents(eventLogPath, events) {
  const absolutePath = repoPath(eventLogPath);
  mkdirSync(path.dirname(absolutePath), { recursive: true });
  const existingIds = new Set(readTerminalEventLog(eventLogPath, { limit: 10_000 }).map((event) => event.eventId));
  const appended = [];
  for (const event of events) {
    if (!event?.eventId || existingIds.has(event.eventId)) continue;
    appendFileSync(absolutePath, `${JSON.stringify(event)}\n`, 'utf8');
    existingIds.add(event.eventId);
    appended.push(event);
  }
  return appended;
}

export function buildTerminalEventStream({
  receiptPath = DEFAULT_RECEIPT_PATH,
  eventLogPath = DEFAULT_EVENT_LOG_PATH,
  sessionId = 'holoshell:unknown',
  append = true,
  limit = 100,
} = {}) {
  const receipt = readJsonIfPresent(receiptPath);
  const upstreamContract = upstreamTerminalEventStreamSnapshot();
  const candidateEvents = eventsFromOperatorTerminalReceipt(receipt, { sessionId, sourceReceipt: receiptPath });
  const appendedEvents = append ? appendTerminalEvents(eventLogPath, candidateEvents) : [];
  const events = readTerminalEventLog(eventLogPath, { limit });
  const latestEvent = events[events.length - 1] || null;
  const latestReceiptHash = latestEvent?.receiptHash || candidateEvents[0]?.receiptHash || '';
  const status = receipt && events.length ? 'ready' : (receipt ? 'awaiting_events' : 'needs_operator_terminal_receipt');

  return {
    schemaVersion: STREAM_SCHEMA_VERSION,
    source: SOURCE_PATH,
    upstreamSource: UPSTREAM_TERMINAL_EVENT_STREAM_LABEL,
    upstreamSchemaVersion: UPSTREAM_TERMINAL_EVENT_STREAM_SCHEMA,
    upstreamContractStatus: upstreamContract.status,
    upstreamContract,
    adapter: ADAPTER_PATH,
    generatedAt: new Date().toISOString(),
    status,
    sessionId,
    appendOnly: true,
    eventLog: relativeDisplayPath(eventLogPath),
    sourceReceipt: relativeDisplayPath(receiptPath),
    eventCount: events.length,
    appendedEventCount: appendedEvents.length,
    latestReceiptHash,
    latestEventId: latestEvent?.eventId || '',
    eventTypes: Array.from(new Set(events.map((event) => event.type))).sort(),
    nativeEventKinds: Array.from(new Set(events.map((event) => event.nativeEventKind).filter(Boolean))).sort(),
    requiredCapabilityLane: REQUIRED_CAPABILITY_LANE,
    requiredEventKinds: REQUIRED_EVENT_KINDS,
    browserRunCardsReady: events.length > 0,
    browserMayConsumeEvents: true,
    browserMayOwnExecution: false,
    endpointExecutesCommand: false,
    destructiveActionsTaken: false,
    desktopAutomationExecuted: false,
    receiptRequired: true,
    events,
  };
}

function parseArgs(argv) {
  const args = {
    receipt: DEFAULT_RECEIPT_PATH,
    eventLog: DEFAULT_EVENT_LOG_PATH,
    out: DEFAULT_OUT_PATH,
    sessionId: process.env.HOLOSHELL_SESSION_ID || 'holoshell:cli',
    json: false,
    check: false,
    noAppend: false,
    limit: 100,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--receipt') args.receipt = argv[++index];
    else if (arg === '--event-log') args.eventLog = argv[++index];
    else if (arg === '--out') args.out = argv[++index];
    else if (arg === '--session-id') args.sessionId = argv[++index];
    else if (arg === '--limit') args.limit = Number(argv[++index] || args.limit);
    else if (arg === '--json') args.json = true;
    else if (arg === '--check') args.check = true;
    else if (arg === '--no-append') args.noAppend = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

export function runTerminalEventStream(rawArgs = process.argv.slice(2)) {
  const args = parseArgs(rawArgs);
  const stream = buildTerminalEventStream({
    receiptPath: args.receipt,
    eventLogPath: args.eventLog,
    sessionId: args.sessionId,
    append: !args.noAppend,
    limit: args.limit,
  });
  const outPath = repoPath(args.out);
  mkdirSync(path.dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(stream, null, 2)}\n`, 'utf8');
  if (args.json) {
    process.stdout.write(`${JSON.stringify(stream, null, 2)}\n`);
  } else {
    process.stdout.write(`${stream.status}: ${stream.eventCount} terminal event(s), ${stream.appendedEventCount} appended\n`);
  }
  if (args.check && stream.status !== 'ready') process.exitCode = 1;
  return stream;
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  try {
    runTerminalEventStream();
  } catch (err) {
    console.error(`holoshell-terminal-event-stream failed: ${err.message}`);
    process.exitCode = 1;
  }
}
