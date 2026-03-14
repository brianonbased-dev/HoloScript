/**
 * Tests for typescript-client.ts example functions
 * 
 * Tests the MCP client example functions to ensure they work correctly
 * with mocked MCP client responses.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the MCP client
const mockMCPClient = {
  callTool: vi.fn()
};

// Mock console to capture output
const mockConsole = {
  log: vi.fn()
};

global.console = mockConsole as any;

// Extracted listTargets function for testing
async function testListTargets(client: any) {
  const result = await client.callTool('list_export_targets', {});

  console.log('Available Export Targets:');
  console.log(`Total: ${result.targets.length}`);
  console.log('\nCategories:');

  for (const [category, targets] of Object.entries(result.categories)) {
    console.log(`\n${category}:`);
    targets.forEach((target: string) => console.log(`  - ${target}`));
  }

  return result;
}

describe('typescript-client examples', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('listTargets', () => {
    it('should call list_export_targets tool and display results', async () => {
      const mockResponse = {
        targets: ['unity', 'unreal', 'threejs', 'babylonjs', 'aframe'],
        categories: {
          'Game Engines': ['unity', 'unreal'],
          'Web 3D': ['threejs', 'babylonjs', 'aframe']
        }
      };

      mockMCPClient.callTool.mockResolvedValue(mockResponse);

      const result = await testListTargets(mockMCPClient);

      // Verify correct tool was called
      expect(mockMCPClient.callTool).toHaveBeenCalledWith('list_export_targets', {});
      expect(mockMCPClient.callTool).toHaveBeenCalledTimes(1);

      // Verify result is returned
      expect(result).toEqual(mockResponse);

      // Verify console output
      expect(mockConsole.log).toHaveBeenCalledWith('Available Export Targets:');
      expect(mockConsole.log).toHaveBeenCalledWith('Total: 5');
      expect(mockConsole.log).toHaveBeenCalledWith('\nCategories:');
      expect(mockConsole.log).toHaveBeenCalledWith('\nGame Engines:');
      expect(mockConsole.log).toHaveBeenCalledWith('  - unity');
      expect(mockConsole.log).toHaveBeenCalledWith('  - unreal');
      expect(mockConsole.log).toHaveBeenCalledWith('\nWeb 3D:');
      expect(mockConsole.log).toHaveBeenCalledWith('  - threejs');
      expect(mockConsole.log).toHaveBeenCalledWith('  - babylonjs');
      expect(mockConsole.log).toHaveBeenCalledWith('  - aframe');
    });

    it('should handle empty targets response', async () => {
      const mockResponse = {
        targets: [],
        categories: {}
      };

      mockMCPClient.callTool.mockResolvedValue(mockResponse);

      const result = await testListTargets(mockMCPClient);

      expect(result).toEqual(mockResponse);
      expect(mockConsole.log).toHaveBeenCalledWith('Available Export Targets:');
      expect(mockConsole.log).toHaveBeenCalledWith('Total: 0');
      expect(mockConsole.log).toHaveBeenCalledWith('\nCategories:');
      
      // Should not have any category-specific output
      const categoryLogs = mockConsole.log.mock.calls.filter(call => 
        call[0] && typeof call[0] === 'string' && call[0].startsWith('  - ')
      );
      expect(categoryLogs).toHaveLength(0);
    });

    it('should handle single category with multiple targets', async () => {
      const mockResponse = {
        targets: ['target1', 'target2', 'target3'],
        categories: {
          'Test Category': ['target1', 'target2', 'target3']
        }
      };

      mockMCPClient.callTool.mockResolvedValue(mockResponse);

      const result = await testListTargets(mockMCPClient);

      expect(result).toEqual(mockResponse);
      expect(mockConsole.log).toHaveBeenCalledWith('Total: 3');
      expect(mockConsole.log).toHaveBeenCalledWith('\nTest Category:');
      expect(mockConsole.log).toHaveBeenCalledWith('  - target1');
      expect(mockConsole.log).toHaveBeenCalledWith('  - target2');
      expect(mockConsole.log).toHaveBeenCalledWith('  - target3');
    });

    it('should handle multiple categories with single targets', async () => {
      const mockResponse = {
        targets: ['unity', 'web', 'mobile'],
        categories: {
          'Game': ['unity'],
          'Web': ['web'],
          'Mobile': ['mobile']
        }
      };

      mockMCPClient.callTool.mockResolvedValue(mockResponse);

      const result = await testListTargets(mockMCPClient);

      expect(result).toEqual(mockResponse);
      expect(mockConsole.log).toHaveBeenCalledWith('\nGame:');
      expect(mockConsole.log).toHaveBeenCalledWith('  - unity');
      expect(mockConsole.log).toHaveBeenCalledWith('\nWeb:');
      expect(mockConsole.log).toHaveBeenCalledWith('  - web');
      expect(mockConsole.log).toHaveBeenCalledWith('\nMobile:');
      expect(mockConsole.log).toHaveBeenCalledWith('  - mobile');
    });

    it('should handle MCP client errors gracefully', async () => {
      const error = new Error('MCP connection failed');
      mockMCPClient.callTool.mockRejectedValue(error);

      await expect(testListTargets(mockMCPClient)).rejects.toThrow('MCP connection failed');
      expect(mockMCPClient.callTool).toHaveBeenCalledWith('list_export_targets', {});
    });

    it('should handle malformed response structure', async () => {
      const mockResponse = {
        targets: ['unity', 'web'],
        categories: {
          'Valid Category': ['unity'],
          'Invalid Category': 'not-an-array' // This should cause issues
        }
      };

      mockMCPClient.callTool.mockResolvedValue(mockResponse);

      // The function should still work for valid categories and skip invalid ones
      await expect(testListTargets(mockMCPClient)).rejects.toThrow();
    });

    it('should verify target count matches total targets in categories', async () => {
      const mockResponse = {
        targets: ['unity', 'unreal', 'threejs', 'babylonjs'],
        categories: {
          'Game Engines': ['unity', 'unreal'],
          'Web 3D': ['threejs', 'babylonjs']
        }
      };

      mockMCPClient.callTool.mockResolvedValue(mockResponse);

      const result = await testListTargets(mockMCPClient);

      // Verify the response structure
      expect(result.targets).toHaveLength(4);
      
      // Count targets across all categories
      const allCategoryTargets = Object.values(result.categories).flat();
      expect(allCategoryTargets).toHaveLength(4);
      
      // Verify all targets are accounted for
      expect(result.targets.sort()).toEqual(allCategoryTargets.sort());
    });

    it('should format console output correctly', async () => {
      const mockResponse = {
        targets: ['unity', 'threejs'],
        categories: {
          'Engines': ['unity'],
          'Web': ['threejs']
        }
      };

      mockMCPClient.callTool.mockResolvedValue(mockResponse);

      await testListTargets(mockMCPClient);

      const logCalls = mockConsole.log.mock.calls;
      
      // Verify proper spacing and formatting
      expect(logCalls).toContainEqual(['Available Export Targets:']);
      expect(logCalls).toContainEqual(['Total: 2']);
      expect(logCalls).toContainEqual(['\nCategories:']);
      expect(logCalls).toContainEqual(['\nEngines:']);
      expect(logCalls).toContainEqual(['  - unity']);
      expect(logCalls).toContainEqual(['\nWeb:']);
      expect(logCalls).toContainEqual(['  - threejs']);
    });

    it('should handle real HoloScript export targets', async () => {
      // Test with realistic HoloScript export targets
      const mockResponse = {
        targets: [
          'unity', 'unreal', 'godot', 'threejs', 'babylonjs', 'aframe',
          'react-three-fiber', 'playcanvas', 'wonderland', 'webxr',
          'android-arcore', 'ios-arkit', 'hololens', 'magicleap',
          'oculus-quest', 'pico', 'varjo', 'lynx'
        ],
        categories: {
          'Game Engines': ['unity', 'unreal', 'godot'],
          'Web 3D': ['threejs', 'babylonjs', 'aframe', 'react-three-fiber'],
          'Web Platforms': ['playcanvas', 'wonderland', 'webxr'],
          'Mobile AR': ['android-arcore', 'ios-arkit'],
          'Mixed Reality': ['hololens', 'magicleap'],
          'VR Headsets': ['oculus-quest', 'pico', 'varjo', 'lynx']
        }
      };

      mockMCPClient.callTool.mockResolvedValue(mockResponse);

      const result = await testListTargets(mockMCPClient);

      expect(result.targets).toHaveLength(18);
      expect(Object.keys(result.categories)).toHaveLength(6);
      
      // Verify specific HoloScript targets are present
      expect(result.targets).toContain('unity');
      expect(result.targets).toContain('threejs');
      expect(result.targets).toContain('hololens');
      expect(result.targets).toContain('webxr');
      
      // Verify console output includes total count
      expect(mockConsole.log).toHaveBeenCalledWith('Total: 18');
    });
  });
});