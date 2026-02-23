import { NextRequest } from 'next/server';

/**
 * GET /api/nodes — node type catalog for the node graph editor
 * Returns a flat list of node definitions grouped by category.
 */

export type NodeCategory = 'input' | 'transform' | 'material' | 'geometry' | 'light' | 'output' | 'utility';

export interface NodePort {
  id: string;
  label: string;
  type: 'float' | 'vec3' | 'color' | 'texture' | 'bool' | 'string';
}

export interface NodeDef {
  type: string;
  label: string;
  category: NodeCategory;
  description: string;
  color: string;
  inputs: NodePort[];
  outputs: NodePort[];
}

const NODE_CATALOG: NodeDef[] = [
  // ── Inputs ──────────────────────────────────────────────────────────────────
  { type: 'float_value', label: 'Float', category: 'input', description: 'Constant float value', color: '#4488ff',
    inputs: [], outputs: [{ id: 'out', label: 'Value', type: 'float' }] },
  { type: 'vec3_value', label: 'Vector 3', category: 'input', description: 'Constant XYZ vector', color: '#4488ff',
    inputs: [], outputs: [{ id: 'out', label: 'XYZ', type: 'vec3' }] },
  { type: 'color_picker', label: 'Color', category: 'input', description: 'Color constant', color: '#4488ff',
    inputs: [], outputs: [{ id: 'out', label: 'Color', type: 'color' }] },
  { type: 'texture_sampler', label: 'Texture', category: 'input', description: 'Texture asset sampler', color: '#4488ff',
    inputs: [{ id: 'uv', label: 'UV', type: 'vec3' }], outputs: [{ id: 'color', label: 'Color', type: 'color' }, { id: 'alpha', label: 'Alpha', type: 'float' }] },
  { type: 'time_node', label: 'Time', category: 'input', description: 'Elapsed time in seconds', color: '#4488ff',
    inputs: [], outputs: [{ id: 'time', label: 'Time', type: 'float' }, { id: 'sin', label: 'Sin(Time)', type: 'float' }] },

  // ── Math / Utility ───────────────────────────────────────────────────────────
  { type: 'add', label: 'Add', category: 'utility', description: 'A + B', color: '#888899',
    inputs: [{ id: 'a', label: 'A', type: 'float' }, { id: 'b', label: 'B', type: 'float' }], outputs: [{ id: 'out', label: 'Result', type: 'float' }] },
  { type: 'multiply', label: 'Multiply', category: 'utility', description: 'A × B', color: '#888899',
    inputs: [{ id: 'a', label: 'A', type: 'float' }, { id: 'b', label: 'B', type: 'float' }], outputs: [{ id: 'out', label: 'Result', type: 'float' }] },
  { type: 'clamp', label: 'Clamp', category: 'utility', description: 'Clamp value to [min, max]', color: '#888899',
    inputs: [{ id: 'val', label: 'Value', type: 'float' }, { id: 'min', label: 'Min', type: 'float' }, { id: 'max', label: 'Max', type: 'float' }], outputs: [{ id: 'out', label: 'Clamped', type: 'float' }] },
  { type: 'lerp', label: 'Lerp', category: 'utility', description: 'Linear interpolation A → B by T', color: '#888899',
    inputs: [{ id: 'a', label: 'A', type: 'float' }, { id: 'b', label: 'B', type: 'float' }, { id: 't', label: 'T', type: 'float' }], outputs: [{ id: 'out', label: 'Result', type: 'float' }] },
  { type: 'sine', label: 'Sine', category: 'utility', description: 'sin(θ)', color: '#888899',
    inputs: [{ id: 'theta', label: 'Theta', type: 'float' }], outputs: [{ id: 'out', label: 'sin(θ)', type: 'float' }] },

  // ── Transform ───────────────────────────────────────────────────────────────
  { type: 'position', label: 'Position', category: 'transform', description: 'Object world position', color: '#44bb88',
    inputs: [{ id: 'xyz', label: 'XYZ', type: 'vec3' }], outputs: [{ id: 'position', label: 'Position', type: 'vec3' }] },
  { type: 'rotation', label: 'Rotation', category: 'transform', description: 'Euler rotation', color: '#44bb88',
    inputs: [{ id: 'xyz', label: 'XYZ°', type: 'vec3' }], outputs: [{ id: 'rotation', label: 'Rotation', type: 'vec3' }] },
  { type: 'scale', label: 'Scale', category: 'transform', description: 'Non-uniform scale', color: '#44bb88',
    inputs: [{ id: 'xyz', label: 'XYZ', type: 'vec3' }], outputs: [{ id: 'scale', label: 'Scale', type: 'vec3' }] },

  // ── Material ────────────────────────────────────────────────────────────────
  { type: 'pbr_material', label: 'PBR Material', category: 'material', description: 'Standard PBR surface', color: '#cc6644',
    inputs: [{ id: 'baseColor', label: 'Base Color', type: 'color' }, { id: 'roughness', label: 'Roughness', type: 'float' }, { id: 'metalness', label: 'Metalness', type: 'float' }, { id: 'emissive', label: 'Emissive', type: 'color' }],
    outputs: [{ id: 'material', label: 'Material', type: 'string' }] },
  { type: 'fresnel', label: 'Fresnel', category: 'material', description: 'Edge glow / rim light effect', color: '#cc6644',
    inputs: [{ id: 'power', label: 'Power', type: 'float' }, { id: 'color', label: 'Color', type: 'color' }], outputs: [{ id: 'factor', label: 'Factor', type: 'float' }] },
  { type: 'noise', label: 'Noise', category: 'material', description: 'Animated Perlin noise field', color: '#cc6644',
    inputs: [{ id: 'scale', label: 'Scale', type: 'float' }, { id: 'speed', label: 'Speed', type: 'float' }], outputs: [{ id: 'noise', label: 'Noise', type: 'float' }, { id: 'color', label: 'Color', type: 'color' }] },

  // ── Geometry ─────────────────────────────────────────────────────────────────
  { type: 'box_mesh', label: 'Box', category: 'geometry', description: 'Parametric box mesh', color: '#8855cc',
    inputs: [{ id: 'size', label: 'Size', type: 'vec3' }], outputs: [{ id: 'mesh', label: 'Mesh', type: 'string' }] },
  { type: 'sphere_mesh', label: 'Sphere', category: 'geometry', description: 'Parametric sphere mesh', color: '#8855cc',
    inputs: [{ id: 'radius', label: 'Radius', type: 'float' }, { id: 'segments', label: 'Segments', type: 'float' }], outputs: [{ id: 'mesh', label: 'Mesh', type: 'string' }] },
  { type: 'plane_mesh', label: 'Plane', category: 'geometry', description: 'Flat plane geometry', color: '#8855cc',
    inputs: [{ id: 'width', label: 'Width', type: 'float' }, { id: 'height', label: 'Height', type: 'float' }], outputs: [{ id: 'mesh', label: 'Mesh', type: 'string' }] },

  // ── Lights ───────────────────────────────────────────────────────────────────
  { type: 'point_light', label: 'Point Light', category: 'light', description: 'Omnidirectional point light', color: '#eeaa22',
    inputs: [{ id: 'color', label: 'Color', type: 'color' }, { id: 'intensity', label: 'Intensity', type: 'float' }, { id: 'distance', label: 'Distance', type: 'float' }], outputs: [] },
  { type: 'directional_light', label: 'Directional', category: 'light', description: 'Infinite directional light', color: '#eeaa22',
    inputs: [{ id: 'color', label: 'Color', type: 'color' }, { id: 'intensity', label: 'Intensity', type: 'float' }], outputs: [] },

  // ── Output ────────────────────────────────────────────────────────────────────
  { type: 'scene_object', label: 'Scene Object', category: 'output', description: 'Materialises as a scene object', color: '#ff4466',
    inputs: [{ id: 'mesh', label: 'Mesh', type: 'string' }, { id: 'material', label: 'Material', type: 'string' }, { id: 'position', label: 'Position', type: 'vec3' }, { id: 'rotation', label: 'Rotation', type: 'vec3' }, { id: 'scale', label: 'Scale', type: 'vec3' }], outputs: [] },
];

declare global { var __nodeCatalog__: NodeDef[] | undefined; }
const catalog = globalThis.__nodeCatalog__ ?? (globalThis.__nodeCatalog__ = [...NODE_CATALOG]);

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const category = searchParams.get('category') as NodeCategory | null;
  const q = searchParams.get('q')?.toLowerCase() ?? '';
  let results = catalog;
  if (category) results = results.filter((n) => n.category === category);
  if (q) results = results.filter((n) => n.label.toLowerCase().includes(q) || n.description.toLowerCase().includes(q));
  const categories = [...new Set(catalog.map((n) => n.category))];
  return Response.json({ nodes: results, total: results.length, categories });
}
