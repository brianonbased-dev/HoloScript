export { holomeshTools, handleHoloMeshTool, getHoloMeshClient, hasHoloMeshKey } from './holomesh-tools';
export { HoloMeshOrchestratorClient } from './orchestrator-client';
export { HoloMeshDiscovery } from './discovery';
export { HoloMeshWorldState } from './crdt-sync';
export { DEFAULT_MESH_CONFIG, INITIAL_MESH_STATE, REPUTATION_TIERS, computeReputation, resolveReputationTier } from './types';
export type {
  HoloMeshAgentCard,
  GossipMessage,
  GossipType,
  MeshKnowledgeEntry,
  KnowledgeEntryType,
  AgentReputation,
  MeshConfig,
  HoloMeshDaemonState,
} from './types';
