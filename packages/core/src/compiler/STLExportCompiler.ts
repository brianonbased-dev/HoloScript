/**
 * @fileoverview STL Export Compiler (Standard Tessellation Language)
 * @module @holoscript/core/compiler
 *
 * PURPOSE:
 * Compile HoloScript .holo compositions to STL ASCII format for 3D printing.
 * This is a BRIDGE target — it exports geometry, not runtime logic.
 *
 * Each HoloObjectDecl is tessellated into triangles according to its declared
 * type, then combined into a single STL solid. Position and scale traits are
 * applied per-object. Normals are computed from the cross product of each
 * triangle's edge vectors.
 *
 * Mesh generation rules:
 *   box / cube   → 12 triangles  (6 faces × 2)
 *   sphere       → 128 triangles (8 longitude × 8 latitude × 2)
 *   cylinder     → 80 triangles  (16 top + 16 bottom + 32 sides)
 *   plane / floor→ 2 triangles
 *   text         → skipped (not printable geometry)
 *   default      → unit cube (12 triangles)
 */

import type {
  HoloComposition,
  HoloObjectDecl,
  HoloValue,
} from '../parser/HoloCompositionTypes.js';
import { CompilerBase, type CompilerToken } from './CompilerBase';
import { ANSCapabilityPath, type ANSCapabilityPathValue } from '@holoscript/core-types/ans';

// ─── Public types ──────────────────────────────────────────────────────────

export interface STLExportCompilerOptions {
  /** Scale multiplier applied to all coordinates (default 10 — converts HS units → mm) */
  scale?: number;
  /** Name embedded in the STL solid header (default: composition name or 'holoscript_export') */
  solidName?: string;
}

export interface STLCompilationResult {
  stl: string;
  triangleCount: number;
  objectCount: number;
}

// ─── Internal geometry primitives ─────────────────────────────────────────

interface Vec3 {
  x: number;
  y: number;
  z: number;
}

interface Triangle {
  v0: Vec3;
  v1: Vec3;
  v2: Vec3;
  normal: Vec3;
}

// ─── Compiler ─────────────────────────────────────────────────────────────

export class STLExportCompiler extends CompilerBase {
  protected readonly compilerName = 'STLExportCompiler';

  protected override getRequiredCapability(): ANSCapabilityPathValue {
    // STL is a 3D-interchange / bridge format — reuse the interchange capability path.
    return ANSCapabilityPath.GLTF;
  }

  private options: Required<STLExportCompilerOptions>;

  constructor(options: STLExportCompilerOptions = {}) {
    super();
    this.options = {
      scale: options.scale ?? 10,
      solidName: options.solidName ?? '',
    };
  }

  override compile(
    composition: HoloComposition,
    agentToken: string,
    outputPath?: string
  ): STLCompilationResult {
    this.validateCompilerAccess(agentToken as CompilerToken, outputPath);

    if (!composition || composition.type !== 'Composition') {
      return { stl: this.buildEmptySolid('holoscript_export'), triangleCount: 0, objectCount: 0 };
    }

    const solidName =
      this.options.solidName ||
      (typeof (composition as unknown as Record<string, unknown>)['name'] === 'string'
        ? ((composition as unknown as Record<string, unknown>)['name'] as string)
        : 'holoscript_export');

    const objects = this.collectObjects(composition);
    const allTriangles: Triangle[] = [];
    let skippedText = 0;

    for (const obj of objects) {
      const objType = this.resolveObjectType(obj);

      if (objType === 'text') {
        skippedText++;
        continue;
      }

      const pos = this.getPosition(obj);
      const scale = this.getScale(obj);
      const globalScale = this.options.scale;

      const tris = this.tessellate(obj, objType);

      // Apply per-object position + scale + global unit scale
      for (const tri of tris) {
        allTriangles.push({
          v0: this.transformVertex(tri.v0, pos, scale, globalScale),
          v1: this.transformVertex(tri.v1, pos, scale, globalScale),
          v2: this.transformVertex(tri.v2, pos, scale, globalScale),
          normal: tri.normal, // recomputed after transform below
        });
      }
    }

    // Recompute normals after transform (scale may flip winding in degenerate cases)
    for (const tri of allTriangles) {
      tri.normal = this.computeNormal(tri.v0, tri.v1, tri.v2);
    }

    const stl = this.buildSTL(solidName, allTriangles, skippedText);
    return {
      stl,
      triangleCount: allTriangles.length,
      objectCount: objects.length - skippedText,
    };
  }

  // ─── Object collection ───────────────────────────────────────────────────

  private collectObjects(root: unknown): HoloObjectDecl[] {
    const result: HoloObjectDecl[] = [];
    const seen = new Set<HoloObjectDecl>();

    const traverse = (node: unknown): void => {
      if (!node || typeof node !== 'object') return;
      if (Array.isArray(node)) {
        for (const item of node) traverse(item);
        return;
      }
      const record = node as Record<string, unknown>;
      if (this.isObjectDecl(record) && !seen.has(record as unknown as HoloObjectDecl)) {
        result.push(record as unknown as HoloObjectDecl);
        seen.add(record as unknown as HoloObjectDecl);
      }
      for (const value of Object.values(record)) {
        if (value && typeof value === 'object') traverse(value);
      }
    };

    traverse(root);
    return result;
  }

  private isObjectDecl(record: Record<string, unknown>): boolean {
    return (
      (record['type'] === 'Object' || record['type'] === 'ObjectDecl') &&
      typeof record['name'] === 'string' &&
      Array.isArray(record['traits']) &&
      Array.isArray(record['properties'])
    );
  }

  // ─── Type resolution ─────────────────────────────────────────────────────

  private resolveObjectType(obj: HoloObjectDecl): string {
    // Check properties for an explicit 'type' key first
    const typeProp = obj.properties.find((p) => p.key === 'type');
    if (typeProp?.value && typeof typeProp.value === 'string') {
      return typeProp.value.toLowerCase();
    }

    // Fall back: derive from trait names
    for (const trait of obj.traits) {
      const name = String(trait.name)
        .replace(/^@/, '')
        .toLowerCase();
      if (['box', 'cube', 'sphere', 'cylinder', 'plane', 'floor', 'text'].includes(name)) {
        return name;
      }
    }

    // Derive from the object name itself as last resort
    const nameLower = obj.name.toLowerCase();
    for (const keyword of ['box', 'cube', 'sphere', 'cylinder', 'plane', 'floor', 'text']) {
      if (nameLower.includes(keyword)) return keyword;
    }

    return 'box'; // default
  }

  // ─── Trait / property helpers ────────────────────────────────────────────

  private getPropNumber(obj: HoloObjectDecl, key: string, fallback: number): number {
    const prop = obj.properties.find((p) => p.key === key);
    return this.toNumber(prop?.value, fallback);
  }

  private getTraitParam(
    obj: HoloObjectDecl,
    traitName: string,
    paramKey: string,
    fallback: number
  ): number {
    const cleanName = traitName.replace(/^@/, '');
    const trait = obj.traits.find(
      (t) => String(t.name).replace(/^@/, '') === cleanName
    );
    if (!trait) return fallback;
    const cfg = (trait as unknown as Record<string, unknown>)['config'] as
      | Record<string, unknown>
      | undefined;
    const params = (trait as unknown as Record<string, unknown>)['params'] as
      | Record<string, unknown>
      | undefined;
    const source = cfg ?? params ?? {};
    return this.toNumber(source[paramKey] as HoloValue | undefined, fallback);
  }

  private toNumber(value: HoloValue | undefined, fallback: number): number {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
      const n = parseFloat(value);
      if (Number.isFinite(n)) return n;
    }
    return fallback;
  }

  private getPosition(obj: HoloObjectDecl): Vec3 {
    // Try structured position property
    const posProp = obj.properties.find((p) => p.key === 'position');
    if (posProp?.value && typeof posProp.value === 'object' && !Array.isArray(posProp.value)) {
      const v = posProp.value as Record<string, unknown>;
      return {
        x: this.toNumber(v['x'] as HoloValue, 0),
        y: this.toNumber(v['y'] as HoloValue, 0),
        z: this.toNumber(v['z'] as HoloValue, 0),
      };
    }
    if (Array.isArray(posProp?.value)) {
      const arr = posProp!.value as HoloValue[];
      return {
        x: this.toNumber(arr[0], 0),
        y: this.toNumber(arr[1], 0),
        z: this.toNumber(arr[2], 0),
      };
    }
    // Try individual x/y/z props
    return {
      x: this.getPropNumber(obj, 'x', 0),
      y: this.getPropNumber(obj, 'y', 0),
      z: this.getPropNumber(obj, 'z', 0),
    };
  }

  private getScale(obj: HoloObjectDecl): Vec3 {
    const scaleProp = obj.properties.find((p) => p.key === 'scale');
    if (scaleProp?.value !== undefined) {
      if (typeof scaleProp.value === 'number') {
        const s = scaleProp.value;
        return { x: s, y: s, z: s };
      }
      if (
        typeof scaleProp.value === 'object' &&
        !Array.isArray(scaleProp.value)
      ) {
        const v = scaleProp.value as Record<string, unknown>;
        return {
          x: this.toNumber(v['x'] as HoloValue, 1),
          y: this.toNumber(v['y'] as HoloValue, 1),
          z: this.toNumber(v['z'] as HoloValue, 1),
        };
      }
      if (Array.isArray(scaleProp.value)) {
        const arr = scaleProp.value as HoloValue[];
        return {
          x: this.toNumber(arr[0], 1),
          y: this.toNumber(arr[1], 1),
          z: this.toNumber(arr[2], 1),
        };
      }
    }
    // @scale trait uniform value
    const uniformScale = this.getTraitParam(obj, 'scale', 'value', 1);
    return { x: uniformScale, y: uniformScale, z: uniformScale };
  }

  // ─── Vertex transform ────────────────────────────────────────────────────

  private transformVertex(v: Vec3, pos: Vec3, scale: Vec3, globalScale: number): Vec3 {
    return {
      x: (v.x * scale.x + pos.x) * globalScale,
      y: (v.y * scale.y + pos.y) * globalScale,
      z: (v.z * scale.z + pos.z) * globalScale,
    };
  }

  // ─── Normal computation ──────────────────────────────────────────────────

  private computeNormal(v0: Vec3, v1: Vec3, v2: Vec3): Vec3 {
    const ax = v1.x - v0.x;
    const ay = v1.y - v0.y;
    const az = v1.z - v0.z;
    const bx = v2.x - v0.x;
    const by = v2.y - v0.y;
    const bz = v2.z - v0.z;

    const nx = ay * bz - az * by;
    const ny = az * bx - ax * bz;
    const nz = ax * by - ay * bx;

    const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
    if (len === 0) return { x: 0, y: 1, z: 0 }; // degenerate triangle
    return { x: nx / len, y: ny / len, z: nz / len };
  }

  // ─── Tessellation dispatch ───────────────────────────────────────────────

  private tessellate(obj: HoloObjectDecl, objType: string): Triangle[] {
    switch (objType) {
      case 'sphere':
        return this.tessellateSphereLonLat(8, 8);
      case 'cylinder':
        return this.tessellateCylinder(16);
      case 'plane':
      case 'floor':
        return this.tessellatePlane(obj);
      case 'box':
      case 'cube':
      default:
        return this.tessellateBox(obj);
    }
  }

  // ─── Box / Cube ──────────────────────────────────────────────────────────
  // 12 triangles — 6 faces × 2 right triangles each
  // Dimensions from @width / @height / @depth traits or properties (default 1.0)

  private tessellateBox(obj: HoloObjectDecl): Triangle[] {
    const w = Math.max(
      this.getPropNumber(obj, 'width', this.getTraitParam(obj, 'width', 'value', 1)),
      1e-6
    ) / 2;
    const h = Math.max(
      this.getPropNumber(obj, 'height', this.getTraitParam(obj, 'height', 'value', 1)),
      1e-6
    ) / 2;
    const d = Math.max(
      this.getPropNumber(obj, 'depth', this.getTraitParam(obj, 'depth', 'value', 1)),
      1e-6
    ) / 2;

    // Corners
    const ppp: Vec3 = { x:  w, y:  h, z:  d };
    const ppn: Vec3 = { x:  w, y:  h, z: -d };
    const pnp: Vec3 = { x:  w, y: -h, z:  d };
    const pnn: Vec3 = { x:  w, y: -h, z: -d };
    const npp: Vec3 = { x: -w, y:  h, z:  d };
    const npn: Vec3 = { x: -w, y:  h, z: -d };
    const nnp: Vec3 = { x: -w, y: -h, z:  d };
    const nnn: Vec3 = { x: -w, y: -h, z: -d };

    return [
      // +X face
      this.tri(ppp, pnp, pnn),
      this.tri(ppp, pnn, ppn),
      // -X face
      this.tri(npp, npn, nnn),
      this.tri(npp, nnn, nnp),
      // +Y face
      this.tri(ppp, ppn, npn),
      this.tri(ppp, npn, npp),
      // -Y face
      this.tri(pnp, nnp, nnn),
      this.tri(pnp, nnn, pnn),
      // +Z face
      this.tri(ppp, npp, nnp),
      this.tri(ppp, nnp, pnp),
      // -Z face
      this.tri(ppn, pnn, nnn),
      this.tri(ppn, nnn, npn),
    ];
  }

  // ─── Sphere (UV / lon-lat) ──────────────────────────────────────────────
  // lonSegs × latSegs × 2 triangles — default 8×8 = 128 triangles
  // Radius 0.5 (unit sphere) so diameter = 1, matching box default size

  private tessellateSphereLonLat(lonSegs: number, latSegs: number): Triangle[] {
    const r = 0.5;
    const tris: Triangle[] = [];

    const vertex = (lon: number, lat: number): Vec3 => {
      const lonRad = (lon / lonSegs) * 2 * Math.PI;
      const latRad = (lat / latSegs) * Math.PI - Math.PI / 2;
      return {
        x: r * Math.cos(latRad) * Math.cos(lonRad),
        y: r * Math.sin(latRad),
        z: r * Math.cos(latRad) * Math.sin(lonRad),
      };
    };

    for (let lat = 0; lat < latSegs; lat++) {
      for (let lon = 0; lon < lonSegs; lon++) {
        const v00 = vertex(lon,     lat    );
        const v10 = vertex(lon + 1, lat    );
        const v01 = vertex(lon,     lat + 1);
        const v11 = vertex(lon + 1, lat + 1);

        // Lower triangle
        tris.push(this.tri(v00, v10, v11));
        // Upper triangle
        tris.push(this.tri(v00, v11, v01));
      }
    }

    return tris;
  }

  // ─── Cylinder ────────────────────────────────────────────────────────────
  // segs top caps + segs bottom caps + segs×2 side quads
  // = 16 + 16 + 32 = 64 triangles (with segs=16)
  // Radius 0.5, height 1.0

  private tessellateCylinder(segs: number): Triangle[] {
    const r = 0.5;
    const halfH = 0.5;
    const tris: Triangle[] = [];

    const topCenter: Vec3    = { x: 0, y:  halfH, z: 0 };
    const bottomCenter: Vec3 = { x: 0, y: -halfH, z: 0 };

    for (let i = 0; i < segs; i++) {
      const a0 = (i       / segs) * 2 * Math.PI;
      const a1 = ((i + 1) / segs) * 2 * Math.PI;

      const topA0: Vec3    = { x: r * Math.cos(a0), y:  halfH, z: r * Math.sin(a0) };
      const topA1: Vec3    = { x: r * Math.cos(a1), y:  halfH, z: r * Math.sin(a1) };
      const botA0: Vec3    = { x: r * Math.cos(a0), y: -halfH, z: r * Math.sin(a0) };
      const botA1: Vec3    = { x: r * Math.cos(a1), y: -halfH, z: r * Math.sin(a1) };

      // Top cap (normal +Y — CCW when viewed from above)
      tris.push(this.tri(topCenter, topA1, topA0));

      // Bottom cap (normal -Y — CCW when viewed from below)
      tris.push(this.tri(bottomCenter, botA0, botA1));

      // Side quad → 2 triangles (outward facing)
      tris.push(this.tri(topA0, botA0, botA1));
      tris.push(this.tri(topA0, botA1, topA1));
    }

    return tris;
  }

  // ─── Plane / Floor ───────────────────────────────────────────────────────
  // 2 triangles — flat XZ plane, normal pointing +Y

  private tessellatePlane(obj: HoloObjectDecl): Triangle[] {
    const w = Math.max(
      this.getPropNumber(obj, 'width', this.getTraitParam(obj, 'width', 'value', 1)),
      1e-6
    ) / 2;
    const d = Math.max(
      this.getPropNumber(obj, 'depth', this.getTraitParam(obj, 'depth', 'value', 1)),
      1e-6
    ) / 2;

    const v00: Vec3 = { x: -w, y: 0, z: -d };
    const v10: Vec3 = { x:  w, y: 0, z: -d };
    const v01: Vec3 = { x: -w, y: 0, z:  d };
    const v11: Vec3 = { x:  w, y: 0, z:  d };

    return [
      this.tri(v00, v10, v11),
      this.tri(v00, v11, v01),
    ];
  }

  // ─── Triangle factory ────────────────────────────────────────────────────

  private tri(v0: Vec3, v1: Vec3, v2: Vec3): Triangle {
    return { v0, v1, v2, normal: this.computeNormal(v0, v1, v2) };
  }

  // ─── STL ASCII serialisation ─────────────────────────────────────────────

  private buildEmptySolid(name: string): string {
    return `solid ${name}\nendsolid ${name}\n`;
  }

  private fmtNum(n: number): string {
    // STL conventionally uses 6 decimal places
    return n.toFixed(6);
  }

  private buildSTL(
    solidName: string,
    triangles: Triangle[],
    skippedTextCount: number
  ): string {
    const lines: string[] = [];

    lines.push(`solid ${solidName}`);

    if (skippedTextCount > 0) {
      lines.push(`  // ${skippedTextCount} text object(s) skipped — not printable geometry`);
    }

    for (const tri of triangles) {
      const n = tri.normal;
      lines.push(
        `  facet normal ${this.fmtNum(n.x)} ${this.fmtNum(n.y)} ${this.fmtNum(n.z)}`
      );
      lines.push('    outer loop');
      lines.push(
        `      vertex ${this.fmtNum(tri.v0.x)} ${this.fmtNum(tri.v0.y)} ${this.fmtNum(tri.v0.z)}`
      );
      lines.push(
        `      vertex ${this.fmtNum(tri.v1.x)} ${this.fmtNum(tri.v1.y)} ${this.fmtNum(tri.v1.z)}`
      );
      lines.push(
        `      vertex ${this.fmtNum(tri.v2.x)} ${this.fmtNum(tri.v2.y)} ${this.fmtNum(tri.v2.z)}`
      );
      lines.push('    endloop');
      lines.push('  endfacet');
    }

    lines.push(`endsolid ${solidName}`);
    lines.push(''); // trailing newline

    return lines.join('\n');
  }
}

export default STLExportCompiler;
