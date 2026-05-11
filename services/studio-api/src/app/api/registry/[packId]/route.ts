import { NextResponse, NextRequest } from 'next/server';
import { eq, sql } from 'drizzle-orm';
import { getDb } from '../../../../db/client';
import { registryPacks } from '../../../../db/schema';
import {
  getStudioDevMemoryStores,
  requireDevMemoryPersistence,
  type DevRegistryPack,
} from '../../../../lib/studio-dev-persistence';

/**
 * GET  /api/registry/[packId]             — fetch single pack
 * POST /api/registry/[packId]/download    — increment download counter
 * DELETE /api/registry/[packId]           — remove pack
 */

export async function GET(_req: NextRequest, { params }: { params: Promise<{ packId: string }> }) {
  const { packId } = await params;
  const db = getDb();
  if (db) {
    const [row] = await db
      .select()
      .from(registryPacks)
      .where(eq(registryPacks.packId, packId))
      .limit(1);
    if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ pack: packFromRow(row) });
  }

  const unavailable = requireDevMemoryPersistence('registry');
  if (unavailable) return unavailable;

  const pack = getStudioDevMemoryStores().registryPacks.find((p) => p.packId === packId);
  if (!pack) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ pack });
}

export async function POST(_req: NextRequest, { params }: { params: Promise<{ packId: string }> }) {
  const { packId } = await params;
  const db = getDb();
  if (db) {
    const [row] = await db
      .update(registryPacks)
      .set({ downloads: sql`${registryPacks.downloads} + 1` })
      .where(eq(registryPacks.packId, packId))
      .returning();
    if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ downloads: row.downloads });
  }

  const unavailable = requireDevMemoryPersistence('registry');
  if (unavailable) return unavailable;

  const registry = getStudioDevMemoryStores().registryPacks;
  const pack = registry.find((p) => p.packId === packId);
  if (!pack) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  pack.downloads += 1;
  return NextResponse.json({ downloads: pack.downloads });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ packId: string }> }
) {
  const { packId } = await params;
  const db = getDb();
  if (db) {
    const deleted = await db
      .delete(registryPacks)
      .where(eq(registryPacks.packId, packId))
      .returning();
    if (deleted.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ ok: true });
  }

  const unavailable = requireDevMemoryPersistence('registry');
  if (unavailable) return unavailable;

  const registry = getStudioDevMemoryStores().registryPacks;
  const idx = registry.findIndex((p) => p.packId === packId);
  if (idx === -1) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  registry.splice(idx, 1);
  return NextResponse.json({ ok: true });
}

function packFromRow(row: typeof registryPacks.$inferSelect): DevRegistryPack {
  return {
    packId: row.packId,
    name: row.name,
    description: row.description,
    author: row.author,
    version: row.version,
    tags: Array.isArray(row.tags) ? (row.tags as string[]) : [],
    files: Array.isArray(row.files) ? (row.files as DevRegistryPack['files']) : [],
    downloads: row.downloads,
    publishedAt: row.publishedAt.toISOString(),
    previewCode: row.previewCode ?? undefined,
  };
}
