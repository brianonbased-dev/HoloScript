import { describe, expect, it } from 'vitest';
import { handleAbsorbProvenanceTool } from '../absorb-provenance-tools';

describe('absorb_provenance_answer', () => {
  it('returns answer + provenance envelope', async () => {
    const mockRaw = {
      answer: 'The symbol is used in parser.ts and handlers.ts',
      citations: [
        { file: 'src/parser.ts', symbol: 'parse', snippet: 'function parse() {}' },
        { file: 'src/handlers.ts', symbol: 'handle', snippet: 'function handle() {}' },
      ],
    };

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

    const citations = provenance.citations as Array<Record<string, unknown>>;
    expect(citations.length).toBe(2);
    expect(citations[0].file).toBe('src/parser.ts');
  });

  it('is deterministic for same resolver payload', async () => {
    const mockRaw = {
      answer: 'Deterministic answer',
      citations: [{ file: 'a.ts', snippet: 'x' }],
    };

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
