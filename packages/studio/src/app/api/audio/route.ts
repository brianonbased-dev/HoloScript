export const maxDuration = 300;

import { NextRequest } from 'next/server';

/**
 * GET /api/audio — audio preset library
 *
 * Returns ambient, triggered, and spatial audio presets.
 * POST /api/audio/preview — returns snippet for embedding in scene code.
 */

export type AudioType = 'ambient' | 'triggered' | 'spatial';

export interface AudioPreset {
  id: string;
  name: string;
  type: AudioType;
  tags: string[];
  description: string;
  url: string; // placeholder audio URL
  loop: boolean;
  volume: number;
  spatialRadius?: number;
  rolloffFactor?: number;
  traitSnippet: string; // HoloScript @audio trait code
}

const PRESETS: AudioPreset[] = [
  {
    id: 'amb-forest',
    name: 'Forest Ambience',
    type: 'ambient',
    tags: ['nature', 'forest', 'birds', 'wind'],
    description: 'Gentle wind through trees with distant birdsong.',
    url: '',
    loop: true,
    volume: 0.4,
    traitSnippet: '@audio(src: "forest_ambient.ogg", type: "ambient", loop: true, volume: 0.4)',
  },
  {
    id: 'amb-rain',
    name: 'Rainfall',
    type: 'ambient',
    tags: ['rain', 'weather', 'indoor', 'melancholic'],
    description: 'Steady rain on a window pane.',
    url: '',
    loop: true,
    volume: 0.5,
    traitSnippet: '@audio(src: "rain.ogg", type: "ambient", loop: true, volume: 0.5)',
  },
  {
    id: 'amb-space',
    name: 'Deep Space Hum',
    type: 'ambient',
    tags: ['space', 'sci-fi', 'electronic', 'drone'],
    description: 'Low-frequency hull vibration of a space vessel.',
    url: '',
    loop: true,
    volume: 0.3,
    traitSnippet: '@audio(src: "space_hum.ogg", type: "ambient", loop: true, volume: 0.3)',
  },
  {
    id: 'amb-fire',
    name: 'Crackling Fire',
    type: 'ambient',
    tags: ['fire', 'warm', 'cozy', 'indoor'],
    description: 'Wood crackling in a fireplace.',
    url: '',
    loop: true,
    volume: 0.45,
    traitSnippet: '@audio(src: "fireplace.ogg", type: "ambient", loop: true, volume: 0.45)',
  },
  {
    id: 'trig-door',
    name: 'Door Creak',
    type: 'triggered',
    tags: ['door', 'horror', 'old', 'wood'],
    description: 'Slow creaking of a heavy wooden door.',
    url: '',
    loop: false,
    volume: 0.8,
    traitSnippet:
      '@audio(src: "door_creak.ogg", type: "triggered", trigger: "interact", volume: 0.8)',
  },
  {
    id: 'trig-coin',
    name: 'Coin Collect',
    type: 'triggered',
    tags: ['game', 'collect', 'positive', 'retro'],
    description: 'Classic coin pickup chime.',
    url: '',
    loop: false,
    volume: 1.0,
    traitSnippet: '@audio(src: "coin.ogg", type: "triggered", trigger: "collect", volume: 1.0)',
  },
  {
    id: 'trig-explosion',
    name: 'Explosion',
    type: 'triggered',
    tags: ['action', 'game', 'impact', 'fx'],
    description: 'Large explosion with low-end rumble and debris.',
    url: '',
    loop: false,
    volume: 1.0,
    traitSnippet:
      '@audio(src: "explosion.ogg", type: "triggered", trigger: "destroy", volume: 1.0)',
  },
  {
    id: 'spa-waterfall',
    name: 'Waterfall',
    type: 'spatial',
    tags: ['water', 'nature', 'positional', '3d'],
    description: 'Rushing water with distance-based falloff.',
    url: '',
    loop: true,
    volume: 0.7,
    spatialRadius: 8,
    rolloffFactor: 2,
    traitSnippet:
      '@audio(src: "waterfall.ogg", type: "spatial", loop: true, volume: 0.7, radius: 8, rolloff: 2)',
  },
  {
    id: 'spa-npc-voice',
    name: 'NPC Ambient Voice',
    type: 'spatial',
    tags: ['game', 'npc', 'voice', 'positional'],
    description: 'Muffled generic crowd chatter localised to an NPC.',
    url: '',
    loop: true,
    volume: 0.3,
    spatialRadius: 4,
    rolloffFactor: 3,
    traitSnippet:
      '@audio(src: "crowd_murmur.ogg", type: "spatial", loop: true, volume: 0.3, radius: 4, rolloff: 3)',
  },
];

declare global {
  var __audioPresets__: AudioPreset[] | undefined;
}
const presets = globalThis.__audioPresets__ ?? (globalThis.__audioPresets__ = [...PRESETS]);

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const type = searchParams.get('type') as AudioType | null;
  const q = searchParams.get('q')?.toLowerCase() ?? '';

  let results = presets;
  if (type) results = results.filter((p) => p.type === type);
  if (q)
    results = results.filter(
      (p) => p.name.toLowerCase().includes(q) || p.tags.some((t) => t.includes(q))
    );

  return Response.json({ presets: results, total: results.length });
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
