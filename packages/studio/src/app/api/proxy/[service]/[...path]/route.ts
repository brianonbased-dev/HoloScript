import { NextRequest, NextResponse } from 'next/server';

const API_CONFIGS: Record<string, { baseUrl: string; envKey: string; authHeader: string; prefix?: string }> = {
  meshy: {
    baseUrl: 'https://api.meshy.ai/v2',
    envKey: 'MESHY_API_KEY',
    authHeader: 'Bearer',
  },
  rodin: {
    baseUrl: 'https://api.rodin.ai/v1',
    envKey: 'RODIN_API_KEY',
    authHeader: 'Bearer',
  },
  sketchfab: {
    baseUrl: 'https://api.sketchfab.com/v3',
    envKey: 'SKETCHFAB_API_KEY',
    authHeader: 'Token',
  },
};

export async function GET(request: NextRequest, { params }: { params: Promise<{ service: string; path: string[] }> }) {
  return handleProxyRequest(request, await params);
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ service: string; path: string[] }> }) {
  return handleProxyRequest(request, await params);
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ service: string; path: string[] }> }) {
  return handleProxyRequest(request, await params);
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ service: string; path: string[] }> }) {
  return handleProxyRequest(request, await params);
}

async function handleProxyRequest(request: NextRequest, params: { service: string; path: string[] }) {
  const { service, path } = params;
  const config = API_CONFIGS[service];

  if (!config) {
    return NextResponse.json({ error: 'Unknown service' }, { status: 400 });
  }

  const apiKey = process.env[config.envKey];
  if (!apiKey) {
    return NextResponse.json({ error: `API key not configured for ${service}` }, { status: 401 });
  }

  const targetUrl = new URL(`${config.baseUrl}/${path.join('/')}`);
  
  // Forward query parameters
  targetUrl.search = request.nextUrl.search;

  const headers = new Headers(request.headers);
  headers.delete('host');
  headers.delete('referer');
  headers.set('Authorization', `${config.authHeader} ${apiKey}`);

  try {
    const fetchOptions: RequestInit = {
      method: request.method,
      headers,
      redirect: 'manual',
    };

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      const body = await request.text();
      if (body) {
        fetchOptions.body = body;
      }
    }

    const response = await fetch(targetUrl.toString(), fetchOptions);

    const responseHeaders = new Headers(response.headers);
    responseHeaders.delete('content-encoding'); 

    return new NextResponse(response.body, {
      status: response.status,
      headers: responseHeaders,
    });
  } catch (error) {
    console.error(`Proxy error for ${service}:`, error);
    return NextResponse.json({ error: 'Proxy request failed' }, { status: 500 });
  }
}
