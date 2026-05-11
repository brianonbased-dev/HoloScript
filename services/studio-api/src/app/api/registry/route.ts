import { NextResponse, NextRequest } from 'next/server';
import { randomUUID } from 'crypto';
import { desc } from 'drizzle-orm';
import { getDb } from '../../../db/client';
import { registryPacks } from '../../../db/schema';
import {
  getStudioDevMemoryStores,
  requireDevMemoryPersistence,
  type DevRegistryPack,
} from '../../../lib/studio-dev-persistence';

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

function makePackId() {
  return `pack_${randomUUID()}`;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q')?.toLowerCase() ?? '';
  const tag = searchParams.get('tag')?.toLowerCase() ?? '';

  const db = getDb();
  let results: RegistryPack[];
  if (db) {
    const rows = await db
      .select()
      .from(registryPacks)
      .orderBy(desc(registryPacks.publishedAt))
      .limit(200);
    results = rows.map(packFromRow);
  } else {
    const unavailable = requireDevMemoryPersistence('registry');
    if (unavailable) return unavailable;
    results = [...getStudioDevMemoryStores().registryPacks];
  }

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

  const pack: DevRegistryPack = {
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

  const db = getDb();
  if (db) {
    const [row] = await db
      .insert(registryPacks)
      .values({
        packId: pack.packId,
        name: pack.name,
        description: pack.description,
        author: pack.author,
        version: pack.version,
        tags: pack.tags,
        files: pack.files,
        downloads: pack.downloads,
        publishedAt: new Date(pack.publishedAt),
        previewCode: pack.previewCode,
      })
      .returning();
    return NextResponse.json({ pack: packFromRow(row) }, { status: 201 });
  }

  const unavailable = requireDevMemoryPersistence('registry');
  if (unavailable) return unavailable;

  getStudioDevMemoryStores().registryPacks.push(pack);
  return NextResponse.json({ pack }, { status: 201 });
}

function packFromRow(row: typeof registryPacks.$inferSelect): RegistryPack {
  return {
    packId: row.packId,
    name: row.name,
    description: row.description,
    author: row.author,
    version: row.version,
    tags: Array.isArray(row.tags) ? (row.tags as string[]) : [],
    files: Array.isArray(row.files) ? (row.files as RegistryPack['files']) : [],
    downloads: row.downloads,
    publishedAt: row.publishedAt.toISOString(),
    previewCode: row.previewCode ?? undefined,
  };
}
