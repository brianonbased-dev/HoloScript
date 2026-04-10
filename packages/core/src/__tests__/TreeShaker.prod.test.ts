/**
 * TreeShaker — Production Test Suite
 *
 * Covers: shake (keep/remove), entry-point marking, graph stats,
 * side-effects, traits, exports, options (keepTraits/keepExports/keepNames),
 * treeShake convenience, eliminateDeadCode.
 */
import { describe, it, expect } from 'vitest';
import { TreeShaker, treeShake, eliminateDeadCode } from '../TreeShaker';
import type { ASTNode } from '../types';

function makeNode(type: string, name: string, extras: Partial<ASTNode> = {}): ASTNode {
  return { type, name, ...extras } as ASTNode;
}

describe('TreeShaker — Production', () => {
  // ─── Basic Shake ──────────────────────────────────────────────────
  it('keeps entry-point nodes', () => {
    const ts = new TreeShaker({ entryPoints: ['Main'] });
    const nodes = [makeNode('object', 'Main'), makeNode('object', 'Unused')];
    const r = ts.shake(nodes);
    expect(r.kept.some((n) => n.name === 'Main')).toBe(true);
    expect(r.stats.keptNodes).toBeGreaterThanOrEqual(1);
  });

  it('removes unreachable nodes', () => {
    const ts = new TreeShaker({ entryPoints: ['Main'] });
    const nodes = [makeNode('object', 'Main'), makeNode('object', 'Dead')];
    const r = ts.shake(nodes);
    expect(r.removed.length).toBeGreaterThanOrEqual(1);
    expect(r.stats.removedNodes).toBeGreaterThanOrEqual(1);
    expect(r.stats.reductionPercent).toBeGreaterThan(0);
  });

  // ─── Options ──────────────────────────────────────────────────────
  it('keepTraits retains trait nodes', () => {
    const ts = new TreeShaker({ entryPoints: [], keepTraits: true });
    const nodes = [makeNode('object', 'A', { traits: [{ name: 'Renderable' }] } as any)];
    const r = ts.shake(nodes);
    expect(r.kept.length).toBeGreaterThanOrEqual(1);
  });

  it('keepExports retains exported nodes', () => {
    const ts = new TreeShaker({ entryPoints: [], keepExports: true });
    const nodes = [makeNode('export', 'Exp')];
    const r = ts.shake(nodes);
    expect(r.kept.some((n) => n.name === 'Exp')).toBe(true);
  });

  it('keepNames retains specific named nodes', () => {
    const ts = new TreeShaker({ entryPoints: [], keepNames: ['Config'] });
    const nodes = [makeNode('object', 'Config'), makeNode('object', 'X')];
    const r = ts.shake(nodes);
    expect(r.kept.some((n) => n.name === 'Config')).toBe(true);
  });

  // ─── Graph Stats ──────────────────────────────────────────────────
  it('getGraphStats returns node and edge counts', () => {
    const ts = new TreeShaker({ entryPoints: ['A'] });
    ts.shake([makeNode('object', 'A'), makeNode('object', 'B')]);
    const stats = ts.getGraphStats();
    expect(stats.nodeCount).toBeGreaterThanOrEqual(2);
    expect(typeof stats.edgeCount).toBe('number');
    expect(typeof stats.entryPoints).toBe('number');
  });

  // ─── Side Effects ─────────────────────────────────────────────────
  it('hasSideEffects identifies expression statements', () => {
    const ts = new TreeShaker();
    const node = makeNode('expression-statement', 'call');
    expect(ts.hasSideEffects(node)).toBe(true);
  });

  it('hasSideEffects returns false for plain declarations', () => {
    const ts = new TreeShaker();
    const node = makeNode('object', 'Pure');
    expect(ts.hasSideEffects(node)).toBe(false);
  });

  // ─── Results Shape ────────────────────────────────────────────────
  it('shake returns correct stats shape', () => {
    const ts = new TreeShaker({ entryPoints: ['A'] });
    const r = ts.shake([makeNode('object', 'A')]);
    expect(r.stats).toHaveProperty('totalNodes');
    expect(r.stats).toHaveProperty('keptNodes');
    expect(r.stats).toHaveProperty('removedNodes');
    expect(r.stats).toHaveProperty('reductionPercent');
  });

  // ─── Convenience Function ─────────────────────────────────────────
  it('treeShake convenience function works', () => {
    const r = treeShake([makeNode('object', 'A')], { entryPoints: ['A'] });
    expect(r.kept.length).toBeGreaterThanOrEqual(1);
  });

  // ─── Dead Code Elimination ────────────────────────────────────────
  it('eliminateDeadCode returns array', () => {
    const nodes = [makeNode('object', 'A')];
    const result = eliminateDeadCode(nodes);
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThanOrEqual(1);
  });
});
