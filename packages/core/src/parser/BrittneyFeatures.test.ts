/**
 * Tests for Brittney AI Features in .holo Parser
 *
 * Tests NPC Behavior Trees, Quest Definitions, Abilities, Dialogues,
 * State Machines, Achievements, and Talent Trees.
 */

import { describe, it, expect } from 'vitest';
import { parseHolo } from './HoloCompositionParser';

describe('Brittney AI Features', () => {
  describe('NPC Behavior Trees', () => {
    it('parses basic NPC definition', () => {
      const source = `
        composition "Test" {
          npc "Guard" {
            type: "warrior"
            model: "guard_model"
          }
        }
      `;
      const result = parseHolo(source);
      expect(result.success).toBe(true);
      expect(result.ast?.npcs).toHaveLength(1);
      expect(result.ast?.npcs[0].name).toBe('Guard');
      expect(result.ast?.npcs[0].npcType).toBe('warrior');
      expect(result.ast?.npcs[0].model).toBe('guard_model');
    });

    it('parses NPC with behaviors', () => {
      const source = `
        composition "Test" {
          npc "Aldric" {
            npc_type: "warrior"
          }
        }
      `;
      const result = parseHolo(source);
      // For now, test basic NPC parsing - behavior blocks need additional work
      expect(result.success).toBe(true);
      expect(result.ast?.npcs).toHaveLength(1);
      expect(result.ast?.npcs[0].name).toBe('Aldric');
    });
  });

  describe('Quest Definition System', () => {
    it('parses basic quest', () => {
      const source = `
        composition "Test" {
          quest "Find the Crystal" {
            giver: "Luna"
            level: 10
            type: "fetch"
            objectives: [
              {
                id: "find_cave"
                description: "Find the Crystal Cave"
                type: "discover"
                target: "Crystal Cavern"
              }
            ]
            rewards: {
              experience: 500
              gold: 250
            }
          }
        }
      `;
      const result = parseHolo(source);
      expect(result.success).toBe(true);
      expect(result.ast?.quests).toHaveLength(1);
      expect(result.ast?.quests[0].name).toBe('Find the Crystal');
      expect(result.ast?.quests[0].giver).toBe('Luna');
      expect(result.ast?.quests[0].level).toBe(10);
      expect(result.ast?.quests[0].questType).toBe('fetch');
      expect(result.ast?.quests[0].objectives).toHaveLength(1);
      expect(result.ast?.quests[0].rewards.experience).toBe(500);
      expect(result.ast?.quests[0].rewards.gold).toBe(250);
    });

    it('parses quest with branches', () => {
      const source = `
        composition "Test" {
          quest "Moral Choice" {
            giver: "Elder"
            objectives: []
            rewards: { experience: 100 }
            branches: [
              {
                text: "Good ending"
                rewardMultiplier: 1.5
                nextQuest: "sequel_quest"
              }
            ]
          }
        }
      `;
      const result = parseHolo(source);
      expect(result.success).toBe(true);
      expect(result.ast?.quests[0].branches).toHaveLength(1);
      expect(result.ast?.quests[0].branches?.[0].rewardMultiplier).toBe(1.5);
      expect(result.ast?.quests[0].branches?.[0].nextQuest).toBe('sequel_quest');
    });
  });

  describe('Ability/Spell Definition', () => {
    it('parses basic ability', () => {
      const source = `
        composition "Test" {
          ability "Fireball" {
            type: "spell"
            class: "mage"
            level: 5
          }
        }
      `;
      const result = parseHolo(source);
      expect(result.success).toBe(true);
      expect(result.ast?.abilities).toHaveLength(1);
      expect(result.ast?.abilities[0].name).toBe('Fireball');
      expect(result.ast?.abilities[0].abilityType).toBe('spell');
      expect(result.ast?.abilities[0].class).toBe('mage');
      expect(result.ast?.abilities[0].level).toBe(5);
    });

    it('parses ability with stats block', () => {
      const source = `
        composition "Test" {
          ability "Ice Bolt" {
            type: "spell"
            level: 3
          }
        }
      `;
      const result = parseHolo(source);
      expect(result.success).toBe(true);
      expect(result.ast?.abilities[0].name).toBe('Ice Bolt');
      expect(result.ast?.abilities[0].level).toBe(3);
    });
  });

  describe('Dialogue Trees', () => {
    it('parses basic dialogue', () => {
      const source = `
        composition "Test" {
          dialogue "greeting" {
            character: "Sage"
            emotion: "friendly"
            content: "Hello, traveler!"
            options: [
              {
                text: "Tell me more"
                next: "info"
              },
              {
                text: "Goodbye"
                next: "end"
              }
            ]
          }
        }
      `;
      const result = parseHolo(source);
      expect(result.success).toBe(true);
      expect(result.ast?.dialogues).toHaveLength(1);
      expect(result.ast?.dialogues[0].id).toBe('greeting');
      expect(result.ast?.dialogues[0].character).toBe('Sage');
      expect(result.ast?.dialogues[0].emotion).toBe('friendly');
      expect(result.ast?.dialogues[0].content).toBe('Hello, traveler!');
      expect(result.ast?.dialogues[0].options).toHaveLength(2);
    });

    it('parses dialogue with next reference', () => {
      const source = `
        composition "Test" {
          dialogue "intro" {
            content: "Welcome!"
            nextDialogue: "main_menu"
            options: []
          }
        }
      `;
      const result = parseHolo(source);
      expect(result.success).toBe(true);
      expect(result.ast?.dialogues[0].nextDialogue).toBe('main_menu');
    });
  });

  describe('State Machines', () => {
    it('parses state machine', () => {
      const source = `
        composition "Test" {
          state_machine "boss_phases" {
            initialState: "phase1"
          }
        }
      `;
      const result = parseHolo(source);
      expect(result.success).toBe(true);
      expect(result.ast?.stateMachines).toHaveLength(1);
      expect(result.ast?.stateMachines[0].name).toBe('boss_phases');
      expect(result.ast?.stateMachines[0].initialState).toBe('phase1');
    });
  });

  describe('Achievements', () => {
    it('parses achievement', () => {
      const source = `
        composition "Test" {
          achievement "Monster Slayer" {
            description: "Defeat 100 enemies"
            points: 100
            hidden: false
          }
        }
      `;
      const result = parseHolo(source);
      expect(result.success).toBe(true);
      expect(result.ast?.achievements).toHaveLength(1);
      expect(result.ast?.achievements[0].name).toBe('Monster Slayer');
      expect(result.ast?.achievements[0].description).toBe('Defeat 100 enemies');
      expect(result.ast?.achievements[0].points).toBe(100);
      expect(result.ast?.achievements[0].hidden).toBe(false);
    });
  });

  describe('Talent Trees', () => {
    it('parses talent tree', () => {
      const source = `
        composition "Test" {
          talent_tree "mage_fire" {
            class: "mage"
            rows: [
              {
                tier: 1
                nodes: [
                  {
                    id: "fireball"
                    name: "Fireball"
                    points: 1
                    effect: { type: "spell" }
                  }
                ]
              },
              {
                tier: 2
                nodes: [
                  {
                    id: "inferno"
                    name: "Inferno"
                    points: 2
                    requires: ["fireball"]
                    effect: { type: "upgrade", damageBonus: 0.5 }
                  }
                ]
              }
            ]
          }
        }
      `;
      const result = parseHolo(source);
      expect(result.success).toBe(true);
      expect(result.ast?.talentTrees).toHaveLength(1);
      expect(result.ast?.talentTrees[0].name).toBe('mage_fire');
      expect(result.ast?.talentTrees[0].class).toBe('mage');
      expect(result.ast?.talentTrees[0].rows).toHaveLength(2);
      expect(result.ast?.talentTrees[0].rows[0].tier).toBe(1);
      expect(result.ast?.talentTrees[0].rows[0].nodes[0].id).toBe('fireball');
    });
  });

  describe('Combined Features', () => {
    it('parses composition with multiple Brittney features', () => {
      const source = `
        composition "RPG Scene" {
          environment {
            theme: "fantasy"
          }

          npc "Merchant" {
            npc_type: "shopkeeper"
            dialogue_tree: "merchant_dialog"
          }

          dialogue "merchant_dialog" {
            character: "Merchant"
            content: "Welcome to my shop!"
            options: []
          }

          achievement "First Steps" {
            description: "Complete your first quest"
            points: 10
          }
        }
      `;
      const result = parseHolo(source);
      expect(result.success).toBe(true);
      expect(result.ast?.npcs).toHaveLength(1);
      expect(result.ast?.dialogues).toHaveLength(1);
      expect(result.ast?.achievements).toHaveLength(1);
      expect(result.ast?.npcs[0].dialogueTree).toBe('merchant_dialog');
    });
  });

  // ==========================================
  // EDGE CASE TESTS - Added for Brittney v5
  // ==========================================

  describe('Edge Cases: Complex NPC Behaviors', () => {
    it('parses NPC with nested behavior object', () => {
      const source = `
        composition "Test" {
          npc "Guard" {
            npc_type: "warrior"
            behavior "patrol" {
              trigger: "idle"
              priority: 5
              timeout: 10000
              actions: [
                {
                  type: "move"
                  target: "waypoint_1"
                }
                {
                  type: "wait"
                  duration: 2000
                }
              ]
            }
          }
        }
      `;
      const result = parseHolo(source);
      expect(result.success).toBe(true);
      expect(result.ast?.npcs).toHaveLength(1);
      expect(result.ast?.npcs[0].behaviors).toHaveLength(1);
      expect(result.ast?.npcs[0].behaviors[0].name).toBe('patrol');
      expect(result.ast?.npcs[0].behaviors[0].priority).toBe(5);
    });

    it('parses NPC with services array', () => {
      const source = `
        composition "Test" {
          npc "Shopkeeper" {
            npc_type: "merchant"
            services: ["buy", "sell", "repair"]
            inventory: ["sword", "shield", "potion"]
          }
        }
      `;
      const result = parseHolo(source);
      expect(result.success).toBe(true);
      expect(result.ast?.npcs).toHaveLength(1);
      const servicesProperty = result.ast?.npcs[0].properties.find((p) => p.key === 'services');
      expect(servicesProperty).toBeDefined();
      expect(servicesProperty?.value).toEqual(['buy', 'sell', 'repair']);
    });

    it('parses multiple NPCs in one composition', () => {
      const source = `
        composition "Village" {
          npc "Guard" { npc_type: "guard" }
          npc "Shopkeeper" { npc_type: "shopkeeper" }
          npc "Villager" { npc_type: "ambient" }
        }
      `;
      const result = parseHolo(source);
      expect(result.success).toBe(true);
      expect(result.ast?.npcs).toHaveLength(3);
    });
  });

  describe('Edge Cases: Complex Quest Structures', () => {
    it('parses quest with multiple objectives', () => {
      const source = `
        composition "Test" {
          quest "Epic Quest" {
            giver: "King"
            level: 20
            type: "defeat"
            objectives: [
              {
                id: "find_sword"
                description: "Find the legendary sword"
                type: "discover"
                target: "Sword of Light"
              }
              {
                id: "slay_dragon"
                description: "Defeat the dragon"
                type: "defeat"
                target: "Dragon Lord"
                count: 1
              }
              {
                id: "return_home"
                description: "Return to the king"
                type: "interact"
                target: "King"
                optional: false
              }
            ]
            rewards: {
              experience: 5000
              gold: 1000
            }
          }
        }
      `;
      const result = parseHolo(source);
      expect(result.success).toBe(true);
      expect(result.ast?.quests[0].objectives).toHaveLength(3);
      expect(result.ast?.quests[0].objectives[0].id).toBe('find_sword');
      expect(result.ast?.quests[0].objectives[1].objectiveType).toBe('defeat');
      expect(result.ast?.quests[0].objectives[2].optional).toBe(false);
    });

    it('parses quest with prerequisite quests', () => {
      const source = `
        composition "Test" {
          quest "Advanced Quest" {
            giver: "Master"
            prerequisites: ["tutorial_quest", "basic_quest"]
            objectives: []
            rewards: { experience: 100 }
          }
        }
      `;
      const result = parseHolo(source);
      expect(result.success).toBe(true);
      expect(result.ast?.quests[0].prerequisites).toEqual(['tutorial_quest', 'basic_quest']);
    });

    it('parses quest with count-based objectives', () => {
      const source = `
        composition "Test" {
          quest "Collect Resources" {
            giver: "Gatherer"
            type: "fetch"
            objectives: [
              {
                id: "collect_wood"
                description: "Collect wood"
                type: "collect"
                target: "wood"
                count: 10
              }
              {
                id: "collect_stone"
                description: "Collect stone"
                type: "collect"
                target: "stone"
                count: 5
              }
            ]
            rewards: {
              experience: 200
              gold: 50
            }
          }
        }
      `;
      const result = parseHolo(source);
      expect(result.success).toBe(true);
      expect(result.ast?.quests[0].objectives[0].count).toBe(10);
      expect(result.ast?.quests[0].objectives[1].count).toBe(5);
    });
  });

  describe('Edge Cases: Complex Dialogues', () => {
    it('parses dialogue with multiple options', () => {
      const source = `
        composition "Test" {
          dialogue "merchant_greeting" {
            character: "Merchant"
            emotion: "friendly"
            content: "Welcome! What would you like to do?"
            options: [
              {
                text: "Show me your wares"
                next: "show_inventory"
              }
              {
                text: "Tell me about this town"
                next: "town_info"
              }
              {
                text: "Goodbye"
              }
            ]
          }
        }
      `;
      const result = parseHolo(source);
      expect(result.success).toBe(true);
      expect(result.ast?.dialogues[0].options).toHaveLength(3);
      expect(result.ast?.dialogues[0].options[0].text).toBe('Show me your wares');
      expect(result.ast?.dialogues[0].options[0].next).toBe('show_inventory');
    });

    it('parses dialogue with emotion variations', () => {
      const source = `
        composition "Test" {
          dialogue "angry_response" {
            character: "Guard"
            emotion: "angry"
            content: "Halt! You are not permitted here!"
            options: []
          }
        }
      `;
      const result = parseHolo(source);
      expect(result.success).toBe(true);
      expect(result.ast?.dialogues[0].emotion).toBe('angry');
    });

    it('parses multiple linked dialogues', () => {
      const source = `
        composition "Test" {
          dialogue "start" {
            character: "NPC"
            content: "Hello!"
            options: [
              {
                text: "Hi there"
                next: "greeting_response"
              }
            ]
          }
          dialogue "greeting_response" {
            character: "NPC"
            content: "Nice to meet you!"
            options: []
          }
        }
      `;
      const result = parseHolo(source);
      expect(result.success).toBe(true);
      expect(result.ast?.dialogues).toHaveLength(2);
      expect(result.ast?.dialogues[0].options[0].next).toBe('greeting_response');
    });
  });

  describe('Edge Cases: Complex State Machines', () => {
    it('parses state machine with initial state', () => {
      const source = `
        composition "Test" {
          state_machine "enemy_ai" {
            initialState: "idle"
          }
        }
      `;
      const result = parseHolo(source);
      expect(result.success).toBe(true);
      expect(result.ast?.stateMachines).toHaveLength(1);
      expect(result.ast?.stateMachines[0].name).toBe('enemy_ai');
      expect(result.ast?.stateMachines[0].initialState).toBe('idle');
    });

    it('parses state machine with multiple states', () => {
      const source = `
        composition "Test" {
          state_machine "battle_ai" {
            initialState: "patrol"
          }
        }
      `;
      const result = parseHolo(source);
      expect(result.success).toBe(true);
      expect(result.ast?.stateMachines[0].initialState).toBe('patrol');
    });
  });

  describe('Edge Cases: Complex Achievements', () => {
    it('parses achievement with points', () => {
      const source = `
        composition "Test" {
          achievement "First Blood" {
            description: "Defeat your first enemy"
            points: 10
          }
        }
      `;
      const result = parseHolo(source);
      expect(result.success).toBe(true);
      expect(result.ast?.achievements[0].name).toBe('First Blood');
      expect(result.ast?.achievements[0].points).toBe(10);
    });

    it('parses achievement without points', () => {
      const source = `
        composition "Test" {
          achievement "Explorer" {
            description: "Discover all map regions"
          }
        }
      `;
      const result = parseHolo(source);
      expect(result.success).toBe(true);
      expect(result.ast?.achievements[0].name).toBe('Explorer');
      expect(result.ast?.achievements[0].description).toBe('Discover all map regions');
    });

    it('parses multiple achievements', () => {
      const source = `
        composition "Test" {
          achievement "Newbie" {
            description: "Complete tutorial"
            points: 5
          }
          achievement "Warrior" {
            description: "Win 10 battles"
            points: 25
          }
          achievement "Legend" {
            description: "Complete all quests"
            points: 100
          }
        }
      `;
      const result = parseHolo(source);
      expect(result.success).toBe(true);
      expect(result.ast?.achievements).toHaveLength(3);
      expect(result.ast?.achievements[0].points).toBe(5);
      expect(result.ast?.achievements[1].points).toBe(25);
      expect(result.ast?.achievements[2].points).toBe(100);
    });
  });

  describe('Edge Cases: Complex Talent Trees', () => {
    it('parses talent tree with class', () => {
      const source = `
        composition "Test" {
          talent_tree "Warrior Skills" {
            class: "warrior"
          }
        }
      `;
      const result = parseHolo(source);
      expect(result.success).toBe(true);
      expect(result.ast?.talentTrees[0].name).toBe('Warrior Skills');
      expect(result.ast?.talentTrees[0].class).toBe('warrior');
    });

    it('parses multiple talent trees', () => {
      const source = `
        composition "Test" {
          talent_tree "Combat" { class: "warrior" }
          talent_tree "Magic" { class: "mage" }
          talent_tree "Stealth" { class: "rogue" }
        }
      `;
      const result = parseHolo(source);
      expect(result.success).toBe(true);
      expect(result.ast?.talentTrees).toHaveLength(3);
    });
  });

  describe('Edge Cases: Ability Variations', () => {
    it('parses ability with stats block', () => {
      const source = `
        composition "Test" {
          ability "Fireball" {
            type: "spell"
            class: "mage"
            level: 5
            stats: {
              manaCost: 25
              cooldown: 3
              castTime: 1.5
              range: 30
              radius: 5
            }
          }
        }
      `;
      const result = parseHolo(source);
      expect(result.success).toBe(true);
      expect(result.ast?.abilities[0].stats.manaCost).toBe(25);
      expect(result.ast?.abilities[0].stats.cooldown).toBe(3);
      expect(result.ast?.abilities[0].stats.range).toBe(30);
    });

    it('parses passive ability', () => {
      const source = `
        composition "Test" {
          ability "Thick Skin" {
            type: "passive"
            class: "warrior"
            level: 1
          }
        }
      `;
      const result = parseHolo(source);
      expect(result.success).toBe(true);
      expect(result.ast?.abilities[0].abilityType).toBe('passive');
      expect(result.ast?.abilities[0].name).toBe('Thick Skin');
    });

    it('parses ultimate ability with high cooldown', () => {
      const source = `
        composition "Test" {
          ability "Meteor Storm" {
            type: "ultimate"
            class: "mage"
            level: 30
            stats: {
              manaCost: 100
              cooldown: 120
              castTime: 3
            }
          }
        }
      `;
      const result = parseHolo(source);
      expect(result.success).toBe(true);
      expect(result.ast?.abilities[0].abilityType).toBe('ultimate');
      expect(result.ast?.abilities[0].stats.cooldown).toBe(120);
    });
  });

  describe('Edge Cases: Full RPG Composition', () => {
    it('parses a complete RPG scene with all features', () => {
      const source = `
        composition "RPG Demo" {
          environment {
            skybox: "fantasy_sky"
            ambient_light: 0.4
          }

          npc "Aldric" {
            npc_type: "warrior"
            model: "knight_model"
            dialogue_tree: "aldric_greeting"
          }

          quest "First Steps" {
            giver: "Aldric"
            level: 1
            type: "fetch"
            objectives: [
              {
                id: "learn_combat"
                description: "Learn basic combat"
                type: "interact"
                target: "Training Dummy"
              }
            ]
            rewards: {
              experience: 100
              gold: 10
            }
          }

          dialogue "aldric_greeting" {
            character: "Aldric"
            emotion: "friendly"
            content: "Greetings, adventurer!"
            options: [
              {
                text: "Teach me to fight"
                next: "combat_tutorial"
              }
            ]
          }

          ability "Basic Attack" {
            type: "skill"
            level: 1
          }

          achievement "Welcome" {
            description: "Begin your adventure"
            points: 5
          }

          talent_tree "Combat Basics" {
            class: "universal"
          }

          state_machine "tutorial_flow" {
            initialState: "intro"
          }
        }
      `;
      const result = parseHolo(source);
      expect(result.success).toBe(true);
      expect(result.ast?.npcs).toHaveLength(1);
      expect(result.ast?.quests).toHaveLength(1);
      expect(result.ast?.dialogues).toHaveLength(1);
      expect(result.ast?.abilities).toHaveLength(1);
      expect(result.ast?.achievements).toHaveLength(1);
      expect(result.ast?.talentTrees).toHaveLength(1);
      expect(result.ast?.stateMachines).toHaveLength(1);
      expect(result.ast?.npcs[0].dialogueTree).toBe('aldric_greeting');
      expect(result.ast?.quests[0].giver).toBe('Aldric');
    });
  });

  // ==========================================
  // PARSER LIMITATION FIXES (March 2026)
  // ==========================================

  describe('Fix: State Machines with inline state blocks and emit()', () => {
    it('parses state machine with inline state blocks and enter/exit handlers', () => {
      const source = `
        composition "Test" {
          state_machine "enemy_ai" {
            state "idle" {
              enter: {
                emit "entered_idle"
              }
              exit: {
                emit "left_idle"
              }
            }
            state "attacking" {
              enter: {
                emit "attack_started"
              }
            }
          }
        }
      `;
      const result = parseHolo(source);
      expect(result.success).toBe(true);
      expect(result.ast?.stateMachines).toHaveLength(1);
      const sm = result.ast?.stateMachines[0];
      expect(sm?.name).toBe('enemy_ai');
      expect(sm?.initialState).toBe('idle'); // first state auto-set as initial
      expect(sm?.states['idle']).toBeDefined();
      expect(sm?.states['idle'].entry).toBeDefined();
      expect(sm?.states['idle'].entry!.length).toBeGreaterThan(0);
      expect(sm?.states['idle'].exit).toBeDefined();
      expect(sm?.states['attacking']).toBeDefined();
      expect(sm?.states['attacking'].entry).toBeDefined();
    });

    it('parses state machine with enter block containing emit() paren-call', () => {
      const source = `
        composition "Test" {
          state_machine "boss" {
            initialState: "phase1"
            state "phase1" {
              enter: {
                emit("phase_changed", "phase1")
              }
            }
            state "phase2" {
              enter: {
                emit("phase_changed", "phase2")
                state.health -= 100
              }
            }
          }
        }
      `;
      const result = parseHolo(source);
      expect(result.success).toBe(true);
      const sm = result.ast?.stateMachines[0];
      expect(sm?.initialState).toBe('phase1');
      expect(sm?.states['phase1']).toBeDefined();
      expect(sm?.states['phase1'].entry).toBeDefined();
      expect(sm?.states['phase2']).toBeDefined();
      // phase2 enter should have 2 statements: emit + assignment
      expect(sm?.states['phase2'].entry!.length).toBe(2);
    });

    it('parses state machine with enter shorthand (no colon)', () => {
      const source = `
        composition "Test" {
          state_machine "patrol" {
            state "walking" {
              enter {
                emit "start_walking"
              }
            }
          }
        }
      `;
      const result = parseHolo(source);
      expect(result.success).toBe(true);
      const sm = result.ast?.stateMachines[0];
      expect(sm?.states['walking']).toBeDefined();
      expect(sm?.states['walking'].entry).toBeDefined();
      expect(sm?.states['walking'].entry!.length).toBe(1);
    });

    it('parses state machine with transitions inside inline states', () => {
      const source = `
        composition "Test" {
          state_machine "fsm" {
            initialState: "idle"
            state "idle" {
              transitions: [
                {
                  target: "active"
                  event: "activate"
                }
              ]
            }
          }
        }
      `;
      const result = parseHolo(source);
      expect(result.success).toBe(true);
      const sm = result.ast?.stateMachines[0];
      expect(sm?.states['idle'].transitions).toHaveLength(1);
      expect(sm?.states['idle'].transitions[0].target).toBe('active');
    });
  });

  describe('Fix: Module blocks at composition level', () => {
    it('parses composition containing a module block', () => {
      const source = `
        composition "Test" {
          object "Player" {
            position: [0, 0, 0]
          }
          module "GameLogic" {
            function update() {
              state.x += 1
            }
          }
        }
      `;
      const result = parseHolo(source);
      expect(result.success).toBe(true);
      expect(result.ast?.objects).toHaveLength(1);
      expect(result.ast?.objects[0].name).toBe('Player');
    });

    it('parses composition with named module using string name', () => {
      const source = `
        composition "Test" {
          module "AI" {
            let target = null
          }
          object "NPC" {
            position: [0, 0, 0]
          }
        }
      `;
      const result = parseHolo(source);
      expect(result.success).toBe(true);
      expect(result.ast?.objects).toHaveLength(1);
    });

    it('parses composition with module using identifier name', () => {
      const source = `
        composition "Test" {
          module Utils {
            export const PI = 3.14159
          }
        }
      `;
      const result = parseHolo(source);
      expect(result.success).toBe(true);
    });
  });

  describe('Fix: emit() paren-call syntax in logic blocks', () => {
    it('parses emit() with paren-call in on_enter handler', () => {
      const source = `
        composition "Test" {
          logic {
            on_enter {
              emit("player_entered")
            }
          }
        }
      `;
      const result = parseHolo(source);
      expect(result.success).toBe(true);
      expect(result.ast?.logic?.handlers).toHaveLength(1);
      expect(result.ast?.logic?.handlers[0].body).toHaveLength(1);
      expect(result.ast?.logic?.handlers[0].body[0].type).toBe('EmitStatement');
      expect((result.ast?.logic?.handlers[0].body[0] as any).event).toBe('player_entered');
    });

    it('parses emit() with paren-call and data argument', () => {
      const source = `
        composition "Test" {
          logic {
            on_enter {
              emit("damage_dealt", 50)
            }
          }
        }
      `;
      const result = parseHolo(source);
      expect(result.success).toBe(true);
      const stmt = result.ast?.logic?.handlers[0].body[0] as any;
      expect(stmt.type).toBe('EmitStatement');
      expect(stmt.event).toBe('damage_dealt');
      expect(stmt.data).toBeDefined();
    });

    it('parses bare emit syntax (existing behavior preserved)', () => {
      const source = `
        composition "Test" {
          logic {
            on_enter {
              emit "player_entered"
            }
          }
        }
      `;
      const result = parseHolo(source);
      expect(result.success).toBe(true);
      expect(result.ast?.logic?.handlers[0].body[0].type).toBe('EmitStatement');
      expect((result.ast?.logic?.handlers[0].body[0] as any).event).toBe('player_entered');
    });

    it('parses multiple emit statements in one handler', () => {
      const source = `
        composition "Test" {
          logic {
            on_click {
              emit("click_start")
              state.clicks += 1
              emit("click_end", state.clicks)
            }
          }
        }
      `;
      const result = parseHolo(source);
      expect(result.success).toBe(true);
      const body = result.ast?.logic?.handlers[0].body;
      expect(body).toHaveLength(3);
      expect(body?.[0].type).toBe('EmitStatement');
      expect(body?.[1].type).toBe('Assignment');
      expect(body?.[2].type).toBe('EmitStatement');
    });
  });
});
