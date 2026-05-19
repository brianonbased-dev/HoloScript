/**
 * HoloTunnel MCP Tools
 *
 * Expose HoloTunnel (sovereign ngrok replacement) as MCP tools so any agent
 * can open a local-to-cloud tunnel without CLI knowledge.
 *
 * Tool: holo_tunnel_create
 *   - Opens a tunnel from a local port to a public URL via the MCP relay.
 *   - Returns the public URL and tunnel ID.
 *   - Tunnel is kept alive for the duration of the MCP session (or until
 *     holo_tunnel_close is called).
 *
 * Tool: holo_tunnel_close
 *   - Closes a previously opened tunnel by tunnel ID.
 *
 * Source: packages/hololand-platform/src/holo-tunnel/index.ts
 * Task: task_1779158644652_avm8 — [WIRE] Expose HoloTunnel as MCP tool
 */

import { Tool } from '@modelcontextprotocol/sdk/types.js';

interface HoloTunnelSharePacket {
  schemaVersion: 'holoscript.holotunnel.share-packet.v1';
  worldId: string;
  sessionName: string;
  stableUrl: string;
  directUrl: string;
  sourceRef?: string;
  createdBy: 'studio' | 'agent' | 'cli' | 'holoscript';
  expiresAt?: string;
}

interface HoloTunnelToolHandle {
  url: string;
  liveUrl: string;
  tunnelId: string;
  relayBase: string;
  sharePacket: HoloTunnelSharePacket;
  close: () => void;
}

// ---------------------------------------------------------------------------
// In-process tunnel registry (MCP is single-process per server instance)
// ---------------------------------------------------------------------------
const activeTunnels = new Map<string, {
  url: string;
  liveUrl: string;
  relayBase: string;
  port: number;
  localHost: string;
  sharePacket: HoloTunnelSharePacket;
  close: () => void;
}>();

// Lazy-import startHoloTunnel so the server doesn't fail if the dependency
// is tree-shaken or the module is unavailable in the current build.
let startHoloTunnelFn: typeof import('@holoscript/hololand-platform').startHoloTunnel | null = null;

async function getStartHoloTunnel() {
  if (!startHoloTunnelFn) {
    const mod = await import('@holoscript/hololand-platform');
    startHoloTunnelFn = mod.startHoloTunnel;
  }
  return startHoloTunnelFn!;
}

export function __setStartHoloTunnelForTests(
  fn: typeof import('@holoscript/hololand-platform').startHoloTunnel | null,
): void {
  startHoloTunnelFn = fn;
}

export function __resetHoloTunnelToolsForTests(): void {
  activeTunnels.clear();
  startHoloTunnelFn = null;
}

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------
export const holoTunnelTools: Tool[] = [
  {
    name: 'holo_tunnel_create',
    description: `Open a local-to-cloud tunnel via the HoloMesh relay.

Given a local port, opens a WebSocket tunnel to the MCP relay and returns a
public HTTPS URL that forwards traffic to localhost:<port>. This is the
sovereign replacement for ngrok — no third-party dependency, no CLI knowledge
required.

Use cases:
- Share a local dev server with Quest 3 / mobile devices
- Preview Studio builds on external devices
- Dogfood D.012 lights-out preview flows

Returns: { url: string, liveUrl: string, tunnelId: string, sharePacket: object }
— the developer URL, stable /live URL, handle for closing the tunnel, and a
product-safe packet HoloLand can consume.`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        port: {
          type: 'number',
          description: 'Local port to forward traffic to (e.g. 3000 for dev server)',
        },
        relayBase: {
          type: 'string',
          description:
            'Optional relay URL base. Defaults to the production MCP relay. Only override for local testing.',
        },
        localHost: {
          type: 'string',
          description:
            'Local hostname. Defaults to "localhost". Use "0.0.0.0" to listen on all interfaces.',
        },
        clientToken: {
          type: 'string',
          description:
            'Optional relay client token. Defaults to HOLOTUNNEL_CLIENT_TOKEN. Never returned in tool output.',
        },
        worldId: {
          type: 'string',
          description: 'Optional HoloLand world/session identifier for the share packet.',
        },
        sessionName: {
          type: 'string',
          description: 'Optional human-readable session name for the share packet.',
        },
        sourceRef: {
          type: 'string',
          description: 'Optional source file/path backing the live preview.',
        },
        createdBy: {
          type: 'string',
          enum: ['studio', 'agent', 'cli', 'holoscript'],
          description: 'Optional share-packet producer label. Defaults to "agent".',
        },
        expiresAt: {
          type: 'string',
          description: 'Optional ISO expiry timestamp to pass through to HoloLand.',
        },
      },
      required: ['port'],
    },
  },
  {
    name: 'holo_tunnel_close',
    description: `Close a previously opened HoloTunnel by tunnel ID.

Pass the tunnelId returned by holo_tunnel_create. Closes the WebSocket
connection and removes the tunnel from the registry.

Returns: { closed: boolean, tunnelId: string }`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        tunnelId: {
          type: 'string',
          description: 'The tunnelId returned by holo_tunnel_create',
        },
      },
      required: ['tunnelId'],
    },
  },
  {
    name: 'holo_tunnel_status',
    description: `List currently active HoloTunnel connections.

Returns an array of active tunnels with their public URLs and local ports.

Returns: { tunnels: Array<{ tunnelId: string, url: string }> }`,
    inputSchema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
];

function optionalString(args: Record<string, unknown>, key: string): string | undefined {
  return typeof args[key] === 'string' && args[key] ? String(args[key]) : undefined;
}

// ---------------------------------------------------------------------------
// Tool handler
// ---------------------------------------------------------------------------
export async function handleHoloTunnelTool(
  name: string,
  args: Record<string, unknown>,
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  switch (name) {
    case 'holo_tunnel_create': {
      const port = Number(args.port);
      if (!port || port < 1 || port > 65535) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: false,
                error: `Invalid port: ${args.port}. Must be 1-65535.`,
              }),
            },
          ],
        };
      }

      try {
        const startHoloTunnel = await getStartHoloTunnel();
        const localHost = optionalString(args, 'localHost') ?? 'localhost';
        const relayBase = optionalString(args, 'relayBase');
        const clientToken = optionalString(args, 'clientToken');
        const worldId = optionalString(args, 'worldId');
        const sessionName = optionalString(args, 'sessionName');
        const sourceRef = optionalString(args, 'sourceRef');
        const createdBy = optionalString(args, 'createdBy');
        const expiresAt = optionalString(args, 'expiresAt');
        const result = await startHoloTunnel({
          localPort: port,
          ...(relayBase ? { relayBase } : {}),
          localHost,
          ...(clientToken ? { clientToken } : {}),
          ...(worldId ? { worldId } : {}),
          ...(sessionName ? { sessionName } : {}),
          ...(sourceRef ? { sourceRef } : {}),
          ...(createdBy === 'studio' || createdBy === 'agent' || createdBy === 'cli' || createdBy === 'holoscript'
            ? { createdBy }
            : { createdBy: 'agent' as const }),
          ...(expiresAt ? { expiresAt } : {}),
        } as unknown as Parameters<typeof startHoloTunnel>[0]) as HoloTunnelToolHandle;

        // Register the tunnel so it can be closed later
        activeTunnels.set(result.tunnelId, {
          url: result.url,
          liveUrl: result.liveUrl,
          relayBase: result.relayBase,
          port,
          localHost,
          sharePacket: result.sharePacket,
          close: result.close,
        });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: true,
                url: result.url,
                liveUrl: result.liveUrl,
                tunnelId: result.tunnelId,
                port,
                localHost,
                relayBase: result.relayBase,
                sharePacket: result.sharePacket,
                message: `Tunnel active: ${result.url} → localhost:${port}`,
              }),
            },
          ],
        };
      } catch (err) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: false,
                error: `Failed to create tunnel: ${err instanceof Error ? err.message : String(err)}`,
              }),
            },
          ],
        };
      }
    }

    case 'holo_tunnel_close': {
      const tunnelId = String(args.tunnelId);
      const tunnel = activeTunnels.get(tunnelId);
      if (!tunnel) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: false,
                error: `No active tunnel with ID: ${tunnelId}`,
                activeTunnelIds: Array.from(activeTunnels.keys()),
              }),
            },
          ],
        };
      }

      try {
        tunnel.close();
        activeTunnels.delete(tunnelId);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ success: true, closed: true, tunnelId }),
            },
          ],
        };
      } catch (err) {
        // Tunnel may already be closed (network disconnect, etc.)
        activeTunnels.delete(tunnelId);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: true,
                closed: true,
                tunnelId,
                warning: `Close threw: ${err instanceof Error ? err.message : String(err)}`,
              }),
            },
          ],
        };
      }
    }

    case 'holo_tunnel_status': {
      const tunnels = Array.from(activeTunnels.entries()).map(([id, t]) => ({
        tunnelId: id,
        url: t.url,
        liveUrl: t.liveUrl,
        relayBase: t.relayBase,
        port: t.port,
        localHost: t.localHost,
        sharePacket: t.sharePacket,
      }));
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ success: true, tunnels, count: tunnels.length }),
          },
        ],
      };
    }

    default:
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ error: `Unknown holo_tunnel tool: ${name}` }),
          },
        ],
      };
  }
}
