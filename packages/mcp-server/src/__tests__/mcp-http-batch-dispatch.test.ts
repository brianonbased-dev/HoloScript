import { describe, expect, it } from 'vitest';
import { _handleSingleToolLogic } from '../index';

describe('stateless HTTP batch_tool_call dispatch parity', () => {
  it('routes parse, validate, and compile through the full advertised tool registry', async () => {
    const code = 'composition "BatchCanary" { object "Cube" { geometry: "cube" } }';

    const response = await _handleSingleToolLogic('batch_tool_call', {
      calls: [
        { name: 'parse_hs', args: { code } },
        { name: 'validate_holoscript', args: { code } },
        { name: 'compile_holoscript', args: { code, target: 'r3f' } },
      ],
    });

    expect((response as { isError?: boolean }).isError).not.toBe(true);

    const text = (response as { content: Array<{ text: string }> }).content[0].text;
    const payload = JSON.parse(text) as {
      results: Array<{ name: string; ok: boolean; result?: unknown; error?: string }>;
      summary: { total: number; succeeded: number; failed: number };
    };

    expect(payload.summary).toEqual({ total: 3, succeeded: 3, failed: 0, stoppedEarly: false });
    expect(payload.results.map((result) => result.name)).toEqual([
      'parse_hs',
      'validate_holoscript',
      'compile_holoscript',
    ]);
    expect(payload.results.every((result) => result.ok)).toBe(true);
    expect(JSON.stringify(payload.results[2])).not.toContain('Unknown tool');
  });
});
