import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, '../..');
const scriptPath = path.join(repoRoot, 'scripts/cael-trace-corpus-exporter.mjs');
const tempDir = mkdtempSync(path.join(tmpdir(), 'hololand-cael-corpus-'));

try {
  const inputPath = path.join(tempDir, 'events.jsonl');
  const outDir = path.join(tempDir, 'corpus');
  const events = [
    {
      eventId: 'e1',
      eventType: 'cael_interaction',
      sessionId: 's1',
      participantId: 'participant-raw',
      worldId: 'central',
      timestamp: '2026-05-14T00:00:00.000Z',
      cael: { goalId: 'locate_portal', action: 'click_portal', confidence: 0.9 },
      target: { objectId: 'BuilderPortal' },
    },
    {
      eventId: 'e2',
      eventType: 'task_completion',
      sessionId: 's1',
      participantId: 'participant-raw',
      worldId: 'central',
      timestamp: '2026-05-14T00:01:00.000Z',
      task: { taskId: 'find_builder_portal', status: 'completed', durationMs: 60000 },
    },
    {
      eventId: 'e3',
      eventType: 'preference',
      sessionId: 's1',
      participantId: 'participant-raw',
      worldId: 'central',
      timestamp: '2026-05-14T00:02:00.000Z',
      preference: { experimentId: 'hud_layout', variant: 'B', choice: 'selected', score: 4 },
    },
    {
      eventId: 'e4',
      eventType: 'composition_trace',
      sessionId: 's1',
      participantId: 'participant-raw',
      worldId: 'central',
      timestamp: '2026-05-14T00:03:00.000Z',
      composition: {
        compositionId: 'main_plaza',
        sourcePath: 'examples/hololand-central/src/zones/main_plaza.hsplus',
        sourceHash: 'abc123',
        command: 'validate_holoscript main_plaza.hsplus',
      },
    },
  ];

  writeFileSync(inputPath, events.map((event) => JSON.stringify(event)).join('\n'));

  const stdout = execFileSync(
    process.execPath,
    [scriptPath, '--input', inputPath, '--out', outDir, '--study-id', 'paper20-cael-smoke'],
    { cwd: repoRoot, encoding: 'utf8' }
  );

  assert.match(stdout, /CAEL trace corpus exported/);
  assert.ok(existsSync(path.join(outDir, 'corpus.json')));
  assert.ok(existsSync(path.join(outDir, 'manifest.json')));

  const corpus = JSON.parse(readFileSync(path.join(outDir, 'corpus.json'), 'utf8'));
  const manifest = JSON.parse(readFileSync(path.join(outDir, 'manifest.json'), 'utf8'));

  assert.equal(corpus.schemaVersion, 'hololand.cael_trace_corpus.v1');
  assert.equal(corpus.studyId, 'paper20-cael-smoke');
  assert.equal(corpus.summary.events, 4);
  assert.equal(corpus.summary.sessions, 1);
  assert.equal(corpus.summary.participants, 1);
  assert.equal(corpus.summary.interactionEvents, 1);
  assert.equal(corpus.summary.taskCompletions, 1);
  assert.equal(corpus.summary.preferenceEvents, 1);
  assert.equal(corpus.summary.compositionTraces, 1);
  assert.deepEqual(corpus.replay.orderedEventIds, ['e1', 'e2', 'e3', 'e4']);
  assert.equal(corpus.sessions[0].metrics.taskCompletionRate, 1);
  assert.notEqual(corpus.sessions[0].participantId, 'participant-raw');
  assert.match(corpus.sessions[0].participantId, /^anon_[0-9a-f]{16}$/);
  assert.equal(manifest.corpusId, corpus.corpusId);
  assert.equal(manifest.replay.eventHash, corpus.replay.eventHash);
  assert.equal(
    corpus.sourceHoloScript,
    'examples/hololand-central/src/evidence/cael-user-study-corpus.hsplus'
  );
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}
