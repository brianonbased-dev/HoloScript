export const maxDuration = 300;

import { NextRequest } from 'next/server';

/**
 * GET /api/particles — particle emitter preset catalog
 * Returns preset list with @particles trait snippets ready to insert.
 */

export type ParticleType =
  | 'fire'
  | 'snow'
  | 'sparks'
  | 'rain'
  | 'smoke'
  | 'magic'
  | 'bubbles'
  | 'leaves';

export interface ParticlePreset {
  id: string;
  name: string;
  type: ParticleType;
  description: string;
  emoji: string;
  color: string;
  defaults: {
    count: number;
    speed: number;
    size: number;
    lifetime: number;
    spread: number;
    gravity: number;
    emitRate: number;
    continuous: boolean;
    colorStart: string;
    colorEnd: string;
  };
  traitSnippet: string;
}

const PRESETS: ParticlePreset[] = [
  {
    id: 'fire',
    name: 'Fire',
    type: 'fire',
    emoji: '🔥',
    color: '#ff4422',
    description: 'Upward flame with ember glow, warm orange-to-red gradient',
    defaults: {
      count: 120,
      speed: 2.4,
      size: 0.18,
      lifetime: 1.2,
      spread: 0.4,
      gravity: -1.5,
      emitRate: 60,
      continuous: true,
      colorStart: '#ff8800',
      colorEnd: '#ff2200',
    },
    traitSnippet: `  @particles {
    type: "fire"
    count: 120
    emitRate: 60
    speed: 2.4
    size: 0.18
    lifetime: 1.2
    spread: 0.4
    gravity: -1.5
    colorStart: "#ff8800"
    colorEnd: "#ff2200"
    continuous: true
  }`,
  },
  {
    id: 'snow',
    name: 'Snow',
    type: 'snow',
    emoji: '❄️',
    color: '#aaddff',
    description: 'Gentle drifting snowflakes with slow rotation',
    defaults: {
      count: 200,
      speed: 0.4,
      size: 0.08,
      lifetime: 5.0,
      spread: 3.0,
      gravity: 0.08,
      emitRate: 20,
      continuous: true,
      colorStart: '#eef6ff',
      colorEnd: '#c8e8ff',
    },
    traitSnippet: `  @particles {
    type: "snow"
    count: 200
    emitRate: 20
    speed: 0.4
    size: 0.08
    lifetime: 5.0
    spread: 3.0
    gravity: 0.08
    colorStart: "#eef6ff"
    colorEnd: "#c8e8ff"
    continuous: true
  }`,
  },
  {
    id: 'sparks',
    name: 'Sparks',
    type: 'sparks',
    emoji: '✨',
    color: '#ffdd00',
    description: 'Electric arc sparks burst, short-lived with high velocity',
    defaults: {
      count: 40,
      speed: 5.0,
      size: 0.06,
      lifetime: 0.5,
      spread: 1.8,
      gravity: 1.2,
      emitRate: 0,
      continuous: false,
      colorStart: '#ffffff',
      colorEnd: '#ffaa00',
    },
    traitSnippet: `  @particles {
    type: "sparks"
    count: 40
    emitRate: 0
    speed: 5.0
    size: 0.06
    lifetime: 0.5
    spread: 1.8
    gravity: 1.2
    colorStart: "#ffffff"
    colorEnd: "#ffaa00"
    continuous: false
  }`,
  },
  {
    id: 'rain',
    name: 'Rain',
    type: 'rain',
    emoji: '🌧️',
    color: '#4488cc',
    description: 'Vertical rainfall with streaking downward velocity',
    defaults: {
      count: 400,
      speed: 6.0,
      size: 0.03,
      lifetime: 0.8,
      spread: 4.0,
      gravity: 9.8,
      emitRate: 200,
      continuous: true,
      colorStart: '#88ccff',
      colorEnd: '#4466aa',
    },
    traitSnippet: `  @particles {
    type: "rain"
    count: 400
    emitRate: 200
    speed: 6.0
    size: 0.03
    lifetime: 0.8
    spread: 4.0
    gravity: 9.8
    colorStart: "#88ccff"
    colorEnd: "#4466aa"
    continuous: true
  }`,
  },
  {
    id: 'smoke',
    name: 'Smoke',
    type: 'smoke',
    emoji: '💨',
    color: '#888888',
    description: 'Billowing smoke column with gradual opacity fade',
    defaults: {
      count: 80,
      speed: 0.6,
      size: 0.5,
      lifetime: 4.0,
      spread: 0.3,
      gravity: -0.3,
      emitRate: 15,
      continuous: true,
      colorStart: '#666666',
      colorEnd: '#333333',
    },
    traitSnippet: `  @particles {
    type: "smoke"
    count: 80
    emitRate: 15
    speed: 0.6
    size: 0.5
    lifetime: 4.0
    spread: 0.3
    gravity: -0.3
    colorStart: "#666666"
    colorEnd: "#333333"
    continuous: true
  }`,
  },
  {
    id: 'magic',
    name: 'Magic',
    type: 'magic',
    emoji: '🪄',
    color: '#aa44ff',
    description: 'Floating magical glitter with swirling orbit motion',
    defaults: {
      count: 60,
      speed: 0.8,
      size: 0.12,
      lifetime: 3.0,
      spread: 0.8,
      gravity: -0.1,
      emitRate: 10,
      continuous: true,
      colorStart: '#cc88ff',
      colorEnd: '#4422ff',
    },
    traitSnippet: `  @particles {
    type: "magic"
    count: 60
    emitRate: 10
    speed: 0.8
    size: 0.12
    lifetime: 3.0
    spread: 0.8
    gravity: -0.1
    colorStart: "#cc88ff"
    colorEnd: "#4422ff"
    continuous: true
  }`,
  },
  {
    id: 'bubbles',
    name: 'Bubbles',
    type: 'bubbles',
    emoji: '🫧',
    color: '#44ccdd',
    description: 'Rising translucent spheres for underwater or effervescent scenes',
    defaults: {
      count: 50,
      speed: 0.5,
      size: 0.15,
      lifetime: 6.0,
      spread: 0.5,
      gravity: -0.5,
      emitRate: 8,
      continuous: true,
      colorStart: '#aaeeff',
      colorEnd: '#22aacc',
    },
    traitSnippet: `  @particles {
    type: "bubbles"
    count: 50
    emitRate: 8
    speed: 0.5
    size: 0.15
    lifetime: 6.0
    spread: 0.5
    gravity: -0.5
    colorStart: "#aaeeff"
    colorEnd: "#22aacc"
    continuous: true
  }`,
  },
  {
    id: 'leaves',
    name: 'Leaves',
    type: 'leaves',
    emoji: '🍂',
    color: '#cc7722',
    description: 'Tumbling autumn leaves with chaotic rotation',
    defaults: {
      count: 30,
      speed: 0.7,
      size: 0.2,
      lifetime: 8.0,
      spread: 2.5,
      gravity: 0.25,
      emitRate: 5,
      continuous: true,
      colorStart: '#dd8833',
      colorEnd: '#aa4422',
    },
    traitSnippet: `  @particles {
    type: "leaves"
    count: 30
    emitRate: 5
    speed: 0.7
    size: 0.2
    lifetime: 8.0
    spread: 2.5
    gravity: 0.25
    colorStart: "#dd8833"
    colorEnd: "#aa4422"
    continuous: true
  }`,
  },
];

declare global {
  var __particlePresets__: ParticlePreset[] | undefined;
}
const presets = globalThis.__particlePresets__ ?? (globalThis.__particlePresets__ = [...PRESETS]);

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const type = searchParams.get('type') as ParticleType | null;
  const q = searchParams.get('q')?.toLowerCase() ?? '';
  let results = presets;
  if (type) results = results.filter((p) => p.type === type);
  if (q)
    results = results.filter(
      (p) => p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q)
    );
  const types = [...new Set(presets.map((p) => p.type))];
  return Response.json({ presets: results, total: results.length, types });
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
