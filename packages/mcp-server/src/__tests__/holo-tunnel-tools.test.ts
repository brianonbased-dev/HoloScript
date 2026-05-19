import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { holoTunnelTools, handleHoloTunnelTool } from '../holo-tunnel-tools';

describe('holo_tunnel MCP tools', () => {
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
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain('Invalid port');
  });

  it('rejects negative port numbers', async () => {
    const result = await handleHoloTunnelTool('holo_tunnel_create', { port: -1 });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.success).toBe(false);
  });

  it('rejects port > 65535', async () => {
    const result = await handleHoloTunnelTool('holo_tunnel_create', { port: 70000 });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.success).toBe(false);
  });

  it('returns status with empty tunnels when none created', async () => {
    const result = await handleHoloTunnelTool('holo_tunnel_status', {});
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.success).toBe(true);
    expect(parsed.tunnels).toEqual([]);
    expect(parsed.count).toBe(0);
  });

  it('returns error when closing non-existent tunnel', async () => {
    const result = await handleHoloTunnelTool('holo_tunnel_close', {
      tunnelId: 'nonexistent',
    });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain('No active tunnel');
  });

  it('returns error for unknown tool name', async () => {
    const result = await handleHoloTunnelTool('holo_tunnel_unknown', {});
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.error).toContain('Unknown holo_tunnel tool');
  });
});