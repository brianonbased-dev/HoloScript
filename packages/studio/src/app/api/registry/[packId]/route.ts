import { NextResponse, NextRequest } from 'next/server';

/**
 * GET  /api/registry/[packId]             — fetch single pack
 * POST /api/registry/[packId]/download    — increment download counter
 * DELETE /api/registry/[packId]           — remove pack
 */

// Share store with parent route via global
declare global {
  // eslint-disable-next-line no-var
  var __registryStore__: Array<{
    packId: string; name: string; description: string; author: string; version: string;
    tags: string[]; files: { name: string; size: number; type: string }[];
    downloads: number; publishedAt: string; previewCode?: string;
  }> | undefined;
}

function getRegistry() {
  return globalThis.__registryStore__ ?? [];
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ packId: string }> }
) {
  const { packId } = await params;
  const pack = getRegistry().find((p) => p.packId === packId);
  if (!pack) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ pack });
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ packId: string }> }
) {
  const { packId } = await params;
  const registry = getRegistry();
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
  const registry = globalThis.__registryStore__;
  if (!registry) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const idx = registry.findIndex((p) => p.packId === packId);
  if (idx === -1) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  registry.splice(idx, 1);
  return NextResponse.json({ ok: true });
}
