/**
 * HoloLand CAEL Trace Corpus
 *
 * Reviewer-safe evidence export for live HoloLand worlds. The corpus keeps the
 * CAEL discipline (append-only events with prevHash -> hash integrity) while
 * redacting direct participant identifiers before JSONL leaves the runtime.
 */

import { createHash } from 'node:crypto';

export const HOLOLAND_TRACE_CORPUS_SCHEMA = 'hololand.cael-trace-corpus.v1' as const;
export const HOLOLAND_TRACE_EXPORTER = '@holoscript/hololand-platform/evidence' as const;
export const HOLOLAND_TRACE_GENESIS_HASH = 'sha256:genesis' as const;

export type HololandTraceEventType =
  | 'interaction'
  | 'task_completion'
  | 'preference_ab'
  | 'composition_trace';

export type ReviewerSafeJSON =
  | string
  | number
  | boolean
  | null
  | ReviewerSafeJSON[]
  | { [key: string]: ReviewerSafeJSON };

export interface HololandTraceProvenanceInput {
  studyId?: string;
  taskId?: string;
  worldHash?: string;
  compositionHash?: string;
  sourceCaelHash?: string;
  deviceReceiptId?: string;
  notes?: string;
  metadata?: Record<string, unknown>;
}

export interface HololandTraceEventInput {
  eventType: HololandTraceEventType;
  worldId: string;
  sessionId: string;
  timestamp?: string | number | Date;
  subjectId?: string;
  subjectHash?: string;
  caelEventId?: string;
  payload?: Record<string, unknown>;
  provenance?: HololandTraceProvenanceInput;
}

export interface ReviewerSafeTraceProvenance {
  exporter: typeof HOLOLAND_TRACE_EXPORTER;
  exportedAt: string;
  payloadHash: string;
  studyId?: string;
  taskId?: string;
  worldHash?: string;
  compositionHash?: string;
  sourceCaelHash?: string;
  deviceReceiptId?: string;
  notes?: string;
  metadata?: ReviewerSafeJSON;
}

export interface ReviewerSafeTraceEntry {
  schemaVersion: typeof HOLOLAND_TRACE_CORPUS_SCHEMA;
  corpusId: string;
  index: number;
  eventType: HololandTraceEventType;
  timestamp: string;
  worldId: string;
  sessionId: string;
  prevHash: string;
  hash: string;
  payload: Record<string, ReviewerSafeJSON>;
  provenance: ReviewerSafeTraceProvenance;
  subjectHash?: string;
  caelEventId?: string;
}

export interface HololandTraceCorpusOptions {
  corpusId?: string;
  studyId?: string;
  generatedAt?: string | number | Date;
  subjectSalt?: string;
}

export interface HololandTraceCorpusSummary {
  eventCounts: Record<HololandTraceEventType, number>;
  worldIds: string[];
  sessionIds: string[];
  subjectHashes: string[];
  firstTimestamp?: string;
  lastTimestamp?: string;
}

export interface HololandTraceCorpus {
  schemaVersion: typeof HOLOLAND_TRACE_CORPUS_SCHEMA;
  corpusId: string;
  generatedAt: string;
  entries: ReviewerSafeTraceEntry[];
  summary: HololandTraceCorpusSummary;
  finalHash: string;
}

export interface HololandTraceVerification {
  valid: boolean;
  checkedEntries: number;
  finalHash?: string;
  brokenAt?: number;
  reason?: string;
}

export interface LearnedSceneCompositionSignals {
  acceptedTemplateIds: string[];
  rejectedTemplateIds: string[];
  editedObjectTypes: string[];
}

export interface AdaptiveInterfaceGate {
  gateId: string;
  eventType: HololandTraceEventType;
  status: 'pass' | 'review' | 'fail';
  reason: string;
  evidenceHash: string;
}

export interface HololandTraceCorpusIngestion {
  verification: HololandTraceVerification;
  summary: HololandTraceCorpusSummary;
  learnedSceneComposition: LearnedSceneCompositionSignals;
  preferredVariantsByExperiment: Record<string, string>;
  adaptiveInterfaceGates: AdaptiveInterfaceGate[];
}

type EntryWithoutHash = Omit<ReviewerSafeTraceEntry, 'hash'>;

const SENSITIVE_KEY_PATTERNS = [
  /email/,
  /fullname/,
  /displayname/,
  /username/,
  /realname/,
  /^name$/,
  /phone/,
  /address/,
  /ipaddress/,
  /^ip$/,
  /subjectid/,
  /participantid/,
  /userid/,
  /token/,
  /secret/,
  /password/,
  /apikey/,
  /bearer/,
];

const EVENT_TYPES: readonly HololandTraceEventType[] = [
  'interaction',
  'task_completion',
  'preference_ab',
  'composition_trace',
];

export class HololandTraceCorpusExporter {
  private readonly corpusId: string;
  private readonly generatedAt: string;
  private readonly studyId?: string;
  private readonly subjectSalt: string;
  private readonly entries: ReviewerSafeTraceEntry[] = [];
  private lastHash: string = HOLOLAND_TRACE_GENESIS_HASH;

  constructor(options: HololandTraceCorpusOptions = {}) {
    this.generatedAt = normalizeTimestamp(options.generatedAt ?? new Date());
    this.studyId = options.studyId;
    this.corpusId =
      options.corpusId ??
      `hlcorpus_${sha256Hex(`${options.studyId ?? 'study'}:${this.generatedAt}`).slice(0, 16)}`;
    this.subjectSalt = options.subjectSalt ?? `${this.corpusId}:subject-salt`;
  }

  append(event: HololandTraceEventInput): ReviewerSafeTraceEntry {
    assertEventType(event.eventType);
    const timestamp = normalizeTimestamp(event.timestamp ?? this.generatedAt);
    const payload = redactReviewerPayload(event.payload ?? {});
    const provenance = this.buildProvenance(event.provenance, payload);
    const subjectHash =
      event.subjectHash ?? (event.subjectId ? hashReviewerSubject(event.subjectId, this.subjectSalt) : undefined);

    const entryWithoutHash: EntryWithoutHash = {
      schemaVersion: HOLOLAND_TRACE_CORPUS_SCHEMA,
      corpusId: this.corpusId,
      index: this.entries.length,
      eventType: event.eventType,
      timestamp,
      worldId: event.worldId,
      sessionId: event.sessionId,
      prevHash: this.lastHash,
      payload,
      provenance,
      ...(subjectHash ? { subjectHash } : {}),
      ...(event.caelEventId ? { caelEventId: event.caelEventId } : {}),
    };
    const hash = `sha256:${sha256Canonical(entryWithoutHash)}`;
    const entry: ReviewerSafeTraceEntry = { ...entryWithoutHash, hash };
    this.entries.push(entry);
    this.lastHash = hash;
    return cloneEntry(entry);
  }

  appendMany(events: readonly HololandTraceEventInput[]): ReviewerSafeTraceEntry[] {
    return events.map((event) => this.append(event));
  }

  getEntries(): ReviewerSafeTraceEntry[] {
    return this.entries.map(cloneEntry);
  }

  exportCorpus(): HololandTraceCorpus {
    const entries = this.getEntries();
    return {
      schemaVersion: HOLOLAND_TRACE_CORPUS_SCHEMA,
      corpusId: this.corpusId,
      generatedAt: this.generatedAt,
      entries,
      summary: summarizeEntries(entries),
      finalHash: finalCorpusHash(this.corpusId, entries),
    };
  }

  toJSONL(): string {
    return toHololandTraceJSONL(this.entries);
  }

  private buildProvenance(
    input: HololandTraceProvenanceInput | undefined,
    payload: Record<string, ReviewerSafeJSON>,
  ): ReviewerSafeTraceProvenance {
    const metadata = input?.metadata ? redactReviewerValue(input.metadata) : undefined;
    return {
      exporter: HOLOLAND_TRACE_EXPORTER,
      exportedAt: this.generatedAt,
      payloadHash: `sha256:${sha256Canonical(payload)}`,
      ...(this.studyId ? { studyId: this.studyId } : {}),
      ...(input?.studyId ? { studyId: input.studyId } : {}),
      ...(input?.taskId ? { taskId: input.taskId } : {}),
      ...(input?.worldHash ? { worldHash: input.worldHash } : {}),
      ...(input?.compositionHash ? { compositionHash: input.compositionHash } : {}),
      ...(input?.sourceCaelHash ? { sourceCaelHash: input.sourceCaelHash } : {}),
      ...(input?.deviceReceiptId ? { deviceReceiptId: input.deviceReceiptId } : {}),
      ...(input?.notes ? { notes: input.notes } : {}),
      ...(metadata !== undefined ? { metadata } : {}),
    };
  }
}

export function hashReviewerSubject(subjectId: string, salt: string): string {
  return `sha256:${sha256Hex(`${salt}:${subjectId}`)}`;
}

export function redactReviewerPayload(payload: Record<string, unknown>): Record<string, ReviewerSafeJSON> {
  const redacted = redactReviewerValue(payload);
  if (!isReviewerSafeObject(redacted)) {
    return {};
  }
  return redacted;
}

export function exportHololandTraceCorpus(
  events: readonly HololandTraceEventInput[],
  options: HololandTraceCorpusOptions = {},
): HololandTraceCorpus {
  const exporter = new HololandTraceCorpusExporter(options);
  exporter.appendMany(events);
  return exporter.exportCorpus();
}

export function exportHololandTraceJSONL(
  events: readonly HololandTraceEventInput[],
  options: HololandTraceCorpusOptions = {},
): string {
  return toHololandTraceJSONL(exportHololandTraceCorpus(events, options).entries);
}

export function toHololandTraceJSONL(entries: readonly ReviewerSafeTraceEntry[]): string {
  return entries.map((entry) => JSON.stringify(entry)).join('\n');
}

export function parseHololandTraceJSONL(jsonl: string): ReviewerSafeTraceEntry[] {
  const lines = jsonl
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  return lines.map((line, lineIndex) => {
    const parsed = JSON.parse(line) as unknown;
    if (!isReviewerSafeTraceEntry(parsed)) {
      throw new Error(`Invalid HoloLand trace entry at JSONL line ${lineIndex + 1}`);
    }
    return cloneEntry(parsed);
  });
}

export function verifyHololandTraceCorpus(
  entriesOrJsonl: readonly ReviewerSafeTraceEntry[] | string,
): HololandTraceVerification {
  const entries = typeof entriesOrJsonl === 'string' ? parseHololandTraceJSONL(entriesOrJsonl) : entriesOrJsonl;
  let prevHash: string = HOLOLAND_TRACE_GENESIS_HASH;
  let corpusId: string | undefined;

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (entry.schemaVersion !== HOLOLAND_TRACE_CORPUS_SCHEMA) {
      return { valid: false, checkedEntries: i, brokenAt: i, reason: 'schemaVersion mismatch' };
    }
    if (entry.index !== i) {
      return { valid: false, checkedEntries: i, brokenAt: i, reason: `index mismatch at ${i}` };
    }
    if (entry.prevHash !== prevHash) {
      return { valid: false, checkedEntries: i, brokenAt: i, reason: `prevHash mismatch at ${i}` };
    }
    if (corpusId === undefined) {
      corpusId = entry.corpusId;
    } else if (entry.corpusId !== corpusId) {
      return { valid: false, checkedEntries: i, brokenAt: i, reason: `corpusId mismatch at ${i}` };
    }

    const { hash, ...entryWithoutHash } = entry;
    const expected = `sha256:${sha256Canonical(entryWithoutHash)}`;
    if (hash !== expected) {
      return { valid: false, checkedEntries: i, brokenAt: i, reason: `hash mismatch at ${i}` };
    }
    prevHash = hash;
  }

  const finalHash = corpusId ? finalCorpusHash(corpusId, entries) : undefined;
  return {
    valid: true,
    checkedEntries: entries.length,
    ...(finalHash ? { finalHash } : {}),
  };
}

export function ingestHololandTraceCorpus(
  entriesOrJsonl: readonly ReviewerSafeTraceEntry[] | string,
): HololandTraceCorpusIngestion {
  const entries = typeof entriesOrJsonl === 'string' ? parseHololandTraceJSONL(entriesOrJsonl) : entriesOrJsonl.map(cloneEntry);
  const verification = verifyHololandTraceCorpus(entries);
  const learnedSceneComposition: LearnedSceneCompositionSignals = {
    acceptedTemplateIds: [],
    rejectedTemplateIds: [],
    editedObjectTypes: [],
  };
  const preferenceScores = new Map<string, Map<string, number>>();
  const adaptiveInterfaceGates: AdaptiveInterfaceGate[] = [];

  if (!verification.valid) {
    return {
      verification,
      summary: summarizeEntries(entries),
      learnedSceneComposition,
      preferredVariantsByExperiment: {},
      adaptiveInterfaceGates,
    };
  }

  for (const entry of entries) {
    if (entry.eventType === 'task_completion') {
      const taskId = readString(entry.payload, 'taskId') ?? entry.provenance.taskId ?? 'unknown-task';
      const completed = readBoolean(entry.payload, 'completed') ?? readBoolean(entry.payload, 'success');
      adaptiveInterfaceGates.push({
        gateId: `task:${taskId}:completion`,
        eventType: entry.eventType,
        status: completed === true ? 'pass' : completed === false ? 'fail' : 'review',
        reason:
          completed === true
            ? `Task ${taskId} completed in HoloLand trace.`
            : completed === false
              ? `Task ${taskId} failed in HoloLand trace.`
              : `Task ${taskId} completion state needs review.`,
        evidenceHash: entry.hash,
      });
    }

    if (entry.eventType === 'preference_ab') {
      const experimentId = readString(entry.payload, 'experimentId') ?? 'unknown-experiment';
      const variantId = readString(entry.payload, 'variantId') ?? 'unknown-variant';
      const score = preferenceScore(entry.payload);
      const variants = preferenceScores.get(experimentId) ?? new Map<string, number>();
      variants.set(variantId, (variants.get(variantId) ?? 0) + score);
      preferenceScores.set(experimentId, variants);
      adaptiveInterfaceGates.push({
        gateId: `preference:${experimentId}:${variantId}`,
        eventType: entry.eventType,
        status: score > 0 ? 'pass' : score < 0 ? 'fail' : 'review',
        reason: `Preference signal ${score} recorded for ${experimentId}/${variantId}.`,
        evidenceHash: entry.hash,
      });
    }

    if (entry.eventType === 'composition_trace') {
      const templateId = readString(entry.payload, 'templateId');
      const action = readString(entry.payload, 'action');
      const objectType = readString(entry.payload, 'objectType');
      if (templateId && (action === 'accepted' || readBoolean(entry.payload, 'success') === true)) {
        learnedSceneComposition.acceptedTemplateIds.push(templateId);
      }
      if (templateId && action === 'rejected') {
        learnedSceneComposition.rejectedTemplateIds.push(templateId);
      }
      if (objectType && (action === 'accepted' || action === 'edited' || action === 'placed')) {
        learnedSceneComposition.editedObjectTypes.push(objectType);
      }
    }
  }

  return {
    verification,
    summary: summarizeEntries(entries),
    learnedSceneComposition: {
      acceptedTemplateIds: uniqueSorted(learnedSceneComposition.acceptedTemplateIds),
      rejectedTemplateIds: uniqueSorted(learnedSceneComposition.rejectedTemplateIds),
      editedObjectTypes: uniqueSorted(learnedSceneComposition.editedObjectTypes),
    },
    preferredVariantsByExperiment: choosePreferredVariants(preferenceScores),
    adaptiveInterfaceGates,
  };
}

function assertEventType(eventType: string): asserts eventType is HololandTraceEventType {
  if (!EVENT_TYPES.includes(eventType as HololandTraceEventType)) {
    throw new Error(`Unsupported HoloLand trace event type: ${eventType}`);
  }
}

function normalizeTimestamp(input: string | number | Date): string {
  const date = input instanceof Date ? input : new Date(input);
  const time = date.getTime();
  if (!Number.isFinite(time)) {
    throw new Error(`Invalid timestamp: ${String(input)}`);
  }
  return date.toISOString();
}

function redactReviewerValue(value: unknown, keyHint = ''): ReviewerSafeJSON | undefined {
  if (isSensitiveKey(keyHint)) {
    return `[redacted:${keyHint}]`;
  }
  if (value === null) return null;
  if (value === undefined || typeof value === 'function' || typeof value === 'symbol') return undefined;
  if (typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Date) return value.toISOString();

  if (ArrayBuffer.isView(value) && !(value instanceof DataView)) {
    const typed = value as unknown as { length: number; [index: number]: number };
    return Array.from({ length: typed.length }, (_, index) => typed[index]);
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactReviewerValue(item) ?? null);
  }

  if (typeof value === 'object') {
    const out: Record<string, ReviewerSafeJSON> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      const next = redactReviewerValue((value as Record<string, unknown>)[key], key);
      if (next !== undefined) {
        out[key] = next;
      }
    }
    return out;
  }

  return String(value);
}

function isSensitiveKey(key: string): boolean {
  if (!key) return false;
  const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, '');
  return SENSITIVE_KEY_PATTERNS.some((pattern) => pattern.test(normalized));
}

function isReviewerSafeObject(value: ReviewerSafeJSON | undefined): value is Record<string, ReviewerSafeJSON> {
  return value !== undefined && value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isReviewerSafeTraceEntry(value: unknown): value is ReviewerSafeTraceEntry {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Partial<ReviewerSafeTraceEntry>;
  return (
    entry.schemaVersion === HOLOLAND_TRACE_CORPUS_SCHEMA &&
    typeof entry.corpusId === 'string' &&
    typeof entry.index === 'number' &&
    typeof entry.eventType === 'string' &&
    EVENT_TYPES.includes(entry.eventType as HololandTraceEventType) &&
    typeof entry.timestamp === 'string' &&
    typeof entry.worldId === 'string' &&
    typeof entry.sessionId === 'string' &&
    typeof entry.prevHash === 'string' &&
    typeof entry.hash === 'string' &&
    !!entry.payload &&
    typeof entry.payload === 'object' &&
    !Array.isArray(entry.payload) &&
    !!entry.provenance &&
    typeof entry.provenance === 'object'
  );
}

function summarizeEntries(entries: readonly ReviewerSafeTraceEntry[]): HololandTraceCorpusSummary {
  const eventCounts = makeEmptyEventCounts();
  const worldIds = new Set<string>();
  const sessionIds = new Set<string>();
  const subjectHashes = new Set<string>();
  const timestamps: string[] = [];

  for (const entry of entries) {
    eventCounts[entry.eventType] += 1;
    worldIds.add(entry.worldId);
    sessionIds.add(entry.sessionId);
    if (entry.subjectHash) subjectHashes.add(entry.subjectHash);
    timestamps.push(entry.timestamp);
  }

  timestamps.sort();
  return {
    eventCounts,
    worldIds: [...worldIds].sort(),
    sessionIds: [...sessionIds].sort(),
    subjectHashes: [...subjectHashes].sort(),
    ...(timestamps[0] ? { firstTimestamp: timestamps[0] } : {}),
    ...(timestamps[timestamps.length - 1] ? { lastTimestamp: timestamps[timestamps.length - 1] } : {}),
  };
}

function makeEmptyEventCounts(): Record<HololandTraceEventType, number> {
  return {
    interaction: 0,
    task_completion: 0,
    preference_ab: 0,
    composition_trace: 0,
  };
}

function finalCorpusHash(corpusId: string, entries: readonly ReviewerSafeTraceEntry[]): string {
  return `sha256:${sha256Canonical({ corpusId, hashes: entries.map((entry) => entry.hash) })}`;
}

function sha256Canonical(value: unknown): string {
  return sha256Hex(JSON.stringify(canonicalize(value)));
}

function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function canonicalize(value: unknown): ReviewerSafeJSON | undefined {
  if (value === null) return null;
  if (value === undefined || typeof value === 'function' || typeof value === 'symbol') return undefined;
  if (typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map((item) => canonicalize(item) ?? null);

  if (typeof value === 'object') {
    const out: Record<string, ReviewerSafeJSON> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      const next = canonicalize((value as Record<string, unknown>)[key]);
      if (next !== undefined) out[key] = next;
    }
    return out;
  }

  return String(value);
}

function cloneEntry(entry: ReviewerSafeTraceEntry): ReviewerSafeTraceEntry {
  return JSON.parse(JSON.stringify(entry)) as ReviewerSafeTraceEntry;
}

function readString(payload: Record<string, ReviewerSafeJSON>, key: string): string | undefined {
  const value = payload[key];
  return typeof value === 'string' ? value : undefined;
}

function readBoolean(payload: Record<string, ReviewerSafeJSON>, key: string): boolean | undefined {
  const value = payload[key];
  return typeof value === 'boolean' ? value : undefined;
}

function readNumber(payload: Record<string, ReviewerSafeJSON>, key: string): number | undefined {
  const value = payload[key];
  return typeof value === 'number' ? value : undefined;
}

function preferenceScore(payload: Record<string, ReviewerSafeJSON>): number {
  const explicit = readNumber(payload, 'score');
  if (explicit !== undefined) return explicit;
  const preference = readString(payload, 'preference')?.toLowerCase();
  if (preference === 'selected' || preference === 'preferred' || preference === 'win') return 1;
  if (preference === 'rejected' || preference === 'lost') return -1;
  return 0;
}

function choosePreferredVariants(scores: Map<string, Map<string, number>>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [experimentId, variants] of scores) {
    let bestVariant = '';
    let bestScore = Number.NEGATIVE_INFINITY;
    for (const [variantId, score] of variants) {
      if (score > bestScore || (score === bestScore && variantId < bestVariant)) {
        bestVariant = variantId;
        bestScore = score;
      }
    }
    if (bestVariant) out[experimentId] = bestVariant;
  }
  return out;
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}
