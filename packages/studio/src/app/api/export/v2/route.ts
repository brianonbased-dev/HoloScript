export const maxDuration = 300;

import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/export/v2
 *
 * Pure proxy to the external export-api microservice.
 * Handles the v2 exports asynchronously.
 */

const EXPORT_API_URL = process.env.EXPORT_API_URL || 'http://localhost:8080';
const EXPORT_API_KEY =
  process.env.EXPORT_API_KEY ||
  'hsk_00000000000000000000000000000000000000000000000000000000000000000000';

export async function POST(request: NextRequest) {
  try {
    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Bad JSON' }, { status: 400 });
    }

    const { code = '', format = 'obj' } = body;

    // Delegate to export-api
    const res = await fetch(`${EXPORT_API_URL}/api/v1/compile`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': EXPORT_API_KEY,
      },
      body: JSON.stringify({
        source: code,
        target: format,
        options: {},
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) {
      const errorText = await res.text();
      return NextResponse.json(
        { error: 'Export failed at proxy layer', details: errorText },
        { status: res.status }
      );
    }

    const contentType = res.headers.get('content-type');
    const responseData = await res.arrayBuffer();

    return new Response(responseData, {
      status: res.status,
      headers: {
        'Content-Type': contentType || 'application/json',
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Internal Server Error', details: String(error) },
      { status: 500 }
    );
  }
}


export function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-mcp-api-key',
    },
  });
}
