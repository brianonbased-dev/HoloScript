/**
 * exporters.ts — Scene Export Pipeline
 *
 * Export HoloScript scenes to various 3D formats.
 */

import type { SceneNode } from './serializer';

export type ExportFormat = 'glb' | 'gltf' | 'obj' | 'fbx' | 'usd' | 'holoscript';

export interface ExportOptions {
  format: ExportFormat;
  includeTextures: boolean;
  includeAnimations: boolean;
  optimizeMeshes: boolean;
  embedAssets: boolean;
  quality: 'draft' | 'production' | 'archival';
}

export interface ExportResult {
  format: ExportFormat;
  data: string;
  sizeBytes: number;
  nodeCount: number;
  warnings: string[];
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
      return JSON.stringify({
        asset: { version: '2.0', generator: 'HoloScript Studio v0.1.0' },
        scene: 0,
        scenes: [{ name: 'HoloScene', nodes: nodes.map((_, i) => i) }],
        nodes: nodes.map(n => ({
          name: n.name,
          translation: [n.position.x, n.position.y, n.position.z],
          rotation: [0, 0, 0, 1],
          scale: [n.scale.x, n.scale.y, n.scale.z],
        })),
      }, null, opts.quality === 'draft' ? 0 : 2);

    case 'obj':
      return nodes.map(n =>
        `# ${n.name}\ng ${n.name}\nv ${n.position.x} ${n.position.y} ${n.position.z}`
      ).join('\n\n');

    case 'usd':
      return `#usda 1.0\n(\n  defaultPrim = "HoloScene"\n)\n\ndef Xform "HoloScene" {\n${
        nodes.map(n => `  def Mesh "${n.name}" {\n    double3 xformOp:translate = (${n.position.x}, ${n.position.y}, ${n.position.z})\n  }`).join('\n')
      }\n}`;

    case 'holoscript':
      return nodes.map(n =>
        `${n.type} "${n.name}" {\n  position: ${n.position.x} ${n.position.y} ${n.position.z}\n  traits: [${n.traits.join(', ')}]\n}`
      ).join('\n\n');

    default:
      return JSON.stringify({ nodes: nodes.length, format });
  }
}

/**
 * Get supported export formats with metadata.
 */
export function supportedFormats(): Array<{ format: ExportFormat; label: string; extension: string }> {
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
    glb: 512, gltf: 768, obj: 256, fbx: 1024, usd: 640, holoscript: 128,
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
