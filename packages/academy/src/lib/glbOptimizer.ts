/**
 * glbOptimizer.ts — GLB Optimization Pipeline
 *
 * Optimize glTF/GLB models for real-time rendering:
 * mesh simplification, texture compression, and LOD generation.
 */

export interface OptimizationConfig {
  targetTriangles?: number;
  maxTextureSize: number;
  generateLODs: boolean;
  lodLevels: number;
  removeUnusedMaterials: boolean;
  mergeSmallMeshes: boolean;
  quantizePositions: boolean;
}

export interface MeshStats {
  name: string;
  triangles: number;
  vertices: number;
  materials: number;
  textureBytes: number;
}

export interface OptimizationReport {
  originalTriangles: number;
  optimizedTriangles: number;
  originalSizeBytes: number;
  estimatedSizeBytes: number;
  reductionPercent: number;
  lodLevels: number;
  warnings: string[];
  meshes: MeshStats[];
}

const DEFAULT_CONFIG: OptimizationConfig = {
  maxTextureSize: 2048,
  generateLODs: true,
  lodLevels: 3,
  removeUnusedMaterials: true,
  mergeSmallMeshes: true,
  quantizePositions: true,
};

/**
 * Analyze a mesh and produce an optimization report.
 */
export function analyzeForOptimization(
  meshes: MeshStats[],
  config: Partial<OptimizationConfig> = {}
): OptimizationReport {
  const opts = { ...DEFAULT_CONFIG, ...config };
  const warnings: string[] = [];

  const totalTriangles = meshes.reduce((s, m) => s + m.triangles, 0);
  const totalSize = meshes.reduce((s, m) => s + m.textureBytes, 0) + totalTriangles * 36; // ~36 bytes/tri

  // Simple decimation estimate
  const targetTris = opts.targetTriangles ?? Math.min(totalTriangles, 100000);
  const ratio = Math.min(1, targetTris / Math.max(1, totalTriangles));
  const optimizedTris = Math.round(totalTriangles * ratio);

  if (totalTriangles > 500000)
    warnings.push('Very high polygon count — consider manual optimization');
  if (meshes.some((m) => m.materials > 10))
    warnings.push('Mesh has many materials — consider atlasing');

  // Texture downscaling savings
  const textureSavings = meshes.reduce((s, m) => {
    const originalDim = Math.sqrt(m.textureBytes / 4); // Approximate dimension
    if (originalDim > opts.maxTextureSize) {
      const reduction = 1 - (opts.maxTextureSize / originalDim) ** 2;
      return s + m.textureBytes * reduction;
    }
    return s;
  }, 0);

  const estimatedSize = totalSize * ratio - textureSavings;
  const reduction = totalSize > 0 ? ((totalSize - estimatedSize) / totalSize) * 100 : 0;

  return {
    originalTriangles: totalTriangles,
    optimizedTriangles: optimizedTris,
    originalSizeBytes: totalSize,
    estimatedSizeBytes: Math.max(0, Math.round(estimatedSize)),
    reductionPercent: Math.max(0, Math.round(reduction)),
    lodLevels: opts.generateLODs ? opts.lodLevels : 1,
    warnings,
    meshes,
  };
}

/**
 * Calculate LOD triangle counts for a mesh.
 */
export function calculateLODLevels(triangles: number, levels: number = 3): number[] {
  const lods: number[] = [triangles];
  for (let i = 1; i <= levels; i++) {
    lods.push(Math.max(100, Math.round(triangles / Math.pow(2, i))));
  }
  return lods;
}

/**
 * Estimate memory usage for a mesh at runtime (GPU VRAM).
 */
export function estimateVRAM(
  triangles: number,
  textureBytes: number
): {
  meshMB: number;
  textureMB: number;
  totalMB: number;
} {
  const meshBytes = triangles * 36; // 3 verts × 12 bytes each
  const meshMB = meshBytes / (1024 * 1024);
  const textureMB = textureBytes / (1024 * 1024);
  return {
    meshMB: +meshMB.toFixed(2),
    textureMB: +textureMB.toFixed(2),
    totalMB: +(meshMB + textureMB).toFixed(2),
  };
}
