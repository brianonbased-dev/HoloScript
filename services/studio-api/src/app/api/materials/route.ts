import { NextRequest } from 'next/server';

/**
 * GET /api/materials — PBR material preset catalog
 * Each preset includes display metadata and a ready-to-insert @material traitSnippet.
 */

export interface MaterialPreset {
  id: string;
  name: string;
  category: string;
  description: string;
  color: string; // hex display color
  albedo: string;
  roughness: number;
  metallic: number;
  emissive?: string;
  emissiveIntensity?: number;
  opacity?: number;
  traitSnippet: string;
}

const PRESETS: MaterialPreset[] = [
  {
    id: 'matte-white',
    name: 'Matte White',
    category: 'basic',
    color: '#f0f0f0',
    description: 'Clean diffuse white surface',
    albedo: '#ffffff',
    roughness: 0.9,
    metallic: 0.0,
    traitSnippet: `  @material {
    albedo: "#ffffff"
    roughness: 0.9
    metallic: 0.0
  }`,
  },
  {
    id: 'polished-metal',
    name: 'Polished Metal',
    category: 'metal',
    color: '#aabccc',
    description: 'Highly reflective brushed metal',
    albedo: '#aabbcc',
    roughness: 0.1,
    metallic: 1.0,
    traitSnippet: `  @material {
    albedo: "#aabbcc"
    roughness: 0.1
    metallic: 1.0
  }`,
  },
  {
    id: 'rough-metal',
    name: 'Rough Metal',
    category: 'metal',
    color: '#778899',
    description: 'Cast iron with heavy surface texture',
    albedo: '#778899',
    roughness: 0.8,
    metallic: 0.9,
    traitSnippet: `  @material {
    albedo: "#778899"
    roughness: 0.8
    metallic: 0.9
  }`,
  },
  {
    id: 'glass',
    name: 'Glass',
    category: 'glass',
    color: '#cce8ff',
    description: 'Transparent glass with slight blue tint',
    albedo: '#cce8ff',
    roughness: 0.0,
    metallic: 0.0,
    opacity: 0.15,
    traitSnippet: `  @material {
    albedo: "#cce8ff"
    roughness: 0.0
    metallic: 0.0
    opacity: 0.15
  }`,
  },
  {
    id: 'frosted-glass',
    name: 'Frosted Glass',
    category: 'glass',
    color: '#e0eef8',
    description: 'Diffuse frosted glass panel',
    albedo: '#e0eef8',
    roughness: 0.7,
    metallic: 0.0,
    opacity: 0.4,
    traitSnippet: `  @material {
    albedo: "#e0eef8"
    roughness: 0.7
    metallic: 0.0
    opacity: 0.4
  }`,
  },
  {
    id: 'emissive-neon',
    name: 'Neon Glow',
    category: 'emissive',
    color: '#00ffcc',
    description: 'Bright teal emission for neon/holographic objects',
    albedo: '#003322',
    roughness: 0.5,
    metallic: 0.0,
    emissive: '#00ffcc',
    emissiveIntensity: 4.0,
    traitSnippet: `  @material {
    albedo: "#003322"
    roughness: 0.5
    metallic: 0.0
    emissive: "#00ffcc"
    emissiveIntensity: 4.0
  }`,
  },
  {
    id: 'emissive-fire',
    name: 'Lava/Fire',
    category: 'emissive',
    color: '#ff5500',
    description: 'Hot molten surface with orange emission',
    albedo: '#331100',
    roughness: 0.9,
    metallic: 0.0,
    emissive: '#ff4400',
    emissiveIntensity: 3.0,
    traitSnippet: `  @material {
    albedo: "#331100"
    roughness: 0.9
    metallic: 0.0
    emissive: "#ff4400"
    emissiveIntensity: 3.0
  }`,
  },
  {
    id: 'wood-oak',
    name: 'Oak Wood',
    category: 'organic',
    color: '#8b6343',
    description: 'Warm oak wood grain texture',
    albedo: '#8b6343',
    roughness: 0.85,
    metallic: 0.0,
    traitSnippet: `  @material {
    albedo: "#8b6343"
    roughness: 0.85
    metallic: 0.0
  }`,
  },
  {
    id: 'stone-granite',
    name: 'Granite',
    category: 'stone',
    color: '#888888',
    description: 'Grey speckled granite surface',
    albedo: '#888888',
    roughness: 0.7,
    metallic: 0.0,
    traitSnippet: `  @material {
    albedo: "#888888"
    roughness: 0.7
    metallic: 0.0
  }`,
  },
  {
    id: 'gold',
    name: 'Gold',
    category: 'metal',
    color: '#ffc233',
    description: 'Shiny polished gold',
    albedo: '#ffc233',
    roughness: 0.15,
    metallic: 1.0,
    traitSnippet: `  @material {
    albedo: "#ffc233"
    roughness: 0.15
    metallic: 1.0
  }`,
  },
];

declare global {
  var __materialPresets__: MaterialPreset[] | undefined;
}
const store = globalThis.__materialPresets__ ?? (globalThis.__materialPresets__ = [...PRESETS]);

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const category = searchParams.get('category') ?? '';
  const q = searchParams.get('q')?.toLowerCase() ?? '';
  let results = store;
  if (category) results = results.filter((p) => p.category === category);
  if (q)
    results = results.filter(
      (p) => p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q)
    );
  const categories = [...new Set(store.map((p) => p.category))];
  return Response.json({ presets: results, total: results.length, categories });
}
