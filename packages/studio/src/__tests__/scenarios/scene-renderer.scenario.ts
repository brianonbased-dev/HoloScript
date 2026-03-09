/**
 * Scenario: Scene Renderer — Asset Mapping
 *
 * Tests for the pure helper functions in SceneRenderer:
 * - assetToNodeType: maps asset categories to SceneNode types
 * - assetToTrait: maps assets to trait configs for specialized types
 */

import { describe, it, expect } from 'vitest';

// ── Pure functions (extracted from SceneRenderer.tsx for testing) ────────────

type AssetCategory = 'model' | 'splat' | 'audio' | 'hdri' | 'texture' | 'script';
type NodeType = 'mesh' | 'splat' | 'audio';

function assetToNodeType(category: AssetCategory): NodeType {
  if (category === 'splat') return 'splat';
  if (category === 'audio') return 'audio';
  if (category === 'model') return 'mesh';
  return 'mesh';
}

interface Asset {
  id: string;
  name: string;
  category: AssetCategory;
  src: string;
}

function assetToTrait(asset: Asset): { name: string; properties: Record<string, unknown> } | null {
  switch (asset.category) {
    case 'splat':
      return {
        name: 'gaussian_splat',
        properties: { source: asset.src, quality: 'medium', sh_degree: 3 },
      };
    case 'audio':
      return {
        name: 'audio_source',
        properties: { src: asset.src, volume: 1.0, loop: false, spatial: true },
      };
    case 'hdri':
      return { name: 'environment', properties: { src: asset.src } };
    default:
      return null;
  }
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('Scenario: Scene Renderer — assetToNodeType', () => {
  it('model → mesh', () => {
    expect(assetToNodeType('model')).toBe('mesh');
  });

  it('splat → splat', () => {
    expect(assetToNodeType('splat')).toBe('splat');
  });

  it('audio → audio', () => {
    expect(assetToNodeType('audio')).toBe('audio');
  });

  it('texture → mesh (fallback)', () => {
    expect(assetToNodeType('texture')).toBe('mesh');
  });

  it('script → mesh (fallback)', () => {
    expect(assetToNodeType('script')).toBe('mesh');
  });
});

describe('Scenario: Scene Renderer — assetToTrait', () => {
  it('splat asset → gaussian_splat trait', () => {
    const trait = assetToTrait({ id: '1', name: 'Scene', category: 'splat', src: 'scene.ply' });
    expect(trait).not.toBeNull();
    expect(trait!.name).toBe('gaussian_splat');
    expect(trait!.properties.source).toBe('scene.ply');
    expect(trait!.properties.quality).toBe('medium');
    expect(trait!.properties.sh_degree).toBe(3);
  });

  it('audio asset → audio_source trait', () => {
    const trait = assetToTrait({ id: '2', name: 'BGM', category: 'audio', src: 'music.mp3' });
    expect(trait!.name).toBe('audio_source');
    expect(trait!.properties.src).toBe('music.mp3');
    expect(trait!.properties.volume).toBe(1.0);
    expect(trait!.properties.spatial).toBe(true);
  });

  it('hdri asset → environment trait', () => {
    const trait = assetToTrait({ id: '3', name: 'Sky', category: 'hdri', src: 'sky.hdr' });
    expect(trait!.name).toBe('environment');
    expect(trait!.properties.src).toBe('sky.hdr');
  });

  it('model asset → null (no special trait)', () => {
    const trait = assetToTrait({ id: '4', name: 'Cube', category: 'model', src: 'cube.glb' });
    expect(trait).toBeNull();
  });

  it('texture asset → null (no special trait)', () => {
    const trait = assetToTrait({ id: '5', name: 'Tex', category: 'texture', src: 'diffuse.png' });
    expect(trait).toBeNull();
  });
});
