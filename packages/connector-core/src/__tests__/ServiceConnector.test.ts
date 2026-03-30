import { describe, it, expect } from 'vitest';
import { ServiceConnector } from '../ServiceConnector.js';
import { Tool } from '@modelcontextprotocol/sdk/types.js';

// Mock implementation for testing
class MockServiceConnector extends ServiceConnector {
  private mockConnected = false;

  async connect(): Promise<void> {
    this.mockConnected = true;
    this.isConnected = true;
  }

  async disconnect(): Promise<void> {
    this.mockConnected = false;
    this.isConnected = false;
  }

  async health(): Promise<boolean> {
    return this.mockConnected;
  }

  async listTools(): Promise<Tool[]> {
    return [
      {
        name: 'mock_tool',
        description: 'A mock tool for testing',
        inputSchema: {
          type: 'object',
          properties: {
            arg: { type: 'string' },
          },
          required: ['arg'],
        },
      },
    ];
  }

  async executeTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    if (!this.isConnected) {
      throw new Error('Not connected');
    }
    if (name !== 'mock_tool') {
      throw new Error(`Unknown tool: ${name}`);
    }
    return { success: true, result: args };
  }
}

describe('ServiceConnector', () => {
  describe('Abstract class contract', () => {
    it('should be extendable by concrete implementations', () => {
      const connector = new MockServiceConnector();
      expect(connector).toBeInstanceOf(ServiceConnector);
    });

    it('should initialize with isConnected = false', () => {
      const connector = new MockServiceConnector();
      expect((connector as any).isConnected).toBe(false);
    });
  });

  describe('Lifecycle', () => {
    it('should connect and update isConnected state', async () => {
      const connector = new MockServiceConnector();
      expect(await connector.health()).toBe(false);

      await connector.connect();

      expect(await connector.health()).toBe(true);
      expect((connector as any).isConnected).toBe(true);
    });

    it('should disconnect and update isConnected state', async () => {
      const connector = new MockServiceConnector();
      await connector.connect();
      expect(await connector.health()).toBe(true);

      await connector.disconnect();

      expect(await connector.health()).toBe(false);
      expect((connector as any).isConnected).toBe(false);
    });

    it('should allow reconnection after disconnect', async () => {
      const connector = new MockServiceConnector();

      await connector.connect();
      expect(await connector.health()).toBe(true);

      await connector.disconnect();
      expect(await connector.health()).toBe(false);

      await connector.connect();
      expect(await connector.health()).toBe(true);
    });
  });

  describe('Tool enumeration', () => {
    it('should list available tools', async () => {
      const connector = new MockServiceConnector();
      const tools = await connector.listTools();

      expect(tools).toHaveLength(1);
      expect(tools[0]).toMatchObject({
        name: 'mock_tool',
        description: expect.any(String),
        inputSchema: expect.any(Object),
      });
    });

    it('should include proper JSON Schema for tool inputs', async () => {
      const connector = new MockServiceConnector();
      const tools = await connector.listTools();

      expect(tools[0].inputSchema).toMatchObject({
        type: 'object',
        properties: expect.any(Object),
        required: expect.any(Array),
      });
    });
  });

  describe('Tool execution', () => {
    it('should execute tool when connected', async () => {
      const connector = new MockServiceConnector();
      await connector.connect();

      const result = await connector.executeTool('mock_tool', { arg: 'test' });

      expect(result).toEqual({
        success: true,
        result: { arg: 'test' },
      });
    });

    it('should throw when executing tool while disconnected', async () => {
      const connector = new MockServiceConnector();

      await expect(connector.executeTool('mock_tool', { arg: 'test' })).rejects.toThrow(
        'Not connected'
      );
    });

    it('should throw on unknown tool name', async () => {
      const connector = new MockServiceConnector();
      await connector.connect();

      await expect(connector.executeTool('unknown_tool', {})).rejects.toThrow('Unknown tool');
    });

    it('should pass arguments to tool execution', async () => {
      const connector = new MockServiceConnector();
      await connector.connect();

      const result = (await connector.executeTool('mock_tool', {
        arg: 'custom_value',
      })) as any;

      expect(result.result).toMatchObject({
        arg: 'custom_value',
      });
    });
  });
});
