/**
 * ReferenceGraph — Production Test Suite
 *
 * Covers: addDefinition, addReference, buildFromAST, addFile, finalize,
 * getNodes, getDefinitions, getReferences, getEntryPoints, addEntryPoint,
 * getStats, clear, createReferenceGraph.
 */
import { describe, it, expect } from 'vitest';
import { ReferenceGraph, createReferenceGraph } from '../ReferenceGraph';

describe('ReferenceGraph — Production', () => {
  // ─── Manual Definitions ───────────────────────────────────────────
  it('addDefinition stores symbol', () => {
    const g = new ReferenceGraph();
    g.addDefinition({ name: 'Player', type: 'orb', filePath: 'test.holo', line: 1, column: 1 });
    expect(g.getDefinitions().size).toBe(1);
  });

  it('addReference stores reference', () => {
    const g = new ReferenceGraph();
    g.addReference({
      name: 'Player',
      type: 'orb',
      filePath: 'test.holo',
      line: 5,
      column: 1,
      context: 'child-reference',
    });
    expect(g.getReferences().length).toBe(1);
  });

  // ─── AST Building ────────────────────────────────────────────────
  it('buildFromAST collects orb definitions', () => {
    const g = new ReferenceGraph();
    g.buildFromAST(
      {
        type: 'program',
        children: [
          { type: 'object', name: 'Player', loc: { start: { line: 1, column: 1 } } },
          { type: 'object', name: 'Enemy', loc: { start: { line: 5, column: 1 } } },
        ],
      },
      'game.holo'
    );
    expect(g.getDefinitions().size).toBeGreaterThanOrEqual(2);
  });

  it('buildFromAST collects template definitions', () => {
    const g = new ReferenceGraph();
    g.buildFromAST({
      type: 'program',
      children: [
        { type: 'template', name: 'BaseCharacter', loc: { start: { line: 1, column: 1 } } },
      ],
    });
    const defs = [...g.getDefinitions().values()];
    expect(defs.some((d) => d.name === 'BaseCharacter' && d.type === 'template')).toBe(true);
  });

  it('buildFromAST collects function definitions', () => {
    const g = new ReferenceGraph();
    g.buildFromAST({
      type: 'program',
      children: [
        { type: 'function', name: 'calculateDamage', loc: { start: { line: 1, column: 1 } } },
      ],
    });
    const defs = [...g.getDefinitions().values()];
    expect(defs.some((d) => d.name === 'calculateDamage' && d.type === 'function')).toBe(true);
  });

  it('buildFromAST creates nodes', () => {
    const g = new ReferenceGraph();
    g.buildFromAST({
      type: 'program',
      children: [{ type: 'object', name: 'World', loc: { start: { line: 1, column: 1 } } }],
    });
    expect(g.getNodes().size).toBeGreaterThanOrEqual(1);
  });

  // ─── Multi-file ───────────────────────────────────────────────────
  it('addFile + finalize works for cross-file', () => {
    const g = new ReferenceGraph();
    g.addFile(
      {
        type: 'program',
        children: [{ type: 'object', name: 'A', loc: { start: { line: 1, column: 1 } } }],
      },
      'a.holo'
    );
    g.addFile(
      {
        type: 'program',
        children: [{ type: 'object', name: 'B', loc: { start: { line: 1, column: 1 } } }],
      },
      'b.holo'
    );
    g.finalize();
    expect(g.getNodes().size).toBeGreaterThanOrEqual(2);
  });

  // ─── Stats ────────────────────────────────────────────────────────
  it('getStats returns correct counts', () => {
    const g = new ReferenceGraph();
    g.buildFromAST({
      type: 'program',
      children: [
        { type: 'object', name: 'X', loc: { start: { line: 1, column: 1 } } },
        { type: 'template', name: 'T', loc: { start: { line: 5, column: 1 } } },
      ],
    });
    const stats = g.getStats();
    expect(stats.totalNodes).toBeGreaterThanOrEqual(2);
    expect(stats.byType.orb).toBeGreaterThanOrEqual(1);
  });

  // ─── Clear ────────────────────────────────────────────────────────
  it('clear resets all state', () => {
    const g = new ReferenceGraph();
    g.addDefinition({ name: 'A', type: 'orb', filePath: 'f', line: 1, column: 1 });
    g.clear();
    expect(g.getDefinitions().size).toBe(0);
    expect(g.getNodes().size).toBe(0);
  });

  // ─── Factory ──────────────────────────────────────────────────────
  it('createReferenceGraph returns instance', () => {
    const g = createReferenceGraph();
    expect(g).toBeInstanceOf(ReferenceGraph);
  });

  // ─── Entry Points ─────────────────────────────────────────────────
  it('addEntryPoint adds custom entry', () => {
    const g = new ReferenceGraph();
    g.addEntryPoint('custom:main');
    expect(g.getEntryPoints().has('custom:main')).toBe(true);
  });

  it('properties are collected from AST', () => {
    const g = new ReferenceGraph();
    g.buildFromAST({
      type: 'program',
      children: [
        {
          type: 'object',
          name: 'Ball',
          properties: [{ key: 'radius', value: 5 }],
          loc: { start: { line: 1, column: 1 } },
        },
      ],
    });
    const defs = [...g.getDefinitions().values()];
    expect(defs.some((d) => d.name === 'radius' && d.type === 'property')).toBe(true);
  });
});
