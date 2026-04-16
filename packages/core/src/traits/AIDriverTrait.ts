/**
 * @holoscript/core AI-Driven NPC Trait
 *
 * Enables intelligent NPC behaviors using behavior trees and goal planning
 * Integrates with Infinity Assistant service for agent-based decision making
 *
 * Design backlog (P.XR.01): Map to tiered XR agent architecture.
 *   This trait is Layer 1 (Reactive, <50ms) in the XR stack.
 *   BehaviorTreeRunner should run on CPU at <50ms budget.
 *   GOAP planner maps to Layer 2 (Reasoning, <500ms) on Hexagon NPU.
 *   Add inferenceTier field to AIDriverConfig: 'cpu_reactive' | 'npu_reasoning' | 'cloud_strategic'.
 *
 * Design backlog (P.XR.04): Async NPU agent loop integration.
 *   tick() currently runs on setInterval(100ms). On XR, reasoning tier
 *   should run on a separate async NPU loop, decoupled from GPU render.
 *   Results delivered via lock-free queue. No frame drops.
 *
 * Design backlog (P.SIG25.03): AI-driven animation from prompts.
 *   "Any Character, Any Movement" (SIGGRAPH 2025) — BehaviorState should
 *   accept natural language movement descriptions that generate animation
 *   at runtime via diffusion models. No keyframes, no mocap.
 */

export type BehaviorState = 'idle' | 'moving' | 'acting' | 'talking' | 'reacting';
export type DecisionMode = 'reactive' | 'goal-driven' | 'learning' | 'hybrid';

/**
 * P.XR.01: Inference tier for XR agent architecture.
 * Maps agent processing to hardware: CPU for reactive, NPU for reasoning, cloud for strategic.
 */
export type InferenceTier = 'cpu_reactive' | 'npu_reasoning' | 'cloud_strategic';

/**
 * Behavior tree node
 */
export interface BehaviorNode {
  id: string;
  type: 'sequence' | 'selector' | 'parallel' | 'action' | 'condition';
  children?: BehaviorNode[];
  action?: (context: NPCContext) => Promise<boolean>;
  condition?: (context: NPCContext) => boolean;
  metadata?: Record<string, unknown>;
}

/**
 * NPC Context for behavior execution
 */
export interface NPCContext {
  npcId: string;
  position: [number, number, number];
  rotation: [number, number, number];
  targetId?: string;
  targetPosition?: [number, number, number];
  memory: Map<string, unknown>;
  state: BehaviorState;
  energy: number; // 0-1
  mood: number; // -1 to 1 (negative = sad, positive = happy)
  perception: {
    nearbyEntities: string[];
    visibleEntities: string[];
    hearableVoice?: string;
  };
  dialogue?: {
    lastSaid?: string;
    lastHeard?: string;
    conversationHistory: Array<{ speaker: string; text: string }>;
  };
}

/**
 * Goal for GOAP-style planning
 */
export interface NPCGoal {
  id: string;
  name: string;
  priority: number; // 0-1
  preconditions: Map<string, unknown>;
  effects: Map<string, unknown>;
  cost: number;
  timeoutMs?: number;
}

/**
 * AI-Driven NPC configuration
 */
export interface AIDriverConfig {
  /** NPC identifier */
  npcId: string;

  /** Decision making mode */
  decisionMode: DecisionMode;

  /** Base behavior tree */
  behaviorTree?: BehaviorNode;

  /** Available goals */
  goals?: NPCGoal[];

  /** Personality traits */
  personality?: {
    sociability: number; // 0-1
    aggression: number; // 0-1
    curiosity: number; // 0-1
    loyalty: number; // 0-1
  };

  /** Response to stimuli */
  stimuliThresholds?: {
    hearing: number; // perception distance
    sight: number; // vision distance
    touch: number; // collision distance
  };

  /** Learning config */
  enableLearning?: boolean;
  learningRate?: number;

  /** Infinity Assistant integration */
  agentId?: string;

  /** P.XR.01: Inference tier for XR agent deployment */
  inferenceTier?: InferenceTier;

  /** P.XR.04: Async NPU loop interval (ms) — decoupled from GPU render */
  npuLoopIntervalMs?: number;
}

/**
 * Behavior tree runner
 */
export class BehaviorTreeRunner {
  private rootNode: BehaviorNode;

  constructor(rootNode: BehaviorNode) {
    this.rootNode = rootNode;
  }

  async tick(context: NPCContext): Promise<boolean> {
    return this.executeNode(this.rootNode, context);
  }

  private async executeNode(node: BehaviorNode, context: NPCContext): Promise<boolean> {
    if (node.type === 'action') {
      if (node.action) {
        try {
          return await node.action(context);
        } catch (error) {
          console.error(`Action failed: ${node.id}`, error);
          return false;
        }
      }
      return true;
    }

    if (node.type === 'condition') {
      return node.condition ? node.condition(context) : true;
    }

    if (node.type === 'sequence') {
      for (const child of node.children || []) {
        const result = await this.executeNode(child, context);
        if (!result) return false;
      }
      return true;
    }

    if (node.type === 'selector') {
      for (const child of node.children || []) {
        const result = await this.executeNode(child, context);
        if (result) return true;
      }
      return false;
    }

    if (node.type === 'parallel') {
      const results = await Promise.all(
        (node.children || []).map((child) => this.executeNode(child, context))
      );
      return results.every((r) => r);
    }

    return true;
  }
}

/**
 * Goal-Oriented Action Planning (GOAP)
 */
export class GOAPPlanner {
  private goals: NPCGoal[];

  constructor(goals: NPCGoal[]) {
    this.goals = goals.sort((a, b) => b.priority - a.priority);
  }

  /**
   * Plan a sequence of actions to reach goal
   */
  planGoal(currentState: Map<string, unknown>, _goal: NPCGoal): NPCGoal[] {
    // Simple greedy planner: select highest-priority achievable goal
    for (const g of this.goals) {
      if (this.canAchieve(currentState, g)) {
        return [g];
      }
    }
    return [];
  }

  private canAchieve(currentState: Map<string, unknown>, goal: NPCGoal): boolean {
    for (const [key, value] of goal.preconditions) {
      if (currentState.get(key) !== value) {
        return false;
      }
    }
    return true;
  }
}

/**
 * AIDriverTrait - Enables intelligent NPC behaviors
 */
export class AIDriverTrait {
  private config: AIDriverConfig;
  private context: NPCContext;
  private behaviorRunner: BehaviorTreeRunner | null = null;
  private goapPlanner: GOAPPlanner | null = null;
  private updateInterval: ReturnType<typeof setInterval> | null = null;
  private learningModel: Map<string, number> = new Map();

  constructor(config: AIDriverConfig) {
    const defaults = {
      decisionMode: 'hybrid' as const,
      personality: {
        sociability: 0.5,
        aggression: 0.3,
        curiosity: 0.6,
        loyalty: 0.7,
      },
      stimuliThresholds: {
        hearing: 50,
        sight: 100,
        touch: 5,
      },
      enableLearning: true,
      learningRate: 0.1,
    };
    this.config = { ...defaults, ...config };

    this.context = {
      npcId: config.npcId,
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      memory: new Map(),
      state: 'idle',
      energy: 1.0,
      mood: 0,
      perception: {
        nearbyEntities: [],
        visibleEntities: [],
      },
    };

    if (config.behaviorTree) {
      this.behaviorRunner = new BehaviorTreeRunner(config.behaviorTree);
    }

    if (config.goals && config.goals.length > 0) {
      this.goapPlanner = new GOAPPlanner(config.goals);
    }
  }

  /**
   * Start NPC AI loop
   */
  public startAI(): void {
    if (this.updateInterval) return;

    this.updateInterval = setInterval(() => {
      this.tick();
    }, 100); // 10 Hz update rate
  }

  /**
   * Stop NPC AI loop
   */
  public stopAI(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
  }

  /**
   * Main AI tick
   */
  private async tick(): Promise<void> {
    // Update energy (decreases over time)
    this.context.energy = Math.max(0, this.context.energy - 0.001);

    // Stress/mood changes
    if (this.context.perception.visibleEntities.length > 0) {
      this.context.mood += 0.1 * (Math.random() - 0.5);
    }

    // Execute appropriate decision mode
    switch (this.config.decisionMode) {
      case 'reactive':
        await this.reactiveDecision();
        break;
      case 'goal-driven':
        await this.goalDrivenDecision();
        break;
      case 'learning':
        await this.learningDecision();
        break;
      case 'hybrid':
        await this.hybridDecision();
        break;
    }
  }

  /**
   * Reactive decision: immediate response to stimuli
   */
  private async reactiveDecision(): Promise<void> {
    if (this.behaviorRunner) {
      await this.behaviorRunner.tick(this.context);
    }
  }

  /**
   * Goal-driven decision: plan towards objectives
   */
  private async goalDrivenDecision(): Promise<void> {
    if (!this.goapPlanner) return;

    const worldState = this.buildWorldState();
    // Select highest priority goal
    const plan = this.goapPlanner.planGoal(
      worldState,
      this.config.goals?.[0] || {
        id: 'idle',
        name: 'Idle',
        priority: 0,
        preconditions: new Map(),
        effects: new Map(),
        cost: 0,
      }
    );

    if (plan.length > 0) {
      // Execute plan
      this.context.state = 'moving';
    }
  }

  /**
   * Learning decision: adapt behavior from experience
   */
  private async learningDecision(): Promise<void> {
    // Composite reactive + learning
    await this.reactiveDecision();

    // Learn from interactions
    if (this.config.enableLearning) {
      this.updateLearningModel();
    }
  }

  /**
   * Hybrid decision: combination of reactive and goal-driven
   */
  private async hybridDecision(): Promise<void> {
    // Execute behavior tree (reactive)
    if (this.behaviorRunner) {
      const treeResult = await this.behaviorRunner.tick(this.context);

      // If no immediate action, pursue goals
      if (!treeResult && this.goapPlanner) {
        await this.goalDrivenDecision();
      }
    }
  }

  /**
   * Build world state for planning
   */
  private buildWorldState(): Map<string, unknown> {
    const state = new Map<string, unknown>();
    state.set('position', this.context.position);
    state.set('energy', this.context.energy);
    state.set('mood', this.context.mood);
    state.set('nearbyEntities', this.context.perception.nearbyEntities.length);
    return state;
  }

  /**
   * Update learning model from interactions
   */
  private updateLearningModel(): void {
    // Simple Q-learning-like update
    const currentReward = this.calculateReward();
    const learningRate = this.config.learningRate || 0.1;

    // Update learned value estimates
    const stateKey = `state_${this.context.state}`;
    const currentValue = this.learningModel.get(stateKey) || 0;
    const newValue = currentValue + learningRate * (currentReward - currentValue);
    this.learningModel.set(stateKey, newValue);
  }

  /**
   * Calculate immediate reward
   */
  private calculateReward(): number {
    let reward = 0;

    // Reward based on energy maintenance
    if (this.context.energy > 0.5) reward += 1;

    // Reward based on social interaction (if sociable)
    if (
      this.config.personality?.sociability ||
      (0 > 0.5 && this.context.perception.nearbyEntities.length > 0)
    ) {
      reward += 1;
    }

    // Reward based on goal progress
    if (this.context.state !== 'idle') reward += 0.5;

    return reward;
  }

  /**
   * Set NPC position
   */
  public setPosition(position: [number, number, number]): void {
    this.context.position = position;
  }

  /**
   * Update perception (nearby entities, visible targets)
   */
  public updatePerception(nearbyEntities: string[], visibleEntities: string[]): void {
    this.context.perception.nearbyEntities = nearbyEntities;
    this.context.perception.visibleEntities = visibleEntities;
  }

  /**
   * Add dialogue to conversation history
   */
  public speak(text: string): void {
    if (!this.context.dialogue) {
      this.context.dialogue = { conversationHistory: [] };
    }
    this.context.dialogue.lastSaid = text;
    this.context.dialogue.conversationHistory.push({
      speaker: this.config.npcId,
      text,
    });
  }

  /**
   * Receive dialogue from another entity
   */
  public hear(speaker: string, text: string): void {
    if (!this.context.dialogue) {
      this.context.dialogue = { conversationHistory: [] };
    }
    this.context.dialogue.lastHeard = text;
    this.context.dialogue.conversationHistory.push({
      speaker,
      text,
    });
  }

  /**
   * Get current NPC context
   */
  public getContext(): Readonly<NPCContext> {
    return { ...this.context };
  }

  /**
   * Dispose and cleanup
   */
  public dispose(): void {
    this.stopAI();
    this.context.memory.clear();
    this.learningModel.clear();
  }
}

/**
 * HoloScript+ @ai_driven trait factory
 */
export function createAIDriverTrait(config: AIDriverConfig): AIDriverTrait {
  return new AIDriverTrait(config);
}

// ── Handler (delegates to BehaviorTreeRunner) ──
import type {
  TraitHandler,
  HSPlusNode,
  TraitContext,
  TraitEvent,
  TraitInstanceDelegate,
} from './TraitTypes';

export const aIDriverHandler = {
  name: 'a_i_driver',
  defaultConfig: {},
  onAttach(node: HSPlusNode, config: unknown, ctx: TraitContext): void {
    // @ts-expect-error
    const instance = new BehaviorTreeRunner(config);
    node.__a_i_driver_instance = instance;
    ctx.emit('a_i_driver_attached', { node, config });
  },
  onDetach(node: HSPlusNode, _config: unknown, ctx: TraitContext): void {
    const instance = node.__a_i_driver_instance as TraitInstanceDelegate;
    if (instance) {
      if (typeof instance.onDetach === 'function') instance.onDetach(node, ctx);
      else if (typeof instance.dispose === 'function') instance.dispose();
      else if (typeof instance.cleanup === 'function') instance.cleanup();
    }
    ctx.emit('a_i_driver_detached', { node });
    delete node.__a_i_driver_instance;
  },
  onEvent(node: HSPlusNode, _config: unknown, ctx: TraitContext, event: TraitEvent): void {
    const instance = node.__a_i_driver_instance as TraitInstanceDelegate;
    if (!instance) return;
    if (typeof instance.onEvent === 'function') instance.onEvent(event);
    else if (typeof instance.emit === 'function' && event.type) instance.emit(event);
    if (event.type === 'a_i_driver_configure' && event.payload) {
      Object.assign(instance, event.payload);
      ctx.emit('a_i_driver_configured', { node });
    }
  },
  onUpdate(node: HSPlusNode, _config: unknown, ctx: TraitContext, dt: number): void {
    const instance = node.__a_i_driver_instance as TraitInstanceDelegate;
    if (!instance) return;
    if (typeof instance.onUpdate === 'function') instance.onUpdate(node, ctx, dt);
  },
} as const satisfies TraitHandler;
