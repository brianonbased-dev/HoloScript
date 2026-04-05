/**
 * AdvancedTexturing.ts
 *
 * Advanced texturing techniques (CPU-side):
 *   - Displacement mapping (tessellation height scale helpers)
 *   - Parallax Occlusion Mapping (iterative ray-step algorithm)
 *   - Triplanar mapping (normal-based blend weights + UV generation)
 *   - Detail maps (fine-grain albedo + normal overlay at a higher tiling)
 *   - Texture atlas UV packing (row-based guillotine)
 *
 * Works with arbitrary Float32Array textures (RGBA, row-major).
 * No WebGPU / DOM — fully testable in Vitest.
 *
 * @module rendering
 */

// =============================================================================
// SHARED TYPES
// =============================================================================

export interface Vec2 {
  x: number;
  y: number;
}
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** Simple flat texture (row-major, RGBA, linear) */
export interface Texture2D {
  width: number;
  height: number;
  pixels: Float32Array;
}

/** Create a solid-colour texture */
export function createSolidTexture(w: number, h: number, r = 1, g = 1, b = 1, a = 1): Texture2D {
  const pixels = new Float32Array(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    pixels[i * 4] = r;
    pixels[i * 4 + 1] = g;
    pixels[i * 4 + 2] = b;
    pixels[i * 4 + 3] = a;
  }
  return { width: w, height: h, pixels };
}

/** Sample a texture at UV coordinates [0–1], clamped. Returns [R, G, B, A]. */
export function sampleTexture(
  tex: Texture2D,
  u: number,
  v: number
): [number, number, number, number] {
  const x = Math.max(0, Math.min(tex.width - 1, Math.floor(u * tex.width)));
  const y = Math.max(0, Math.min(tex.height - 1, Math.floor(v * tex.height)));
  const pi = (y * tex.width + x) * 4;
  return [tex.pixels[pi], tex.pixels[pi + 1], tex.pixels[pi + 2], tex.pixels[pi + 3]];
}

/** Sample a texture with bilinear interpolation */
export function sampleTextureBilinear(
  tex: Texture2D,
  u: number,
  v: number
): [number, number, number, number] {
  const fx = Math.max(0, Math.min(tex.width - 1, u * tex.width));
  const fy = Math.max(0, Math.min(tex.height - 1, v * tex.height));
  const ix = Math.floor(fx),
    iy = Math.floor(fy);
  const tx = fx - ix,
    ty = fy - iy;
  const x1 = Math.min(ix + 1, tex.width - 1),
    y1 = Math.min(iy + 1, tex.height - 1);

  const s = (x: number, y: number, ch: number) => tex.pixels[(y * tex.width + x) * 4 + ch];
  const out: [number, number, number, number] = [0, 0, 0, 0];
  for (let ch = 0; ch < 4; ch++) {
    out[ch] =
      (s(ix, iy, ch) * (1 - tx) + s(x1, iy, ch) * tx) * (1 - ty) +
      (s(ix, y1, ch) * (1 - tx) + s(x1, y1, ch) * tx) * ty;
  }
  return out;
}

// =============================================================================
// DISPLACEMENT MAPPING
// =============================================================================

export interface DisplacementConfig {
  /** Height scale in world units */
  scale: number;
  /** Bias (offset applied symmetrically around 0) */
  bias: number;
}

/**
 * Compute a displaced position given a surface position, normal,
 * and a height map sample at the corresponding UV.
 */
export function computeDisplacedPosition(
  position: Vec3,
  normal: Vec3,
  heightMap: Texture2D,
  u: number,
  v: number,
  config: Partial<DisplacementConfig> = {}
): Vec3 {
  const scale = config.scale ?? 0.1;
  const bias = config.bias ?? 0.5;
  const h = sampleTexture(heightMap, u, v)[0]; // R channel = height
  const offset = (h - bias) * scale;
  return {
    x: position.x + normal.x * offset,
    y: position.y + normal.y * offset,
    z: position.z + normal.z * offset,
  };
}

/**
 * Compute vertex normals for a displaced mesh via finite differences.
 * heights: per-vertex height samples (row-major, same size as vertex grid).
 * Returns per-vertex Vec3 normals (not normalised).
 */
export function computeDisplacementNormalsFromHeightMap(
  heights: Float32Array,
  gridW: number,
  gridH: number,
  cellSizeX: number,
  cellSizeZ: number
): Vec3[] {
  const normals: Vec3[] = [];
  for (let y = 0; y < gridH; y++) {
    for (let x = 0; x < gridW; x++) {
      const c = heights[y * gridW + x];
      const l = x > 0 ? heights[y * gridW + (x - 1)] : c;
      const r = x < gridW - 1 ? heights[y * gridW + (x + 1)] : c;
      const u = y > 0 ? heights[(y - 1) * gridW + x] : c;
      const d = y < gridH - 1 ? heights[(y + 1) * gridW + x] : c;
      normals.push({
        x: -(r - l) / (2 * cellSizeX),
        y: 1,
        z: -(d - u) / (2 * cellSizeZ),
      });
    }
  }
  return normals;
}

// =============================================================================
// PARALLAX OCCLUSION MAPPING
// =============================================================================

export interface POMConfig {
  /** Height scale (0–1, typ. 0.05–0.15) */
  heightScale: number;
  /** Min ray march layers (far from surface) */
  minLayers: number;
  /** Max ray march layers (near surface) */
  maxLayers: number;
}

/**
 * Perform Parallax Occlusion Mapping to compute an offset UV.
 *
 * @param uv    - Input surface UV
 * @param viewDir - View direction in tangent space (must point away from surface)
 * @param heightMap - Single-channel height map (R channel)
 * @param config - POM settings
 * @returns Parallax-offset UV
 */
export function computePOM(
  uv: Vec2,
  viewDir: Vec3,
  heightMap: Texture2D,
  config: Partial<POMConfig> = {}
): Vec2 {
  const scale = config.heightScale ?? 0.08;
  const minL = config.minLayers ?? 8;
  const maxL = config.maxLayers ?? 32;

  // Number of layers depends on angle to surface (less when head-on)
  const numLayers = Math.round(minL + (maxL - minL) * (1 - Math.abs(viewDir.z)));
  const layerDepth = 1 / numLayers;
  const deltaUV: Vec2 = {
    x: (viewDir.x * scale) / (numLayers * Math.abs(viewDir.z) + 1e-6),
    y: (viewDir.y * scale) / (numLayers * Math.abs(viewDir.z) + 1e-6),
  };

  let currentDepth = 0;
  const currentUV = { ...uv };
  let mapValue = sampleTexture(heightMap, currentUV.x, currentUV.y)[0];

  // Step until height map depth < current layer depth
  while (currentDepth < mapValue) {
    currentUV.x -= deltaUV.x;
    currentUV.y -= deltaUV.y;
    currentDepth += layerDepth;
    mapValue = sampleTexture(heightMap, currentUV.x, currentUV.y)[0];
  }

  // Binary refinement (one step back, then interpolate)
  const prevUV = { x: currentUV.x + deltaUV.x, y: currentUV.y + deltaUV.y };
  const prevDepth = currentDepth - layerDepth;
  const prevMapValue = sampleTexture(heightMap, prevUV.x, prevUV.y)[0];
  const after = mapValue - currentDepth;
  const before = prevMapValue - prevDepth;
  const weight = after / (after - before + 1e-6);

  return {
    x: prevUV.x * weight + currentUV.x * (1 - weight),
    y: prevUV.y * weight + currentUV.y * (1 - weight),
  };
}

// =============================================================================
// TRIPLANAR MAPPING
// =============================================================================

/**
 * Compute triplanar blend weights from a surface normal.
 * Higher sharpness → sharper transitions between planes.
 */
export function triplanarWeights(normal: Vec3, sharpness = 4): Vec3 {
  const w = {
    x: Math.abs(normal.x),
    y: Math.abs(normal.y),
    z: Math.abs(normal.z),
  };
  // Power curve for sharper blending
  const pw = {
    x: Math.pow(w.x, sharpness),
    y: Math.pow(w.y, sharpness),
    z: Math.pow(w.z, sharpness),
  };
  const sum = pw.x + pw.y + pw.z + 1e-6;
  return { x: pw.x / sum, y: pw.y / sum, z: pw.z / sum };
}

/**
 * Sample a texture using triplanar UV projection.
 * position: world-space position; tileScale: how fast the texture tiles.
 * Returns blended RGBA from all three planes.
 */
export function sampleTriplanar(
  tex: Texture2D,
  position: Vec3,
  normal: Vec3,
  tileScale = 1,
  sharpness = 4
): [number, number, number, number] {
  const w = triplanarWeights(normal, sharpness);

  const yz = sampleTextureBilinear(tex, position.y * tileScale, position.z * tileScale);
  const xz = sampleTextureBilinear(tex, position.x * tileScale, position.z * tileScale);
  const xy = sampleTextureBilinear(tex, position.x * tileScale, position.y * tileScale);

  return [
    yz[0] * w.x + xz[0] * w.y + xy[0] * w.z,
    yz[1] * w.x + xz[1] * w.y + xy[1] * w.z,
    yz[2] * w.x + xz[2] * w.y + xy[2] * w.z,
    yz[3] * w.x + xz[3] * w.y + xy[3] * w.z,
  ];
}

// =============================================================================
// DETAIL MAPS
// =============================================================================

export interface DetailMapConfig {
  /** How many times the detail map tiles over the base UV */
  tileScale: number;
  /** Blend intensity 0–1 */
  intensity: number;
}

/** Overlay a detail albedo texture on top of a base albedo sample */
export function applyDetailAlbedo(
  baseColor: [number, number, number, number],
  detailTex: Texture2D,
  u: number,
  v: number,
  config: Partial<DetailMapConfig> = {}
): [number, number, number, number] {
  const scale = config.tileScale ?? 4;
  const intensity = config.intensity ?? 0.5;
  const detail = sampleTextureBilinear(detailTex, (u * scale) % 1, (v * scale) % 1);

  // Overlay blend: if detail < 0.5 → darken, else → lighten
  return [
    overlayBlend(baseColor[0], detail[0], intensity),
    overlayBlend(baseColor[1], detail[1], intensity),
    overlayBlend(baseColor[2], detail[2], intensity),
    baseColor[3],
  ];
}

function overlayBlend(base: number, detail: number, intensity: number): number {
  const overlay = detail < 0.5 ? 2 * base * detail : 1 - 2 * (1 - base) * (1 - detail);
  return base + (overlay - base) * intensity;
}

/**
 * Blend detail normal with base normal (Reoriented Normal Mapping).
 * Both normals must be unit-length, in tangent space.
 */
export function blendDetailNormal(base: Vec3, detail: Vec3): Vec3 {
  const t = { x: base.x + base.z * detail.x, y: base.y + base.z * detail.y, z: base.z };
  const u = { x: -detail.x, y: -detail.y, z: 1 };
  const len = Math.sqrt(t.x * t.x + t.y * t.y + t.z * t.z) || 1;
  return { x: t.x / len, y: t.y / len, z: t.z / len };
}

// =============================================================================
// TEXTURE ATLAS PACKING
// =============================================================================

export interface AtlasRect {
  x: number;
  y: number;
  width: number;
  height: number;
  /** Source identifier */
  id: string;
}

export interface AtlasPacker {
  atlasWidth: number;
  atlasHeight: number;
  rects: AtlasRect[];
  /** Number of rows stacked */
  rowCount: number;
  /** Current row cursor */
  cursorX: number;
  cursorY: number;
  rowHeight: number;
}

/** Create a new atlas packer */
export function createAtlasPacker(width = 2048, height = 2048): AtlasPacker {
  return {
    atlasWidth: width,
    atlasHeight: height,
    rects: [],
    rowCount: 0,
    cursorX: 0,
    cursorY: 0,
    rowHeight: 0,
  };
}

/**
 * Pack a texture region into the atlas (row-based guillotine).
 * Returns the allocated AtlasRect or null if out of space.
 */
export function packRect(
  packer: AtlasPacker,
  id: string,
  width: number,
  height: number,
  padding = 1
): AtlasRect | null {
  const w = width + padding * 2,
    h = height + padding * 2;

  if (packer.cursorX + w > packer.atlasWidth) {
    // New row
    packer.cursorX = 0;
    packer.cursorY += packer.rowHeight + padding;
    packer.rowHeight = 0;
    packer.rowCount++;
  }

  if (packer.cursorY + h > packer.atlasHeight) return null; // Out of atlas space

  const rect: AtlasRect = {
    id,
    x: packer.cursorX + padding,
    y: packer.cursorY + padding,
    width,
    height,
  };
  packer.rects.push(rect);
  packer.cursorX += w;
  if (h > packer.rowHeight) packer.rowHeight = h;
  return rect;
}

/** Get UV coordinates [0–1] of a packed rect within the atlas */
export function getRectUV(
  packer: AtlasPacker,
  rect: AtlasRect
): { u0: number; v0: number; u1: number; v1: number } {
  return {
    u0: rect.x / packer.atlasWidth,
    v0: rect.y / packer.atlasHeight,
    u1: (rect.x + rect.width) / packer.atlasWidth,
    v1: (rect.y + rect.height) / packer.atlasHeight,
  };
}

/** Total packing efficiency (used area / total area) */
export function getAtlasEfficiency(packer: AtlasPacker): number {
  const used = packer.rects.reduce((s, r) => s + r.width * r.height, 0);
  return used / (packer.atlasWidth * packer.atlasHeight);
}
