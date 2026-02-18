import { SimpleReferenceGraph, SimpleGraphNode } from './SimpleReferenceGraph';

export interface SimpleDeadCodeResult {
  unreachableNodes: SimpleGraphNode[];
  totalNodes: number;
  reachableNodes: number;
}
export interface AnalysisAST {
  compositions?: Array<{ name: string; filePath: string; line?: number }>;
  templates?: Array<{ name: string; filePath: string; line?: number }>;
  functions?: Array<{ name: string; filePath: string; line?: number }>;
  references?: Array<{ from: string; to: string }>;
}

export class SimpleReachabilityAnalyzer {
  analyze(ast: AnalysisAST, entryPoints?: string[]): SimpleDeadCodeResult {
    const graph = new SimpleReferenceGraph();
    for (const c of ast.compositions ?? []) {
      graph.addNode({ id: 'comp:' + c.name, kind: 'composition', name: c.name, filePath: c.filePath, line: c.line });
    }
    for (const t of ast.templates ?? []) {
      graph.addNode({ id: 'tmpl:' + t.name, kind: 'template', name: t.name, filePath: t.filePath, line: t.line });
    }
    for (const fn of ast.functions ?? []) {
      graph.addNode({ id: 'fn:' + fn.name, kind: 'function', name: fn.name, filePath: fn.filePath, line: fn.line });
    }
    for (const r of ast.references ?? []) { graph.addReference(r.from, r.to); }
    const eps = entryPoints ?? (ast.compositions ?? []).map(c => 'comp:' + c.name);
    const unreachable = graph.getUnreachable(eps);
    const total = graph.getAllNodes().length;
    return {
      unreachableNodes: unreachable,
      totalNodes: total,
      reachableNodes: total - unreachable.length,
    };
  }
}
