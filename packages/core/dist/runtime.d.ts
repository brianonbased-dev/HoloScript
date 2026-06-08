// @holoscript/core/runtime — engine/mesh/framework-backed runtime surface.
// Hand-crafted to mirror src/runtime.ts exactly (the value surface of dist/runtime.js).
// Requires the optional peers (@holoscript/engine, @holoscript/mesh, @holoscript/framework) installed.

/** Execution result shape — mirrors dist/index.d.ts ExecutionResult exactly */
export interface ExecutionResult {
  success: boolean;
  result?: unknown;
  error?: string;
  duration?: number;
  memoryUsed?: number;
  executionTime?: number;
  hologram?: { shape?: string; color?: string; [key: string]: unknown };
  spatialPosition?: { x: number; y: number; z: number; [key: string]: unknown };
  output?: unknown;
}

/** Minimal runtime context — mirrors the shape callers destructure */
export interface RuntimeContext {
  variables: Map<string, unknown>;
  functions: Map<string, unknown>;
  [key: string]: unknown;
}

export class HoloScriptRuntime {
  constructor(importLoader?: unknown, customFunctions?: Record<string, (...args: unknown[]) => unknown>);
  execute(ast: unknown, context?: unknown): Promise<unknown>;
  executeProgram(nodes: unknown[], depth?: number): Promise<ExecutionResult[]>;
  executeHoloProgram(statements: unknown[], scopeOverride?: unknown): Promise<ExecutionResult[]>;
  getContext(): RuntimeContext;
  reset(): void;
  startVisualizationServer(port?: number): void;
  broadcast(type: string, payload: unknown): void;
  on(event: string, handler: (...args: unknown[]) => unknown): void;
  off(event: string, handler?: (...args: unknown[]) => unknown): void;
  emit(event: string, data?: unknown): Promise<void>;
  setVariable(name: string, value: unknown, scopeOverride?: unknown): void;
  getVariable(name: string, scopeOverride?: unknown): unknown;
  callFunction(name: string, args?: unknown[]): Promise<unknown>;
  registerFunction(name: string, handler: (...args: unknown[]) => unknown): void;
  registerTrait(name: string, handler: unknown): void;
  getState(): Record<string, unknown>;
  getRootScope(): unknown;
  getExecutionHistory(): ExecutionResult[];
  getCallStack(): string[];
}

export interface RuntimeOptions { [key: string]: any; }
export interface Renderer { [key: string]: any; }
export interface ExecutionResult { success: boolean; result?: any; error?: string; duration?: number; memoryUsed?: number; }

export class HoloScriptPlusRuntimeImpl {
  constructor(options?: RuntimeOptions);
  execute(ast: any, context?: any): Promise<ExecutionResult>;
  createRenderer(config?: any): Renderer;
  getState(): Record<string, any>;
  setState(updates: Record<string, any>): void;
  dispose(): void;
}

export function createRuntime(options?: RuntimeOptions): HoloScriptPlusRuntimeImpl;

// --- plugin-trait-registrar ---
export interface TraitRegistrarTarget { registerTrait(name: string, handler: unknown): void; }
export function registerPluginTraits(target: TraitRegistrarTarget, pluginId: string, handlers: readonly unknown[]): void;

// --- Local runtime symbols (cannot be re-exported from peer subpaths) ---
export class HoloScriptAgentRuntime {
  constructor(...args: any[]);
  [key: string]: any;
}
export type AgentSeed = any;
export type DurableAgentState = any;
export type LosableAgentState = any;

export class HoloScriptDebugger {
  debug(ast: any): any;
  on(event: string, callback: any): void;
  start(): void;
  stop(): void;
  loadSource(source: string, path?: string): { success: boolean; errors?: string[] };
  clearBreakpoints(): void;
  setBreakpoint(line: number, options?: any): any;
  continue(): void;
  stepOver(): void;
  stepInto(): void;
  stepOut(): void;
  pause(): void;
  getCallStack(): any[];
  getState(): any;
  getRuntime(): any;
  evaluate(expression: string, frameId?: number): any;
  getVariables(frameId?: number): any;
}
export function createDebugger(options?: any): HoloScriptDebugger;

// --- framework/ai ---
export { BehaviorTree, BTNode, SequenceNode, SelectorNode, ParallelNode, InverterNode, RepeaterNode, GuardNode, ActionNode, ConditionNode, WaitNode, Blackboard, StateMachine } from '@holoscript/framework/ai';
// --- framework/agents ---
export { CulturalMemory, NormEngine, negotiateHandoff, createMVCPayload, estimatePayloadSize, validatePayloadBudget, signOperation, verifyOperation, LWWRegister, GCounter, ORSet, createAgentState, setRegister, getRegister, incrementCounter, getCounter, mergeStates, AgentRegistry, getDefaultRegistry, resetDefaultRegistry } from '@holoscript/framework/agents';
// --- framework/swarm ---
export { SwarmCoordinator, LeaderElection, CollectiveIntelligence, SwarmManager, SwarmMembership, SwarmMetrics, SwarmInspector } from '@holoscript/framework/swarm';
// --- framework/training ---
export { SparsityMonitor, createSparsityMonitor } from '@holoscript/framework/training';
// --- engine ---
export { DialogueGraph, DialogueRunner } from '@holoscript/engine/dialogue';
export { CameraController } from '@holoscript/engine/camera';
export { InventorySystem } from '@holoscript/engine/gameplay';
export { TerrainSystem } from '@holoscript/engine/environment';
export { LightingModel, ShaderGraph, SHADER_NODES } from '@holoscript/engine/rendering';
export { CombatManager } from '@holoscript/engine/combat';
export { AStarPathfinder, NavMesh } from '@holoscript/engine/navigation';
export { ParticleSystem } from '@holoscript/engine/particles';
export { LODManager } from '@holoscript/engine/world';
export { InputManager } from '@holoscript/engine/input';
export { CultureRuntime } from '@holoscript/engine/runtime';
export { GaussianSplatExtractor } from '@holoscript/engine/gpu';
export { ChoreographyEngine, getDefaultEngine, resetDefaultEngine } from '@holoscript/engine/choreography';
// --- mesh ---
export { CollaborationSession, NetworkManager, WebRTCTransport } from '@holoscript/mesh';
export { ConsensusManager } from '@holoscript/mesh/consensus';
export { AgentMessaging } from '@holoscript/mesh/messaging';
