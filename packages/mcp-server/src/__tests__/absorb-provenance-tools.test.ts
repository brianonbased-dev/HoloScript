import { describe, expect, it, vi, afterEach } from 'vitest';
import { handleAbsorbProvenanceTool } from '../absorb-provenance-tools';

describe('absorb_provenance_answer', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.HOLOMESH_API_KEY;
    delete process.env.HOLOSCRIPT_API_KEY;
    delete process.env.GITHUB_SHA;
  });

  it('returns answer + provenance envelope', async () => {
    const mockRaw = {
      answer: 'The symbol is used in parser.ts and handlers.ts',
      citations: [
        { file: 'src/parser.ts', symbol: 'parse', snippet: 'function parse() {}' },
        { file: 'src/handlers.ts', symbol: 'handle', snippet: 'function handle() {}' },
      ],
    };

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          results: [
            {
              id: 'W.TEST.001',
              content: 'test',
              created_at: new Date().toISOString(),
              metadata: { provenanceHash: 'abc' },
            },
          ],
        }),
      }))
    );
    process.env.HOLOMESH_API_KEY = 'test-key';

    const result = (await handleAbsorbProvenanceTool(
      'absorb_provenance_answer',
      { question: 'Where is parse used?' },
      async () => mockRaw
    )) as Record<string, unknown>;

    expect(result.success).toBe(true);
    expect(result.question).toBe('Where is parse used?');
    expect(result.answer).toBe(mockRaw.answer);

    const provenance = result.provenance as Record<string, unknown>;
    expect(provenance.source).toBe('absorb-service');
    expect(provenance.tool).toBe('holo_ask_codebase');
    expect(typeof provenance.generatedAt).toBe('number');
    expect(typeof provenance.evidenceHash).toBe('string');
    expect(typeof provenance.graphSnapshotId).toBe('string');
    expect(['fresh', 'stale']).toContain(provenance.staleness as string);

    const citations = provenance.citations as Array<Record<string, unknown>>;
    expect(citations.length).toBe(2);
    expect(citations[0].file).toBe('src/parser.ts');
  });

  it('is deterministic for same resolver payload', async () => {
    const mockRaw = {
      answer: 'Deterministic answer',
      citations: [{ file: 'a.ts', snippet: 'x' }],
    };

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          results: [
            {
              id: 'P.X.001',
              created_at: '2026-04-16T12:00:00.000Z',
              metadata: { provenanceHash: 'p1' },
            },
          ],
        }),
      }))
    );
    process.env.HOLOMESH_API_KEY = 'test-key';

    const r1 = (await handleAbsorbProvenanceTool(
      'absorb_provenance_answer',
      { question: 'Q' },
      async () => mockRaw
    )) as Record<string, unknown>;

    const r2 = (await handleAbsorbProvenanceTool(
      'absorb_provenance_answer',
      { question: 'Q' },
      async () => mockRaw
    )) as Record<string, unknown>;

    const p1 = r1.provenance as Record<string, unknown>;
    const p2 = r2.provenance as Record<string, unknown>;
    expect(p1.evidenceHash).toBe(p2.evidenceHash);
    expect(p1.graphSnapshotId).toBe(p2.graphSnapshotId);
  });

  it('returns null for other tool names', async () => {
    const result = await handleAbsorbProvenanceTool('other_tool', { question: 'x' });
    expect(result).toBeNull();
  });

  it('throws when question missing', async () => {
    await expect(
      handleAbsorbProvenanceTool('absorb_provenance_answer', {}, async () => ({}))
    ).rejects.toThrow('question is required');
  });
});
