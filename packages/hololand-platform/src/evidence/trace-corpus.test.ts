import { describe, expect, it } from 'vitest';
import {
  exportHololandTraceCorpus,
  exportHololandTraceJSONL,
  ingestHololandTraceCorpus,
  parseHololandTraceJSONL,
  verifyHololandTraceCorpus,
  type HololandTraceEventInput,
  type ReviewerSafeTraceEntry,
} from './trace-corpus';

const FIXED_NOW = '2026-05-14T03:30:00.000Z';

function makeEvents(): HololandTraceEventInput[] {
  return [
    {
      eventType: 'interaction',
      worldId: 'hololand-training-world',
      sessionId: 'session-a',
      subjectId: 'participant-42',
      timestamp: FIXED_NOW,
      caelEventId: 'cael-0',
      payload: {
        action: 'grab',
        objectId: 'block-blue',
        email: 'participant42@example.com',
      },
      provenance: {
        studyId: 'uist-study-1',
        sourceCaelHash: `sha256:${'a'.repeat(64)}`,
      },
    },
    {
      eventType: 'task_completion',
      worldId: 'hololand-training-world',
      sessionId: 'session-a',
      subjectId: 'participant-42',
      timestamp: '2026-05-14T03:31:00.000Z',
      payload: {
        taskId: 'assemble-doorway',
        completed: true,
        durationMs: 42_000,
      },
      provenance: {
        taskId: 'assemble-doorway',
        deviceReceiptId: 'hldev_test',
      },
    },
    {
      eventType: 'preference_ab',
      worldId: 'hololand-training-world',
      sessionId: 'session-a',
      subjectId: 'participant-42',
      timestamp: '2026-05-14T03:32:00.000Z',
      payload: {
        experimentId: 'toolbelt-layout',
        variantId: 'compact-radial',
        preference: 'preferred',
      },
    },
    {
      eventType: 'composition_trace',
      worldId: 'hololand-training-world',
      sessionId: 'session-a',
      subjectId: 'participant-42',
      timestamp: '2026-05-14T03:33:00.000Z',
      payload: {
        templateId: 'training-room-v2',
        action: 'accepted',
        objectType: 'modular-wall',
        success: true,
      },
      provenance: {
        compositionHash: `sha256:${'b'.repeat(64)}`,
      },
    },
  ];
}

describe('HoloLand trace corpus exporter', () => {
  it('emits verifiable JSONL with a SHA-256 hash chain', () => {
    const corpus = exportHololandTraceCorpus(makeEvents(), {
      corpusId: 'corpus-uist-study-1',
      generatedAt: FIXED_NOW,
      subjectSalt: 'reviewer-safe-salt',
    });

    expect(corpus.entries).toHaveLength(4);
    expect(corpus.summary.eventCounts).toEqual({
      interaction: 1,
      task_completion: 1,
      preference_ab: 1,
      composition_trace: 1,
    });
    expect(corpus.entries[0].prevHash).toBe('sha256:genesis');
    expect(corpus.entries[1].prevHash).toBe(corpus.entries[0].hash);
    expect(corpus.finalHash).toMatch(/^sha256:[a-f0-9]{64}$/);

    const jsonl = exportHololandTraceJSONL(makeEvents(), {
      corpusId: 'corpus-uist-study-1',
      generatedAt: FIXED_NOW,
      subjectSalt: 'reviewer-safe-salt',
    });
    const parsed = parseHololandTraceJSONL(jsonl);
    expect(verifyHololandTraceCorpus(parsed)).toMatchObject({
      valid: true,
      checkedEntries: 4,
      finalHash: corpus.finalHash,
    });
  });

  it('rejects tampered payloads without recomputed hashes', () => {
    const corpus = exportHololandTraceCorpus(makeEvents(), {
      corpusId: 'corpus-uist-study-1',
      generatedAt: FIXED_NOW,
      subjectSalt: 'reviewer-safe-salt',
    });
    const tampered = JSON.parse(JSON.stringify(corpus.entries)) as ReviewerSafeTraceEntry[];
    tampered[1].payload.durationMs = 99_999;

    const verification = verifyHololandTraceCorpus(tampered);

    expect(verification.valid).toBe(false);
    expect(verification.brokenAt).toBe(1);
    expect(verification.reason).toContain('hash mismatch');
  });

  it('redacts participant identifiers before JSONL export', () => {
    const jsonl = exportHololandTraceJSONL(
      [
        {
          eventType: 'interaction',
          worldId: 'world-a',
          sessionId: 'session-a',
          subjectId: 'raw-subject-id-123',
          timestamp: FIXED_NOW,
          payload: {
            name: 'Joseph Test',
            email: 'joseph@example.com',
            rawSubjectId: 'raw-subject-id-123',
            nested: {
              ipAddress: '127.0.0.1',
              bearerToken: 'secret-token',
            },
          },
        },
      ],
      {
        corpusId: 'corpus-privacy',
        generatedAt: FIXED_NOW,
        subjectSalt: 'private-salt',
      },
    );

    expect(jsonl).not.toContain('raw-subject-id-123');
    expect(jsonl).not.toContain('Joseph Test');
    expect(jsonl).not.toContain('joseph@example.com');
    expect(jsonl).not.toContain('127.0.0.1');
    expect(jsonl).not.toContain('secret-token');

    const [entry] = parseHololandTraceJSONL(jsonl);
    expect(entry.subjectHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(entry.payload.email).toBe('[redacted:email]');
    expect(entry.payload.name).toBe('[redacted:name]');
  });

  it('ingests task, preference, and composition signals for gates', () => {
    const jsonl = exportHololandTraceJSONL(makeEvents(), {
      corpusId: 'corpus-uist-study-1',
      generatedAt: FIXED_NOW,
      subjectSalt: 'reviewer-safe-salt',
    });

    const ingestion = ingestHololandTraceCorpus(jsonl);

    expect(ingestion.verification.valid).toBe(true);
    expect(ingestion.learnedSceneComposition.acceptedTemplateIds).toEqual([
      'training-room-v2',
    ]);
    expect(ingestion.learnedSceneComposition.editedObjectTypes).toEqual(['modular-wall']);
    expect(ingestion.preferredVariantsByExperiment).toEqual({
      'toolbelt-layout': 'compact-radial',
    });
    expect(ingestion.adaptiveInterfaceGates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          gateId: 'task:assemble-doorway:completion',
          status: 'pass',
        }),
        expect.objectContaining({
          gateId: 'preference:toolbelt-layout:compact-radial',
          status: 'pass',
        }),
      ]),
    );
  });
});
