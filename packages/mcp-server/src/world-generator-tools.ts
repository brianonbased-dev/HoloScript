/**
 * generate_world MCP tool — HY-World 2.0 world generation
 *
 * Wraps WorldGeneratorService+HYWorldAdapter to give agents a single
 * tool call that produces a navigable 3D world from a text/image prompt.
 */

import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type {
  CallToolRequest,
  CallToolResult,
} from '@modelcontextprotocol/sdk/types.js';

// =============================================================================
// TOOL DEFINITION
// =============================================================================

export const worldGeneratorTools: Tool[] = [
  {
    name: 'generate_world',
    description: [
      'Generate a navigable 3D world from a text or image prompt using HY-World 2.0.',
      'Returns a 3D Gaussian Splat (.ply) or mesh (.glb) asset URL plus spatial metadata.',
      'Supported engines: hy-world-2.0 (default, public), stable-world, custom.',
      'For navmesh output (WorldNav), set navEnabled: true.',
      'For physics/collision (WorldLens), set interactiveMode: true.',
    ].join(' '),
    inputSchema: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description: 'Text description of the world to generate, e.g. "lush alien jungle with glowing plants"',
        },
        input_image: {
          type: 'string',
          description: 'URL or path to a single-view image for image-guided reconstruction',
        },
        input_images: {
          type: 'array',
          items: { type: 'string' },
          description: 'Multiple images for multi-view reconstruction (HY-World 2.0 multi-view mode)',
        },
        engine: {
          type: 'string',
          enum: ['hy-world-2.0', 'stable-world', 'custom'],
          description: 'Engine backend (default: hy-world-2.0)',
        },
        format: {
          type: 'string',
          enum: ['3dgs', 'mesh', 'both'],
          description: 'Output format: 3DGS splats, mesh, or both (default: 3dgs)',
        },
        quality: {
          type: 'string',
          enum: ['low', 'medium', 'high', 'ultra'],
          description: 'Quality tier controlling resolution and generation time (default: medium)',
        },
        seed: {
          type: 'number',
          description: 'Random seed for reproducible results',
        },
        navEnabled: {
          type: 'boolean',
          description: 'Generate a navmesh alongside the world asset (WorldNav, full pipeline)',
        },
        interactiveMode: {
          type: 'boolean',
          description: 'Enable physics / collision via WorldLens interactive mode',
        },
      },
      required: ['prompt'],
    },
  },
];

// =============================================================================
// HANDLER
// =============================================================================

/**
 * Lazy-import the world stack to avoid loading fetch/timers in tests that
 * don't exercise this tool.
 */
async function getService() {
  const { worldGeneratorService } = await import('@holoscript/core/world');
  worldGeneratorService.registerDefaultAdapters();
  return worldGeneratorService;
}

export async function handleWorldGeneratorTool(
  request: CallToolRequest
): Promise<CallToolResult> {
  if (request.params.name !== 'generate_world') {
    return { content: [{ type: 'text', text: 'Unknown tool' }], isError: true };
  }

  const args = request.params.arguments as Record<string, unknown>;
  const prompt = args['prompt'];

  if (typeof prompt !== 'string' || !prompt.trim()) {
    return {
      content: [{ type: 'text', text: 'Error: prompt is required and must be a non-empty string' }],
      isError: true,
    };
  }

  const engine = (args['engine'] as string | undefined) ?? 'hy-world-2.0';
  const format = (args['format'] as 'mesh' | '3dgs' | 'both' | undefined) ?? '3dgs';
  const quality = (args['quality'] as 'low' | 'medium' | 'high' | 'ultra' | undefined) ?? 'medium';

  try {
    const service = await getService();

    // Use a simple in-process emitter to capture events synchronously
    const { EventEmitter } = await import('events');
    const emitter = new EventEmitter();

    const resultPromise = new Promise<unknown>((resolve, reject) => {
      emitter.once('world:generation_complete', resolve);
      emitter.once('world:generation_error', (data: unknown) => {
        const err = (data as Record<string, unknown>)['error'];
        reject(new Error(String(err)));
      });
    });

    // Bind service and trigger generation
    const unbind = service.bindEventEmitter({
      on: (ev, fn) => emitter.on(ev, fn),
      off: (ev, fn) => emitter.off(ev, fn),
      emit: (ev, data) => {
        emitter.emit(ev, data);
      },
    });

    const event = {
      nodeId: `mcp-${Date.now()}`,
      engine,
      prompt: prompt.trim(),
      format,
      quality,
      ...(args['input_image'] ? { input_image: String(args['input_image']) } : {}),
      ...(Array.isArray(args['input_images']) ? { input_images: args['input_images'] as string[] } : {}),
      ...(args['seed'] !== undefined ? { seed: Number(args['seed']) } : {}),
      ...(args['navEnabled'] !== undefined ? { navEnabled: Boolean(args['navEnabled']) } : {}),
      ...(args['interactiveMode'] !== undefined ? { interactiveMode: Boolean(args['interactiveMode']) } : {}),
    };

    void service.handleGenerateEvent(
      {
        on: (ev, fn) => emitter.on(ev, fn),
        off: (ev, fn) => emitter.off(ev, fn),
        emit: (ev, data) => { emitter.emit(ev, data); },
      },
      event
    );

    const result = await resultPromise;
    unbind();

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      content: [{ type: 'text', text: `World generation failed: ${message}` }],
      isError: true,
    };
  }
}
