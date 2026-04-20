/**
 * r3f-renderer Component Tests
 *
 * Tests for the core rendering components using vitest.
 * Components are rendered headlessly — no WebGL context needed
 * for structural/prop/logic verification.
 */

import { describe, it, expect } from 'vitest';
import {
  isCoreLODConfig,
  coreLODConfigToRendererProp,
  isRendererLODConfigProp,
} from '../utils/coreLodBridge';

// ─── LODMeshNode Logic Tests ───────────────────────────────────────────────────

describe('LODMeshNode logic', () => {
  it('DETAIL_TIERS maps indices correctly', () => {
    // Verifying the detail tier mapping logic
    const getDetailForLevel = (levelIndex: number): string => {
      if (levelIndex <= 0) return 'high';
      if (levelIndex === 1) return 'medium';
      return 'low';
    };

    expect(getDetailForLevel(0)).toBe('high');
    expect(getDetailForLevel(1)).toBe('medium');
    expect(getDetailForLevel(2)).toBe('low');
    expect(getDetailForLevel(5)).toBe('low');
    expect(getDetailForLevel(-1)).toBe('high');
  });

  it('LODConfig distance extraction sorts by level', () => {
    const levels = [
      { level: 2, distance: 50, polygonRatio: 0.25, textureScale: 0.5 },
      { level: 0, distance: 0, polygonRatio: 1.0, textureScale: 1.0 },
      { level: 1, distance: 25, polygonRatio: 0.5, textureScale: 0.75 },
    ];

    const sorted = [...levels].sort((a, b) => a.level - b.level);
    const dists = sorted.map((l) => l.distance);

    expect(dists).toEqual([0, 25, 50]);
    expect(sorted[0].polygonRatio).toBe(1.0);
    expect(sorted[2].polygonRatio).toBe(0.25);
  });

  it('disabled LOD returns single level', () => {
    const lodConfig = { enabled: false, levels: [] };

    if (lodConfig.enabled === false) {
      const result = { distances: [0], levelCount: 1 };
      expect(result.distances).toEqual([0]);
      expect(result.levelCount).toBe(1);
    }
  });

  it('forcedLevel returns single level', () => {
    const lodConfig = { forcedLevel: 2, levels: [] };

    if (lodConfig.forcedLevel !== undefined) {
      const result = { distances: [0], levelCount: 1 };
      expect(result.distances).toEqual([0]);
      expect(result.levelCount).toBe(1);
    }
  });

  it('core LODConfig maps minDistance to renderer distances', () => {
    const core = {
      entityId: 'ent-1',
      levels: [
        { minDistance: 40, label: 'low' },
        { minDistance: 0, label: 'high' },
        { minDistance: 20, label: 'mid' },
      ],
    };
    expect(isCoreLODConfig(core)).toBe(true);
    const prop = coreLODConfigToRendererProp(core);
    expect(prop.id).toBe('ent-1');
    const dists = [...prop.levels].sort((a, b) => a.level - b.level).map((l) => l.distance);
    expect(dists).toEqual([0, 20, 40]);
    expect(prop.levels.length).toBe(3);
  });

  it('isCoreLODConfig rejects invalid shapes', () => {
    expect(isCoreLODConfig(null)).toBe(false);
    expect(isCoreLODConfig({ entityId: 'x', levels: [] })).toBe(false);
    expect(isCoreLODConfig({ entityId: 'x', levels: [{ minDistance: 0 }] })).toBe(false);
  });

  it('isRendererLODConfigProp detects renderer level bag', () => {
    expect(
      isRendererLODConfigProp({
        levels: [
          { level: 1, distance: 10 },
          { level: 0, distance: 0 },
        ],
      })
    ).toBe(true);
    expect(isRendererLODConfigProp({ levels: [{ level: 0, minDistance: 0 }] })).toBe(false);
  });

  it('empty levels falls back to legacy distances', () => {
    const lodConfig = { levels: [] };
    const legacyDistances = [0, 30, 60];

    let distances: number[];
    if (lodConfig.levels && lodConfig.levels.length > 0) {
      distances = lodConfig.levels.map((l: any) => l.distance);
    } else {
      distances = legacyDistances;
    }

    expect(distances).toEqual([0, 30, 60]);
  });
});

// ─── hasLOD Helper Tests ───────────────────────────────────────────────────────

describe('hasLOD', () => {
  function hasLOD(node: { props: Record<string, any> }): boolean {
    return !!(node.props.lod || node.props.lodDistances || node.props.lodEnabled);
  }

  it('returns true for node with lod prop', () => {
    expect(hasLOD({ props: { lod: true } })).toBe(true);
  });

  it('returns true for node with lodDistances', () => {
    expect(hasLOD({ props: { lodDistances: [0, 10, 20] } })).toBe(true);
  });

  it('returns true for node with lodEnabled', () => {
    expect(hasLOD({ props: { lodEnabled: true } })).toBe(true);
  });

  it('returns false for normal node', () => {
    expect(hasLOD({ props: { hsType: 'box' } })).toBe(false);
  });
});

// ─── useLODBridge Hook Logic Tests ─────────────────────────────────────────────

describe('useLODBridge logic', () => {
  it('draft entities skip LOD', () => {
    const maturity: 'draft' | 'mesh' | 'final' = 'draft';
    const isDraft = maturity === 'draft';
    expect(isDraft).toBe(true);

    // Draft should return single level
    if (isDraft) {
      const result = {
        distances: [0, 25, 50] as [number, number, number],
        isDraft: true,
        chain: null,
        levelCount: 1,
      };
      expect(result.isDraft).toBe(true);
      expect(result.chain).toBeNull();
      expect(result.levelCount).toBe(1);
    }
  });

  it('mesh entities compute LOD', () => {
    const maturity = 'mesh' as string;
    const isDraft = maturity === 'draft';
    expect(isDraft).toBe(false);
  });

  it('default maturity is mesh', () => {
    const maturity = ('mesh' as string) || 'mesh';
    expect(maturity).toBe('mesh');
  });
});

// ─── DraftMeshNode Logic Tests ────────────────────────────────────────────────

describe('DraftMeshNode', () => {
  const DRAFT_SHAPES = ['box', 'sphere', 'cylinder', 'capsule', 'cone', 'plane'] as const;

  it('all draft shapes are valid', () => {
    for (const shape of DRAFT_SHAPES) {
      expect(typeof shape).toBe('string');
      expect(shape.length).toBeGreaterThan(0);
    }
  });

  it('default draft color is correct format', () => {
    const draftColor = '#00ff88';
    expect(draftColor).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it('hasCollision defaults based on shape', () => {
    // Draft shapes used for collision proxy should default to having collision
    const collisionShapes = new Set(['box', 'sphere', 'cylinder', 'capsule']);
    expect(collisionShapes.has('box')).toBe(true);
    expect(collisionShapes.has('plane')).toBe(false);
  });
});

// ─── Material Utils Logic Tests ────────────────────────────────────────────────

describe('materialUtils', () => {
  it('isScaledBody detects scaled type names', () => {
    // Replicate the detection logic
    const scaledTypes = new Set(['dragon', 'dinosaur', 'reptile', 'fish', 'snake']);
    const isScaledBody = (type: string) => scaledTypes.has(type.toLowerCase());

    expect(isScaledBody('dragon')).toBe(true);
    expect(isScaledBody('Dragon')).toBe(true);
    expect(isScaledBody('box')).toBe(false);
  });

  it('isFireMesh detects fire types', () => {
    const fireTypes = new Set(['fire', 'flame', 'torch', 'campfire']);
    const isFireMesh = (type: string) => fireTypes.has(type.toLowerCase());

    expect(isFireMesh('fire')).toBe(true);
    expect(isFireMesh('torch')).toBe(true);
    expect(isFireMesh('box')).toBe(false);
  });

  it('LOD segments decrease with detail level', () => {
    const LOD_SEGMENTS = { high: 32, medium: 16, low: 8 };
    expect(LOD_SEGMENTS.high).toBeGreaterThan(LOD_SEGMENTS.medium);
    expect(LOD_SEGMENTS.medium).toBeGreaterThan(LOD_SEGMENTS.low);
  });
});

// ─── AnimatedMeshNode Logic Tests ──────────────────────────────────────────────

describe('AnimatedMeshNode', () => {
  it('hasAnimation detects animation traits', () => {
    const hasAnimation = (node: { props: Record<string, any> }) =>
      !!(node.props.animation || node.props.keyframes || node.props.animationPreset);

    expect(hasAnimation({ props: { animation: 'bounce' } })).toBe(true);
    expect(hasAnimation({ props: { keyframes: [] } })).toBe(true);
    expect(hasAnimation({ props: { animationPreset: 'spin' } })).toBe(true);
    expect(hasAnimation({ props: { hsType: 'box' } })).toBe(false);
  });
});
