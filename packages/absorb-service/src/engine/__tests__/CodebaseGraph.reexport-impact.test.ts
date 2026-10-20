/**
 * A barrel (`index.ts`) that re-exports a file depends on it. Before re-export
 * edges existed, impact analysis stopped at the barrel: a change to a file
 * reached through `export * from './leaf'` reported none of the code — or the
 * tests — that import the barrel (task_1791232117105_b2p1, HoloCI test
 * selection). This scans a real temp tree with the real TypeScript grammar.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { CodebaseScanner } from '../CodebaseScanner';
import { CodebaseGraph } from '../CodebaseGraph';

const roots: string[] = [];

function write(root: string, rel: string, content: string): void {
  const file = path.join(root, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, 'utf-8');
}

describe('impact through re-exporting barrels', () => {
  afterEach(() => {
    for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
  });

  it('reaches importers of a barrel when a re-exported file changes', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'holoscript-reexport-impact-'));
    roots.push(root);
    write(root, 'src/leaf.ts', 'export function leaf(): number {\n  return 1;\n}\n');
    write(root, 'src/named.ts', 'export const named = 2;\n');
    write(root, 'src/index.ts', "export * from './leaf';\nexport { named } from './named';\n");
    write(root, 'src/consumer.ts', "import { leaf } from './index';\nexport const v = leaf();\n");
    write(
      root,
      'src/__tests__/consumer.test.ts',
      "import { v } from '../consumer';\nexport const check = v;\n"
    );
    write(root, 'src/unrelated.ts', 'export const u = 3;\n');

    const scanner = new CodebaseScanner(undefined, false);
    let result;
    try {
      result = await scanner.scan({ rootDir: root });
    } finally {
      await scanner.dispose?.();
    }
    const graph = new CodebaseGraph();
    graph.buildFromScanResult(result);

    const fromLeaf = Array.from(graph.getImpactSet(['src/leaf.ts'])).map((f) =>
      String(f).replace(/\\/g, '/')
    );
    const tail = (f: string) => f.slice(f.indexOf('src/'));
    expect(fromLeaf.map(tail).sort()).toEqual([
      'src/__tests__/consumer.test.ts',
      'src/consumer.ts',
      'src/index.ts',
      'src/leaf.ts',
    ]);

    // Named re-exports are edges too.
    const fromNamed = Array.from(graph.getImpactSet(['src/named.ts'])).map((f) =>
      tail(String(f).replace(/\\/g, '/'))
    );
    expect(fromNamed).toContain('src/index.ts');
    expect(fromNamed).toContain('src/consumer.ts');
  });

  it('resolves NodeNext `.js` specifiers to the .ts source they name', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'holoscript-nodenext-impact-'));
    roots.push(root);
    write(root, 'src/seq.ts', 'export function seq(): number {\n  return 1;\n}\n');
    write(root, 'src/index.ts', "export { seq } from './seq.js';\n");
    write(root, 'src/user.ts', "import { seq } from './index.js';\nexport const s = seq();\n");

    const scanner = new CodebaseScanner(undefined, false);
    let result;
    try {
      result = await scanner.scan({ rootDir: root });
    } finally {
      await scanner.dispose?.();
    }
    const graph = new CodebaseGraph();
    graph.buildFromScanResult(result);
    const reach = Array.from(graph.getImpactSet(['src/seq.ts'])).map((f) => {
      const p = String(f).replace(/\\/g, '/');
      return p.slice(p.indexOf('src/'));
    });
    expect(reach.sort()).toEqual(['src/index.ts', 'src/seq.ts', 'src/user.ts']);
  });
});
