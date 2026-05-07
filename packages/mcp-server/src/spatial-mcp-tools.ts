/**
 * Spatial MCP - `compile_to_spatial` tool.
 *
 * One round-trip that proves the protocol: accept a `.holo` composition plus
 * a `SpatialMCPContext` payload, choose a placement (gaze hit > hand > controller
 * > AABB center > headset > origin), and return a dual-channel
 * `SpatialMCPResponse` (text + holo + scenePatch).
 *
 * Spec: research/2026-05-07_spatial-mcp-spec.md (task_1778114195597_jira)
 *
 * @package @holoscript/mcp-server
 */

import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import {
  SPATIAL_CONTEXT_VERSION,
  SPATIAL_FRAME,
  pickPlacement,
  validateSpatialContext,
  type SpatialMCPContext,
  type SpatialMCPResponse,
  type ScenePatchOp,
} from '@holoscript/core';

// =============================================================================
// JSON-Schema for `inputSchema` - published in `tools/list`.
// =============================================================================

const VEC3_SCHEMA = {
  type: 'array',
  description: '[x, y, z] meters in tracking-space (right-handed, Y-up).',
  items: { type: 'number' },
  minItems: 3,
  maxItems: 3,
} as const;

const QUAT_SCHEMA = {
  type: 'object',
  description:
    "Unit quaternion {x,y,z,w}. Object form is required (avoids w-vs-xyzw packing rot).",
  properties: {
    x: { type: 'number' },
    y: { type: 'number' },
    z: { type: 'number' },
    w: { type: 'number' },
  },
  required: ['x', 'y', 'z', 'w'],
  additionalProperties: false,
} as const;

const HAND_SCHEMA = {
  type: 'object',
  properties: {
    position: VEC3_SCHEMA,
    rotation: QUAT_SCHEMA,
    grip: { type: 'number', minimum: 0, maximum: 1 },
    pinch: { type: 'number', minimum: 0, maximum: 1 },
  },
  required: ['position', 'rotation', 'grip'],
  additionalProperties: false,
} as const;

const CONTROLLER_SCHEMA = {
  type: 'object',
  properties: {
    position: VEC3_SCHEMA,
    rotation: QUAT_SCHEMA,
    velocity: VEC3_SCHEMA,
    angularVelocity: VEC3_SCHEMA,
  },
  required: ['position', 'rotation'],
  additionalProperties: false,
} as const;

const SPATIAL_CONTEXT_SCHEMA = {
  type: 'object',
  description:
    'v0.1 Spatial MCP payload. Bridges Quest 3 / Vision Pro / WebXR clients to mesh agents. See research/2026-05-07_spatial-mcp-spec.md.',
  properties: {
    version: {
      type: 'string',
      const: SPATIAL_CONTEXT_VERSION,
      description: 'Schema version. v0.1 only.',
    },
    frame: {
      type: 'string',
      const: SPATIAL_FRAME,
      description: 'Reference frame name. v0.1 only supports tracking-space-y-up-meters.',
    },
    room: {
      type: 'object',
      properties: {
        pointCloudPly: {
          type: 'string',
          description: 'ASCII PLY (xyz/xyz+rgb) - same format holo_reconstruct_export emits.',
        },
        aabb: {
          type: 'object',
          properties: { min: VEC3_SCHEMA, max: VEC3_SCHEMA },
          required: ['min', 'max'],
        },
        floorHeight: { type: 'number' },
      },
      additionalProperties: false,
    },
    gaze: {
      type: 'object',
      properties: {
        origin: VEC3_SCHEMA,
        direction: VEC3_SCHEMA,
        hitDistance: { type: 'number' },
      },
      required: ['origin', 'direction'],
      additionalProperties: false,
    },
    hands: {
      type: 'object',
      properties: { left: HAND_SCHEMA, right: HAND_SCHEMA },
      additionalProperties: false,
    },
    controllers: {
      type: 'object',
      properties: { left: CONTROLLER_SCHEMA, right: CONTROLLER_SCHEMA },
      additionalProperties: false,
    },
    headset: {
      type: 'object',
      properties: { position: VEC3_SCHEMA, rotation: QUAT_SCHEMA },
      required: ['position', 'rotation'],
      additionalProperties: false,
    },
    meta: {
      type: 'object',
      additionalProperties: { type: ['string', 'number', 'boolean'] },
    },
  },
  required: ['version', 'frame'],
  additionalProperties: false,
} as const;

// =============================================================================
// TOOL DEFINITION
// =============================================================================

export const spatialMcpToolDefinitions: Tool[] = [
  {
    name: 'compile_to_spatial',
    description:
      'Spatial MCP reference tool. Accepts a .holo composition plus SpatialMCPContext (room geometry, gaze ray, hand transforms, controller poses, headset pose). Picks a placement (gaze-hit > dominant-hand > controller > AABB-center > headset > origin) and returns a SpatialMCPResponse with text + holo (placement-wrapped composition) + scenePatch (single spawn op). One round-trip that bridges Quest 3 to mesh agents. See research/2026-05-07_spatial-mcp-spec.md. Returns: SpatialMCPResponse JSON.',
    inputSchema: {
      type: 'object',
      properties: {
        code: {
          type: 'string',
          description: '.holo composition source. Will be wrapped in a placement block at the chosen pose.',
        },
        spatialContext: SPATIAL_CONTEXT_SCHEMA,
        spawnId: {
          type: 'string',
          description:
            'Optional id used in the scene-patch spawn op (default: "spatial-mcp-spawn").',
        },
      },
      required: ['code', 'spatialContext'],
    },
  },
];

const SPATIAL_MCP_NAMES = new Set(spatialMcpToolDefinitions.map((t) => t.name));

export function isSpatialMcpToolName(name: string): boolean {
  return SPATIAL_MCP_NAMES.has(name);
}

// =============================================================================
// HANDLER
// =============================================================================

function fmt3(n: number): string {
  return Math.abs(n) < 1e-3 ? '0' : n.toFixed(3);
}

/**
 * Wrap the source composition in a comment block recording the chosen
 * placement. We deliberately do not parse `code`; the .holo parser is
 * available in @holoscript/core but the spec scope is "one round-trip
 * proves the protocol" - placement annotation is sufficient for v0.1.
 *
 * Tools that want to actually parse and rewrite can do so in v0.2; the
 * shape of `SpatialMCPResponse` is stable.
 */
function wrapHoloWithPlacement(
  code: string,
  position: readonly [number, number, number],
  source: string
): string {
  const [x, y, z] = position;
  const banner =
    `// spatial-mcp v${SPATIAL_CONTEXT_VERSION} placement\n` +
    `// frame: ${SPATIAL_FRAME}\n` +
    `// position: [${fmt3(x)}, ${fmt3(y)}, ${fmt3(z)}]\n` +
    `// source: ${source}\n`;
  return banner + code;
}

export async function handleSpatialMcpTool(
  name: string,
  args: Record<string, unknown>
): Promise<unknown> {
  if (name !== 'compile_to_spatial') {
    throw new Error(`Unknown spatial-mcp tool: ${name}`);
  }

  const code = args.code;
  if (typeof code !== 'string' || !code.trim()) {
    throw new Error('compile_to_spatial: code (non-empty string) is required');
  }

  const validation = validateSpatialContext(args.spatialContext);
  if (!validation.ok) {
    return {
      ok: false,
      error: 'spatialContext failed validation',
      validationErrors: validation.errors,
    };
  }

  const ctx = args.spatialContext as SpatialMCPContext;
  const placement = pickPlacement(ctx);
  const spawnId =
    typeof args.spawnId === 'string' && args.spawnId.trim()
      ? args.spawnId.trim()
      : 'spatial-mcp-spawn';

  const wrappedHolo = wrapHoloWithPlacement(code, placement.position, placement.source);

  const scenePatch: ScenePatchOp[] = [
    { op: 'spawn', id: spawnId, position: placement.position },
  ];

  const [px, py, pz] = placement.position;
  const text =
    `Placed composition via ${placement.source} at ` +
    `[${fmt3(px)}, ${fmt3(py)}, ${fmt3(pz)}] (${SPATIAL_FRAME}).`;

  const response: SpatialMCPResponse = {
    text,
    holo: wrappedHolo,
    scenePatch,
    frame: SPATIAL_FRAME,
    version: SPATIAL_CONTEXT_VERSION,
  };

  return { ok: true, ...response, placementSource: placement.source };
}
