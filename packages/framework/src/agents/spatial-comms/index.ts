/**
 * @holoscript/core - Spatial Agent Communication Stack
 *
 * Three-layer communication protocol for multi-agent VR world creation
 * with 90fps performance targeting.
 *
 * @module spatial-comms
 */

// Protocol Types
export * from './ProtocolTypes';

// Layer 1: Real-Time Communication (UDP/WebRTC)
export {
  Layer1RealTimeClient,
  UDPRealTimeTransport,
  WebRTCRealTimeTransport,
  encodeRealTimeMessage,
  decodeRealTimeMessage,
  type RealTimeTransport,
} from './Layer1RealTime';

// Layer 2: A2A Coordination (JSON-RPC over HTTP/2)
export { Layer2A2AClient } from './Layer2A2A';

// Layer 3: MCP Metadata Layer
export {
  Layer3MCPClient,
  Layer3MCPServer,
  SPATIAL_MCP_TOOLS,
  type MCPTool,
  type MCPCommandHandler,
} from './Layer3MCP';

// Unified Client
export { SpatialCommClient, FrameBudgetTracker } from './SpatialCommClient';

// Re-export key types for convenience
export type {
  // Layer 1
  RealTimeMessage,
  PositionSyncMessage,
  FrameBudgetMessage,
  SpatialConflictMessage,
  RealTimeProtocolConfig,

  // Layer 2
  A2AMessage,
  A2AResponse,
  TaskSpec,
  ConflictResolutionStrategy,
  A2AProtocolConfig,

  // Layer 3
  MCPCommandType,
  MCPCommandRequest,
  MCPCommandResponse,
  WorldSpec,
  WorldStatus,
  PerformanceMetrics,
  ExportFormat,
  MCPProtocolConfig,

  // Unified
  SpatialCommProtocolConfig,
} from './ProtocolTypes';
