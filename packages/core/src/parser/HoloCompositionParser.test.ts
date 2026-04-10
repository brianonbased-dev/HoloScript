/**
 * Tests for .holo Composition Parser
 */

import { describe, it, expect } from 'vitest';
import { parseHolo, parseHoloStrict } from './HoloCompositionParser';

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
              state.player.position.x = 5
            }
          }
        }
      `;
      const result = parseHolo(source);
      expect(result.success).toBe(true);
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
});
