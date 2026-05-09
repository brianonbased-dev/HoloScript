import { describe, it, expect } from 'vitest';
import type { R3FNode } from '@holoscript/core';
import {
  resolveGaussianSplatSrc,
  resolveWebSurfaceConfig,
  isBatchableDraftMesh,
  partitionStudioChildren,
} from '../utils/partitionStudioChildren';

function draft(id: string, extra: Partial<R3FNode['props']> = {}): R3FNode {
  return {
    id,
    type: 'mesh',
    assetMaturity: 'draft',
    props: { hsType: 'box', position: [0, 0, 0], ...extra },
  } as R3FNode;
}

function finalMesh(id: string): R3FNode {
  return {
    id,
    type: 'mesh',
    assetMaturity: 'final',
    props: { hsType: 'box' },
  } as R3FNode;
}

describe('partitionStudioChildren', () => {
  it('returns empty partitions for undefined children', () => {
    expect(partitionStudioChildren(undefined)).toEqual({
      batchableDraftMeshes: [],
      rest: [],
    });
  });

  it('collects all draft siblings into batchableDraftMeshes', () => {
    const a = draft('a');
    const b = draft('b');
    const { batchableDraftMeshes, rest } = partitionStudioChildren([a, b]);
    expect(batchableDraftMeshes.map((n) => n.id)).toEqual(['a', 'b']);
    expect(rest).toEqual([]);
  });

  it('preserves rest order and excludes non-draft meshes', () => {
    const d = draft('d');
    const m = finalMesh('m');
    const g = { id: 'g', type: 'group' as const, props: {} } as R3FNode;
    const { batchableDraftMeshes, rest } = partitionStudioChildren([d, m, g]);
    expect(batchableDraftMeshes.map((n) => n.id)).toEqual(['d']);
    expect(rest.map((n) => n.id)).toEqual(['m', 'g']);
  });

  it('excludes draft mesh with splat src from batch (stays in rest)', () => {
    const plain = draft('plain');
    const splatDraft = draft('splat', { src: 'https://x.com/a.splat' });
    const { batchableDraftMeshes, rest } = partitionStudioChildren([plain, splatDraft]);
    expect(batchableDraftMeshes.map((n) => n.id)).toEqual(['plain']);
    expect(rest.map((n) => n.id)).toEqual(['splat']);
  });

  it('resolveGaussianSplatSrc reads trait gaussian_splat', () => {
    const traits = new Map<string, Record<string, unknown>>([
      ['gaussian_splat', { src: 'blob:trait' }],
    ]);
    const node = {
      id: 'n',
      type: 'mesh',
      assetMaturity: 'draft',
      traits,
      props: {},
    } as R3FNode;
    expect(resolveGaussianSplatSrc(node)).toBe('blob:trait');
    expect(isBatchableDraftMesh(node)).toBe(false);
  });

  it('resolveWebSurfaceConfig reads trait web_surface', () => {
    const traits = new Map<string, Record<string, unknown>>([
      ['web_surface', { url: 'https://example.com', size: [800, 600] }],
    ]);
    const node = {
      id: 'n',
      type: 'mesh',
      traits,
      props: {},
    } as R3FNode;
    const cfg = resolveWebSurfaceConfig(node);
    expect(cfg).not.toBeNull();
    expect(cfg?.url).toBe('https://example.com');
    expect(cfg?.size).toEqual([800, 600]);
  });

  it('resolveWebSurfaceConfig falls back to props.webSurface', () => {
    const node = {
      id: 'n',
      type: 'mesh',
      traits: new Map(),
      props: { webSurface: { url: 'https://fallback.test', sandbox: ['allow-scripts'] } },
    } as R3FNode;
    const cfg = resolveWebSurfaceConfig(node);
    expect(cfg).not.toBeNull();
    expect(cfg?.url).toBe('https://fallback.test');
    expect(cfg?.sandbox).toEqual(['allow-scripts']);
  });

  it('resolveWebSurfaceConfig returns null when absent', () => {
    const node = {
      id: 'n',
      type: 'mesh',
      traits: new Map(),
      props: {},
    } as R3FNode;
    expect(resolveWebSurfaceConfig(node)).toBeNull();
  });
});
