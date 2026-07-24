import { describe, expect, it } from 'vitest';

import { extractEffectNodes } from '../SafetyDiagnostics';

describe('extractEffectNodes unknown boundary', () => {
  it('returns an empty projection for non-object input', () => {
    expect(extractEffectNodes(undefined)).toEqual([]);
    expect(extractEffectNodes('not-an-ast')).toEqual([]);
  });

  it('skips malformed directive entries while retaining admitted traits', () => {
    const result = extractEffectNodes({
      children: [
        {
          type: 'orb',
          id: 'sensor',
          directives: [null, { type: 'trait', name: 7 }, { type: 'trait', name: 'grabbable' }],
          loc: { start: { line: 'bad', column: 4 } },
        },
      ],
    });

    expect(result).toEqual([
      expect.objectContaining({
        type: 'orb',
        name: 'sensor',
        traits: ['@grabbable'],
        line: undefined,
        column: 4,
      }),
    ]);
  });

  it('bounds cyclic child graphs without duplicating effects', () => {
    const node: Record<string, unknown> = {
      type: 'call_expression',
      name: 'fetchReading',
    };
    node.children = [node];

    const result = extractEffectNodes({ children: [node] });

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      type: 'call_expression',
      calls: ['fetchReading'],
    });
  });
});
