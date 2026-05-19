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
  /** Called when the tunnel URL is ready. */
  onReady?: (url: string, tunnelId: string) => void;
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
  tunnelId: string;
  /** Close the tunnel. */
  close: () => void;
}

type TunnelMessage =
  | { type: 'hello'; tunnelId: string; publicUrl: string }
  | { type: 'request'; reqId: string; method: string; path: string; headers: Record<string, string>; body: string }
  | { type: 'response'; reqId: string; status: number; headers: Record<string, string>; body: string }
  | { type: 'ping' }
  | { type: 'pong' };

const DEFAULT_RELAY = 'https://mcp-orchestrator-production-45f9.up.railway.app';

export function startHoloTunnel(options: HoloTunnelOptions): Promise<HoloTunnelHandle> {
  return new Promise((resolve, reject) => {
    const {
      localPort,
      localHost = 'localhost',
      relayBase = process.env.MCP_ORCHESTRATOR_URL ?? DEFAULT_RELAY,
      onReady,
      onRequest,
      WebSocketImpl = WebSocket,
      fetchImpl = fetch,
    } = options;

    const wsUrl = relayBase.replace(/^https?/, (p) => (p === 'https' ? 'wss' : 'ws')) + '/tunnel-ws';
    const ws = new WebSocketImpl(wsUrl) as WebSocket;

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
        onReady?.(publicUrl, tunnelId);
        resolve({ url: publicUrl, tunnelId, close });
        return;
      }

      if (msg.type === 'request') {
        onRequest?.(msg.method, msg.path);
        const { reqId, method, path, headers, body } = msg;

        const localUrl = `http://${localHost}:${localPort}${path}`;
        const bodyBuf = body ? Buffer.from(body, 'base64') : undefined;

        // Strip hop-by-hop headers before forwarding
        const fwdHeaders: Record<string, string> = { ...headers };
        for (const h of ['host', 'connection', 'transfer-encoding']) delete fwdHeaders[h];
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
