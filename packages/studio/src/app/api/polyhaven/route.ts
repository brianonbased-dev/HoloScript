import { NextRequest } from 'next/server';

/**
 * GET /api/polyhaven
 * Proxy for Poly Haven's public API. Returns normalized asset list
 * with thumbnails, download URLs, and metadata.
 *
 * Query params:
 *   type     — 'models' | 'hdris' | 'textures' (default: 'models')
 *   q        — search query (filters by name)
 *   page     — 1-indexed page number
 *   pageSize — items per page (default 20, max 60)
 */

interface PolyHavenAsset {
  id: string;
  name: string;
  type: 'model' | 'hdri' | 'texture';
  tags: string[];
  categories: string[];
  thumbnail: string;
  downloadUrl: string;
  authors: string[];
  license: string;
}

interface PolyHavenPage {
  items: PolyHavenAsset[];
  total: number;
  page: number;
  pages: number;
  type: string;
}

// Cache Poly Haven responses for 10 minutes to avoid hammering their API
const cache = new Map<string, { data: Record<string, unknown>; ts: number }>();
const CACHE_TTL = 10 * 60 * 1000;

async function fetchPolyHaven(type: string): Promise<Record<string, unknown>> {
  const key = `ph_${type}`;
  const cached = cache.get(key);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.data;

  const res = await fetch(`https://api.polyhaven.com/assets?type=${type}`, {
    headers: { 'User-Agent': 'HoloScript-Studio/0.1.0 (holoscript.dev)' },
  });
  if (!res.ok) throw new Error(`Poly Haven API error: ${res.status}`);
  const data = await res.json();
  cache.set(key, { data, ts: Date.now() });
  return data;
}

function normalizeType(t: string): 'models' | 'hdris' | 'textures' {
  if (t === 'hdris' || t === 'hdri') return 'hdris';
  if (t === 'textures' || t === 'texture') return 'textures';
  return 'models';
}

function shortType(t: string): 'model' | 'hdri' | 'texture' {
  if (t === 'hdris') return 'hdri';
  if (t === 'textures') return 'texture';
  return 'model';
}

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const type = normalizeType(params.get('type') ?? 'models');
    const q = (params.get('q') ?? '').toLowerCase();
    const page = Math.max(1, parseInt(params.get('page') ?? '1', 10));
    const pageSize = Math.min(60, Math.max(1, parseInt(params.get('pageSize') ?? '20', 10)));

    const raw = await fetchPolyHaven(type);
    const st = shortType(type);

    // raw is { assetId: { name, tags, categories, authors, ... }, ... }
    let entries: [string, Record<string, unknown>][] = Object.entries(raw).map(
      ([id, meta]) => [id, meta as Record<string, unknown>]
    );

    // Search filter
    if (q) {
      entries = entries.filter(([id, meta]) => {
        const name = String(meta.name ?? id).toLowerCase();
        const tags = Array.isArray(meta.tags) ? meta.tags : [];
        return (
          name.includes(q) ||
          id.includes(q) ||
          tags.some((t: string) => t.toLowerCase().includes(q))
        );
      });
    }

    const total = entries.length;
    const pages = Math.max(1, Math.ceil(total / pageSize));
    const sliced = entries.slice((page - 1) * pageSize, page * pageSize);

    const items: PolyHavenAsset[] = sliced.map(([id, meta]) => ({
      id,
      name: String(meta.name ?? id).replace(/_/g, ' '),
      type: st,
      tags: Array.isArray(meta.tags) ? meta.tags.slice(0, 8) : [],
      categories: Array.isArray(meta.categories)
        ? (meta.categories as string[])
        : typeof meta.categories === 'object' && meta.categories
          ? Object.keys(meta.categories)
          : [],
      thumbnail: `https://cdn.polyhaven.com/asset_img/thumbs/${id}.png?width=256`,
      downloadUrl:
        st === 'model'
          ? `https://dl.polyhaven.org/file/ph-assets/Models/gltf/${id}/${id}.gltf`
          : st === 'hdri'
            ? `https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/${id}_1k.hdr`
            : `https://cdn.polyhaven.com/asset_img/primary/${id}.png`,
      authors: Array.isArray(meta.authors)
        ? meta.authors
        : typeof meta.authors === 'object' && meta.authors
          ? Object.keys(meta.authors)
          : ['Poly Haven'],
      license: 'CC0',
    }));

    const result: PolyHavenPage = { items, total, page, pages, type };
    return Response.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return Response.json(
      { error: `Failed to fetch Poly Haven assets: ${message}`, items: [], total: 0, page: 1, pages: 1 },
      { status: 502 }
    );
  }
}
