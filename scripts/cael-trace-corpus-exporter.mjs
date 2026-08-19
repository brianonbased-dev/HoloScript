#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCHEMA_VERSION = 'hololand.cael_trace_corpus.v1';
const SOURCE_HOLOSCRIPT = 'examples/hololand-central/src/evidence/cael-user-study-corpus.hsplus';

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function readPath(obj, paths, fallback = undefined) {
  for (const candidate of paths) {
    const value = candidate.split('.').reduce((acc, key) => {
      if (!acc || typeof acc !== 'object') return undefined;
      return acc[key];
    }, obj);
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return fallback;
}

function normalizeEventType(rawType) {
  const value = String(rawType || 'interaction')
    .toLowerCase()
    .replace(/[-\s]/g, '_');
  if (
    [
      'interaction',
      'cael_interaction',
      'world_interaction',
      'user_interaction',
      'click',
      'select',
      'gesture',
      'gaze',
    ].includes(value)
  ) {
    return 'interaction';
  }
  if (['task', 'task_complete', 'task_completed', 'task_completion'].includes(value)) {
    return 'task_completion';
  }
  if (['preference', 'ab_test', 'a_b', 'variant_choice', 'preference_event'].includes(value)) {
    return 'preference';
  }
  if (['composition', 'composition_trace', 'source_trace', 'holo_trace'].includes(value)) {
    return 'composition_trace';
  }
  return value;
}

function normalizeTimestamp(value, index) {
  const date = value ? new Date(value) : new Date(index);
  if (Number.isNaN(date.getTime())) return new Date(index).toISOString();
  return date.toISOString();
}

function normalizeParticipantId(participantId, options) {
  const raw = String(participantId || 'unknown-participant');
  if (options.preserveParticipantIds) return raw;
  const salt = options.redactionSalt || 'hololand-cael-trace-corpus';
  return `anon_${sha256(`${salt}:${raw}`).slice(0, 16)}`;
}

function normalizeEvent(raw, index, options) {
  const eventType = normalizeEventType(
    readPath(raw, ['eventType', 'type', 'kind', 'category'], 'interaction')
  );
  const timestamp = normalizeTimestamp(readPath(raw, ['timestamp', 'ts', 'time']), index);
  const participantId = normalizeParticipantId(
    readPath(raw, ['participantId', 'participant.id', 'userId', 'user.id']),
    options
  );
  const sessionId = String(
    readPath(raw, ['sessionId', 'session.id'], `${participantId}:session:${index}`)
  );
  const worldId = String(readPath(raw, ['worldId', 'world.id', 'world'], 'unknown-world'));
  const task = asObject(raw.task);
  const preference = asObject(raw.preference || raw.abTest);
  const composition = asObject(raw.composition || raw.source || raw.holoscript);
  const eventSeed = {
    eventType,
    timestamp,
    sessionId,
    participantId,
    worldId,
    rawId: readPath(raw, ['eventId', 'id']),
  };
  const eventId = String(
    readPath(raw, ['eventId', 'id'], `event_${sha256(stableJson(eventSeed)).slice(0, 16)}`)
  );

  const taskStatus = readPath(raw, ['task.status', 'status']);
  const taskSuccess =
    typeof task.success === 'boolean'
      ? task.success
      : String(taskStatus || '').toLowerCase() === 'completed' ||
        String(taskStatus || '').toLowerCase() === 'success';

  return {
    eventId,
    eventType,
    timestamp,
    sessionId,
    participantId,
    worldId,
    cael: {
      goalId: readPath(raw, ['cael.goalId', 'goalId'], null),
      action: readPath(raw, ['cael.action', 'action', 'verb'], eventType),
      confidence: Number(readPath(raw, ['cael.confidence', 'confidence'], 1)),
    },
    target: readPath(raw, ['target'], null),
    task:
      eventType === 'task_completion'
        ? {
            taskId: String(readPath(raw, ['task.taskId', 'taskId'], 'unknown-task')),
            status: String(taskStatus || 'completed'),
            durationMs: Number(readPath(raw, ['task.durationMs', 'durationMs'], 0)),
            success: taskSuccess,
          }
        : null,
    preference:
      eventType === 'preference'
        ? {
            experimentId: String(
              readPath(
                raw,
                ['preference.experimentId', 'abTest.experimentId', 'experimentId'],
                'default'
              )
            ),
            variant: String(
              readPath(raw, ['preference.variant', 'abTest.variant', 'variant'], 'A')
            ),
            choice: readPath(raw, ['preference.choice', 'choice'], null),
            score: readPath(raw, ['preference.score', 'score'], null),
          }
        : null,
    composition:
      eventType === 'composition_trace'
        ? {
            compositionId: String(
              readPath(
                raw,
                ['composition.compositionId', 'source.compositionId', 'compositionId'],
                'unknown-composition'
              )
            ),
            sourcePath: readPath(
              raw,
              ['composition.sourcePath', 'source.path', 'sourcePath'],
              null
            ),
            sourceHash: readPath(
              raw,
              ['composition.sourceHash', 'source.hash', 'sourceHash'],
              null
            ),
            command: readPath(raw, ['composition.command', 'command'], null),
            artifactPaths: readPath(raw, ['composition.artifactPaths', 'artifactPaths'], []),
          }
        : null,
    metadata: asObject(raw.metadata),
  };
}

async function loadEvents(inputFile) {
  const raw = await readFile(inputFile, 'utf8');
  const trimmed = raw.trim();
  if (!trimmed) return [];

  if (inputFile.endsWith('.jsonl')) {
    return trimmed
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line, index) => {
        try {
          return JSON.parse(line);
        } catch (error) {
          throw new Error(`${inputFile}:${index + 1}: invalid JSONL event: ${error.message}`);
        }
      });
  }

  const parsed = JSON.parse(trimmed);
  if (Array.isArray(parsed)) return parsed;
  if (Array.isArray(parsed.events)) return parsed.events;
  if (Array.isArray(parsed.sessions))
    return parsed.sessions.flatMap((session) => session.events || []);
  return [parsed];
}

function summarizeSessions(events) {
  const bySession = new Map();

  for (const event of events) {
    if (!bySession.has(event.sessionId)) {
      bySession.set(event.sessionId, {
        sessionId: event.sessionId,
        participantId: event.participantId,
        worldId: event.worldId,
        startedAt: event.timestamp,
        endedAt: event.timestamp,
        events: [],
        metrics: {
          interactionCount: 0,
          taskEvents: 0,
          completedTaskEvents: 0,
          preferenceEvents: 0,
          compositionTraceCount: 0,
          taskCompletionRate: 0,
        },
      });
    }

    const session = bySession.get(event.sessionId);
    session.startedAt = event.timestamp < session.startedAt ? event.timestamp : session.startedAt;
    session.endedAt = event.timestamp > session.endedAt ? event.timestamp : session.endedAt;
    session.events.push(event);

    if (event.eventType === 'interaction') session.metrics.interactionCount++;
    if (event.eventType === 'task_completion') {
      session.metrics.taskEvents++;
      if (event.task?.success) session.metrics.completedTaskEvents++;
    }
    if (event.eventType === 'preference') session.metrics.preferenceEvents++;
    if (event.eventType === 'composition_trace') session.metrics.compositionTraceCount++;
  }

  return [...bySession.values()]
    .map((session) => {
      session.events.sort(compareEvents);
      session.metrics.taskCompletionRate =
        session.metrics.taskEvents === 0
          ? 0
          : Number((session.metrics.completedTaskEvents / session.metrics.taskEvents).toFixed(4));
      return session;
    })
    .sort(
      (a, b) => a.startedAt.localeCompare(b.startedAt) || a.sessionId.localeCompare(b.sessionId)
    );
}

function compareEvents(a, b) {
  return a.timestamp.localeCompare(b.timestamp) || a.eventId.localeCompare(b.eventId);
}

export async function exportTraceCorpus(options) {
  const inputFiles = options.inputFiles || [];
  if (inputFiles.length === 0) throw new Error('At least one --input file is required.');
  if (!options.outDir) throw new Error('--out <dir> is required.');

  const rawEvents = [];
  for (const inputFile of inputFiles) {
    const loaded = await loadEvents(inputFile);
    rawEvents.push(...loaded.map((event) => ({ ...event, __sourceFile: inputFile })));
  }

  const events = rawEvents
    .map((event, index) => normalizeEvent(event, index, options))
    .sort(compareEvents);
  const sessions = summarizeSessions(events);
  const participants = new Set(events.map((event) => event.participantId));
  const worlds = new Set(events.map((event) => event.worldId));
  const eventHash = sha256(stableJson(events));
  const corpusId = `cael_${sha256(`${options.studyId || 'hololand'}:${eventHash}`).slice(0, 16)}`;
  const generatedAt = new Date().toISOString();
  const sourceFiles = inputFiles.map((file) => path.resolve(file));
  const summary = {
    events: events.length,
    sessions: sessions.length,
    participants: participants.size,
    worlds: worlds.size,
    interactionEvents: events.filter((event) => event.eventType === 'interaction').length,
    taskCompletions: events.filter((event) => event.eventType === 'task_completion').length,
    preferenceEvents: events.filter((event) => event.eventType === 'preference').length,
    compositionTraces: events.filter((event) => event.eventType === 'composition_trace').length,
    coverage: {
      hasInteractions: events.some((event) => event.eventType === 'interaction'),
      hasTaskCompletions: events.some((event) => event.eventType === 'task_completion'),
      hasPreferenceEvents: events.some((event) => event.eventType === 'preference'),
      hasCompositionTraces: events.some((event) => event.eventType === 'composition_trace'),
    },
  };

  const corpus = {
    schemaVersion: SCHEMA_VERSION,
    corpusId,
    studyId: options.studyId || 'hololand-cael-study',
    generatedAt,
    privacy: {
      participantIds: options.preserveParticipantIds ? 'preserved' : 'pseudonymous_sha256_16',
    },
    sourceHoloScript: SOURCE_HOLOSCRIPT,
    sourceFiles,
    summary,
    sessions,
    replay: {
      mode: 'ordered_event_replay',
      sort: ['timestamp', 'eventId'],
      orderedEventIds: events.map((event) => event.eventId),
      eventHash,
    },
  };

  const outDir = path.resolve(options.outDir);
  await mkdir(outDir, { recursive: true });
  const corpusPath = path.join(outDir, 'corpus.json');
  const manifestPath = path.join(outDir, 'manifest.json');
  await writeFile(corpusPath, `${JSON.stringify(corpus, null, 2)}\n`);
  await writeFile(
    manifestPath,
    `${JSON.stringify(
      {
        schemaVersion: SCHEMA_VERSION,
        corpusId,
        studyId: corpus.studyId,
        generatedAt,
        sourceHoloScript: SOURCE_HOLOSCRIPT,
        sourceFiles,
        artifacts: {
          corpus: corpusPath,
          manifest: manifestPath,
        },
        replay: corpus.replay,
        summary,
      },
      null,
      2
    )}\n`
  );

  return { corpus, corpusPath, manifestPath };
}

function parseArgs(argv) {
  const options = {
    inputFiles: [],
    outDir: null,
    studyId: 'hololand-cael-study',
    preserveParticipantIds: false,
    redactionSalt: '',
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--input' || arg === '-i') {
      options.inputFiles.push(argv[++i]);
    } else if (arg === '--out' || arg === '-o') {
      options.outDir = argv[++i];
    } else if (arg === '--study-id') {
      options.studyId = argv[++i];
    } else if (arg === '--preserve-participant-ids') {
      options.preserveParticipantIds = true;
    } else if (arg === '--redaction-salt') {
      options.redactionSalt = argv[++i] || '';
    } else if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function usage() {
  return `Usage: node scripts/cael-trace-corpus-exporter.mjs --input events.jsonl --out corpus-dir [--study-id paper20]\n\nInputs may be JSONL, an array JSON file, or a JSON object with an events[] field. Participant IDs are pseudonymized by default.`;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(usage());
    return;
  }

  const { corpus, corpusPath, manifestPath } = await exportTraceCorpus(options);
  console.log(`CAEL trace corpus exported: ${corpusPath}`);
  console.log(`Manifest: ${manifestPath}`);
  console.log(
    `events=${corpus.summary.events} sessions=${corpus.summary.sessions} participants=${corpus.summary.participants} replayHash=${corpus.replay.eventHash.slice(0, 16)}`
  );
}

const isCli = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
