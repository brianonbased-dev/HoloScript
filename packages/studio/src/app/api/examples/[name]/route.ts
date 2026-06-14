import { NextRequest, NextResponse } from 'next/server';
import { loadHoloExample } from '@/lib/loadHoloExample';

/**
 * GET /api/examples/[name]
 *
 * Serve a native HoloScript scene from the repo examples/ library by name, so a
 * compiler-generated .holo page can mount the (client) ImmersiveViewer with just
 * a scene id and the scene stays the single source of truth in examples/ — no
 * inline scene strings, no hand-authored page wrapper. `name` is matched against
 * `<name>.holo` (bare names only; loadHoloExample guards traversal).
 *
 * Returns the .holo source as text/plain, or 404 if not found.
 */

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  if (!name || !/^[\w-]+$/.test(name)) {
    return NextResponse.json({ error: 'invalid example name' }, { status: 400 });
  }
  const loaded = loadHoloExample(`${name}.holo`);
  if ('error' in loaded) {
    return NextResponse.json({ error: loaded.error }, { status: 404 });
  }
  return new NextResponse(loaded.source, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=60' },
  });
}
