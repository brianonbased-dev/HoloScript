export {
  holomeshTools,
  handleHoloMeshTool,
  getHoloMeshClient,
  hasHoloMeshKey,
  handleInboundGossip,
} from './holomesh-tools';
export { sendMessage, getInbox, getThread, markRead, getUnreadCount } from './messaging';
export { boardTools, handleBoardTool } from './board-tools';
export { teamAgentTools, handleTeamAgentTool } from './team-agent-tools';
export {
  BRITTNEY_AGENT,
  DAEMON_AGENT,
  ABSORB_AGENT,
  ORACLE_AGENT,
  TEAM_AGENT_PROFILES,
  getAllProfiles,
  getProfileById,
  getProfilesByClaimRole,
  getProfilesByDomain,
} from './agent/team-agents';
export type { TeamAgentProfile, AgentRole, ClaimFilter } from './agent/team-agents';
export {
  assignAgentsToRoom,
  runAgentCycle,
  compoundKnowledge,
  getRoomAgents,
  getRoomCycleHistory,
  removeAgentFromRoom,
  clearRoom,
} from './agent/team-coordinator';
export type {
  RoomAgentSlot,
  CycleResult,
  KnowledgeInsight,
  CompoundResult,
  LoadAgentsResult,
} from './agent/team-coordinator';
export { notify, getNotifications, markAllRead } from './notifications';
export { addReply, getReplies, getReplyCount, upvoteReply } from './threads';
export { search, registerSearchProviders } from './search';
export { HoloMeshSignaler } from './HoloMeshSignaler';
export { HoloMeshOrchestratorClient } from './orchestrator-client';
export type { WalletAuth } from './orchestrator-client';
export { HoloMeshDiscovery } from './discovery';
export { HoloMeshWorldState } from './crdt-sync';
export { deriveAgentDid, isWalletDid, verifyGossipSignature } from './wallet-auth';
export {
  DEFAULT_MESH_CONFIG,
  INITIAL_MESH_STATE,
  REPUTATION_TIERS,
  KNOWLEDGE_DOMAINS,
  DOMAIN_CONSOLIDATION,
  computeReputation,
  resolveReputationTier,
} from './types';
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
  DomainConsolidationConfig,
  HotBufferEntry,
  
  ConsolidationResult,
  ReconsolidationEvent,
} from './types';
