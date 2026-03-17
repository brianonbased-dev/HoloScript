/**
 * HoloScript Agent Runtime
 *
 * A specialized, sandboxed runtime for individual agents.
 * Provides local state, 'this' context, and independent execution lifecycles.
 */

import { logger } from './logger';
import type { IParentRuntime, Scope } from './runtime/IParentRuntime';
import type { OrbNode, HoloScriptValue, ExecutionResult, MethodNode, ParameterNode } from './types';
import { ReactiveState } from './ReactiveState';
import { MemoryConsolidator, EpisodicMemory, SemanticFact } from './learning/MemoryConsolidator';

// Runtime shape of a directive found in OrbNode.directives at runtime.
// The declared HSPlusDirective union doesn't cover 'method'/'lifecycle' with
// full ParameterNode[] parameters, but the runtime data does include these.
interface RuntimeDirective {
  type: string;
  name?: string;
  hook?: string;
  parameters?: ParameterNode[];
  body?: unknown;
}

export class HoloScriptAgentRuntime {
  private agentNode!: OrbNode;
  private parentRuntime!: IParentRuntime;
  private localState!: ReactiveState;
  private runningActions: Map<string, Promise<unknown>> = new Map();
  private isDestroyed: boolean = false;

  // Episodic Memory & Semantic Extraction (Phase 7 // TODO-019)
  private rawEpisodes: EpisodicMemory[] = [];
  public semanticFacts: SemanticFact[] = [];
  private consolidationInterval: NodeJS.Timeout | null = null;

  constructor(agentNode?: OrbNode, parentRuntime?: IParentRuntime) {
    if (!agentNode || !parentRuntime) {
      // Preallocation mode
      return;
    }
    this.agentNode = agentNode;
    this.parentRuntime = parentRuntime;
    this.localState = new ReactiveState(agentNode.properties || {});
    this.initializeAgentContext();
  }

  /**
   * Reset for pooling
   */
  public reset(agentNode: OrbNode, parentRuntime: IParentRuntime) {
    this.agentNode = agentNode;
    this.parentRuntime = parentRuntime;
    this.localState = new ReactiveState(agentNode.properties || {});
    this.runningActions.clear();
    this.isDestroyed = false;
    this.initializeAgentContext();
  }

  private initializeAgentContext() {
    // Create a proxy for 'this' that interacts with localState and node properties
    const _agentContext = {
      id: this.agentNode.id || this.agentNode.name,
      type: this.agentNode.type,
      state: this.localState.getSnapshot(),
      properties: this.agentNode.properties,
      // Helper to update state from within script
      updateState: (updates: Record<string, HoloScriptValue>) => this.localState.update(updates),
    };

    // Inject 'this' and agent-specific builtins into the runtime for this agent
    // Note: We'll use a scoped approach when executing actions

    // Begin the idle memory consolidation loop
    if (!this.consolidationInterval) {
      this.consolidationInterval = setInterval(() => this.consolidateMemory(), 30000); // 30s background cycle
    }
  }

  /**
   * Records a raw episodic event into the agent's short-term history queue.
   */
  public recordEpisode(action: string, outcome: string, entitiesInvolved: string[]) {
    this.rawEpisodes.push({
      id: `ep_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      timestamp: Date.now(),
      action,
      outcome,
      entitiesInvolved,
    });
  }

  /**
   * Internal idle tick leveraging the MemoryConsolidator subsystem to offload processing constraints.
   */
  private consolidateMemory() {
    if (this.isDestroyed || this.rawEpisodes.length < 5) return;

    const { newFacts, prunedEpisodes } = MemoryConsolidator.compressEpisodes(this.rawEpisodes);
    if (newFacts.length > 0) {
      this.semanticFacts.push(...newFacts);
      this.rawEpisodes = this.rawEpisodes.filter((e) => !prunedEpisodes.includes(e.id));
    }
  }

  /**
   * Execute an action (method) defined on the agent template
   */
  async executeAction(actionName: string, args: HoloScriptValue[] = []): Promise<ExecutionResult> {
    if (this.isDestroyed) return { success: false, error: 'Agent destroyed' };

    // Search directives for method-type entries (runtime shape may differ from declared types)
    const directives = this.agentNode.directives as unknown as RuntimeDirective[] | undefined;
    const action = directives?.find(
      (d) => d.type === 'method' && d.name === actionName
    ) as (MethodNode & RuntimeDirective) | undefined;

    console.log(
      `[AGENT_DEBUG] Executing action ${actionName} for ${this.agentNode.name}. Action found: ${!!action}`
    );

    if (!action) {
      // Fallback: check if it's a built-in or global function
      return this.parentRuntime.callFunction(actionName, args);
    }

    logger.info(`[Agent:${this.agentNode.name}] Executing action: ${actionName}`);

    // Create a local scope for this agent
    const agentScope: Scope = {
      variables: new Map<string, HoloScriptValue>(),
      parent: this.parentRuntime.getRootScope(),
    };

    // Bind 'this' and initial state
    const agentData = this.parentRuntime.getVariable(this.agentNode.name) as
      | (Record<string, HoloScriptValue> & { state?: HoloScriptValue })
      | undefined;
    if (agentData && !agentData.state) {
      agentData.state = this.localState.getProxy();
    }

    agentScope.variables.set(
      'this',
      (agentData as HoloScriptValue) ||
        ({
          id: this.agentNode.name,
          state: this.localState.getProxy(),
          properties: this.agentNode.properties,
        } as HoloScriptValue)
    );

    // Bind parameters
    if (action.parameters && args) {
      action.parameters.forEach((param: ParameterNode, i: number) => {
        agentScope.variables.set(param.name, args[i]);
      });
    }

    try {
      console.log(
        `[AGENT_DEBUG] Action body type: ${Array.isArray(action.body) ? 'Array' : typeof action.body}`
      );
      // Check if action.body is HoloStatement[]
      if (Array.isArray(action.body)) {
        console.log(`[AGENT_DEBUG] Executing as HoloProgram with ${action.body.length} statements`);
        const results = await this.parentRuntime.executeHoloProgram(
          action.body,
          agentScope
        );
        const success = results.every((r: ExecutionResult) => r.success);
        return {
          success,
          output: results[results.length - 1]?.output,
          error: results.find((r: ExecutionResult) => !r.success)?.error,
        };
      } else {
        console.log(`[AGENT_DEBUG] Executing as Legacy Program`);
        const results = await this.parentRuntime.executeProgram(action.body, 1);
        const success = results.every((r) => r.success);
        return {
          success,
          output: results[results.length - 1]?.output,
          error: results.find((r) => !r.success)?.error,
        };
      }
    } finally {
      this.runningActions.delete(actionName);
    }
  }

  /**
   * Autonomous 'thinking' cycle using LLM
   */
  async think(prompt?: string): Promise<string> {
    logger.info(`[Agent:${this.agentNode.name}] Thinking...`);

    // Emit event for the bridge/orchestrator to handle LLM call
    const result = await this.parentRuntime.emit('agent_think', {
      agentId: this.agentNode.name,
      context: this.localState.getSnapshot(),
      prompt: prompt || 'Decide the next best action based on current state.',
    });

    return (result as Record<string, unknown> | undefined)?.decision as string || 'No clear decision made.';
  }

  /**
   * Listen for events specifically for this agent
   */
  async onEvent(eventType: string, data: unknown) {
    if (this.isDestroyed) return;

    // Search directives for lifecycle hooks (runtime shape may differ from declared types)
    const directives = this.agentNode.directives as unknown as RuntimeDirective[] | undefined;
    const handler = directives?.find(
      (d) => d.type === 'lifecycle' && d.hook === eventType
    );

    if (handler) {
      // Bind event data to scope
      const eventScope: Scope = {
        variables: new Map<string, HoloScriptValue>(),
        parent: this.parentRuntime.getRootScope(),
      };

      // Bind all keys from data object
      if (data && typeof data === 'object') {
        for (const [key, val] of Object.entries(data as Record<string, unknown>)) {
          eventScope.variables.set(key, val as HoloScriptValue);
        }
      }
      eventScope.variables.set('eventData', data as HoloScriptValue);

      // Bind agent methods to scope so they can be called directly e.g. deployMiners(2)
      directives?.forEach((d) => {
        if (d.type === 'method' && d.name) {
          eventScope.variables.set(d.name, ((...args: HoloScriptValue[]) =>
            this.executeAction(d.name!, args)) as HoloScriptValue);
        }
      });

      // Bind explicitly defined parameters
      const params = handler.parameters;
      if (params && Array.isArray(params) && data && typeof data === 'object') {
        const dataRecord = data as Record<string, unknown>;
        params.forEach((param: ParameterNode) => {
          if (dataRecord[param.name] !== undefined) {
            eventScope.variables.set(param.name, dataRecord[param.name] as HoloScriptValue);
          }
        });
      }

      // Bind 'this'
      const agentData = this.parentRuntime.getVariable(this.agentNode.name) as
        | (Record<string, HoloScriptValue> & { state?: HoloScriptValue })
        | undefined;
      if (agentData && !agentData.state) {
        agentData.state = this.localState.getProxy();
      }
      eventScope.variables.set(
        'this',
        (agentData as HoloScriptValue) ||
          ({
            id: this.agentNode.name,
            state: this.localState.getProxy(),
            properties: this.agentNode.properties,
          } as HoloScriptValue)
      );

      try {
        if (Array.isArray(handler.body)) {
          await this.parentRuntime.executeHoloProgram(handler.body, eventScope);
        } else {
          this.parentRuntime.evaluateExpression(handler.body);
        }
      } finally {
        // No scope restoration needed
      }
    }
  }

  destroy() {
    this.isDestroyed = true;
    this.runningActions.clear();

    if (this.consolidationInterval) {
      clearInterval(this.consolidationInterval);
      this.consolidationInterval = null;
    }

    logger.info(`[Agent:${this.agentNode.name}] Runtime destroyed.`);
  }

  get id() {
    return this.agentNode.id || this.agentNode.name;
  }
  get state() {
    return this.localState.getProxy();
  }

  getState() {
    return this.localState.getProxy();
  }
}
