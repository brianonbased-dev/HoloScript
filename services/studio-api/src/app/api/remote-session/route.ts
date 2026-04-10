import { NextRequest } from 'next/server';
import { randomUUID } from 'crypto';

/**
 * GET /api/remote-session
 * Creates (or returns) a shareable remote preview session.
 * Returns a token, QR-friendly URL, and WebSocket upgrade URL.
 * In production these would persist in Redis; here they're stateless
 * with a deterministic derivation from the supplied scene hash.
 */

export interface RemoteSession {
  token: string;
  previewUrl: string;
  wsUrl: string;
  qrData: string; // URL string suitable for QR encoding
  expiresAt: string; // ISO timestamp
  devices: ConnectedDevice[];
}

export interface ConnectedDevice {
  id: string;
  label: string;
  platform: 'mobile' | 'vr' | 'desktop' | 'unknown';
  connectedAt: string;
  latencyMs: number | null;
}

// Simulate connected devices for demonstration
const DEMO_DEVICES: ConnectedDevice[] = [];

export async function GET(request: NextRequest) {
  const sceneHash = request.nextUrl.searchParams.get('hash') ?? 'default';

  // Deterministic token so the same hash always gets the same session
  const token = Buffer.from(`hs-remote-${sceneHash}`).toString('base64url').slice(0, 24);

  const origin = request.nextUrl.origin;
  const previewUrl = `${origin}/preview/${token}`;
  const wsUrl = `${origin.replace(/^http/, 'ws')}/ws/preview/${token}`;

  const session: RemoteSession = {
    token,
    previewUrl,
    wsUrl,
    qrData: previewUrl,
    expiresAt: new Date(Date.now() + 3600_000).toISOString(), // 1 hour
    devices: DEMO_DEVICES,
  };

  return Response.json(session, {
    headers: {
      'Cache-Control': 'no-store',
    },
  });
}

export async function POST(request: NextRequest) {
  // Register a device heartbeat (called by the preview page)
  const body = (await request.json()) as Partial<ConnectedDevice>;
  const device: ConnectedDevice = {
    id: body.id ?? randomUUID(),
    label: body.label ?? 'Unknown Device',
    platform: body.platform ?? 'unknown',
    connectedAt: new Date().toISOString(),
    latencyMs: body.latencyMs ?? null,
  };
  // In production: upsert to Redis pub/sub
  return Response.json({ ok: true, device });
}
