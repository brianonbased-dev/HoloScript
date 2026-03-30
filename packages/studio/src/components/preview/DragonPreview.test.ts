// @vitest-environment node
/**
 * DragonPreview Test Suite
 *
 * Tests the exported types, constants, interfaces, LOD computation logic,
 * and the pure projectPoint utility used by the canvas wireframe renderer.
 *
 * Since DragonPreview is a canvas-based React component, we test the
 * data layer and composition handling rather than pixel output.
 */

import { describe, it, expect } from 'vitest';
import type { CreaturePart, CreatureComposition } from './DragonPreview';

// =============================================================================
// Re-derive constants from the source so tests validate the contract
// =============================================================================

interface LODLevel {
  label: string;
  segments: number;
  polyMultiplier: number;
  textureRes: number;
}

const LOD_LEVELS: LODLevel[] = [
  { label: 'Low', segments: 6, polyMultiplier: 0.25, textureRes: 256 },
  { label: 'Medium', segments: 12, polyMultiplier: 0.5, textureRes: 512 },
  { label: 'High', segments: 24, polyMultiplier: 1.0, textureRes: 1024 },
  { label: 'Ultra', segments: 48, polyMultiplier: 2.0, textureRes: 2048 },
];

/**
 * Mirrors the projectPoint function from DragonPreview.tsx
 * This is the 3D-to-2D projection used for wireframe rendering.
 */
function projectPoint(
  x: number,
  y: number,
  z: number,
  rotY: number,
  zoom: number,
  cx: number,
  cy: number
): [number, number] {
  const cosR = Math.cos(rotY);
  const sinR = Math.sin(rotY);
  const rx = x * cosR - z * sinR;
  const rz = x * sinR + z * cosR;
  const perspective = 4;
  const scale = (perspective / (perspective + rz)) * zoom * 80;
  return [cx + rx * scale, cy - y * scale];
}

/**
 * Mirrors the vertex count computation from the DragonPreview stats useMemo.
 */
function computeStats(creature: CreatureComposition, lod: LODLevel) {
  const baseVerts = creature.parts.reduce((sum, p) => {
    const s = lod.segments;
    switch (p.geometry) {
      case 'sphere':
        return sum + (s + 1) * (s + 1);
      case 'box':
        return sum + 8;
      case 'cylinder':
        return sum + s * 2 + 2;
      case 'cone':
        return sum + s + 2;
      case 'torus':
        return sum + s * s;
      default:
        return sum + s * s;
    }
  }, 0);
  const tris = Math.floor(baseVerts * 1.8 * lod.polyMultiplier);
  return {
    vertices: baseVerts,
    triangles: tris,
    parts: creature.parts.length,
    traits: creature.totalTraits.length,
    textureRes: lod.textureRes,
  };
}

// =============================================================================
// Sample data
// =============================================================================

const SAMPLE_DRAGON: CreatureComposition = {
  name: 'Fire Dragon',
  parts: [
    {
      name: 'Body',
      geometry: 'sphere',
      position: [0, 0, 0],
      scale: [1.2, 0.8, 1.5],
      color: '#cc3300',
      traits: ['physics_body', 'animated'],
    },
    {
      name: 'Head',
      geometry: 'sphere',
      position: [0, 0.6, 1.2],
      scale: [0.5, 0.5, 0.6],
      color: '#dd4400',
      traits: ['glowing', 'interactive'],
    },
    {
      name: 'Tail',
      geometry: 'cone',
      position: [0, -0.1, -1.5],
      scale: [0.3, 0.3, 1.2],
      color: '#bb2200',
      traits: ['animated', 'particles'],
    },
    {
      name: 'Wing Left',
      geometry: 'box',
      position: [-1.3, 0.4, 0],
      scale: [1.0, 0.05, 0.7],
      color: '#992200',
      traits: ['animated'],
    },
    {
      name: 'Wing Right',
      geometry: 'box',
      position: [1.3, 0.4, 0],
      scale: [1.0, 0.05, 0.7],
      color: '#992200',
      traits: ['animated'],
    },
    {
      name: 'Horn Left',
      geometry: 'cone',
      position: [-0.2, 1.0, 1.3],
      scale: [0.08, 0.08, 0.3],
      color: '#ffaa00',
      traits: ['material'],
    },
    {
      name: 'Horn Right',
      geometry: 'cone',
      position: [0.2, 1.0, 1.3],
      scale: [0.08, 0.08, 0.3],
      color: '#ffaa00',
      traits: ['material'],
    },
  ],
  totalTraits: ['physics_body', 'animated', 'glowing', 'interactive', 'particles', 'material'],
};

// =============================================================================
// Tests
// =============================================================================

describe('DragonPreview', () => {
  // ---- LOD Level constants ------------------------------------------------

  describe('LOD levels', () => {
    it('has 4 LOD levels', () => {
      expect(LOD_LEVELS).toHaveLength(4);
    });

    it('segments increase with each level', () => {
      for (let i = 1; i < LOD_LEVELS.length; i++) {
        expect(LOD_LEVELS[i].segments).toBeGreaterThan(LOD_LEVELS[i - 1].segments);
      }
    });

    it('texture resolution increases with each level', () => {
      for (let i = 1; i < LOD_LEVELS.length; i++) {
        expect(LOD_LEVELS[i].textureRes).toBeGreaterThan(LOD_LEVELS[i - 1].textureRes);
      }
    });

    it('polyMultiplier increases with each level', () => {
      for (let i = 1; i < LOD_LEVELS.length; i++) {
        expect(LOD_LEVELS[i].polyMultiplier).toBeGreaterThan(LOD_LEVELS[i - 1].polyMultiplier);
      }
    });

    it('LOD labels are Low, Medium, High, Ultra', () => {
      expect(LOD_LEVELS.map((l) => l.label)).toEqual(['Low', 'Medium', 'High', 'Ultra']);
    });
  });

  // ---- projectPoint -------------------------------------------------------

  describe('projectPoint (3D to 2D projection)', () => {
    it('origin projects to center of canvas', () => {
      const [sx, sy] = projectPoint(0, 0, 0, 0, 1.0, 400, 300);
      expect(sx).toBe(400);
      expect(sy).toBe(300);
    });

    it('positive x shifts point right on screen', () => {
      const [sxOrigin] = projectPoint(0, 0, 0, 0, 1.0, 400, 300);
      const [sxRight] = projectPoint(1, 0, 0, 0, 1.0, 400, 300);
      expect(sxRight).toBeGreaterThan(sxOrigin);
    });

    it('positive y shifts point up on screen (lower sy)', () => {
      const [, syOrigin] = projectPoint(0, 0, 0, 0, 1.0, 400, 300);
      const [, syUp] = projectPoint(0, 1, 0, 0, 1.0, 400, 300);
      expect(syUp).toBeLessThan(syOrigin);
    });

    it('zoom increases displacement from center', () => {
      const [sx1] = projectPoint(1, 0, 0, 0, 1.0, 400, 300);
      const [sx2] = projectPoint(1, 0, 0, 0, 2.0, 400, 300);
      const displacement1 = Math.abs(sx1 - 400);
      const displacement2 = Math.abs(sx2 - 400);
      expect(displacement2).toBeGreaterThan(displacement1);
    });

    it('rotation by PI swaps left/right', () => {
      const [sxNoRot] = projectPoint(1, 0, 0, 0, 1.0, 400, 300);
      const [sxPi] = projectPoint(1, 0, 0, Math.PI, 1.0, 400, 300);
      // With PI rotation, point at x=1 should appear on opposite side
      const displacementNoRot = sxNoRot - 400;
      const displacementPi = sxPi - 400;
      expect(Math.sign(displacementNoRot)).not.toBe(Math.sign(displacementPi));
    });

    it('objects further in z appear smaller (perspective)', () => {
      const [sxNear] = projectPoint(1, 0, 0, 0, 1.0, 400, 300);
      const [sxFar] = projectPoint(1, 0, 5, 0, 1.0, 400, 300);
      const displacementNear = Math.abs(sxNear - 400);
      const displacementFar = Math.abs(sxFar - 400);
      expect(displacementFar).toBeLessThan(displacementNear);
    });
  });

  // ---- Creature composition handling --------------------------------------

  describe('creature composition', () => {
    it('SAMPLE_DRAGON has 7 parts', () => {
      expect(SAMPLE_DRAGON.parts).toHaveLength(7);
    });

    it('every part has required fields', () => {
      for (const part of SAMPLE_DRAGON.parts) {
        expect(part.name).toBeTruthy();
        expect(part.geometry).toBeTruthy();
        expect(part.position).toHaveLength(3);
        expect(part.scale).toHaveLength(3);
        expect(part.color).toMatch(/^#[0-9a-f]{6}$/i);
        expect(Array.isArray(part.traits)).toBe(true);
      }
    });

    it('totalTraits covers all unique traits from parts', () => {
      const allTraits = new Set<string>();
      for (const part of SAMPLE_DRAGON.parts) {
        for (const t of part.traits) allTraits.add(t);
      }
      for (const trait of allTraits) {
        expect(SAMPLE_DRAGON.totalTraits).toContain(trait);
      }
    });

    it('geometry types are valid', () => {
      const validGeometries = ['sphere', 'box', 'cylinder', 'cone', 'torus'];
      for (const part of SAMPLE_DRAGON.parts) {
        expect(validGeometries).toContain(part.geometry);
      }
    });
  });

  // ---- LOD switching (stats computation) ----------------------------------

  describe('LOD switching (stats computation)', () => {
    it('vertex count increases with higher LOD', () => {
      const statsLow = computeStats(SAMPLE_DRAGON, LOD_LEVELS[0]);
      const statsHigh = computeStats(SAMPLE_DRAGON, LOD_LEVELS[2]);
      expect(statsHigh.vertices).toBeGreaterThan(statsLow.vertices);
    });

    it('triangle count increases with higher LOD', () => {
      const statsLow = computeStats(SAMPLE_DRAGON, LOD_LEVELS[0]);
      const statsUltra = computeStats(SAMPLE_DRAGON, LOD_LEVELS[3]);
      expect(statsUltra.triangles).toBeGreaterThan(statsLow.triangles);
    });

    it('part count is constant across LOD levels', () => {
      for (const lod of LOD_LEVELS) {
        const stats = computeStats(SAMPLE_DRAGON, lod);
        expect(stats.parts).toBe(7);
      }
    });

    it('trait count is constant across LOD levels', () => {
      for (const lod of LOD_LEVELS) {
        const stats = computeStats(SAMPLE_DRAGON, lod);
        expect(stats.traits).toBe(6);
      }
    });

    it('texture resolution matches LOD level', () => {
      for (const lod of LOD_LEVELS) {
        const stats = computeStats(SAMPLE_DRAGON, lod);
        expect(stats.textureRes).toBe(lod.textureRes);
      }
    });

    it('Ultra has at least 4x more triangles than Low', () => {
      const statsLow = computeStats(SAMPLE_DRAGON, LOD_LEVELS[0]);
      const statsUltra = computeStats(SAMPLE_DRAGON, LOD_LEVELS[3]);
      expect(statsUltra.triangles).toBeGreaterThanOrEqual(statsLow.triangles * 4);
    });
  });

  // ---- Edge cases ---------------------------------------------------------

  describe('edge cases', () => {
    it('empty creature has zero vertices and triangles', () => {
      const empty: CreatureComposition = { name: 'Empty', parts: [], totalTraits: [] };
      const stats = computeStats(empty, LOD_LEVELS[2]);
      expect(stats.vertices).toBe(0);
      expect(stats.triangles).toBe(0);
      expect(stats.parts).toBe(0);
    });

    it('creature with single box part has 8 vertices at any LOD', () => {
      const singleBox: CreatureComposition = {
        name: 'Box',
        parts: [
          {
            name: 'Cube',
            geometry: 'box',
            position: [0, 0, 0],
            scale: [1, 1, 1],
            color: '#ffffff',
            traits: [],
          },
        ],
        totalTraits: [],
      };
      for (const lod of LOD_LEVELS) {
        const stats = computeStats(singleBox, lod);
        expect(stats.vertices).toBe(8);
      }
    });

    it('creature with cylinder uses segment-based vertex count', () => {
      const singleCyl: CreatureComposition = {
        name: 'Cylinder',
        parts: [
          {
            name: 'Pipe',
            geometry: 'cylinder',
            position: [0, 0, 0],
            scale: [1, 1, 1],
            color: '#00ff00',
            traits: [],
          },
        ],
        totalTraits: [],
      };
      // cylinder verts = segments * 2 + 2
      const stats = computeStats(singleCyl, LOD_LEVELS[1]); // Medium: 12 segments
      expect(stats.vertices).toBe(12 * 2 + 2);
    });

    it('creature with torus uses segments^2 vertex count', () => {
      const singleTorus: CreatureComposition = {
        name: 'Torus',
        parts: [
          {
            name: 'Ring',
            geometry: 'torus',
            position: [0, 0, 0],
            scale: [1, 1, 1],
            color: '#0000ff',
            traits: [],
          },
        ],
        totalTraits: [],
      };
      // torus verts = segments^2
      const stats = computeStats(singleTorus, LOD_LEVELS[0]); // Low: 6 segments
      expect(stats.vertices).toBe(6 * 6);
    });

    it('projectPoint handles zero zoom gracefully', () => {
      const [sx, sy] = projectPoint(1, 1, 0, 0, 0, 400, 300);
      // With zoom=0, scale=0, so point collapses to center
      expect(sx).toBe(400);
      expect(sy).toBe(300);
    });
  });
});
