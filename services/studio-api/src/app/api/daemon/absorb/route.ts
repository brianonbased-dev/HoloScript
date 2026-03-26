/**
 * /api/daemon/absorb — API Gateway Proxy to Absorb Service
 *
 * Proxies CodebaseScanner requests from the Studio frontend to the standalone
 * Next.js or Express `absorb-service` microservice.
 */

import { NextRequest, NextResponse } from 'next/server';
import { forwardAuthHeaders } from '@/lib/api-auth';

// ─── Types (mirrored from CodebaseGraph serialized shape) ─────────────────────

export interface AbsorbSymbol {
  name: string;
  type: string;
  filePath: string;
  line: number;
}

export interface AbsorbImport {
  fromFile: string;
  toModule: string;
  resolvedPath?: string;
}

export interface AbsorbFileResult {
  path: string;
  language: string;
  symbols: AbsorbSymbol[];
  imports: AbsorbImport[];
  calls: unknown[];
  loc: number;
  sizeBytes: number;
}

export interface AbsorbScanResult {
  rootDir: string;
  files: AbsorbFileResult[];
  stats: {
    totalFiles: number;
    totalSymbols: number;
    totalImports: number;
    totalLoc: number;
    durationMs: number;
    errors: string[];
    filesByLanguage: Record<string, number>;
    symbolsByType: Record<string, number>;
    totalCalls: number;
  };
}

export interface AbsorbVisualizationNode {
  id: string;
  label: string;
  community: number;
  degree: number;
  inDegree: number;
  outDegree: number;
  loc: number;
}

export interface AbsorbVisualizationEdge {
  source: string;
  target: string;
}

export interface AbsorbResult {
  graphJson: string;
  visualization: {
    nodes: AbsorbVisualizationNode[];
    edges: AbsorbVisualizationEdge[];
    communities: Record<string, number>;
    stats: {
      totalFiles: number;
      totalSymbols: number;
      totalImports: number;
      totalLoc: number;
      communityCount: number;
    };
  };
  inDegree: Record<string, number>;
  leafFirstOrder: string[];
  hubFiles: Array<{ path: string; inDegree: number; symbols: number }>;
  stats: AbsorbScanResult['stats'];
  durationMs: number;
  absorbedAt: string;
  projectPath: string;
  depth: 'shallow' | 'medium' | 'deep';
  gitCommitHash?: string;
  fileHashes?: Record<string, string>;
  incremental?: boolean;
  filesChanged?: number;
}

const ABSORB_SERVICE_URL = process.env.ABSORB_SERVICE_INTERNAL_URL || process.env.ABSORB_SERVICE_URL || 'http://localhost:3000';

export async function GET(req: NextRequest) {
  try {
    const url = new URL(`${ABSORB_SERVICE_URL}/api/absorb`);
    req.nextUrl.searchParams.forEach((value, key) => url.searchParams.append(key, value));

    const res = await fetch(url.toString(), {
      method: 'GET',
      headers: { 'Accept': 'application/json', ...forwardAuthHeaders(req) },
    });

    if (!res.ok) {
      return NextResponse.json({ error: `Absorb service returned ${res.status}` }, { status: res.status });
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({
      cached: false,
      hint: 'Absorb Service is offline. POST to absorb when online.',
      error: String(error)
    });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const res = await fetch(`${ABSORB_SERVICE_URL}/api/absorb`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...forwardAuthHeaders(req) },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text();
      return NextResponse.json({ error: `Absorb service failed [${res.status}]: ${errText}` }, { status: res.status });
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({
      error: 'Failed to proxy request to absorb-service',
      details: String(error)
    }, { status: 502 });
  }
}
