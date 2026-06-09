import { NextResponse } from 'next/server';

const HOLOSHELL_API_URL = process.env.HOLOSHELL_API_URL;

export async function GET() {
  if (!HOLOSHELL_API_URL) {
    return NextResponse.json({ error: 'HOLOSHELL_API_URL not configured' }, { status: 503 });
  }
  try {
    const r = await fetch(`${HOLOSHELL_API_URL}/api/pending-consents`, { cache: 'no-store' });
    return NextResponse.json(await r.json(), { status: r.status });
  } catch (e) {
    return NextResponse.json({ error: 'holoshell unreachable', details: String(e) }, { status: 503 });
  }
}
