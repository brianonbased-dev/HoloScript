import { NextRequest, NextResponse } from 'next/server';

const HOLOSHELL_API_URL = process.env.HOLOSHELL_API_URL;

export async function POST(req: NextRequest) {
  if (!HOLOSHELL_API_URL) {
    return NextResponse.json({ error: 'HOLOSHELL_API_URL not configured' }, { status: 503 });
  }
  try {
    const body = await req.json();
    const r = await fetch(`${HOLOSHELL_API_URL}/api/consent/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return NextResponse.json(await r.json(), { status: r.status });
  } catch (e) {
    return NextResponse.json({ error: 'holoshell unreachable', details: String(e) }, { status: 503 });
  }
}
