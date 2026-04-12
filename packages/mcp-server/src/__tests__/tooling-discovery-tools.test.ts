import { describe, expect, it } from 'vitest';
import {
  buildToolManifest,
  suggestToolsForGoal,
  handleBatchToolCall,
} from '../tooling-discovery-tools';

describe('tooling discovery and batch dispatch', () => {
  it('builds a tool manifest with inferred output schemas', () => {
    const manifest = buildToolManifest(
      [
        {
          name: 'parse_hs',
          description: 'Parse code into AST',
          inputSchema: { type: 'object', properties: { code: { type: 'string' } }, required: ['code'] },
        },
        {
          name: 'compile_holoscript',
          description: 'Compile HoloScript to targets',
          inputSchema: { type: 'object', properties: { code: { type: 'string' }, target: { type: 'string' } } },
        },
      ] as any,
      { includeInputSchema: true, includeOutputSchema: true }
    );

    expect(manifest.length).toBe(2);
    const parseEntry = manifest.find((t) => t.name === 'parse_hs');
    expect(parseEntry).toBeDefined();
    expect(parseEntry?.outputSchema).toBeDefined();
  });

  it('suggests tool plans for natural language goals', () => {
    const manifest = buildToolManifest(
      [
        { name: 'parse_hs', description: 'Parse HoloScript into AST', inputSchema: { type: 'object' } },
        { name: 'validate_holoscript', description: 'Validate HoloScript syntax', inputSchema: { type: 'object' } },
        { name: 'compile_holoscript', description: 'Compile HoloScript code', inputSchema: { type: 'object' } },
      ] as any,
      { includeInputSchema: false, includeOutputSchema: false }
    );

    const result = suggestToolsForGoal('parse validate and compile this HoloScript scene', manifest, 10);

    expect(result.suggestions.length).toBeGreaterThan(0);
    expect(result.suggestedBundles.some((b) => b.name === 'parse-validate-compile')).toBe(true);
  });

  it('executes batched calls and returns structured per-call results', async () => {
    const payload = await handleBatchToolCall(
      {
        calls: [
          { name: 'parse_hs', args: { code: 'ok' } },
          { name: 'validate_holoscript', args: { code: 'ok' } },
          { name: 'compile_holoscript', args: { code: 'ok', target: 'r3f' } },
        ],
      },
      async (name, args) => ({ name, args, success: true })
    );

    expect(payload.summary.total).toBe(3);
    expect(payload.summary.failed).toBe(0);
    expect(payload.results.every((r) => r.ok)).toBe(true);
    expect(payload.results.map((r) => r.name)).toEqual([
      'parse_hs',
      'validate_holoscript',
      'compile_holoscript',
    ]);
  });
});
