import { NextResponse } from 'next/server';
import { resolveHoloShellApiUrl } from '@/lib/holoshell/apiUrl';

export async function GET() {
  const holoshellApiUrl = resolveHoloShellApiUrl();
  if (!holoshellApiUrl) {
    return NextResponse.json({ error: 'HOLOSHELL_API_URL not configured' }, { status: 503 });
  }
  try {
    const r = await fetch(`${holoshellApiUrl}/api/execution-history`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(6_000),
    });
    return NextResponse.json(await r.json(), { status: r.status });
  } catch (e) {
    return NextResponse.json({ error: 'holoshell unreachable', details: String(e) }, { status: 503 });
  }
}
