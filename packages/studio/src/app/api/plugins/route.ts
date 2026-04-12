export const maxDuration = 300;

import { NextResponse } from 'next/server';

/**
 * GET /api/plugins
 * Returns 12 community HoloScript plugins across 6 categories.
 */

export interface HoloPlugin {
  id: string;
  name: string;
  author: string;
  description: string;
  version: string;
  category: 'rendering' | 'physics' | 'audio' | 'ai' | 'tools' | 'export';
  stars: number;
  downloads: number;
  tags: string[];
  previewEmoji: string;
  size: string; // e.g. "12 KB"
  featured?: boolean;
}

const PLUGINS: HoloPlugin[] = [
  {
    id: 'realbr',
    name: 'RealBR — Physically Based Rendering',
    author: 'infinitus-labs',
    description:
      'Full PBR pipeline with IBL, SSR, and HBAO+. Drop-in replacement for the standard material system.',
    version: '2.4.1',
    category: 'rendering',
    stars: 1842,
    downloads: 48_200,
    tags: ['pbr', 'ibl', 'reflections'],
    previewEmoji: '🌟',
    size: '84 KB',
    featured: true,
  },
  {
    id: 'volumetric-fog',
    name: 'VolumetricFog',
    author: 'cloud-labs',
    description:
      'Raymarched volumetric fog and light shafts. GPU-accelerated with temporal reprojection.',
    version: '1.1.0',
    category: 'rendering',
    stars: 923,
    downloads: 22_100,
    tags: ['fog', 'atmosphere', 'volumetrics'],
    previewEmoji: '🌫️',
    size: '41 KB',
  },
  {
    id: 'flow-physics',
    name: 'FlowPhysics',
    author: 'sim-collective',
    description:
      'Position Based Dynamics for cloth, ropes, and soft bodies. Works alongside rigid body physics.',
    version: '3.0.2',
    category: 'physics',
    stars: 1241,
    downloads: 31_400,
    tags: ['cloth', 'softbody', 'pbd'],
    previewEmoji: '🧵',
    size: '62 KB',
    featured: true,
  },
  {
    id: 'fluid-sim',
    name: 'FluidSim2D',
    author: 'render-works',
    description:
      'Real-time 2D fluid simulation using SPH. Great for water surfaces, lava, and magic effects.',
    version: '0.9.4',
    category: 'physics',
    stars: 467,
    downloads: 9_800,
    tags: ['fluid', 'water', 'sph'],
    previewEmoji: '💧',
    size: '29 KB',
  },
  {
    id: 'spatial-audio-suite',
    name: 'Spatial Audio Suite',
    author: 'holo-audio',
    description:
      'Full HRTF binaural rendering, room acoustics simulation, and occlusion-based filtering.',
    version: '1.5.0',
    category: 'audio',
    stars: 788,
    downloads: 14_600,
    tags: ['hrtf', 'binaural', 'acoustics'],
    previewEmoji: '🎧',
    size: '38 KB',
    featured: true,
  },
  {
    id: 'music-reactive',
    name: 'MusicReactive',
    author: 'beat-labs',
    description:
      'Drives material, particle, and transform properties from real-time audio FFT analysis.',
    version: '2.0.1',
    category: 'audio',
    stars: 612,
    downloads: 18_200,
    tags: ['fft', 'music', 'reactive'],
    previewEmoji: '🎵',
    size: '22 KB',
  },
  {
    id: 'npc-brain',
    name: 'NPCBrain — Behavior Trees',
    author: 'ai-works',
    description:
      'Visual behavior tree editor for NPC AI with pre-built actions (patrol, flee, attack, seek cover).',
    version: '1.2.3',
    category: 'ai',
    stars: 1056,
    downloads: 26_700,
    tags: ['npc', 'bt', 'patrol'],
    previewEmoji: '🤖',
    size: '71 KB',
    featured: true,
  },
  {
    id: 'dialogue-flow',
    name: 'DialogueFlow',
    author: 'narrative-studio',
    description:
      'Node-based dialogue graph editor with branching, conditions, and variable injection.',
    version: '3.1.0',
    category: 'ai',
    stars: 890,
    downloads: 21_300,
    tags: ['dialogue', 'rpg', 'branching'],
    previewEmoji: '💬',
    size: '55 KB',
  },
  {
    id: 'scene-linter',
    name: 'SceneLinter Pro',
    author: 'quality-guild',
    description:
      'Advanced static analysis beyond the built-in debugger — memory estimates, overdraw detection, LOD auditing.',
    version: '1.0.7',
    category: 'tools',
    stars: 445,
    downloads: 8_900,
    tags: ['linting', 'performance', 'audit'],
    previewEmoji: '🔍',
    size: '18 KB',
  },
  {
    id: 'git-scenes',
    name: 'GitScenes',
    author: 'devops-lab',
    description:
      'Git-backed scene versioning with visual diff, branch management, and PR previews.',
    version: '0.8.2',
    category: 'tools',
    stars: 334,
    downloads: 6_700,
    tags: ['git', 'versioning', 'diff'],
    previewEmoji: '📦',
    size: '24 KB',
  },
  {
    id: 'usdz-export',
    name: 'USDZ Exporter',
    author: 'apple-compat',
    description:
      'One-click export to USDZ for AR Quick Look on iOS and visionOS. Preserves materials and animations.',
    version: '2.2.0',
    category: 'export',
    stars: 1124,
    downloads: 33_800,
    tags: ['usdz', 'ios', 'ar', 'visionos'],
    previewEmoji: '📱',
    size: '31 KB',
    featured: true,
  },
  {
    id: 'unreal-bridge',
    name: 'UnrealBridge',
    author: 'epic-connect',
    description:
      'Bi-directional live link with Unreal Engine. Stream HoloScript scene changes to Unreal in real time.',
    version: '1.0.0',
    category: 'export',
    stars: 678,
    downloads: 12_400,
    tags: ['unreal', 'live-link', 'bridge'],
    previewEmoji: '🔗',
    size: '19 KB',
  },
];

export async function GET(request: Request) {
  const url = new URL(request.url);
  const q = url.searchParams.get('q')?.toLowerCase() ?? '';
  const category = url.searchParams.get('category') ?? '';

  let results = PLUGINS;
  if (q)
    results = results.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.tags.some((t) => t.includes(q))
    );
  if (category) results = results.filter((p) => p.category === category);

  const categories = [...new Set(PLUGINS.map((p) => p.category))];
  return NextResponse.json({ plugins: results, total: results.length, categories });
}


export function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-mcp-api-key',
    },
  });
}
