/**
 * Basic Compression Usage Examples
 *
 * Demonstrates how to use the AdvancedCompression module
 */

import { AdvancedCompression, type CompressionOptions } from '../index';
import { GLTFExporter } from '../../gltf/GLTFExporter';
import type { ISceneGraph } from '../../SceneGraph';
import { createEmptyGLTFDocument } from '../../gltf/GLTFTypes';

/**
 * Example 1: Basic compression with default settings
 */
export async function basicCompression() {
  const compressor = new AdvancedCompression();

  const gltfDoc = createEmptyGLTFDocument('Example Scene');

  // Compress the document
  const compressed = await compressor.compress(gltfDoc);

  // Get compression statistics
  const stats = compressor.getStats();
  // Compression statistics available via compressor.getStats()

  return compressed;
}

/**
 * Example 2: Using quality presets
 */
export async function qualityPresetCompression() {
  // Fast preset - for quick iterations
  const fastCompressor = new AdvancedCompression({
    qualityPreset: 'fast',
  });

  // Balanced preset - for production (default)
  const balancedCompressor = new AdvancedCompression({
    qualityPreset: 'balanced',
  });

  // Best preset - for final distribution
  const bestCompressor = new AdvancedCompression({
    qualityPreset: 'best',
  });

  const gltfDoc = createEmptyGLTFDocument('Example Scene');

  // Compare compression results
  const fastResult = await fastCompressor.compress({ ...gltfDoc });
  const balancedResult = await balancedCompressor.compress({ ...gltfDoc });
  const bestResult = await bestCompressor.compress({ ...gltfDoc });

  // Compare compression ratios via getStats() method

  return { fastResult, balancedResult, bestResult };
}

/**
 * Example 3: Custom compression options
 */
export async function customCompression() {
  const options: CompressionOptions = {
    // Texture compression
    compressTextures: true,
    textureFormat: 'ktx2',
    textureQuality: 85,
    generateMipmaps: true,

    // Mesh compression
    compressMeshes: true,
    dracoLevel: 8,
    positionBits: 14,
    normalBits: 10,
    uvBits: 12,
    colorBits: 10,
  };

  const compressor = new AdvancedCompression(options);
  const gltfDoc = createEmptyGLTFDocument('Example Scene');

  const result = await compressor.compress(gltfDoc);

  // Detailed report available via compressor.getCompressionReport()

  return result;
}

/**
 * Example 4: Texture-only compression
 */
export async function textureOnlyCompression() {
  const compressor = new AdvancedCompression({
    compressTextures: true,
    compressMeshes: false, // Disable mesh compression
    textureQuality: 90,
    generateMipmaps: true,
  });

  const gltfDoc = createEmptyGLTFDocument('Texture-Heavy Scene');

  const result = await compressor.compress(gltfDoc);
  const stats = compressor.getStats();

  // Texture compression stats available via getStats()

  return result;
}

/**
 * Example 5: Mesh-only compression
 */
export async function meshOnlyCompression() {
  const compressor = new AdvancedCompression({
    compressTextures: false, // Disable texture compression
    compressMeshes: true,
    dracoLevel: 10, // Maximum compression
    positionBits: 14,
    normalBits: 10,
  });

  const gltfDoc = createEmptyGLTFDocument('Mesh-Heavy Scene');

  const result = await compressor.compress(gltfDoc);
  const stats = compressor.getStats();

  // Mesh compression stats available via getStats()

  return result;
}

/**
 * Example 6: Integration with GLTFExporter
 */
export async function exportWithCompression(sceneGraph: ISceneGraph) {
  // Create exporter with compression enabled
  const exporter = new GLTFExporter({
    binary: true,
    compression: 'draco', // Enable compression
    embedTextures: true,
  });

  // Export scene graph
  const result = await exporter.export(sceneGraph);

  // Get compression stats
  const compressionStats = exporter.getCompressionStats();
  if (compressionStats) {
    // Compression stats available in compressionStats object
  }

  return result;
}

/**
 * Example 7: Performance monitoring
 */
export async function monitorCompressionPerformance() {
  const compressor = new AdvancedCompression({
    qualityPreset: 'balanced',
  });

  const gltfDoc = createEmptyGLTFDocument('Performance Test');

  const startTime = performance.now();
  const result = await compressor.compress(gltfDoc);
  const endTime = performance.now();

  const stats = compressor.getStats();

  // Performance metrics available via stats and timing calculations

  return result;
}

/**
 * Example 8: Batch compression
 */
export async function batchCompression(documents: unknown[]) {
  const compressor = new AdvancedCompression({
    qualityPreset: 'balanced',
  });

  const results = [];
  const allStats = [];

  for (const doc of documents) {
    // @ts-expect-error
    const compressed = await compressor.compress(doc);
    const stats = compressor.getStats();

    results.push(compressed);
    allStats.push(stats);
  }

  // Calculate aggregate statistics
  const totalOriginal = allStats.reduce((sum, s) => sum + s.originalSize, 0);
  const totalCompressed = allStats.reduce((sum, s) => sum + s.compressedSize, 0);
  const avgTime = allStats.reduce((sum, s) => sum + s.compressionTime, 0) / allStats.length;

  // Batch compression statistics calculated above

  return results;
}
