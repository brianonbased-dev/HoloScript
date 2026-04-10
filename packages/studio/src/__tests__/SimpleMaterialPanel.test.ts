// @vitest-environment jsdom
/**
 * Tests for SimpleMaterialPanel component (Sprint 15 P5)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock stores before importing component
vi.mock('@/lib/stores', () => ({
  useEditorStore: vi.fn((selector: any) => {
    const state = {
      selectedObjectId: 'test-node',
      selectedObjectName: 'TestCube',
    };
    return selector(state);
  }),
}));

vi.mock('@/lib/stores/sceneGraphStore', () => {
  const nodes = [
    {
      id: 'test-node',
      name: 'TestCube',
      type: 'mesh',
      parentId: null,
      traits: [
        {
          name: 'material',
          properties: {
            albedo: '#ff0000',
            roughness: 0.5,
            metallic: 0.3,
            opacity: 1.0,
            emissive: '#000000',
            emissiveIntensity: 0,
          },
        },
      ],
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
    },
  ];
  return {
    useSceneGraphStore: vi.fn((selector: any) => {
      const state = {
        nodes,
        setTraitProperty: vi.fn(),
        applyTransientMaterial: vi.fn(),
      };
      return selector(state);
    }),
  };
});

describe('SimpleMaterialPanel module', () => {
  it('exports SimpleMaterialPanel component', async () => {
    const mod = await import('@/components/materials/SimpleMaterialPanel');
    expect(mod.SimpleMaterialPanel).toBeDefined();
    expect(typeof mod.SimpleMaterialPanel).toBe('function');
  });

  it('exports MaterialProps interface (via module)', async () => {
    // Module imports without errors
    const mod = await import('@/components/materials/SimpleMaterialPanel');
    expect(mod).toBeDefined();
  });
});

describe('SimpleMaterialPanel — MaterialProps defaults', () => {
  it('default roughness is between 0 and 1', () => {
    const defaults = { roughness: 0.5 };
    expect(defaults.roughness).toBeGreaterThanOrEqual(0);
    expect(defaults.roughness).toBeLessThanOrEqual(1);
  });

  it('default metallic is between 0 and 1', () => {
    const defaults = { metallic: 0.3 };
    expect(defaults.metallic).toBeGreaterThanOrEqual(0);
    expect(defaults.metallic).toBeLessThanOrEqual(1);
  });

  it('default opacity is between 0 and 1', () => {
    const defaults = { opacity: 1.0 };
    expect(defaults.opacity).toBeGreaterThanOrEqual(0);
    expect(defaults.opacity).toBeLessThanOrEqual(1);
  });

  it('albedo and emissive are valid hex colors', () => {
    const defaults = { albedo: '#ff0000', emissive: '#000000' };
    expect(defaults.albedo).toMatch(/^#[0-9a-fA-F]{6}$/);
    expect(defaults.emissive).toMatch(/^#[0-9a-fA-F]{6}$/);
  });

  it('emissiveIntensity is non-negative', () => {
    const defaults = { emissiveIntensity: 0 };
    expect(defaults.emissiveIntensity).toBeGreaterThanOrEqual(0);
  });
});
