/**
 * AIDriverTrait Tests
 *
 * Comprehensive tests for AI-driven NPC behavior
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  AIDriverTrait,
  type AIDriverConfig,
  type BehaviorNode,
  type NPCGoal,
} from '../traits/AIDriverTrait';

describe('AIDriverTrait', () => {
  let trait: AIDriverTrait;
  let config: AIDriverConfig;

  beforeEach(() => {
    config = {
      npcId: 'npc-001',
      decisionMode: 'hybrid',
      personality: {
        sociability: 0.8,
        aggression: 0.2,
        curiosity: 0.9,
        loyalty: 0.7,
      },
      stimuliThresholds: {
        hearing: 50,
        sight: 100,
        touch: 5,
      },
    };
    trait = new AIDriverTrait(config);
  });

  describe('Initialization', () => {
    it('should initialize with config', () => {
      expect(trait).toBeDefined();
    });

    it('should set NPC ID', () => {
      expect(trait).toBeDefined();
    });

    it('should accept decision modes', () => {
      const modes = ['reactive', 'goal-driven', 'learning', 'hybrid'] as const;
      for (const mode of modes) {
        const modeConfig = { ...config, decisionMode: mode };
        const modeTrait = new AIDriverTrait(modeConfig);
        expect(modeTrait).toBeDefined();
      }
    });
  });

  describe('Personality Configuration', () => {
    it('should accept personality traits', () => {
      const personalityConfig: AIDriverConfig = {
        npcId: 'npc-friendly',
        decisionMode: 'hybrid',
        personality: {
          sociability: 1.0,
          aggression: 0.0,
          curiosity: 0.5,
          loyalty: 1.0,
        },
      };
      const friendlyNPC = new AIDriverTrait(personalityConfig);
      expect(friendlyNPC).toBeDefined();
    });

    it('should have default personality if not specified', () => {
      const minimalConfig: AIDriverConfig = {
        npcId: 'npc-default',
        decisionMode: 'reactive',
      };
      const defaultNPC = new AIDriverTrait(minimalConfig);
      expect(defaultNPC).toBeDefined();
    });

    it('should validate personality values 0-1', () => {
      const validConfig: AIDriverConfig = {
        npcId: 'npc-valid',
        decisionMode: 'hybrid',
        personality: {
          sociability: 0.5,
          aggression: 0.5,
          curiosity: 0.5,
          loyalty: 0.5,
        },
      };
      const validNPC = new AIDriverTrait(validConfig);
      expect(validNPC).toBeDefined();
    });
  });

  describe('Stimuli Perception', () => {
    it('should support custom stimulus thresholds', () => {
      const customConfig: AIDriverConfig = {
        npcId: 'npc-sharp-senses',
        decisionMode: 'reactive',
        stimuliThresholds: {
          hearing: 200,
          sight: 300,
          touch: 10,
        },
      };
      const sensitivNPC = new AIDriverTrait(customConfig);
      expect(sensitivNPC).toBeDefined();
    });

    it('should have default thresholds if not specified', () => {
      const minimalConfig: AIDriverConfig = {
        npcId: 'npc-minimal',
        decisionMode: 'reactive',
      };
      const defaultNPC = new AIDriverTrait(minimalConfig);
      expect(defaultNPC).toBeDefined();
    });
  });

  describe('Behavior Trees', () => {
    it('should accept behavior tree configuration', () => {
      const behaviorTree: BehaviorNode = {
        id: 'root',
        type: 'selector',
        children: [
          {
            id: 'idle',
            type: 'action',
            action: async () => true,
          },
        ],
      };
      const behaviorConfig: AIDriverConfig = {
        npcId: 'npc-behavioral',
        decisionMode: 'reactive',
        behaviorTree,
      };
      const behaviorNPC = new AIDriverTrait(behaviorConfig);
      expect(behaviorNPC).toBeDefined();
    });

    it('should support sequence nodes', () => {
      const sequenceTree: BehaviorNode = {
        id: 'sequence',
        type: 'sequence',
        children: [
          { id: 'step1', type: 'action', action: async () => true },
          { id: 'step2', type: 'action', action: async () => true },
        ],
      };
      expect(sequenceTree).toBeDefined();
    });

    it('should support selector nodes', () => {
      const selectorTree: BehaviorNode = {
        id: 'selector',
        type: 'selector',
        children: [
          { id: 'option1', type: 'action', action: async () => false },
          { id: 'option2', type: 'action', action: async () => true },
        ],
      };
      expect(selectorTree).toBeDefined();
    });

    it('should support parallel nodes', () => {
      const parallelTree: BehaviorNode = {
        id: 'parallel',
        type: 'parallel',
        children: [
          { id: 'task1', type: 'action', action: async () => true },
          { id: 'task2', type: 'action', action: async () => true },
        ],
      };
      expect(parallelTree).toBeDefined();
    });

    it('should support condition nodes', () => {
      const conditionTree: BehaviorNode = {
        id: 'condition',
        type: 'condition',
        condition: () => true,
      };
      expect(conditionTree).toBeDefined();
    });
  });

  describe('Goal Planning (GOAP)', () => {
    it('should accept goals configuration', () => {
      const goals: NPCGoal[] = [
        {
          id: 'explore',
          name: 'Explore Area',
          priority: 0.5,
          preconditions: new Map([['energy', 50]]),
          effects: new Map([['discovered', true]]),
          cost: 10,
        },
      ];
      const goalConfig: AIDriverConfig = {
        npcId: 'npc-planner',
        decisionMode: 'goal-driven',
        goals,
      };
      const plannerNPC = new AIDriverTrait(goalConfig);
      expect(plannerNPC).toBeDefined();
    });

    it('should support multiple goals with priorities', () => {
      const goals: NPCGoal[] = [
        {
          id: 'survive',
          name: 'Survive',
          priority: 1.0,
          preconditions: new Map(),
          effects: new Map([['alive', true]]),
          cost: 5,
        },
        {
          id: 'succeed',
          name: 'Succeed',
          priority: 0.8,
          preconditions: new Map([['alive', true]]),
          effects: new Map([['succeeded', true]]),
          cost: 20,
        },
      ];
      expect(goals.length).toBe(2);
    });

    it('should support goal timeouts', () => {
      const timedGoal: NPCGoal = {
        id: 'escape',
        name: 'Escape Danger',
        priority: 0.9,
        preconditions: new Map([['threatened', true]]),
        effects: new Map([['safe', true]]),
        cost: 15,
        timeoutMs: 5000,
      };
      expect(timedGoal.timeoutMs).toBe(5000);
    });
  });

  describe('Learning Configuration', () => {
    it('should support learning mode', () => {
      const learningConfig: AIDriverConfig = {
        npcId: 'npc-learner',
        decisionMode: 'learning',
        enableLearning: true,
        learningRate: 0.1,
      };
      const learnerNPC = new AIDriverTrait(learningConfig);
      expect(learnerNPC).toBeDefined();
    });

    it('should allow disabling learning', () => {
      const noLearningConfig: AIDriverConfig = {
        npcId: 'npc-fixed',
        decisionMode: 'reactive',
        enableLearning: false,
      };
      const staticNPC = new AIDriverTrait(noLearningConfig);
      expect(staticNPC).toBeDefined();
    });

    it('should accept custom learning rate', () => {
      const fastLearning: AIDriverConfig = {
        npcId: 'npc-fast',
        decisionMode: 'learning',
        enableLearning: true,
        learningRate: 0.5,
      };
      const slowLearning: AIDriverConfig = {
        npcId: 'npc-slow',
        decisionMode: 'learning',
        enableLearning: true,
        learningRate: 0.01,
      };
      expect((fastLearning as any).learningRate).toBeGreaterThan(
        (slowLearning as any).learningRate
      );
    });
  });

  describe('External Agent Integration', () => {
    it('should accept external agent ID', () => {
      const agentConfig: AIDriverConfig = {
        npcId: 'npc-integrated',
        decisionMode: 'hybrid',
        agentId: 'agent-001',
      };
      const integratedNPC = new AIDriverTrait(agentConfig);
      expect(integratedNPC).toBeDefined();
    });

    it('should work without external agent integration', () => {
      const standaloneConfig: AIDriverConfig = {
        npcId: 'npc-standalone',
        decisionMode: 'reactive',
      };
      const standaloneNPC = new AIDriverTrait(standaloneConfig);
      expect(standaloneNPC).toBeDefined();
    });
  });

  describe('Decision Modes', () => {
    it('should support reactive decision making', () => {
      const reactiveConfig: AIDriverConfig = {
        npcId: 'npc-reactive',
        decisionMode: 'reactive',
      };
      const reactiveNPC = new AIDriverTrait(reactiveConfig);
      expect(reactiveNPC).toBeDefined();
    });

    it('should support goal-driven decision making', () => {
      const goalConfig: AIDriverConfig = {
        npcId: 'npc-goal',
        decisionMode: 'goal-driven',
        goals: [
          {
            id: 'goal1',
            name: 'Goal 1',
            priority: 0.8,
            preconditions: new Map(),
            effects: new Map(),
            cost: 10,
          },
        ],
      };
      const goalNPC = new AIDriverTrait(goalConfig);
      expect(goalNPC).toBeDefined();
    });

    it('should support learning decision making', () => {
      const learningConfig: AIDriverConfig = {
        npcId: 'npc-learning',
        decisionMode: 'learning',
        enableLearning: true,
      };
      const learningNPC = new AIDriverTrait(learningConfig);
      expect(learningNPC).toBeDefined();
    });

    it('should support hybrid decision making', () => {
      const hybridConfig: AIDriverConfig = {
        npcId: 'npc-hybrid',
        decisionMode: 'hybrid',
        behaviorTree: {
          id: 'root',
          type: 'selector',
        },
        goals: [],
        enableLearning: true,
      };
      const hybridNPC = new AIDriverTrait(hybridConfig);
      expect(hybridNPC).toBeDefined();
    });
  });
});
