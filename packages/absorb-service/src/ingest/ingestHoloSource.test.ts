/**
 * ingestHoloSource tests — B1 proof that the `.holo`/`.hsplus` →
 * ReferenceGraph pipeline is lossless and loc-preserving.
 *
 * These tests pin the A2 mapping contract: HoloComposition → composition
 * entry point, HoloObjectDecl → orb definition, HoloObjectTrait →
 * trait-config reference, with native `SourceLocation` preserved on each
 * definition.
 */

import { describe, it, expect } from 'vitest';
import { ingestHoloSource } from './ingestHoloSource';

const SAMPLE_SOURCE = `composition "TestPlaza" {
  environment {
    background: "#0d0f1a"
  }

  object "MemoryLattice" {
    position: [0, 5, 0]
    @knowledge(source: "crdt://holomesh/insights")
    @render(material: "glass_refractive")
  }

  object "AgentAvatar" {
    @grabbable
    @throwable(bounce: true)
  }
}
`;

describe('ingestHoloSource (B1)', () => {
  it('parses a composition and returns a populated graph', () => {
    const { ast, graph, errors, partial } = ingestHoloSource(SAMPLE_SOURCE, {
      filePath: 'test-plaza.hsplus',
    });

    expect(errors).toEqual([]);
    expect(partial).toBe(false);
    expect(ast).not.toBeNull();
    expect(ast?.type).toBe('Composition');

    const stats = graph.getStats();
    expect(stats.totalNodes).toBeGreaterThan(0);
  });

  it('registers the composition as an entry point', () => {
    const { graph } = ingestHoloSource(SAMPLE_SOURCE, { filePath: 'test.hsplus' });
    const defs = Array.from(graph.getDefinitions().values());

    const composition = defs.find((d) => d.type === 'composition');
    expect(composition).toBeDefined();
    expect(composition?.isEntryPoint).toBe(true);
    expect(composition?.filePath).toBe('test.hsplus');
  });

  it('registers each HoloObjectDecl as an orb definition', () => {
    const { graph } = ingestHoloSource(SAMPLE_SOURCE);
    const defs = Array.from(graph.getDefinitions().values());

    const orbs = defs.filter((d) => d.type === 'orb');
    const orbNames = orbs.map((o) => o.name).sort();
    expect(orbNames).toContain('MemoryLattice');
    expect(orbNames).toContain('AgentAvatar');
  });

  it('preserves AST loc when the parser emits it (contract test)', async () => {
    // Contract: when a HoloObjectDecl carries `loc`, `buildFromHoloComposition`
    // preserves it on the `SymbolDefinition` without truncation.
    //
    // This is tested against a synthetic AST so the assertion holds
    // regardless of whether the installed `@holoscript/core` dist has
    // the parseObject-emits-loc fix applied (see parser change shipped
    // alongside this file — pnpm-workspace resolves core via `./dist`,
    // so a fresh build is required before end-to-end loc preservation
    // propagates through parseHolo at runtime).
    const { ReferenceGraph } = await import('../analysis/ReferenceGraph');
    const graph = new ReferenceGraph();
    const ast = {
      type: 'Composition',
      name: 'Synthetic',
      templates: [],
      objects: [
        {
          type: 'Object',
          name: 'KnownOrb',
          properties: [],
          traits: [],
          loc: {
            start: { line: 7, column: 4 },
            end: { line: 12, column: 5 },
          },
        },
      ],
      spatialGroups: [],
      imports: [],
    } as unknown as Parameters<typeof graph.buildFromHoloComposition>[0];

    graph.buildFromHoloComposition(ast, 'synthetic.hsplus');
    graph.finalize();

    const defs = Array.from(graph.getDefinitions().values());
    const orb = defs.find((d) => d.type === 'orb' && d.name === 'KnownOrb');
    expect(orb).toBeDefined();
    expect(orb?.loc).toEqual({
      start: { line: 7, column: 4 },
      end: { line: 12, column: 5 },
    });
    expect(orb?.line).toBe(7);
    expect(orb?.endLine).toBe(12);
  });

  it('preserves loc end-to-end through the real parser (real-AST test)', () => {
    // Complement to the synthetic-AST contract test above: this exercises
    // the full pipeline — real parseHolo output threaded through
    // ingestHoloSource — and confirms that the parser-loc-followups
    // (parseComposition 1789, parseImplicitComposition 1362,
    // parseTemplate 2745, parseObject 2907) propagate to SymbolDefinition.loc
    // in production.
    const { graph } = ingestHoloSource(SAMPLE_SOURCE, { filePath: 'real.hsplus' });
    const defs = Array.from(graph.getDefinitions().values());

    const realOrbs = defs.filter(
      (d) => d.type === 'orb' && d.metadata?.fromHoloAST === true
    );
    expect(realOrbs.length).toBeGreaterThan(0);

    // Every orb emitted by the real parser must carry a `loc` with a valid
    // start position. If any orb comes through without loc, either the
    // installed core dist is pre-2e7bfd88 OR a parser path regressed.
    for (const orb of realOrbs) {
      expect(orb.loc, `orb "${orb.name}" lacks real-parser loc`).toBeDefined();
      expect(orb.loc?.start.line).toBeGreaterThanOrEqual(1);
      expect(orb.loc?.start.column).toBeGreaterThanOrEqual(0);
    }

    // Composition node should also carry loc post-followup.
    const composition = defs.find((d) => d.type === 'composition');
    expect(composition, 'no composition definition emitted').toBeDefined();
    expect(composition?.loc, 'composition missing loc — check parseComposition / parseImplicitComposition').toBeDefined();
  });

  it('emits trait-config references for each @trait application', () => {
    const { graph } = ingestHoloSource(SAMPLE_SOURCE);
    const refs = graph.getReferences();

    const traitRefs = refs.filter((r) => r.context === 'trait-config');
    const traitNames = traitRefs.map((r) => r.name).sort();

    expect(traitNames).toContain('knowledge');
    expect(traitNames).toContain('render');
    expect(traitNames).toContain('grabbable');
    expect(traitNames).toContain('throwable');
  });

  it('tolerates malformed input without throwing (default tolerant mode)', () => {
    const broken = 'composition "Broken" { object "Unclosed" {';
    const fn = () => ingestHoloSource(broken, { tolerant: true });
    expect(fn).not.toThrow();
    const { graph, partial } = fn();
    expect(partial).toBe(true);
    // Graph may still be partial but should exist
    expect(graph).toBeDefined();
  });
});
