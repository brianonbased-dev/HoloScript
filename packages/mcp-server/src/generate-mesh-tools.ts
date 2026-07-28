/**
 * HoloScript MCP Generate-Mesh Tools
 *
 * Exposes the native, license-free SDF -> editable mesh path as an MCP tool.
 *
 * `holo_generate_mesh` (mode: "sdf"):
 *   author an SDF/CSG tree -> marching cubes -> watertight, welded, outward-wound
 *   triangle mesh (the same tested @holoscript/engine `marchingCubes` the studio
 *   manufacturing lane uses) -> optional STL (ascii or base64 binary).
 *
 * Mode "prompt" (text/image -> mesh via Meshy/Tripo) is NOT enabled here: that
 * bridge lives in @holoscript/cli (`textTo3DToHolo`), which mcp-server does not
 * depend on. Wiring it requires adding the cli dependency (lockfile change) and
 * is deliberately deferred to keep this surface dependency-safe (D.096 plan:
 * ship the native SDF path now; the bridge + GLB output are scoped follow-ups).
 *
 * @version 1.0.0
 * @package @holoscript/mcp-server
 */

import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { Simulation } from '@holoscript/engine';

type Vec3 = [number, number, number];

interface GenerateMeshArgs {
  mode?: 'sdf' | 'prompt';
  sdf?: unknown;
  resolution?: number[];
  bounds?: { min?: number[]; max?: number[] };
  isoLevel?: number;
  scaleFactor?: number;
  output?: 'stats' | 'stl-ascii' | 'stl-binary';
  prompt?: string;
  provider?: string;
}

function toVec3(a: number[] | undefined, fallback: Vec3): Vec3 {
  return a && a.length === 3 ? [a[0], a[1], a[2]] : fallback;
}

async function handleGenerateMesh(args: GenerateMeshArgs): Promise<unknown> {
  const mode = args.mode ?? 'sdf';

  if (mode === 'prompt') {
    return {
      success: false,
      mode: 'prompt',
      error:
        'Prompt mode (text/image -> mesh via Meshy/Tripo) is not enabled in the MCP server: it lives in ' +
        '@holoscript/cli (textTo3DToHolo), which mcp-server does not depend on. Use the CLI importer directly, ' +
        'or request the @holoscript/cli dependency be added. SDF mode (authored/CSG -> editable mesh) is ' +
        'available now via mode:"sdf".',
    };
  }

  if (
    !args.sdf ||
    typeof args.sdf !== 'object' ||
    typeof (args.sdf as { type?: unknown }).type !== 'string'
  ) {
    return {
      success: false,
      error:
        'mode:"sdf" requires an `sdf` SDFNode object, e.g. { type:"primitive", primitive:"sphere", ' +
        'params:{ radius:1 } } or a CSG node { type:"csg", operation:"smooth_union", smoothness:0.2, ' +
        'children:[ ... ] }.',
    };
  }

  const opts: Simulation.MarchingCubesOptions = {
    resolution: toVec3(args.resolution, [48, 48, 48]),
    bounds: {
      min: toVec3(args.bounds?.min, [-1, -1, -1]),
      max: toVec3(args.bounds?.max, [1, 1, 1]),
    },
    isoLevel: typeof args.isoLevel === 'number' ? args.isoLevel : 0,
    scaleFactor: typeof args.scaleFactor === 'number' ? args.scaleFactor : 1,
  };

  let mesh: Simulation.SurfaceMesh;
  try {
    mesh = Simulation.marchingCubes(args.sdf as Simulation.SDFNode, opts);
  } catch (e) {
    return {
      success: false,
      error: 'marchingCubes failed: ' + (e instanceof Error ? e.message : String(e)),
    };
  }

  const vertexCount = mesh.vertices.length / 3;
  const triangleCount = mesh.triangles.length / 3;

  const result: Record<string, unknown> = {
    success: true,
    mode: 'sdf',
    vertexCount,
    triangleCount,
    bounds: opts.bounds,
    resolution: opts.resolution,
    note: 'Watertight, welded, outward-wound triangle mesh from native marching cubes (no license, no trained model).',
  };

  const output = args.output ?? 'stats';
  if (output === 'stl-ascii') {
    result.stlAscii = Simulation.exportSTLAscii(mesh, {});
  } else if (output === 'stl-binary') {
    const buf = Simulation.exportSTLBinary(mesh, {});
    result.stlBinaryBase64 = Buffer.from(new Uint8Array(buf)).toString('base64');
  }

  return result;
}

export const generateMeshTools: Tool[] = [
  {
    name: 'holo_generate_mesh',
    description:
      'Generate an editable, watertight triangle mesh from an authored SDF/CSG tree via native marching cubes ' +
      '(the license-free, no-trained-model path). Returns vertex/triangle counts and optionally an STL ' +
      '(ascii or base64 binary). mode:"sdf" is available now; mode:"prompt" (text/image -> mesh via Meshy/Tripo) ' +
      'is not yet enabled in the MCP server (that bridge lives in @holoscript/cli).',
    inputSchema: {
      type: 'object',
      properties: {
        mode: {
          type: 'string',
          enum: ['sdf', 'prompt'],
          description:
            'sdf = authored SDF/CSG via marching cubes (default, available now); prompt = text/image (not yet enabled here).',
        },
        sdf: {
          type: 'object',
          description:
            'SDFNode tree (mode=sdf). Primitive: { type:"primitive", primitive:"sphere"|"box"|..., params:{...}, ' +
            'translate?/rotate?/scale? }. CSG: { type:"csg", operation:"union"|"subtract"|"smooth_union"|..., ' +
            'smoothness?, children:[ ... ] }.',
        },
        resolution: {
          type: 'array',
          items: { type: 'number' },
          description:
            '[nx,ny,nz] sample grid (default [48,48,48], >=2 per axis). Higher = finer at O(N^3) cost.',
        },
        bounds: {
          type: 'object',
          description: '{ min:[x,y,z], max:[x,y,z] } world AABB to sample over (default +/-1).',
          properties: {
            min: { type: 'array', items: { type: 'number' } },
            max: { type: 'array', items: { type: 'number' } },
          },
        },
        isoLevel: {
          type: 'number',
          description: 'Iso-surface level (default 0 = zero level-set).',
        },
        scaleFactor: {
          type: 'number',
          description: 'Uniform output scale applied after meshing (default 1).',
        },
        output: {
          type: 'string',
          enum: ['stats', 'stl-ascii', 'stl-binary'],
          description: 'stats (counts only, default) or include an STL export.',
        },
        prompt: {
          type: 'string',
          description: 'Text description (mode=prompt; not yet enabled here).',
        },
        provider: {
          type: 'string',
          enum: ['meshy', 'tripo'],
          description: 'Prompt-mode provider (not yet enabled here).',
        },
      },
      required: ['mode'],
    },
  },
];

export async function handleGenerateMeshTool(
  name: string,
  args: Record<string, unknown>
): Promise<unknown | null> {
  switch (name) {
    case 'holo_generate_mesh':
      return handleGenerateMesh(args as GenerateMeshArgs);
    default:
      return null;
  }
}
