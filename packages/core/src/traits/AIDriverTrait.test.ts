import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  aIDriverHandler,
  BehaviorTreeRunner,
  GOAPPlanner,
  AIDriverTrait,
  type BehaviorNode,
  type NPCGoal,
  type AIDriverConfig,
  type NPCContext,
} from './AIDriverTrait';
import type { HSPlusNode, TraitContext, TraitEvent } from './TraitTypes';

// Mock setup
const mockNode = {} as HSPlusNode;
const mockContext = {
  emit: vi.fn(),
  setState: vi.fn(),
  getState: vi.fn(),
} as unknown as TraitContext;

describe('AIDriverTrait', () => {
  describe('handler properties', () => {
    it('should have correct trait name', () => {
      expect(aIDriverHandler.name).toBe('a_i_driver');
    });

    it('should provide default configuration', () => {
      expect(aIDriverHandler.defaultConfig).toBeDefined();
      expect(typeof aIDriverHandler.defaultConfig).toBe('object');
    });

    it('should expose all lifecycle methods', () => {
      expect(typeof aIDriverHandler.onAttach).toBe('function');
      expect(typeof aIDriverHandler.onDetach).toBe('function');
      expect(typeof aIDriverHandler.onUpdate).toBe('function');
      expect(typeof aIDriverHandler.onEvent).toBe('function');
    });

    it('should have readonly satisfies TraitHandler', () => {
      expect(aIDriverHandler).toBeDefined();
      expect(aIDriverHandler.name).toMatch(/^a_i_driver$/);
    });
  });

  describe('BehaviorTreeRunner', () => {
    describe('sequence node', () => {
      it('should execute all children in order', async () => {
        const order: string[] = [];

        const node: BehaviorNode = {
          id: 'seq',
          type: 'sequence',
          children: [
            {
              id: 'action1',
              type: 'action',
              action: async () => {
                order.push('1');
                return true;
              },
            },
            {
              id: 'action2',
              type: 'action',
              action: async () => {
                order.push('2');
                return true;
              },
            },
          ],
        };

        const runner = new BehaviorTreeRunner(node);
        const context: NPCContext = {
          npcId: 'test',
          position: [0, 0, 0],
          rotation: [0, 0, 0],
          memory: new Map(),
          state: 'idle',
          energy: 1,
          mood: 0,
          perception: { nearbyEntities: [], visibleEntities: [] },
        };

        const result = await runner.tick(context);

        expect(result).toBe(true);
        expect(order).toEqual(['1', '2']);
      });

      it('should stop on first failure', async () => {
        const order: string[] = [];

        const node: BehaviorNode = {
          id: 'seq',
          type: 'sequence',
          children: [
            {
              id: 'action1',
              type: 'action',
              action: async () => {
                order.push('1');
                return true;
              },
            },
            {
              id: 'action2',
              type: 'action',
              action: async () => {
                order.push('2');
                return false;
              },
            },
            {
              id: 'action3',
              type: 'action',
              action: async () => {
                order.push('3');
                return true;
              },
            },
          ],
        };

        const runner = new BehaviorTreeRunner(node);
        const context: NPCContext = {
          npcId: 'test',
          position: [0, 0, 0],
          rotation: [0, 0, 0],
          memory: new Map(),
          state: 'idle',
          energy: 1,
          mood: 0,
          perception: { nearbyEntities: [], visibleEntities: [] },
        };

        const result = await runner.tick(context);

        expect(result).toBe(false);
        expect(order).toEqual(['1', '2']);
      });
    });

    describe('selector node', () => {
      it('should return true on first success', async () => {
        const order: string[] = [];

        const node: BehaviorNode = {
          id: 'sel',
          type: 'selector',
          children: [
            {
              id: 'action1',
              type: 'action',
              action: async () => {
                order.push('1');
                return false;
              },
            },
            {
              id: 'action2',
              type: 'action',
              action: async () => {
                order.push('2');
                return true;
              },
            },
            {
              id: 'action3',
              type: 'action',
              action: async () => {
                order.push('3');
                return true;
              },
            },
          ],
        };

        const runner = new BehaviorTreeRunner(node);
        const context: NPCContext = {
          npcId: 'test',
          position: [0, 0, 0],
          rotation: [0, 0, 0],
          memory: new Map(),
          state: 'idle',
          energy: 1,
          mood: 0,
          perception: { nearbyEntities: [], visibleEntities: [] },
        };

        const result = await runner.tick(context);

        expect(result).toBe(true);
        expect(order).toEqual(['1', '2']);
      });

      it('should return false when all children fail', async () => {
        const node: BehaviorNode = {
          id: 'sel',
          type: 'selector',
          children: [
            {
              id: 'action1',
              type: 'action',
              action: async () => false,
            },
            {
              id: 'action2',
              type: 'action',
              action: async () => false,
            },
          ],
        };

        const runner = new BehaviorTreeRunner(node);
        const context: NPCContext = {
          npcId: 'test',
          position: [0, 0, 0],
          rotation: [0, 0, 0],
          memory: new Map(),
          state: 'idle',
          energy: 1,
          mood: 0,
          perception: { nearbyEntities: [], visibleEntities: [] },
        };

        const result = await runner.tick(context);

        expect(result).toBe(false);
      });
    });

    describe('parallel node', () => {
      it('should execute all children concurrently', async () => {
        const execution: string[] = [];

        const node: BehaviorNode = {
          id: 'par',
          type: 'parallel',
          children: [
            {
              id: 'action1',
              type: 'action',
              action: async () => {
                execution.push('1');
                return true;
              },
            },
            {
              id: 'action2',
              type: 'action',
              action: async () => {
                execution.push('2');
                return true;
              },
            },
          ],
        };

        const runner = new BehaviorTreeRunner(node);
        const context: NPCContext = {
          npcId: 'test',
          position: [0, 0, 0],
          rotation: [0, 0, 0],
          memory: new Map(),
          state: 'idle',
          energy: 1,
          mood: 0,
          perception: { nearbyEntities: [], visibleEntities: [] },
        };

        const result = await runner.tick(context);

        expect(result).toBe(true);
        expect(execution).toHaveLength(2);
      });

      it('should return false if any child fails', async () => {
        const node: BehaviorNode = {
          id: 'par',
          type: 'parallel',
          children: [
            {
              id: 'action1',
              type: 'action',
              action: async () => true,
            },
            {
              id: 'action2',
              type: 'action',
              action: async () => false,
            },
          ],
        };

        const runner = new BehaviorTreeRunner(node);
        const context: NPCContext = {
          npcId: 'test',
          position: [0, 0, 0],
          rotation: [0, 0, 0],
          memory: new Map(),
          state: 'idle',
          energy: 1,
          mood: 0,
          perception: { nearbyEntities: [], visibleEntities: [] },
        };

        const result = await runner.tick(context);

        expect(result).toBe(false);
      });
    });

    describe('condition node', () => {
      it('should return true when condition passes', async () => {
        const node: BehaviorNode = {
          id: 'cond',
          type: 'condition',
          condition: (ctx) => ctx.energy > 0.5,
        };

        const runner = new BehaviorTreeRunner(node);
        const context: NPCContext = {
          npcId: 'test',
          position: [0, 0, 0],
          rotation: [0, 0, 0],
          memory: new Map(),
          state: 'idle',
          energy: 0.8,
          mood: 0,
          perception: { nearbyEntities: [], visibleEntities: [] },
        };

        const result = await runner.tick(context);

        expect(result).toBe(true);
      });

      it('should return false when condition fails', async () => {
        const node: BehaviorNode = {
          id: 'cond',
          type: 'condition',
          condition: (ctx) => ctx.energy > 0.5,
        };

        const runner = new BehaviorTreeRunner(node);
        const context: NPCContext = {
          npcId: 'test',
          position: [0, 0, 0],
          rotation: [0, 0, 0],
          memory: new Map(),
          state: 'idle',
          energy: 0.3,
          mood: 0,
          perception: { nearbyEntities: [], visibleEntities: [] },
        };

        const result = await runner.tick(context);

        expect(result).toBe(false);
      });
    });

    describe('error handling', () => {
      it('should handle action errors gracefully', async () => {
        const node: BehaviorNode = {
          id: 'action',
          type: 'action',
          action: async () => {
            throw new Error('Action failed');
          },
        };

        const runner = new BehaviorTreeRunner(node);
        const context: NPCContext = {
          npcId: 'test',
          position: [0, 0, 0],
          rotation: [0, 0, 0],
          memory: new Map(),
          state: 'idle',
          energy: 1,
          mood: 0,
          perception: { nearbyEntities: [], visibleEntities: [] },
        };

        const result = await runner.tick(context);

        expect(result).toBe(false);
      });
    });
  });

  describe('GOAPPlanner', () => {
    it('should select highest priority achievable goal', () => {
      const goals: NPCGoal[] = [
        {
          id: 'low',
          name: 'Low Priority',
          priority: 0.2,
          preconditions: new Map([['energy', 1]]),
          effects: new Map(),
          cost: 1,
        },
        {
          id: 'high',
          name: 'High Priority',
          priority: 0.9,
          preconditions: new Map([['ready', true]]),
          effects: new Map(),
          cost: 1,
        },
      ];

      const planner = new GOAPPlanner(goals);
      const state = new Map([['ready', true]]);

      const plan = planner.planGoal(state, goals[0]);

      expect(plan).toHaveLength(1);
      expect(plan[0].id).toBe('high');
    });

    it('should return empty plan when no goal is achievable', () => {
      const goals: NPCGoal[] = [
        {
          id: 'goal1',
          name: 'Goal 1',
          priority: 0.5,
          preconditions: new Map([['impossible', true]]),
          effects: new Map(),
          cost: 1,
        },
      ];

      const planner = new GOAPPlanner(goals);
      const state = new Map([['ready', false]]);

      const plan = planner.planGoal(state, goals[0]);

      expect(plan).toHaveLength(0);
    });

    it('should check preconditions correctly', () => {
      const goals: NPCGoal[] = [
        {
          id: 'goal1',
          name: 'Goal 1',
          priority: 0.5,
          preconditions: new Map([
            ['energy', 0.5],
            ['mood', 0.3],
          ]),
          effects: new Map(),
          cost: 1,
        },
      ];

      const planner = new GOAPPlanner(goals);

      const state1 = new Map([
        ['energy', 0.5],
        ['mood', 0.3],
      ]);
      const plan1 = planner.planGoal(state1, goals[0]);
      expect(plan1).toHaveLength(1);

      const state2 = new Map([
        ['energy', 0.5],
        ['mood', 0.2],
      ]);
      const plan2 = planner.planGoal(state2, goals[0]);
      expect(plan2).toHaveLength(0);
    });

    it('should sort goals by priority descending', () => {
      const goals: NPCGoal[] = [
        {
          id: 'low',
          name: 'Low',
          priority: 0.1,
          preconditions: new Map([['ok', true]]),
          effects: new Map(),
          cost: 1,
        },
        {
          id: 'high',
          name: 'High',
          priority: 0.9,
          preconditions: new Map([['ok', true]]),
          effects: new Map(),
          cost: 1,
        },
        {
          id: 'medium',
          name: 'Medium',
          priority: 0.5,
          preconditions: new Map([['ok', true]]),
          effects: new Map(),
          cost: 1,
        },
      ];

      const planner = new GOAPPlanner(goals);
      const state = new Map([['ok', true]]);

      const plan = planner.planGoal(state, goals[0]);

      expect(plan[0].id).toBe('high');
    });
  });

  describe('lifecycle: onAttach', () => {
    beforeEach(() => {
      (mockContext.emit as any)?.mockClear();
      delete (mockNode as any).__a_i_driver_instance;
    });

    it('should create BehaviorTreeRunner instance', () => {
      const tree: BehaviorNode = {
        id: 'root',
        type: 'sequence',
      };
      const config = { npcId: 'npc1', behaviorTree: tree };

      aIDriverHandler.onAttach?.(mockNode as HSPlusNode, config, mockContext as TraitContext);

      expect((mockNode as any).__a_i_driver_instance).toBeDefined();
    });

    it('should emit a_i_driver_attached event', () => {
      const config = { npcId: 'npc1' };

      aIDriverHandler.onAttach?.(mockNode as HSPlusNode, config, mockContext as TraitContext);

      expect(mockContext.emit).toHaveBeenCalledWith('a_i_driver_attached', expect.objectContaining({ node: mockNode }));
    });

    it('should handle missing behaviorTree gracefully', () => {
      const config = { npcId: 'npc1' };

      expect(() => {
        aIDriverHandler.onAttach?.(mockNode as HSPlusNode, config, mockContext as TraitContext);
      }).not.toThrow();
    });

    it('should support different NPC IDs', () => {
      const config1 = { npcId: 'npc1' };
      aIDriverHandler.onAttach?.(mockNode as HSPlusNode, config1, mockContext as TraitContext);

      const mockNode2 = {} as HSPlusNode;
      const config2 = { npcId: 'npc2' };
      aIDriverHandler.onAttach?.(mockNode2 as HSPlusNode, config2, mockContext as TraitContext);

      expect((mockNode as any).__a_i_driver_instance).toBeDefined();
      expect((mockNode2 as any).__a_i_driver_instance).toBeDefined();
    });

    it('should support custom behavior tree configuration', () => {
      const tree: BehaviorNode = {
        id: 'root',
        type: 'selector',
        children: [
          { id: 'child1', type: 'action' },
          { id: 'child2', type: 'action' },
        ],
      };
      const config = { npcId: 'npc1', behaviorTree: tree };

      expect(() => {
        aIDriverHandler.onAttach?.(mockNode as HSPlusNode, config, mockContext as TraitContext);
      }).not.toThrow();
    });
  });

  describe('lifecycle: onDetach', () => {
    beforeEach(() => {
      const config = { npcId: 'npc1' };
      aIDriverHandler.onAttach?.(mockNode as HSPlusNode, config, mockContext as TraitContext);
      (mockContext.emit as any)?.mockClear();
    });

    it('should emit a_i_driver_detached event', () => {
      aIDriverHandler.onDetach?.(mockNode as HSPlusNode, {}, mockContext as TraitContext);

      expect(mockContext.emit).toHaveBeenCalledWith('a_i_driver_detached', expect.objectContaining({ node: mockNode }));
    });

    it('should clean up instance reference', () => {
      aIDriverHandler.onDetach?.(mockNode as HSPlusNode, {}, mockContext as TraitContext);

      expect((mockNode as any).__a_i_driver_instance).toBeUndefined();
    });

    it('should handle detach without prior attach', () => {
      const newNode = {} as HSPlusNode;

      expect(() => {
        aIDriverHandler.onDetach?.(newNode as HSPlusNode, {}, mockContext as TraitContext);
      }).not.toThrow();
    });
  });

  describe('lifecycle: onUpdate', () => {
    beforeEach(() => {
      const config = { npcId: 'npc1' };
      aIDriverHandler.onAttach?.(mockNode as HSPlusNode, config, mockContext as TraitContext);
      (mockContext.emit as any)?.mockClear();
    });

    it('should accept delta time parameter', () => {
      expect(() => {
        aIDriverHandler.onUpdate?.(mockNode as HSPlusNode, {}, mockContext as TraitContext, 0.016);
      }).not.toThrow();
    });

    it('should handle zero delta time', () => {
      expect(() => {
        aIDriverHandler.onUpdate?.(mockNode as HSPlusNode, {}, mockContext as TraitContext, 0);
      }).not.toThrow();
    });

    it('should handle missing instance gracefully', () => {
      const newNode = {} as HSPlusNode;

      expect(() => {
        aIDriverHandler.onUpdate?.(newNode as HSPlusNode, {}, mockContext as TraitContext, 0.016);
      }).not.toThrow();
    });

    it('should support repeated updates', () => {
      for (let i = 0; i < 10; i++) {
        expect(() => {
          aIDriverHandler.onUpdate?.(mockNode as HSPlusNode, {}, mockContext as TraitContext, 0.016);
        }).not.toThrow();
      }
    });
  });

  describe('event handling: a_i_driver_configure', () => {
    beforeEach(() => {
      const config = { npcId: 'npc1' };
      aIDriverHandler.onAttach?.(mockNode as HSPlusNode, config, mockContext as TraitContext);
      (mockContext.emit as any)?.mockClear();
    });

    it('should emit a_i_driver_configured on configure event', () => {
      const event: TraitEvent = {
        type: 'a_i_driver_configure',
        payload: { someConfig: 'value' },
      };

      aIDriverHandler.onEvent?.(mockNode as HSPlusNode, {}, mockContext as TraitContext, event);

      expect(mockContext.emit).toHaveBeenCalledWith('a_i_driver_configured', expect.objectContaining({ node: mockNode }));
    });

    it('should handle unknown events without crashing', () => {
      const event: TraitEvent = { type: 'unknown_event' };

      expect(() => {
        aIDriverHandler.onEvent?.(mockNode as HSPlusNode, {}, mockContext as TraitContext, event);
      }).not.toThrow();
    });

    it('should handle events without payload', () => {
      const event: TraitEvent = { type: 'some_event' };

      expect(() => {
        aIDriverHandler.onEvent?.(mockNode as HSPlusNode, {}, mockContext as TraitContext, event);
      }).not.toThrow();
    });

    it('should handle null event', () => {
      expect(() => {
        aIDriverHandler.onEvent?.(mockNode as HSPlusNode, {}, mockContext as TraitContext, {} as TraitEvent);
      }).not.toThrow();
    });
  });

  describe('AIDriverTrait class', () => {
    it('should construct with basic config', () => {
      const config: AIDriverConfig = {
        npcId: 'npc1',
        decisionMode: 'reactive',
      };

      const trait = new AIDriverTrait(config);

      expect(trait).toBeDefined();
      const ctx = trait.getContext();
      expect(ctx.npcId).toBe('npc1');
      expect(ctx.state).toBe('idle');
    });

    it('should have default personality', () => {
      const config: AIDriverConfig = {
        npcId: 'npc1',
        decisionMode: 'reactive',
      };

      const trait = new AIDriverTrait(config);
      const ctx = trait.getContext();

      expect(ctx.mood).toBe(0);
      expect(ctx.energy).toBe(1.0);
    });

    it('should support startAI/stopAI', () => {
      const config: AIDriverConfig = {
        npcId: 'npc1',
        decisionMode: 'reactive',
      };

      const trait = new AIDriverTrait(config);

      expect(() => {
        trait.startAI();
      }).not.toThrow();

      expect(() => {
        trait.stopAI();
      }).not.toThrow();
    });

    it('should support setPosition', () => {
      const config: AIDriverConfig = {
        npcId: 'npc1',
        decisionMode: 'reactive',
      };

      const trait = new AIDriverTrait(config);
      trait.setPosition([10, 20, 30]);

      const ctx = trait.getContext();
      expect(ctx.position).toEqual([10, 20, 30]);
    });

    it('should support updatePerception', () => {
      const config: AIDriverConfig = {
        npcId: 'npc1',
        decisionMode: 'reactive',
      };

      const trait = new AIDriverTrait(config);
      trait.updatePerception(['entity1', 'entity2'], ['entity1']);

      const ctx = trait.getContext();
      expect(ctx.perception.nearbyEntities).toEqual(['entity1', 'entity2']);
      expect(ctx.perception.visibleEntities).toEqual(['entity1']);
    });

    it('should support speak method', () => {
      const config: AIDriverConfig = {
        npcId: 'npc1',
        decisionMode: 'reactive',
      };

      const trait = new AIDriverTrait(config);
      trait.speak('Hello world');

      const ctx = trait.getContext();
      expect(ctx.dialogue?.lastSaid).toBe('Hello world');
      expect(ctx.dialogue?.conversationHistory).toHaveLength(1);
    });

    it('should support hear method', () => {
      const config: AIDriverConfig = {
        npcId: 'npc1',
        decisionMode: 'reactive',
      };

      const trait = new AIDriverTrait(config);
      trait.hear('other_npc', 'Hi there');

      const ctx = trait.getContext();
      expect(ctx.dialogue?.lastHeard).toBe('Hi there');
      expect(ctx.dialogue?.conversationHistory).toHaveLength(1);
    });

    it('should support dispose method', () => {
      const config: AIDriverConfig = {
        npcId: 'npc1',
        decisionMode: 'reactive',
      };

      const trait = new AIDriverTrait(config);
      trait.startAI();

      expect(() => {
        trait.dispose();
      }).not.toThrow();
    });

    it('should maintain energy that decreases over time', async () => {
      const config: AIDriverConfig = {
        npcId: 'npc1',
        decisionMode: 'reactive',
      };

      const trait = new AIDriverTrait(config);
      const startEnergy = trait.getContext().energy;

      trait.startAI();
      await new Promise((resolve) => setTimeout(resolve, 150));
      trait.stopAI();

      const endEnergy = trait.getContext().energy;

      expect(endEnergy).toBeLessThan(startEnergy);
    });

    it('should support all decision modes', () => {
      const modes: Array<'reactive' | 'goal-driven' | 'learning' | 'hybrid'> = [
        'reactive',
        'goal-driven',
        'learning',
        'hybrid',
      ];

      modes.forEach((mode) => {
        const config: AIDriverConfig = {
          npcId: 'npc1',
          decisionMode: mode,
        };

        expect(() => {
          new AIDriverTrait(config);
        }).not.toThrow();
      });
    });

    it('should support custom personality configuration', () => {
      const config: AIDriverConfig = {
        npcId: 'npc1',
        decisionMode: 'reactive',
        personality: {
          sociability: 0.9,
          aggression: 0.1,
          curiosity: 0.8,
          loyalty: 0.7,
        },
      };

      expect(() => {
        new AIDriverTrait(config);
      }).not.toThrow();
    });

    it('should support custom stimuli thresholds', () => {
      const config: AIDriverConfig = {
        npcId: 'npc1',
        decisionMode: 'reactive',
        stimuliThresholds: {
          hearing: 75,
          sight: 150,
          touch: 3,
        },
      };

      expect(() => {
        new AIDriverTrait(config);
      }).not.toThrow();
    });

    it('should support learning configuration', () => {
      const config: AIDriverConfig = {
        npcId: 'npc1',
        decisionMode: 'learning',
        enableLearning: true,
        learningRate: 0.2,
      };

      expect(() => {
        new AIDriverTrait(config);
      }).not.toThrow();
    });

    it('should support behavior tree configuration', () => {
      const tree: BehaviorNode = {
        id: 'root',
        type: 'sequence',
        children: [{ id: 'action', type: 'action' }],
      };

      const config: AIDriverConfig = {
        npcId: 'npc1',
        decisionMode: 'reactive',
        behaviorTree: tree,
      };

      expect(() => {
        new AIDriverTrait(config);
      }).not.toThrow();
    });

    it('should support goals configuration', () => {
      const goals: NPCGoal[] = [
        {
          id: 'goal1',
          name: 'Goal 1',
          priority: 0.5,
          preconditions: new Map(),
          effects: new Map(),
          cost: 1,
        },
      ];

      const config: AIDriverConfig = {
        npcId: 'npc1',
        decisionMode: 'goal-driven',
        goals,
      };

      expect(() => {
        new AIDriverTrait(config);
      }).not.toThrow();
    });
  });

  describe('state isolation', () => {
    it('should maintain independent state for each NPC', () => {
      const trait1 = new AIDriverTrait({ npcId: 'npc1', decisionMode: 'reactive' });
      const trait2 = new AIDriverTrait({ npcId: 'npc2', decisionMode: 'reactive' });

      trait1.setPosition([1, 2, 3]);
      trait2.setPosition([4, 5, 6]);

      expect(trait1.getContext().position).toEqual([1, 2, 3]);
      expect(trait2.getContext().position).toEqual([4, 5, 6]);
    });

    it('should not share memory between NPCs', () => {
      const trait1 = new AIDriverTrait({ npcId: 'npc1', decisionMode: 'reactive' });
      const trait2 = new AIDriverTrait({ npcId: 'npc2', decisionMode: 'reactive' });

      trait1.getContext().memory.set('key1', 'value1');

      expect(trait2.getContext().memory.has('key1')).toBe(false);
    });

    it('should not share perception between NPCs', () => {
      const trait1 = new AIDriverTrait({ npcId: 'npc1', decisionMode: 'reactive' });
      const trait2 = new AIDriverTrait({ npcId: 'npc2', decisionMode: 'reactive' });

      trait1.updatePerception(['e1'], ['e1']);
      trait2.updatePerception(['e2'], []);

      expect(trait1.getContext().perception.nearbyEntities).toEqual(['e1']);
      expect(trait2.getContext().perception.nearbyEntities).toEqual(['e2']);
    });

    it('should not share conversation history between NPCs', () => {
      const trait1 = new AIDriverTrait({ npcId: 'npc1', decisionMode: 'reactive' });
      const trait2 = new AIDriverTrait({ npcId: 'npc2', decisionMode: 'reactive' });

      trait1.speak('Hello');
      trait2.hear('someone', 'Hi');

      expect(trait1.getContext().dialogue?.conversationHistory).toHaveLength(1);
      expect(trait2.getContext().dialogue?.conversationHistory).toHaveLength(1);
    });
  });

  describe('complex workflows', () => {
    it('should handle complete perception to behavior flow', async () => {
      const config: AIDriverConfig = {
        npcId: 'npc1',
        decisionMode: 'reactive',
        behaviorTree: {
          id: 'root',
          type: 'sequence',
          children: [
            {
              id: 'check_perception',
              type: 'condition',
              condition: (ctx) => ctx.perception.visibleEntities.length > 0,
            },
            {
              id: 'react',
              type: 'action',
              action: async () => {
                return true;
              },
            },
          ],
        },
      };

      const trait = new AIDriverTrait(config);
      trait.updatePerception(['enemy1'], ['enemy1']);

      trait.startAI();
      await new Promise((resolve) => setTimeout(resolve, 150));
      trait.stopAI();

      expect(trait.getContext().perception.visibleEntities).toHaveLength(1);
    });

    it('should handle dialogue interaction workflow', () => {
      const trait = new AIDriverTrait({
        npcId: 'player',
        decisionMode: 'reactive',
      });

      const otherTrait = new AIDriverTrait({
        npcId: 'npc',
        decisionMode: 'reactive',
      });

      trait.speak('Hi NPC');
      otherTrait.hear('player', 'Hi NPC');
      otherTrait.speak('Hello player');
      trait.hear('npc', 'Hello player');

      expect(trait.getContext().dialogue?.conversationHistory).toHaveLength(2);
      expect(otherTrait.getContext().dialogue?.conversationHistory).toHaveLength(2);
    });

    it('should handle multiple position updates', () => {
      const trait = new AIDriverTrait({
        npcId: 'npc1',
        decisionMode: 'reactive',
      });

      const positions: Array<[number, number, number]> = [
        [0, 0, 0],
        [1, 1, 1],
        [2, 2, 2],
      ];

      positions.forEach((pos) => {
        trait.setPosition(pos);
        expect(trait.getContext().position).toEqual(pos);
      });
    });

    it('should handle goal planning with multiple goals', () => {
      const goals: NPCGoal[] = [
        {
          id: 'explore',
          name: 'Explore',
          priority: 0.5,
          preconditions: new Map([['energy', 1]]),
          effects: new Map(),
          cost: 5,
        },
        {
          id: 'rest',
          name: 'Rest',
          priority: 0.8,
          preconditions: new Map([['energy', 0.5]]),
          effects: new Map(),
          cost: 2,
        },
      ];

      const config: AIDriverConfig = {
        npcId: 'npc1',
        decisionMode: 'goal-driven',
        goals,
      };

      expect(() => {
        new AIDriverTrait(config);
      }).not.toThrow();
    });
  });

  describe('configuration variations', () => {
    it('should support different learning rates', () => {
      const rates = [0.05, 0.1, 0.2, 0.5];

      rates.forEach((rate) => {
        expect(() => {
          new AIDriverTrait({
            npcId: 'npc1',
            decisionMode: 'learning',
            learningRate: rate,
          });
        }).not.toThrow();
      });
    });

    it('should support different NPC IDs', () => {
      const ids = ['npc_1', 'agent_01', 'character_boss', 'ai_companion'];

      ids.forEach((id) => {
        const trait = new AIDriverTrait({
          npcId: id,
          decisionMode: 'reactive',
        });

        expect(trait.getContext().npcId).toBe(id);
      });
    });

    it('should support optional agent ID for Infinity integration', () => {
      expect(() => {
        new AIDriverTrait({
          npcId: 'npc1',
          decisionMode: 'reactive',
          agentId: 'agent_uuid_123',
        });
      }).not.toThrow();
    });

    it('should support inference tier configuration', () => {
      const tiers: Array<'cpu_reactive' | 'npu_reasoning' | 'cloud_strategic'> = [
        'cpu_reactive',
        'npu_reasoning',
        'cloud_strategic',
      ];

      tiers.forEach((tier) => {
        expect(() => {
          new AIDriverTrait({
            npcId: 'npc1',
            decisionMode: 'reactive',
            inferenceTier: tier,
          });
        }).not.toThrow();
      });
    });

    it('should support custom NPU loop interval', () => {
      expect(() => {
        new AIDriverTrait({
          npcId: 'npc1',
          decisionMode: 'reactive',
          npuLoopIntervalMs: 200,
        });
      }).not.toThrow();
    });
  });
});
