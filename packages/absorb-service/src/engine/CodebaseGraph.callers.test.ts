import { describe, it, expect } from 'vitest';
import { CodebaseGraph } from './CodebaseGraph';
import type { CallEdge, ExternalSymbolDefinition, ScannedFile } from './types';

function sym(partial: Partial<ExternalSymbolDefinition> & Pick<ExternalSymbolDefinition, 'name' | 'filePath'>): ExternalSymbolDefinition {
  return {
    type: 'function',
    language: 'typescript',
    visibility: 'public',
    line: 1,
    column: 0,
    ...partial,
  };
}

describe('CodebaseGraph.getCallersOf', () => {
  it('does not duplicate edges when resolving unqualified callee', () => {
    const graph = new CodebaseGraph();
    const call: CallEdge = {
      callerId: 'main',
      calleeName: 'foo',
      filePath: '/src/a.ts',
      line: 10,
      column: 4,
    };
    const file: ScannedFile = {
      path: '/src/a.ts',
      language: 'typescript',
      symbols: [sym({ name: 'main', filePath: '/src/a.ts', line: 2, column: 0 })],
      imports: [],
      calls: [call],
      loc: 20,
      sizeBytes: 100,
    };
    graph.addFile(file);
    graph.buildIndexes();

    const callers = graph.getCallersOf('foo');
    expect(callers).toHaveLength(1);
    expect(callers[0].callerId).toBe('main');
  });

  it('dedupes when merging qualified and unqualified callee keys', () => {
    const graph = new CodebaseGraph();
    const edge: CallEdge = {
      callerId: 'main',
      calleeName: 'foo',
      calleeOwner: 'Bar',
      filePath: '/src/a.ts',
      line: 5,
      column: 0,
    };
    const duplicateSame: CallEdge = { ...edge };
    const file: ScannedFile = {
      path: '/src/a.ts',
      language: 'typescript',
      symbols: [sym({ name: 'main', filePath: '/src/a.ts', line: 1, column: 0 })],
      imports: [],
      calls: [edge, duplicateSame],
      loc: 10,
      sizeBytes: 50,
    };
    graph.addFile(file);
    graph.buildIndexes();

    const callers = graph.getCallersOf('foo', 'Bar');
    expect(callers).toHaveLength(1);
  });
});
