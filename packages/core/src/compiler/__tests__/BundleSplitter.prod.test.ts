/**
 * BundleSplitter Production Tests
 *
 * Tests string import scanning, import path extraction, manifest generation,
 * and clear behavior.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { BundleSplitter } from '../../compiler/BundleSplitter';
import type { HSPlusNode } from '../../types/AdvancedTypeSystem';
import type { ASTProgram } from '../../types';

const makeNode = (overrides: Partial<HSPlusNode> & { type: string }): HSPlusNode =>
  ({ id: 'n1', children: [], ...overrides }) as unknown as HSPlusNode;

const makeProgram = (root: HSPlusNode): ASTProgram =>
  ({ root, errors: [], source: '' }) as unknown as ASTProgram;

describe('BundleSplitter — Production', () => {
  let splitter: BundleSplitter;

  beforeEach(() => {
    splitter = new BundleSplitter();
  });

  // ─── String Import Scanning ────────────────────────────────────────

  it('analyze finds imports in logic body functions', () => {
    const logicNode = makeNode({
      type: 'logic',
      body: {
        functions: [{ name: 'load', body: 'const m = import("./heavy-module")' }],
        eventHandlers: [],
        tickHandlers: [],
      },
    } as any);
    const program = makeProgram(logicNode);

    const splitPoints = splitter.analyze(program);
    expect(splitPoints.length).toBe(1);
    expect(splitPoints[0].targetModule).toBe('./heavy-module');
    expect(splitPoints[0].type).toBe('dynamic_import');
  });

  it('analyze finds imports in event handlers', () => {
    const logicNode = makeNode({
      type: 'logic',
      body: {
        functions: [],
        eventHandlers: [{ event: 'on_click', body: 'import("./dialog")' }],
        tickHandlers: [],
      },
    } as any);

    const splitPoints = splitter.analyze(makeProgram(logicNode));
    expect(splitPoints.length).toBe(1);
    expect(splitPoints[0].targetModule).toBe('./dialog');
  });

  it('analyze finds imports in tick handlers', () => {
    const logicNode = makeNode({
      type: 'logic',
      body: {
        functions: [],
        eventHandlers: [],
        tickHandlers: [{ interval: 1000, body: 'import("./tick-module")' }],
      },
    } as any);

    const splitPoints = splitter.analyze(makeProgram(logicNode));
    expect(splitPoints.length).toBe(1);
    expect(splitPoints[0].targetModule).toBe('./tick-module');
  });

  it('analyze detects call_expression dynamic imports', () => {
    const callNode = makeNode({
      type: 'call_expression',
      callee: 'import',
      arguments: ['./lazy-loaded'],
    } as any);

    const splitPoints = splitter.analyze(makeProgram(callNode));
    expect(splitPoints.length).toBe(1);
    expect(splitPoints[0].targetModule).toBe('./lazy-loaded');
  });

  // ─── Manifest Generation ──────────────────────────────────────────

  it('generateManifest creates main + dynamic chunks', () => {
    const logicNode = makeNode({
      type: 'logic',
      body: {
        functions: [
          { name: 'a', body: 'import("./moduleA")' },
          { name: 'b', body: 'import("./moduleB")' },
        ],
        eventHandlers: [],
        tickHandlers: [],
      },
    } as any);

    splitter.analyze(makeProgram(logicNode));
    const manifest = splitter.generateManifest();

    // main + 2 dynamic chunks
    expect(manifest.length).toBe(3);
    expect(manifest[0].id).toBe('main');
    expect(manifest[0].isDynamic).toBe(false);
    expect(manifest.filter((c) => c.isDynamic).length).toBe(2);
  });

  it('dedups same module into single chunk', () => {
    const logicNode = makeNode({
      type: 'logic',
      body: {
        functions: [
          { name: 'a', body: 'import("./shared")' },
          { name: 'b', body: 'import("./shared")' },
        ],
        eventHandlers: [],
        tickHandlers: [],
      },
    } as any);

    splitter.analyze(makeProgram(logicNode));
    const manifest = splitter.generateManifest();
    // main + 1 dynamic (deduped)
    expect(manifest.filter((c) => c.isDynamic).length).toBe(1);
  });

  // ─── Clear ─────────────────────────────────────────────────────────

  it('clear resets split points', () => {
    const logicNode = makeNode({
      type: 'logic',
      body: {
        functions: [{ name: 'a', body: 'import("./mod")' }],
        eventHandlers: [],
        tickHandlers: [],
      },
    } as any);

    splitter.analyze(makeProgram(logicNode));
    expect(splitter.getSplitPoints().length).toBe(1);
    splitter.clear();
    expect(splitter.getSplitPoints().length).toBe(0);
  });

  it('getSplitPoints returns empty initially', () => {
    expect(splitter.getSplitPoints()).toEqual([]);
  });
});
