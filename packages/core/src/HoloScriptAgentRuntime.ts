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
import { MemoryConsolidator, EpisodicMemory, SemanticFact } from '@holoscript/framework/learning';

/**
 * Runtime shape of a directive found in OrbNode.directives at runtime.
 * The declared HSPlusDirective union doesn't cover 'method'/'lifecycle' with
 * full ParameterNode[] parameters, but the runtime data does include these.
 */
interface RuntimeDirective {
  /** The directive type identifier */
  type: string;
  /** Optional directive name for method directives */
  name?: string;
  /** Optional lifecycle hook name for lifecycle directives */
  hook?: string;
  /** Optional parameters for methods and lifecycle hooks */
  parameters?: ParameterNode[];
  /** The directive body content */
  body?: unknown;
}

export interface AgentSeed {
  wallet: string;
  handle: string;
  brainCompositionRef: string;
  memorySnapshotHash: string;
  resumeStepId?: string;
  semanticFacts?: SemanticFact[];
}

export interface DurableAgentState {
  wallet?: string;
  handle?: string;
  brainCompositionRef?: string;
  memorySnapshotHash?: string;
  resumeStepId?: string;
  semanticFacts: SemanticFact[];
  annotations: {
    wallet: 'durable';
    handle: 'durable';
    brainCompositionRef: 'durable';
    memorySnapshotHash: 'durable';
    resumeStepId: 'durable';
    semanticFacts: 'durable';
  };
}

export interface LosableAgentState {
  reactiveState: Record<string, HoloScriptValue>;
  runningActions: string[];
  rawEpisodes: EpisodicMemory[];
  annotations: {
    reactiveState: 'losable';
    runningActions: 'losable';
    rawEpisodes: 'losable';
  };
}

function stringProperty(value: HoloScriptValue | undefined): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function createDetachedParentRuntime(): IParentRuntime {
  const rootScope: Scope = { variables: new Map<string, HoloScriptValue>() };

  return {
    async callFunction(functionName: string): Promise<ExecutionResult> {
      return {
        success: false,
        error: `Detached hydrated agent cannot call function: ${functionName}`,
      };
    },
    getRootScope: () => rootScope,
    getVariable: () => undefined,
    async executeProgram(): Promise<ExecutionResult[]> {
      return [{ success: false, error: 'Detached hydrated agent cannot execute programs' }];
    },
    emit: async () => undefined,
    async executeHoloProgram(): Promise<ExecutionResult[]> {
      return [{ success: false, error: 'Detached hydrated agent cannot execute Holo programs' }];
    },
    evaluateExpression: () => undefined,
  };
}

/**
 * Specialized runtime for individual HoloScript agents providing sandboxed execution,
 * local state management, and autonomous behavior capabilities.
 *
 * @example
 * ```typescript
 * const agentRuntime = new HoloScriptAgentRuntime(agentNode, parentRuntime);
 * const result = await agentRuntime.executeAction('patrol', []);
 * const decision = await agentRuntime.think('What should I do next?');
 * ```
 */
export class HoloScriptAgentRuntime {
  private agentNode!: OrbNode;
  private parentRuntime!: IParentRuntime;
  private localState!: ReactiveState;
  private runningActions: Map<string, Promise<unknown>> = new Map();
  private isDestroyed: boolean = false;
  private wallet?: string;
  private handle?: string;
  private brainCompositionRef?: string;
  private memorySnapshotHash?: string;
  private resumeStepId?: string;

  // Episodic Memory & Semantic Extraction (Phase 7)
  private rawEpisodes: EpisodicMemory[] = [];
  public semanticFacts: SemanticFact[] = [];
  private consolidationInterval: NodeJS.Timeout | null = null;

  /**
   * Creates a new HoloScript agent runtime instance.
   *
   * @param agentNode - The OrbNode representing the agent template
   * @param parentRuntime - The parent runtime providing global context
   *
   * @example
   * ```typescript
   * const runtime = new HoloScriptAgentRuntime(miningAgentNode, mainRuntime);
   * ```
   */
  constructor(agentNode?: OrbNode, parentRuntime?: IParentRuntime) {
    if (!agentNode || !parentRuntime) {
      // Preallocation mode
      return;
    }
    this.agentNode = agentNode;
    this.parentRuntime = parentRuntime;
    this.localState = new ReactiveState(agentNode.properties || {});
    this.bindDurableIdentity(agentNode.properties || {});
    this.initializeAgentContext();
  }

  /**
   * Rehydrate an agent identity from substrate-anchored seed data without relying
   * on the previous neural map. Reactive state, running actions, and episodes
   * start empty; only durable identity fields and semantic facts are replayed.
   */
  static hydrate(
    seed: AgentSeed,
    parentRuntime: IParentRuntime = createDetachedParentRuntime()
  ): HoloScriptAgentRuntime {
    const agentNode: OrbNode = {
      type: 'orb',
      id: seed.handle,
      name: seed.handle,
      template: seed.brainCompositionRef,
      properties: {},
      directives: [],
    };
    const runtime = new HoloScriptAgentRuntime(agentNode, parentRuntime);
    runtime.applySeed(seed);
    return runtime;
  }

  /**
   * Reset the runtime for pooling reuse with new agent configuration.
   *
   * @param agentNode - New agent node to bind to this runtime
   * @param parentRuntime - Parent runtime for global context
   */
  public reset(agentNode: OrbNode, parentRuntime: IParentRuntime): void {
    this.agentNode = agentNode;
    this.parentRuntime = parentRuntime;
    this.localState = new ReactiveState(agentNode.properties || {});
    this.runningActions.clear();
    this.isDestroyed = false;
    this.bindDurableIdentity(agentNode.properties || {});
    this.initializeAgentContext();
  }

  private bindDurableIdentity(properties: Record<string, HoloScriptValue>): void {
    this.wallet = stringProperty(properties.wallet);
    this.handle = stringProperty(properties.handle) ?? this.agentNode.name;
    this.brainCompositionRef =
      stringProperty(properties.brainCompositionRef) ?? this.agentNode.template ?? this.agentNode.name;
    this.memorySnapshotHash = stringProperty(properties.memorySnapshotHash);
    this.resumeStepId = stringProperty(properties.resumeStepId);
  }

  private applySeed(seed: AgentSeed): void {
    this.wallet = seed.wallet;
    this.handle = seed.handle;
    this.brainCompositionRef = seed.brainCompositionRef;
    this.memorySnapshotHash = seed.memorySnapshotHash;
    this.resumeStepId = seed.resumeStepId;
    this.semanticFacts = [...(seed.semanticFacts ?? [])];
    this.rawEpisodes = [];
    this.runningActions.clear();
  }

  durable(): DurableAgentState {
    return {
      wallet: this.wallet,
      handle: this.handle,
      brainCompositionRef: this.brainCompositionRef,
      memorySnapshotHash: this.memorySnapshotHash,
      resumeStepId: this.resumeStepId,
      semanticFacts: [...this.semanticFacts],
      annotations: {
        wallet: 'durable',
        handle: 'durable',
        brainCompositionRef: 'durable',
        memorySnapshotHash: 'durable',
        resumeStepId: 'durable',
        semanticFacts: 'durable',
      },
    };
  }

  losable(): LosableAgentState {
    return {
      reactiveState: this.localState.getSnapshot(),
      runningActions: Array.from(this.runningActions.keys()),
      rawEpisodes: [...this.rawEpisodes],
      annotations: {
        reactiveState: 'losable',
        runningActions: 'losable',
        rawEpisodes: 'losable',
      },
    };
  }

  /**
   * Initialize the agent's execution context and memory consolidation.
   */
  private initializeAgentContext(): void {
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
   *
   * @param action - The action that was performed
   * @param outcome - The result or outcome of the action
   * @param entitiesInvolved - List of entity IDs that were involved in the episode
   *
   * @example
   * ```typescript
   * agentRuntime.recordEpisode('mine_ore', 'collected 5 iron ore', ['ore_deposit_1', 'inventory']);
   * ```
   */
  public recordEpisode(action: string, outcome: string, entitiesInvolved: string[]): void {
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
  private consolidateMemory(): void {
    if (this.isDestroyed || this.rawEpisodes.length < 5) return;

    const { newFacts, prunedEpisodes } = MemoryConsolidator.compressEpisodes(this.rawEpisodes);
    if (newFacts.length > 0) {
      this.semanticFacts.push(...newFacts);
      this.rawEpisodes = this.rawEpisodes.filter((e) => !prunedEpisodes.includes(e.id));
    }
    
    // Actively prevent Memory Degradation (G.USER.002) by pruning stale context
    this.semanticFacts = MemoryConsolidator.pruneStaleFacts(this.semanticFacts);
  }

  /**
   * Lightweight fork-detection heuristic for runtime adapters.
   * Scans brain composition ref, template, and string properties for
   * HS010-blocked keywords, unknown compiler versions, non-canonical imports,
   * and no-op security traits.  Self-contained (no mcp-server imports).
   */
  private checkForkSandbox(): { allowed: boolean; reason?: string } {
    const sources: string[] = [];
    if (this.brainCompositionRef) sources.push(this.brainCompositionRef);
    if (this.agentNode.template) sources.push(this.agentNode.template);
    for (const val of Object.values(this.agentNode.properties || {})) {
      if (typeof val === 'string') sources.push(val);
    }
    const directives = this.agentNode.directives as unknown as Array<{ body?: unknown }> | undefined;
    if (directives) {
      for (const d of directives) {
        if (typeof d.body === 'string') sources.push(d.body);
      }
    }

    const blockedKeywords = [
      'process', 'fs', 'require', 'eval', 'exec', 'spawn',
      'child_process', 'constructor', 'prototype', 'globalThis',
    ];
    const canonicalVersions = ['7.0.0', '6.0.2', '6.0.1', '6.0.0'];

    for (const src of sources) {
      for (const kw of blockedKeywords) {
        if (new RegExp(`\\b${kw}\\b`).test(src)) {
          return { allowed: false, reason: `HS010-blocked-keyword:${kw}` };
        }
      }
      const versionMatch = src.match(/@compiler\s+version\s+["']?([\d.]+)["']?/i);
      if (versionMatch) {
        const claimed = versionMatch[1];
        if (!canonicalVersions.includes(claimed)) {
          return { allowed: false, reason: `unknown-compiler-version:${claimed}` };
        }
      }
      if (/\bfrom\s+['"](?!@holoscript\/)[@\w\/-]+['"]/.test(src)) {
        return { allowed: false, reason: 'non-canonical-import' };
      }
      if (/(?:^|\s)@security_sandbox\b/.test(src) && !/\bimport\s+.*security-sandbox/.test(src)) {
        return { allowed: false, reason: 'no-op-security-trait' };
      }
    }
    return { allowed: true };
  }

  /**
   * Execute an action (method) defined on the agent template.
   *
   * @param actionName - Name of the action/method to execute
   * @param args - Arguments to pass to the action method
   * @returns Promise resolving to execution result
   * @throws {Error} When agent is destroyed or action execution fails
   *
   * @example
   * ```typescript
   * const result = await agentRuntime.executeAction('patrol', ['north_sector']);
   * if (result.success) {
   *   console.log('Patrol completed:', result.output);
   * }
   * ```
   */
  async executeAction(actionName: string, args: HoloScriptValue[] = []): Promise<ExecutionResult> {
    if (this.isDestroyed) return { success: false, error: 'Agent destroyed' };

    // ── Fork Sandbox Gate (canary task_1778618757735_zpt5) ──────────────────
    // Reject actions from agents whose brain composition or template looks forked.
    const forkCheck = this.checkForkSandbox();
    if (!forkCheck.allowed) {
      logger.warn(`[Agent:${this.agentNode.name}] ForkSandboxGate blocked action "${actionName}": ${forkCheck.reason}`);
      return { success: false, error: `ForkSandboxGate: ${forkCheck.reason}` };
    }

    // Search directives for method-type entries (runtime shape may differ from declared types)
    const directives = this.agentNode.directives as unknown as RuntimeDirective[] | undefined;
    const action = directives?.find((d) => d.type === 'method' && d.name === actionName) as
      | (MethodNode & RuntimeDirective)
      | undefined;

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
      // Check if action.body is HoloStatement[]
      if (Array.isArray(action.body)) {
        const results = await this.parentRuntime.executeHoloProgram(action.body, agentScope);
        const success = results.every((r: ExecutionResult) => r.success);
        return {
          success,
          output: results[results.length - 1]?.output,
          error: results.find((r: ExecutionResult) => !r.success)?.error,
        };
      } else {
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
   * Autonomous 'thinking' cycle using LLM for decision making.
   *
   * @param prompt - Optional specific prompt for the LLM, defaults to general decision prompt
   * @returns Promise resolving to the LLM's decision as a string
   *
   * @example
   * ```typescript
   * const decision = await agentRuntime.think('Should I retreat or continue attacking?');
   * console.log('Agent decision:', decision);
   * ```
   */
  async think(prompt?: string): Promise<string> {
    logger.info(`[Agent:${this.agentNode.name}] Thinking...`);

    // Emit event for the bridge/orchestrator to handle LLM call
    const result = await this.parentRuntime.emit('agent_think', {
      agentId: this.agentNode.name,
      context: this.localState.getSnapshot(),
      prompt: prompt || 'Decide the next best action based on current state.',
    });

    return (
      ((result as Record<string, unknown> | undefined)?.decision as string) ||
      'No clear decision made.'
    );
  }

  /**
   * Handle lifecycle events for this specific agent.
   *
   * @param eventType - The type of event being handled
   * @param data - Event data to bind to the execution scope
   *
   * @example
   * ```typescript
   * await agentRuntime.onEvent('enemy_spotted', {
   *   enemy: 'orc_warrior',
   *   distance: 50
   * });
   * ```
   */
  async onEvent(eventType: string, data: unknown): Promise<void> {
    if (this.isDestroyed) return;

    // Search directives for lifecycle hooks (runtime shape may differ from declared types)
    const directives = this.agentNode.directives as unknown as RuntimeDirective[] | undefined;
    const handler = directives?.find((d) => d.type === 'lifecycle' && d.hook === eventType);

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

  /**
   * Clean up the agent runtime, stopping all running processes and timers.
   */
  destroy(): void {
    this.isDestroyed = true;
    this.runningActions.clear();

    if (this.consolidationInterval) {
      clearInterval(this.consolidationInterval);
      this.consolidationInterval = null;
    }

    logger.info(`[Agent:${this.agentNode?.name ?? 'unbound'}] Runtime destroyed.`);
  }

  /**
   * Get the agent's unique identifier.
   *
   * @returns The agent's ID or name
   */
  get id(): string {
    return this.agentNode.id || this.agentNode.name;
  }

  /**
   * Get the agent's current reactive state proxy.
   *
   * @returns Proxy object for the agent's state
   */
  get state(): HoloScriptValue {
    return this.localState.getProxy();
  }

  /**
   * Get the agent's current reactive state proxy.
   *
   * @returns Proxy object for the agent's state
   */
  getState(): HoloScriptValue {
    return this.localState.getProxy();
  }
}
