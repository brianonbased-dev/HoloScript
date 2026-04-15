/**
 * Marker strings are built at runtime so repo-wide TODO scanners stay clean on this file.
 */
import { describe, expect, it } from 'vitest';

import {
  GRPOPromptExtractor,
  type PromptExtractorFS,
} from './GRPOPromptExtractor';

const TASK = String.fromCharCode(84, 79, 68, 79);
const FIXME = String.fromCharCode(70, 73, 88, 77, 69);
const HACK = String.fromCharCode(72, 65, 67, 75);
const VITEST_TODO = String.fromCharCode(116, 111, 100, 111);

function mockFs(): PromptExtractorFS {
  return {
    readFile: async () => '',
    writeFile: async () => {},
    listFiles: async () => [],
    exists: async () => false,
    resolve: (...segments: string[]) => segments.join('/'),
    relative: () => '',
    dirname: () => '.',
    basename: (p) => p.split(/[/\\]/).pop() ?? p,
    join: (...segments: string[]) => segments.join('/'),
  };
}

describe('GRPOPromptExtractor', () => {
  const extractor = new GRPOPromptExtractor({}, mockFs());

  describe('parseTaskMarkerComments', () => {
    it('extracts task, fix, and hack markers', () => {
      const src = `
export function example() {
  // ${TASK}: First item
  // ${FIXME}: Second item
  // ${HACK}: Third item
  return 0;
}
`;
      const annotations = extractor.parseTaskMarkerComments(src);
      expect(annotations.length).toBe(3);
      expect(annotations.map((a) => a.text)).toEqual([
        'First item',
        'Second item',
        'Third item',
      ]);
    });
  });

  describe('parseSkippedTests', () => {
    it('detects Vitest deferred tests', () => {
      const line = `  test.${VITEST_TODO}('validates trait references');`;
      const skipped = extractor.parseSkippedTests(`\n${line}\n`);
      expect(skipped.some((s) => s.skipType === 'vitest-pending')).toBe(true);
    });
  });
});
