/**
 * HoloScript MCP Tool Adapter
 *
 * Exposes five core HoloScript capabilities as MCP-compatible tools
 * for registration with the MCP Mesh Orchestrator (production Railway).
 *
 * Tools:
 *   1. holo_compile_nir    - Compile a .holo composition to NIR graph JSON
 *   2. holo_compile_wgsl   - Compile NIR graph JSON to WGSL compute shaders
 *   3. holo_generate_spatial_training - Generate spatial reasoning training data
 *   4. holo_sparsity_check  - Run sparsity analysis on SNN layer metrics
 *   5. holo_agent_create    - Create an agent via agent-sdk (Agent Card + mesh)
 *
 * Each tool follows the MCP tool schema: { name, description, inputSchema }
 * and provides a handler function for execution.
 *
 * @module mcp/HoloScriptMCPAdapter
 * @version 1.0.0
 */

import { readJson } from '../errors/safeJsonParse';
import { NIRCompiler, type NIRCompilerOptions } from '../compiler/NIRCompiler';
import {
  NIRToWGSLCompiler,
  type NIRToWGSLCompilerOptions,
  type NIRToWGSLResult,
} from '../compiler/NIRToWGSLCompiler';
import { HoloCompositionParser } from '../parser/HoloCompositionParser';
import type { HoloComposition } from '../parser/HoloCompositionTypes';
import { SpatialTrainingDataGenerator } from '@holoscript/framework/training';
import type {
  SpatialTrainingExample,
  SpatialGeneratorConfig,
} from '@holoscript/framework/training';
import { SparsityMonitor, type LayerActivityInput } from '@holoscript/framework/training';
import type { SparsityMonitorConfig, SparsityMonitorStats } from '@holoscript/framework/training';

// =============================================================================
// TOOL SCHEMA TYPE
// =============================================================================

export interface MCPToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface MCPToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

export type MCPToolHandler = (args: Record<string, unknown>) => Promise<MCPToolResult>;

// =============================================================================
// TOOL DEFINITIONS
// =============================================================================

export const HOLOSCRIPT_MCP_TOOLS: MCPToolDefinition[] = [
  {
    name: 'holo_compile_nir',
    description:
      'Compile a HoloScript .holo composition to NIR (Neuromorphic Intermediate Representation) ' +
      'graph JSON. The NIR graph is compatible with Intel Loihi 2, SpiNNaker 2, SynSense, and ' +
      'BrainScaleS-2 neuromorphic hardware. Accepts raw .holo source code and returns the NIR ' +
      'graph as a JSON string.',
    inputSchema: {
      type: 'object',
      properties: {
        code: {
          type: 'string',
          description: 'HoloScript .holo composition source code containing neuromorphic traits',
        },
        options: {
          type: 'object',
          description: 'Optional NIR compiler configuration',
          properties: {
            targetPlatforms: {
              type: 'array',
              items: { type: 'string' },
              description:
                'Target neuromorphic platforms: loihi2, spinnaker2, synsense_speck, synsense_xylo, brainscales2',
            },
            includeMetadata: {
              type: 'boolean',
              description: 'Include metadata in output (default: true)',
            },
            validateGraph: {
              type: 'boolean',
              description: 'Validate graph structure (default: true)',
            },
            prettyPrint: { type: 'boolean', description: 'Pretty-print JSON (default: true)' },
            defaultNeuronSize: {
              type: 'number',
              description: 'Default neuron layer size (default: 128)',
            },
          },
        },
        agentToken: {
          type: 'string',
          description: 'Agent authentication token for RBAC access control',
        },
      },
      required: ['code'],
    },
  },
  {
    name: 'holo_compile_wgsl',
    description:
      'Compile an NIR graph JSON to WGSL compute shaders for GPU-based neuromorphic simulation ' +
      'via WebGPU. Takes NIR JSON (output from holo_compile_nir) and generates per-node WGSL ' +
      'compute shaders with buffer layouts and execution order.',
    inputSchema: {
      type: 'object',
      properties: {
        nirGraphJson: {
          type: 'string',
          description: 'NIR graph JSON string (output from holo_compile_nir)',
        },
        options: {
          type: 'object',
          description: 'Optional WGSL compiler configuration',
          properties: {
            integrationMethod: {
              type: 'string',
              enum: ['euler', 'rk4'],
              description: 'ODE integration method (default: euler)',
            },
            dt: { type: 'number', description: 'Simulation timestep in ms (default: 1.0)' },
            workgroupSize: { type: 'number', description: 'Compute workgroup size (default: 64)' },
            includeComments: {
              type: 'boolean',
              description: 'Include debug comments (default: true)',
            },
            resetVoltage: { type: 'number', description: 'Spike reset voltage (default: 0.0)' },
          },
        },
        agentToken: {
          type: 'string',
          description: 'Agent authentication token for RBAC access control',
        },
      },
      required: ['nirGraphJson'],
    },
  },
  {
    name: 'holo_generate_spatial_training',
    description:
      'Generate spatial reasoning training data from HoloScript compositions. Produces ' +
      'instruction-response pairs in JSONL format for fine-tuning LLMs on spatial reasoning ' +
      '(spatial_adjacent, spatial_contains, spatial_reachable). Supports configurable difficulty ' +
      'levels and 12+ templates per relationship type.',
    inputSchema: {
      type: 'object',
      properties: {
        examplesPerCategory: {
          type: 'number',
          description: 'Number of examples per (relationship x difficulty) category (default: 10)',
        },
        relationshipTypes: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['spatial_adjacent', 'spatial_contains', 'spatial_reachable'],
          },
          description: 'Which spatial relationship types to generate (default: all three)',
        },
        difficultyLevels: {
          type: 'array',
          items: { type: 'string', enum: ['basic', 'intermediate', 'advanced'] },
          description: 'Difficulty levels to include (default: all three)',
        },
        positiveRatio: {
          type: 'number',
          description: 'Ratio of positive to total examples, 0.0-1.0 (default: 0.5)',
        },
        seed: {
          type: 'number',
          description: 'Random seed for reproducible generation',
        },
        format: {
          type: 'string',
          enum: ['examples', 'jsonl'],
          description:
            'Output format: "examples" (structured objects) or "jsonl" (newline-delimited JSON strings). Default: examples',
        },
      },
    },
  },
  {
    name: 'holo_sparsity_check',
    description:
      'Run sparsity analysis on SNN (Spiking Neural Network) layer metrics. Records layer ' +
      'activity, takes a snapshot, and returns sparsity statistics including violation detection ' +
      '(threshold: >= 93% activation sparsity per W.041), energy efficiency metrics, and a ' +
      'quality-history.json compatible entry.',
    inputSchema: {
      type: 'object',
      properties: {
        layers: {
          type: 'array',
          description: 'Array of SNN layer activity records to analyze',
          items: {
            type: 'object',
            properties: {
              layerId: { type: 'string', description: 'Unique layer identifier' },
              neuronCount: { type: 'number', description: 'Total neurons in the layer' },
              spikeCount: { type: 'number', description: 'Number of neurons that spiked' },
              timestep: { type: 'number', description: 'Simulation timestep index' },
              avgMembranePotential: {
                type: 'number',
                description: 'Optional average membrane potential',
              },
            },
            required: ['layerId', 'neuronCount', 'spikeCount', 'timestep'],
          },
        },
        config: {
          type: 'object',
          description: 'Optional sparsity monitor configuration',
          properties: {
            sparsityThreshold: {
              type: 'number',
              description: 'Minimum activation sparsity (default: 0.93)',
            },
            windowSize: { type: 'number', description: 'Rolling window size (default: 50)' },
            energyMetricsEnabled: {
              type: 'boolean',
              description: 'Enable energy metrics (default: true)',
            },
            criticalThreshold: {
              type: 'number',
              description: 'Critical violation threshold (default: 0.85)',
            },
          },
        },
        cycle: {
          type: 'number',
          description: 'Training cycle number for quality-history entry (default: 1)',
        },
      },
      required: ['layers'],
    },
  },
  {
    name: 'holo_agent_create',
    description:
      'Create an agent via the HoloScript agent-sdk. Generates an Agent Card (A2A interop) ' +
      'with mesh discovery, signal service, and gossip protocol capabilities. Returns the ' +
      'validated agent card and mesh node ID.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Agent name' },
        description: { type: 'string', description: 'Agent description' },
        version: { type: 'string', description: 'Agent version (semver)' },
        url: { type: 'string', description: 'Agent endpoint URL' },
        skills: {
          type: 'array',
          description: 'Agent skills',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              name: { type: 'string' },
              description: { type: 'string' },
              tags: { type: 'array', items: { type: 'string' } },
              examples: { type: 'array', items: { type: 'string' } },
            },
            required: ['id', 'name', 'description', 'tags'],
          },
        },
        capabilities: {
          type: 'array',
          description: 'Agent capabilities',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              name: { type: 'string' },
              description: { type: 'string' },
            },
            required: ['id', 'name', 'description'],
          },
        },
        auth: {
          type: 'object',
          description: 'Authentication configuration',
          properties: {
            type: { type: 'string', enum: ['none', 'api-key', 'oauth2', 'bearer'] },
          },
        },
      },
      required: ['name', 'description', 'version', 'url', 'skills'],
    },
  },
];

// =============================================================================
// TOOL HANDLERS
// =============================================================================

/**
 * Handle holo_compile_nir: parse .holo source and compile to NIR graph.
 */
export async function handleCompileNIR(args: Record<string, unknown>): Promise<MCPToolResult> {
  try {
    const code = args.code as string;
    if (!code || typeof code !== 'string') {
      return { success: false, error: 'Missing required parameter: code (string)' };
    }

    const options = (args.options as NIRCompilerOptions) ?? {};
    const agentToken = (args.agentToken as string) ?? 'mcp-adapter-token';

    // Parse the .holo composition
    const parser = new HoloCompositionParser();
    const parseResult = parser.parse(code);

    if (parseResult.errors && parseResult.errors.length > 0) {
      return {
        success: false,
        error: `Parse errors: ${parseResult.errors.map((e: { message: string }) => e.message).join('; ')}`,
      };
    }

    // Compile to NIR
    const compiler = new NIRCompiler(options);
    const nirJson = compiler.compile(parseResult.ast as HoloComposition, agentToken);
    const nirObj = readJson(nirJson) as { nodes?: Record<string, unknown> };

    return {
      success: true,
      data: {
        nirGraph: nirJson,
        metadata: {
          compiler: 'NIRCompiler',
          version: '1.0.0',
          nodeCount: nirObj.nodes ? Object.keys(nirObj.nodes).length : 0,
        },
      },
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: `NIR compilation failed: ${message}` };
  }
}

/**
 * Handle holo_compile_wgsl: compile NIR graph to WGSL compute shaders.
 */
export async function handleCompileWGSL(args: Record<string, unknown>): Promise<MCPToolResult> {
  try {
    const nirGraphJson = args.nirGraphJson as string;
    if (!nirGraphJson || typeof nirGraphJson !== 'string') {
      return { success: false, error: 'Missing required parameter: nirGraphJson (string)' };
    }

    const options = (args.options as NIRToWGSLCompilerOptions) ?? {};
    const agentToken = (args.agentToken as string) ?? undefined;

    const compiler = new NIRToWGSLCompiler(options);
    const result: NIRToWGSLResult = compiler.compileNIRGraph(nirGraphJson, agentToken);

    return {
      success: true,
      data: {
        shaderCount: result.shaders.length,
        executionOrder: result.executionOrder,
        shaders: result.shaders.map((s) => ({
          nodeId: s.nodeId,
          nodeType: s.nodeType,
          wgsl: s.wgsl,
          dispatch: s.dispatch,
          bufferCount: s.buffers.length,
        })),
        connections: result.connections,
        metadata: result.metadata,
      },
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: `WGSL compilation failed: ${message}` };
  }
}

/**
 * Handle holo_generate_spatial_training: generate spatial reasoning training data.
 */
export async function handleGenerateSpatialTraining(
  args: Record<string, unknown>
): Promise<MCPToolResult> {
  try {
    const config: SpatialGeneratorConfig = {};

    if (typeof args.examplesPerCategory === 'number') {
      config.examplesPerCategory = args.examplesPerCategory;
    }
    if (Array.isArray(args.relationshipTypes)) {
      config.relationshipTypes =
        args.relationshipTypes as SpatialGeneratorConfig['relationshipTypes'];
    }
    if (Array.isArray(args.difficultyLevels)) {
      config.difficultyLevels = args.difficultyLevels as SpatialGeneratorConfig['difficultyLevels'];
    }
    if (typeof args.positiveRatio === 'number') {
      config.positiveRatio = args.positiveRatio;
    }
    if (typeof args.seed === 'number') {
      config.seed = args.seed;
    }

    const generator = new SpatialTrainingDataGenerator(config);
    const examples: SpatialTrainingExample[] = generator.generate();

    const format = (args.format as string) ?? 'examples';

    if (format === 'jsonl') {
      const jsonl = examples
        .map((ex) =>
          JSON.stringify({
            instruction: ex.instruction,
            response: ex.response,
            metadata: {
              relationshipType: ex.relationshipType,
              difficulty: ex.difficulty,
              isPositive: ex.isPositive,
            },
          })
        )
        .join('\n');

      return {
        success: true,
        data: {
          format: 'jsonl',
          content: jsonl,
          exampleCount: examples.length,
        },
      };
    }

    return {
      success: true,
      data: {
        format: 'examples',
        examples,
        exampleCount: examples.length,
        stats: {
          relationshipTypes: config.relationshipTypes ?? [
            'spatial_adjacent',
            'spatial_contains',
            'spatial_reachable',
          ],
          difficultyLevels: config.difficultyLevels ?? ['basic', 'intermediate', 'advanced'],
          examplesPerCategory: config.examplesPerCategory ?? 10,
        },
      },
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: `Spatial training data generation failed: ${message}` };
  }
}

/**
 * Handle holo_sparsity_check: run sparsity analysis on SNN layer metrics.
 */
export async function handleSparsityCheck(args: Record<string, unknown>): Promise<MCPToolResult> {
  try {
    const layers = args.layers as Array<{
      layerId: string;
      neuronCount: number;
      spikeCount: number;
      timestep: number;
      avgMembranePotential?: number;
    }>;

    if (!Array.isArray(layers) || layers.length === 0) {
      return { success: false, error: 'Missing required parameter: layers (non-empty array)' };
    }

    const monitorConfig = (args.config as Partial<SparsityMonitorConfig>) ?? {};
    const cycle = typeof args.cycle === 'number' ? args.cycle : 1;

    const monitor = new SparsityMonitor(monitorConfig);

    // Record each layer's activity
    for (const layer of layers) {
      const input: LayerActivityInput = {
        neuronCount: layer.neuronCount,
        spikeCount: layer.spikeCount,
        timestep: layer.timestep,
        avgMembranePotential: layer.avgMembranePotential,
      };
      monitor.recordLayerActivity(layer.layerId, input);
    }

    // Take snapshot
    const snapshot = monitor.takeSnapshot();

    // Get stats and violations
    const stats: SparsityMonitorStats = monitor.getStats();
    const violations = monitor.getActiveViolations();
    const qualityEntry = monitor.toQualityHistoryEntry(cycle);

    return {
      success: true,
      data: {
        snapshot,
        stats,
        violations,
        qualityHistoryEntry: qualityEntry,
        summary: {
          layerCount: layers.length,
          aggregateSparsity: snapshot?.aggregateSparsity ?? null,
          violationCount: violations.length,
          passesThreshold: violations.length === 0,
          energyEfficiency: snapshot?.energyEfficiency ?? null,
        },
      },
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: `Sparsity check failed: ${message}` };
  }
}

/**
 * Handle holo_agent_create: create an agent card inline.
 *
 * Agent card creation logic lives here directly (the @holoscript/agent-sdk
 * shim has been removed; canonical mesh types are in @holoscript/framework).
 */
export async function handleAgentCreate(args: Record<string, unknown>): Promise<MCPToolResult> {
  try {
    const name = args.name as string;
    const description = args.description as string;
    const version = args.version as string;
    const url = args.url as string;
    const skills = args.skills as Array<{
      id: string;
      name: string;
      description: string;
      tags: string[];
      examples?: string[];
    }>;

    if (!name || !description || !version || !url || !Array.isArray(skills)) {
      return {
        success: false,
        error: 'Missing required parameters: name, description, version, url, skills',
      };
    }

    const capabilities =
      (args.capabilities as Array<{ id: string; name: string; description: string }>) ?? [];
    const auth = (args.auth as { type: 'none' | 'api-key' | 'oauth2' | 'bearer' }) ?? {
      type: 'none' as const,
    };

    // Build the Agent Card
    const agentCard = {
      name,
      description,
      version,
      url,
      capabilities,
      skills,
      authentication: auth,
      defaultInputModes: ['text/plain', 'application/json'],
      defaultOutputModes: ['text/plain', 'application/json'],
    };

    // Validate
    const errors: string[] = [];
    if (typeof agentCard.name !== 'string' || !agentCard.name) errors.push('name is required');
    if (typeof agentCard.version !== 'string' || !agentCard.version)
      errors.push('version is required');
    if (typeof agentCard.url !== 'string' || !agentCard.url) errors.push('url is required');
    if (!Array.isArray(agentCard.skills)) errors.push('skills must be an array');

    if (errors.length > 0) {
      return { success: false, error: `Agent card validation failed: ${errors.join(', ')}` };
    }

    // Generate a mesh node ID
    const meshNodeId = `agent_${name.toLowerCase().replace(/[^a-z0-9]/g, '_')}_${Date.now().toString(36)}`;

    return {
      success: true,
      data: {
        agentCard,
        meshNodeId,
        validation: { valid: true, errors: [] },
        message: `Agent "${name}" created successfully with ${skills.length} skill(s)`,
      },
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: `Agent creation failed: ${message}` };
  }
}

// =============================================================================
// TOOL HANDLER REGISTRY
// =============================================================================

/**
 * Map of tool name -> handler function.
 */
export const TOOL_HANDLERS: Record<string, MCPToolHandler> = {
  holo_compile_nir: handleCompileNIR,
  holo_compile_wgsl: handleCompileWGSL,
  holo_generate_spatial_training: handleGenerateSpatialTraining,
  holo_sparsity_check: handleSparsityCheck,
  holo_agent_create: handleAgentCreate,
};

/**
 * Dispatch a tool call by name.
 *
 * @param toolName - The MCP tool name
 * @param args - Tool arguments
 * @returns The tool result, or null if the tool name is not recognized
 */
export async function handleHoloScriptTool(
  toolName: string,
  args: Record<string, unknown>
): Promise<MCPToolResult | null> {
  const handler = TOOL_HANDLERS[toolName];
  if (!handler) return null;
  return handler(args);
}
