import type { Vector3 } from '@holoscript/core';
/**
 * BuildingGenerator.ts
 *
 * Procedural architecture generator.
 * Creates building structures from modular floor plans with variations.
 *
 * @module procedural
 */

import { IVector3 } from '../physics/PhysicsTypes';

// =============================================================================
// TYPES
// =============================================================================

export interface BuildingConfig {
  id: string;
  floors: number;
  floorHeight: number;
  footprint: { width: number; depth: number };
  style: BuildingStyle;
  seed: number;
}

export type BuildingStyle = 'residential' | 'commercial' | 'industrial' | 'tower' | 'warehouse';

export interface FloorPlan {
  floor: number;
  rooms: Room[];
  walls: Wall[];
  openings: Opening[];
}

export interface Room {
  id: string;
  type: 'room' | 'hallway' | 'stairwell' | 'elevator' | 'lobby';
  bounds: { x: number; z: number; width: number; depth: number };
  height: number;
}

export interface Wall {
  start: { x: number; z: number };
  end: { x: number; z: number };
  height: number;
  thickness: number;
  isExterior: boolean;
}

export interface Opening {
  type: 'door' | 'window';
  wall: number; // Wall index
  position: number; // 0-1 along the wall
  width: number;
  height: number;
  sillHeight?: number; // For windows
}

export interface BuildingResult {
  config: BuildingConfig;
  floorPlans: FloorPlan[];
  meshData: {
    vertices: IVector3[];
    faces: number[];
  };
  boundingBox: { min: IVector3; max: IVector3 };
}

// =============================================================================
// STYLE PRESETS
// =============================================================================

const STYLE_PARAMS: Record<
  BuildingStyle,
  {
    roomCountRange: [number, number];
    windowDensity: number;
    hasLobby: boolean;
    roofType: 'flat' | 'pitched' | 'dome';
    wallThickness: number;
  }
> = {
  residential: {
    roomCountRange: [3, 6],
    windowDensity: 0.6,
    hasLobby: false,
    roofType: 'pitched',
    wallThickness: 0.2,
  },
  commercial: {
    roomCountRange: [4, 10],
    windowDensity: 0.8,
    hasLobby: true,
    roofType: 'flat',
    wallThickness: 0.15,
  },
  industrial: {
    roomCountRange: [1, 3],
    windowDensity: 0.2,
    hasLobby: false,
    roofType: 'flat',
    wallThickness: 0.3,
  },
  tower: {
    roomCountRange: [2, 4],
    windowDensity: 0.9,
    hasLobby: true,
    roofType: 'flat',
    wallThickness: 0.2,
  },
  warehouse: {
    roomCountRange: [1, 2],
    windowDensity: 0.1,
    hasLobby: false,
    roofType: 'pitched',
    wallThickness: 0.25,
  },
};

// =============================================================================
// BUILDING GENERATOR
// =============================================================================

export class BuildingGenerator {
  private rng: () => number;

  constructor(seed: number = 42) {
    this.rng = this.createRng(seed);
  }

  // ---------------------------------------------------------------------------
  // Generation
  // ---------------------------------------------------------------------------

  generate(config: BuildingConfig): BuildingResult {
    this.rng = this.createRng(config.seed);

    const style = STYLE_PARAMS[config.style];
    const floorPlans: FloorPlan[] = [];

    for (let floor = 0; floor < config.floors; floor++) {
      const plan = this.generateFloor(config, floor, style);
      floorPlans.push(plan);
    }

    const meshData = this.generateMesh(config, floorPlans);
    const halfW = config.footprint.width / 2;
    const halfD = config.footprint.depth / 2;

    return {
      config,
      floorPlans,
      meshData,
      boundingBox: {
        min: [-halfW, 0, -halfD ],
        max: [halfW, config.floors * config.floorHeight, halfD ],
      },
    };
  }

  // ---------------------------------------------------------------------------
  // Floor Plan Generation
  // ---------------------------------------------------------------------------

  private generateFloor(
    config: BuildingConfig,
    floorIndex: number,
    style: (typeof STYLE_PARAMS)['residential']
  ): FloorPlan {
    const rooms: Room[] = [];
    const walls: Wall[] = [];
    const openings: Opening[] = [];

    const w = config.footprint.width;
    const d = config.footprint.depth;
    const h = config.floorHeight;

    // Ground floor lobby
    if (floorIndex === 0 && style.hasLobby) {
      rooms.push({
        id: `lobby_${floorIndex}`,
        type: 'lobby',
        bounds: { x: 0, z: 0, width: w, depth: d * 0.3 },
        height: h,
      });
    }

    // Generate rooms via grid subdivision
    const roomCount =
      style.roomCountRange[0] +
      Math.floor(this.rng() * (style.roomCountRange[1] - style.roomCountRange[0] + 1));

    const cols = Math.ceil(Math.sqrt(roomCount));
    const rows = Math.ceil(roomCount / cols);
    const roomW = w / cols;
    const roomD = d / rows;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (rooms.length >= roomCount) break;

        const jitterX = (this.rng() - 0.5) * roomW * 0.1;
        const jitterZ = (this.rng() - 0.5) * roomD * 0.1;

        rooms.push({
          id: `room_${floorIndex}_${r}_${c}`,
          type: 'room',
          bounds: {
            x: c * roomW + jitterX,
            z: r * roomD + jitterZ,
            width: roomW,
            depth: roomD,
          },
          height: h,
        });
      }
    }

    // Add stairwell
    rooms.push({
      id: `stairwell_${floorIndex}`,
      type: 'stairwell',
      bounds: { x: w - 2, z: d - 2, width: 2, depth: 2 },
      height: h,
    });

    // Exterior walls
    const wallThick = style.wallThickness;
    const _baseY = floorIndex * h;

    // North wall
    walls.push({
      start: { x: 0, z: 0 },
      end: { x: w, z: 0 },
      height: h,
      thickness: wallThick,
      isExterior: true,
    });
    // South wall
    walls.push({
      start: { x: 0, z: d },
      end: { x: w, z: d },
      height: h,
      thickness: wallThick,
      isExterior: true,
    });
    // West wall
    walls.push({
      start: { x: 0, z: 0 },
      end: { x: 0, z: d },
      height: h,
      thickness: wallThick,
      isExterior: true,
    });
    // East wall
    walls.push({
      start: { x: w, z: 0 },
      end: { x: w, z: d },
      height: h,
      thickness: wallThick,
      isExterior: true,
    });

    // Windows on exterior walls
    for (let wi = 0; wi < walls.length; wi++) {
      const wall = walls[wi];
      if (!wall.isExterior) continue;

      const wallLen = Math.sqrt(
        Math.pow(wall.end[0] - wall.start[0], 2) + Math.pow(wall.end[2] - wall.start[2], 2)
      );

      const windowCount = Math.floor(wallLen * style.windowDensity);
      for (let wn = 0; wn < windowCount; wn++) {
        openings.push({
          type: 'window',
          wall: wi,
          position: (wn + 0.5) / windowCount,
          width: 1.0,
          height: 1.2,
          sillHeight: 0.9,
        });
      }
    }

    // Door on ground floor
    if (floorIndex === 0) {
      openings.push({
        type: 'door',
        wall: 0,
        position: 0.5,
        width: 1.2,
        height: 2.2,
      });
    }

    return { floor: floorIndex, rooms, walls, openings };
  }

  // ---------------------------------------------------------------------------
  // Mesh Generation (simplified box geometry)
  // ---------------------------------------------------------------------------

  private generateMesh(
    config: BuildingConfig,
    _floorPlans: FloorPlan[]
  ): { vertices: IVector3[]; faces: number[] } {
    const vertices: IVector3[] = [];
    const faces: number[] = [];

    const w = config.footprint.width;
    const d = config.footprint.depth;
    const h = config.floors * config.floorHeight;
    const hw = w / 2;
    const hd = d / 2;

    // 8 corners of the building box
    const base = vertices.length;
    vertices.push(
      [-hw, 0, -hd ], // 0: bottom-front-left
      [hw, 0, -hd ], // 1: bottom-front-right
      [hw, 0, hd ], // 2: bottom-back-right
      [-hw, 0, hd ], // 3: bottom-back-left
      [-hw, h, -hd ], // 4: top-front-left
      [hw, h, -hd ], // 5: top-front-right
      [hw, h, hd ], // 6: top-back-right
      [-hw, h, hd ] // 7: top-back-left
    );

    // 6 faces (2 triangles each)
    // Front
    faces.push(base + 0, base + 1, base + 5, base + 0, base + 5, base + 4);
    // Back
    faces.push(base + 2, base + 3, base + 7, base + 2, base + 7, base + 6);
    // Left
    faces.push(base + 3, base + 0, base + 4, base + 3, base + 4, base + 7);
    // Right
    faces.push(base + 1, base + 2, base + 6, base + 1, base + 6, base + 5);
    // Top
    faces.push(base + 4, base + 5, base + 6, base + 4, base + 6, base + 7);
    // Bottom
    faces.push(base + 0, base + 3, base + 2, base + 0, base + 2, base + 1);

    return { vertices, faces };
  }

  // ---------------------------------------------------------------------------
  // Internal
  // ---------------------------------------------------------------------------

  private createRng(seed: number): () => number {
    let s = seed;
    return () => {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      return s / 0x7fffffff;
    };
  }
}
