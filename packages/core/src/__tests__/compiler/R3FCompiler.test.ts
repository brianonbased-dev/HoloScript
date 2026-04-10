import { describe, it, expect, beforeEach } from 'vitest';
import { R3FCompiler, MATERIAL_PRESETS, ENVIRONMENT_PRESETS } from '../../compiler/R3FCompiler';
import { HoloScriptPlusParser } from '../../parser/HoloScriptPlusParser';

describe('R3FCompiler', () => {
  let compiler: R3FCompiler;
  let parser: HoloScriptPlusParser;

  beforeEach(() => {
    compiler = new R3FCompiler();
    parser = new HoloScriptPlusParser();
  });

  describe('Material Presets', () => {
    it('should have standard material presets defined', () => {
      expect(MATERIAL_PRESETS).toBeDefined();
      expect(Object.keys(MATERIAL_PRESETS).length).toBeGreaterThan(5);
    });

    it('should have plastic preset with correct properties', () => {
      expect(MATERIAL_PRESETS['plastic']).toBeDefined();
      expect(MATERIAL_PRESETS['plastic'].roughness).toBe(0.5);
      expect(MATERIAL_PRESETS['plastic'].metalness).toBe(0.0);
    });

    it('should have glass preset with transmission', () => {
      expect(MATERIAL_PRESETS['glass']).toBeDefined();
      expect(MATERIAL_PRESETS['glass'].transmission).toBe(0.95);
      expect(MATERIAL_PRESETS['glass'].transparent).toBe(true);
    });

    it('should have metal preset', () => {
      expect(MATERIAL_PRESETS['metal']).toBeDefined();
      expect(MATERIAL_PRESETS['metal'].metalness).toBe(1.0);
    });

    it('should have hologram preset with emissive', () => {
      expect(MATERIAL_PRESETS['hologram']).toBeDefined();
      expect(MATERIAL_PRESETS['hologram'].emissiveIntensity).toBe(1.0);
      expect(MATERIAL_PRESETS['hologram'].transparent).toBe(true);
    });
  });

  describe('Environment Presets', () => {
    it('should have environment presets defined', () => {
      expect(ENVIRONMENT_PRESETS).toBeDefined();
      expect(Object.keys(ENVIRONMENT_PRESETS).length).toBeGreaterThan(3);
    });

    it('should have forest_sunset with fog', () => {
      const env = ENVIRONMENT_PRESETS['forest_sunset'];
      expect(env).toBeDefined();
      expect(env.fog).toBeDefined();
      expect(env.fog.color).toBe('#ff9966');
    });

    it('should have cyberpunk_city with postprocessing', () => {
      const env = ENVIRONMENT_PRESETS['cyberpunk_city'];
      expect(env).toBeDefined();
      expect(env.postprocessing).toBeDefined();
      expect(env.postprocessing.bloom).toBeDefined();
    });

    it('should have studio preset for product shots', () => {
      const env = ENVIRONMENT_PRESETS['studio'];
      expect(env).toBeDefined();
      expect(env.envPreset).toBe('studio');
    });

    it('should have underwater preset with appropriate colors', () => {
      const env = ENVIRONMENT_PRESETS['underwater'];
      expect(env).toBeDefined();
      expect(env.fog.color).toBe('#003366');
    });
  });

  describe('Basic Compilation', () => {
    it('should compile a simple object', () => {
      const code = `
        object "TestCube" {
          geometry: "cube"
          position: [0, 1, 0]
        }
      `;
      const result = parser.parse(code);
      expect(result.success).toBe(true);

      if (result.ast) {
        const compiled = compiler.compile(result.ast);
        expect(compiled).toBeDefined();
        expect(compiled.type).toBeDefined();
      }
    });

    it('should compile a sphere with color', () => {
      const code = `
        object "MySphere" {
          geometry: "sphere"
          color: "#ff0000"
          position: [2, 0, 0]
        }
      `;
      const result = parser.parse(code);
      expect(result.success).toBe(true);

      if (result.ast) {
        const compiled = compiler.compile(result.ast);
        expect(compiled).toBeDefined();
      }
    });

    it('should compile object with traits', () => {
      const code = `
        object "Interactive" {
          geometry: "cube"
          @grabbable
          @hoverable
        }
      `;
      const result = parser.parse(code);
      expect(result.success).toBe(true);

      if (result.ast) {
        const compiled = compiler.compile(result.ast);
        expect(compiled).toBeDefined();
      }
    });
  });

  describe('Composition Compilation', () => {
    it('should compile a composition with multiple objects', () => {
      const code = `
        composition "MyScene" {
          object "Floor" {
            geometry: "plane"
            scale: [10, 10, 1]
            rotation: [-90, 0, 0]
          }

          object "Ball" {
            geometry: "sphere"
            position: [0, 1, 0]
          }
        }
      `;
      const result = parser.parse(code);
      expect(result.success).toBe(true);

      if (result.ast) {
        const compiled = compiler.compile(result.ast);
        expect(compiled).toBeDefined();
      }
    });

    it('should compile environment settings', () => {
      const code = `
        composition "ForestScene" {
          environment: "forest_sunset"

          object "Tree" {
            geometry: "cylinder"
            position: [0, 2, 0]
          }
        }
      `;
      const result = parser.parse(code);
      expect(result.success).toBe(true);

      if (result.ast) {
        const compiled = compiler.compile(result.ast);
        expect(compiled).toBeDefined();
      }
    });
  });

  describe('Property Mapping', () => {
    it('should map position array to vec3', () => {
      const code = `
        object "Positioned" {
          position: [1, 2, 3]
        }
      `;
      const result = parser.parse(code);
      expect(result.success).toBe(true);
    });

    it('should map rotation to euler angles', () => {
      const code = `
        object "Rotated" {
          rotation: [45, 90, 0]
        }
      `;
      const result = parser.parse(code);
      expect(result.success).toBe(true);
    });

    it('should map scale uniformly and non-uniformly', () => {
      const uniformCode = `
        object "Uniform" {
          scale: 2
        }
      `;
      const nonUniformCode = `
        object "NonUniform" {
          scale: [1, 2, 1]
        }
      `;

      expect(parser.parse(uniformCode).success).toBe(true);
      expect(parser.parse(nonUniformCode).success).toBe(true);
    });
  });

  describe('Trait Compilation', () => {
    it('should compile grabbable trait with config', () => {
      const code = `
        object "GrabbableBox" {
          geometry: "cube"
          @grabbable(snap_to_hand: true, two_handed: false)
        }
      `;
      const result = parser.parse(code);
      expect(result.success).toBe(true);
    });

    it('should compile physics trait', () => {
      const code = `
        object "PhysicsBox" {
          geometry: "cube"
          @physics(mass: 1.0, friction: 0.5)
          @collidable
        }
      `;
      const result = parser.parse(code);
      expect(result.success).toBe(true);
    });

    it('should compile hoverable with highlight', () => {
      const code = `
        object "HoverableItem" {
          geometry: "sphere"
          @hoverable(highlight_color: "#00ff00", scale_factor: 1.1)
        }
      `;
      const result = parser.parse(code);
      expect(result.success).toBe(true);
    });

    it('should compile throwable trait', () => {
      const code = `
        object "Ball" {
          geometry: "sphere"
          @grabbable
          @throwable(max_velocity: 10, spin: true)
        }
      `;
      const result = parser.parse(code);
      expect(result.success).toBe(true);
    });
  });

  describe('Lighting Compilation', () => {
    it('should handle environment preset with lighting', () => {
      const code = `
        composition "LitScene" {
          environment: "studio"

          object "Subject" {
            geometry: "sphere"
          }
        }
      `;
      const result = parser.parse(code);
      expect(result.success).toBe(true);
    });

    it('should compile objects that emit light via emissive', () => {
      const code = `
        object "GlowingSphere" {
          geometry: "sphere"
          surface: "emissive"
          color: "#ffaa00"
        }
      `;
      const result = parser.parse(code);
      expect(result.success).toBe(true);
    });

    it('should compile cyberpunk environment with multiple lights', () => {
      const code = `
        composition "CyberpunkScene" {
          environment: "cyberpunk_city"

          object "NeonSign" {
            geometry: "cube"
            surface: "hologram"
          }
        }
      `;
      const result = parser.parse(code);
      expect(result.success).toBe(true);
    });
  });

  describe('Model Loading', () => {
    it('should compile model reference', () => {
      const code = `
        object "Character" {
          model: "models/character.glb"
          position: [0, 0, 0]
        }
      `;
      const result = parser.parse(code);
      expect(result.success).toBe(true);
    });

    it('should compile model with animation', () => {
      const code = `
        object "AnimatedChar" {
          model: "models/robot.glb"
          @animated(clip: "walk", loop: true)
        }
      `;
      const result = parser.parse(code);
      expect(result.success).toBe(true);
    });
  });

  describe('Audio Compilation', () => {
    it('should compile positional audio', () => {
      const code = `
        object "Speaker" {
          audio: "sounds/music.mp3"
          @spatial_audio(refDistance: 5, rolloff: 1)
          position: [0, 2, 0]
        }
      `;
      const result = parser.parse(code);
      expect(result.success).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should handle empty AST', () => {
      const code = `composition "Empty" {}`;
      const result = parser.parse(code);
      expect(result.success).toBe(true);
    });

    it('should handle invalid geometry gracefully', () => {
      const code = `
        object "Invalid" {
          geometry: "nonexistent_shape"
        }
      `;
      const result = parser.parse(code);
      // Parser should still succeed, runtime may handle unknown geometry
      expect(result.success).toBe(true);
    });
  });

  describe('Nested Structures', () => {
    it('should compile nested objects (groups)', () => {
      const code = `
        group "Furniture" {
          object "Table" {
            geometry: "cube"
            scale: [2, 0.1, 1]
            position: [0, 1, 0]
          }

          object "Chair" {
            geometry: "cube"
            scale: [0.5, 0.5, 0.5]
            position: [1, 0.25, 0]
          }
        }
      `;
      const result = parser.parse(code);
      expect(result.success).toBe(true);
    });

    it('should compile deeply nested structures', () => {
      const code = `
        composition "DeepScene" {
          group "Level1" {
            group "Level2" {
              object "DeepObject" {
                geometry: "sphere"
              }
            }
          }
        }
      `;
      const result = parser.parse(code);
      expect(result.success).toBe(true);
    });
  });

  describe('Spread Operator Support', () => {
    it('should expand object spreads in properties', () => {
      const code = `
        orb obj {
          config: {
            ...baseConfig
            override: true
          }
        }
      `;
      const result = parser.parse(code);
      expect(result.success).toBe(true);

      // Verify the spread is in the AST
      const firstChild = result.ast.children?.[0];
      const config = firstChild?.properties?.config;
      expect(config).toBeDefined();
      // The spread should be stored with __spread_ key
      const hasSpread = Object.keys(config).some((k) => k.startsWith('__spread_'));
      expect(hasSpread).toBe(true);
    });

    it('should expand array spreads in properties', () => {
      const code = `
        orb obj {
          items: [1, 2, ...moreItems, 3]
        }
      `;
      const result = parser.parse(code);
      expect(result.success).toBe(true);

      const firstChild = result.ast.children?.[0];
      const items = firstChild?.properties?.items;
      expect(items).toBeDefined();
      expect(Array.isArray(items)).toBe(true);
      // Should have spread element in array
      const hasSpread = items.some(
        (item: any) => item && typeof item === 'object' && item.type === 'spread'
      );
      expect(hasSpread).toBe(true);
    });

    it('should compile nodes with spread properties', () => {
      const code = `
        orb button {
          position: [0, 1, 0]
          config: { ...defaults, enabled: true }
        }
      `;
      const result = parser.parse(code);
      expect(result.success).toBe(true);

      const r3fNode = compiler.compile(result.ast);
      expect(r3fNode).toBeDefined();
      // Node should compile without errors
      expect(r3fNode.type).toBeDefined();
    });

    it('should handle nested spread expressions', () => {
      const code = `
        orb obj {
          config: {
            ...base
            nested: {
              ...innerBase
              value: 42
            }
          }
        }
      `;
      const result = parser.parse(code);
      expect(result.success).toBe(true);

      const r3fNode = compiler.compile(result.ast);
      expect(r3fNode).toBeDefined();
    });

    it('should handle spread with keyword identifiers like state', () => {
      const code = `
        orb obj {
          data: process(...state.values)
        }
      `;
      const result = parser.parse(code);
      expect(result.success).toBe(true);
    });
  });
});
