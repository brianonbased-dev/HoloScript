/**
 * HoloGram MLS Compiler — 2D Listing Photos → Depth-Estimated 3D Gallery
 *
 * Takes a set of real-estate listing photos (typically from an MLS feed) and
 * compiles a walkable, depth-displaced 3D gallery where each photo becomes a
 * spatial panel with estimated depth geometry.
 *
 * Pipeline per photo:
 *   @image → @depth_estimation → @displacement → @depth_to_normal
 *
 * Rooms are grouped by label, arranged in a connected grid, and linked by
 * walkable waypoints so users can physically traverse the property.
 *
 * Sovereign classification: build-internal. Uses open depth-estimation models
 * (Depth Anything V2) and HoloScript-native traits.
 *
 * @version 1.0.0
 * @see research/2026-05-10_3d-real-estate-virtual-tour.md (Path C)
 */

import type {
  HoloComposition,
  HoloObjectDecl,
  HoloObjectTrait,
  HoloSpatialGroup,
  HoloLight,
  HoloCamera,
  HoloWaypoints,
} from '../parser/HoloCompositionTypes';

import { CompilerBase } from './CompilerBase';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MLSPhoto {
  /** Image URL or local path */
  url: string;
  /** Room label for grouping (e.g. "Living Room", "Kitchen") */
  room?: string;
  /** Pixel width (optional, used for aspect-ratio scaling) */
  width?: number;
  /** Pixel height (optional) */
  height?: number;
  /** Optional caption shown as a billboard above the photo */
  caption?: string;
}

export interface HoloGramMLSCompilerOptions {
  /** Scale factor for photo panels (default 1.0) */
  photoScale?: number;
  /** Distance between room centers (default 8.0) */
  roomSpacing?: number;
  /** Depth-estimation model name (default "depth-anything-v2-small") */
  depthModel?: string;
  /** Depth backend (default "webgpu") */
  depthBackend?: string;
  /** Displacement scale (default 0.3) */
  displacementScale?: number;
  /** Displacement mesh segments (default 128) */
  displacementSegments?: number;
  /** Add walkable waypoints between rooms (default true) */
  walkable?: boolean;
  /** Ambient light intensity (default 0.4) */
  ambientLight?: number;
  /** Add per-room spot lights (default true) */
  spotLighting?: boolean;
  /** Gallery floor color (default "#1a1a2e") */
  floorColor?: string;
  /** Sky/environment preset (default "night") */
  environment?: string;
}

export interface HoloGramMLSBundle {
  photos: MLSPhoto[];
  /** Optional property metadata for compliance / tagging */
  propertyMetadata?: Record<string, string | number | boolean>;
}

export interface HoloGramMLSCompileResult {
  success: boolean;
  composition?: HoloComposition;
  stats: {
    photos: number;
    rooms: number;
    waypoints: number;
    lights: number;
  };
  warnings: string[];
  errors: string[];
}

// ---------------------------------------------------------------------------
// Layout Engine
// ---------------------------------------------------------------------------

interface RoomLayout {
  name: string;
  photos: MLSPhoto[];
  centerX: number;
  centerZ: number;
  size: number; // room floor size
}

function groupPhotosByRoom(photos: MLSPhoto[]): Map<string, MLSPhoto[]> {
  const groups = new Map<string, MLSPhoto[]>();
  for (const p of photos) {
    const room = p.room?.trim() || 'Uncategorized';
    if (!groups.has(room)) groups.set(room, []);
    groups.get(room)!.push(p);
  }
  return groups;
}

function computeRoomGrid(rooms: string[], spacing: number): Map<string, { x: number; z: number }> {
  const positions = new Map<string, { x: number; z: number }>();
  const cols = Math.ceil(Math.sqrt(rooms.length));
  const offsetX = ((cols - 1) * spacing) / 2;
  const offsetZ = ((Math.ceil(rooms.length / cols) - 1) * spacing) / 2;

  for (let i = 0; i < rooms.length; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    positions.set(rooms[i], {
      x: col * spacing - offsetX,
      z: row * spacing - offsetZ,
    });
  }
  return positions;
}

function aspectScale(photo: MLSPhoto): { x: number; y: number } {
  const w = photo.width ?? 1024;
  const h = photo.height ?? 768;
  const base = 2.0;
  if (w >= h) {
    return { x: base, y: (base * h) / w };
  }
  return { x: (base * w) / h, y: base };
}

function placePhotosInRoom(photos: MLSPhoto[], roomSize: number): Array<{
  photo: MLSPhoto;
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number };
}> {
  const placements: Array<{
    photo: MLSPhoto;
    position: { x: number; y: number; z: number };
    rotation: { x: number; y: number; z: number };
  }> = [];

  const half = roomSize / 2 - 0.5;
  const wallHeight = 1.6;

  if (photos.length === 1) {
    // Single photo on back wall, centered
    placements.push({
      photo: photos[0],
      position: { x: 0, y: wallHeight, z: -half },
      rotation: { x: 0, y: 0, z: 0 },
    });
  } else if (photos.length === 2) {
    // Left and right walls
    placements.push({
      photo: photos[0],
      position: { x: -half, y: wallHeight, z: 0 },
      rotation: { x: 0, y: 90, z: 0 },
    });
    placements.push({
      photo: photos[1],
      position: { x: half, y: wallHeight, z: 0 },
      rotation: { x: 0, y: -90, z: 0 },
    });
  } else {
    // Distribute around walls: back, left, right, front
    const wallOrder = [
      { x: 0, z: -half, ry: 0 },
      { x: -half, z: 0, ry: 90 },
      { x: half, z: 0, ry: -90 },
      { x: 0, z: half, ry: 180 },
    ];
    for (let i = 0; i < photos.length; i++) {
      const wall = wallOrder[i % wallOrder.length];
      const offsetIndex = Math.floor(i / wallOrder.length);
      const offset = (offsetIndex % 2 === 0 ? -1 : 1) * (0.6 + offsetIndex * 0.3);
      placements.push({
        photo: photos[i],
        position: {
          x: wall.x === 0 ? offset : wall.x,
          y: wallHeight + (offsetIndex * 0.3),
          z: wall.z === 0 ? offset : wall.z,
        },
        rotation: { x: 0, y: wall.ry, z: 0 },
      });
    }
  }

  return placements;
}

// ---------------------------------------------------------------------------
// Compiler
// ---------------------------------------------------------------------------

export class HoloGramMLSCompiler extends CompilerBase {
  compilerName = 'hologram_mls';
  version = '1.0.0';

  options: Required<HoloGramMLSCompilerOptions>;

  constructor(options: HoloGramMLSCompilerOptions = {}) {
    super();
    this.options = {
      photoScale: 1.0,
      roomSpacing: 8.0,
      depthModel: 'depth-anything-v2-small',
      depthBackend: 'webgpu',
      displacementScale: 0.3,
      displacementSegments: 128,
      walkable: true,
      ambientLight: 0.4,
      spotLighting: true,
      floorColor: '#1a1a2e',
      environment: 'night',
      ...options,
    };
  }

  /**
   * Satisfy CompilerBase abstract method — HoloGramMLSCompiler is a format-ingest
   * compiler (bundle → HoloComposition). Use compileBundle() for ingestion.
   */
  compile(..._args: unknown[]): string {
    throw new Error(
      'HoloGramMLSCompiler.compile() is not supported. ' +
      'Use compileBundle(bundle: HoloGramMLSBundle) to ingest an MLS bundle.'
    );
  }

  compileBundle(bundle: HoloGramMLSBundle): HoloGramMLSCompileResult {
    const warnings: string[] = [];
    const errors: string[] = [];
    const stats = { photos: 0, rooms: 0, waypoints: 0, lights: 0 };

    if (!bundle.photos || bundle.photos.length === 0) {
      warnings.push('No photos provided; returning empty gallery');
      return {
        success: true,
        composition: this.buildEmptyComposition(),
        stats,
        warnings,
        errors,
      };
    }

    // Group photos by room
    const roomGroups = groupPhotosByRoom(bundle.photos);
    const roomNames = Array.from(roomGroups.keys());
    stats.photos = bundle.photos.length;
    stats.rooms = roomNames.length;

    // Compute room positions on a grid
    const roomPositions = computeRoomGrid(roomNames, this.options.roomSpacing);

    const objects: HoloObjectDecl[] = [];
    const spatialGroups: HoloSpatialGroup[] = [];
    const lights: HoloLight[] = [];
    const waypoints: HoloWaypoints[] = [];
    const wpPoints: Array<[number, number, number]> = [];

    for (const roomName of roomNames) {
      const photos = roomGroups.get(roomName)!;
      const pos = roomPositions.get(roomName)!;
      const roomSize = Math.min(this.options.roomSpacing * 0.8, 6.0);

      // Room floor
      objects.push({
        type: 'ObjectDecl',
        id: `floor_${roomName.replace(/\s+/g, '_')}`,
        name: `${roomName} Floor`,
        position: { x: pos.x, y: 0, z: pos.z },
        scale: { x: roomSize, y: 1, z: roomSize },
        rotation: { x: -90, y: 0, z: 0 },
        properties: [],
        traits: [
          { type: 'ObjectTrait', name: 'collidable', config: {}, params: {} },
          { type: 'ObjectTrait', name: 'static', config: {}, params: {} },
          {
            type: 'ObjectTrait',
            name: 'geometry',
            config: {},
          params: { primitive: 'plane' },
          },
          {
            type: 'ObjectTrait',
            name: 'material',
            config: {},
          params: {
              color: this.options.floorColor,
              roughness: 0.1,
              metalness: 0.6,
            },
          },
        ],
      });

      // Photo panels
      const placements = placePhotosInRoom(photos, roomSize);
      for (const placement of placements) {
        const scale = aspectScale(placement.photo);
        const traits: HoloObjectTrait[] = [
          {
            type: 'ObjectTrait',
            name: 'image',
            config: {},
          params: { src: placement.photo.url },
          },
          {
            type: 'ObjectTrait',
            name: 'depth_estimation',
            config: {},
          params: {
              model: this.options.depthModel,
              backend: this.options.depthBackend,
            },
          },
          {
            type: 'ObjectTrait',
            name: 'displacement',
            config: {},
          params: {
              scale: this.options.displacementScale,
              segments: this.options.displacementSegments,
            },
          },
          {
            type: 'ObjectTrait',
            name: 'depth_to_normal',
            config: {},
          params: {},
          },
          {
            type: 'ObjectTrait',
            name: 'geometry',
            config: {},
          params: { primitive: 'plane' },
          },
        ];

        if (placement.photo.caption) {
          traits.push({
            type: 'ObjectTrait',
            name: 'billboard',
            config: {},
          params: { label: placement.photo.caption },
          });
        }

        objects.push({
          type: 'ObjectDecl',
          id: `photo_${objects.length}`,
          name: placement.photo.caption || `Photo ${objects.length}`,
          position: {
            x: pos.x + placement.position.x,
            y: placement.position.y,
            z: pos.z + placement.position.z,
          },
          scale: {
            x: scale.x * this.options.photoScale,
            y: scale.y * this.options.photoScale,
            z: 1,
          },
          rotation: placement.rotation,
          properties: [],
          traits,
        });
      }

      // Room label billboard
      objects.push({
        type: 'ObjectDecl',
        id: `label_${roomName.replace(/\s+/g, '_')}`,
        name: `${roomName} Label`,
        position: { x: pos.x, y: 2.8, z: pos.z },
        scale: { x: 2, y: 0.4, z: 0.01 },
        rotation: { x: 0, y: 0, z: 0 },
        properties: [],
        traits: [
          { type: 'ObjectTrait', name: 'billboard', config: {}, params: {} },
          {
            type: 'ObjectTrait',
            name: 'material',
            config: {},
          params: { color: '#0a0a20', emissive: '#4422cc', emissiveIntensity: 1.2 },
          },
        ],
      });

      // Per-room spot light
      if (this.options.spotLighting) {
        lights.push({
          type: 'Light',
          id: `spot_${roomName.replace(/\s+/g, '_')}`,
          lightType: 'spot',
          name: `${roomName} Spot`,
          properties: [
            { type: 'LightProperty', key: 'position', value: [pos.x, 4, pos.z] },
            { type: 'LightProperty', key: 'target', value: [pos.x, 0, pos.z] },
            { type: 'LightProperty', key: 'color', value: '#ffffff' },
            { type: 'LightProperty', key: 'intensity', value: 1.2 },
            { type: 'LightProperty', key: 'angle', value: Math.PI / 3 },
            { type: 'LightProperty', key: 'penumbra', value: 0.3 },
          ],
        });
        stats.lights++;
      }

      // Spatial group
      spatialGroups.push({
        type: 'SpatialGroup',
        id: `room_${roomName.replace(/\s+/g, '_')}`,
        name: roomName,
        objects: objects.filter((o) => o.id?.startsWith(`floor_${roomName.replace(/\s+/g, '_')}`) ||
          o.id?.startsWith(`label_${roomName.replace(/\s+/g, '_')}`) ||
          (o.traits?.some((t) => t.name === 'image') &&
            Math.abs((o.position?.x ?? 0) - pos.x) < roomSize &&
            Math.abs((o.position?.z ?? 0) - pos.z) < roomSize)),
        properties: [],
      });

      // Waypoint at room center
      wpPoints.push([pos.x, 0.1, pos.z]);
    }

    // Build waypoints object if walkable
    if (this.options.walkable && wpPoints.length > 1) {
      waypoints.push({
        type: 'Waypoints',
        name: 'room_navigation',
        points: wpPoints,
      });
      stats.waypoints = wpPoints.length;
    }

    // Ambient + directional lights
    lights.push({
      type: 'Light',
      id: 'ambient_main',
      lightType: 'ambient',
      name: 'Ambient',
      properties: [
        { type: 'LightProperty', key: 'color', value: '#ffffff' },
        { type: 'LightProperty', key: 'intensity', value: this.options.ambientLight },
      ],
    });
    stats.lights++;

    lights.push({
      type: 'Light',
      id: 'directional_main',
      lightType: 'directional',
      name: 'Directional',
      properties: [
        { type: 'LightProperty', key: 'color', value: '#ffffff' },
        { type: 'LightProperty', key: 'intensity', value: 0.8 },
        { type: 'LightProperty', key: 'position', value: [5, 10, 5] },
      ],
    });
    stats.lights++;

    // Camera at first room entrance
    const firstRoom = roomPositions.get(roomNames[0])!;
    const camera: HoloCamera = {
      type: 'Camera',
      cameraType: 'perspective',
      position: { x: firstRoom.x, y: 1.6, z: firstRoom.z + this.options.roomSpacing * 0.4 },
      target: { x: firstRoom.x, y: 1.2, z: firstRoom.z },
      fov: 70,
      near: 0.01,
      far: 1000,
      properties: [],
    };

    const composition: HoloComposition = {
      type: 'Composition',
      name: 'HoloGram MLS Gallery',
      objects,
      spatialGroups,
      lights,
      camera,
      waypointSets: waypoints,
      worlds: [{
        type: 'World',
        name: 'gallery_world',
        bounds: {
          minX: -this.options.roomSpacing * 2,
          minY: 0,
          minZ: -this.options.roomSpacing * 2,
          maxX: this.options.roomSpacing * 2,
          maxY: 10,
          maxZ: this.options.roomSpacing * 2,
        },
      }],
      templates: [],
      imports: [],
      transitions: [],
      conditionals: [],
      iterators: [],
      timelines: [],
      audio: [],
      zones: [],
      npcs: [],
      quests: [],
      abilities: [],
      dialogues: [],
      stateMachines: [],
      achievements: [],
      talentTrees: [],
      shapes: [],
      metadata: {
        ...bundle.propertyMetadata,
        compiler: 'hologram_mls',
        version: '1.0.0',
      },
    };

    return {
      success: true,
      composition,
      stats,
      warnings,
      errors,
    };
  }

  private buildEmptyComposition(): HoloComposition {
    return {
      type: 'Composition',
      name: 'HoloGram MLS Gallery (Empty)',
      objects: [],
      spatialGroups: [],
      lights: [],
      templates: [],
      imports: [],
      transitions: [],
      conditionals: [],
      iterators: [],
      timelines: [],
      audio: [],
      zones: [],
      npcs: [],
      quests: [],
      abilities: [],
      dialogues: [],
      stateMachines: [],
      achievements: [],
      talentTrees: [],
      shapes: [],
    };
  }
}

export function createHoloGramMLSCompiler(options?: HoloGramMLSCompilerOptions): HoloGramMLSCompiler {
  return new HoloGramMLSCompiler(options);
}
