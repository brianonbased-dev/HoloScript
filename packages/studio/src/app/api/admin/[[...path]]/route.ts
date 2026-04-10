/**
 * /api/admin/[...path] — Admin Dashboard Proxy
 *
 * Catch-all route that proxies admin requests from the Studio frontend
 * to the standalone absorb-service /api/admin/* endpoints.
 * Auth headers are forwarded so absorb-service can verify admin status.
 */

import { NextRequest, NextResponse } from 'next/server';
import { forwardAuthHeaders } from '@/lib/api-auth';

const ABSORB_SERVICE_URL = process.env.ABSORB_SERVICE_INTERNAL_URL || process.env.ABSORB_SERVICE_URL || 'http://localhost:3000';

function buildUpstreamUrl(req: NextRequest): string {
  // Extract the path segments after /api/admin/
  const url = new URL(req.url);
  const adminPath = url.pathname.replace(/^\/api\/admin/, '');
  const upstream = `${ABSORB_SERVICE_URL}/api/admin${adminPath}`;
  const search = url.search;
  return search ? `${upstream}${search}` : upstream;
}

export async function GET(req: NextRequest) {
  try {
    const res = await fetch(buildUpstreamUrl(req), {
      method: 'GET',
      headers: { 'Accept': 'application/json', ...forwardAuthHeaders(req) },
    });

    if (!res.ok) {
      const errText = await res.text();
      return NextResponse.json(
        { error: `Admin service error [${res.status}]: ${errText}` },
        { status: res.status },
      );
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { error: 'Admin service is offline', details: String(error) },
      { status: 503 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const bodyText = await req.text();

    const res = await fetch(buildUpstreamUrl(req), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...forwardAuthHeaders(req) },
      body: bodyText,
    });

    if (!res.ok) {
      const errText = await res.text();
      return NextResponse.json(
        { error: `Admin service error [${res.status}]: ${errText}` },
        { status: res.status },
      );
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { error: 'Admin service is offline', details: String(error) },
      { status: 503 },
    );
  }
}
