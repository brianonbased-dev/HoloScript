import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  holoTunnelTools,
  handleHoloTunnelTool,
  __resetHoloTunnelToolsForTests,
  __setStartHoloTunnelForTests,
} from '../holo-tunnel-tools';

const parseToolJson = (result: Awaited<ReturnType<typeof handleHoloTunnelTool>>) =>
  JSON.parse(result.content[0].text);

describe('holo_tunnel MCP tools', () => {
  beforeEach(() => {
    __resetHoloTunnelToolsForTests();
  });

  afterEach(() => {
    __resetHoloTunnelToolsForTests();
  });

  it('registers all three tool definitions in the public tool list', () => {
    const create = holoTunnelTools.find((t) => t.name === 'holo_tunnel_create');
    const close = holoTunnelTools.find((t) => t.name === 'holo_tunnel_close');
    const status = holoTunnelTools.find((t) => t.name === 'holo_tunnel_status');

    expect(create).toBeDefined();
    expect(close).toBeDefined();
    expect(status).toBeDefined();

    // create requires port
    expect(create?.inputSchema?.properties?.port).toBeDefined();
    expect(create?.inputSchema?.required).toContain('port');

    // close requires tunnelId
    expect(close?.inputSchema?.properties?.tunnelId).toBeDefined();
    expect(close?.inputSchema?.required).toContain('tunnelId');
  });

  it('rejects invalid port numbers', async () => {
    const result = await handleHoloTunnelTool('holo_tunnel_create', { port: 0 });
    const parsed = parseToolJson(result);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain('Invalid port');
  });

  it('rejects negative port numbers', async () => {
    const result = await handleHoloTunnelTool('holo_tunnel_create', { port: -1 });
    const parsed = parseToolJson(result);
    expect(parsed.success).toBe(false);
  });

  it('rejects port > 65535', async () => {
    const result = await handleHoloTunnelTool('holo_tunnel_create', { port: 70000 });
    const parsed = parseToolJson(result);
    expect(parsed.success).toBe(false);
  });

  it('returns status with empty tunnels when none created', async () => {
    const result = await handleHoloTunnelTool('holo_tunnel_status', {});
    const parsed = parseToolJson(result);
    expect(parsed.success).toBe(true);
    expect(parsed.tunnels).toEqual([]);
    expect(parsed.count).toBe(0);
  });

  it('creates, reports, and closes a tunnel handle', async () => {
    const close = vi.fn();
    const startHoloTunnel = vi.fn().mockResolvedValue({
      url: 'https://mcp-orchestrator-production-45f9.up.railway.app/t/test-tunnel',
      liveUrl: 'https://mcp-orchestrator-production-45f9.up.railway.app/live',
      tunnelId: 'test-tunnel',
      relayBase: 'https://mcp-orchestrator-production-45f9.up.railway.app',
      sharePacket: {
        schemaVersion: 'holoscript.holotunnel.share-packet.v1',
        worldId: 'world-1',
        sessionName: 'Studio Preview',
        stableUrl: 'https://mcp-orchestrator-production-45f9.up.railway.app/live',
        directUrl: 'https://mcp-orchestrator-production-45f9.up.railway.app/t/test-tunnel',
        sourceRef: 'scene.holo',
        createdBy: 'agent',
        expiresAt: '2026-05-19T10:00:00.000Z',
      },
      close,
    });
    __setStartHoloTunnelForTests(startHoloTunnel);

    const created = parseToolJson(
      await handleHoloTunnelTool('holo_tunnel_create', {
        port: 3101,
        relayBase: 'https://mcp-orchestrator-production-45f9.up.railway.app',
        localHost: '127.0.0.1',
        clientToken: 'secret-token',
        worldId: 'world-1',
        sessionName: 'Studio Preview',
        sourceRef: 'scene.holo',
        expiresAt: '2026-05-19T10:00:00.000Z',
      }),
    );

    expect(created).toMatchObject({
      success: true,
      tunnelId: 'test-tunnel',
      port: 3101,
      url: 'https://mcp-orchestrator-production-45f9.up.railway.app/t/test-tunnel',
      liveUrl: 'https://mcp-orchestrator-production-45f9.up.railway.app/live',
      localHost: '127.0.0.1',
      relayBase: 'https://mcp-orchestrator-production-45f9.up.railway.app',
      sharePacket: {
        schemaVersion: 'holoscript.holotunnel.share-packet.v1',
        worldId: 'world-1',
        sessionName: 'Studio Preview',
        stableUrl: 'https://mcp-orchestrator-production-45f9.up.railway.app/live',
        directUrl: 'https://mcp-orchestrator-production-45f9.up.railway.app/t/test-tunnel',
        sourceRef: 'scene.holo',
        createdBy: 'agent',
        expiresAt: '2026-05-19T10:00:00.000Z',
      },
    });
    expect(startHoloTunnel).toHaveBeenCalledWith({
      localPort: 3101,
      relayBase: 'https://mcp-orchestrator-production-45f9.up.railway.app',
      localHost: '127.0.0.1',
      clientToken: 'secret-token',
      worldId: 'world-1',
      sessionName: 'Studio Preview',
      sourceRef: 'scene.holo',
      createdBy: 'agent',
      expiresAt: '2026-05-19T10:00:00.000Z',
    });

    const status = parseToolJson(await handleHoloTunnelTool('holo_tunnel_status', {}));
    expect(status).toEqual({
      success: true,
      count: 1,
      tunnels: [
        {
          tunnelId: 'test-tunnel',
          url: 'https://mcp-orchestrator-production-45f9.up.railway.app/t/test-tunnel',
          liveUrl: 'https://mcp-orchestrator-production-45f9.up.railway.app/live',
          relayBase: 'https://mcp-orchestrator-production-45f9.up.railway.app',
          port: 3101,
          localHost: '127.0.0.1',
          sharePacket: {
            schemaVersion: 'holoscript.holotunnel.share-packet.v1',
            worldId: 'world-1',
            sessionName: 'Studio Preview',
            stableUrl: 'https://mcp-orchestrator-production-45f9.up.railway.app/live',
            directUrl: 'https://mcp-orchestrator-production-45f9.up.railway.app/t/test-tunnel',
            sourceRef: 'scene.holo',
            createdBy: 'agent',
            expiresAt: '2026-05-19T10:00:00.000Z',
          },
        },
      ],
    });

    const closed = parseToolJson(
      await handleHoloTunnelTool('holo_tunnel_close', { tunnelId: 'test-tunnel' }),
    );
    expect(closed).toEqual({ success: true, closed: true, tunnelId: 'test-tunnel' });
    expect(close).toHaveBeenCalledOnce();

    const statusAfterClose = parseToolJson(await handleHoloTunnelTool('holo_tunnel_status', {}));
    expect(statusAfterClose).toMatchObject({ success: true, count: 0, tunnels: [] });
  });

  it('returns error when closing non-existent tunnel', async () => {
    const result = await handleHoloTunnelTool('holo_tunnel_close', {
      tunnelId: 'nonexistent',
    });
    const parsed = parseToolJson(result);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain('No active tunnel');
  });

  it('returns error for unknown tool name', async () => {
    const result = await handleHoloTunnelTool('holo_tunnel_unknown', {});
    const parsed = parseToolJson(result);
    expect(parsed.error).toContain('Unknown holo_tunnel tool');
  });
});
