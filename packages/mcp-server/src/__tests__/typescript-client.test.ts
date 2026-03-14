/**
 * Test suite for TypeScript MCP Client examples
 * Tests the demonstration functions in examples/typescript-client.ts
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock the MCP client
const mockClient = {
  callTool: vi.fn()
};

// Mock module imports
vi.mock('@modelcontextprotocol/sdk/client', () => ({
  MCPClient: vi.fn().mockImplementation(() => mockClient)
}));

// Import the functions after mocking
import {
  listTargets,
  compileToUnity,
  compileToR3F,
  compileToURDF,
  compileWithTracking,
  checkCircuitBreaker
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
          'Robotics': ['urdf', 'gazebo']
        }
      };
      
      mockClient.callTool.mockResolvedValue(mockResult);
      
      const result = await listTargets();
      
      // Verify tool was called correctly
      expect(mockClient.callTool).toHaveBeenCalledWith('list_export_targets', {});
      
      // Verify result is returned
      expect(result).toEqual(mockResult);
      
      // Verify console output
      expect(console.log).toHaveBeenCalledWith('Available Export Targets:');
      expect(console.log).toHaveBeenCalledWith('Total: 4');
      expect(console.log).toHaveBeenCalledWith('\\nCategories:');
      expect(console.log).toHaveBeenCalledWith('\\nWeb Engines:');
      expect(console.log).toHaveBeenCalledWith('  - threejs');
      expect(console.log).toHaveBeenCalledWith('  - babylonjs');
      expect(console.log).toHaveBeenCalledWith('\\nGame Engines:');
      expect(console.log).toHaveBeenCalledWith('  - unity');
    });
    
    it('should handle empty categories correctly', async () => {
      const mockResult = {
        targets: [],
        categories: {}
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
    
    it('should handle malformed response data', async () => {
      const mockResult = {
        targets: null,  // Invalid data
        categories: {
          'Web Engines': ['threejs']
        }
      };
      
      mockClient.callTool.mockResolvedValue(mockResult);
      
      // Should not crash even with null targets
      const result = await listTargets();
      expect(result).toEqual(mockResult);
    });
  });
  
  describe('compileToUnity', () => {
    it('should call compile_holoscript tool with Unity target', async () => {
      const mockResult = {
        success: true,
        output: 'Unity C# output',
        target: 'unity'
      };
      
      mockClient.callTool.mockResolvedValue(mockResult);
      
      const result = await compileToUnity();
      
      expect(mockClient.callTool).toHaveBeenCalledWith('compile_holoscript', {
        code: expect.stringContaining('composition \"VRRoom\"'),
        target: 'unity',
        options: {
          exportLights: true,
          exportPhysics: true,
          exportAnimations: false
        }
      });
      
      expect(result).toEqual(mockResult);
    });
  });
  
  describe('compileToR3F', () => {
    it('should call compile_holoscript tool with React Three Fiber target', async () => {
      const mockResult = {
        success: true,
        output: 'React component code',
        target: 'r3f'
      };
      
      mockClient.callTool.mockResolvedValue(mockResult);
      
      const result = await compileToR3F();
      
      expect(mockClient.callTool).toHaveBeenCalledWith('compile_holoscript', {
        code: expect.stringContaining('composition \"ReactScene\"'),
        target: 'r3f',
        options: {
          typescript: true,
          hooks: true,
          suspense: false
        }
      });
      
      expect(result).toEqual(mockResult);
    });
  });
  
  describe('compileToURDF', () => {
    it('should call compile_holoscript tool with URDF robotics target', async () => {
      const mockResult = {
        success: true,
        output: 'URDF XML content',
        target: 'urdf'
      };
      
      mockClient.callTool.mockResolvedValue(mockResult);
      
      const result = await compileToURDF();
      
      expect(mockClient.callTool).toHaveBeenCalledWith('compile_holoscript', {
        code: expect.stringContaining('composition \"RobotArm\"'),
        target: 'urdf',
        options: {
          includeVisuals: true,
          includeCollisions: true,
          units: 'meters'
        }
      });
      
      expect(result).toEqual(mockResult);
    });
  });
  
  describe('compileWithTracking', () => {
    it('should call compile_holoscript with tracking options and return polling result', async () => {
      const mockResult = {
        success: true,
        compilationId: 'comp-123',
        status: 'completed',
        output: 'Generated code'
      };
      
      // Mock the compile call and status checks
      mockClient.callTool
        .mockResolvedValueOnce({ compilationId: 'comp-123', status: 'processing' })  // Initial compile
        .mockResolvedValueOnce({ compilationId: 'comp-123', status: 'processing' })  // First status check
        .mockResolvedValueOnce({ compilationId: 'comp-123', status: 'completed', output: 'Generated code' }); // Final status
      
      const result = await compileWithTracking();
      
      // Should call compile tool
      expect(mockClient.callTool).toHaveBeenNthCalledWith(1, 'compile_holoscript', {
        code: expect.stringContaining('composition \"TrackingDemo\"'),
        target: 'threejs',
        options: { enableTracking: true }
      });
      
      // Should check status
      expect(mockClient.callTool).toHaveBeenNthCalledWith(2, 'get_compilation_status', {
        compilationId: 'comp-123'
      });
      
      expect(result).toMatchObject({
        status: 'completed',
        output: 'Generated code'
      });
    });
  });
  
  describe('checkCircuitBreaker', () => {
    it('should call get_circuit_breaker_status tool', async () => {
      const mockResult = {
        state: 'closed',
        failureCount: 0,
        lastFailureTime: null,
        nextAttemptTime: null
      };
      
      mockClient.callTool.mockResolvedValue(mockResult);
      
      const result = await checkCircuitBreaker();
      
      expect(mockClient.callTool).toHaveBeenCalledWith('get_circuit_breaker_status', {});
      expect(result).toEqual(mockResult);
    });
    
    it('should handle circuit breaker in open state', async () => {
      const mockResult = {
        state: 'open',
        failureCount: 5,
        lastFailureTime: '2024-01-01T12:00:00Z',
        nextAttemptTime: '2024-01-01T12:01:00Z'
      };
      
      mockClient.callTool.mockResolvedValue(mockResult);
      
      const result = await checkCircuitBreaker();
      
      expect(result.state).toBe('open');
      expect(result.failureCount).toBe(5);
    });
  });
});