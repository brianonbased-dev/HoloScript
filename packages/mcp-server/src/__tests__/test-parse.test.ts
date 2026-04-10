import { expect, test } from 'vitest';
import { parseHolo } from '@holoscript/core';

test('debug parseHolo', () => {
  const source = [
    'composition "SocialScene" {',
    '  environment {',
    '    skybox: "gradient"',
    '    ambient_light: 0.6',
    '  }',
    '}',
  ].join('\n');
  const result = parseHolo(source);
  console.log('AST:', JSON.stringify(result.ast, null, 2));
  console.log('ERRORS:', JSON.stringify(result.errors, null, 2));
  expect(result.errors.length).toBe(0);
});
