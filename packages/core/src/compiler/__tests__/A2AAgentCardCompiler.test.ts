import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  A2AAgentCardCompiler,
  type A2AAgentCard,
  type A2AAgentSkill,
} from '../A2AAgentCardCompiler';
import type { HoloComposition } from '../../parser/HoloCompositionTypes';

vi.mock('../identity/AgentRBAC', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getRBAC: () => ({ checkAccess: () => ({ allowed: true }) }),
  };
});

// Helper to build a minimal composition
function makeComposition(overrides: Partial<HoloComposition> = {}): HoloComposition {
  return {
    type: 'Composition',
    name: 'TestScene',
    templates: [],
    objects: [],
    spatialGroups: [],
    lights: [],
    imports: [],
    timelines: [],
    audio: [],
    zones: [],
    transitions: [],
    conditionals: [],
    iterators: [],
    npcs: [],
    quests: [],
    abilities: [],
    dialogues: [],
    stateMachines: [],
    achievements: [],
    talentTrees: [],
    shapes: [],
    ...overrides,
  } as HoloComposition;
}

function compileAndParse(
  compiler: A2AAgentCardCompiler,
  composition: HoloComposition
): A2AAgentCard {
  const json = compiler.compile(composition, 'test-token');
  return JSON.parse(json);
}

describe('A2AAgentCardCompiler', () => {
  let compiler: A2AAgentCardCompiler;

  beforeEach(() => {
    compiler = new A2AAgentCardCompiler();
  });

  // =========================================================================
  // Constructor / Options
  // =========================================================================

  describe('constructor and options', () => {
    it('uses default options for minimal configuration', () => {
      const card = compileAndParse(compiler, makeComposition());
      expect(card.url).toBe('http://localhost:8080');
      expect(card.version).toBe('1.0.0');
      expect(card.capabilities.streaming).toBe(false);
      expect(card.capabilities.pushNotifications).toBe(false);
      expect(card.capabilities.stateTransitionHistory).toBe(true);
      expect(card.authentication.schemes).toEqual(['none']);
      expect(card.defaultInputModes).toEqual(['text/plain', 'application/json']);
      expect(card.defaultOutputModes).toEqual(['text/plain', 'application/json']);
    });

    it('respects custom service URL', () => {
      const c = new A2AAgentCardCompiler({ serviceUrl: 'https://my-agent.example.com' });
      const card = compileAndParse(c, makeComposition());
      expect(card.url).toBe('https://my-agent.example.com');
    });

    it('respects custom agent version', () => {
      const c = new A2AAgentCardCompiler({ agentVersion: '2.5.0' });
      const card = compileAndParse(c, makeComposition());
      expect(card.version).toBe('2.5.0');
    });

    it('respects streaming capability option', () => {
      const c = new A2AAgentCardCompiler({ enableStreaming: true });
      const card = compileAndParse(c, makeComposition());
      expect(card.capabilities.streaming).toBe(true);
    });

    it('respects push notifications option', () => {
      const c = new A2AAgentCardCompiler({ enablePushNotifications: true });
      const card = compileAndParse(c, makeComposition());
      expect(card.capabilities.pushNotifications).toBe(true);
    });

    it('respects state history option', () => {
      const c = new A2AAgentCardCompiler({ enableStateHistory: false });
      const card = compileAndParse(c, makeComposition());
      expect(card.capabilities.stateTransitionHistory).toBe(false);
    });

    it('respects custom auth schemes', () => {
      const c = new A2AAgentCardCompiler({ authSchemes: ['oauth2', 'bearer'] });
      const card = compileAndParse(c, makeComposition());
      expect(card.authentication.schemes).toEqual(['oauth2', 'bearer']);
    });

    it('respects custom input/output modes', () => {
      const c = new A2AAgentCardCompiler({
        defaultInputModes: ['application/xml'],
        defaultOutputModes: ['text/html'],
      });
      const card = compileAndParse(c, makeComposition());
      expect(card.defaultInputModes).toEqual(['application/xml']);
      expect(card.defaultOutputModes).toEqual(['text/html']);
    });
  });

  // =========================================================================
  // Basic Compilation
  // =========================================================================

  describe('basic compilation', () => {
    it('compiles minimal composition to valid JSON', () => {
      const json = compiler.compile(makeComposition(), 'test-token');
      const parsed = JSON.parse(json);
      expect(parsed).toBeDefined();
      expect(parsed.name).toBeDefined();
      expect(parsed.description).toBeDefined();
      expect(parsed.url).toBeDefined();
      expect(parsed.version).toBeDefined();
      expect(parsed.capabilities).toBeDefined();
      expect(parsed.authentication).toBeDefined();
      expect(parsed.skills).toBeDefined();
      expect(Array.isArray(parsed.skills)).toBe(true);
    });

    it('generates agent name from composition name', () => {
      const card = compileAndParse(compiler, makeComposition({ name: 'MySmartAgent' }));
      expect(card.name).toBe('My Smart Agent');
    });

    it('handles underscored composition names', () => {
      const card = compileAndParse(compiler, makeComposition({ name: 'my_smart_agent' }));
      expect(card.name).toBe('My smart agent');
    });

    it('generates description including composition name', () => {
      const card = compileAndParse(compiler, makeComposition({ name: 'TestScene' }));
      expect(card.description).toContain('TestScene');
    });

    it('description includes feature counts', () => {
      const card = compileAndParse(
        compiler,
        makeComposition({
          name: 'Rich',
          templates: [
            { name: 'T1', properties: [], actions: [], traits: [] } as any,
            { name: 'T2', properties: [], actions: [], traits: [] } as any,
          ],
          objects: [{ name: 'O1', properties: [], traits: [] } as any],
        })
      );
      expect(card.description).toContain('2 template(s)');
      expect(card.description).toContain('1 object(s)');
    });
  });

  // =========================================================================
  // Provider Information
  // =========================================================================

  describe('provider information', () => {
    it('omits provider when not configured', () => {
      const card = compileAndParse(compiler, makeComposition());
      expect(card.provider).toBeUndefined();
    });

    it('includes provider when organization is set', () => {
      const c = new A2AAgentCardCompiler({
        providerOrganization: 'HoloScript Labs',
        providerUrl: 'https://holoscript.dev',
      });
      const card = compileAndParse(c, makeComposition());
      expect(card.provider).toBeDefined();
      expect(card.provider!.organization).toBe('HoloScript Labs');
      expect(card.provider!.url).toBe('https://holoscript.dev');
    });
  });

  // =========================================================================
  // Documentation URL
  // =========================================================================

  describe('documentation URL', () => {
    it('omits documentation URL when not configured', () => {
      const card = compileAndParse(compiler, makeComposition());
      expect(card.documentationUrl).toBeUndefined();
    });

    it('includes documentation URL when configured', () => {
      const c = new A2AAgentCardCompiler({
        documentationUrl: 'https://docs.holoscript.dev/agents/test',
      });
      const card = compileAndParse(c, makeComposition());
      expect(card.documentationUrl).toBe('https://docs.holoscript.dev/agents/test');
    });
  });

  // =========================================================================
  // Extensions
  // =========================================================================

  describe('extensions', () => {
    it('omits extensions when not configured', () => {
      const card = compileAndParse(compiler, makeComposition());
      expect(card.extensions).toBeUndefined();
    });

    it('includes extensions when configured', () => {
      const c = new A2AAgentCardCompiler({
        extensions: [
          {
            uri: 'https://holoscript.dev/extensions/spatial',
            description: 'Spatial computing extension',
            required: true,
          },
        ],
      });
      const card = compileAndParse(c, makeComposition());
      expect(card.extensions).toHaveLength(1);
      expect(card.extensions![0].uri).toBe('https://holoscript.dev/extensions/spatial');
      expect(card.extensions![0].required).toBe(true);
    });
  });

  // =========================================================================
  // Template -> Skills
  // =========================================================================

  describe('template skills', () => {
    it('compiles templates to skills', () => {
      const card = compileAndParse(
        compiler,
        makeComposition({
          templates: [
            {
              name: 'GlowingOrb',
              properties: [],
              actions: [{ name: 'pulse', parameters: [], body: [] }],
              traits: [{ name: 'physics', config: {} }],
            } as any,
          ],
        })
      );
      const skill = card.skills.find((s: A2AAgentSkill) => s.id === 'glowingorb');
      expect(skill).toBeDefined();
      expect(skill!.name).toBe('Glowing Orb');
      expect(skill!.tags).toContain('template');
      expect(skill!.tags).toContain('physics');
      expect(skill!.tags).toContain('interactive');
      expect(skill!.examples).toContain('Invoke pulse on GlowingOrb');
    });

    it('template with state gets stateful tag', () => {
      const card = compileAndParse(
        compiler,
        makeComposition({
          templates: [
            {
              name: 'StatefulWidget',
              properties: [],
              actions: [],
              traits: [],
              state: { properties: [{ key: 'count', value: 0 }] },
            } as any,
          ],
        })
      );
      const skill = card.skills.find((s: A2AAgentSkill) => s.id === 'statefulwidget');
      expect(skill!.tags).toContain('stateful');
    });

    it('template without actions gets default example', () => {
      const card = compileAndParse(
        compiler,
        makeComposition({
          templates: [{ name: 'BasicTemplate', properties: [], actions: [], traits: [] } as any],
        })
      );
      const skill = card.skills.find((s: A2AAgentSkill) => s.id === 'basictemplate');
      expect(skill!.examples).toContain('Create a BasicTemplate instance');
    });

    it('multiple templates produce multiple skills', () => {
      const card = compileAndParse(
        compiler,
        makeComposition({
          templates: [
            { name: 'T1', properties: [], actions: [], traits: [] } as any,
            { name: 'T2', properties: [], actions: [], traits: [] } as any,
            { name: 'T3', properties: [], actions: [], traits: [] } as any,
          ],
        })
      );
      const templateSkills = card.skills.filter((s: A2AAgentSkill) => s.tags.includes('template'));
      expect(templateSkills).toHaveLength(3);
    });
  });

  // =========================================================================
  // Object -> Skills
  // =========================================================================

  describe('object skills', () => {
    it('objects with sensor trait produce skills', () => {
      const card = compileAndParse(
        compiler,
        makeComposition({
          objects: [
            {
              name: 'TempSensor',
              properties: [],
              traits: [{ name: 'sensor', config: {} }],
            } as any,
          ],
        })
      );
      const skill = card.skills.find((s: A2AAgentSkill) => s.id === 'object_tempsensor');
      expect(skill).toBeDefined();
      expect(skill!.tags).toContain('sensor');
      expect(skill!.examples).toContain('Read sensor data from TempSensor');
    });

    it('objects with networked trait produce skills', () => {
      const card = compileAndParse(
        compiler,
        makeComposition({
          objects: [
            {
              name: 'SyncedAvatar',
              properties: [],
              traits: [{ name: 'networked', config: {} }],
            } as any,
          ],
        })
      );
      const skill = card.skills.find((s: A2AAgentSkill) => s.id === 'object_syncedavatar');
      expect(skill).toBeDefined();
      expect(skill!.tags).toContain('networked');
      expect(skill!.examples).toContain('Synchronize SyncedAvatar across network');
    });

    it('objects with ai trait produce skills', () => {
      const card = compileAndParse(
        compiler,
        makeComposition({
          objects: [
            {
              name: 'SmartBot',
              properties: [],
              traits: [{ name: 'ai', config: {} }],
            } as any,
          ],
        })
      );
      const skill = card.skills.find((s: A2AAgentSkill) => s.id === 'object_smartbot');
      expect(skill).toBeDefined();
      expect(skill!.tags).toContain('ai');
    });

    it('objects without significant traits are skipped', () => {
      const card = compileAndParse(
        compiler,
        makeComposition({
          objects: [
            {
              name: 'PlainCube',
              properties: [{ key: 'color', value: 'red' }],
              traits: [{ name: 'grabbable', config: {} }],
            } as any,
          ],
        })
      );
      const skill = card.skills.find((s: A2AAgentSkill) => s.id === 'object_plaincube');
      expect(skill).toBeUndefined();
    });

    it('objects with state produce skills even without significant traits', () => {
      const card = compileAndParse(
        compiler,
        makeComposition({
          objects: [
            {
              name: 'DataWidget',
              properties: [],
              traits: [],
              state: { properties: [{ key: 'data', value: 'test' }] },
            } as any,
          ],
        })
      );
      const skill = card.skills.find((s: A2AAgentSkill) => s.id === 'object_datawidget');
      expect(skill).toBeDefined();
      expect(skill!.tags).toContain('stateful');
    });
  });

  // =========================================================================
  // Logic -> Skills
  // =========================================================================

  describe('logic skills', () => {
    it('event handlers produce event handling skill', () => {
      const card = compileAndParse(
        compiler,
        makeComposition({
          logic: {
            type: 'Logic',
            handlers: [
              { event: 'on_click', parameters: [], body: [] } as any,
              { event: 'on_hover', parameters: [], body: [] } as any,
            ],
            actions: [],
          },
        })
      );
      const skill = card.skills.find((s: A2AAgentSkill) => s.id === 'event_handling');
      expect(skill).toBeDefined();
      expect(skill!.tags).toContain('event-handling');
      expect(skill!.tags).toContain('click');
      expect(skill!.tags).toContain('hover');
      expect(skill!.description).toContain('2 event(s)');
    });

    it('actions produce action execution skill', () => {
      const card = compileAndParse(
        compiler,
        makeComposition({
          logic: {
            type: 'Logic',
            handlers: [],
            actions: [
              { name: 'doSomething', parameters: [], body: [] } as any,
              { name: 'doOther', parameters: [], body: [] } as any,
            ],
          },
        })
      );
      const skill = card.skills.find((s: A2AAgentSkill) => s.id === 'action_execution');
      expect(skill).toBeDefined();
      expect(skill!.tags).toContain('actions');
      expect(skill!.examples).toContain('Execute doSomething');
      expect(skill!.examples).toContain('Execute doOther');
    });

    it('logic with both handlers and actions produces both skills', () => {
      const card = compileAndParse(
        compiler,
        makeComposition({
          logic: {
            type: 'Logic',
            handlers: [{ event: 'on_start', parameters: [], body: [] } as any],
            actions: [{ name: 'reset', parameters: [], body: [] } as any],
          },
        })
      );
      expect(card.skills.find((s: A2AAgentSkill) => s.id === 'event_handling')).toBeDefined();
      expect(card.skills.find((s: A2AAgentSkill) => s.id === 'action_execution')).toBeDefined();
    });
  });

  // =========================================================================
  // Spatial Groups -> Skills
  // =========================================================================

  describe('spatial skills', () => {
    it('spatial groups produce spatial coordination skill', () => {
      const card = compileAndParse(
        compiler,
        makeComposition({
          spatialGroups: [
            {
              name: 'MainArea',
              properties: [],
              objects: [
                { name: 'Obj1', properties: [], traits: [] } as any,
                { name: 'Obj2', properties: [], traits: [] } as any,
              ],
            } as any,
          ],
        })
      );
      const skill = card.skills.find((s: A2AAgentSkill) => s.id === 'spatial_coordination');
      expect(skill).toBeDefined();
      expect(skill!.tags).toContain('spatial');
      expect(skill!.tags).toContain('3d');
      expect(skill!.tags).toContain('MainArea');
      expect(skill!.description).toContain('1 spatial group(s)');
      expect(skill!.description).toContain('2 object(s)');
    });

    it('spatial skills can be disabled', () => {
      const c = new A2AAgentCardCompiler({ includeSpatialSkills: false });
      const card = compileAndParse(
        c,
        makeComposition({
          spatialGroups: [{ name: 'Group1', properties: [], objects: [] } as any],
        })
      );
      expect(
        card.skills.find((s: A2AAgentSkill) => s.id === 'spatial_coordination')
      ).toBeUndefined();
    });
  });

  // =========================================================================
  // Domain Blocks -> Skills
  // =========================================================================

  describe('domain block skills', () => {
    it('IoT domain block produces specialized skill', () => {
      const card = compileAndParse(
        compiler,
        makeComposition({
          domainBlocks: [
            {
              type: 'DomainBlock',
              domain: 'iot',
              keyword: 'sensor',
              name: 'TemperatureProbe',
              traits: ['networked'],
              properties: { unit: 'celsius', range: 100 },
            },
          ],
        })
      );
      const skill = card.skills.find((s: A2AAgentSkill) => s.id === 'iot_temperatureprobe');
      expect(skill).toBeDefined();
      expect(skill!.tags).toContain('iot');
      expect(skill!.tags).toContain('sensor');
      expect(skill!.tags).toContain('telemetry');
      expect(skill!.tags).toContain('networked');
      expect(skill!.description).toContain('2 properties');
    });

    it('robotics domain block produces specialized skill', () => {
      const card = compileAndParse(
        compiler,
        makeComposition({
          domainBlocks: [
            {
              type: 'DomainBlock',
              domain: 'robotics',
              keyword: 'joint',
              name: 'ArmJoint',
              traits: ['safety_rated'],
              properties: { maxTorque: 50 },
            },
          ],
        })
      );
      const skill = card.skills.find((s: A2AAgentSkill) => s.id === 'robotics_armjoint');
      expect(skill).toBeDefined();
      expect(skill!.tags).toContain('robotics');
      expect(skill!.tags).toContain('joint');
      expect(skill!.tags).toContain('control');
    });

    it('domain skills can be disabled', () => {
      const c = new A2AAgentCardCompiler({ includeDomainSkills: false });
      const card = compileAndParse(
        c,
        makeComposition({
          domainBlocks: [
            {
              type: 'DomainBlock',
              domain: 'iot',
              keyword: 'sensor',
              name: 'Test',
              traits: [],
              properties: {},
            },
          ],
        })
      );
      expect(card.skills.find((s: A2AAgentSkill) => s.id === 'iot_test')).toBeUndefined();
    });

    it('domain block tags are deduplicated', () => {
      const card = compileAndParse(
        compiler,
        makeComposition({
          domainBlocks: [
            {
              type: 'DomainBlock',
              domain: 'iot',
              keyword: 'sensor',
              name: 'Probe',
              traits: ['sensor'], // duplicate of keyword-based tag
              properties: {},
            },
          ],
        })
      );
      const skill = card.skills.find((s: A2AAgentSkill) => s.id === 'iot_probe');
      const sensorCount = skill!.tags.filter((t) => t === 'sensor').length;
      expect(sensorCount).toBe(1);
    });
  });

  // =========================================================================
  // NPC / Dialogue -> Conversational Skills
  // =========================================================================

  describe('conversational skills', () => {
    it('NPCs produce NPC skills', () => {
      const card = compileAndParse(
        compiler,
        makeComposition({
          npcs: [
            {
              type: 'NPC',
              name: 'Shopkeeper',
              npcType: 'merchant',
              properties: [],
              behaviors: [{ name: 'greet', trigger: 'on_approach', actions: [] } as any],
            } as any,
          ],
        })
      );
      const skill = card.skills.find((s: A2AAgentSkill) => s.id === 'npc_shopkeeper');
      expect(skill).toBeDefined();
      expect(skill!.name).toContain('Shopkeeper');
      expect(skill!.name).toContain('NPC');
      expect(skill!.tags).toContain('npc');
      expect(skill!.tags).toContain('merchant');
      expect(skill!.tags).toContain('behavioral');
      expect(skill!.inputModes).toEqual(['text/plain']);
      expect(skill!.outputModes).toEqual(['text/plain', 'application/json']);
    });

    it('dialogues produce dialogue system skill', () => {
      const card = compileAndParse(
        compiler,
        makeComposition({
          dialogues: [
            {
              type: 'Dialogue',
              id: 'd1',
              character: 'Alice',
              content: 'Hello!',
              options: [
                { text: 'Hi there!', type: 'DialogueOption' } as any,
                { text: 'Goodbye', type: 'DialogueOption' } as any,
              ],
            } as any,
            {
              type: 'Dialogue',
              id: 'd2',
              character: 'Bob',
              content: 'Welcome!',
              options: [{ text: 'Thanks', type: 'DialogueOption' } as any],
            } as any,
          ],
        })
      );
      const skill = card.skills.find((s: A2AAgentSkill) => s.id === 'dialogue_system');
      expect(skill).toBeDefined();
      expect(skill!.description).toContain('2 dialogue node(s)');
      expect(skill!.description).toContain('3 choice(s)');
      expect(skill!.tags).toContain('dialogue');
      expect(skill!.tags).toContain('Alice');
      expect(skill!.tags).toContain('Bob');
    });

    it('conversational skills can be disabled', () => {
      const c = new A2AAgentCardCompiler({ includeConversationalSkills: false });
      const card = compileAndParse(
        c,
        makeComposition({
          npcs: [{ type: 'NPC', name: 'Bob', properties: [], behaviors: [] } as any],
          dialogues: [{ type: 'Dialogue', id: 'd1', content: 'Hi', options: [] } as any],
        })
      );
      expect(card.skills.find((s: A2AAgentSkill) => s.id.startsWith('npc_'))).toBeUndefined();
      expect(card.skills.find((s: A2AAgentSkill) => s.id === 'dialogue_system')).toBeUndefined();
    });
  });

  // =========================================================================
  // Game Mechanics -> Skills
  // =========================================================================

  describe('game mechanic skills', () => {
    it('quests produce quest system skill', () => {
      const card = compileAndParse(
        compiler,
        makeComposition({
          quests: [
            {
              type: 'Quest',
              name: 'The Lost Artifact',
              questType: 'fetch',
              objectives: [
                {
                  id: 'o1',
                  description: 'Find it',
                  objectiveType: 'discover',
                  target: 'artifact',
                } as any,
              ],
              rewards: { type: 'QuestRewards', experience: 100 },
            } as any,
          ],
        })
      );
      const skill = card.skills.find((s: A2AAgentSkill) => s.id === 'quest_system');
      expect(skill).toBeDefined();
      expect(skill!.description).toContain('1 quest(s)');
      expect(skill!.description).toContain('1 objective(s)');
      expect(skill!.tags).toContain('quest');
      expect(skill!.tags).toContain('fetch');
    });

    it('abilities produce ability system skill', () => {
      const card = compileAndParse(
        compiler,
        makeComposition({
          abilities: [
            {
              type: 'Ability',
              name: 'Fireball',
              abilityType: 'spell',
              stats: { type: 'AbilityStats', manaCost: 30 },
              effects: { type: 'AbilityEffects' },
            } as any,
            {
              type: 'Ability',
              name: 'Shield Bash',
              abilityType: 'skill',
              stats: { type: 'AbilityStats', staminaCost: 20 },
              effects: { type: 'AbilityEffects' },
            } as any,
          ],
        })
      );
      const skill = card.skills.find((s: A2AAgentSkill) => s.id === 'ability_system');
      expect(skill).toBeDefined();
      expect(skill!.description).toContain('2 abilities');
      expect(skill!.tags).toContain('spell');
      expect(skill!.tags).toContain('skill');
      expect(skill!.examples).toContain('Use ability: Fireball');
      expect(skill!.examples).toContain('Use ability: Shield Bash');
    });

    it('state machines produce state machine skill', () => {
      const card = compileAndParse(
        compiler,
        makeComposition({
          stateMachines: [
            {
              type: 'StateMachine',
              name: 'EnemyAI',
              initialState: 'idle',
              states: {
                idle: { name: 'idle', actions: [], transitions: [] } as any,
                attack: { name: 'attack', actions: [], transitions: [] } as any,
              },
            } as any,
          ],
        })
      );
      const skill = card.skills.find((s: A2AAgentSkill) => s.id === 'state_machine_system');
      expect(skill).toBeDefined();
      expect(skill!.description).toContain('1 machine(s)');
      expect(skill!.description).toContain('2 total state(s)');
      expect(skill!.tags).toContain('EnemyAI');
    });

    it('game mechanics skills can be disabled', () => {
      const c = new A2AAgentCardCompiler({ includeGameMechanics: false });
      const card = compileAndParse(
        c,
        makeComposition({
          quests: [
            {
              type: 'Quest',
              name: 'Q1',
              objectives: [],
              rewards: { type: 'QuestRewards' },
            } as any,
          ],
          abilities: [
            {
              type: 'Ability',
              name: 'A1',
              abilityType: 'spell',
              stats: { type: 'AbilityStats' },
              effects: { type: 'AbilityEffects' },
            } as any,
          ],
        })
      );
      expect(card.skills.find((s: A2AAgentSkill) => s.id === 'quest_system')).toBeUndefined();
      expect(card.skills.find((s: A2AAgentSkill) => s.id === 'ability_system')).toBeUndefined();
    });
  });

  // =========================================================================
  // State -> Skills
  // =========================================================================

  describe('state management skills', () => {
    it('composition state produces state management skill', () => {
      const card = compileAndParse(
        compiler,
        makeComposition({
          state: {
            type: 'State',
            properties: [
              { type: 'StateProperty', key: 'score', value: 0 },
              { type: 'StateProperty', key: 'level', value: 1 },
              { type: 'StateProperty', key: 'health', value: 100 },
            ],
          },
        })
      );
      const skill = card.skills.find((s: A2AAgentSkill) => s.id === 'state_management');
      expect(skill).toBeDefined();
      expect(skill!.description).toContain('3 state properties');
      expect(skill!.description).toContain('score');
      expect(skill!.description).toContain('level');
      expect(skill!.description).toContain('health');
      expect(skill!.tags).toContain('state');
      expect(skill!.tags).toContain('reactive');
    });

    it('composition without state does not produce state skill', () => {
      const card = compileAndParse(compiler, makeComposition());
      expect(card.skills.find((s: A2AAgentSkill) => s.id === 'state_management')).toBeUndefined();
    });
  });

  // =========================================================================
  // Interfaces
  // =========================================================================

  describe('interfaces', () => {
    it('state produces state-query interface', () => {
      const card = compileAndParse(
        compiler,
        makeComposition({
          state: {
            type: 'State',
            properties: [{ type: 'StateProperty', key: 'count', value: 0 }],
          },
        })
      );
      expect(card.interfaces).toBeDefined();
      const stateInterface = card.interfaces!.find((i) => i.id === 'state-query');
      expect(stateInterface).toBeDefined();
      expect(stateInterface!.type).toBe('json-rpc');
      expect(stateInterface!.schema).toBeDefined();
    });

    it('logic produces event-handler interface', () => {
      const card = compileAndParse(
        compiler,
        makeComposition({
          logic: {
            type: 'Logic',
            handlers: [{ event: 'on_click', parameters: [], body: [] } as any],
            actions: [],
          },
        })
      );
      expect(card.interfaces).toBeDefined();
      const eventInterface = card.interfaces!.find((i) => i.id === 'event-handler');
      expect(eventInterface).toBeDefined();
      expect(eventInterface!.type).toBe('json-rpc');
    });

    it('composition without state or logic has no interfaces', () => {
      const card = compileAndParse(compiler, makeComposition());
      expect(card.interfaces).toBeUndefined();
    });
  });

  // =========================================================================
  // Authenticated Extended Card
  // =========================================================================

  describe('authenticated extended card', () => {
    it('omits supportsAuthenticatedExtendedCard when false', () => {
      const card = compileAndParse(compiler, makeComposition());
      expect(card.supportsAuthenticatedExtendedCard).toBeUndefined();
    });

    it('includes supportsAuthenticatedExtendedCard when true', () => {
      const c = new A2AAgentCardCompiler({ supportsAuthenticatedExtendedCard: true });
      const card = compileAndParse(c, makeComposition());
      expect(card.supportsAuthenticatedExtendedCard).toBe(true);
    });
  });

  // =========================================================================
  // ID Sanitization
  // =========================================================================

  describe('id sanitization', () => {
    it('sanitizes special characters in skill IDs', () => {
      const card = compileAndParse(
        compiler,
        makeComposition({
          templates: [
            { name: 'My Cool Template!@#', properties: [], actions: [], traits: [] } as any,
          ],
        })
      );
      const skill = card.skills.find((s: A2AAgentSkill) => s.tags.includes('template'));
      expect(skill).toBeDefined();
      expect(skill!.id).toMatch(/^[a-z0-9_]+$/);
      expect(skill!.id).not.toContain('!');
      expect(skill!.id).not.toContain('@');
      expect(skill!.id).not.toContain('#');
    });

    it('skill IDs are lowercase', () => {
      const card = compileAndParse(
        compiler,
        makeComposition({
          templates: [
            { name: 'CamelCaseTemplate', properties: [], actions: [], traits: [] } as any,
          ],
        })
      );
      const skill = card.skills.find((s: A2AAgentSkill) => s.tags.includes('template'));
      expect(skill!.id).toBe(skill!.id.toLowerCase());
    });
  });

  // =========================================================================
  // Complex / Integration Scenarios
  // =========================================================================

  describe('complex compositions', () => {
    it('rich composition produces comprehensive agent card', () => {
      const card = compileAndParse(
        compiler,
        makeComposition({
          name: 'SmartBuilding',
          state: {
            type: 'State',
            properties: [
              { type: 'StateProperty', key: 'occupancy', value: 0 },
              { type: 'StateProperty', key: 'temperature', value: 22 },
            ],
          },
          templates: [
            {
              name: 'Room',
              properties: [],
              actions: [{ name: 'adjustTemp', parameters: [], body: [] }],
              traits: [{ name: 'sensor', config: {} }],
              state: { properties: [{ key: 'temp', value: 20 }] },
            } as any,
          ],
          objects: [
            {
              name: 'HVACUnit',
              properties: [],
              traits: [
                { name: 'sensor', config: {} },
                { name: 'networked', config: {} },
              ],
            } as any,
          ],
          logic: {
            type: 'Logic',
            handlers: [{ event: 'on_temperature_change', parameters: [], body: [] } as any],
            actions: [{ name: 'setTargetTemp', parameters: [], body: [] } as any],
          },
          spatialGroups: [{ name: 'Floor1', properties: [], objects: [] } as any],
          domainBlocks: [
            {
              type: 'DomainBlock',
              domain: 'iot',
              keyword: 'sensor',
              name: 'AirQualitySensor',
              traits: ['calibrated'],
              properties: { accuracy: 0.95 },
            },
          ],
        })
      );

      // Verify all skill types are present
      expect(card.skills.find((s: A2AAgentSkill) => s.tags.includes('template'))).toBeDefined();
      expect(card.skills.find((s: A2AAgentSkill) => s.id.startsWith('object_'))).toBeDefined();
      expect(card.skills.find((s: A2AAgentSkill) => s.id === 'event_handling')).toBeDefined();
      expect(card.skills.find((s: A2AAgentSkill) => s.id === 'action_execution')).toBeDefined();
      expect(card.skills.find((s: A2AAgentSkill) => s.id === 'spatial_coordination')).toBeDefined();
      expect(card.skills.find((s: A2AAgentSkill) => s.id.startsWith('iot_'))).toBeDefined();
      expect(card.skills.find((s: A2AAgentSkill) => s.id === 'state_management')).toBeDefined();

      // Verify the agent card structure is A2A-compliant
      expect(card.name).toBeDefined();
      expect(card.description).toBeDefined();
      expect(card.url).toBeDefined();
      expect(card.version).toBeDefined();
      expect(card.capabilities).toBeDefined();
      expect(card.authentication).toBeDefined();
      expect(card.defaultInputModes.length).toBeGreaterThan(0);
      expect(card.defaultOutputModes.length).toBeGreaterThan(0);
      expect(card.skills.length).toBeGreaterThan(5);
    });

    it('agent card JSON is parseable and re-serializable', () => {
      const json = compiler.compile(
        makeComposition({
          name: 'TestAgent',
          templates: [{ name: 'T', properties: [], actions: [], traits: [] } as any],
        }),
        'test-token'
      );

      // Parse and re-serialize should produce same result
      const parsed = JSON.parse(json);
      const reserialized = JSON.stringify(parsed, null, 2);
      expect(reserialized).toBe(json);
    });

    it('all skill IDs in a complex composition are unique', () => {
      const card = compileAndParse(
        compiler,
        makeComposition({
          name: 'UniqueTest',
          templates: [
            { name: 'T1', properties: [], actions: [], traits: [] } as any,
            { name: 'T2', properties: [], actions: [], traits: [] } as any,
          ],
          objects: [
            { name: 'Sensor1', properties: [], traits: [{ name: 'sensor', config: {} }] } as any,
            { name: 'Sensor2', properties: [], traits: [{ name: 'sensor', config: {} }] } as any,
          ],
          logic: {
            type: 'Logic',
            handlers: [{ event: 'on_click', parameters: [], body: [] } as any],
            actions: [{ name: 'doThing', parameters: [], body: [] } as any],
          },
          state: {
            type: 'State',
            properties: [{ type: 'StateProperty', key: 'data', value: 0 }],
          },
        })
      );

      const ids = card.skills.map((s: A2AAgentSkill) => s.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });
  });

  // =========================================================================
  // A2A Protocol Compliance
  // =========================================================================

  describe('A2A protocol compliance', () => {
    it('required fields are always present', () => {
      const card = compileAndParse(compiler, makeComposition());
      // Required per A2A spec
      expect(typeof card.name).toBe('string');
      expect(typeof card.description).toBe('string');
      expect(typeof card.url).toBe('string');
      expect(typeof card.version).toBe('string');
      expect(card.capabilities).toBeDefined();
      expect(card.authentication).toBeDefined();
      expect(Array.isArray(card.defaultInputModes)).toBe(true);
      expect(Array.isArray(card.defaultOutputModes)).toBe(true);
      expect(Array.isArray(card.skills)).toBe(true);
    });

    it('skills have all required A2A skill fields', () => {
      const card = compileAndParse(
        compiler,
        makeComposition({
          templates: [{ name: 'TestTemplate', properties: [], actions: [], traits: [] } as any],
        })
      );
      for (const skill of card.skills) {
        expect(typeof skill.id).toBe('string');
        expect(skill.id.length).toBeGreaterThan(0);
        expect(typeof skill.name).toBe('string');
        expect(skill.name.length).toBeGreaterThan(0);
        expect(typeof skill.description).toBe('string');
        expect(skill.description.length).toBeGreaterThan(0);
        expect(Array.isArray(skill.tags)).toBe(true);
      }
    });

    it('authentication schemes is always a non-empty array', () => {
      const card = compileAndParse(compiler, makeComposition());
      expect(card.authentication.schemes.length).toBeGreaterThan(0);
    });

    it('capabilities object has expected shape', () => {
      const card = compileAndParse(compiler, makeComposition());
      expect(typeof card.capabilities.streaming).toBe('boolean');
      expect(typeof card.capabilities.pushNotifications).toBe('boolean');
      expect(typeof card.capabilities.stateTransitionHistory).toBe('boolean');
    });
  });
});
