/**
 * Golden-case generator — produces reference create_object calls for each task.
 * These serve as ground-truth for deterministic verifier validation and
 * help diagnose why the judge fails tasks.
 */

import type { Task } from './types';

interface GoldenObject {
  name: string;
  type: string;
  primitive?: string;
  position: [number, number, number];
  scale?: [number, number, number];
  rotation?: [number, number, number] | [number, number, number, number];
  color?: string;
  radius?: number;
  light_type?: string;
  projection?: string;
  /** Camera look-at target (for camera tasks). */
  target?: [number, number, number];
  /** Light direction vector (for directional-light tasks). */
  direction?: [number, number, number];
}

interface GoldenCase {
  task_id: string;
  objects: GoldenObject[];
  notes: string;
}

const GOLDEN_CASES: GoldenCase[] = [
  // --- T06: Yellow cube rotated 45° around Y ---
  {
    task_id: 'T06',
    objects: [
      { name: 'YellowCube', type: 'mesh', primitive: 'cube', position: [0, 0, 0], scale: [1, 1, 1], color: 'yellow', rotation: [0, 45, 0] },
    ],
    notes: 'Single yellow cube at origin with Y rotation of 45 degrees',
  },

  // --- M02: Stacked cubes ---
  {
    task_id: 'M02',
    objects: [
      { name: 'RedCube', type: 'mesh', primitive: 'cube', position: [0, 0.5, 0], scale: [1, 1, 1], color: 'red' },
      { name: 'GreenCube', type: 'mesh', primitive: 'cube', position: [0, 1.5, 0], scale: [1, 1, 1], color: 'green' },
      { name: 'BlueCube', type: 'mesh', primitive: 'cube', position: [0, 2.5, 0], scale: [1, 1, 1], color: 'blue' },
    ],
    notes: '3 cubes stacked vertically, 1m apart (centers at y=0.5, 1.5, 2.5)',
  },

  // --- M06: Chessboard ---
  {
    task_id: 'M06',
    objects: Array.from({ length: 64 }, (_, i) => {
      const row = Math.floor(i / 8);
      const col = i % 8;
      const isWhite = (row + col) % 2 === 0;
      return {
        name: `Tile_${String.fromCharCode(97 + col)}${row + 1}`,
        type: 'mesh',
        primitive: 'plane',
        position: [col + 0.5, 0, row + 0.5] as [number, number, number],
        scale: [1, 0.01, 1] as [number, number, number],
        color: isWhite ? 'white' : 'black',
      };
    }),
    notes: '8x8 checkerboard, bottom-left at (0,0,0), tiles at y=0, alternating black/white',
  },

  // --- M09: Snowman ---
  {
    task_id: 'M09',
    objects: [
      // Body (bottom to top)
      { name: 'BaseSphere', type: 'mesh', primitive: 'sphere', position: [0, 1.0, 0], radius: 1.0, color: 'white' },
      { name: 'MiddleSphere', type: 'mesh', primitive: 'sphere', position: [0, 2.7, 0], radius: 0.7, color: 'white' },
      { name: 'HeadSphere', type: 'mesh', primitive: 'sphere', position: [0, 3.9, 0], radius: 0.5, color: 'white' },
      // Eyes
      { name: 'LeftEye', type: 'mesh', primitive: 'sphere', position: [-0.15, 4.0, 0.4], radius: 0.05, color: 'black' },
      { name: 'RightEye', type: 'mesh', primitive: 'sphere', position: [0.15, 4.0, 0.4], radius: 0.05, color: 'black' },
    ],
    notes: '3 body spheres (r=1.0, 0.7, 0.5) stacked touching, 2 black eye spheres on head',
  },

  // --- A01: Office tower with windows ---
  {
    task_id: 'A01',
    objects: [
      // 3 floors
      ...[0, 1, 2].map((floor) => ({
        name: `Floor${floor + 1}`,
        type: 'mesh',
        primitive: 'cube',
        position: [0, floor * 3 + 1.5, 0] as [number, number, number],
        scale: [10, 3, 10] as [number, number, number],
        color: 'gray',
      })),
      // 48 windows: 3 floors × 4 faces × 4 windows
      ...Array.from({ length: 48 }, (_, i) => {
        const floor = Math.floor(i / 16);
        const face = Math.floor((i % 16) / 4);
        const win = i % 4;
        const y = floor * 3 + 1.5;
        // Faces: 0=+X, 1=-X, 2=+Z, 3=-Z
        let pos: [number, number, number];
        if (face === 0) pos = [5.1, y, -3 + win * 2];
        else if (face === 1) pos = [-5.1, y, -3 + win * 2];
        else if (face === 2) pos = [-3 + win * 2, y, 5.1];
        else pos = [-3 + win * 2, y, -5.1];
        return {
          name: `Window_F${floor + 1}_Face${face}_W${win}`,
          type: 'mesh',
          primitive: 'cube',
          position: pos,
          scale: [0.8, 1.5, 0.1] as [number, number, number],
          color: 'lightblue',
        };
      }),
    ],
    notes: '3 floors (10x10x3) at y=1.5, 4.5, 7.5 + 48 windows (4 per face per floor)',
  },

  // --- A04: Maze ---
  {
    task_id: 'A04',
    objects: [
      // Floor
      { name: 'Floor', type: 'mesh', primitive: 'plane', position: [5, 0, 5], scale: [10, 0.01, 10], color: 'lightgray' },
      // Start and goal markers
      { name: 'Start', type: 'mesh', primitive: 'cube', position: [0.5, 0.1, 0.5], scale: [0.2, 0.2, 0.2], color: 'green' },
      { name: 'Goal', type: 'mesh', primitive: 'cube', position: [9.5, 0.1, 9.5], scale: [0.2, 0.2, 0.2], color: 'red' },
      // Outer walls (perimeter)
      ...[
        { name: 'Wall_North', pos: [5, 0.75, 0] as [number, number, number], scale: [10, 1.5, 0.1] as [number, number, number] },
        { name: 'Wall_South', pos: [5, 0.75, 10] as [number, number, number], scale: [10, 1.5, 0.1] as [number, number, number] },
        { name: 'Wall_East', pos: [10, 0.75, 5] as [number, number, number], scale: [0.1, 1.5, 10] as [number, number, number] },
        { name: 'Wall_West', pos: [0, 0.75, 5] as [number, number, number], scale: [0.1, 1.5, 10] as [number, number, number] },
      ].map(({ pos, ...w }) => ({ ...w, position: pos, type: 'mesh', primitive: 'cube', color: 'brown' })),
      // Interior walls — simplified spanning tree maze (removes some walls)
      ...[
        // Vertical walls at x=2, 4, 6, 8 (with gaps)
        { name: 'V2_full', pos: [2, 0.75, 3] as [number, number, number], scale: [0.1, 1.5, 6] as [number, number, number] },
        { name: 'V4_gap', pos: [4, 0.75, 7] as [number, number, number], scale: [0.1, 1.5, 6] as [number, number, number] },
        { name: 'V6_full', pos: [6, 0.75, 3] as [number, number, number], scale: [0.1, 1.5, 6] as [number, number, number] },
        { name: 'V8_gap', pos: [8, 0.75, 7] as [number, number, number], scale: [0.1, 1.5, 6] as [number, number, number] },
        // Horizontal walls at z=2, 4, 6, 8 (with gaps)
        { name: 'H2_full', pos: [3, 0.75, 2] as [number, number, number], scale: [6, 1.5, 0.1] as [number, number, number] },
        { name: 'H4_gap', pos: [7, 0.75, 4] as [number, number, number], scale: [6, 1.5, 0.1] as [number, number, number] },
        { name: 'H6_full', pos: [3, 0.75, 6] as [number, number, number], scale: [6, 1.5, 0.1] as [number, number, number] },
        { name: 'H8_gap', pos: [7, 0.75, 8] as [number, number, number], scale: [6, 1.5, 0.1] as [number, number, number] },
      ].map(({ pos, ...w }) => ({ ...w, position: pos, type: 'mesh', primitive: 'cube', color: 'brown' })),
    ],
    notes: '5x5 grid (2m cells), outer perimeter + interior walls forming unique path from (0,0) to (4,4)',
  },

  // --- A10: Gear assembly ---
  {
    task_id: 'A10',
    objects: [
      // Large gear
      { name: 'LargeGear', type: 'mesh', primitive: 'cylinder', position: [0, 0, 0], radius: 1.0, scale: [1, 0.2, 1] as [number, number, number], color: 'silver' },
      // Small gear (tangent at +X, distance = 1.0 + 0.4 = 1.4)
      { name: 'SmallGear', type: 'mesh', primitive: 'cylinder', position: [1.4, 0, 0], radius: 0.4, scale: [1, 0.2, 1] as [number, number, number], color: 'silver' },
      // 8 teeth on large gear (cubes around rim)
      ...Array.from({ length: 8 }, (_, i) => {
        const angle = (i / 8) * Math.PI * 2;
        return {
          name: `LargeTooth_${i}`,
          type: 'mesh',
          primitive: 'cube',
          position: [Math.cos(angle) * 1.0, 0, Math.sin(angle) * 1.0] as [number, number, number],
          scale: [0.15, 0.25, 0.15] as [number, number, number],
          color: 'silver',
        };
      }),
      // 8 teeth on small gear
      ...Array.from({ length: 8 }, (_, i) => {
        const angle = (i / 8) * Math.PI * 2;
        return {
          name: `SmallTooth_${i}`,
          type: 'mesh',
          primitive: 'cube',
          position: [1.4 + Math.cos(angle) * 0.4, 0, Math.sin(angle) * 0.4] as [number, number, number],
          scale: [0.1, 0.2, 0.1] as [number, number, number],
          color: 'silver',
        };
      }),
      // Axles (thin cylinders through centers)
      { name: 'LargeAxle', type: 'mesh', primitive: 'cylinder', position: [0, 0, 0], radius: 0.05, scale: [1, 1.5, 1] as [number, number, number], color: 'gray' },
      { name: 'SmallAxle', type: 'mesh', primitive: 'cylinder', position: [1.4, 0, 0], radius: 0.05, scale: [1, 1.5, 1] as [number, number, number], color: 'gray' },
    ],
    notes: 'Large gear (r=1.0) at origin, small gear (r=0.4) at (1.4,0,0), 8 teeth each, gray axles',
  },

  // --- T01: Single red cube at world origin ---
  {
    task_id: 'T01',
    objects: [
      { name: 'RedCube', type: 'mesh', primitive: 'cube', position: [0, 0, 0], scale: [1, 1, 1], color: 'red' },
    ],
    notes: 'Single red cube at the world origin',
  },

  // --- T02: Blue sphere of radius 0.5 at (1, 0, 0) ---
  {
    task_id: 'T02',
    objects: [
      { name: 'BlueSphere', type: 'mesh', primitive: 'sphere', position: [1, 0, 0], radius: 0.5, color: 'blue' },
    ],
    notes: 'Blue sphere, radius 0.5, at (1, 0, 0)',
  },

  // --- T03: Green cylinder of height 2 standing on the ground ---
  {
    task_id: 'T03',
    objects: [
      // Center at y=1 so bottom rests at y=0 with scale.y=2 (full height).
      { name: 'GreenCylinder', type: 'mesh', primitive: 'cylinder', position: [0, 1, 0], scale: [1, 2, 1], color: 'green' },
    ],
    notes: 'Green cylinder, height 2 (scale.y), bottom on y=0 ground (center at y=1)',
  },

  // --- T04: Directional light pointing downward ---
  {
    task_id: 'T04',
    objects: [
      {
        name: 'SunLight',
        type: 'light',
        position: [0, 10, 0],
        light_type: 'directional',
        direction: [0, -1, 0],
        color: 'white',
      },
    ],
    notes: 'Directional light, direction (0, -1, 0) — pointing straight down',
  },

  // --- T05: 10x10 gray ground plane ---
  {
    task_id: 'T05',
    objects: [
      // Plane primitive defaults to xz-plane (normal +Y), so no rotation needed.
      { name: 'Ground', type: 'mesh', primitive: 'plane', position: [0, 0, 0], scale: [10, 1, 10], color: 'gray' },
    ],
    notes: '10x10 gray ground plane in the xz-plane',
  },

  // --- T07: Perspective camera at (5,5,5) looking at origin ---
  {
    task_id: 'T07',
    objects: [
      {
        name: 'MainCamera',
        type: 'camera',
        position: [5, 5, 5],
        projection: 'perspective',
        target: [0, 0, 0],
      },
    ],
    notes: 'Perspective camera at (5,5,5) looking at world origin',
  },

  // --- T08: Torus (major=1, minor=0.25) at (0,1,0) ---
  // Major/minor radii are not tracked as distinct ParsedObject fields; the
  // verifier only checks count + position. The dimensional criteria fall
  // through to the LLM judge for nuanced verdict.
  {
    task_id: 'T08',
    objects: [
      { name: 'Torus', type: 'mesh', primitive: 'torus', position: [0, 1, 0], scale: [1, 1, 1] },
    ],
    notes: 'Single torus at (0,1,0) — major/minor radii not deterministically captured',
  },

  // --- T10: Single white point light at (2, 4, 2) ---
  {
    task_id: 'T10',
    objects: [
      {
        name: 'PointLight',
        type: 'light',
        position: [2, 4, 2],
        light_type: 'point',
        color: 'white',
      },
    ],
    notes: 'Single white point light at (2, 4, 2)',
  },
];

export function getGoldenCase(taskId: string): GoldenCase | undefined {
  return GOLDEN_CASES.find((g) => g.task_id === taskId);
}

export function listGoldenCaseIds(): string[] {
  return GOLDEN_CASES.map((g) => g.task_id);
}
