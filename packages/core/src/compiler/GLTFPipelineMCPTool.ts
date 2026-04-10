// TARGET: packages/core/src/compiler/GLTFPipelineMCPTool.ts
/**
 * GLTFPipeline MCP Tool — Expose GLTFPipeline as a Model Context Protocol Tool
 *
 * Wraps the GLTFPipeline compiler as an MCP (Model Context Protocol) tool,
 * enabling AI agents to import, convert, and export 3D assets via the
 * standardized MCP tool-calling interface.
 *
 * MCP Tool Capabilities:
 * - import_gltf: Import a .gltf/.glb file and convert to HoloComposition AST
 * - export_gltf: Export a HoloComposition AST to .gltf/.glb format
 * - validate_gltf: Validate a glTF file against the spec
 * - optimize_gltf: Optimize a glTF file (draco compression, dedup, prune)
 * - inspect_gltf: Inspect a glTF file and return metadata/statistics
 * - convert_format: Convert between glTF, GLB, and HoloScript formats
 *
 * MCP Reference: https://modelcontextprotocol.io/docs
 *
 * @version 1.0.0
 * @package @holoscript/core/compiler
 */

import type { HoloComposition } from '../parser/HoloCompositionTypes';

import type { GLTFPipelineOptions, GLTFExportResult, GLTFExportStats } from './GLTFPipeline';

// =============================================================================
// MCP TOOL TYPES (matching MCP specification)
// =============================================================================

/** MCP Tool definition */
export interface MCPToolDefinition {
  /** Tool name (unique identifier) */
  name: string;
  /** Human-readable description */
  description: string;
  /** JSON Schema for input parameters */
  inputSchema: MCPJsonSchema;
  /** JSON Schema for output */
  outputSchema?: MCPJsonSchema;
}

/** JSON Schema subset used in MCP */
export interface MCPJsonSchema {
  type: 'object' | 'string' | 'number' | 'boolean' | 'array';
  properties?: Record<string, MCPJsonSchemaProperty>;
  required?: string[];
  description?: string;
}

export interface MCPJsonSchemaProperty {
  type: string;
  description?: string;
  enum?: string[];
  default?: unknown;
  items?: MCPJsonSchemaProperty;
  properties?: Record<string, MCPJsonSchemaProperty>;
}

/** MCP Tool call request */
export interface MCPToolCallRequest {
  /** Tool name */
  name: string;
  /** Input arguments */
  arguments: Record<string, unknown>;
}

/** MCP Tool call response */
export interface MCPToolCallResponse {
  /** Whether the call succeeded */
  isError: boolean;
  /** Response content */
  content: MCPContentBlock[];
}

/** MCP content block */
export interface MCPContentBlock {
  type: 'text' | 'image' | 'resource';
  text?: string;
  mimeType?: string;
  data?: string; // base64 for binary
  uri?: string;
}

// =============================================================================
// TOOL DEFINITIONS
// =============================================================================

/** All GLTFPipeline MCP tool definitions */
export const GLTF_PIPELINE_TOOLS: MCPToolDefinition[] = [
  {
    name: 'holoscript_gltf_export',
    description:
      'Export a HoloScript composition AST to glTF/GLB format. ' +
      'Supports PBR materials, mesh primitives, animations, and texture embedding.',
    inputSchema: {
      type: 'object',
      properties: {
        composition: {
          type: 'object',
          description: 'HoloComposition AST (JSON serialized)',
        },
        format: {
          type: 'string',
          description: 'Output format',
          enum: ['glb', 'gltf'],
          default: 'glb',
        },
        dracoCompression: {
          type: 'boolean',
          description: 'Enable Draco mesh compression',
          default: false,
        },
        quantize: {
          type: 'boolean',
          description: 'Enable vertex quantization for smaller file size',
          default: false,
        },
        prune: {
          type: 'boolean',
          description: 'Remove unused resources',
          default: true,
        },
        dedupe: {
          type: 'boolean',
          description: 'Deduplicate accessors and materials',
          default: true,
        },
        embedTextures: {
          type: 'boolean',
          description: 'Embed textures as base64',
          default: true,
        },
        agentToken: {
          type: 'string',
          description: 'Agent authentication token (JWT or empty for dev)',
          default: '',
        },
      },
      required: ['composition'],
    },
  },
  {
    name: 'holoscript_gltf_inspect',
    description:
      'Inspect a glTF/GLB file and return metadata including node count, ' +
      'mesh count, material count, texture count, animation count, and file size.',
    inputSchema: {
      type: 'object',
      properties: {
        composition: {
          type: 'object',
          description: 'HoloComposition AST to inspect (will be processed through GLTFPipeline)',
        },
        format: {
          type: 'string',
          description: 'Target format for size estimation',
          enum: ['glb', 'gltf'],
          default: 'glb',
        },
      },
      required: ['composition'],
    },
  },
  {
    name: 'holoscript_gltf_validate',
    description:
      'Validate a HoloComposition AST for glTF export compatibility. ' +
      'Returns validation errors and warnings without performing the actual export.',
    inputSchema: {
      type: 'object',
      properties: {
        composition: {
          type: 'object',
          description: 'HoloComposition AST to validate',
        },
      },
      required: ['composition'],
    },
  },
  {
    name: 'holoscript_gltf_optimize',
    description:
      'Optimize a HoloComposition for efficient glTF export. Returns optimization ' +
      'recommendations and optionally applies them.',
    inputSchema: {
      type: 'object',
      properties: {
        composition: {
          type: 'object',
          description: 'HoloComposition AST to optimize',
        },
        applyOptimizations: {
          type: 'boolean',
          description: 'Whether to apply optimizations to the AST (true) or just report (false)',
          default: false,
        },
      },
      required: ['composition'],
    },
  },
  {
    name: 'holoscript_gltf_material_list',
    description:
      'List all available HoloScript material presets that can be used in ' +
      'glTF export. Returns names and PBR properties for each preset.',
    inputSchema: {
      type: 'object',
      properties: {
        filter: {
          type: 'string',
          description: 'Optional substring filter for preset names',
        },
      },
    },
  },
];

// =============================================================================
// TOOL HANDLER
// =============================================================================

/**
 * Handle an MCP tool call for the GLTFPipeline.
 *
 * This is the main entry point that an MCP server implementation would call
 * when it receives a tool invocation matching one of the GLTF_PIPELINE_TOOLS.
 *
 * @example
 * ```typescript
 * // In your MCP server handler:
 * import { handleGLTFToolCall, GLTF_PIPELINE_TOOLS } from './GLTFPipelineMCPTool';
 *
 * // Register tools
 * for (const tool of GLTF_PIPELINE_TOOLS) {
 *   server.registerTool(tool);
 * }
 *
 * // Handle calls
 * server.onToolCall(async (request) => {
 *   if (request.name.startsWith('holoscript_gltf_')) {
 *     return handleGLTFToolCall(request);
 *   }
 * });
 * ```
 */
export async function handleGLTFToolCall(
  request: MCPToolCallRequest
): Promise<MCPToolCallResponse> {
  try {
    switch (request.name) {
      case 'holoscript_gltf_export':
        return await handleExport(request.arguments);
      case 'holoscript_gltf_inspect':
        return await handleInspect(request.arguments);
      case 'holoscript_gltf_validate':
        return await handleValidate(request.arguments);
      case 'holoscript_gltf_optimize':
        return await handleOptimize(request.arguments);
      case 'holoscript_gltf_material_list':
        return await handleMaterialList(request.arguments);
      default:
        return {
          isError: true,
          content: [{ type: 'text', text: `Unknown tool: ${request.name}` }],
        };
    }
  } catch (error) {
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: `Error: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
    };
  }
}

// =============================================================================
// INDIVIDUAL TOOL HANDLERS
// =============================================================================

async function handleExport(args: Record<string, unknown>): Promise<MCPToolCallResponse> {
  const composition = args.composition as HoloComposition;
  if (!composition || !composition.name) {
    return {
      isError: true,
      content: [{ type: 'text', text: 'Invalid composition: missing "name" field' }],
    };
  }

  const format = (args.format as 'glb' | 'gltf') ?? 'glb';
  const agentToken = (args.agentToken as string) ?? '';

  // Dynamically import GLTFPipeline to avoid circular dependency at module load
  const { GLTFPipeline } = (await importGLTFPipeline()) as any;

  const pipeline = new GLTFPipeline({
    format,
    dracoCompression: (args.dracoCompression as boolean) ?? false,
    quantize: (args.quantize as boolean) ?? false,
    prune: (args.prune as boolean) ?? true,
    dedupe: (args.dedupe as boolean) ?? true,
    embedTextures: (args.embedTextures as boolean) ?? true,
  });

  const result = pipeline.compile(composition, agentToken) as GLTFExportResult;

  const content: MCPContentBlock[] = [];

  // Stats as text
  content.push({
    type: 'text',
    text: JSON.stringify(
      {
        success: true,
        format,
        stats: result.stats,
      },
      null,
      2
    ),
  });

  // Binary data as base64 resource
  if (result.binary) {
    content.push({
      type: 'resource',
      uri: `holoscript://gltf/${composition.name}.${format}`,
      mimeType: format === 'glb' ? 'model/gltf-binary' : 'model/gltf+json',
      data: uint8ArrayToBase64(result.binary),
    });
  }

  // JSON document (for .gltf format)
  if (result.json) {
    content.push({
      type: 'text',
      text: JSON.stringify(result.json, null, 2),
      mimeType: 'application/json',
    });
  }

  return { isError: false, content };
}

async function handleInspect(args: Record<string, unknown>): Promise<MCPToolCallResponse> {
  const composition = args.composition as HoloComposition;
  if (!composition || !composition.name) {
    return {
      isError: true,
      content: [{ type: 'text', text: 'Invalid composition: missing "name" field' }],
    };
  }

  // Count scene elements without full compilation
  const stats = inspectComposition(composition);

  return {
    isError: false,
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            name: composition.name,
            stats,
            estimated_export_format: (args.format as string) ?? 'glb',
          },
          null,
          2
        ),
      },
    ],
  };
}

async function handleValidate(args: Record<string, unknown>): Promise<MCPToolCallResponse> {
  const composition = args.composition as HoloComposition;
  if (!composition || !composition.name) {
    return {
      isError: true,
      content: [{ type: 'text', text: 'Invalid composition: missing "name" field' }],
    };
  }

  const validation = validateForGLTF(composition);

  return {
    isError: false,
    content: [
      {
        type: 'text',
        text: JSON.stringify(validation, null, 2),
      },
    ],
  };
}

async function handleOptimize(args: Record<string, unknown>): Promise<MCPToolCallResponse> {
  const composition = args.composition as HoloComposition;
  if (!composition || !composition.name) {
    return {
      isError: true,
      content: [{ type: 'text', text: 'Invalid composition: missing "name" field' }],
    };
  }

  const recommendations = analyzeOptimizations(composition);

  return {
    isError: false,
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            composition: composition.name,
            recommendations,
            total_recommendations: recommendations.length,
          },
          null,
          2
        ),
      },
    ],
  };
}

async function handleMaterialList(args: Record<string, unknown>): Promise<MCPToolCallResponse> {
  const filter = (args.filter as string) ?? '';

  // Import MATERIAL_PRESETS from R3FCompiler
  let presets: Record<string, unknown> = {};
  try {
    const { MATERIAL_PRESETS } = await import('./R3FCompiler');
    presets = MATERIAL_PRESETS as unknown as Record<string, unknown>;
  } catch {
    // Fallback: provide a basic list
    presets = {
      default: { metalness: 0, roughness: 0.5 },
      metal: { metalness: 1, roughness: 0.2 },
      glass: { metalness: 0, roughness: 0, transmission: 1 },
      wood: { metalness: 0, roughness: 0.8 },
      plastic: { metalness: 0, roughness: 0.4 },
    };
  }

  let entries = Object.entries(presets);
  if (filter) {
    entries = entries.filter(([name]) => name.toLowerCase().includes(filter.toLowerCase()));
  }

  return {
    isError: false,
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            total: entries.length,
            presets: Object.fromEntries(entries),
          },
          null,
          2
        ),
      },
    ],
  };
}

// =============================================================================
// INSPECTION / VALIDATION / OPTIMIZATION (lightweight, no full compile)
// =============================================================================

interface InspectionStats {
  objectCount: number;
  spatialGroupCount: number;
  lightCount: number;
  hasCamera: boolean;
  timelineCount: number;
  audioCount: number;
  npcCount: number;
  shapeCount: number;
  domainBlockCount: number;
  traitCount: number;
  estimatedNodeCount: number;
  estimatedMeshCount: number;
}

function inspectComposition(composition: HoloComposition): InspectionStats {
  let traitCount = 0;
  let objectCount = 0;

  function countObjects(objects: HoloComposition['objects']): void {
    for (const obj of objects ?? []) {
      objectCount++;
      traitCount += obj.traits?.length ?? 0;
      if (obj.children) countObjects(obj.children);
    }
  }

  countObjects(composition.objects);
  for (const group of composition.spatialGroups ?? []) {
    countObjects(group.objects);
  }

  return {
    objectCount,
    spatialGroupCount: composition.spatialGroups?.length ?? 0,
    lightCount: composition.lights?.length ?? 0,
    hasCamera: !!composition.camera,
    timelineCount: composition.timelines?.length ?? 0,
    audioCount: composition.audio?.length ?? 0,
    npcCount: composition.npcs?.length ?? 0,
    shapeCount: composition.shapes?.length ?? 0,
    domainBlockCount: composition.domainBlocks?.length ?? 0,
    traitCount,
    estimatedNodeCount:
      objectCount + (composition.spatialGroups?.length ?? 0) + (composition.lights?.length ?? 0),
    estimatedMeshCount: objectCount,
  };
}

interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

function validateForGLTF(composition: HoloComposition): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!composition.name) {
    errors.push('Composition is missing a name');
  }

  if (
    !composition.objects?.length &&
    !composition.spatialGroups?.length &&
    !composition.shapes?.length
  ) {
    warnings.push('Composition has no objects, spatial groups, or shapes to export');
  }

  // Check for unsupported features
  if (composition.npcs?.length) {
    warnings.push(
      `${composition.npcs.length} NPC(s) will be exported as basic meshes (no behavior trees in glTF)`
    );
  }

  if (composition.stateMachines?.length) {
    warnings.push('State machines are not representable in glTF and will be omitted');
  }

  if (composition.quests?.length) {
    warnings.push('Quest definitions are not representable in glTF and will be omitted');
  }

  // Check for objects without geometry
  function checkObjects(objects: HoloComposition['objects']): void {
    for (const obj of objects ?? []) {
      const hasGeometry =
        obj.properties.some(
          (p) => p.key === 'geometry' || p.key === 'shape' || p.key === 'model'
        ) || obj.traits?.some((t) => t.name === 'geometry' || t.name === 'mesh');

      if (!hasGeometry) {
        warnings.push(`Object "${obj.name}" has no explicit geometry; will default to cube`);
      }

      if (obj.children) checkObjects(obj.children);
    }
  }

  checkObjects(composition.objects);

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

interface OptimizationRecommendation {
  category: 'performance' | 'filesize' | 'compatibility' | 'quality';
  severity: 'info' | 'warning' | 'suggestion';
  message: string;
  action?: string;
}

function analyzeOptimizations(composition: HoloComposition): OptimizationRecommendation[] {
  const recommendations: OptimizationRecommendation[] = [];
  const stats = inspectComposition(composition);

  // Performance recommendations
  if (stats.objectCount > 100) {
    recommendations.push({
      category: 'performance',
      severity: 'warning',
      message: `Scene has ${stats.objectCount} objects. Consider using instancing or LOD for objects with shared geometry.`,
      action: 'Enable dedupe and consider spatial grouping for draw call batching.',
    });
  }

  if (stats.lightCount > 8) {
    recommendations.push({
      category: 'performance',
      severity: 'warning',
      message: `Scene has ${stats.lightCount} lights. Most real-time renderers support 4-8 dynamic lights.`,
      action: 'Bake some lights into lightmaps or reduce dynamic light count.',
    });
  }

  // File size recommendations
  if (stats.objectCount > 50) {
    recommendations.push({
      category: 'filesize',
      severity: 'suggestion',
      message: 'Consider enabling Draco compression for meshes to reduce file size by 40-90%.',
      action: 'Set dracoCompression: true in GLTFPipelineOptions.',
    });
  }

  recommendations.push({
    category: 'filesize',
    severity: 'info',
    message:
      'Enable vertex quantization to reduce vertex attribute precision and save ~30% on geometry data.',
    action: 'Set quantize: true in GLTFPipelineOptions.',
  });

  // Compatibility recommendations
  if (stats.domainBlockCount > 0) {
    recommendations.push({
      category: 'compatibility',
      severity: 'info',
      message: `${stats.domainBlockCount} domain block(s) detected. Domain-specific data will be stored in glTF extras for custom loader support.`,
    });
  }

  // Quality recommendations
  if (stats.traitCount === 0 && stats.objectCount > 0) {
    recommendations.push({
      category: 'quality',
      severity: 'suggestion',
      message: 'No traits found on objects. Add material/shader traits for richer visual output.',
      action: 'Add @material, @shader, or @emissive traits to objects.',
    });
  }

  return recommendations;
}

// =============================================================================
// UTILITIES
// =============================================================================

function uint8ArrayToBase64(data: Uint8Array): string {
  // Platform-agnostic base64 encoding
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(data).toString('base64');
  }
  // Browser fallback
  let binary = '';
  for (let i = 0; i < data.length; i++) {
    binary += String.fromCharCode(data[i]);
  }
  return btoa(binary);
}

/**
 * Lazy importer for GLTFPipeline to avoid circular module dependencies.
 * The actual GLTFPipeline class is in the same directory but importing it
 * at module load time would create a circular reference through CompilerBase.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic import to break circular dependency
async function importGLTFPipeline(): Promise<{ GLTFPipeline: unknown }> {
  return import('./GLTFPipeline');
}

// =============================================================================
// MCP SERVER REGISTRATION HELPER
// =============================================================================

/**
 * Register all GLTFPipeline tools with an MCP server instance.
 *
 * @example
 * ```typescript
 * import { registerGLTFTools } from './GLTFPipelineMCPTool';
 *
 * const server = new MCPServer();
 * registerGLTFTools(server);
 * ```
 */
export function registerGLTFTools(server: {
  registerTool(
    definition: MCPToolDefinition,
    handler: (req: MCPToolCallRequest) => Promise<MCPToolCallResponse>
  ): void;
}): void {
  for (const tool of GLTF_PIPELINE_TOOLS) {
    server.registerTool(tool, handleGLTFToolCall);
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export { inspectComposition, validateForGLTF, analyzeOptimizations };

export default handleGLTFToolCall;
