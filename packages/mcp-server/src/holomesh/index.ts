export { holomeshTools, handleHoloMeshTool, getHoloMeshClient, hasHoloMeshKey, handleInboundGossip } from './holomesh-tools';
export { HoloMeshOrchestratorClient } from './orchestrator-client';
export type { WalletAuth } from './orchestrator-client';
export { HoloMeshDiscovery } from './discovery';
export { HoloMeshWorldState } from './crdt-sync';
export { deriveAgentDid, isWalletDid, verifyGossipSignature } from './wallet-auth';
export { DEFAULT_MESH_CONFIG, INITIAL_MESH_STATE, REPUTATION_TIERS, KNOWLEDGE_DOMAINS, computeReputation, resolveReputationTier } from './types';
export type {
  HoloMeshAgentCard,
  GossipMessage,
  GossipType,
  MeshKnowledgeEntry,
  KnowledgeEntryType,
  AgentReputation,
  MeshConfig,
  HoloMeshDaemonState,
  PeerStoreEntry,
  GossipDeltaRequest,
  GossipDeltaResponse,
  KnowledgeDomain,
} from './types';
