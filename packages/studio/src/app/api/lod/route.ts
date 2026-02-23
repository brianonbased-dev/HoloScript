import { NextRequest } from 'next/server';

/**
 * GET /api/lod — LOD (Level of Detail) preset catalog
 * Provides distance thresholds and @lod trait snippets for common scene setups.
 */

export interface LodLevel {
  distance: number;    // meters from camera
  detail: 'high' | 'medium' | 'low' | 'culled';
  label: string;
}

export interface LodPreset {
  id: string;
  name: string;
  description: string;
  useCase: string;
  levels: LodLevel[];
  traitSnippet: string;
}

const LOD_PRESETS: LodPreset[] = [
  {
    id: 'game-standard',
    name: 'Game Standard',
    description: 'Aggressive LOD for real-time game objects',
    useCase: 'Characters, props, interactive objects',
    levels: [
      { distance: 0,   detail: 'high',   label: 'Full mesh' },
      { distance: 15,  detail: 'medium', label: '50% polys' },
      { distance: 40,  detail: 'low',    label: 'Billboard' },
      { distance: 80,  detail: 'culled', label: 'Invisible' },
    ],
    traitSnippet: `  @lod {
    highDetail: 15
    mediumDetail: 40
    lowDetail: 80
    culled: true
  }`,
  },
  {
    id: 'architecture',
    name: 'Architecture',
    description: 'Conservative LOD for building-scale geometry',
    useCase: 'Walls, facades, structural elements',
    levels: [
      { distance: 0,   detail: 'high',   label: 'Full mesh' },
      { distance: 50,  detail: 'medium', label: 'Simplified' },
      { distance: 150, detail: 'low',    label: 'Shell only' },
      { distance: 300, detail: 'culled', label: 'Invisible' },
    ],
    traitSnippet: `  @lod {
    highDetail: 50
    mediumDetail: 150
    lowDetail: 300
    culled: true
  }`,
  },
  {
    id: 'landscape',
    name: 'Landscape',
    description: 'Extended range for terrain and vegetation',
    useCase: 'Trees, rocks, foliage, ground cover',
    levels: [
      { distance: 0,   detail: 'high',   label: 'Full foliage' },
      { distance: 30,  detail: 'medium', label: 'Reduced leaves' },
      { distance: 80,  detail: 'low',    label: 'Impostor' },
      { distance: 200, detail: 'culled', label: 'Invisible' },
    ],
    traitSnippet: `  @lod {
    highDetail: 30
    mediumDetail: 80
    lowDetail: 200
    culled: true
  }`,
  },
  {
    id: 'vr-optimized',
    name: 'VR Optimized',
    description: 'Aggressive VR LOD for 90fps target',
    useCase: 'VR scenes requiring consistent frame rate',
    levels: [
      { distance: 0,  detail: 'high',   label: 'High fidelity' },
      { distance: 8,  detail: 'medium', label: 'Medium' },
      { distance: 20, detail: 'low',    label: 'Low poly' },
      { distance: 40, detail: 'culled', label: 'Culled' },
    ],
    traitSnippet: `  @lod {
    highDetail: 8
    mediumDetail: 20
    lowDetail: 40
    culled: true
  }`,
  },
  {
    id: 'no-cull',
    name: 'No Culling',
    description: 'Smooth LOD transitions, always visible',
    useCase: 'Hero assets, cinematic cameras, showcase objects',
    levels: [
      { distance: 0,   detail: 'high',   label: 'Full mesh' },
      { distance: 20,  detail: 'medium', label: 'Medium' },
      { distance: 60,  detail: 'low',    label: 'Low' },
    ],
    traitSnippet: `  @lod {
    highDetail: 20
    mediumDetail: 60
    culled: false
  }`,
  },
];

declare global { var __lodPresets__: LodPreset[] | undefined; }
const presets = globalThis.__lodPresets__ ?? (globalThis.__lodPresets__ = [...LOD_PRESETS]);

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get('q')?.toLowerCase() ?? '';
  const results = q ? presets.filter((p) => p.name.toLowerCase().includes(q) || p.useCase.toLowerCase().includes(q)) : presets;
  return Response.json({ presets: results, total: results.length });
}
