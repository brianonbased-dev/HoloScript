import { NextRequest } from 'next/server';

/**
 * GET /api/environment-presets
 * Returns curated @environment trait presets: sky / fog / ambient combos.
 */

export interface EnvironmentPreset {
  id: string;
  name: string;
  category: 'outdoor' | 'indoor' | 'space' | 'fantasy' | 'abstract';
  description: string;
  emoji: string;
  sky: {
    type: 'procedural' | 'hdri' | 'solid';
    color?: string;
    hdriSrc?: string;
    turbidity?: number;
    rayleigh?: number;
    sunElevation?: number;
    sunAzimuth?: number;
  };
  fog: {
    enabled: boolean;
    color?: string;
    near?: number;
    far?: number;
    density?: number;
    type?: 'linear' | 'exponential';
  };
  ambient: {
    color: string;
    intensity: number;
  };
  traitSnippet: string;
}

const PRESETS: EnvironmentPreset[] = [
  {
    id: 'golden-hour',
    name: 'Golden Hour',
    category: 'outdoor',
    emoji: '🌅',
    description: 'Warm late-afternoon sun with hazy atmospheric scatter',
    sky: { type: 'procedural', turbidity: 4, rayleigh: 2, sunElevation: 12, sunAzimuth: 220 },
    fog: { enabled: true, color: '#ffcc88', near: 60, far: 400, type: 'linear' },
    ambient: { color: '#ff9944', intensity: 0.6 },
    traitSnippet: `  @environment {
    sky: procedural
    turbidity: 4
    rayleigh: 2
    sunElevation: 12
    sunAzimuth: 220
    fog: linear
    fogColor: "#ffcc88"
    fogNear: 60
    fogFar: 400
    ambient: "#ff9944"
    ambientIntensity: 0.6
  }`,
  },
  {
    id: 'midnight-city',
    name: 'Midnight City',
    category: 'outdoor',
    emoji: '🌃',
    description: 'Dark urban night sky with dense low-lying fog',
    sky: { type: 'solid', color: '#050510' },
    fog: { enabled: true, color: '#111133', near: 10, far: 120, type: 'exponential', density: 0.015 },
    ambient: { color: '#2244aa', intensity: 0.2 },
    traitSnippet: `  @environment {
    sky: solid
    skyColor: "#050510"
    fog: exponential
    fogColor: "#111133"
    fogDensity: 0.015
    ambient: "#2244aa"
    ambientIntensity: 0.2
  }`,
  },
  {
    id: 'deep-space',
    name: 'Deep Space',
    category: 'space',
    emoji: '🌌',
    description: 'Starfield backdrop, no fog, cold blue ambient',
    sky: { type: 'hdri', hdriSrc: 'starfield.hdr' },
    fog: { enabled: false },
    ambient: { color: '#112244', intensity: 0.15 },
    traitSnippet: `  @environment {
    sky: hdri
    hdri: "starfield.hdr"
    fog: none
    ambient: "#112244"
    ambientIntensity: 0.15
  }`,
  },
  {
    id: 'enchanted-forest',
    name: 'Enchanted Forest',
    category: 'fantasy',
    emoji: '🌲',
    description: 'Dense green mist with magical teal ambient glow',
    sky: { type: 'procedural', turbidity: 10, rayleigh: 4, sunElevation: 30, sunAzimuth: 90 },
    fog: { enabled: true, color: '#00aa66', near: 5, far: 80, type: 'exponential', density: 0.02 },
    ambient: { color: '#00ffaa', intensity: 0.4 },
    traitSnippet: `  @environment {
    sky: procedural
    turbidity: 10
    rayleigh: 4
    sunElevation: 30
    fog: exponential
    fogColor: "#00aa66"
    fogDensity: 0.02
    ambient: "#00ffaa"
    ambientIntensity: 0.4
  }`,
  },
  {
    id: 'studio-white',
    name: 'Studio White',
    category: 'indoor',
    emoji: '📷',
    description: 'Clean neutral studio light for showcasing objects',
    sky: { type: 'solid', color: '#f0f0f0' },
    fog: { enabled: false },
    ambient: { color: '#ffffff', intensity: 1.0 },
    traitSnippet: `  @environment {
    sky: solid
    skyColor: "#f0f0f0"
    fog: none
    ambient: "#ffffff"
    ambientIntensity: 1.0
  }`,
  },
  {
    id: 'neon-void',
    name: 'Neon Void',
    category: 'abstract',
    emoji: '🔮',
    description: 'Pure black with electric magenta ambient — cyberpunk void',
    sky: { type: 'solid', color: '#000000' },
    fog: { enabled: true, color: '#880044', near: 20, far: 200, type: 'exponential', density: 0.008 },
    ambient: { color: '#ff00aa', intensity: 0.5 },
    traitSnippet: `  @environment {
    sky: solid
    skyColor: "#000000"
    fog: exponential
    fogColor: "#880044"
    fogDensity: 0.008
    ambient: "#ff00aa"
    ambientIntensity: 0.5
  }`,
  },
  {
    id: 'overcast-day',
    name: 'Overcast Day',
    category: 'outdoor',
    emoji: '☁️',
    description: 'Soft diffuse grey sky, gentle white ambient',
    sky: { type: 'procedural', turbidity: 8, rayleigh: 1, sunElevation: 60, sunAzimuth: 180 },
    fog: { enabled: true, color: '#cccccc', near: 80, far: 600, type: 'linear' },
    ambient: { color: '#dddddd', intensity: 0.8 },
    traitSnippet: `  @environment {
    sky: procedural
    turbidity: 8
    rayleigh: 1
    sunElevation: 60
    fog: linear
    fogColor: "#cccccc"
    fogNear: 80
    fogFar: 600
    ambient: "#dddddd"
    ambientIntensity: 0.8
  }`,
  },
  {
    id: 'volcanic-dawn',
    name: 'Volcanic Dawn',
    category: 'fantasy',
    emoji: '🌋',
    description: 'Red-orange sky with heavy ash fog for post-apocalyptic scenes',
    sky: { type: 'procedural', turbidity: 15, rayleigh: 3, sunElevation: 5, sunAzimuth: 80 },
    fog: { enabled: true, color: '#662200', near: 8, far: 100, type: 'exponential', density: 0.025 },
    ambient: { color: '#ff4400', intensity: 0.5 },
    traitSnippet: `  @environment {
    sky: procedural
    turbidity: 15
    rayleigh: 3
    sunElevation: 5
    fog: exponential
    fogColor: "#662200"
    fogDensity: 0.025
    ambient: "#ff4400"
    ambientIntensity: 0.5
  }`,
  },
];

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get('q')?.toLowerCase() ?? '';
  const category = request.nextUrl.searchParams.get('category') ?? '';
  let results: EnvironmentPreset[] = PRESETS;
  if (category) results = results.filter((p) => p.category === category);
  if (q) results = results.filter((p) =>
    p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q)
  );
  const categories = [...new Set(PRESETS.map((p) => p.category))];
  return Response.json({ presets: results, total: results.length, categories });
}
