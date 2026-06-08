// @holoscript/core/runtime — engine/mesh/framework-backed runtime surface.
//
// These symbols REQUIRE the optional peers (`@holoscript/engine`,
// `@holoscript/framework`, `@holoscript/mesh`) installed to actually RUN.
// They were moved off the main `@holoscript/core` `.` barrel so a cold
// `import '@holoscript/core'` (no peers) loads without crashing.
//
// BUT the `./runtime` subpath itself must ALSO import cold: a fresh
// `npm install @holoscript/core` then `import '@holoscript/core/runtime'`
// must RESOLVE even with the optional peers absent — the consumer only hits
// a "install @holoscript/engine" error when they actually CONSTRUCT/CALL a
// peer-backed symbol, never on the bare module import. A static
// `export { X } from '@holoscript/engine/...'` eager-resolves the peer at
// module-load and breaks that (ERR_MODULE_NOT_FOUND), which is exactly the
// W.667/W.673 cold-consume defect board task_1780452479619_c25f tracks
// (verified by scripts/cold-consume-check.mjs).
//
// Fix: re-export every optional-peer VALUE symbol via the same `barrel/lazy-peer`
// helper the `.` barrel uses. `lazyPeerSymbol` returns a callable+constructable
// Proxy that defers peer resolution to first use, so importing this subpath
// touches no optional peer. Every symbol below was verified to be a runtime
// VALUE (not type-only) against the built peers on 2026-06-04; type-only
// re-exports would need plain `export type` (none currently).
import { lazyPeerSymbol } from './barrel/lazy-peer';

// Local runtime classes. `./HoloScriptRuntime` lazy-resolves its own engine
// peers internally (see that file), so this re-export is cold-safe.
export * from './HoloScriptRuntime';
// Shared plugin trait registrar (cold-safe, no optional peers) — premortem P1.
export {
  registerPluginTraits,
  TRAIT_OWNER_KEY,
  type PluginTraitHandler,
  type TraitRegistrarTarget,
} from './runtime/plugin-trait-registrar';
export { HoloScriptAgentRuntime } from './HoloScriptAgentRuntime';
export type { AgentSeed, DurableAgentState, LosableAgentState } from './HoloScriptAgentRuntime';
// Debugger constructs HoloScriptRuntime (-> @holoscript/engine, lazy), so it
// lives here, not the cold `.` barrel.
export { HoloScriptDebugger, createDebugger } from './HoloScriptDebugger';

// --- framework/ai ---
const FW_AI = '@holoscript/framework/ai';
export const BehaviorTree = lazyPeerSymbol(
  FW_AI,
  'BehaviorTree'
) as typeof import('@holoscript/framework/ai').BehaviorTree;
export const BTNode = lazyPeerSymbol(
  FW_AI,
  'BTNode'
) as typeof import('@holoscript/framework/ai').BTNode;
export const SequenceNode = lazyPeerSymbol(
  FW_AI,
  'SequenceNode'
) as typeof import('@holoscript/framework/ai').SequenceNode;
export const SelectorNode = lazyPeerSymbol(
  FW_AI,
  'SelectorNode'
) as typeof import('@holoscript/framework/ai').SelectorNode;
export const ParallelNode = lazyPeerSymbol(
  FW_AI,
  'ParallelNode'
) as typeof import('@holoscript/framework/ai').ParallelNode;
export const InverterNode = lazyPeerSymbol(
  FW_AI,
  'InverterNode'
) as typeof import('@holoscript/framework/ai').InverterNode;
export const RepeaterNode = lazyPeerSymbol(
  FW_AI,
  'RepeaterNode'
) as typeof import('@holoscript/framework/ai').RepeaterNode;
export const GuardNode = lazyPeerSymbol(
  FW_AI,
  'GuardNode'
) as typeof import('@holoscript/framework/ai').GuardNode;
export const ActionNode = lazyPeerSymbol(
  FW_AI,
  'ActionNode'
) as typeof import('@holoscript/framework/ai').ActionNode;
export const ConditionNode = lazyPeerSymbol(
  FW_AI,
  'ConditionNode'
) as typeof import('@holoscript/framework/ai').ConditionNode;
export const WaitNode = lazyPeerSymbol(
  FW_AI,
  'WaitNode'
) as typeof import('@holoscript/framework/ai').WaitNode;
export const Blackboard = lazyPeerSymbol(
  FW_AI,
  'Blackboard'
) as typeof import('@holoscript/framework/ai').Blackboard;
export const StateMachine = lazyPeerSymbol(
  FW_AI,
  'StateMachine'
) as typeof import('@holoscript/framework/ai').StateMachine;

// --- framework/agents ---
const FW_AGENTS = '@holoscript/framework/agents';
export const CulturalMemory = lazyPeerSymbol(
  FW_AGENTS,
  'CulturalMemory'
) as typeof import('@holoscript/framework/agents').CulturalMemory;
export const NormEngine = lazyPeerSymbol(
  FW_AGENTS,
  'NormEngine'
) as typeof import('@holoscript/framework/agents').NormEngine;
export const negotiateHandoff = lazyPeerSymbol(
  FW_AGENTS,
  'negotiateHandoff'
) as typeof import('@holoscript/framework/agents').negotiateHandoff;
export const createMVCPayload = lazyPeerSymbol(
  FW_AGENTS,
  'createMVCPayload'
) as typeof import('@holoscript/framework/agents').createMVCPayload;
export const estimatePayloadSize = lazyPeerSymbol(
  FW_AGENTS,
  'estimatePayloadSize'
) as typeof import('@holoscript/framework/agents').estimatePayloadSize;
export const validatePayloadBudget = lazyPeerSymbol(
  FW_AGENTS,
  'validatePayloadBudget'
) as typeof import('@holoscript/framework/agents').validatePayloadBudget;
export const signOperation = lazyPeerSymbol(
  FW_AGENTS,
  'signOperation'
) as typeof import('@holoscript/framework/agents').signOperation;
export const verifyOperation = lazyPeerSymbol(
  FW_AGENTS,
  'verifyOperation'
) as typeof import('@holoscript/framework/agents').verifyOperation;
export const LWWRegister = lazyPeerSymbol(
  FW_AGENTS,
  'LWWRegister'
) as typeof import('@holoscript/framework/agents').LWWRegister;
export const GCounter = lazyPeerSymbol(
  FW_AGENTS,
  'GCounter'
) as typeof import('@holoscript/framework/agents').GCounter;
export const ORSet = lazyPeerSymbol(
  FW_AGENTS,
  'ORSet'
) as typeof import('@holoscript/framework/agents').ORSet;
export const createAgentState = lazyPeerSymbol(
  FW_AGENTS,
  'createAgentState'
) as typeof import('@holoscript/framework/agents').createAgentState;
export const setRegister = lazyPeerSymbol(
  FW_AGENTS,
  'setRegister'
) as typeof import('@holoscript/framework/agents').setRegister;
export const getRegister = lazyPeerSymbol(
  FW_AGENTS,
  'getRegister'
) as typeof import('@holoscript/framework/agents').getRegister;
export const incrementCounter = lazyPeerSymbol(
  FW_AGENTS,
  'incrementCounter'
) as typeof import('@holoscript/framework/agents').incrementCounter;
export const getCounter = lazyPeerSymbol(
  FW_AGENTS,
  'getCounter'
) as typeof import('@holoscript/framework/agents').getCounter;
export const mergeStates = lazyPeerSymbol(
  FW_AGENTS,
  'mergeStates'
) as typeof import('@holoscript/framework/agents').mergeStates;
export const AgentRegistry = lazyPeerSymbol(
  FW_AGENTS,
  'AgentRegistry'
) as typeof import('@holoscript/framework/agents').AgentRegistry;
export const getDefaultRegistry = lazyPeerSymbol(
  FW_AGENTS,
  'getDefaultRegistry'
) as typeof import('@holoscript/framework/agents').getDefaultRegistry;
export const resetDefaultRegistry = lazyPeerSymbol(
  FW_AGENTS,
  'resetDefaultRegistry'
) as typeof import('@holoscript/framework/agents').resetDefaultRegistry;

// --- framework/swarm ---
const FW_SWARM = '@holoscript/framework/swarm';
export const SwarmCoordinator = lazyPeerSymbol(
  FW_SWARM,
  'SwarmCoordinator'
) as typeof import('@holoscript/framework/swarm').SwarmCoordinator;
export const LeaderElection = lazyPeerSymbol(
  FW_SWARM,
  'LeaderElection'
) as typeof import('@holoscript/framework/swarm').LeaderElection;
export const CollectiveIntelligence = lazyPeerSymbol(
  FW_SWARM,
  'CollectiveIntelligence'
) as typeof import('@holoscript/framework/swarm').CollectiveIntelligence;
export const SwarmManager = lazyPeerSymbol(
  FW_SWARM,
  'SwarmManager'
) as typeof import('@holoscript/framework/swarm').SwarmManager;
export const SwarmMembership = lazyPeerSymbol(
  FW_SWARM,
  'SwarmMembership'
) as typeof import('@holoscript/framework/swarm').SwarmMembership;
export const SwarmMetrics = lazyPeerSymbol(
  FW_SWARM,
  'SwarmMetrics'
) as typeof import('@holoscript/framework/swarm').SwarmMetrics;
export const SwarmInspector = lazyPeerSymbol(
  FW_SWARM,
  'SwarmInspector'
) as typeof import('@holoscript/framework/swarm').SwarmInspector;

// --- framework/training ---
const FW_TRAINING = '@holoscript/framework/training';
export const SparsityMonitor = lazyPeerSymbol(
  FW_TRAINING,
  'SparsityMonitor'
) as typeof import('@holoscript/framework/training').SparsityMonitor;
export const createSparsityMonitor = lazyPeerSymbol(
  FW_TRAINING,
  'createSparsityMonitor'
) as typeof import('@holoscript/framework/training').createSparsityMonitor;

// --- engine ---
const E_DIALOGUE = '@holoscript/engine/dialogue';
export const DialogueGraph = lazyPeerSymbol(
  E_DIALOGUE,
  'DialogueGraph'
) as typeof import('@holoscript/engine/dialogue').DialogueGraph;
export const DialogueRunner = lazyPeerSymbol(
  E_DIALOGUE,
  'DialogueRunner'
) as typeof import('@holoscript/engine/dialogue').DialogueRunner;
export const CameraController = lazyPeerSymbol(
  '@holoscript/engine/camera',
  'CameraController'
) as typeof import('@holoscript/engine/camera').CameraController;
export const InventorySystem = lazyPeerSymbol(
  '@holoscript/engine/gameplay',
  'InventorySystem'
) as typeof import('@holoscript/engine/gameplay').InventorySystem;
export const TerrainSystem = lazyPeerSymbol(
  '@holoscript/engine/environment',
  'TerrainSystem'
) as typeof import('@holoscript/engine/environment').TerrainSystem;
const E_RENDERING = '@holoscript/engine/rendering';
export const LightingModel = lazyPeerSymbol(
  E_RENDERING,
  'LightingModel'
) as typeof import('@holoscript/engine/rendering').LightingModel;
export const ShaderGraph = lazyPeerSymbol(
  E_RENDERING,
  'ShaderGraph'
) as typeof import('@holoscript/engine/rendering').ShaderGraph;
export const SHADER_NODES = lazyPeerSymbol(
  E_RENDERING,
  'SHADER_NODES'
) as typeof import('@holoscript/engine/rendering').SHADER_NODES;
export const CombatManager = lazyPeerSymbol(
  '@holoscript/engine/combat',
  'CombatManager'
) as typeof import('@holoscript/engine/combat').CombatManager;
const E_NAV = '@holoscript/engine/navigation';
export const AStarPathfinder = lazyPeerSymbol(
  E_NAV,
  'AStarPathfinder'
) as typeof import('@holoscript/engine/navigation').AStarPathfinder;
export const NavMesh = lazyPeerSymbol(
  E_NAV,
  'NavMesh'
) as typeof import('@holoscript/engine/navigation').NavMesh;
export const ParticleSystem = lazyPeerSymbol(
  '@holoscript/engine/particles',
  'ParticleSystem'
) as typeof import('@holoscript/engine/particles').ParticleSystem;
export const LODManager = lazyPeerSymbol(
  '@holoscript/engine/world',
  'LODManager'
) as typeof import('@holoscript/engine/world').LODManager;
export const InputManager = lazyPeerSymbol(
  '@holoscript/engine/input',
  'InputManager'
) as typeof import('@holoscript/engine/input').InputManager;
export const CultureRuntime = lazyPeerSymbol(
  '@holoscript/engine/runtime',
  'CultureRuntime'
) as typeof import('@holoscript/engine/runtime').CultureRuntime;
export const GaussianSplatExtractor = lazyPeerSymbol(
  '@holoscript/engine/gpu',
  'GaussianSplatExtractor'
) as typeof import('@holoscript/engine/gpu').GaussianSplatExtractor;
const E_CHOREO = '@holoscript/engine/choreography';
export const ChoreographyEngine = lazyPeerSymbol(
  E_CHOREO,
  'ChoreographyEngine'
) as typeof import('@holoscript/engine/choreography').ChoreographyEngine;
export const getDefaultEngine = lazyPeerSymbol(
  E_CHOREO,
  'getDefaultEngine'
) as typeof import('@holoscript/engine/choreography').getDefaultEngine;
export const resetDefaultEngine = lazyPeerSymbol(
  E_CHOREO,
  'resetDefaultEngine'
) as typeof import('@holoscript/engine/choreography').resetDefaultEngine;

// --- mesh ---
// `@holoscript/mesh` is a hard dependency (present cold), but it is ALSO
// declared an optional peer; lazifying it is harmless when present and keeps
// the whole runtime barrel uniformly peer-deferred.
const MESH = '@holoscript/mesh';
export const CollaborationSession = lazyPeerSymbol(
  MESH,
  'CollaborationSession'
) as typeof import('@holoscript/mesh').CollaborationSession;
export const NetworkManager = lazyPeerSymbol(
  MESH,
  'NetworkManager'
) as typeof import('@holoscript/mesh').NetworkManager;
export const WebRTCTransport = lazyPeerSymbol(
  MESH,
  'WebRTCTransport'
) as typeof import('@holoscript/mesh').WebRTCTransport;
export const ConsensusManager = lazyPeerSymbol(
  '@holoscript/mesh/consensus',
  'ConsensusManager'
) as typeof import('@holoscript/mesh/consensus').ConsensusManager;
export const AgentMessaging = lazyPeerSymbol(
  '@holoscript/mesh/messaging',
  'AgentMessaging'
) as typeof import('@holoscript/mesh/messaging').AgentMessaging;
