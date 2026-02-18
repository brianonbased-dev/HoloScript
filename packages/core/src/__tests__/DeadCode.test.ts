import { describe, it, expect, beforeEach } from 'vitest';
import { SimpleReferenceGraph } from '../analysis/SimpleReferenceGraph';
import { SimpleReachabilityAnalyzer } from '../analysis/SimpleReachabilityAnalyzer';
import { NoDeadCodeRule } from '../analysis/NoDeadCodeRule';
import type { DeadCodeDiagnostic } from '../analysis/NoDeadCodeRule';

describe('SimpleReferenceGraph', () => {
  let graph: SimpleReferenceGraph;
  beforeEach(() => { graph = new SimpleReferenceGraph(); });

  describe('addNode / getAllNodes', () => {
    it('should add and retrieve a single node', () => {
      graph.addNode({ id: 'comp:main', kind: 'composition', name: 'main', filePath: 'main.holo' });
      const nodes = graph.getAllNodes();
      expect(nodes).toHaveLength(1);
      expect(nodes[0].id).toBe('comp:main');
      expect(nodes[0].kind).toBe('composition');
    });
    it('should add multiple nodes of different kinds', () => {
      graph.addNode({ id: 'comp:scene', kind: 'composition', name: 'scene', filePath: 'a.holo' });
      graph.addNode({ id: 'tmpl:Button', kind: 'template', name: 'Button', filePath: 'b.holo' });
      graph.addNode({ id: 'fn:init', kind: 'function', name: 'init', filePath: 'a.holo', line: 10 });
      expect(graph.getAllNodes()).toHaveLength(3);
    });
    it('should overwrite a node if the same id is added twice', () => {
      graph.addNode({ id: 'comp:main', kind: 'composition', name: 'main', filePath: 'main.holo' });
      graph.addNode({ id: 'comp:main', kind: 'composition', name: 'main_updated', filePath: 'main.holo' });
      expect(graph.getAllNodes()).toHaveLength(1);
      expect(graph.getAllNodes()[0].name).toBe('main_updated');
    });
  });

  describe('addReference / getReferences / getReferencedBy', () => {
    beforeEach(() => {
      graph.addNode({ id: 'comp:scene', kind: 'composition', name: 'scene', filePath: 'scene.holo' });
      graph.addNode({ id: 'tmpl:Button', kind: 'template', name: 'Button', filePath: 'ui.holo' });
      graph.addNode({ id: 'fn:helper', kind: 'function', name: 'helper', filePath: 'util.holo' });
    });
    it('should record an outgoing reference', () => {
      graph.addReference('comp:scene', 'tmpl:Button');
      expect(graph.getReferences('comp:scene')).toContain('tmpl:Button');
    });
    it('should record an incoming reference', () => {
      graph.addReference('comp:scene', 'tmpl:Button');
      expect(graph.getReferencedBy('tmpl:Button')).toContain('comp:scene');
    });
    it('should support multiple references from one node', () => {
      graph.addReference('comp:scene', 'tmpl:Button');
      graph.addReference('comp:scene', 'fn:helper');
      const refs = graph.getReferences('comp:scene');
      expect(refs).toContain('tmpl:Button');
      expect(refs).toContain('fn:helper');
    });
    it('should return empty arrays for nodes with no edges', () => {
      expect(graph.getReferences('comp:scene')).toHaveLength(0);
      expect(graph.getReferencedBy('comp:scene')).toHaveLength(0);
    });
    it('should return empty arrays for unknown ids', () => {
      expect(graph.getReferences('nonexistent')).toHaveLength(0);
      expect(graph.getReferencedBy('nonexistent')).toHaveLength(0);
    });
    it('should not duplicate edges', () => {
      graph.addReference('comp:scene', 'tmpl:Button');
      graph.addReference('comp:scene', 'tmpl:Button');
      const count = graph.getReferences('comp:scene').filter(r => r === 'tmpl:Button').length;
      expect(count).toBe(1);
    });
  });

  describe('getUnreachable', () => {
    it('should return all nodes when no entry points given', () => {
      graph.addNode({ id: 'comp:a', kind: 'composition', name: 'a', filePath: 'a.holo' });
      graph.addNode({ id: 'tmpl:b', kind: 'template', name: 'b', filePath: 'b.holo' });
      expect(graph.getUnreachable([])).toHaveLength(2);
    });
    it('should mark a directly listed entry point as reachable', () => {
      graph.addNode({ id: 'comp:main', kind: 'composition', name: 'main', filePath: 'main.holo' });
      graph.addNode({ id: 'tmpl:unused', kind: 'template', name: 'unused', filePath: 'ui.holo' });
      const ur = graph.getUnreachable(['comp:main']);
      expect(ur.map(n => n.id)).not.toContain('comp:main');
      expect(ur.map(n => n.id)).toContain('tmpl:unused');
    });
    it('should transitively mark referenced nodes as reachable', () => {
      graph.addNode({ id: 'comp:main', kind: 'composition', name: 'main', filePath: 'main.holo' });
      graph.addNode({ id: 'tmpl:Button', kind: 'template', name: 'Button', filePath: 'ui.holo' });
      graph.addNode({ id: 'fn:helper', kind: 'function', name: 'helper', filePath: 'util.holo' });
      graph.addReference('comp:main', 'tmpl:Button');
      graph.addReference('tmpl:Button', 'fn:helper');
      const ur = graph.getUnreachable(['comp:main']).map(n => n.id);
      expect(ur).not.toContain('comp:main');
      expect(ur).not.toContain('tmpl:Button');
      expect(ur).not.toContain('fn:helper');
    });
    it('should detect dead nodes not reachable from entry points', () => {
      graph.addNode({ id: 'comp:main', kind: 'composition', name: 'main', filePath: 'main.holo' });
      graph.addNode({ id: 'tmpl:Dead', kind: 'template', name: 'Dead', filePath: 'dead.holo' });
      graph.addNode({ id: 'fn:orphan', kind: 'function', name: 'orphan', filePath: 'dead.holo' });
      const ur = graph.getUnreachable(['comp:main']).map(n => n.id);
      expect(ur).toContain('tmpl:Dead');
      expect(ur).toContain('fn:orphan');
    });
    it('should handle circular references without infinite loop', () => {
      graph.addNode({ id: 'a', kind: 'composition', name: 'a', filePath: 'a.holo' });
      graph.addNode({ id: 'b', kind: 'composition', name: 'b', filePath: 'b.holo' });
      graph.addNode({ id: 'c', kind: 'composition', name: 'c', filePath: 'c.holo' });
      graph.addReference('a', 'b');
      graph.addReference('b', 'c');
      graph.addReference('c', 'a');
      expect(graph.getUnreachable(['a'])).toHaveLength(0);
    });
    it('should handle an empty graph', () => {
      expect(graph.getUnreachable(['comp:main'])).toHaveLength(0);
    });
    it('should support multiple entry points', () => {
      graph.addNode({ id: 'comp:a', kind: 'composition', name: 'a', filePath: 'a.holo' });
      graph.addNode({ id: 'comp:b', kind: 'composition', name: 'b', filePath: 'b.holo' });
      graph.addNode({ id: 'tmpl:dead', kind: 'template', name: 'dead', filePath: 'c.holo' });
      const ur = graph.getUnreachable(['comp:a', 'comp:b']).map(n => n.id);
      expect(ur).not.toContain('comp:a');
      expect(ur).not.toContain('comp:b');
      expect(ur).toContain('tmpl:dead');
    });
  });
});

describe('SimpleReachabilityAnalyzer', () => {
  let analyzer: SimpleReachabilityAnalyzer;
  beforeEach(() => { analyzer = new SimpleReachabilityAnalyzer(); });

  it('should return zero unreachable for empty input', () => {
    const r = analyzer.analyze({});
    expect(r.totalNodes).toBe(0);
    expect(r.unreachableNodes).toHaveLength(0);
    expect(r.reachableNodes).toBe(0);
  });
  it('should detect a template defined but never referenced', () => {
    const ast = { compositions: [{ name: 'MainScene', filePath: 'main.holo', line: 1 }],
      templates: [{ name: 'UnusedButton', filePath: 'ui.holo', line: 5 }], references: [] };
    const r = analyzer.analyze(ast, ['comp:MainScene']);
    expect(r.totalNodes).toBe(2);
    expect(r.unreachableNodes.map(n => n.name)).toContain('UnusedButton');
  });
  it('should mark a referenced template as reachable', () => {
    const ast = { compositions: [{ name: 'MainScene', filePath: 'main.holo', line: 1 }],
      templates: [{ name: 'UsedButton', filePath: 'ui.holo', line: 5 }],
      references: [{ from: 'comp:MainScene', to: 'tmpl:UsedButton' }] };
    const r = analyzer.analyze(ast, ['comp:MainScene']);
    expect(r.unreachableNodes.map(n => n.name)).not.toContain('UsedButton');
  });
  it('should detect unused compositions not listed as entry points', () => {
    const ast = { compositions: [{ name: 'Main', filePath: 'main.holo', line: 1 },
      { name: 'OrphanScene', filePath: 'orphan.holo', line: 1 }], templates: [], references: [] };
    const r = analyzer.analyze(ast, ['comp:Main']);
    expect(r.unreachableNodes.map(n => n.name)).toContain('OrphanScene');
  });
  it('should default entry points to compositions', () => {
    const ast = { compositions: [{ name: 'Main', filePath: 'main.holo', line: 1 }],
      templates: [{ name: 'Dead', filePath: 'ui.holo', line: 1 }], references: [] };
    const r = analyzer.analyze(ast);
    expect(r.reachableNodes).toBeGreaterThan(0);
  });
  it('should return correct totals', () => {
    const ast = { compositions: [{ name: 'Scene', filePath: 'scene.holo', line: 1 }],
      templates: [{ name: 'T1', filePath: 'ui.holo', line: 1 }, { name: 'T2', filePath: 'ui.holo', line: 10 }],
      references: [{ from: 'comp:Scene', to: 'tmpl:T1' }] };
    const r = analyzer.analyze(ast, ['comp:Scene']);
    expect(r.totalNodes).toBe(3);
    expect(r.reachableNodes + r.unreachableNodes.length).toBe(r.totalNodes);
  });
});

describe('NoDeadCodeRule', () => {
  let rule: NoDeadCodeRule;
  beforeEach(() => { rule = new NoDeadCodeRule(); });

  describe('check - single file', () => {
    it('should return no diagnostics for referenced symbols', () => {
      const files = new Map([['main.holo', 'template "PrimaryButton" {}\ncomposition "MainScene" { orb "b" using "PrimaryButton" {} }']]);
      const d = rule.check(files);
      expect(d.filter(x => x.name === 'PrimaryButton')).toHaveLength(0);
    });
    it('should detect an unused template', () => {
      const files = new Map([['main.holo', 'template "UnusedPanel" {}\ncomposition "Scene" {}']]);
      const d = rule.check(files);
      expect(d.map(x => x.name)).toContain('UnusedPanel');
    });
    it('should detect multiple unused items', () => {
      const files = new Map([['main.holo', 'template "DeadA" {}\ntemplate "DeadB" {}\ncomposition "Scene" {}']]);
      const d = rule.check(files);
      const names = d.map(x => x.name);
      expect(names).toContain('DeadA');
      expect(names).toContain('DeadB');
    });
    it('should not flag composition as dead code', () => {
      const files = new Map([['main.holo', 'composition "MainScene" {}']]);
      const d = rule.check(files);
      expect(d.filter(x => x.kind === 'composition')).toHaveLength(0);
    });
  });

  describe('check - multi-file', () => {
    it('should detect a template used in another file as reachable', () => {
      const files = new Map([['ui.holo', 'template "SharedBtn" {}'],
        ['main.holo', 'composition "Scene" { orb "b" using "SharedBtn" {} }']]);
      const d = rule.check(files);
      expect(d.filter(x => x.name === 'SharedBtn')).toHaveLength(0);
    });
    it('should flag a template unused across all files', () => {
      const files = new Map([['ui.holo', 'template "NeverUsed" {}'],['main.holo', 'composition "Scene" {}']]);
      expect(rule.check(files).map(x => x.name)).toContain('NeverUsed');
    });
    it('should return empty for empty files', () => {
      expect(rule.check(new Map([['empty.holo', '']]))).toHaveLength(0);
    });
    it('should handle an empty file map', () => {
      expect(rule.check(new Map())).toHaveLength(0);
    });
  });

  describe('check - edge cases', () => {
    it('should handle circular references', () => {
      const src = 'composition "Scene" { orb "o" using "A" {} }\ntemplate "A" { orb "x" using "B" {} }\ntemplate "B" { orb "y" using "A" {} }';
      const files = new Map([['main.holo', src]]);
      expect(() => rule.check(files)).not.toThrow();
      const d = rule.check(files);
      const names = d.map(x => x.name);
      expect(names).not.toContain('A');
      expect(names).not.toContain('B');
    });
    it('should include filePath in diagnostics', () => {
      const files = new Map([['components.holo', 'template "Orphan" {}'],['main.holo', 'composition "Scene" {}']]);
      const d = rule.check(files);
      const orphan = d.find(x => x.name === 'Orphan');
      expect(orphan).toBeDefined();
      expect(orphan?.filePath).toBe('components.holo');
    });
    it('should include a non-empty message in diagnostics', () => {
      const files = new Map([['main.holo', 'template "Ghost" {}\ncomposition "Scene" {}']]);
      const d = rule.check(files);
      const ghost = d.find(x => x.name === 'Ghost');
      expect(ghost).toBeDefined();
      expect(ghost?.message.length).toBeGreaterThan(0);
    });
  });

  describe('formatReport', () => {
    it('should return a string', () => {
      expect(typeof rule.formatReport([])).toBe('string');
    });
    it('should indicate no dead code when empty', () => {
      const r = rule.formatReport([]);
      expect(r.toLowerCase()).toMatch(/no dead code|clean|0/);
    });
    it('should include diagnostic names in the report', () => {
      const d: DeadCodeDiagnostic[] = [{ kind: 'template', name: 'DeadTemplate', filePath: 'ui.holo', line: 3, message: 'unused' }];
      expect(rule.formatReport(d)).toContain('DeadTemplate');
    });
    it('should include file path in the report', () => {
      const d: DeadCodeDiagnostic[] = [{ kind: 'function', name: 'orphanFn', filePath: 'utils.holo', message: 'never called' }];
      expect(rule.formatReport(d)).toContain('utils.holo');
    });
    it('should list count of issues', () => {
      const d: DeadCodeDiagnostic[] = [
        { kind: 'template', name: 'A', filePath: 'a.holo', message: 'unused' },
        { kind: 'template', name: 'B', filePath: 'b.holo', message: 'unused' },
      ];
      expect(rule.formatReport(d)).toMatch(/2/);
    });
  });
});
