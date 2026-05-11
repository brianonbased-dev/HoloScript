import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const globalsPath = fileURLToPath(new URL('../globals.css', import.meta.url));
const globalsCss = readFileSync(globalsPath, 'utf8');

describe('Studio global stylesheet', () => {
  it('keeps mojibake out of shared CSS comments and selectors', () => {
    expect(globalsCss).not.toMatch(/[âÃ�]/);
  });

  it('does not trap all routes with global overflow hidden', () => {
    const bodyBlock = globalsCss.match(/html,\s*body\s*\{([\s\S]*?)\}/);

    expect(bodyBlock?.[1] ?? '').not.toMatch(/overflow\s*:\s*hidden/i);
  });
});
