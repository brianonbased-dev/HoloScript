/**
 * F3: the three headset pages record receipts by POST (token in the
 * x-quest-proof-token header, runId in the query) and no longer use GET ?record=1.
 * Run together with route.capture.test.ts, which drives the same request shape
 * (same-origin, /t/<id>/ and /live/ prefixes) through the route.
 */
import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const SRC = path.resolve(__dirname, '../../../..');
const PAGES = [
  'components/quest/QuestProbe.tsx',
  'app/shared/[id]/ImmersiveViewer.client.tsx',
  'app/quest-probe/page.tsx',
];

describe('headset pages capture by POST', () => {
  for (const rel of PAGES) {
    it(`${rel}: POSTs with the token header and runId query, no GET ?record=1`, () => {
      const src = fs.readFileSync(path.join(SRC, rel), 'utf8');
      expect(src).not.toMatch(/record:\s*'1'|record=1/);
      expect(src).toMatch(/\/api\/quest-proof'\)/);
      expect(src).toMatch(/method:\s*'POST'/);
      expect(src).toContain("'x-quest-proof-token'");
      // (3) token bootstrapped from the link, then stripped from history
      expect(src).toContain('history.replaceState');
      expect(src).toContain("searchParams.delete('proofToken')");
      expect(src).toContain('sessionStorage');
      expect(src).toMatch(/runId:\s*(payload\.runId|runId\(\))\s*\}\)\.toString\(\)/);
    });
  }
});
