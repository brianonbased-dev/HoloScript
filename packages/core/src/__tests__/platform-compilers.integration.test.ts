/**
 * Platform Compiler Integration Tests
 *
 * End-to-end tests verifying compilation from .holo source to platform output:
 * HoloCompositionParser -> Composition -> PlatformCompiler -> Output
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { HoloCompositionParser } from '../parser/HoloCompositionParser';
import { VRChatCompiler } from '../compiler/VRChatCompiler';
import { UnrealCompiler } from '../compiler/UnrealCompiler';
import { IOSCompiler } from '../compiler/IOSCompiler';
import { AndroidCompiler } from '../compiler/AndroidCompiler';

// Mock RBAC to bypass security checks (this test validates compiler OUTPUT, not security)
vi.mock('../compiler/identity/AgentRBAC', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../compiler/identity/AgentRBAC')>();
  return {
    ...actual,
    getRBAC: () => ({
      checkAccess: () => ({ allowed: true, agentRole: 'code_generator' }),
    }),
  };
});

describe('Platform Compiler Integration Tests', () => {
  let parser: HoloCompositionParser;

  beforeEach(() => {
    parser = new HoloCompositionParser();
  });

  // Sample HoloScript source for testing
  const sampleHoloSource = `
    composition "TestScene" {
      environment {
        skybox: "night"
        ambient_light: 0.4
      }

      template "InteractiveObject" {
        @grabbable
        @collidable
        geometry: "cube"
        color: "#00ffff"
        
        state {
          activated: false
        }
      }

      object "TestCube" using "InteractiveObject" {
        position: [0, 1, -2]
        scale: [0.5, 0.5, 0.5]
      }

      object "StaticPlatform" {
        geometry: "cube"
        position: [0, 0, 0]
        scale: [5, 0.2, 5]
        color: "#333333"
      }

      light "MainLight" {
        type: "directional"
        color: "#ffffff"
        intensity: 1.0
        rotation: [-45, 30, 0]
      }
    }
  `;

  describe('HoloParser -> VRChatCompiler Pipeline', () => {
    it('should parse HoloScript and compile to VRChat UdonSharp', () => {
      const parseResult = parser.parse(sampleHoloSource);
      expect(parseResult.success).toBe(true);
      expect(parseResult.ast).toBeDefined();

      const compiler = new VRChatCompiler({ namespace: 'TestWorld' });
      const result = compiler.compile(parseResult.ast!, 'test-token');

      expect(result.mainScript).toBeDefined();
      expect(result.mainScript).toContain('using UdonSharp');
      expect(result.mainScript).toContain('namespace TestWorld');
      expect(result.mainScript).toContain('TestCube');
    });

    it('should include VRChat SDK imports', () => {
      const parseResult = parser.parse(sampleHoloSource);
      const compiler = new VRChatCompiler();
      const result = compiler.compile(parseResult.ast!, 'test-token');

      expect(result.mainScript).toContain('VRC.SDKBase');
      expect(result.mainScript).toContain('VRC.Udon');
    });

    it('should generate VRChat prefab configuration', () => {
      const parseResult = parser.parse(sampleHoloSource);
      const compiler = new VRChatCompiler();
      const result = compiler.compile(parseResult.ast!, 'test-token');

      expect(result.prefabHierarchy).toBeDefined();
      expect(result.prefabHierarchy).toContain('TestScene');
    });
  });

  describe('HoloParser -> UnrealCompiler Pipeline', () => {
    it('should parse HoloScript and compile to Unreal C++', () => {
      const parseResult = parser.parse(sampleHoloSource);
      expect(parseResult.success).toBe(true);

      const compiler = new UnrealCompiler({ moduleName: 'TestModule' });
      const result = compiler.compile(parseResult.ast!, 'test-token');

      expect(result.headerFile).toBeDefined();
      expect(result.sourceFile).toBeDefined();
      expect(result.headerFile).toContain('#pragma once');
      expect(result.headerFile).toContain('UCLASS');
      expect(result.sourceFile).toContain('#include');
    });

    it('should include Unreal Engine headers', () => {
      const parseResult = parser.parse(sampleHoloSource);
      const compiler = new UnrealCompiler();
      const result = compiler.compile(parseResult.ast!, 'test-token');

      expect(result.headerFile).toContain('CoreMinimal.h');
    });

    it('should generate proper Unreal class hierarchy', () => {
      const parseResult = parser.parse(sampleHoloSource);
      const compiler = new UnrealCompiler({ className: 'ATestSceneActor' });
      const result = compiler.compile(parseResult.ast!, 'test-token');

      expect(result.headerFile).toContain('ATestSceneActor');
      expect(result.headerFile).toContain('AActor');
    });
  });

  describe('HoloParser -> IOSCompiler Pipeline', () => {
    it('should parse HoloScript and compile to iOS Swift', () => {
      const parseResult = parser.parse(sampleHoloSource);
      expect(parseResult.success).toBe(true);

      const compiler = new IOSCompiler();
      const result = compiler.compile(parseResult.ast!, 'test-token');

      expect(result.viewFile).toBeDefined();
      expect(result.viewFile).toContain('import ARKit');
      expect(result.viewFile).toContain('import SwiftUI');
    });

    it('should generate ARKit scene configuration', () => {
      const parseResult = parser.parse(sampleHoloSource);
      const compiler = new IOSCompiler();
      const result = compiler.compile(parseResult.ast!, 'test-token');

      expect(result.sceneFile).toBeDefined();
      // ARKit configuration should be in scene or view file
      expect(result.viewFile + result.sceneFile).toMatch(
        /ARSCNView|ARWorldTrackingConfiguration|ARSession/
      );
    });

    it('should handle positions in Swift', () => {
      const parseResult = parser.parse(sampleHoloSource);
      const compiler = new IOSCompiler();
      const result = compiler.compile(parseResult.ast!, 'test-token');

      // Position vectors in Swift
      expect(result.viewFile + result.sceneFile).toMatch(/SCNVector3|SIMD3|float3|position/);
    });
  });

  describe('HoloParser -> AndroidCompiler Pipeline', () => {
    it('should parse HoloScript and compile to Android Kotlin', () => {
      const parseResult = parser.parse(sampleHoloSource);
      expect(parseResult.success).toBe(true);

      const compiler = new AndroidCompiler();
      const result = compiler.compile(parseResult.ast!, 'test-token');

      expect(result.activityFile).toBeDefined();
      expect(result.activityFile).toContain('import com.google.ar');
    });

    it('should generate ARCore session setup', () => {
      const parseResult = parser.parse(sampleHoloSource);
      const compiler = new AndroidCompiler();
      const result = compiler.compile(parseResult.ast!, 'test-token');

      expect(result.activityFile).toMatch(/Session|ArSession|arSession/);
    });

    it('should include Jetpack Compose in build config when enabled', () => {
      const parseResult = parser.parse(sampleHoloSource);
      const compiler = new AndroidCompiler({ useJetpackCompose: true });
      const result = compiler.compile(parseResult.ast!, 'test-token');

      // When Jetpack Compose is enabled, build.gradle should have compose dependencies
      expect(result.buildGradle).toMatch(/compose|androidx\.compose/i);
    });
  });

  describe('Cross-Platform Consistency', () => {
    it('should preserve object names across all platforms', () => {
      const parseResult = parser.parse(sampleHoloSource);

      const vrchat = new VRChatCompiler().compile(parseResult.ast!, 'test-token');
      const unreal = new UnrealCompiler().compile(parseResult.ast!, 'test-token');
      const ios = new IOSCompiler().compile(parseResult.ast!, 'test-token');
      const android = new AndroidCompiler().compile(parseResult.ast!, 'test-token');

      // All outputs should reference TestCube
      expect(vrchat.mainScript).toContain('TestCube');
      expect(unreal.headerFile).toContain('TestCube');
      expect(ios.viewFile + ios.sceneFile).toContain('TestCube');
      expect(android.activityFile + android.nodeFactoryFile).toContain('TestCube');
    });

    it('should handle object positions', () => {
      const positionSource = `
        composition "PositionTest" {
          object "Cube" {
            geometry: "cube"
            position: [1.5, 2.0, -3.5]
          }
        }
      `;

      const parseResult = parser.parse(positionSource);

      const vrchat = new VRChatCompiler().compile(parseResult.ast!, 'test-token');
      const unreal = new UnrealCompiler().compile(parseResult.ast!, 'test-token');

      // Should mention the object
      expect(vrchat.mainScript).toContain('Cube');
      expect(unreal.headerFile).toContain('Cube');
    });
  });

  describe('Complex Scene Compilation', () => {
    const complexScene = `
      composition "ComplexWorld" {
        environment {
          skybox: "sunset"
          ambient_light: 0.3
        }

        template "Pickup" {
          @grabbable
          geometry: "sphere"
        }

        template "Platform" {
          @collidable
          geometry: "cube"
          color: "#444444"
        }

        object "Floor" using "Platform" {
          position: [0, 0, 0]
          scale: [10, 0.5, 10]
        }

        object "Ball1" using "Pickup" {
          position: [0, 2, 0]
          color: "#ff0000"
        }

        object "Ball2" using "Pickup" {
          position: [2, 2, 0]
          color: "#00ff00"
        }

        light "Sun" {
          type: "directional"
          color: "#ffffee"
          intensity: 1.2
          rotation: [-45, 30, 0]
        }
      }
    `;

    it('should compile complex scene to VRChat', () => {
      const parseResult = parser.parse(complexScene);
      expect(parseResult.success).toBe(true);

      const compiler = new VRChatCompiler();
      const result = compiler.compile(parseResult.ast!, 'test-token');

      expect(result.mainScript).toBeDefined();
      expect(result.mainScript).toContain('Ball1');
      expect(result.mainScript).toContain('Ball2');
      expect(result.mainScript).toContain('Floor');
    });

    it('should compile complex scene to Unreal', () => {
      const parseResult = parser.parse(complexScene);
      expect(parseResult.success).toBe(true);

      const compiler = new UnrealCompiler();
      const result = compiler.compile(parseResult.ast!, 'test-token');

      expect(result.headerFile).toBeDefined();
      expect(result.headerFile).toContain('Ball1');
      expect(result.headerFile).toContain('Ball2');
    });

    it('should compile complex scene to iOS', () => {
      const parseResult = parser.parse(complexScene);
      expect(parseResult.success).toBe(true);

      const compiler = new IOSCompiler();
      const result = compiler.compile(parseResult.ast!, 'test-token');

      expect(result.viewFile).toBeDefined();
      const allCode = result.viewFile + result.sceneFile;
      expect(allCode).toContain('Ball1');
      expect(allCode).toContain('Ball2');
    });

    it('should compile complex scene to Android', () => {
      const parseResult = parser.parse(complexScene);
      expect(parseResult.success).toBe(true);

      const compiler = new AndroidCompiler();
      const result = compiler.compile(parseResult.ast!, 'test-token');

      expect(result.activityFile).toBeDefined();
      const allCode = result.activityFile + result.nodeFactoryFile;
      expect(allCode).toContain('Ball1');
      expect(allCode).toContain('Ball2');
    });
  });

  describe('Error Handling', () => {
    it('should handle empty composition', () => {
      const emptySource = `
        composition "Empty" {
        }
      `;

      const parseResult = parser.parse(emptySource);
      expect(parseResult.success).toBe(true);
      if (parseResult.ast) {
        const compiler = new VRChatCompiler();
        expect(() => compiler.compile(parseResult.ast!, 'test-token')).not.toThrow();
      }
    });

    it('should handle minimal object definition', () => {
      const minimalSource = `
        composition "Minimal" {
          object "Box" {
            geometry: "cube"
          }
        }
      `;

      const parseResult = parser.parse(minimalSource);
      expect(parseResult.success).toBe(true);

      const result = new VRChatCompiler().compile(parseResult.ast!, 'test-token');
      expect(result.mainScript).toContain('Box');
    });
  });
});
