export const maxDuration = 300;

import { NextResponse, NextRequest } from 'next/server';

import { corsHeaders } from '../_lib/cors';
/**
 * Package Registry API
 *
 * GET  /api/registry?q=<search>&tag=<tag>  — list all packs, optional filter
 * POST /api/registry                        — publish a new pack
 */

export interface RegistryPack {
  packId: string;
  name: string;
  description: string;
  author: string;
  version: string;
  tags: string[];
  files: { name: string; size: number; type: string }[];
  downloads: number;
  publishedAt: string;
  previewCode?: string; // optional HoloScript snippet preview
}

declare global {
  var __registryStore__: RegistryPack[] | undefined;
}

const registry: RegistryPack[] =
  globalThis.__registryStore__ ??
  (globalThis.__registryStore__ = [
    // Seed with example packs
    {
      packId: 'pack_medieval_001',
      name: 'Medieval Castle Kit',
      description: 'Stone walls, towers, portcullis, and interior props for fantasy scenes.',
      author: 'HoloStudio',
      version: '1.2.0',
      tags: ['fantasy', 'architecture', 'medieval'],
      files: [
        { name: 'castle_walls.glb', size: 2_400_000, type: 'model/gltf-binary' },
        { name: 'stone_texture.png', size: 512_000, type: 'image/png' },
      ],
      downloads: 1_432,
      publishedAt: new Date(Date.now() - 86400_000 * 14).toISOString(),
      previewCode: `scene "Castle" {\n  object "Main Tower" {\n    @mesh(src: "castle_walls.glb")\n    @transform(scale: [2,2,2])\n  }\n}`,
    },
    {
      packId: 'pack_sci_fi_002',
      name: 'Sci-Fi Interior Pack',
      description: 'Modular corridors, consoles, and ambient lighting for space stations.',
      author: 'NeonForge',
      version: '0.9.1',
      tags: ['sci-fi', 'interior', 'modular'],
      files: [
        { name: 'corridor_a.glb', size: 1_800_000, type: 'model/gltf-binary' },
        { name: 'console_01.glb', size: 900_000, type: 'model/gltf-binary' },
      ],
      downloads: 876,
      publishedAt: new Date(Date.now() - 86400_000 * 5).toISOString(),
      previewCode: `scene "Space Station" {\n  object "Corridor A" {\n    @mesh(src: "corridor_a.glb")\n  }\n}`,
    },
    {
      packId: 'pack_vegetation_003',
      name: 'Procedural Vegetation',
      description: 'Trees, bushes, grass patches, and flowers with LOD support.',
      author: 'GreenPixel',
      version: '2.0.0',
      tags: ['nature', 'vegetation', 'outdoor'],
      files: [
        { name: 'oak_tree.glb', size: 3_200_000, type: 'model/gltf-binary' },
        { name: 'grass_patch.glb', size: 400_000, type: 'model/gltf-binary' },
      ],
      downloads: 2_901,
      publishedAt: new Date(Date.now() - 86400_000 * 30).toISOString(),
    },
  ]);

function makePackId() {
  return `pack_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q')?.toLowerCase() ?? '';
  const tag = searchParams.get('tag')?.toLowerCase() ?? '';

  let results = [...registry];

  if (q) {
    results = results.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.author.toLowerCase().includes(q)
    );
  }

  if (tag) {
    results = results.filter((p) => p.tags.some((t) => t.toLowerCase() === tag));
  }

  // Sort newest first
  results.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());

  return NextResponse.json({ packs: results, total: results.length });
}

export async function POST(request: NextRequest) {
  let body: Partial<RegistryPack>;
  try {
    body = (await request.json()) as Partial<RegistryPack>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!body.name?.trim() || !body.author?.trim()) {
    return NextResponse.json({ error: 'name and author are required' }, { status: 400 });
  }

  const pack: RegistryPack = {
    packId: makePackId(),
    name: body.name.trim(),
    description: body.description?.trim() ?? '',
    author: body.author.trim(),
    version: body.version?.trim() ?? '1.0.0',
    tags: body.tags ?? [],
    files: body.files ?? [],
    downloads: 0,
    publishedAt: new Date().toISOString(),
    previewCode: body.previewCode,
  };

  registry.push(pack);
  return NextResponse.json({ pack }, { status: 201 });
}


export function OPTIONS(request: Request) {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(request, { methods: 'GET, POST, PUT, DELETE, PATCH, OPTIONS' }),
  });
}
