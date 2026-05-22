/**
 * Agent Card Export Module
 *
 * A2A (Agent-to-Agent) Protocol Agent Card export target for HoloScript.
 * Maps VR trait definitions to discoverable agent skills.
 *
 * @module export/agent-card
 * @version 1.0.0
 */

export {
  AgentCardExporter,
  type AgentCard,
  type AgentSkill,
  type AgentProvider,
  type AgentCapabilities,
  type AgentAuthentication,
  type AuthScheme,
  type AgentCardExportOptions,
  type AgentCardExportResult,
  type SkillExample,
  type JsonSchema,
  type ContentMode,
  type HoloScriptExtension,
} from './AgentCardExporter';

export {
  validateA2AAgentCard,
  deriveScopesFromCard,
  negotiateRepresentation,
  executeA2AHandshake,
  handshakeToRequestEntryPayload,
  type SpatialScope as A2AHandshakeSpatialScope,
  type PortalRepresentation as A2AHandshakePortalRepresentation,
  type CardValidationResult,
  type ScopeDerivationResult,
  type A2AHandshakeResult,
  type A2AHandshakeOptions,
} from './A2AHandshake';
