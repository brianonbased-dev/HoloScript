/**
 * Tests for .holo Composition Parser
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseHolo, parseHoloStrict, tokenizeHoloSource } from './HoloCompositionParser';
import { generateHoloSource } from './HoloCompositionGenerator';

describe('HoloCompositionParser', () => {
  describe('Basic Composition', () => {
    it('parses minimal composition', () => {
      const source = `
        composition "Test" {
        }
      `;
      const result = parseHolo(source);
      expect(result.success).toBe(true);
      expect(result.ast?.type).toBe('Composition');
      expect(result.ast?.name).toBe('Test');
    });

    it('parses composition with name containing spaces', () => {
      const source = `
        composition "My Amazing World" {
        }
      `;
      const result = parseHolo(source);
      expect(result.success).toBe(true);
      expect(result.ast?.name).toBe('My Amazing World');
    });
  });

  // A file without a `composition` wrapper used to skip unknown root tokens
  // silently: `zzz qqq 123 !!!` parsed to an empty composition, success: true.
  describe('Unknown file-level input', () => {
    it('reports garbage instead of returning an empty success', () => {
      const result = parseHolo('zzz qqq 123 !!!');
      expect(result.success).toBe(false);
      expect(result.errors[0].message).toMatch(/Unexpected token at file level/);
    });

    it('reports bare unknown words, not only the junk after them', () => {
      const result = parseHolo('zzz qqq\n');
      expect(result.success).toBe(false);
      expect(result.errors[0].message).toMatch(/file level: IDENTIFIER 'zzz'/);
    });

    it('reports an unknown word block but still parses what is inside it', () => {
      const result = parseHolo('foo {\n  object "Cube" { geometry: "cube" }\n}\n');
      expect(result.success).toBe(false);
      expect(result.ast?.objects.map((o) => o.name)).toEqual(['Cube']);
    });

    it('reads the documented `nft marketplace` form as a marketplace with the nft trait', () => {
      const bare = parseHolo('nft marketplace "Art" {\n  symbol: "ART"\n}\n');
      const wrapped = parseHolo(
        'composition "C" {\n  nft marketplace "Art" {\n    symbol: "ART"\n  }\n}\n'
      );
      for (const result of [bare, wrapped]) {
        expect(result.success).toBe(true);
        const block = result.ast?.domainBlocks?.find((d) => d.name === 'Art');
        expect(block?.keyword).toBe('marketplace');
        expect(block?.traits).toContain('nft');
      }
    });

    it('names a wrapperless file from @world "Name" and keeps @version "x" as _arg0', () => {
      const result = parseHolo('@world "Weather Demo"\n@version "5.7.0"\n');
      expect(result.success).toBe(true);
      expect(result.ast?.name).toBe('Weather Demo');
      const version = result.ast?.traits?.find((t) => t.name === 'version');
      expect(version?.config).toEqual({ _arg0: '5.7.0' });
    });

    it('parses file-level particle_system as the particles synonym', () => {
      const result = parseHolo('particle_system "Rain" @looping {\n  rate: 10\n}\n');
      expect(result.success).toBe(true);
      const block = result.ast?.domainBlocks?.find((d) => d.name === 'Rain');
      expect(block?.domain).toBe('vfx');
    });

    it('accepts at file level what a composition body accepts (zone)', () => {
      const body = 'zone "Lobby" {\n  shape: "box"\n}\n';
      const wrapped = parseHolo(`composition "C" {\n${body}}\n`);
      const bare = parseHolo(body);
      expect(wrapped.success).toBe(true);
      expect(bare.success).toBe(true);
      expect(bare.ast?.zones?.map((z) => z.name)).toEqual(['Lobby']);
    });

    it('ends a file-level statement at `;`, as a composition body does', () => {
      const source = 'import "./shared.holo";\n\nobject Crate {\n  position: [2, 0, 0]\n}\n';
      for (const result of [parseHolo(source), parseHolo(`composition "C" {\n${source}}\n`)]) {
        expect(result.errors).toEqual([]);
        expect(result.success).toBe(true);
        expect(result.ast?.imports).toHaveLength(1);
        expect(result.ast?.objects.map((o) => o.name)).toEqual(['Crate']);
      }
    });

    it('still reports a `;` with no statement before it at file level', () => {
      const result = parseHolo(';\nobject Crate {\n  position: [2, 0, 0]\n}\n');
      expect(result.success).toBe(false);
      expect(result.errors[0].message).toMatch(/file level: SEMICOLON/);
    });

    it('still parses a valid wrapperless file cleanly', () => {
      const result = parseHolo('object "Ball" {\n  position: [0, 1, 0]\n}\n');
      expect(result.success).toBe(true);
      expect(result.errors).toEqual([]);
    });
  });

  describe('Environment', () => {
    it('parses environment block', () => {
      const source = `
        composition "Test" {
          environment {
            theme: "spaceship"
            skybox: "nebula"
            ambient_light: 0.5
          }
        }
      `;
      const result = parseHolo(source);
      expect(result.success).toBe(true);
      expect(result.ast?.environment).toBeDefined();
      expect(result.ast?.environment?.properties).toHaveLength(3);
    });

    it('parses particle system', () => {
      const source = `
        composition "Test" {
          environment {
            particle_system "stardust" {
              count: 200
              spread: 50
              speed: 0.1
            }
          }
        }
      `;
      const result = parseHolo(source);
      expect(result.success).toBe(true);
      const ps = result.ast?.environment?.properties.find((p) => p.key === 'stardust');
      expect(ps).toBeDefined();
    });
  });

  describe('Comma-separated block members', () => {
    it('parses JSON-style composition-level properties', () => {
      const source = `
        composition PhysicsIntegrationDemo {
          version: "1.0",
          metadata: { name: "Demo", tags: ["physics", "demo"] },
          world_settings: {
            physics: { gravity: { x: 0, y: -9.81, z: 0 }, max_substeps: 4 },
            renderer: { shadows: true, antialias: true },
          },
        }
      `;

      const result = parseHolo(source);

      expect(result.success).toBe(true);
      expect(result.errors).toEqual([]);
      expect(result.ast?.name).toBe('PhysicsIntegrationDemo');
    });

    it('parses inline comma-separated environment, light, and object properties', () => {
      const source = `
        composition "Comma Props" {
          environment { skybox: "gradient", ambient_light: 0.35, shadows: true, }
          light "Sun" { type: "directional", position: [5, 8, 3], intensity: 1.0, color: "#fff5e6", castShadow: true, }
          object "Orb" { geometry: "sphere", position: [0, 1.5, -2], scale: 0.3, material: { baseColor: "#00ffff", roughness: 0.25, metallic: 0.4 }, state { role: "orb", active: true, }, }
        }
      `;

      const result = parseHolo(source);

      expect(result.success).toBe(true);
      expect(result.errors).toEqual([]);
      expect(result.ast?.environment?.properties).toHaveLength(3);
      expect(result.ast?.lights).toHaveLength(1);
      expect(result.ast?.objects).toHaveLength(1);
      expect(result.ast?.objects[0].state?.properties).toHaveLength(2);
    });

    it('parses comma-separated dialogue option fields', () => {
      const source = `
        composition "Dialogue Options" {
          dialogue "greta_greeting" {
            character: "Greta",
            content: "Welcome back.",
            options: [
              { text: "Trade", next: "shop" },
              { text: "Leave", next: "end" },
            ],
          }
        }
      `;

      const result = parseHolo(source);

      expect(result.success).toBe(true);
      expect(result.errors).toEqual([]);
      expect(result.ast?.dialogues).toHaveLength(1);
      expect(result.ast?.dialogues[0].options.map((option) => option.next)).toEqual([
        'shop',
        'end',
      ]);
    });

    it('parses comma-separated domain block properties', () => {
      const source = `
        composition "Shader Config" {
          shader "PredictShader" {
            language: "wgsl",
            stage: "compute",
            workgroup_size: 256,
          }
        }
      `;

      const result = parseHolo(source);

      expect(result.success).toBe(true);
      expect(result.errors).toEqual([]);
      expect(result.ast?.domainBlocks?.[0].properties.language).toBe('wgsl');
    });
  });

  describe('Semicolon-separated block members', () => {
    it('parses semicolon-separated object, state, trait, and object-value properties', () => {
      const source = `
        composition "Semicolon Props" {
          environment { skybox: "gradient"; ambient_light: 0.35; shadows: true; }

          object "Marker" {
            @cultural_trace { traceType: "artifact"; intensity: 0.8; decayRate: 0 }
            position: [-20, 0, 0]; geometry: "cylinder"; scale: [15, 0.1, 15]
            material: { baseColor: "#d4a574"; opacity: 0.3 }
            state { resources_shared: 0; sops_formed: 0; }
          }

          template "Agent" {
            @tenant { tenantId: "city_001"; role: "steward"; rbac: true }
            geometry: "humanoid"; color: "#3498db"; scale: [0.8, 1.6, 0.8]
            state { proposals_made: 0; district: null; }
          }
        }
      `;

      const result = parseHolo(source);

      expect(result.success).toBe(true);
      expect(result.errors).toEqual([]);
      expect(result.ast?.environment?.properties).toHaveLength(3);
      expect(result.ast?.objects[0].traits[0].config).toMatchObject({
        traceType: 'artifact',
        intensity: 0.8,
        decayRate: 0,
      });
      expect(
        result.ast?.objects[0].properties.find((property) => property.key === 'material')?.value
      ).toMatchObject({ baseColor: '#d4a574', opacity: 0.3 });
      expect(result.ast?.objects[0].state?.properties).toHaveLength(2);
      expect(result.ast?.templates[0].traits[0].config).toMatchObject({
        tenantId: 'city_001',
        role: 'steward',
        rbac: true,
      });
      expect(result.ast?.templates[0].properties.map((property) => property.key)).toEqual([
        'geometry',
        'color',
        'scale',
      ]);
      expect(result.ast?.templates[0].state?.properties).toHaveLength(2);
    });
  });

  describe('Function Helpers', () => {
    it('parses JavaScript-style function values in object literals', () => {
      const source = `
        composition "Function Values" {
          object "Tracker" {
            state {
              handlers: {
                detectExpression: function(shapes) {
                  const jawOpen = shapes.jawOpen || 0;
                  return jawOpen;
                }
              }
            }
          }
        }
      `;

      const result = parseHolo(source);

      expect(result.success).toBe(true);
      expect(result.errors).toEqual([]);
      expect(result.ast?.objects[0].state?.properties[0].value).toMatchObject({
        detectExpression: {
          type: 'FunctionValue',
          params: ['shapes'],
        },
      });
    });

    it('parses composition and logic helper function declarations', () => {
      const source = `
        composition "Function Helpers" {
          function "rgbToHex" {
            params: ["rgb"]
            logic: {
              const r = Math.round(rgb.r * 255);
              return "#fff";
            }
          }

          logic {
            function forward_kinematics(theta1, theta2) {
              const x = theta1;
              return { x, theta2 };
            }
          }
        }
      `;

      const result = parseHolo(source);

      expect(result.success).toBe(true);
      expect(result.errors).toEqual([]);
      expect(result.ast?.logic).toBeDefined();
    });
  });

  describe('Light Header Traits', () => {
    it('parses inline traits between a light name and body', () => {
      const source = `
        composition "Light Trait" {
          light "AREnvironmentLight" @light_estimation {
            type: "environment"
            apply_ambient: true
          }
        }
      `;

      const result = parseHolo(source);

      expect(result.success).toBe(true);
      expect(result.errors).toEqual([]);
      expect(result.ast?.lights[0].properties).toContainEqual({
        type: 'LightProperty',
        key: 'light_estimation',
        value: true,
      });
    });
  });

  describe('State', () => {
    it('parses state block', () => {
      const source = `
        composition "Test" {
          state {
            counter: 0
            name: "Player"
            active: true
          }
        }
      `;
      const result = parseHolo(source);
      expect(result.success).toBe(true);
      expect(result.ast?.state?.properties).toHaveLength(3);
      expect(result.ast?.state?.properties[0].key).toBe('counter');
      expect(result.ast?.state?.properties[0].value).toBe(0);
    });

    it('parses state with arrays and objects', () => {
      const source = `
        composition "Test" {
          state {
            position: [0, 1, 2]
            config: { debug: true, verbose: false }
          }
        }
      `;
      const result = parseHolo(source);
      expect(result.success).toBe(true);
      expect(result.ast?.state?.properties[0].value).toEqual([0, 1, 2]);
      expect(result.ast?.state?.properties[1].value).toEqual({ debug: true, verbose: false });
    });
  });

  describe('Templates', () => {
    it('parses template with properties', () => {
      const source = `
        composition "Test" {
          template "Enemy" {
            health: 100
            speed: 5
          }
        }
      `;
      const result = parseHolo(source);
      expect(result.success).toBe(true);
      expect(result.ast?.templates).toHaveLength(1);
      expect(result.ast?.templates[0].name).toBe('Enemy');
      expect(result.ast?.templates[0].properties).toHaveLength(2);
    });

    it('parses template with state and actions', () => {
      const source = `
        composition "Test" {
          template "Enemy" {
            state {
              health: 100
              isAlive: true
            }
            action attack(target) {
              target.health -= 10
            }
          }
        }
      `;
      const result = parseHolo(source);
      expect(result.success).toBe(true);
      expect(result.ast?.templates[0].state?.properties).toHaveLength(2);
      expect(result.ast?.templates[0].actions).toHaveLength(1);
      expect(result.ast?.templates[0].actions[0].name).toBe('attack');
    });

    it('parses async action', () => {
      const source = `
        composition "Test" {
          template "API" {
            async action fetch_data() {
              await api_call("/data")
            }
          }
        }
      `;
      const result = parseHolo(source);
      expect(result.success).toBe(true);
      expect(result.ast?.templates[0].actions[0].async).toBe(true);
    });
  });

  describe('Objects', () => {
    it('parses standalone object', () => {
      const source = `
        composition "Test" {
          object "Player" {
            position: [0, 1.6, 0]
            health: 100
          }
        }
      `;
      const result = parseHolo(source);
      expect(result.success).toBe(true);
      expect(result.ast?.objects).toHaveLength(1);
      expect(result.ast?.objects[0].name).toBe('Player');
    });

    it('parses entity names that collide with scene keyword tokens', () => {
      const source = `
        composition "Keyword Entity Names" {
          entity Camera {
            camera: { fov: 60 }
          }

          entity Light {
            light: { intensity: 1 }
          }

          entity Terrain {
            terrain: { roughness: 0.4 }
          }
        }
      `;

      const result = parseHolo(source);

      expect(result.success).toBe(true);
      expect(result.errors).toEqual([]);
      expect(result.ast?.objects.map((object) => object.name)).toEqual([
        'Camera',
        'Light',
        'Terrain',
      ]);
    });

    it('parses dotted bareword property values', () => {
      const source = `
        composition "Dotted Values" {
          object "Panel" {
            target: AppState.selectedItem
            metric: Camera.motion_blur.time_ms
          }
        }
      `;

      const result = parseHolo(source);

      expect(result.success).toBe(true);
      expect(result.errors).toEqual([]);
      expect(result.ast?.objects[0].properties).toEqual([
        { type: 'ObjectProperty', key: 'target', value: 'AppState.selectedItem' },
        { type: 'ObjectProperty', key: 'metric', value: 'Camera.motion_blur.time_ms' },
      ]);
    });

    it('parses object with using clause', () => {
      const source = `
        composition "Test" {
          object "Goblin_1" using "Enemy" {
            position: [5, 0, 10]
          }
        }
      `;
      const result = parseHolo(source);
      expect(result.success).toBe(true);
      expect(result.ast?.objects[0].template).toBe('Enemy');
    });

    it('parses nested objects', () => {
      const source = `
        composition "Test" {
          object "Ship" {
            position: [0, 0, 0]
            object "Cockpit" {
              position: [0, 2, 3]
            }
          }
        }
      `;
      const result = parseHolo(source);
      expect(result.success).toBe(true);
      expect(result.ast?.objects[0].children).toHaveLength(1);
      expect(result.ast?.objects[0].children?.[0].name).toBe('Cockpit');
    });

    it('parses instanced_object with deterministic instance metadata', () => {
      const source = `
        composition "Lotus" {
          instanced_object "Petals" {
            source_trait: @phyllotaxis
            instance_trait: @lotus_petal
            instance_count: 42
            generator: {
              anchor: "PhyllotaxisAnchor"
              golden_angle_deg: 137.50776
              seed: "0x0000DEAD"
            }
            @bloom_reactive {
              state_source: "lotus.api.bloom_state"
            }
          }
        }
      `;

      const result = parseHolo(source);
      expect(result.success).toBe(true);
      expect(result.errors).toEqual([]);

      const petals = result.ast?.objects[0];
      expect(petals?.name).toBe('Petals');
      expect(petals?.declarationKind).toBe('instanced_object');
      expect(petals?.instanceMetadata?.sourceTrait).toBe('@phyllotaxis');
      expect(petals?.instanceMetadata?.instanceTraits).toEqual(['@lotus_petal']);
      expect(petals?.instanceMetadata?.count).toBe(42);
      expect(petals?.instanceMetadata?.anchor).toBe('PhyllotaxisAnchor');
      expect(petals?.instanceMetadata?.seed).toBe('0x0000DEAD');
      expect(petals?.instanceMetadata?.generator).toEqual({
        anchor: 'PhyllotaxisAnchor',
        golden_angle_deg: 137.50776,
        seed: '0x0000DEAD',
      });
      expect(petals?.traits[0].name).toBe('bloom_reactive');
      expect(petals?.instanceMetadata?.traits[0].config.state_source).toBe('lotus.api.bloom_state');
      expect(generateHoloSource(result.ast!)).toContain('instanced_object "Petals"');
    });
  });

  describe('Spatial Groups', () => {
    it('parses spatial group with objects', () => {
      const source = `
        composition "Test" {
          spatial_group "Battlefield" {
            object "Goblin_1" using "Enemy" {
              position: [0, 0, 5]
            }
            object "Goblin_2" using "Enemy" {
              position: [3, 0, 5]
            }
          }
        }
      `;
      const result = parseHolo(source);
      expect(result.success).toBe(true);
      expect(result.ast?.spatialGroups).toHaveLength(1);
      expect(result.ast?.spatialGroups[0].objects).toHaveLength(2);
    });

    it('parses nested spatial groups', () => {
      const source = `
        composition "Test" {
          spatial_group "World" {
            spatial_group "Zone_A" {
              object "NPC_1" { position: [0, 0, 0] }
            }
            spatial_group "Zone_B" {
              object "NPC_2" { position: [10, 0, 0] }
            }
          }
        }
      `;
      const result = parseHolo(source);
      expect(result.success).toBe(true);
      expect(result.ast?.spatialGroups[0].groups).toHaveLength(2);
    });

    it('parses first-class lights nested inside spatial groups', () => {
      const source = `
        composition "LightingRig" {
          spatial_group "Lighting" {
            light "KeyLight_Sun" {
              @usd_light {
                light_type: "DistantLight"
              }
              rotation: [-45, -30, 0]
            }
          }
        }
      `;

      const result = parseHolo(source);

      expect(result.success).toBe(true);
      expect(result.errors).toEqual([]);
      expect(result.ast?.spatialGroups[0].lights?.[0].name).toBe('KeyLight_Sun');
    });
  });

  describe('Logic', () => {
    it('parses logic block with event handler', () => {
      const source = `
        composition "Test" {
          logic {
            on_enter {
              state.visitors += 1
            }
          }
        }
      `;
      const result = parseHolo(source);
      expect(result.success).toBe(true);
      expect(result.ast?.logic).toBeDefined();
      expect(result.ast?.logic?.handlers).toHaveLength(1);
      expect(result.ast?.logic?.handlers[0].event).toBe('on_enter');
    });

    it('parses event handler with parameters', () => {
      const source = `
        composition "Test" {
          logic {
            on_player_attack(enemy) {
              enemy.health -= 10
            }
          }
        }
      `;
      const result = parseHolo(source);
      expect(result.success).toBe(true);
      expect(result.ast?.logic?.handlers[0].parameters).toHaveLength(1);
      expect(result.ast?.logic?.handlers[0].parameters[0].name).toBe('enemy');
    });

    it('parses action in logic block', () => {
      const source = `
        composition "Test" {
          logic {
            action submit_form(data) {
              await api_call("/submit", data)
              return true
            }
          }
        }
      `;
      const result = parseHolo(source);
      expect(result.success).toBe(true);
      expect(result.ast?.logic?.actions).toHaveLength(1);
    });
  });

  describe('Statements', () => {
    it('parses if statement', () => {
      const source = `
        composition "Test" {
          logic {
            on_click {
              if state.active {
                state.counter += 1
              }
            }
          }
        }
      `;
      const result = parseHolo(source);
      expect(result.success).toBe(true);
      const stmt = result.ast?.logic?.handlers[0].body[0];
      expect(stmt?.type).toBe('IfStatement');
    });

    it('parses if-else statement', () => {
      const source = `
        composition "Test" {
          logic {
            on_click {
              if state.active {
                state.counter += 1
              } else {
                state.counter = 0
              }
            }
          }
        }
      `;
      const result = parseHolo(source);
      expect(result.success).toBe(true);
      const stmt = result.ast?.logic?.handlers[0].body[0];
      expect(stmt?.type).toBe('IfStatement');
      // @ts-ignore
      expect(stmt?.alternate).toBeDefined();
    });

    it('parses for loop', () => {
      const source = `
        composition "Test" {
          logic {
            on_init {
              for item in items {
                spawn(item)
              }
            }
          }
        }
      `;
      const result = parseHolo(source);
      expect(result.success).toBe(true);
      const stmt = result.ast?.logic?.handlers[0].body[0];
      expect(stmt?.type).toBe('ForStatement');
    });

    it('parses animate statement', () => {
      const source = `
        composition "Test" {
          logic {
            on_enter {
              animate "Panel" {
                scale: [1.1, 1.1, 1.1]
                duration: 0.3
              }
            }
          }
        }
      `;
      const result = parseHolo(source);
      expect(result.success).toBe(true);
      const stmt = result.ast?.logic?.handlers[0].body[0];
      expect(stmt?.type).toBe('AnimateStatement');
    });

    it('parses emit statement', () => {
      const source = `
        composition "Test" {
          logic {
            on_death {
              emit "player_died"
            }
          }
        }
      `;
      const result = parseHolo(source);
      expect(result.success).toBe(true);
      const stmt = result.ast?.logic?.handlers[0].body[0];
      expect(stmt?.type).toBe('EmitStatement');
    });
  });

  describe('Expressions', () => {
    it('parses arithmetic expressions', () => {
      const source = `
        composition "Test" {
          logic {
            on_tick {
              state.x = state.x + 1 * 2
            }
          }
        }
      `;
      const result = parseHolo(source);
      expect(result.success).toBe(true);
    });

    it('parses comparison expressions', () => {
      const source = `
        composition "Test" {
          logic {
            on_tick {
              if state.health < 0 {
                state.alive = false
              }
            }
          }
        }
      `;
      const result = parseHolo(source);
      expect(result.success).toBe(true);
    });

    it('parses method calls', () => {
      const source = `
        composition "Test" {
          logic {
            on_click {
              spawn("enemy", [0, 0, 5])
            }
          }
        }
      `;
      const result = parseHolo(source);
      expect(result.success).toBe(true);
    });

    it('parses member expressions', () => {
      const source = `
        composition "Test" {
          logic {
            on_tick {
              state.player.position[0] = 5
            }
          }
        }
      `;
      const result = parseHolo(source);
      expect(result.success).toBe(true);
    });

    it('parses null coalescing below logical OR and above conditional expressions', () => {
      const source = `
        composition "Test" {
          logic {
            action choose(a, b, fallback) {
              return a || b ?? fallback ? "present" : "missing"
            }
          }
        }
      `;
      const result = parseHolo(source);
      expect(result.success).toBe(true);
      const statement = result.ast?.logic?.actions[0].body[0];
      expect(statement?.type).toBe('ReturnStatement');
      if (
        statement?.type !== 'ReturnStatement' ||
        statement.value?.type !== 'ConditionalExpression'
      ) {
        throw new Error('expected conditional return expression');
      }
      expect(statement.value.test).toMatchObject({
        type: 'BinaryExpression',
        operator: '??',
        left: {
          type: 'BinaryExpression',
          operator: '||',
        },
      });
    });

    it('parses semicolon-separated action statements without source normalization', () => {
      const source = `
        composition "Test" {
          logic {
            action distance(a, b) {
              dx = a.x - b.x; dy = a.y - b.y; dz = a.z - b.z;
              return dx * dx + dy * dy + dz * dz
            }
          }
        }
      `;
      const result = parseHolo(source);
      expect(result.success).toBe(true);
      expect(result.ast?.logic?.actions[0].body.map((statement) => statement.type)).toEqual([
        'Assignment',
        'Assignment',
        'Assignment',
        'ReturnStatement',
      ]);
    });
  });

  describe('Imports', () => {
    it('parses import statement', () => {
      const source = `
        composition "Test" {
          import { PlayerController } from "./player.hsplus"
        }
      `;
      const result = parseHolo(source);
      expect(result.success).toBe(true);
      expect(result.ast?.imports).toHaveLength(1);
      expect(result.ast?.imports[0].source).toBe('./player.hsplus');
      expect(result.ast?.imports[0].specifiers[0].imported).toBe('PlayerController');
    });

    it('parses multiple imports', () => {
      const source = `
        composition "Test" {
          import { A, B, C } from "./module.hsplus"
        }
      `;
      const result = parseHolo(source);
      expect(result.success).toBe(true);
      expect(result.ast?.imports[0].specifiers).toHaveLength(3);
    });
  });

  describe('Comments', () => {
    it('ignores line comments', () => {
      const source = `
        // This is a comment
        composition "Test" {
          // Another comment
          state {
            x: 1 // inline comment
          }
        }
      `;
      const result = parseHolo(source);
      expect(result.success).toBe(true);
    });

    it('ignores block comments', () => {
      const source = `
        /* Block comment */
        composition "Test" {
          /* Multi
             line
             comment */
          state {
            x: 1
          }
        }
      `;
      const result = parseHolo(source);
      expect(result.success).toBe(true);
    });
  });

  describe('Full Example', () => {
    it('parses complete landing page example', () => {
      const source = `
        composition "Landing Experience" {
          environment {
            theme: "spaceship-command"
            skybox: "deep_space_nebula_4k"
            ambient_light: 0.3
            
            particle_system "stardust" {
              count: 200
              spread: 50
              speed: 0.1
            }
          }
          
          state {
            newsletter_email: ""
            form_status: "idle"
            visitors: 0
          }
          
          template "InteractivePanel" {
            size: [1.2, 0.8]
            material: "glass"
            
            state { 
              isActive: false 
            }
            
            action toggle() {
              state.isActive = !state.isActive
            }
          }
          
          spatial_group "MainHub" {
            object "WelcomePanel" using "InteractivePanel" {
              position: [0, 1.5, -3]
            }
            
            object "InfoKiosk" {
              model: "kiosk_v2"
              position: [2, 0, -2]
              interactive: true
            }
          }
          
          logic {
            on_enter {
              state.visitors += 1
              animate "WelcomePanel" { 
                scale: [1.1, 1.1, 1.1]
                duration: 0.3 
              }
            }
            
            async action submit_newsletter() {
              if validate_email(state.newsletter_email) {
                state.form_status = "submitting"
                await api_call("/newsletter/subscribe", { email: state.newsletter_email })
                state.form_status = "success"
              }
            }
          }
        }
      `;
      const result = parseHolo(source);
      expect(result.success).toBe(true);
      expect(result.ast?.name).toBe('Landing Experience');
      expect(result.ast?.environment).toBeDefined();
      expect(result.ast?.state).toBeDefined();
      expect(result.ast?.templates).toHaveLength(1);
      expect(result.ast?.spatialGroups).toHaveLength(1);
      expect(result.ast?.logic).toBeDefined();
    });

    it('parses WebGPU rigid-body example', () => {
      const source = readFileSync(
        new URL('../../../../examples/webgpu-compute/gpu-physics-rigid-body.holo', import.meta.url),
        'utf8'
      );

      const result = parseHolo(source);
      expect(result.success).toBe(true);
      expect(result.errors).toEqual([]);
      expect(result.ast?.name).toBe('GPURigidBodyPhysics');
      expect(result.ast?.domainBlocks?.some((block) => block.keyword === 'shader')).toBe(true);
      expect(result.ast?.domainBlocks?.some((block) => block.keyword === 'buffer')).toBe(true);
    });
  });

  describe('Domain Blocks', () => {
    it('parses colonless post_processing effect blocks', () => {
      const result = parseHolo(`composition "PostFX" {
        post_processing {
          bloom { intensity: 0.3, threshold: 0.9 }
          tone_mapping { mode: "aces", exposure: 1.1 }
        }
      }`);

      expect(result.success).toBe(true);
      expect(result.errors).toEqual([]);

      const block = result.ast?.domainBlocks?.find(
        (candidate) => candidate.keyword === 'post_processing'
      );
      expect(block?.properties.bloom).toEqual({ intensity: 0.3, threshold: 0.9 });
      expect(block?.properties.tone_mapping).toEqual({ mode: 'aces', exposure: 1.1 });
    });

    it('parses metadata property blocks inside explicit domain blocks', () => {
      const result = parseHolo(`composition "MetadataDomain" {
        usd_stage {
          metadata: {
            name: "Root Stage"
            export_target: "usd"
          }
          animation_clip {
            metadata: {
              source: "take_01"
            }
          }
        }
      }`);

      expect(result.success).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('parses metadata properties inside implicit web3 domain blocks', () => {
      const result = parseHolo(`nft marketplace "ArtisticCreations" {
        contract "ArtisticNFT" {
          symbol: "ART"
          metadata: {
            baseURI: "ipfs://collection/"
            dynamic: true
          }
        }
      }`);

      expect(result.success).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('parses labeled and traited custom domain property blocks', () => {
      const result = parseHolo(`agent "SensorAgent" @agent @iot {
        capability "collect" @analyze @iot {
          description: "Collect raw sensor telemetry"
          domain: "iot"
        }
        endpoint @local {
          protocol: "local"
          primary: true
        }
      }`);

      expect(result.success).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('parses labeled property blocks inside block configs', () => {
      const result = parseHolo(`plugin "WeatherPlugin" {
        tools {
          tool "get_weather" {
            description: "Get current weather for a location"
            params: {
              latitude: number
              longitude: number
            }
          }
        }
      }`);

      expect(result.success).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('parses behavior blocks in templates as labeled directives', () => {
      const result = parseHolo(`composition "IndustrialStarter" {
        template "TelemetrySensor" {
          state {
            reading: 0
          }
          behavior "DigitalTwin" {
            dtId: ""
            telemetry: {
              value: { unit: "", live: true }
            }
          }
        }
      }`);

      expect(result.success).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('parses behavior as a colon property inside object bodies', () => {
      const result = parseHolo(`composition "RoboticsStarter" {
        object "J1" {
          behavior: {
            axis: [0, 1, 0]
            maxTorque: 150.0
          }
        }
      }`);

      expect(result.success).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('parses primitive shape names as colon properties inside domain blocks', () => {
      const result = parseHolo(`input "GestureStarter" {
        system "GestureClassifier" {
          type: "gesture-recognition"
          model: "mediapipe-hands"
          updateRate: 30
        }
      }`);

      expect(result.success).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('parses action as a colon property inside object bodies', () => {
      const result = parseHolo(`composition "PortalOverlay" {
        object "exit_button" @pointable @glowing {
          geometry: "box"
          action: "close_portal"
        }
      }`);

      expect(result.success).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('parses keyword trait names on norm blocks', () => {
      const result = parseHolo(`composition "Governance" {
        norm "QuietInGallery" @norm {
          lifecycle: constituted
          scope: zone:ModernArtGallery
          representation {
            visual: "muted_icon"
          }
          condition {
            when: state.userPreferences.accessibilityReducedMotion == true
          }
          sanction {
            violation: "loud_speech"
            severity: low
          }
        }
      }`);

      expect(result.success).toBe(true);
      expect(result.errors).toEqual([]);
      expect(result.ast?.norms?.[0]?.traits).toEqual(['norm']);
      expect(result.ast?.norms?.[0]?.properties.scope).toBe('zone:ModernArtGallery');
      expect(result.ast?.norms?.[0]?.properties.sanction).toEqual({
        violation: 'loud_speech',
        severity: 'low',
      });
      expect(result.ast?.norms?.[0]?.properties.condition).toEqual({
        when: 'state.userPreferences.accessibilityReducedMotion == true',
      });
    });

    it('parses keyword trait names on metanorm blocks', () => {
      const result = parseHolo(`composition "Governance" {
        metanorm "NormAmendmentProcess" @governance {
          description: "Rules governing how existing norms can be amended"
          applies_to: "all_norms"
          rules {
            amendment_quorum: 0.75
          }
        }
      }`);

      expect(result.success).toBe(true);
      expect(result.errors).toEqual([]);
      expect(result.ast?.metanorms?.[0]?.traits).toEqual(['governance']);
    });

    it('parses trait directives inside nested custom domain block configs', () => {
      const result = parseHolo(`composition "Classroom" {
        group "Station2_DataExplorer" {
          group "ScatterPlot" {
            @scatter_plot { size: "proportional" }
            position: { x: 0, y: 1.2, z: 0 }
          }
        }
      }`);

      expect(result.success).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('keeps parenthesized trait configs from consuming following block tokens', () => {
      const result = parseHolo(`composition "Physics" {
        object "VV_Floor" {
          geometry: "plane"
          @physics(type: "static")
        }

        template "ThrowableStone" {
          @throwable(velocity_scale: 1.3, release_assist: true, arc_preview: true)
          @throwable(max_speed: 20, spin_transfer: 0.5)
          @holdable(grip: "sphere", hand_pose: "relaxed_grip", haptic_on_grab: true)
          @physics
          geometry: "sphere"
        }
      }`);

      expect(result.success).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('parses string-labeled on handlers inside logic blocks', () => {
      const result = parseHolo(`composition "Tour" {
        logic {
          on "tour:start" {
            state.tourProgress = 0.1
          }
          on "navigate:exhibit" (exhibit) {
            state.currentExhibit = exhibit
          }
        }
      }`);

      expect(result.success).toBe(true);
      expect(result.errors).toEqual([]);
      expect(result.ast?.logic?.handlers.map((handler) => handler.event)).toEqual([
        'tour:start',
        'navigate:exhibit',
      ]);
    });
  });

  describe('Error Handling', () => {
    it('reports missing closing brace', () => {
      const source = `
        composition "Test" {
          state {
            x: 1
      `;
      const result = parseHolo(source);
      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('strict mode throws on error', () => {
      // Severely truncated source that can't form a valid composition
      const source = `composition`;
      expect(() => parseHoloStrict(source)).toThrow();
    });

    it('tolerant mode collects errors', () => {
      const source = `
        composition "Test" {
          state {
            x =
          }
        }
      `;
      const result = parseHolo(source);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('Event handler blocks (regression: task_1780212452397_ma1z)', () => {
    // A colonless `on_click { ... }` block used to fall through to the
    // bare-identifier case, leaving its body to leak into the object body where
    // its closing `}` was consumed as the OBJECT's closing brace — silently
    // dropping every sibling object that followed.
    it('does not drop the sibling object after a colonless on_click block', () => {
      const result = parseHolo(`composition "T" {
        object "A" { geometry: "cube" on_click { toggle_trait "glowing" } }
        object "B" { geometry: "sphere" }
      }`);
      expect(result.success).toBe(true);
      expect((result.ast?.objects ?? []).map((o) => o.name)).toEqual(['A', 'B']);
    });

    it('keeps all siblings after a spawn-at on_click block', () => {
      const result = parseHolo(`composition "T" {
        object "A" { geometry: "cube" on_click { spawn "X" at [0, 5, -3] } }
        object "B" { geometry: "sphere" }
        object "C" { geometry: "cone" }
      }`);
      expect(result.success).toBe(true);
      expect((result.ast?.objects ?? []).map((o) => o.name)).toEqual(['A', 'B', 'C']);
    });

    it('still parses the colon form on_click: { ... }', () => {
      const result = parseHolo(`composition "T" {
        object "A" { geometry: "cube" on_click: { toggle_trait "glowing" } }
        object "B" { geometry: "sphere" }
      }`);
      expect(result.success).toBe(true);
      expect((result.ast?.objects ?? []).map((o) => o.name)).toEqual(['A', 'B']);
    });
  });

  describe('Leading import + composition (regression: task_1780215900589_8zoy)', () => {
    // A top-level `import` before `composition "X"` routes to the implicit-
    // composition path; it used to skip the `composition`/name/`{` tokens and
    // flatten only the inner objects, dropping the declared name (left "implicit").
    it('preserves the composition name when an import precedes it', () => {
      const result = parseHolo(`import "x.holo"
        composition "Full" { object "A" {} object "B" {} }`);
      expect(result.success).toBe(true);
      expect(result.ast?.name).toBe('Full');
      expect(result.ast?.imports?.length).toBe(1);
      // objects folded in once (not doubled, not dropped)
      expect((result.ast?.objects ?? []).map((o) => o.name)).toEqual(['A', 'B']);
    });

    it('adopts the first composition name and merges nested blocks', () => {
      const result = parseHolo(`import "a"
        import "b"
        composition "Multi" { environment { theme: "dark" } object "P" {} }`);
      expect(result.ast?.name).toBe('Multi');
      expect(result.ast?.imports?.length).toBe(2);
      expect(result.ast?.environment).toBeDefined();
      expect((result.ast?.objects ?? []).map((o) => o.name)).toEqual(['P']);
    });

    it('still names a genuinely implicit file (no composition keyword) "implicit"', () => {
      const result = parseHolo(`object "Root" { geometry: "cube" }`);
      expect(result.ast?.name).toBe('implicit');
      expect((result.ast?.objects ?? []).map((o) => o.name)).toEqual(['Root']);
    });
  });

  describe('Behavioral IR — movement paths & reaction triggers', () => {
    it('parses a movement_path block', () => {
      const source = `composition "World" {
        movement_path patrol_route {
          mode: "patrol"
          loop: true
          speed: 2.5
          waypoints: [[0, 0, 0], [10, 0, 0], [10, 0, 10]]
          easing: "linear"
        }
      }`;
      const result = parseHolo(source);
      expect(result.success).toBe(true);
      const paths = result.ast?.movementPaths ?? [];
      expect(paths.length).toBe(1);
      expect(paths[0].type).toBe('MovementPath');
      expect(paths[0].name).toBe('patrol_route');
      expect(paths[0].mode).toBe('patrol');
      expect(paths[0].loop).toBe(true);
      expect(paths[0].speed).toBe(2.5);
      expect(Array.isArray(paths[0].waypoints)).toBe(true);
    });

    it('parses a reaction_trigger block with activate/deactivate handlers', () => {
      const source = `composition "World" {
        reaction_trigger on_player_enter {
          target: "player"
          condition: "player.level >= 5"
          cooldown: 2.0
          on_activate { emit("zone_entered") }
          on_deactivate { emit("zone_exited") }
        }
      }`;
      const result = parseHolo(source);
      expect(result.success).toBe(true);
      const triggers = result.ast?.reactionTriggers ?? [];
      expect(triggers.length).toBe(1);
      expect(triggers[0].type).toBe('ReactionTrigger');
      expect(triggers[0].name).toBe('on_player_enter');
      expect(triggers[0].target).toBe('player');
      expect(triggers[0].cooldown).toBe(2.0);
      expect(triggers[0].onActivate?.length).toBe(1);
      expect(triggers[0].onDeactivate?.length).toBe(1);
    });
  });
});

// A trait marker `@` with no name after it used to parse cleanly: `@` alone was a
// trait named "", `@` before a newline a trait named "\n", and `@` before `}` ate
// the brace as its name. Code HS1005 is from packages/core/strict/ERROR_CONTRACT.md.
describe('Trait marker with no name (HS1005)', () => {
  const MESSAGE = '`@` is not followed by a trait name.';
  const SUGGESTION = 'Write a trait as @name, for example @grabbable.';

  /** Where each `@` sits, in the lexer's own coordinates (the ones every parse error uses). */
  const atLocations = (source: string) =>
    tokenizeHoloSource(source)
      .filter((token) => token.type === 'AT')
      .map((token) => ({ line: token.line, column: token.column }));

  /** Every name the AST carries for a trait: trait nodes, domain-block traits, `@name` keys, light keys. */
  const traitNames = (node: unknown): string[] => {
    const names: string[] = [];
    const walk = (value: unknown): void => {
      if (!value || typeof value !== 'object') return;
      if (Array.isArray(value)) {
        value.forEach(walk);
        return;
      }
      const record = value as Record<string, unknown>;
      if (record.type === 'ObjectTrait' || record.type === 'trait') names.push(String(record.name));
      if (record.type === 'LightProperty') names.push(String(record.key));
      if (record.type === 'DomainBlock' && Array.isArray(record.traits)) {
        names.push(...(record.traits as unknown[]).map(String));
      }
      for (const [key, child] of Object.entries(record)) {
        if (key === 'loc') continue;
        if (key.startsWith('@')) names.push(key.slice(1));
        walk(child);
      }
    };
    walk(node);
    return names;
  };

  /** Refused in both modes, HS1005 at the given `@`, and no trait built from punctuation. */
  const expectRefused = (source: string, atIndex = 0) => {
    const result = parseHolo(source);
    expect(result.success).toBe(false);
    const missing = result.errors.filter((error) => error.code === 'HS1005');
    expect(missing.length).toBeGreaterThan(0);
    expect(missing[0]).toEqual({
      message: MESSAGE,
      suggestion: SUGGESTION,
      code: 'HS1005',
      severity: 'error',
      loc: atLocations(source)[atIndex],
    });
    for (const name of traitNames(result.ast)) {
      expect(name).toMatch(/^[A-Za-z0-9_]/);
    }
    expect(() => parseHoloStrict(source)).toThrow(MESSAGE);
    return result;
  };

  describe('refuses a nameless @', () => {
    it('`@` alone', () => {
      const result = expectRefused('@');
      expect(result.errors[0].loc?.line).toBe(1);
      expect(result.ast?.traits ?? []).toEqual([]);
    });

    it('`@` followed by a newline', () => {
      const result = expectRefused('@\n');
      expect(result.errors[0].loc?.line).toBe(1);
      expect(result.ast?.traits ?? []).toEqual([]);
    });

    it('`@` on its own line inside an object', () => {
      const result = expectRefused('object "X" {\n  @\n}');
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].loc?.line).toBe(2);
      expect(result.ast?.objects[0].traits).toEqual([]);
    });

    it('`@` between an object name and its body keeps the body', () => {
      const result = expectRefused('object "X" @ {\n  color: "red"\n}');
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].loc?.line).toBe(1);
      const object = result.ast?.objects[0];
      expect(object?.traits).toEqual([]);
      expect(object?.properties).toEqual([{ type: 'ObjectProperty', key: 'color', value: 'red' }]);
    });

    it('`@ @grabbable` refuses the first and still reads the second', () => {
      const result = expectRefused('@ @grabbable', 0);
      expect(result.errors).toHaveLength(1);
      expect(result.ast?.traits?.map((trait) => trait.name)).toEqual(['grabbable']);
    });

    it('a lone `@` right before `}` does not swallow the brace', () => {
      const result = expectRefused('object "X" {\n  @}');
      expect(result.errors).toHaveLength(1);
      expect(result.ast?.objects).toHaveLength(1);
    });

    it('a trailing `@` after a real trait keeps the real one and the brace', () => {
      const result = expectRefused('object "X" { @grabbable @ }', 1);
      expect(result.errors).toHaveLength(1);
      expect(result.ast?.objects[0].traits.map((trait) => trait.name)).toEqual(['grabbable']);
    });

    it('`@` then a blank line before an object (corpus at-without-name.holo)', () => {
      const result = expectRefused('@\n\nobject Ball {\n  position: [0, 1, 0]\n}\n');
      expect(result.errors).toHaveLength(1);
      expect(result.ast?.objects.map((object) => object.name)).toEqual(['Ball']);
    });

    it('a quoted empty name `@""`', () => {
      const result = expectRefused('object "X" {\n  @""\n}');
      expect(result.errors).toHaveLength(1);
      expect(result.ast?.objects[0].traits).toEqual([]);
    });

    it('drops the orphaned config of a nameless `@(...)` instead of cascading', () => {
      const result = expectRefused('object "X" {\n  @(mass: 2)\n  @grabbable\n}');
      expect(result.errors).toHaveLength(1);
      expect(result.ast?.objects[0].traits.map((trait) => trait.name)).toEqual(['grabbable']);
    });

    // Every place '@' introduces a trait or decorator, with `<@>` standing for the nameless one.
    const contexts: Array<[string, string]> = [
      ['file level, before an object', '<@>\nobject "A" {}'],
      ['composition body', 'composition "C" {\n  <@>\n  object "A" {}\n}'],
      ['object body after @platform', 'object "A" {\n  @platform(quest3)\n  <@>\n}'],
      ['template body', 'template "T" {\n  <@>\n}'],
      ['orb header', 'orb "O" <@> {\n}'],
      ['orb body', 'orb "O" {\n  <@>\n}'],
      ['light header', 'light "L" directional <@> {\n  intensity: 1\n}'],
      ['light body', 'light "L" {\n  <@>\n  intensity: 1\n}'],
      ['camera body', 'camera "C" {\n  <@>\n  fov: 60\n}'],
      ['audio body', 'audio "A" {\n  <@>\n  volume: 1\n}'],
      ['spatial group body', 'spatial_group "G" {\n  <@>\n  object "A" {}\n}'],
      ['primitive body', 'cube {\n  <@>\n  color: "red"\n}'],
      ['npc body', 'npc "N" {\n  <@>\n  type: "guard"\n}'],
      ['domain block header', 'iot_sensor "S" <@> {\n  unit: "C"\n}'],
      ['domain block body', 'iot_sensor "S" {\n  <@>\n  unit: "C"\n}'],
      ['loose material header', 'pbr_material "M" <@> {\n  roughness: 1\n}'],
      ['value position', 'object "A" {\n  tags: [<@>]\n}'],
      ['trait config block', 'object "A" {\n  @ui {\n    <@>\n  }\n}'],
      [
        'traited property block',
        'object "A" {\n  @ui {\n    panel <@> {\n      color: "x"\n    }\n  }\n}',
      ],
    ];
    const followers: Array<[string, string]> = [
      ['alone', '@'],
      ['with a config', '@(x: 1)'],
    ];
    for (const [where, template] of contexts) {
      for (const [how, marker] of followers) {
        it(`${where}: ${how}`, () => {
          const source = template.replace('<@>', marker);
          // The nameless '@' is the one <@> stood for: count the '@'s written before it.
          const atIndex = atLocations(template.slice(0, template.indexOf('<@>'))).length;
          expectRefused(source, atIndex);
        });
      }
    }
  });

  describe('keeps every named form', () => {
    const expectClean = (source: string) => {
      const result = parseHolo(source);
      expect(result.errors).toEqual([]);
      expect(result.success).toBe(true);
      expect(() => parseHoloStrict(source)).not.toThrow();
      return result;
    };

    it('quoted, digit-leading, keyword and chained names on an object header', () => {
      const result = expectClean(
        'object "A" @grabbable @glowing(intensity: 2) @"quoted" @2d_canvas @a @b {\n  color: "red"\n}'
      );
      expect(result.ast?.objects[0].traits.map((trait) => trait.name)).toEqual([
        'grabbable',
        'glowing',
        'quoted',
        '2d_canvas',
        'a',
        'b',
      ]);
    });

    it('the same names, configs and blocks inside an object body', () => {
      const result = expectClean(
        'object "A" {\n  @grabbable\n  @physics(mass: 2)\n  @"quoted"\n  @2d_canvas\n  @state\n  @light\n  @collider {\n    shape: "box"\n  }\n  @a @b\n}'
      );
      const traits = result.ast?.objects[0].traits ?? [];
      expect(traits.map((trait) => trait.name)).toEqual([
        'grabbable',
        'physics',
        'quoted',
        '2d_canvas',
        'state',
        'light',
        'collider',
        'a',
        'b',
      ]);
      expect(traits[1].config).toEqual({ mass: 2 });
      expect(traits[6].config).toEqual({ shape: 'box' });
    });

    it('file-level @world "Name", @version "x", @name(config) and @name { }', () => {
      const result = expectClean(
        '@world "Lobby" {\n  skybox: "night"\n}\n@version "5.7.0"\n@page(title: "Home")\n@metadata {\n  author: "x"\n}\n@2d_canvas\nobject "A" {}'
      );
      expect(result.ast?.name).toBe('Lobby');
      expect(result.ast?.traits?.map((trait) => [trait.name, trait.config])).toEqual([
        ['version', { _arg0: '5.7.0' }],
        ['page', { title: 'Home' }],
        ['metadata', { author: 'x' }],
        ['2d_canvas', {}],
      ]);
    });

    it('decorators inside a composition body', () => {
      const result = expectClean(
        'composition "C" {\n  @world {\n    skybox: "x"\n  }\n  @page(title: "t")\n  @version "1"\n  object "A" {}\n}'
      );
      expect(result.ast?.traits?.map((trait) => trait.name)).toEqual(['page', 'version']);
    });

    it('templates, orbs, lights, primitives, domain blocks and trait values', () => {
      const template = expectClean(
        'template "T" {\n  @grabbable\n  @version(2)\n  @"q"\n  @2d_canvas\n}'
      );
      expect(template.ast?.templates[0].traits.map((trait) => trait.name)).toEqual([
        'grabbable',
        'q',
        '2d_canvas',
      ]);
      expect(template.ast?.templates[0].version).toBe(2);

      const orb = expectClean(
        'orb "O" @grabbable @glowing {\n  @physics(mass: 1)\n  color: "red"\n}'
      );
      expect(orb.ast?.objects[0].traits.map((trait) => trait.name)).toEqual([
        'grabbable',
        'glowing',
        'physics',
      ]);

      const light = expectClean(
        'light "L" directional @shadow {\n  @position(1, 2, 3)\n  intensity: 1\n}'
      );
      expect(light.ast?.lights[0].properties.map((property) => property.key)).toEqual([
        'shadow',
        'position',
        'intensity',
      ]);

      const primitive = expectClean('cube {\n  @grabbable\n  @2d_canvas\n  color: "red"\n}');
      expect(primitive.ast?.objects[0].traits.map((trait) => trait.name)).toEqual([
        'grabbable',
        '2d_canvas',
      ]);

      const domain = expectClean(
        'iot_sensor "S" @networked @telemetry(rate: 2) {\n  @cors_policy\n  @auth(mode: "x")\n  unit: "C"\n}'
      );
      expect(domain.ast?.domainBlocks?.[0].traits).toEqual([
        'networked',
        'telemetry',
        'cors_policy',
        'auth',
      ]);

      const material = expectClean('pbr_material "M" @shader(x: 1) {\n  roughness: 0.5\n}');
      expect(material.ast?.domainBlocks?.[0].traits).toEqual(['shader']);

      const values = expectClean('object "A" {\n  tags: [@grabbable, @glowing]\n}');
      expect(values.ast?.objects[0].properties[0].value).toEqual(['@grabbable', '@glowing']);
    });
  });
});
