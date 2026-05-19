/**
 * HoloTunnel client — connects to the MCP orchestrator relay and forwards
 * HTTP requests to a local port. Sovereign replacement for ngrok (NMoS: build-internal).
 *
 * Usage:
 *   const { url, close } = await startHoloTunnel({ localPort: 3000 });
 *   // url = 'https://mcp-orchestrator-production-45f9.up.railway.app/t/<tunnelId>'
 *   // Quest 3 opens url, relay forwards to localhost:3000
 */

import { WebSocket } from 'ws';

export interface HoloTunnelOptions {
  /** Local port to forward traffic to. */
  localPort: number;
  /** Relay URL base. Default: MCP_ORCHESTRATOR_URL env or production URL. */
  relayBase?: string;
  /** Local hostname. Default: 'localhost'. */
  localHost?: string;
  /** Optional relay client token. Defaults to HOLOTUNNEL_CLIENT_TOKEN when set. */
  clientToken?: string;
  /** HoloLand world/session identifier for sanitized share packets. */
  worldId?: string;
  /** Human-readable session name for sanitized share packets. */
  sessionName?: string;
  /** HoloScript source path or identifier backing the preview. */
  sourceRef?: string;
  /** Producer label for sanitized share packets. Default: 'holoscript'. */
  createdBy?: 'studio' | 'agent' | 'cli' | 'holoscript';
  /** Optional access expiry to pass through to HoloLand. */
  expiresAt?: string;
  /** Called when the tunnel URL is ready. */
  onReady?: (url: string, tunnelId: string, handle: HoloTunnelHandle) => void;
  /** Called on each proxied request for logging. */
  onRequest?: (method: string, path: string) => void;
  /** Injectable WebSocket constructor for testing. */
  WebSocketImpl?: typeof WebSocket;
  /** Injectable fetch for testing. */
  fetchImpl?: typeof fetch;
}

export interface HoloTunnelHandle {
  /** Public URL Quest 3 connects to. */
  url: string;
  /** Stable relay URL that redirects to the newest active tunnel. */
  liveUrl: string;
  tunnelId: string;
  /** Relay base URL used to derive url/liveUrl. */
  relayBase: string;
  /** Product-safe packet for HoloLand access surfaces. */
  sharePacket: HoloTunnelSharePacket;
  /** Close the tunnel. */
  close: () => void;
}

export interface HoloTunnelSharePacket {
  schemaVersion: 'holoscript.holotunnel.share-packet.v1';
  worldId: string;
  sessionName: string;
  stableUrl: string;
  directUrl: string;
  sourceRef?: string;
  createdBy: 'studio' | 'agent' | 'cli' | 'holoscript';
  expiresAt?: string;
}

type TunnelMessage =
  | { type: 'hello'; tunnelId: string; publicUrl: string }
  | { type: 'request'; reqId: string; method: string; path: string; headers: Record<string, string>; body: string }
  | { type: 'response'; reqId: string; status: number; headers: Record<string, string>; body: string }
  | { type: 'ping' }
  | { type: 'pong' };

const DEFAULT_RELAY = 'https://mcp-orchestrator-production-45f9.up.railway.app';

export function normalizeHoloTunnelRelayBase(relayBase: string = DEFAULT_RELAY): string {
  const normalized = relayBase
    .trim()
    .replace(/^wss:/, 'https:')
    .replace(/^ws:/, 'http:')
    .replace(/\/+$/, '');

  return normalized.endsWith('/tunnel-ws')
    ? normalized.slice(0, -'/tunnel-ws'.length)
    : normalized;
}

export function buildHoloTunnelWsUrl(relayBase: string = DEFAULT_RELAY): string {
  const normalizedRelayBase = normalizeHoloTunnelRelayBase(relayBase);
  return `${normalizedRelayBase.replace(/^https?/, (p) => (p === 'https' ? 'wss' : 'ws'))}/tunnel-ws`;
}

export function buildHoloTunnelLiveUrl(relayBase: string = DEFAULT_RELAY): string {
  return `${normalizeHoloTunnelRelayBase(relayBase)}/live`;
}

export function resolveHoloTunnelClientToken(token?: string): string | undefined {
  return token || process.env.HOLOTUNNEL_CLIENT_TOKEN || undefined;
}

export function buildHoloTunnelSharePacket(options: {
  directUrl: string;
  relayBase?: string;
  worldId?: string;
  sessionName?: string;
  sourceRef?: string;
  createdBy?: HoloTunnelSharePacket['createdBy'];
  expiresAt?: string;
}): HoloTunnelSharePacket {
  return {
    schemaVersion: 'holoscript.holotunnel.share-packet.v1',
    worldId: options.worldId || 'studio-local-preview',
    sessionName: options.sessionName || 'HoloScript Studio Preview',
    stableUrl: buildHoloTunnelLiveUrl(options.relayBase),
    directUrl: options.directUrl,
    ...(options.sourceRef ? { sourceRef: options.sourceRef } : {}),
    createdBy: options.createdBy || 'holoscript',
    ...(options.expiresAt ? { expiresAt: options.expiresAt } : {}),
  };
}

export function startHoloTunnel(options: HoloTunnelOptions): Promise<HoloTunnelHandle> {
  return new Promise((resolve, reject) => {
    const {
      localPort,
      localHost = 'localhost',
      relayBase: rawRelayBase = process.env.MCP_ORCHESTRATOR_URL ?? DEFAULT_RELAY,
      clientToken,
      worldId,
      sessionName,
      sourceRef,
      createdBy,
      expiresAt,
      onReady,
      onRequest,
      WebSocketImpl = WebSocket,
      fetchImpl = fetch,
    } = options;

    const relayBase = normalizeHoloTunnelRelayBase(rawRelayBase);
    const wsUrl = buildHoloTunnelWsUrl(relayBase);
    const token = resolveHoloTunnelClientToken(clientToken);
    const ws = token
      ? new WebSocketImpl(wsUrl, { headers: { 'x-holotunnel-token': token } }) as WebSocket
      : new WebSocketImpl(wsUrl) as WebSocket;

    let tunnelId = '';
    let publicUrl = '';
    let closed = false;

    const close = () => {
      if (!closed) { closed = true; ws.close(); }
    };

    ws.on('open', () => {
      // relay sends 'hello' immediately after connection
    });

    ws.on('message', async (raw: Buffer | string) => {
      let msg: TunnelMessage;
      try { msg = JSON.parse(raw.toString()); } catch { return; }

      if (msg.type === 'ping') {
        ws.send(JSON.stringify({ type: 'pong' } satisfies TunnelMessage));
        return;
      }

      if (msg.type === 'hello') {
        tunnelId = msg.tunnelId;
        publicUrl = msg.publicUrl;
        const handle: HoloTunnelHandle = {
          url: publicUrl,
          liveUrl: buildHoloTunnelLiveUrl(relayBase),
          tunnelId,
          relayBase,
          sharePacket: buildHoloTunnelSharePacket({
            directUrl: publicUrl,
            relayBase,
            worldId,
            sessionName,
            sourceRef,
            createdBy,
            expiresAt,
          }),
          close,
        };
        onReady?.(publicUrl, tunnelId, handle);
        resolve(handle);
        return;
      }

      if (msg.type === 'request') {
        onRequest?.(msg.method, msg.path);
        const { reqId, method, path, headers, body } = msg;

        const localUrl = `http://${localHost}:${localPort}${path}`;
        const bodyBuf = body ? Buffer.from(body, 'base64') : undefined;

        // Strip hop-by-hop and encoding headers before forwarding.
        // Remove accept-encoding so the local server responds with plain bytes —
        // Node fetch auto-decompresses, so we must not ask for gzip or the
        // Content-Encoding response header will mismatch the actual body bytes.
        const fwdHeaders: Record<string, string> = { ...headers };
        for (const h of ['host', 'connection', 'transfer-encoding', 'accept-encoding']) delete fwdHeaders[h];
        fwdHeaders['host'] = `${localHost}:${localPort}`;

        let status = 502;
        let respHeaders: Record<string, string> = {};
        let respBody = '';

        try {
          const resp = await (fetchImpl as typeof fetch)(localUrl, {
            method,
            headers: fwdHeaders,
            body: bodyBuf && bodyBuf.length > 0 ? bodyBuf : undefined,
            // @ts-expect-error — Node fetch accepts duplex
            duplex: 'half',
          });
          status = resp.status;
          resp.headers.forEach((v, k) => { respHeaders[k] = v; });
          // Drop content-encoding — fetch already decoded the body
          delete respHeaders['content-encoding'];
          const buf = await resp.arrayBuffer();
          respBody = Buffer.from(buf).toString('base64');
        } catch (err) {
          status = 502;
          respBody = Buffer.from(JSON.stringify({ error: String(err) })).toString('base64');
          respHeaders['content-type'] = 'application/json';
        }

        if (!closed && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({
            type: 'response',
            reqId,
            status,
            headers: respHeaders,
            body: respBody,
          } satisfies TunnelMessage));
        }
      }
    });

    ws.on('error', (err: Error) => {
      if (!tunnelId) reject(err);
    });

    ws.on('close', () => {
      closed = true;
      if (!tunnelId) reject(new Error('HoloTunnel: relay closed before hello'));
    });
  });
}
