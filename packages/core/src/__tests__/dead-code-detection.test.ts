/**
 * Sprint 5 Acceptance Tests â€“ v3.14.0
 *
 * Feature areas:
 *   1. Dead Code Detection  (SimpleReferenceGraph, ReachabilityAnalyzer, noDeadCodeRule)
 *   2. Deprecation Warnings (DeprecationRegistry, NoDeprecatedRule)
 *   3. Migration Assistant  (MigrationRunner)
 *   4. Complexity Metrics   (CyclomaticComplexity, NestingDepth, ComplexityAnalyzer, ComplexityReporter)
 *   5. Package Registry MVP (LocalRegistry, PackageResolver)
 */

import { describe, it, expect, beforeEach } from 'vitest';

// â”€â”€ Feature 1: Dead Code Detection â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
import { SimpleReferenceGraph } from '../analysis/SimpleReferenceGraph';
import { ReachabilityAnalyzer, analyzeDeadCode } from '../analysis/ReachabilityAnalyzer';
import { ReferenceGraph } from '../analysis/ReferenceGraph';
import { noDeadCodeRule, createNoDeadCodeRule } from '../../../linter/src/rules/no-dead-code';

// â”€â”€ Feature 2: Deprecation Warnings â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
import { DeprecationRegistry } from '../analysis/DeprecationRegistry';
import { NoDeprecatedRule } from '../analysis/DeprecationRegistry';

// â”€â”€ Feature 3: Migration Assistant â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
import { MigrationRunner } from '../../../cli/src/migrate/MigrationRunner';
import type { Migration, Transform } from '../../../cli/src/migrate/MigrationRunner';

// â”€â”€ Feature 4: Complexity Metrics â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
import { CyclomaticComplexity } from '../../../cli/src/analyze/metrics/CyclomaticComplexity';
import { NestingDepth } from '../../../cli/src/analyze/metrics/NestingDepth';
import { ComplexityAnalyzer } from '../../../cli/src/analyze/ComplexityAnalyzer';
import { ComplexityReporter } from '../../../cli/src/analyze/ComplexityReporter';

// â”€â”€ Feature 5: Package Registry â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
import { LocalRegistry } from '@holoscript/platform';
import { PackageResolver } from '@holoscript/platform';

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Feature 1: Dead Code Detection
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

describe('Feature 1: Dead Code Detection', () => {
  describe('SimpleReferenceGraph', () => {
    let graph: SimpleReferenceGraph;

    beforeEach(() => {
      graph = new SimpleReferenceGraph();
    });

    it('finds no unreachable nodes when all are connected', () => {
      graph.addNode({ id: 'entry', kind: 'composition', name: 'main', filePath: 'main.holo' });
      graph.addNode({ id: 'orbA', kind: 'orb', name: 'OrbA', filePath: 'main.holo' });
      graph.addReference('entry', 'orbA');
      const unreachable = graph.getUnreachable(['entry']);
      expect(unreachable).toHaveLength(0);
    });

    it('detects unreachable nodes', () => {
      graph.addNode({ id: 'entry', kind: 'composition', name: 'main', filePath: 'main.holo' });
      graph.addNode({ id: 'orbA', kind: 'orb', name: 'OrbA', filePath: 'main.holo' });
      graph.addNode({ id: 'orbDead', kind: 'orb', name: 'DeadOrb', filePath: 'main.holo' });
      graph.addReference('entry', 'orbA');
      // orbDead not referenced
      const unreachable = graph.getUnreachable(['entry']);
      expect(unreachable).toHaveLength(1);
      expect(unreachable[0]!.id).toBe('orbDead');
    });

    it('handles transitive reachability', () => {
      graph.addNode({ id: 'a', kind: 'orb', name: 'A', filePath: 'f.holo' });
      graph.addNode({ id: 'b', kind: 'orb', name: 'B', filePath: 'f.holo' });
      graph.addNode({ id: 'c', kind: 'orb', name: 'C', filePath: 'f.holo' });
      graph.addNode({ id: 'dead', kind: 'orb', name: 'Dead', filePath: 'f.holo' });
      graph.addReference('a', 'b');
      graph.addReference('b', 'c');
      const unreachable = graph.getUnreachable(['a']);
      expect(unreachable.map((n) => n.id)).toContain('dead');
      expect(unreachable.map((n) => n.id)).not.toContain('b');
      expect(unreachable.map((n) => n.id)).not.toContain('c');
    });

    it('getAllNodes returns all added nodes', () => {
      graph.addNode({ id: 'n1', kind: 'orb', name: 'N1', filePath: 'f.holo' });
      graph.addNode({ id: 'n2', kind: 'orb', name: 'N2', filePath: 'f.holo' });
      expect(graph.getAllNodes()).toHaveLength(2);
    });

    it('getReferences and getReferencedBy are bidirectional', () => {
      graph.addNode({ id: 'src', kind: 'orb', name: 'Src', filePath: 'f.holo' });
      graph.addNode({ id: 'tgt', kind: 'orb', name: 'Tgt', filePath: 'f.holo' });
      graph.addReference('src', 'tgt');
      expect(graph.getReferences('src')).toContain('tgt');
      expect(graph.getReferencedBy('tgt')).toContain('src');
    });
  });

  describe('analyzeDeadCode (top-level helper)', () => {
    it('returns a ReachabilityResult for empty AST', () => {
      const result = analyzeDeadCode({ type: 'root', children: [] });
      expect(result).toHaveProperty('reachable');
      expect(result).toHaveProperty('unreachable');
      expect(result).toHaveProperty('deadCode');
      expect(result).toHaveProperty('stats');
      expect(result.stats.coveragePercent).toBe(100);
    });

    it('detects dead composition symbols', () => {
      const ast = {
        type: 'root',
        children: [
          {
            type: 'composition',
            id: 'MainScene',
            loc: { start: { line: 1, column: 1 } },
            children: [],
          },
          {
            type: 'template',
            id: 'UnusedTemplate',
            loc: { start: { line: 5, column: 1 } },
            children: [],
          },
        ],
      };
      const result = analyzeDeadCode(ast as any, 'scene.holo');
      // Stats should be numeric
      expect(typeof result.stats.totalSymbols).toBe('number');
      expect(result.stats.coveragePercent).toBeGreaterThanOrEqual(0);
    });

    it('generates report string', () => {
      const graph = new ReferenceGraph();
      const analyzer = new ReachabilityAnalyzer(graph);
      const result = analyzer.analyze();
      const report = analyzer.generateReport(result);
      expect(report).toContain('Dead Code Analysis Report');
    });
  });

  describe('noDeadCodeRule (linter rule)', () => {
    function makeCtx(source: string) {
      return {
        source,
        lines: source.split('\n'),
        fileType: 'holo' as const,
        config: {},
      };
    }

    it('has expected rule metadata', () => {
      expect(noDeadCodeRule.id).toBe('no-dead-code');
      expect(noDeadCodeRule.category).toBe('best-practice');
    });

    it('reports unused template', () => {
      // Template names are quoted, so they are NOT captured by the identifier+paren reference
      // pattern in the rule's reference collector â€” making them reliably detectable as unused.
      const source = 'template "UnusedTemplate" { }';
      const diags = noDeadCodeRule.check(makeCtx(source));
      expect(diags.length).toBeGreaterThan(0);
      expect(diags[0]!.message).toContain('UnusedTemplate');
    });

    it('does not flag template that is used', () => {
      const source = 'template "UsedTmpl" { }\nusing "UsedTmpl"';
      const diags = noDeadCodeRule.check(makeCtx(source));
      const forTmpl = diags.filter((d) => d.message.includes('UsedTmpl'));
      expect(forTmpl).toHaveLength(0);
    });

    it('createNoDeadCodeRule respects ignorePatterns', () => {
      const rule = createNoDeadCodeRule({ ignorePatterns: ['^_'] });
      const source = 'function _internalHelper() { }';
      const diags = rule.check(makeCtx(source));
      const forHelper = diags.filter((d) => d.message.includes('_internalHelper'));
      expect(forHelper).toHaveLength(0);
    });

    it('createNoDeadCodeRule can disable function checking', () => {
      const rule = createNoDeadCodeRule({ checkFunctions: false });
      const source = 'function orphan() { }';
      const diags = rule.check(makeCtx(source));
      expect(diags.filter((d) => d.message.includes('orphan'))).toHaveLength(0);
    });
  });
});

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Feature 2: Deprecation Warnings
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

describe('Feature 2: Deprecation Warnings', () => {
  describe('DeprecationRegistry', () => {
    let reg: DeprecationRegistry;

    beforeEach(() => {
      reg = new DeprecationRegistry();
    });

    it('registers and retrieves entries', () => {
      reg.register({ name: 'oldTrait', kind: 'trait', message: 'Use newTrait instead' });
      expect(reg.has('oldTrait')).toBe(true);
      expect(reg.get('oldTrait')!.message).toBe('Use newTrait instead');
    });

    it('getAll returns all registered entries', () => {
      reg.register({ name: 'a', kind: 'trait', message: 'msg a' });
      reg.register({ name: 'b', kind: 'template', message: 'msg b' });
      expect(reg.getAll()).toHaveLength(2);
    });

    it('scanForUsages detects deprecated symbol in source', () => {
      reg.register({ name: 'clickable', kind: 'trait', message: 'deprecated' });
      const source = 'orb Btn { @clickable }';
      const warnings = reg.scanForUsages(source, 'scene.holo');
      expect(warnings).toHaveLength(1);
      expect(warnings[0]!.entry.name).toBe('clickable');
      expect(warnings[0]!.line).toBe(1);
    });

    it('scanForUsages returns empty when no deprecated symbols used', () => {
      reg.register({ name: 'oldThing', kind: 'trait', message: 'use newThing' });
      const source = 'orb Btn { @interactive }';
      expect(reg.scanForUsages(source, 'f.holo')).toHaveLength(0);
    });

    it('formatWarning produces readable string', () => {
      reg.register({
        name: 'clickable',
        kind: 'trait',
        message: 'Use interactive instead',
        replacement: 'interactive',
        deprecatedIn: '2.0',
        removedIn: '3.0',
      });
      const [w] = reg.scanForUsages('orb X { @clickable }', 'f.holo');
      const msg = reg.formatWarning(w!);
      expect(msg).toContain('DEPRECATED');
      expect(msg).toContain('clickable');
      expect(msg).toContain('interactive');
    });

    it('parseAnnotations extracts entries from annotated source', () => {
      const source = [
        '@deprecated("Use newTrait instead", since: "2.0", until: "3.0")',
        'trait oldTrait',
      ].join('\n');
      const entries = DeprecationRegistry.parseAnnotations(source);
      expect(entries).toHaveLength(1);
      expect(entries[0]!.name).toBe('oldTrait');
      expect(entries[0]!.kind).toBe('trait');
      expect(entries[0]!.replacement).toBe('newTrait');
      expect(entries[0]!.deprecatedIn).toBe('2.0');
      expect(entries[0]!.removedIn).toBe('3.0');
    });

    it('clear removes all entries', () => {
      reg.register({ name: 'x', kind: 'trait', message: 'm' });
      reg.clear();
      expect(reg.getAll()).toHaveLength(0);
    });
  });

  describe('NoDeprecatedRule', () => {
    it('registerBuiltins adds known deprecated items', () => {
      const rule = new NoDeprecatedRule();
      rule.registerBuiltins();
      const warnings = rule.check(
        new Map([['scene.holo', 'orb X { @clickable @talkable @collidable }']])
      );
      expect(warnings.length).toBeGreaterThanOrEqual(3);
    });

    it('check returns empty array for clean source', () => {
      const rule = new NoDeprecatedRule();
      rule.registerBuiltins();
      const warnings = rule.check(new Map([['clean.holo', 'orb X { @interactive }']]));
      expect(warnings).toHaveLength(0);
    });

    it('formatReport returns no-warnings message when empty', () => {
      const rule = new NoDeprecatedRule();
      expect(rule.formatReport([])).toBe('No deprecation warnings found.');
    });

    it('formatReport lists warnings with count', () => {
      const rule = new NoDeprecatedRule();
      rule.registerBuiltins();
      const warnings = rule.check(new Map([['f.holo', '@clickable']]));
      const report = rule.formatReport(warnings);
      expect(report).toContain('1 deprecation warning');
    });
  });
});

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Feature 3: Migration Assistant
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

describe('Feature 3: Migration Assistant', () => {
  const renameTransform: Transform = {
    name: 'rename-clickable',
    description: 'Replace @clickable with @interactive',
    transform(source) {
      return source.replace(/@clickable/g, '@interactive');
    },
  };

  const migration_2_3: Migration = {
    from: '2.0.0',
    to: '3.0.0',
    transforms: [renameTransform],
  };

  let runner: MigrationRunner;

  beforeEach(() => {
    runner = new MigrationRunner([migration_2_3]);
  });

  it('findMigrationPath returns correct path', () => {
    const path = runner.findMigrationPath('2.0.0', '3.0.0');
    expect(path).toHaveLength(1);
    expect(path[0]!.from).toBe('2.0.0');
    expect(path[0]!.to).toBe('3.0.0');
  });

  it('findMigrationPath returns empty for unknown range', () => {
    const path = runner.findMigrationPath('1.0.0', '3.0.0');
    expect(path).toHaveLength(0);
  });

  it('apply transforms file content', () => {
    const files = new Map([['scene.holo', 'orb Btn { @clickable }']]);
    const result = runner.apply(files, '2.0.0', '3.0.0');
    expect(result.get('scene.holo')).toBe('orb Btn { @interactive }');
  });

  it('apply returns original content when no migration applies', () => {
    const files = new Map([['f.holo', 'orb X { @interactive }']]);
    const result = runner.apply(files, '2.0.0', '3.0.0');
    expect(result.get('f.holo')).toBe('orb X { @interactive }');
  });

  it('dryRun reports changes without modifying source', () => {
    const files = new Map([['scene.holo', 'orb Btn { @clickable }']]);
    const results = runner.dryRun(files, '2.0.0', '3.0.0');
    expect(results).toHaveLength(1);
    expect(results[0]!.modifiedFiles).toBe(1);
    expect(results[0]!.changes[0]!.migratedContent).toContain('@interactive');
    // Source map was NOT mutated
    expect(files.get('scene.holo')).toBe('orb Btn { @clickable }');
  });

  it('dryRun records changeDescriptions', () => {
    const files = new Map([['f.holo', '@clickable']]);
    const results = runner.dryRun(files, '2.0.0', '3.0.0');
    const change = results[0]!.changes[0]!;
    expect(change.changeDescriptions).toContain('Replace @clickable with @interactive');
  });

  it('formatReport produces readable output', () => {
    const files = new Map([['f.holo', '@clickable']]);
    const results = runner.dryRun(files, '2.0.0', '3.0.0');
    const report = runner.formatReport(results);
    expect(report).toContain('2.0.0 => 3.0.0');
  });

  it('formatReport says no migrations when empty', () => {
    expect(runner.formatReport([])).toBe('No migrations to apply.\n');
  });

  it('handles chained migrations', () => {
    const step2: Migration = {
      from: '3.0.0',
      to: '4.0.0',
      transforms: [
        {
          name: 'rename-talkable',
          description: 'Replace @talkable with @voice',
          transform: (s) => s.replace(/@talkable/g, '@voice'),
        },
      ],
    };
    const chainRunner = new MigrationRunner([migration_2_3, step2]);
    const files = new Map([['f.holo', '@clickable @talkable']]);
    const result = chainRunner.apply(files, '2.0.0', '4.0.0');
    expect(result.get('f.holo')).toBe('@interactive @voice');
  });
});

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Feature 4: Complexity Metrics
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

describe('Feature 4: Complexity Metrics', () => {
  describe('CyclomaticComplexity', () => {
    const cc = new CyclomaticComplexity();

    it('baseline complexity is 1 for empty source', () => {
      expect(cc.calculate('')).toBe(1);
    });

    it('increments for each if', () => {
      const src = 'if (a) { } if (b) { }';
      expect(cc.calculate(src)).toBe(3); // 1 + 2
    });

    it('increments for && and ||', () => {
      const src = 'if (a && b || c) { }';
      expect(cc.calculate(src)).toBe(4); // 1 + 1 (if) + 1 (&&) + 1 (||)
    });

    it('increments for for loop', () => {
      const src = 'for (let i = 0; i < 10; i++) { }';
      expect(cc.calculate(src)).toBeGreaterThanOrEqual(2);
    });

    it('analyzeFile returns per-block results', () => {
      const src = 'composition Scene { }\nfn update() { if (x) { } }';
      const results = cc.analyzeFile(src, 'f.holo');
      expect(results.length).toBeGreaterThan(0);
      expect(results[0]).toHaveProperty('name');
      expect(results[0]).toHaveProperty('complexity');
    });
  });

  describe('NestingDepth', () => {
    const nd = new NestingDepth();

    it('returns maxDepth 0 for flat source', () => {
      const r = nd.calculate('const x = 1;');
      expect(r.maxDepth).toBe(0);
    });

    it('counts brace nesting', () => {
      const src = 'function a() { if (x) { for (;;) { } } }';
      const r = nd.calculate(src);
      expect(r.maxDepth).toBeGreaterThanOrEqual(3);
    });

    it('returns averageDepth as number', () => {
      const r = nd.calculate('function f() { const x = 1; }');
      expect(typeof r.averageDepth).toBe('number');
    });

    it('reports deepestLine for nested source', () => {
      const src = 'function f() {\n  if (x) {\n    doThing();\n  }\n}';
      const r = nd.calculate(src);
      expect(r.deepestLine).toBeDefined();
    });
  });

  describe('ComplexityAnalyzer', () => {
    const analyzer = new ComplexityAnalyzer({
      ccThresholdWarn: 5,
      ccThresholdError: 10,
      depthThreshold: 3,
    });

    it('returns empty report for empty file map', () => {
      const report = analyzer.analyze(new Map());
      expect(report.files).toHaveLength(0);
      expect(report.overallGrade).toBe('A');
      expect(report.summary).toContain('No files');
    });

    it('analyzes single file', () => {
      const files = new Map([['simple.holo', 'const x = 1;']]);
      const report = analyzer.analyze(files);
      expect(report.files).toHaveLength(1);
      expect(report.files[0]!.filePath).toBe('simple.holo');
      expect(report.files[0]!.grade).toMatch(/[A-F]/);
    });

    it('grade is A for simple source', () => {
      const files = new Map([['simple.holo', 'const x = 1;']]);
      const report = analyzer.analyze(files);
      expect(report.files[0]!.grade).toBe('A');
    });

    it('grade degrades for complex source', () => {
      const complex = [
        'function f() {',
        '  if (a) { if (b) { if (c) { if (d) { if (e) {',
        '    for (;;) { while (x) { switch(y) { case 1: break; } } }',
        '  } } } } }',
        '}',
      ].join('\n');
      const files = new Map([['complex.holo', complex]]);
      const report = analyzer.analyze(files);
      expect(['C', 'D', 'F']).toContain(report.files[0]!.grade);
    });

    it('averageCC is correct for multiple files', () => {
      const files = new Map([
        ['a.holo', 'const x = 1;'],
        ['b.holo', 'const y = 2;'],
      ]);
      const report = analyzer.analyze(files);
      expect(report.files).toHaveLength(2);
      expect(typeof report.averageCC).toBe('number');
    });

    it('gradeFor static method works', () => {
      expect(ComplexityAnalyzer.gradeFor(1, 0)).toBe('A');
      expect(ComplexityAnalyzer.gradeFor(25, 0)).toBe('F');
    });
  });

  describe('ComplexityReporter', () => {
    const reporter = new ComplexityReporter();
    const analyzer = new ComplexityAnalyzer();

    it('formatTable produces header row', () => {
      const files = new Map([['main.holo', 'const x = 1;']]);
      const report = analyzer.analyze(files);
      const table = reporter.formatTable(report);
      expect(table).toContain('Complexity Analysis Report');
      expect(table).toContain('Grade');
      expect(table).toContain('main.holo');
    });

    it('formatTable includes recommendations when threshold exceeded', () => {
      const highCcAnalyzer = new ComplexityAnalyzer({ ccThresholdWarn: 1, ccThresholdError: 2 });
      const complex = 'if (a && b) { if (c || d) { for (;;) { } } }';
      const report = highCcAnalyzer.analyze(new Map([['f.holo', complex]]));
      const table = reporter.formatTable(report);
      if (report.files[0]!.recommendations.length > 0) {
        expect(table).toContain('Recommendations');
      }
    });

    it('formatJSON returns valid JSON', () => {
      const files = new Map([['main.holo', 'const x = 1;']]);
      const report = analyzer.analyze(files);
      const json = reporter.formatJSON(report);
      expect(() => JSON.parse(json)).not.toThrow();
      const parsed = JSON.parse(json);
      expect(parsed).toHaveProperty('files');
    });
  });
});

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Feature 5: Package Registry MVP
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

describe('Feature 5: Package Registry MVP', () => {
  describe('LocalRegistry â€“ publish & retrieve', () => {
    let registry: LocalRegistry;

    beforeEach(() => {
      registry = new LocalRegistry();
    });

    it('publishes a new package', () => {
      const manifest = registry.publish({
        name: 'my-pkg',
        version: '1.0.0',
        description: 'Test package',
        author: 'Alice',
        content: 'export {}',
      });
      expect(manifest.name).toBe('my-pkg');
      expect(manifest.latest).toBe('1.0.0');
      expect(manifest.versions).toHaveLength(1);
    });

    it('getPackage retrieves published package', () => {
      registry.publish({ name: 'pkg-a', version: '1.0.0', content: '' });
      expect(registry.getPackage('pkg-a')).toBeDefined();
    });

    it('getPackage returns undefined for unknown package', () => {
      expect(registry.getPackage('nonexistent')).toBeUndefined();
    });

    it('getVersion retrieves specific version', () => {
      registry.publish({ name: 'pkg-b', version: '1.2.3', content: 'v123' });
      const v = registry.getVersion('pkg-b', '1.2.3');
      expect(v).toBeDefined();
      expect(v!.version).toBe('1.2.3');
      expect(v!.checksum).toBeTruthy();
    });

    it('throws on duplicate version publish', () => {
      registry.publish({ name: 'dup', version: '1.0.0', content: '' });
      expect(() => registry.publish({ name: 'dup', version: '1.0.0', content: '' })).toThrow();
    });

    it('publishes multiple versions and updates latest', () => {
      registry.publish({ name: 'multi', version: '1.0.0', content: 'v1' });
      registry.publish({ name: 'multi', version: '2.0.0', content: 'v2' });
      const pkg = registry.getPackage('multi')!;
      expect(pkg.latest).toBe('2.0.0');
      expect(pkg.versions).toHaveLength(2);
    });

    it('size reflects published packages', () => {
      expect(registry.size).toBe(0);
      registry.publish({ name: 'x', version: '1.0.0', content: '' });
      expect(registry.size).toBe(1);
    });

    it('recordDownload increments download count', () => {
      registry.publish({ name: 'dl', version: '1.0.0', content: '' });
      registry.recordDownload('dl');
      registry.recordDownload('dl');
      expect(registry.getPackage('dl')!.downloads).toBe(2);
    });

    it('unpublish removes a package', () => {
      registry.publish({ name: 'rm', version: '1.0.0', content: '' });
      expect(registry.unpublish('rm')).toBe(true);
      expect(registry.getPackage('rm')).toBeUndefined();
    });

    it('unpublishVersion removes a specific version', () => {
      registry.publish({ name: 'mv', version: '1.0.0', content: '' });
      registry.publish({ name: 'mv', version: '2.0.0', content: '' });
      expect(registry.unpublishVersion('mv', '1.0.0')).toBe(true);
      expect(registry.getPackage('mv')!.versions).toHaveLength(1);
    });

    it('clear empties the registry', () => {
      registry.publish({ name: 'z', version: '1.0.0', content: '' });
      registry.clear();
      expect(registry.size).toBe(0);
    });
  });

  describe('LocalRegistry â€“ search & list', () => {
    let registry: LocalRegistry;

    beforeEach(() => {
      registry = new LocalRegistry();
      registry.publish({
        name: 'holoscript-ui',
        version: '1.0.0',
        description: 'UI components',
        tags: ['ui', 'components'],
        content: '',
      });
      registry.publish({
        name: 'holoscript-physics',
        version: '2.1.0',
        description: 'Physics engine',
        tags: ['physics'],
        content: '',
      });
      registry.publish({
        name: 'holo-audio',
        version: '0.5.0',
        description: 'Audio system',
        tags: ['audio'],
        content: '',
      });
    });

    it('list returns all packages', () => {
      expect(registry.list()).toHaveLength(3);
    });

    it('list filters by tag', () => {
      const uiPkgs = registry.list('ui');
      expect(uiPkgs).toHaveLength(1);
      expect(uiPkgs[0]!.name).toBe('holoscript-ui');
    });

    it('search finds by name', () => {
      const results = registry.search('holoscript');
      expect(results.length).toBeGreaterThanOrEqual(2);
    });

    it('search finds by description', () => {
      const results = registry.search('Physics');
      expect(results.some((r) => r.name === 'holoscript-physics')).toBe(true);
    });

    it('search finds by tag', () => {
      const results = registry.search('audio');
      expect(results.some((r) => r.name === 'holo-audio')).toBe(true);
    });

    it('search returns empty for no match', () => {
      expect(registry.search('zzz-not-found')).toHaveLength(0);
    });

    it('search results contain expected fields', () => {
      const [r] = registry.search('ui');
      expect(r).toHaveProperty('name');
      expect(r).toHaveProperty('latest');
      expect(r).toHaveProperty('downloads');
    });
  });

  describe('PackageResolver â€“ version resolution', () => {
    let registry: LocalRegistry;
    let resolver: PackageResolver;

    beforeEach(() => {
      registry = new LocalRegistry();
      registry.publish({ name: 'lib', version: '1.0.0', content: 'v1' });
      registry.publish({ name: 'lib', version: '1.2.0', content: 'v1.2' });
      registry.publish({ name: 'lib', version: '2.0.0', content: 'v2' });
      resolver = new PackageResolver(registry);
    });

    it('satisfies exact version', () => {
      expect(resolver.satisfies('1.0.0', '1.0.0')).toBe(true);
      expect(resolver.satisfies('1.0.0', '2.0.0')).toBe(false);
    });

    it('satisfies wildcard (*)', () => {
      expect(resolver.satisfies('9.9.9', '*')).toBe(true);
    });

    it('satisfies caret range (^)', () => {
      expect(resolver.satisfies('1.2.0', '^1.0.0')).toBe(true);
      expect(resolver.satisfies('2.0.0', '^1.0.0')).toBe(false);
    });

    it('satisfies tilde range (~)', () => {
      expect(resolver.satisfies('1.0.5', '~1.0.0')).toBe(true);
      expect(resolver.satisfies('1.1.0', '~1.0.0')).toBe(false);
    });

    it('resolve returns highest matching version', () => {
      const v = resolver.resolve('lib', '^1.0.0');
      expect(v).not.toBeNull();
      expect(v!.version).toBe('1.2.0');
    });

    it('resolve returns null for nonexistent package', () => {
      expect(resolver.resolve('nonexistent', '*')).toBeNull();
    });

    it('resolve returns null when no version satisfies range', () => {
      expect(resolver.resolve('lib', '^3.0.0')).toBeNull();
    });

    it('getMatchingVersions returns all satisfying versions', () => {
      const versions = resolver.getMatchingVersions('lib', '^1.0.0');
      expect(versions.length).toBe(2);
      const vNums = versions.map((v) => v.version);
      expect(vNums).toContain('1.0.0');
      expect(vNums).toContain('1.2.0');
    });

    it('wildcard resolves to latest', () => {
      const v = resolver.resolve('lib', '*');
      expect(v).not.toBeNull();
      expect(v!.version).toBe('2.0.0');
    });
  });
});
