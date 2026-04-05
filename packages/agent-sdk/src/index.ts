/**
 * @holoscript/agent-sdk
 *
 * SHED: All implementations now live in @holoscript/framework.
 * This file re-exports for backward compatibility.
 */
export {
  // Mesh Discovery
  type PeerMetadata,
  MeshDiscovery,

  // Signal Service
  type SignalType,
  type MeshSignal,
  SignalService,

  // Gossip Protocol
  type GossipPacket,
  GossipProtocol,

  // MCP Tool Schemas
  type MCPToolSchema,
  MCP_TOOL_SCHEMAS,

  // Agent Card (A2A)
  type AgentCard,
  type AgentCapability,
  type AgentSkill,
  type AgentAuthentication,
  createAgentCard,
  validateAgentCard,
} from '@holoscript/framework';
