// @holoscript/core/runtime — engine/mesh/framework-backed runtime surface.
// These symbols REQUIRE the optional peers installed. Moved off the main '@holoscript/core'
// barrel so a cold `import '@holoscript/core'` (no peers) loads without crashing (cold-consume fix).
export * from './HoloScriptRuntime';
export { HoloScriptAgentRuntime } from './HoloScriptAgentRuntime';
export type { AgentSeed, DurableAgentState, LosableAgentState } from './HoloScriptAgentRuntime';
// Debugger constructs HoloScriptRuntime (-> @holoscript/engine), so it lives here, not the cold barrel.
export { HoloScriptDebugger, createDebugger } from './HoloScriptDebugger';

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
