/**
 * Build System Production Tests — SceneSplitter + ManifestGenerator + PackageManager Pure Methods
 *
 * Tests spatial scene splitting, manifest generation with cross-chunk
 * dependency analysis, and package manager argument building.
 */

import { describe, it, expect } from 'vitest';
import { SceneSplitter } from '../build/splitter';
import { ManifestGenerator } from '../build/manifest';
import { PackageManager } from '../packageManager';

// ─── SceneSplitter ───────────────────────────────────────────────────────

describe('SceneSplitter — Production', () => {
  const splitter = new SceneSplitter();

  it('splits empty composition into main chunk', () => {
    const comp = { objects: [], zones: [] } as any;
    const chunks = splitter.split(comp);
    expect(chunks.length).toBe(1);
    expect(chunks[0].id).toBe('main');
  });

  it('puts objects without position in main chunk', () => {
    const comp = {
      objects: [{ name: 'obj1', properties: [{ key: 'color', value: 'red' }], traits: [] }],
      zones: [],
    } as any;
    const chunks = splitter.split(comp);
    expect(chunks.length).toBe(1);
    expect(chunks[0].objects.length).toBe(1);
  });

  it('splits objects by zone bounds', () => {
    const comp = {
      objects: [
        { name: 'inZone', properties: [{ key: 'position', value: [5, 5, 5] }], traits: [] },
        { name: 'outZone', properties: [{ key: 'position', value: [100, 100, 100] }], traits: [] },
      ],
      zones: [
        {
          name: 'zone-a',
          properties: [
            {
              key: 'bounds',
              value: [
                [0, 0, 0],
                [10, 10, 10],
              ],
            },
          ],
        },
      ],
    } as any;
    const chunks = splitter.split(comp);
    const zoneChunk = chunks.find((c) => c.id === 'zone-a');
    const mainChunk = chunks.find((c) => c.id === 'main');
    expect(zoneChunk).toBeDefined();
    expect(zoneChunk!.objects.some((o) => o.name === 'inZone')).toBe(true);
    expect(mainChunk!.objects.some((o) => o.name === 'outZone')).toBe(true);
  });

  it('respects @chunk trait annotation', () => {
    const comp = {
      objects: [
        {
          name: 'manual',
          properties: [],
          traits: [{ name: 'chunk', config: { name: 'custom-chunk' } }],
        },
      ],
      zones: [],
    } as any;
    const chunks = splitter.split(comp);
    const customChunk = chunks.find((c) => c.id === 'custom-chunk');
    expect(customChunk).toBeDefined();
    expect(customChunk!.objects[0].name).toBe('manual');
  });

  it('isPointInBounds correctly checks 3D bounds', () => {
    // Access private method via any cast
    const s = splitter as any;
    expect(
      s.isPointInBounds(
        [5, 5, 5],
        [
          [0, 0, 0],
          [10, 10, 10],
        ]
      )
    ).toBe(true);
    expect(
      s.isPointInBounds(
        [0, 0, 0],
        [
          [0, 0, 0],
          [10, 10, 10],
        ]
      )
    ).toBe(true); // edge
    expect(
      s.isPointInBounds(
        [11, 5, 5],
        [
          [0, 0, 0],
          [10, 10, 10],
        ]
      )
    ).toBe(false);
    expect(
      s.isPointInBounds(
        [5, 5, 5],
        [
          [6, 6, 6],
          [10, 10, 10],
        ]
      )
    ).toBe(false);
  });

  it('isPointInBounds returns false for insufficient bounds', () => {
    const s = splitter as any;
    expect(s.isPointInBounds([5, 5, 5], [[0, 0, 0]])).toBe(false); // only 1 bound
    expect(s.isPointInBounds([5, 5, 5], [])).toBe(false);
  });
});

// ─── ManifestGenerator ───────────────────────────────────────────────────

describe('ManifestGenerator — Production', () => {
  const gen = new ManifestGenerator();

  it('generates manifest with main entry', () => {
    const chunks = [{ id: 'main', objects: [] as any[], metadata: {} }];
    const manifest = gen.generate(chunks, 'dist');
    expect(manifest.entry).toBe('main.chunk.js');
    expect(manifest.chunks['main']).toBeDefined();
    expect(manifest.chunks['main'].file).toBe('main.chunk.js');
  });

  it('generates manifest with multiple chunks', () => {
    const chunks = [
      { id: 'main', objects: [], metadata: {} },
      {
        id: 'zone-a',
        objects: [],
        metadata: {
          bounds: [
            [0, 0, 0],
            [10, 10, 10],
          ],
        },
      },
    ] as any[];
    const manifest = gen.generate(chunks, 'dist');
    expect(Object.keys(manifest.chunks).length).toBe(2);
    expect(manifest.chunks['zone-a'].file).toBe('zone-a.chunk.js');
    expect(manifest.chunks['zone-a'].bounds).toEqual([
      [0, 0, 0],
      [10, 10, 10],
    ]);
  });

  it('detects cross-chunk dependencies via object references', () => {
    const chunks = [
      {
        id: 'main',
        objects: [
          {
            name: 'player',
            properties: [{ key: 'target', value: 'enemy' }],
          },
        ],
        metadata: {},
      },
      {
        id: 'zone-b',
        objects: [{ name: 'enemy', properties: [] }],
        metadata: {},
      },
    ] as any[];
    const manifest = gen.generate(chunks, 'dist');
    expect(manifest.chunks['main'].dependencies).toContain('zone-b');
  });

  it('detects dependencies via trait config references', () => {
    const chunks = [
      {
        id: 'main',
        objects: [
          {
            name: 'npc',
            properties: [],
            traits: [{ name: 'follow', config: { target: 'waypoint' } }],
          },
        ],
        metadata: {},
      },
      {
        id: 'zone-c',
        objects: [{ name: 'waypoint', properties: [] }],
        metadata: {},
      },
    ] as any[];
    const manifest = gen.generate(chunks, 'dist');
    expect(manifest.chunks['main'].dependencies).toContain('zone-c');
  });

  it('does not include self as dependency', () => {
    const chunks = [
      {
        id: 'main',
        objects: [
          { name: 'a', properties: [{ key: 'ref', value: 'b' }] },
          { name: 'b', properties: [] },
        ],
        metadata: {},
      },
    ] as any[];
    const manifest = gen.generate(chunks, 'dist');
    expect(manifest.chunks['main'].dependencies).not.toContain('main');
  });
});

// ─── PackageManager Pure Methods ─────────────────────────────────────────

describe('PackageManager — Pure Methods', () => {
  // We can test the pure utility methods without FS
  const pm = new PackageManager('/tmp/test-project') as any;

  it('expandPackageName expands short names', () => {
    expect(pm.expandPackageName('core')).toBe('@holoscript/core');
    expect(pm.expandPackageName('std')).toBe('@holoscript/std');
    expect(pm.expandPackageName('runtime')).toBe('@holoscript/runtime');
  });

  it('expandPackageName passes through full names', () => {
    expect(pm.expandPackageName('@holoscript/core')).toBe('@holoscript/core');
    expect(pm.expandPackageName('some-other-package')).toBe('some-other-package');
  });

  it('buildInstallArgs for npm', () => {
    const args = pm.buildInstallArgs('npm', ['@holoscript/core'], false);
    expect(args).toContain('install');
    expect(args).toContain('@holoscript/core');
  });

  it('buildInstallArgs with dev flag', () => {
    const args = pm.buildInstallArgs('npm', ['pkg'], true);
    expect(args).toContain('--save-dev');
  });

  it('buildInstallArgs for pnpm', () => {
    const args = pm.buildInstallArgs('pnpm', ['pkg'], false);
    expect(args).toContain('add');
    expect(args).toContain('pkg');
  });

  it('buildRemoveArgs for npm', () => {
    const args = pm.buildRemoveArgs('npm', ['pkg']);
    expect(args).toContain('uninstall');
    expect(args).toContain('pkg');
  });

  it('buildRemoveArgs for yarn', () => {
    const args = pm.buildRemoveArgs('yarn', ['pkg']);
    expect(args).toContain('remove');
    expect(args).toContain('pkg');
  });
});
