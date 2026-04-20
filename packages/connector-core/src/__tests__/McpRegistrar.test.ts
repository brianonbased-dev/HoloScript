import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { ServiceConnector } from '../ServiceConnector.js';
import { McpRegistrar, type OrchestratorRegistration } from '../McpRegistrar.js';

class StubConnector extends ServiceConnector {
  constructor(private readonly tools: Tool[]) {
    super();
  }
  async connect(): Promise<void> {
    this.isConnected = true;
  }
  async disconnect(): Promise<void> {
    this.isConnected = false;
  }
  async health(): Promise<boolean> {
    return true;
  }
  async listTools(): Promise<Tool[]> {
    return this.tools;
  }
  async executeTool(): Promise<unknown> {
    return null;
  }
}

// Mock fetch globally
global.fetch = vi.fn();

describe('McpRegistrar', () => {
  let registrar: McpRegistrar;

  beforeEach(() => {
    vi.clearAllMocks();
    registrar = new McpRegistrar();
  });

  describe('register()', () => {
    it('should register connector with orchestrator', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        status: 200,
      });

      const payload: OrchestratorRegistration = {
        name: 'test-connector',
        url: 'http://localhost:3000',
        tools: ['tool_one', 'tool_two'],
      };

      const result = await registrar.register(payload);

      expect(result).toBe(true);
      const [calledUrl, calledInit] = (global.fetch as any).mock.calls[0];
      expect(calledUrl).toContain('/register');
      expect(calledInit).toEqual(
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      );
    });

    it('should return false on HTTP error', async () => {
      (global.fetch as any).mockResolvedValue({
        ok: false,
        status: 500,
      });

      const payload: OrchestratorRegistration = {
        name: 'test-connector',
        url: 'http://localhost:3000',
        tools: [],
      };

      const result = await registrar.register(payload);

      expect(result).toBe(false);
    });

    it('should return false on network error', async () => {
      (global.fetch as any).mockRejectedValue(new Error('Network error'));

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const payload: OrchestratorRegistration = {
        name: 'test-connector',
        url: 'http://localhost:3000',
        tools: [],
      };

      const result = await registrar.register(payload);

      expect(result).toBe(false);
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[McpRegistrar]'),
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });

    it('should handle multiple tools in registration', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        status: 200,
      });

      const payload: OrchestratorRegistration = {
        name: 'multi-tool-connector',
        url: 'http://localhost:4000',
        tools: ['tool_a', 'tool_b', 'tool_c', 'tool_d', 'tool_e'],
      };

      const result = await registrar.register(payload);

      expect(result).toBe(true);
      const callBody = JSON.parse((global.fetch as any).mock.calls[0][1].body);
      expect(callBody.tools).toHaveLength(5);
      expect(callBody.tools).toEqual(['tool_a', 'tool_b', 'tool_c', 'tool_d', 'tool_e']);
    });

    it('should handle empty tools array', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        status: 200,
      });

      const payload: OrchestratorRegistration = {
        name: 'no-tools-connector',
        url: 'http://localhost:5000',
        tools: [],
      };

      const result = await registrar.register(payload);

      expect(result).toBe(true);
      const callBody = JSON.parse((global.fetch as any).mock.calls[0][1].body);
      expect(callBody.tools).toEqual([]);
    });

    it('should use default orchestrator fallback endpoints', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        status: 200,
      });

      await registrar.register({
        name: 'test',
        url: 'http://test',
        tools: [],
      });

      const [calledUrl, calledInit] = (global.fetch as any).mock.calls[0];
      expect(calledUrl).toContain('/register');
      expect(calledInit).toEqual(expect.any(Object));
    });
  });

  describe('registerFromServiceConnector()', () => {
    it('should derive tool names from connector.listTools()', async () => {
      (global.fetch as any).mockResolvedValueOnce({ ok: true, status: 200 });

      const connector = new StubConnector([
        { name: 'alpha', description: 'a', inputSchema: { type: 'object' } },
        { name: 'beta', description: 'b', inputSchema: { type: 'object' } },
      ]);

      const ok = await registrar.registerFromServiceConnector(connector, {
        name: 'stub-svc',
        url: 'http://localhost:9999',
      });

      expect(ok).toBe(true);
      const body = JSON.parse((global.fetch as any).mock.calls[0][1].body);
      expect(body).toMatchObject({
        name: 'stub-svc',
        url: 'http://localhost:9999',
        tools: ['alpha', 'beta'],
      });
    });
  });
});
