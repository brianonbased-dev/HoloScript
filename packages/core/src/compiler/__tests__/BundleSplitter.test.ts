import { describe, it, expect, beforeEach } from 'vitest';
import { BundleSplitter } from '../BundleSplitter';
import type { ASTProgram, HSPlusNode } from '../../types';

/**
 * Helper to build a minimal ASTProgram from a root node.
 */
function makeAST(root: HSPlusNode): ASTProgram {
  return { root } as ASTProgram;
}

describe('BundleSplitter', () => {
  let splitter: BundleSplitter;

  beforeEach(() => {
    splitter = new BundleSplitter();
  });

  // =========== analyze ===========

  it('returns empty split points for an AST with no imports', () => {
    const ast = makeAST({ type: 'root', id: 'root' } as HSPlusNode);
    const points = splitter.analyze(ast);
    expect(points).toHaveLength(0);
  });

  it('detects dynamic import() in a logic body function', () => {
    const ast = makeAST({
      type: 'logic',
      id: 'logic1',
      body: {
        functions: [{ name: 'loadModule', body: 'const m = import("./heavy")' }],
      },
    } as unknown as HSPlusNode);
    const points = splitter.analyze(ast);
    expect(points.length).toBeGreaterThanOrEqual(1);
    expect(points[0].targetModule).toBe('./heavy');
    expect(points[0].type).toBe('dynamic_import');
  });

  it('detects dynamic import in event handlers', () => {
    const ast = makeAST({
      type: 'logic',
      id: 'logic2',
      body: {
        eventHandlers: [{ event: 'click', body: 'import("./clickHandler")' }],
      },
    } as unknown as HSPlusNode);
    const points = splitter.analyze(ast);
    expect(points.length).toBeGreaterThanOrEqual(1);
    expect(points[0].targetModule).toBe('./clickHandler');
  });

  it('detects dynamic import in tick handlers', () => {
    const ast = makeAST({
      type: 'logic',
      id: 'logic3',
      body: {
        tickHandlers: [{ interval: 16, body: 'import("./tick")' }],
      },
    } as unknown as HSPlusNode);
    const points = splitter.analyze(ast);
    expect(points.length).toBeGreaterThanOrEqual(1);
    expect(points[0].targetModule).toBe('./tick');
  });

  it('detects call_expression node with callee "import"', () => {
    const ast = makeAST({
      type: 'call_expression',
      id: 'imp1',
      callee: 'import',
      arguments: ['./lazyModule'],
    } as unknown as HSPlusNode);
    const points = splitter.analyze(ast);
    expect(points.length).toBe(1);
    expect(points[0].targetModule).toBe('./lazyModule');
  });

  it('extracts import path from source property', () => {
    const ast = makeAST({
      type: 'call_expression',
      id: 'imp2',
      callee: 'import',
      source: './fromSource',
    } as unknown as HSPlusNode);
    const points = splitter.analyze(ast);
    expect(points.length).toBe(1);
    expect(points[0].targetModule).toBe('./fromSource');
  });

  it('extracts import path from argument value property', () => {
    const ast = makeAST({
      type: 'call_expression',
      id: 'imp3',
      callee: 'import',
      arguments: [{ value: './fromValue' }],
    } as unknown as HSPlusNode);
    const points = splitter.analyze(ast);
    expect(points.length).toBe(1);
    expect(points[0].targetModule).toBe('./fromValue');
  });

  it('traverses children recursively', () => {
    const ast = makeAST({
      type: 'root',
      id: 'root',
      children: [
        {
          type: 'logic',
          id: 'nested',
          body: {
            functions: [{ name: 'fn', body: 'import("./deep")' }],
          },
        },
      ],
    } as unknown as HSPlusNode);
    const points = splitter.analyze(ast);
    expect(points.length).toBeGreaterThanOrEqual(1);
  });

  // =========== generateManifest ===========

  it('generates manifest with main chunk when no splits', () => {
    splitter.analyze(makeAST({ type: 'root', id: 'r' } as HSPlusNode));
    const manifest = splitter.generateManifest();
    expect(manifest.length).toBe(1);
    expect(manifest[0].id).toBe('main');
    expect(manifest[0].isDynamic).toBe(false);
  });

  it('generates dynamic chunks for each unique import target', () => {
    const ast = makeAST({
      type: 'logic',
      id: 'logic',
      body: {
        functions: [
          { name: 'a', body: 'import("./modA")' },
          { name: 'b', body: 'import("./modB")' },
          { name: 'c', body: 'import("./modA")' }, // duplicate target
        ],
      },
    } as unknown as HSPlusNode);
    splitter.analyze(ast);
    const manifest = splitter.generateManifest();
    // main + 2 unique dynamic chunks
    expect(manifest.length).toBe(3);
    expect(manifest.filter((c) => c.isDynamic).length).toBe(2);
  });

  it('dynamic chunks reference parent as main', () => {
    const ast = makeAST({
      type: 'call_expression',
      id: 'imp',
      callee: 'import',
      arguments: ['./lazy'],
    } as unknown as HSPlusNode);
    splitter.analyze(ast);
    const manifest = splitter.generateManifest();
    const dynamic = manifest.find((c) => c.isDynamic);
    expect(dynamic).toBeDefined();
    expect(dynamic!.parentChunkId).toBe('main');
  });

  // =========== getSplitPoints / clear ===========

  it('getSplitPoints returns detected split points', () => {
    splitter.analyze(
      makeAST({
        type: 'logic',
        id: 'l',
        body: { functions: [{ name: 'f', body: 'import("./x")' }] },
      } as unknown as HSPlusNode)
    );
    expect(splitter.getSplitPoints().length).toBeGreaterThanOrEqual(1);
  });

  it('clear resets all state', () => {
    splitter.analyze(
      makeAST({
        type: 'logic',
        id: 'l',
        body: { functions: [{ name: 'f', body: 'import("./x")' }] },
      } as unknown as HSPlusNode)
    );
    splitter.generateManifest();
    splitter.clear();
    expect(splitter.getSplitPoints()).toHaveLength(0);
    // After clear, manifest should rebuild fresh
    const m = splitter.generateManifest();
    expect(m.length).toBe(1); // only main
  });
});
