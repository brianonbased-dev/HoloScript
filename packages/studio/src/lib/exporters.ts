/**
 * exporters.ts — Scene Export Pipeline
 *
 * Export HoloScript scenes to various 3D formats.
 */

import type { SceneNode } from './serializer';

export type ExportFormat = 'glb' | 'gltf' | 'obj' | 'fbx' | 'usd' | 'holoscript';

/**
 * Configuration options for exporting HoloScript scenes to various 3D formats.
 *
 * Used by HoloScript Studio's export system to control output quality,
 * optimization level, and asset bundling behavior.
 *
 * @interface ExportOptions
 */
export interface ExportOptions {
  /** Target format for the exported scene (GLB, GLTF, OBJ, FBX, USD, or native HoloScript) */
  format: ExportFormat;
  /** Whether to include texture files in the exported output */
  includeTextures: boolean;
  /** Whether to include animation data in the exported output */
  includeAnimations: boolean;
  /** Whether to apply mesh optimization (decimation, compression) during export */
  optimizeMeshes: boolean;
  /** Whether to embed assets inline vs. external references */
  embedAssets: boolean;
  /** Export quality level affecting file size, processing time, and fidelity */
  quality: 'draft' | 'production' | 'archival';
}

/**
 * Result data returned after successfully exporting a HoloScript scene.
 *
 * Contains the exported data, metadata about the export process,
 * and any warnings encountered during conversion.
 *
 * @interface ExportResult
 */
export interface ExportResult {
  /** The format that was used for export (matches the requested format) */
  format: ExportFormat;
  /** The exported scene data as a string (base64 for binary formats) */
  data: string;
  /** Size of the exported data in bytes */
  sizeBytes: number;
  /** Number of scene nodes included in the export */
  nodeCount: number;
  /** Array of non-fatal warnings encountered during export */
  warnings: string[];
  /** Time taken to complete the export operation in milliseconds */
  duration: number;
}

const DEFAULT_OPTIONS: ExportOptions = {
  format: 'glb',
  includeTextures: true,
  includeAnimations: true,
  optimizeMeshes: true,
  embedAssets: true,
  quality: 'production',
};

/**
 * Export a scene to the specified format.
 */
export function exportScene(
  nodes: SceneNode[],
  options: Partial<ExportOptions> = {}
): ExportResult {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const start = performance.now();
  const warnings: string[] = [];

  const nodeCount = countExportNodes(nodes);
  if (nodeCount === 0) warnings.push('Scene is empty');
  if (nodeCount > 10000) warnings.push('Large scene — export may be slow');

  // Generate format-specific header
  const data = generateFormatHeader(opts.format, nodes, opts);

  return {
    format: opts.format,
    data,
    sizeBytes: new TextEncoder().encode(data).length,
    nodeCount,
    warnings,
    duration: performance.now() - start,
  };
}

function countExportNodes(nodes: SceneNode[]): number {
  return nodes.reduce((sum, n) => sum + 1 + countExportNodes(n.children), 0);
}

function generateFormatHeader(
  format: ExportFormat,
  nodes: SceneNode[],
  opts: ExportOptions
): string {
  switch (format) {
    case 'gltf':
    case 'glb':
      return JSON.stringify(
        {
          asset: { version: '2.0', generator: 'HoloScript Studio v0.1.0' },
          scene: 0,
          scenes: [{ name: 'HoloScene', nodes: nodes.map((_, i) => i) }],
          nodes: nodes.map((n) => ({
            name: n.name,
            translation: [n.position.x, n.position.y, n.position.z],
            rotation: [0, 0, 0, 1],
            scale: [n.scale.x, n.scale.y, n.scale.z],
          })),
        },
        null,
        opts.quality === 'draft' ? 0 : 2
      );

    case 'obj':
      return nodes
        .map((n) => `# ${n.name}\ng ${n.name}\nv ${n.position.x} ${n.position.y} ${n.position.z}`)
        .join('\n\n');

    case 'usd':
      return `#usda 1.0\n(\n  defaultPrim = "HoloScene"\n)\n\ndef Xform "HoloScene" {\n${nodes
        .map(
          (n) =>
            `  def Mesh "${n.name}" {\n    double3 xformOp:translate = (${n.position.x}, ${n.position.y}, ${n.position.z})\n  }`
        )
        .join('\n')}\n}`;

    case 'holoscript':
      return nodes
        .map(
          (n) =>
            `${n.type} "${n.name}" {\n  position: ${n.position.x} ${n.position.y} ${n.position.z}\n  traits: [${n.traits.join(', ')}]\n}`
        )
        .join('\n\n');

    default:
      return JSON.stringify({ nodes: nodes.length, format });
  }
}

/**
 * Get supported export formats with metadata.
 */
export function supportedFormats(): Array<{
  format: ExportFormat;
  label: string;
  extension: string;
}> {
  return [
    { format: 'glb', label: 'glTF Binary', extension: '.glb' },
    { format: 'gltf', label: 'glTF JSON', extension: '.gltf' },
    { format: 'obj', label: 'Wavefront OBJ', extension: '.obj' },
    { format: 'usd', label: 'Universal Scene Description', extension: '.usda' },
    { format: 'holoscript', label: 'HoloScript Source', extension: '.holo' },
  ];
}

/**
 * Estimate export file size without generating the full export.
 */
export function estimateExportSize(nodeCount: number, format: ExportFormat): number {
  const basePerNode: Record<ExportFormat, number> = {
    glb: 512,
    gltf: 768,
    obj: 256,
    fbx: 1024,
    usd: 640,
    holoscript: 128,
  };
  return nodeCount * (basePerNode[format] || 512);
}

// Backward-compatible re-exports from orchestration exporters
export {
  exportWorkflow,
  exportWorkflowAsTS,
  exportBehaviorTree,
  exportEventsAsCSV,
  exportEventsAsJSON,
  downloadWorkflowJSON,
  downloadWorkflowTS,
  downloadBehaviorTreeJSON,
  downloadEventsCSV,
  downloadEventsJSON,
} from './export/exporters';
