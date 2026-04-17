/**
 * FocusedDPOSplitter B2 migration tests — prove that object segments
 * now come from AST `loc` ranges, not regex pattern matching.
 *
 * See NORTH_STAR DT-14 / meeting-absorb-ast-migration / task
 * task_1776453927828_qpv1. B2 replaces the `/^(\s*)object\s+.../` regex
 * pattern with a `HoloObjectDecl.loc`-driven walk.
 */

import { describe, it, expect } from 'vitest';
import { FocusedDPOSplitter } from './FocusedDPOSplitter';
import type { HoloParseResult } from '@holoscript/core';

const SOURCE = `composition "Test" {
  object "Alpha" {
    position: [0, 0, 0]
  }
  object "Beta" {
    @grabbable
  }
}
`;

// Synthetic AST with known loc — independent of the installed core dist
// so the contract holds regardless of whether parseObject emits loc yet
// in the workspace-resolved @holoscript/core build.
function syntheticAST(): HoloParseResult {
  return {
    success: true,
    ast: {
      type: 'Composition',
      name: 'Test',
      templates: [],
      objects: [
        {
          type: 'Object',
          name: 'Alpha',
          properties: [],
          traits: [],
          loc: { start: { line: 2, column: 2 }, end: { line: 4, column: 3 } },
        },
        {
          type: 'Object',
          name: 'Beta',
          properties: [],
          traits: [],
          loc: { start: { line: 5, column: 2 }, end: { line: 7, column: 3 } },
        },
      ],
      spatialGroups: [],
      imports: [],
    },
    errors: [],
    warnings: [],
  } as unknown as HoloParseResult;
}

describe('FocusedDPOSplitter.extractSegments (B2 — AST-driven objects)', () => {
  it('extracts one object segment per HoloObjectDecl via loc (no regex)', () => {
    const splitter = new FocusedDPOSplitter();
    const segments = splitter.extractSegments(SOURCE, syntheticAST());

    const objectSegments = segments.filter((s) => s.kind === 'object');
    expect(objectSegments.length).toBe(2);

    const names = objectSegments.map((s) => s.name).sort();
    expect(names).toEqual(['Alpha', 'Beta']);
  });

  it('preserves loc-driven line boundaries on each object segment', () => {
    const splitter = new FocusedDPOSplitter();
    const segments = splitter.extractSegments(SOURCE, syntheticAST());

    const alpha = segments.find((s) => s.kind === 'object' && s.name === 'Alpha');
    expect(alpha).toBeDefined();
    expect(alpha?.startLine).toBe(2);
    expect(alpha?.endLine).toBe(4);
    expect(alpha?.source).toContain('object "Alpha"');
    expect(alpha?.source).toContain('position: [0, 0, 0]');

    const beta = segments.find((s) => s.kind === 'object' && s.name === 'Beta');
    expect(beta).toBeDefined();
    expect(beta?.startLine).toBe(5);
    expect(beta?.endLine).toBe(7);
    expect(beta?.source).toContain('@grabbable');
  });

  it('does not double-emit objects (regex path no longer touches object blocks)', () => {
    const splitter = new FocusedDPOSplitter();
    const segments = splitter.extractSegments(SOURCE, syntheticAST());

    const alphaHits = segments.filter((s) => s.kind === 'object' && s.name === 'Alpha');
    const betaHits = segments.filter((s) => s.kind === 'object' && s.name === 'Beta');
    expect(alphaHits.length).toBe(1);
    expect(betaHits.length).toBe(1);
  });

  it('captures nested children at depth + 1', () => {
    const splitter = new FocusedDPOSplitter();
    const nestedSource = `composition "Nested" {
  object "Parent" {
    object "Child" {
      position: [1, 2, 3]
    }
  }
}
`;
    const nestedAST = {
      success: true,
      ast: {
        type: 'Composition',
        name: 'Nested',
        templates: [],
        objects: [
          {
            type: 'Object',
            name: 'Parent',
            properties: [],
            traits: [],
            loc: { start: { line: 2, column: 2 }, end: { line: 6, column: 3 } },
            children: [
              {
                type: 'Object',
                name: 'Child',
                properties: [],
                traits: [],
                loc: { start: { line: 3, column: 4 }, end: { line: 5, column: 5 } },
              },
            ],
          },
        ],
        spatialGroups: [],
        imports: [],
      },
      errors: [],
      warnings: [],
    } as unknown as HoloParseResult;

    const segments = splitter.extractSegments(nestedSource, nestedAST);
    const parent = segments.find((s) => s.name === 'Parent');
    const child = segments.find((s) => s.name === 'Child');

    expect(parent?.depth).toBe(0);
    expect(child?.depth).toBe(1);
    expect(child?.source).toContain('position: [1, 2, 3]');
  });

  it('skips objects whose loc is missing (does not guess)', () => {
    const splitter = new FocusedDPOSplitter();
    const noLocAST = {
      success: true,
      ast: {
        type: 'Composition',
        name: 'NoLoc',
        templates: [],
        objects: [
          {
            type: 'Object',
            name: 'Ghost',
            properties: [],
            traits: [],
            // intentionally no `loc`
          },
        ],
        spatialGroups: [],
        imports: [],
      },
      errors: [],
      warnings: [],
    } as unknown as HoloParseResult;

    const segments = splitter.extractSegments('composition "NoLoc" {}\n', noLocAST);
    const ghost = segments.find((s) => s.name === 'Ghost');
    expect(ghost).toBeUndefined();
  });
});
