/**
 * Test suite for TypeScript MCP Client examples
 * Tests the demonstration functions in examples/typescript-client.ts
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const { mockClient } = vi.hoisted(() => ({
  mockClient: {
    callTool: vi.fn(),
  },
}));

vi.mock('@modelcontextprotocol/sdk/client', () => ({
  MCPClient: function MockMCPClient() {
    return mockClient;
  },
}));

// Import the functions after mocking
import {
  listTargets,
  compileToUnity,
  compileToR3F,
  compileToURDF,
  compileWithTracking,
  checkCircuitBreaker,
} from '../../examples/typescript-client';

describe('TypeScript MCP Client Examples', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset console mocks
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  describe('listTargets', () => {
    it('should call list_export_targets tool and return result', async () => {
      const mockResult = {
        targets: ['threejs', 'unity', 'unreal', 'blender'],
        categories: {
          'Web Engines': ['threejs', 'babylonjs'],
          'Game Engines': ['unity', 'unreal', 'godot'],
          'CAD Tools': ['blender', 'maya', 'solidworks'],
          Robotics: ['urdf', 'gazebo'],
        },
      };

      mockClient.callTool.mockResolvedValue(mockResult);

      const result = await listTargets();

      expect(mockClient.callTool).toHaveBeenCalledWith('list_export_targets', {});
      expect(result).toEqual(mockResult);

      const logged = vi.mocked(console.log).mock.calls.flat();
      expect(logged).toContain('Available Export Targets:');
      expect(logged).toContain('Total: 4');
      expect(
        logged.some((value) => typeof value === 'string' && value.includes('Categories:'))
      ).toBe(true);
      expect(
        logged.some((value) => typeof value === 'string' && value.includes('Web Engines:'))
      ).toBe(true);
      expect(logged).toContain('  - threejs');
      expect(logged).toContain('  - babylonjs');
      expect(
        logged.some((value) => typeof value === 'string' && value.includes('Game Engines:'))
      ).toBe(true);
      expect(logged).toContain('  - unity');
    });

    it('should handle empty categories correctly', async () => {
      const mockResult = {
        targets: [],
        categories: {},
      };

      mockClient.callTool.mockResolvedValue(mockResult);

      const result = await listTargets();

      expect(result).toEqual(mockResult);
      expect(console.log).toHaveBeenCalledWith('Total: 0');
    });

    it('should handle MCP client errors gracefully', async () => {
      const error = new Error('MCP connection failed');
      mockClient.callTool.mockRejectedValue(error);

      await expect(listTargets()).rejects.toThrow('MCP connection failed');
    });

    it('should surface malformed response data as a runtime error', async () => {
      const mockResult = {
        targets: null,
        categories: {
          'Web Engines': ['threejs'],
        },
      };

      mockClient.callTool.mockResolvedValue(mockResult);

      await expect(listTargets()).rejects.toThrow();
    });
  });

  describe('compileToUnity', () => {
    it('should call compile_to_unity with the current example payload', async () => {
      const mockResult = {
        success: true,
        output: 'Unity C# output',
        jobId: 'job-1',
        metadata: { compilationTimeMs: 42 },
      };

      mockClient.callTool.mockResolvedValue(mockResult);

      const result = await compileToUnity();

      expect(mockClient.callTool).toHaveBeenCalledWith('compile_to_unity', {
        code: expect.stringContaining('composition \"VRRoom\"'),
        options: {
          namespace: 'MyVRGame',
          generatePrefabs: true,
        },
      });

      expect(result).toEqual(mockResult);
    });
  });

  describe('compileToR3F', () => {
    it('should call compile_to_r3f with the current example payload', async () => {
      const mockResult = {
        success: true,
        output: 'React component code',
        target: 'r3f',
      };

      mockClient.callTool.mockResolvedValue(mockResult);

      const result = await compileToR3F();

      expect(mockClient.callTool).toHaveBeenCalledWith('compile_to_r3f', {
        code: expect.stringContaining('composition \"InteractiveScene\"'),
        options: {
          typescript: true,
          environmentPreset: 'sunset',
        },
      });

      expect(result).toEqual(mockResult);
    });
  });

  describe('compileToURDF', () => {
    it('should call compile_to_urdf with the current example payload', async () => {
      const mockResult = {
        success: true,
        output: 'URDF XML content',
        target: 'urdf',
      };

      mockClient.callTool.mockResolvedValue(mockResult);

      const result = await compileToURDF();

      expect(mockClient.callTool).toHaveBeenCalledWith('compile_to_urdf', {
        code: expect.stringContaining('composition \"Robot\"'),
        options: {
          robotName: 'my_robot',
          includeInertial: true,
        },
      });

      expect(result).toEqual(mockResult);
    });
  });

  describe('compileWithTracking', () => {
    it('should call compile_holoscript and return the initial job response', async () => {
      const mockResult = {
        jobId: 'comp-123',
        status: 'processing',
        result: null,
      };

      mockClient.callTool.mockResolvedValue(mockResult);

      const result = await compileWithTracking();

      expect(mockClient.callTool).toHaveBeenNthCalledWith(1, 'compile_holoscript', {
        code: expect.stringContaining('composition \"LargeScene\"'),
        target: 'webgpu',
        stream: false,
      });

      expect(result).toEqual(mockResult);
    });
  });

  describe('checkCircuitBreaker', () => {
    it('should call get_circuit_breaker_status tool', async () => {
      const mockResult = {
        state: 'closed',
        successCount: 10,
        totalRequests: 10,
        failureRate: 0,
        timeInDegradedMode: 0,
        canRetry: true,
        lastError: null,
      };

      mockClient.callTool.mockResolvedValue(mockResult);

      const result = await checkCircuitBreaker('unity');

      expect(mockClient.callTool).toHaveBeenCalledWith('get_circuit_breaker_status', {
        target: 'unity',
      });
      expect(result).toEqual(mockResult);
    });

    it('should handle circuit breaker in open state', async () => {
      const mockResult = {
        state: 'open',
        successCount: 1,
        totalRequests: 5,
        failureRate: 0.8,
        timeInDegradedMode: 60000,
        canRetry: false,
        lastError: 'circuit open',
      };

      mockClient.callTool.mockResolvedValue(mockResult);

      const result = await checkCircuitBreaker('unity');

      expect(result.state).toBe('open');
      expect(result.canRetry).toBe(false);
    });
  });
});
