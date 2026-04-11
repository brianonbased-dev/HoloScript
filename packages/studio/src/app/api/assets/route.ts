import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '../../../db/client';
import { assets } from '../../../db/schema';
import { eq, desc, ilike, _or, sql } from 'drizzle-orm';
import { requireAuth } from '../../../lib/api-auth';

/**
 * /api/assets — Asset catalog.
 *
 * GET  /api/assets?q=&category=&page=  → paginated catalog (seed + user uploads)
 * POST /api/assets                     → confirm an uploaded asset (set final URL)
 *
 * Uses PostgreSQL via Drizzle when DATABASE_URL is set.
 * Falls back to seed catalog for local dev without a database.
 */

type AssetCategory = 'model' | 'hdr' | 'texture' | 'audio';

interface Asset {
  id: string;
  name: string;
  category: AssetCategory;
  tags: string[];
  thumbnail: string;
  url: string;
  format: string;
  sizeKb: number;
  creator: string;
  license: string;
}

const SEED_ASSETS: Asset[] = [
  {
    id: 'a1',
    name: 'Damaged Helmet',
    category: 'model',
    tags: ['sci-fi', 'prop', 'pbr'],
    thumbnail:
      'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/main/2.0/DamagedHelmet/screenshot/screenshot.png',
    url: 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/main/2.0/DamagedHelmet/glTF/DamagedHelmet.gltf',
    format: 'gltf',
    sizeKb: 2340,
    creator: 'Khronos',
    license: 'CC BY 4.0',
  },
  {
    id: 'a2',
    name: 'Flight Helmet',
    category: 'model',
    tags: ['prop', 'pbr', 'aviation'],
    thumbnail:
      'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/main/2.0/FlightHelmet/screenshot/screenshot.jpg',
    url: 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/main/2.0/FlightHelmet/glTF/FlightHelmet.gltf',
    format: 'gltf',
    sizeKb: 8100,
    creator: 'Khronos',
    license: 'CC BY 4.0',
  },
  {
    id: 'a3',
    name: 'Antique Camera',
    category: 'model',
    tags: ['vintage', 'prop', 'pbr'],
    thumbnail:
      'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/main/2.0/AntiqueCamera/screenshot/screenshot.jpg',
    url: 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/main/2.0/AntiqueCamera/glTF/AntiqueCamera.gltf',
    format: 'gltf',
    sizeKb: 3200,
    creator: 'Khronos',
    license: 'CC BY 4.0',
  },
  {
    id: 'a4',
    name: 'Sci-Fi Fighter Jet',
    category: 'model',
    tags: ['sci-fi', 'vehicle'],
    thumbnail: '',
    url: '',
    format: 'gltf',
    sizeKb: 4500,
    creator: 'OpenGameArt',
    license: 'CC0',
  },
  {
    id: 'a5',
    name: 'Medieval Castle',
    category: 'model',
    tags: ['architecture', 'medieval', 'environment'],
    thumbnail: '',
    url: '',
    format: 'gltf',
    sizeKb: 12000,
    creator: 'OpenGameArt',
    license: 'CC0',
  },
  {
    id: 'a6',
    name: 'Park Bench',
    category: 'model',
    tags: ['furniture', 'outdoor', 'urban'],
    thumbnail: '',
    url: '',
    format: 'gltf',
    sizeKb: 450,
    creator: 'Poly Haven',
    license: 'CC0',
  },
  {
    id: 'h1',
    name: 'Sunlit Studio',
    category: 'hdr',
    tags: ['interior', 'soft', 'studio'],
    thumbnail: '',
    url: 'https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/studio_small_09_1k.hdr',
    format: 'hdr',
    sizeKb: 2048,
    creator: 'Poly Haven',
    license: 'CC0',
  },
  {
    id: 'h2',
    name: 'Kloppenheim',
    category: 'hdr',
    tags: ['outdoor', 'overcast', 'nature'],
    thumbnail: '',
    url: 'https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/kloppenheim_02_1k.hdr',
    format: 'hdr',
    sizeKb: 3072,
    creator: 'Poly Haven',
    license: 'CC0',
  },
  {
    id: 'h3',
    name: 'Neon Alley',
    category: 'hdr',
    tags: ['urban', 'night', 'neon', 'cyberpunk'],
    thumbnail: '',
    url: '',
    format: 'hdr',
    sizeKb: 4096,
    creator: 'HdriHaven',
    license: 'CC0',
  },
  {
    id: 'h4',
    name: 'Desert Dusk',
    category: 'hdr',
    tags: ['outdoor', 'desert', 'sunset'],
    thumbnail: '',
    url: '',
    format: 'hdr',
    sizeKb: 2560,
    creator: 'Poly Haven',
    license: 'CC0',
  },
  {
    id: 't1',
    name: 'Rusted Metal',
    category: 'texture',
    tags: ['metal', 'pbr', 'industrial'],
    thumbnail: '',
    url: '',
    format: 'png',
    sizeKb: 1024,
    creator: 'Poly Haven',
    license: 'CC0',
  },
  {
    id: 't2',
    name: 'Mossy Stone',
    category: 'texture',
    tags: ['stone', 'nature', 'pbr'],
    thumbnail: '',
    url: '',
    format: 'png',
    sizeKb: 1024,
    creator: 'Poly Haven',
    license: 'CC0',
  },
];

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const q = searchParams.get('q')?.toLowerCase() ?? '';
  const category = searchParams.get('category') as AssetCategory | null;
  const page = parseInt(searchParams.get('page') ?? '1', 10);
  const perPage = 12;

  const db = getDb();
  if (db) {
    // Query user-uploaded assets from DB
    const conditions = [];
    if (q) {
      conditions.push(ilike(assets.name, `%${q}%`));
    }
    if (category) {
      conditions.push(eq(assets.type, category));
    }

    const whereClause =
      conditions.length > 0
        ? conditions.length === 1
          ? conditions[0]
          : sql`${conditions[0]} AND ${conditions[1]}`
        : undefined;

    const rows = await db
      .select()
      .from(assets)
      .where(whereClause)
      .orderBy(desc(assets.createdAt))
      .limit(perPage)
      .offset((page - 1) * perPage);

    const dbItems = rows.map((r) => {
      const meta = r.metadata as Record<string, string> | null;
      return {
        id: r.id,
        name: r.name,
        category: r.type as AssetCategory,
        tags: (meta?.tags as unknown as string[]) ?? [],
        thumbnail: r.thumbnailUrl ?? '',
        url: r.url,
        format: meta?.format ?? '',
        sizeKb: parseInt(meta?.sizeKb ?? '0', 10),
        creator: meta?.creator ?? '',
        license: meta?.license ?? 'User Upload',
      };
    });

    // Merge seed assets (always available) with user uploads
    let seedFiltered = SEED_ASSETS;
    if (q)
      seedFiltered = seedFiltered.filter(
        (a) => a.name.toLowerCase().includes(q) || a.tags.some((t) => t.includes(q))
      );
    if (category) seedFiltered = seedFiltered.filter((a) => a.category === category);

    const allItems = [...dbItems, ...seedFiltered];
    const total = allItems.length;
    const items = allItems.slice((page - 1) * perPage, page * perPage);

    return Response.json({ items, total, page, perPage, pages: Math.ceil(total / perPage) });
  }

  // Fallback: seed catalog only
  let results: Asset[] = SEED_ASSETS;
  if (q)
    results = results.filter(
      (a) => a.name.toLowerCase().includes(q) || a.tags.some((t) => t.includes(q))
    );
  if (category) results = results.filter((a) => a.category === category);

  const total = results.length;
  const items = results.slice((page - 1) * perPage, page * perPage);

  return Response.json({ items, total, page, perPage, pages: Math.ceil(total / perPage) });
}

/**
 * POST /api/assets — Confirm an uploaded asset (called after presigned upload completes).
 *
 * Body: { assetId, url, thumbnailUrl?, name?, metadata? }
 *
 * Updates the asset record with the final S3 URL after browser upload completes.
 */
export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  let body: {
    assetId?: string;
    url?: string;
    thumbnailUrl?: string;
    name?: string;
    metadata?: Record<string, unknown>;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { assetId, url } = body;
  if (!assetId || !url) {
    return NextResponse.json({ error: 'assetId and url are required' }, { status: 400 });
  }

  const db = getDb();
  if (!db) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
  }

  const [updated] = await db
    .update(assets)
    .set({
      url,
      thumbnailUrl: body.thumbnailUrl ?? null,
      name: body.name ?? undefined,
      metadata: {
        ...(body.metadata ?? {}),
        status: 'ready',
      },
    })
    .where(eq(assets.id, assetId))
    .returning();

  if (!updated) {
    return NextResponse.json({ error: 'Asset not found' }, { status: 404 });
  }

  return NextResponse.json({ asset: updated });
}
