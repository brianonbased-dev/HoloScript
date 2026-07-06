/**
 * CodebaseSceneCompiler — the projection must carry import EDGES and COMMUNITIES,
 * not just nodes. This is a regression guard for a long-silent bug: import edges
 * used `imp.resolvedPath` which nothing populated, so every file->file dependency
 * dropped (scene.edges = []) and community detection degenerated. The fixtures
 * below deliberately leave `resolvedPath` UNSET and use relative specifiers, so
 * the test also exercises CodebaseGraph's resolution in buildIndexes().
 */
import { describe, it, expect } from 'vitest';
import { CodebaseGraph } from '../CodebaseGraph';
import { CodebaseSceneCompiler } from '../visualization/CodebaseSceneCompiler';
import type { ScannedFile, ExternalSymbolDefinition } from '../types';

const R = 'C:/repo/src';
function sym(name: string, filePath: string, line: number): ExternalSymbolDefinition {
  return {
    name,
    type: 'class',
    visibility: 'public',
    language: 'typescript',
    filePath,
    line,
    signature: `class ${name}`,
    loc: 40,
    lineCount: 40,
  } as ExternalSymbolDefinition;
}
function file(
  path: string,
  symbols: ExternalSymbolDefinition[],
  imports: ScannedFile['imports']
): ScannedFile {
  return { path, language: 'typescript', loc: 80, symbols, imports, calls: [] };
}

function buildGraph(): CodebaseGraph {
  const graph = new CodebaseGraph();
  // Two public symbols per file, so a per-community cap below the total symbol
  // count still has to leave room for every file's representative.
  // types.ts — imported by the others, imports nothing.
  graph.addFile(
    file(`${R}/types.ts`, [sym('Types', `${R}/types.ts`, 1), sym('TypesB', `${R}/types.ts`, 2)], [])
  );
  // main.ts — imports './types' (relative, UNRESOLVED — resolver must map it).
  graph.addFile(
    file(
      `${R}/main.ts`,
      [sym('Main', `${R}/main.ts`, 1), sym('MainB', `${R}/main.ts`, 2)],
      [{ fromFile: `${R}/main.ts`, toModule: './types', namedImports: ['Types'], line: 1 }]
    )
  );
  // util/helper.ts — imports '../types' (parent-relative) + a bare external module.
  graph.addFile(
    file(
      `${R}/util/helper.ts`,
      [sym('Helper', `${R}/util/helper.ts`, 1), sym('HelperB', `${R}/util/helper.ts`, 2)],
      [
        { fromFile: `${R}/util/helper.ts`, toModule: '../types', namedImports: ['Types'], line: 1 },
        {
          fromFile: `${R}/util/helper.ts`,
          toModule: '@holoscript/core',
          namedImports: ['parse'],
          line: 2,
        },
      ]
    )
  );
  graph.buildIndexes();
  return graph;
}

describe('CodebaseSceneCompiler — edges & communities', () => {
  it('populates resolvedPath for relative imports in buildIndexes()', () => {
    const graph = buildGraph();
    const mainImports = graph.getImportsOf(`${R}/main.ts`);
    expect(mainImports[0].resolvedPath).toBe(`${R}/types.ts`);
    const helperImports = graph.getImportsOf(`${R}/util/helper.ts`);
    const rel = helperImports.find((i) => i.toModule === '../types');
    expect(rel?.resolvedPath).toBe(`${R}/types.ts`);
    // Bare external module stays unresolved (no in-graph node).
    const ext = helperImports.find((i) => i.toModule === '@holoscript/core');
    expect(ext?.resolvedPath).toBeUndefined();
  });

  it('emits file->file import edges between representative scene nodes', () => {
    const graph = buildGraph();
    const scene = new CodebaseSceneCompiler().compile(graph, { layout: 'force' });
    expect(scene.objects.length).toBeGreaterThan(0);
    // main->types and helper->types both resolve to real nodes → 2 edges.
    expect(scene.edges.length).toBeGreaterThanOrEqual(2);
    // No edge should point at the unresolved external module.
    expect(scene.edges.every((e) => e.from && e.to)).toBe(true);
  });

  it('every file with a public symbol gets a representative node (round-robin coverage)', () => {
    const graph = buildGraph();
    // Cap = 3 (the file count) but the community holds 6 symbols. A naive
    // slice(0,3) would take types.ts's two symbols + main.ts's first and drop
    // helper.ts entirely; round-robin keeps one per file.
    const scene = new CodebaseSceneCompiler().compile(graph, {
      layout: 'force',
      maxSymbolsPerGroup: 3,
    });
    const files = new Set(scene.objects.map((o) => o.properties?.file));
    expect(files.has(`${R}/types.ts`)).toBe(true);
    expect(files.has(`${R}/main.ts`)).toBe(true);
    expect(files.has(`${R}/util/helper.ts`)).toBe(true);
  });

  it('carries communities in metadata', () => {
    const graph = buildGraph();
    const scene = new CodebaseSceneCompiler().compile(graph, { layout: 'force' });
    expect(scene.metadata.communities.length).toBeGreaterThanOrEqual(1);
  });

  it('keeps object names unique when files expose the same symbol name', () => {
    const graph = new CodebaseGraph();
    graph.addFile(file(`${R}/a.ts`, [sym('parser', `${R}/a.ts`, 1)], []));
    graph.addFile(file(`${R}/b.ts`, [sym('parser', `${R}/b.ts`, 1)], []));
    graph.buildIndexes();

    const scene = new CodebaseSceneCompiler().compile(graph, { layout: 'force' });
    const names = scene.objects.map((object) => object.name);
    expect(names).toHaveLength(2);
    expect(new Set(names).size).toBe(2);
    expect(names.every((name) => name.startsWith('parser__'))).toBe(true);
  });
});
