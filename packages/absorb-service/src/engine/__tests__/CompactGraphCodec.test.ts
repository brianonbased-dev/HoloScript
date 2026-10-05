import { isDeepStrictEqual } from 'node:util';
import { describe, expect, it } from 'vitest';
import { CodebaseGraph } from '../CodebaseGraph';
import { decodeFiles, encodeFiles } from '../CompactGraphCodec';
import type { ScannedFile } from '../types';

function file(path: string, extra: Partial<ScannedFile> = {}): ScannedFile {
  return {
    path,
    language: 'typescript',
    symbols: [
      {
        name: 'alpha',
        type: 'function',
        language: 'typescript',
        visibility: 'public',
        filePath: path,
        line: 1,
        column: 0,
        signature: 'function alpha()',
        isExported: true,
        // Live scanner objects carry undefined fields; JSON omits them.
        owner: undefined,
        docComment: undefined,
      },
      {
        name: 'Beta',
        type: 'class',
        language: 'typescript',
        visibility: 'internal',
        filePath: path,
        line: 5,
        column: 2,
        owner: 'Outer',
        docComment: 'a doc',
      },
    ],
    imports: [{ fromFile: path, toModule: './x', line: 1, namedImports: ['a', 'b'] }],
    calls: [
      { callerId: `${path}:alpha`, calleeName: 'beta', filePath: path, line: 2, column: 4 },
      { callerId: `${path}:Outer.Beta`, calleeName: 'log', calleeOwner: 'console', filePath: path, line: 6, column: 1 },
      { callerId: 'elsewhere.ts:gamma', calleeName: 'alpha', filePath: path, line: 9, column: 0 },
    ],
    loc: 12,
    sizeBytes: 300,
    ...extra,
  } as ScannedFile;
}

describe('CompactGraphCodec', () => {
  it('round-trips files exactly, including absent fields, foreign caller ids and empty lists', () => {
    const files: ScannedFile[] = [
      file('src/a.ts'),
      file('src/b.ts', { docComment: 'file doc', calls: [] }),
      file('src/a.ts:weird.ts'),
      // Rows with different key sets and orders in one table.
      file('src/c.ts', {
        calls: [
          { calleeName: 'x', callerId: 'src/c.ts:y', line: 1, filePath: 'src/c.ts', column: 0 },
          { callerId: 'src/c.ts:z', calleeOwner: 'o', calleeName: 'w', filePath: 'src/c.ts', line: 2, column: 1 },
        ],
      } as Partial<ScannedFile>),
      { path: 'README.md', language: 'plaintext', symbols: [], imports: [], calls: [], loc: 3, sizeBytes: 9 } as ScannedFile,
    ];
    const plain = JSON.parse(JSON.stringify(files));
    const decoded = decodeFiles(JSON.parse(JSON.stringify(encodeFiles(files))));
    expect(decoded.length).toBe(plain.length);
    decoded.forEach((value, i) => expect(isDeepStrictEqual(value, plain[i]), plain[i].path).toBe(true));
    // Byte-identical, key order included: downstream hashes (embedding shards) depend on it.
    expect(JSON.stringify(decoded)).toBe(JSON.stringify(files));
    expect('owner' in decoded[0].symbols[0]).toBe(false);
  });

  it('is much smaller than the plain form when paths and names repeat', () => {
    const files = Array.from({ length: 50 }, (_, i) => file(`packages/core/src/deep/folder/module-${i}.ts`));
    const plain = JSON.stringify(files).length;
    const compact = JSON.stringify(encodeFiles(files)).length;
    expect(compact).toBeLessThan(plain * 0.7);
  });

  it('CodebaseGraph writes v3 and still reads v2 caches', () => {
    const files = [file('src/a.ts'), file('src/b.ts')];
    const graph = new CodebaseGraph();
    graph.buildFromScanResult({
      rootDir: 'src',
      rootDirs: ['src'],
      files,
      stats: {
        totalFiles: 2,
        filesByLanguage: { typescript: 2 },
        totalSymbols: 4,
        symbolsByType: {},
        totalImports: 2,
        totalCalls: 6,
        totalLoc: 24,
        durationMs: 1,
        errors: [],
      },
    });
    const v3 = graph.serialize();
    expect(JSON.parse(v3).version).toBe(3);
    const fromV3 = CodebaseGraph.deserialize(v3);
    expect(fromV3.getStats().totalSymbols).toBe(graph.getStats().totalSymbols);
    expect(fromV3.getCallersOf('beta').length).toBe(graph.getCallersOf('beta').length);

    const v2 = JSON.stringify({ version: 2, rootDir: 'src', files, communities: {} });
    const fromV2 = CodebaseGraph.deserialize(v2);
    expect(fromV2.getStats().totalSymbols).toBe(graph.getStats().totalSymbols);
  });
});
