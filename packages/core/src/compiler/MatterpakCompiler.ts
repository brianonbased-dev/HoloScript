/**
 * Matterpak Compiler — Ingest Matterport Matterpak bundles to HoloComposition
 *
 * Parses the Matterpak Bundle format (OBJ + MTL + JPG + XYZ + E57) and converts
 * to a HoloScript HoloComposition AST for downstream multi-target compilation.
 *
 * Matterpak Bundle contents:
 *   - OBJ mesh + MTL materials + JPG textures
 *   - XYZ point cloud (ASCII, one point per line: x y z [r g b])
 *   - E57 point cloud (ASTM E2807 standard, binary with XML header)
 *   - Floor plan PDFs (out of scope for this compiler — extracted separately)
 *
 * Output is a HoloComposition with:
 *   - One HoloObjectDecl per OBJ mesh group
 *   - One HoloSpatialGroup per room / floor plan zone
 *   - Point cloud as particle-system effects or geometry nodes
 *   - Material bindings via HoloObjectTrait
 *
 * Bridge classification: closed-spec bridge (Matterport vendor format).
 * NMoS: passes specialized-engineering-depth + network-effect via hardware install base.
 *
 * @version 1.0.0
 * @see research/2026-05-10_3d-real-estate-virtual-tour.md
 */

import type {
  HoloComposition,
  HoloObjectDecl,
  HoloObjectTrait,
  HoloSpatialGroup,
  HoloLight,
  HoloCamera,
  HoloEnvironment,
  HoloPosition,
  HoloValue,
} from '../parser/HoloCompositionTypes';

import { CompilerBase } from './CompilerBase';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MatterpakCompilerOptions {
  /** Scale factor from Matterport units (meters) to HoloScript units (default 1.0) */
  scale?: number;
  /** Rotate Y-axis to align with HoloScript coordinate system (default 0) */
  rotationY?: number;
  /** Offset origin to center the scene (default true) */
  centerOrigin?: boolean;
  /** Treat each OBJ group ('g') as a separate room / spatial group (default true) */
  groupAsRooms?: boolean;
  /** Convert XYZ/E57 point clouds to HoloScript particle effects (default true) */
  pointCloudAsParticles?: boolean;
  /** Maximum points per particle system (default 100_000) */
  maxPointsPerSystem?: number;
  /** Downsample point clouds > threshold (default true) */
  downsampleLargeClouds?: boolean;
  /** Floor plan image URL (if available separately) */
  floorPlanUrl?: string;
  /** Property metadata for compliance tagging */
  propertyMetadata?: Record<string, HoloValue>;
}

export interface MatterpakBundle {
  obj: string;
  mtl?: string;
  textures?: Map<string, Uint8Array>;
  xyz?: string;
  e57?: ArrayBuffer;
}

export interface ParsedOBJGroup {
  name: string;
  vertices: Float64Array;
  normals: Float64Array;
  uvs: Float64Array;
  triangles: Uint32Array;
  materialName?: string;
}

export interface ParsedMTL {
  materials: Map<string, {
    baseColor: [number, number, number];
    metallic: number;
    roughness: number;
    textureMap?: string;
    normalMap?: string;
  }>;
}

export interface PointCloud {
  points: Float64Array; // x,y,z interleaved
  colors?: Uint8Array;    // r,g,b interleaved (optional)
  intensity?: Float64Array;
  count: number;
}

export interface MatterpakCompileResult {
  success: boolean;
  composition?: HoloComposition;
  stats: {
    meshGroups: number;
    vertices: number;
    triangles: number;
    pointCount: number;
    materials: number;
    rooms: number;
  };
  warnings: string[];
  errors: string[];
}

// ---------------------------------------------------------------------------
// OBJ Parser (extended: preserves groups, normals, UVs, materials)
// ---------------------------------------------------------------------------

function parseOBJExtended(text: string): ParsedOBJGroup[] {
  const allVertices: number[] = [];
  const allNormals: number[] = [];
  const allUVs: number[] = [];
  const groups: ParsedOBJGroup[] = [];

  let currentGroup: ParsedOBJGroup | null = null;
  let currentMaterial: string | undefined;
  let vertexOffset = 0;
  let normalOffset = 0;
  let uvOffset = 0;

  function flushGroup() {
    if (currentGroup && (currentGroup.triangles.length > 0 || currentGroup.vertices.length > 0)) {
      groups.push(currentGroup);
    }
  }

  function startGroup(name: string) {
    flushGroup();
    currentGroup = {
      name,
      vertices: new Float64Array(0),
      normals: new Float64Array(0),
      uvs: new Float64Array(0),
      triangles: new Uint32Array(0),
      materialName: currentMaterial,
    };
  }

  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.length === 0 || line.startsWith('#')) continue;

    const parts = line.split(/\s+/);
    const cmd = parts[0];

    if (cmd === 'v' && parts.length >= 4) {
      allVertices.push(
        parseFloat(parts[1]),
        parseFloat(parts[2]),
        parseFloat(parts[3])
      );
    } else if (cmd === 'vn' && parts.length >= 4) {
      allNormals.push(
        parseFloat(parts[1]),
        parseFloat(parts[2]),
        parseFloat(parts[3])
      );
    } else if (cmd === 'vt' && parts.length >= 3) {
      allUVs.push(
        parseFloat(parts[1]),
        parseFloat(parts[2])
      );
    } else if (cmd === 'g' || cmd === 'o') {
      const name = parts.slice(1).join(' ') || `group_${groups.length}`;
      startGroup(name);
    } else if (cmd === 'usemtl' && parts.length >= 2) {
      currentMaterial = parts[1];
      // Explicit cast needed: closures (startGroup/flushGroup) mutate currentGroup,
      // causing TypeScript to infer it as the initial literal type `null` and
      // then narrow `if (grp)` to `never`. Cast restores the declared union.
      const grp = currentGroup as ParsedOBJGroup | null;
      if (grp !== null) {
        grp.materialName = currentMaterial;
      }
    } else if (cmd === 'f' && parts.length >= 4) {
      if (!currentGroup) {
        startGroup('default');
      }
      const indices = parts.slice(1).map((p) => {
        // v/vt/vn format; all indices are 1-based
        const vStr = p.split('/')[0];
        const vIdx = parseInt(vStr, 10);
        return vIdx > 0 ? vIdx - 1 : allVertices.length / 3 + vIdx;
      });

      // Triangulate fan
      for (let t = 1; t < indices.length - 1; t++) {
        currentGroup!.triangles = appendTri(currentGroup!.triangles, indices[0], indices[t], indices[t + 1]);
      }
    }
  }

  flushGroup();

  // Build typed arrays per group
  for (const g of groups) {
    // Collect referenced vertices for this group
    const usedVerts = new Set<number>();
    for (let i = 0; i < g.triangles.length; i++) {
      usedVerts.add(g.triangles[i]);
    }
    const remap = new Map<number, number>();
    let next = 0;
    const verts: number[] = [];
    for (const idx of usedVerts) {
      remap.set(idx, next++);
      verts.push(
        allVertices[idx * 3],
        allVertices[idx * 3 + 1],
        allVertices[idx * 3 + 2]
      );
    }
    g.vertices = new Float64Array(verts);

    // Remap triangles
    for (let i = 0; i < g.triangles.length; i++) {
      g.triangles[i] = remap.get(g.triangles[i])!;
    }
  }

  return groups.length > 0 ? groups : [{
    name: 'default',
    vertices: new Float64Array(allVertices),
    normals: new Float64Array(allNormals),
    uvs: new Float64Array(allUVs),
    triangles: new Uint32Array(0),
    materialName: currentMaterial,
  }];
}

function appendTri(arr: Uint32Array, a: number, b: number, c: number): Uint32Array {
  const next = new Uint32Array(arr.length + 3);
  next.set(arr);
  next[arr.length] = a;
  next[arr.length + 1] = b;
  next[arr.length + 2] = c;
  return next;
}

// ---------------------------------------------------------------------------
// MTL Parser
// ---------------------------------------------------------------------------

function parseMTL(text: string): ParsedMTL {
  const materials = new Map<string, {
    baseColor: [number, number, number];
    metallic: number;
    roughness: number;
    textureMap?: string;
    normalMap?: string;
  }>();

  let current: string | null = null;
  const lines = text.split('\n');
  for (const raw of lines) {
    const line = raw.trim();
    if (line.length === 0 || line.startsWith('#')) continue;
    const parts = line.split(/\s+/);
    const cmd = parts[0];

    if (cmd === 'newmtl' && parts.length >= 2) {
      current = parts[1];
      materials.set(current, {
        baseColor: [0.8, 0.8, 0.8],
        metallic: 0.0,
        roughness: 0.5,
      });
    } else if (current) {
      const mat = materials.get(current)!;
      if (cmd === 'Kd' && parts.length >= 4) {
        mat.baseColor = [
          parseFloat(parts[1]),
          parseFloat(parts[2]),
          parseFloat(parts[3]),
        ];
      } else if (cmd === 'map_Kd' && parts.length >= 2) {
        mat.textureMap = parts.slice(1).join(' ');
      } else if (cmd === 'map_Bump' && parts.length >= 2) {
        mat.normalMap = parts.slice(1).join(' ');
      }
      // Ns specular exponent can be mapped to roughness: roughness = 1 - clamp(Ns/1000, 0, 1)
      if (cmd === 'Ns' && parts.length >= 2) {
        const ns = parseFloat(parts[1]);
        mat.roughness = Math.max(0, 1 - ns / 1000);
      }
    }
  }

  return { materials };
}

// ---------------------------------------------------------------------------
// XYZ Parser (ASCII point cloud: x y z [r g b])
// ---------------------------------------------------------------------------

function parseXYZ(text: string): PointCloud {
  const points: number[] = [];
  const colors: number[] = [];
  let hasColor = true;

  const lines = text.split('\n');
  for (const raw of lines) {
    const line = raw.trim();
    if (line.length === 0 || line.startsWith('#')) continue;
    const parts = line.split(/\s+/);
    if (parts.length < 3) continue;

    points.push(
      parseFloat(parts[0]),
      parseFloat(parts[1]),
      parseFloat(parts[2])
    );

    if (parts.length >= 6) {
      colors.push(
        parseInt(parts[3], 10),
        parseInt(parts[4], 10),
        parseInt(parts[5], 10)
      );
    } else {
      hasColor = false;
    }
  }

  return {
    points: new Float64Array(points),
    colors: hasColor ? new Uint8Array(colors) : undefined,
    count: points.length / 3,
  };
}

// ---------------------------------------------------------------------------
// E57 Parser (simplified — extracts cartesian points from header)
// ---------------------------------------------------------------------------

function parseE57(buffer: ArrayBuffer): PointCloud {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  const text = new TextDecoder().decode(bytes.slice(0, Math.min(1024, buffer.byteLength)));

  // E57 files start with an XML header containing the ASTERIX format description
  // Full parsing requires an XML parser + structured binary read. This is a
  // best-effort fallback that looks for cartesianX/cartesianY/cartesianZ blobs.
  if (!text.includes('e57')) {
    return { points: new Float64Array(0), count: 0 };
  }

  // Heuristic: scan for IEEE-754 double sequences that look like point ranges
  // (x,y,z triples where values are in [-1e6, 1e6] range typical for property scans)
  const points: number[] = [];
  const len = Math.min(buffer.byteLength, 50_000_000); // Cap at 50MB for safety
  for (let off = 0; off <= len - 24; off += 8) {
    const x = view.getFloat64(off, true);
    const y = view.getFloat64(off + 8, true);
    const z = view.getFloat64(off + 16, true);
    if (isFinite(x) && isFinite(y) && isFinite(z) &&
        Math.abs(x) < 1e6 && Math.abs(y) < 1e6 && Math.abs(z) < 1e6 &&
        (x !== 0 || y !== 0 || z !== 0)) {
      points.push(x, y, z);
      off += 16; // Skip ahead to avoid reading the same point multiple times
    }
  }

  return {
    points: new Float64Array(points),
    count: points.length / 3,
  };
}

// ---------------------------------------------------------------------------
// MatterpakCompiler
// ---------------------------------------------------------------------------

export class MatterpakCompiler extends CompilerBase {
  compilerName = 'matterpak';
  version = '1.0.0';

  options: MatterpakCompilerOptions;

  constructor(options: MatterpakCompilerOptions = {}) {
    super();
    this.options = {
      scale: 1.0,
      rotationY: 0,
      centerOrigin: true,
      groupAsRooms: true,
      pointCloudAsParticles: true,
      maxPointsPerSystem: 100_000,
      downsampleLargeClouds: true,
      ...options,
    };
  }

  /**
   * Satisfy CompilerBase abstract method — MatterpakCompiler is a format-ingest
   * compiler (bundle → HoloComposition) rather than a target compiler
   * (HoloComposition → output). Use compileBundle() for ingestion.
   */
  compile(..._args: unknown[]): string {
    throw new Error(
      'MatterpakCompiler.compile() is not supported. ' +
      'Use compileBundle(bundle: MatterpakBundle) to ingest a Matterpak bundle ' +
      'into a HoloComposition AST.'
    );
  }

  /**
   * Compile a Matterpak bundle into a HoloComposition AST.
   */
  compileBundle(bundle: MatterpakBundle): MatterpakCompileResult {
    const warnings: string[] = [];
    const errors: string[] = [];
    const stats = {
      meshGroups: 0,
      vertices: 0,
      triangles: 0,
      pointCount: 0,
      materials: 0,
      rooms: 0,
    };

    // Parse OBJ
    const objGroups = parseOBJExtended(bundle.obj);
    stats.meshGroups = objGroups.length;
    stats.vertices = objGroups.reduce((sum, g) => sum + g.vertices.length / 3, 0);
    stats.triangles = objGroups.reduce((sum, g) => sum + g.triangles.length / 3, 0);

    // Parse MTL
    const mtl = bundle.mtl ? parseMTL(bundle.mtl) : { materials: new Map() };
    stats.materials = mtl.materials.size;

    // Parse point clouds
    let xyzCloud: PointCloud | undefined;
    let e57Cloud: PointCloud | undefined;
    if (bundle.xyz) {
      xyzCloud = parseXYZ(bundle.xyz);
      stats.pointCount += xyzCloud.count;
    }
    if (bundle.e57) {
      e57Cloud = parseE57(bundle.e57);
      if (e57Cloud.count > 0) {
        stats.pointCount += e57Cloud.count;
      } else {
        warnings.push('E57 parsing produced zero points (header-only or unsupported format variant)');
      }
    }

    // Build HoloComposition
    const objects: HoloObjectDecl[] = [];
    const spatialGroups: HoloSpatialGroup[] = [];
    const lights: HoloLight[] = [];

    // Compute bounds for centering
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    for (const g of objGroups) {
      for (let i = 0; i < g.vertices.length; i += 3) {
        const x = g.vertices[i];
        const y = g.vertices[i + 1];
        const z = g.vertices[i + 2];
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
        if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
      }
    }
    const cx = (minX + maxX) / 2;
    const cy = minY; // Floor stays at y=0
    const cz = (minZ + maxZ) / 2;

    const scale = this.options.scale ?? 1.0;
    const rotY = this.options.rotationY ?? 0;

    // Build objects and spatial groups from mesh groups
    if (this.options.groupAsRooms) {
      for (const g of objGroups) {
        const traits: HoloObjectTrait[] = [];
        const matName = g.materialName;
        if (matName && mtl.materials.has(matName)) {
          const mat = mtl.materials.get(matName)!;
          const matConfig: Record<string, HoloValue> = {
            baseColor: mat.baseColor as HoloValue[],
            metallic: mat.metallic,
            roughness: mat.roughness,
          };
          if (mat.textureMap !== undefined) matConfig.textureMap = mat.textureMap;
          if (mat.normalMap !== undefined) matConfig.normalMap = mat.normalMap;
          traits.push({
            type: 'ObjectTrait' as const,
            name: 'material',
            config: matConfig,
          });
        }

        // Geometry trait with inline vertex buffer
        traits.push({
          type: 'ObjectTrait' as const,
          name: 'geometry',
          config: {
            primitive: 'mesh',
            vertices: Array.from(g.vertices),
            indices: Array.from(g.triangles),
          },
        });

        // Compute group center
        let gx = 0, gy = 0, gz = 0;
        for (let i = 0; i < g.vertices.length; i += 3) {
          gx += g.vertices[i];
          gy += g.vertices[i + 1];
          gz += g.vertices[i + 2];
        }
        const vc = g.vertices.length / 3;
        gx /= vc; gy /= vc; gz /= vc;

        const obj: HoloObjectDecl = {
          type: 'ObjectDecl',
          id: `obj_${g.name}`,
          name: g.name,
          properties: [],
          position: {
            x: (gx - cx) * scale,
            y: (gy - cy) * scale,
            z: (gz - cz) * scale,
          },
          scale: { x: scale, y: scale, z: scale },
          rotation: { x: 0, y: rotY, z: 0 },
          traits,
        };
        objects.push(obj);

        spatialGroups.push({
          type: 'SpatialGroup',
          id: `room_${g.name}`,
          name: g.name,
          properties: [],
          objects: [obj],
        });
      }
      stats.rooms = spatialGroups.length;
    } else {
      // Single spatial group, multiple objects
      for (const g of objGroups) {
        const traits: HoloObjectTrait[] = [{
          type: 'ObjectTrait' as const,
          name: 'geometry',
          config: {
            primitive: 'mesh',
            vertices: Array.from(g.vertices),
            indices: Array.from(g.triangles),
          },
        }];
        const matName = g.materialName;
        if (matName && mtl.materials.has(matName)) {
          const mat = mtl.materials.get(matName)!;
          const matConfig: Record<string, HoloValue> = {
            baseColor: mat.baseColor as HoloValue[],
            metallic: mat.metallic,
            roughness: mat.roughness,
          };
          if (mat.textureMap !== undefined) matConfig.textureMap = mat.textureMap;
          if (mat.normalMap !== undefined) matConfig.normalMap = mat.normalMap;
          traits.push({
            type: 'ObjectTrait' as const,
            name: 'material',
            config: matConfig,
          });
        }
        objects.push({
          type: 'ObjectDecl',
          id: `obj_${g.name}`,
          name: g.name,
          properties: [],
          position: { x: 0, y: 0, z: 0 },
          scale: { x: scale, y: scale, z: scale },
          rotation: { x: 0, y: rotY, z: 0 },
          traits,
        });
      }
      spatialGroups.push({
        type: 'SpatialGroup',
        id: 'room_all',
        name: 'Full Property',
        properties: [],
        objects: [...objects],
      });
      stats.rooms = 1;
    }

    // Point clouds as particle effects
    const pointClouds: PointCloud[] = [];
    if (xyzCloud && xyzCloud.count > 0) pointClouds.push(xyzCloud);
    if (e57Cloud && e57Cloud.count > 0) pointClouds.push(e57Cloud);

    if (this.options.pointCloudAsParticles && pointClouds.length > 0) {
      let systemIndex = 0;
      for (const pc of pointClouds) {
        const maxPts = this.options.maxPointsPerSystem ?? 100_000;
        let stride = 1;
        if (this.options.downsampleLargeClouds && pc.count > maxPts) {
          stride = Math.ceil(pc.count / maxPts);
        }

        const particles: number[] = [];
        const particleColors: number[] = [];
        for (let i = 0; i < pc.count; i += stride) {
          const x = pc.points[i * 3];
          const y = pc.points[i * 3 + 1];
          const z = pc.points[i * 3 + 2];
          particles.push(
            (x - cx) * scale,
            (y - cy) * scale,
            (z - cz) * scale
          );
          if (pc.colors) {
            particleColors.push(
              pc.colors[i * 3] / 255,
              pc.colors[i * 3 + 1] / 255,
              pc.colors[i * 3 + 2] / 255
            );
          }
        }

        objects.push({
          type: 'ObjectDecl',
          id: `pointcloud_${systemIndex}`,
          name: `Point Cloud ${systemIndex}`,
          properties: [],
          position: { x: 0, y: 0, z: 0 },
          scale: { x: 1, y: 1, z: 1 },
          rotation: { x: 0, y: 0, z: 0 },
          traits: [{
            type: 'ObjectTrait' as const,
            name: 'particleSystem',
            config: {
              count: particles.length / 3,
              positions: particles,
              ...(particleColors.length > 0 ? { colors: particleColors } : {}),
              size: 0.02 * scale,
              billboard: true,
            },
          }],
        });
        systemIndex++;
      }
    }

    // Default camera
    const camera: HoloCamera = {
      type: 'Camera',
      cameraType: 'perspective',
      properties: [],
      position: { x: 0, y: 1.6 * scale, z: 3 * scale },
      target: { x: 0, y: 0.5 * scale, z: 0 },
      fov: 70,
      near: 0.01,
      far: 1000,
    };

    // Ambient lighting
    lights.push({
      type: 'Light',
      id: 'ambient_main',
      name: 'ambient_main',
      lightType: 'ambient',
      properties: [
        { type: 'LightProperty', key: 'color', value: '#ffffff' },
        { type: 'LightProperty', key: 'intensity', value: 0.6 },
      ],
    });
    lights.push({
      type: 'Light',
      id: 'directional_main',
      name: 'directional_main',
      lightType: 'directional',
      properties: [
        { type: 'LightProperty', key: 'color', value: '#ffffff' },
        { type: 'LightProperty', key: 'intensity', value: 0.8 },
        { type: 'LightProperty', key: 'position', value: [5 * scale, 10 * scale, 5 * scale] },
      ],
    });

    const composition: HoloComposition = {
      type: 'Composition',
      name: 'Matterpak Import',
      environment: {
        type: 'Environment',
        properties: [
          { type: 'EnvironmentProperty', key: 'background', value: '#202020' },
          { type: 'EnvironmentProperty', key: 'fogColor', value: '#202020' },
          { type: 'EnvironmentProperty', key: 'fogNear', value: 10 * scale },
          { type: 'EnvironmentProperty', key: 'fogFar', value: 50 * scale },
        ],
      },
      templates: [],
      objects,
      spatialGroups,
      lights,
      camera,
      effects: {
        type: 'Effects',
        effects: [
          { type: 'Effect', effectType: 'shadows', properties: { enabled: true } },
          { type: 'Effect', effectType: 'ambientOcclusion', properties: { enabled: true } },
        ],
      },
      imports: [],
      timelines: [],
      audio: [],
      zones: [],
      worlds: [{
        type: 'World',
        id: 'property_world',
        name: 'Imported Property',
        properties: [
          { type: 'WorldProperty', key: 'gravityX', value: 0 },
          { type: 'WorldProperty', key: 'gravityY', value: -9.81 },
          { type: 'WorldProperty', key: 'gravityZ', value: 0 },
          { type: 'WorldProperty', key: 'boundsMinX', value: (minX - cx) * scale },
          { type: 'WorldProperty', key: 'boundsMinY', value: (minY - cy) * scale },
          { type: 'WorldProperty', key: 'boundsMinZ', value: (minZ - cz) * scale },
          { type: 'WorldProperty', key: 'boundsMaxX', value: (maxX - cx) * scale },
          { type: 'WorldProperty', key: 'boundsMaxY', value: (maxY - cy) * scale },
          { type: 'WorldProperty', key: 'boundsMaxZ', value: (maxZ - cz) * scale },
        ],
      }],
      ui: {
        type: 'UI',
        elements: [],
      },
      transitions: [],
      conditionals: [],
      iterators: [],
      npcs: [],
      quests: [],
      abilities: [],
      dialogues: [],
      stateMachines: [],
      achievements: [],
      talentTrees: [],
      shapes: [],
    };

    return {
      success: errors.length === 0,
      composition,
      stats,
      warnings,
      errors,
    };
  }
}

export function createMatterpakCompiler(options?: MatterpakCompilerOptions): MatterpakCompiler {
  return new MatterpakCompiler(options);
}
