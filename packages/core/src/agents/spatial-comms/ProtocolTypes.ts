/**
 * @holoscript/core - Spatial Agent Communication Protocol Types
 *
 * Three-layer communication stack for multi-agent VR world creation:
 * - Layer 1: Real-Time Layer (UDP/WebRTC) - <1ms latency, 90fps coordination
 * - Layer 2: Coordination Layer (A2A over HTTP/2) - Task assignment, conflict resolution
 * - Layer 3: Metadata Layer (MCP) - Tool access, high-level commands
 */

// ============================================================================
// LAYER 1: REAL-TIME LAYER (UDP/WebRTC)
// ============================================================================

/**
 * Real-time message types for 90fps coordination
 */
export type RealTimeMessageType =
  | 'position_sync' // Agent position/rotation/scale updates
  | 'frame_budget' // Frame time and budget status
  | 'spatial_conflict' // Spatial conflict alerts
  | 'performance_metric'; // Real-time performance data

/**
 * Position synchronization message (90 messages/second per agent)
 */
export interface PositionSyncMessage {
  type: 'position_sync';
  agent_id: string;
  timestamp: number; // Microseconds for precision
  position: [number, number, number]; // x, y, z
  rotation: [number, number, number, number]; // quaternion (x, y, z, w)
  scale: [number, number, number]; // sx, sy, sz
  velocity?: [number, number, number]; // Optional velocity for prediction
}

/**
 * Frame budget status message
 */
export interface FrameBudgetMessage {
  type: 'frame_budget';
  agent_id: string;
  timestamp: number;
  frame_time_ms: number; // Actual frame time
  budget_remaining_ms: number; // Remaining budget before 90fps breach
  target_fps: number; // Target FPS (usually 90)
  actual_fps: number; // Measured FPS
  quality_level: 'high' | 'medium' | 'low' | 'minimal'; // Current quality setting
}

/**
 * Spatial conflict alert message
 */
export interface SpatialConflictMessage {
  type: 'spatial_conflict';
  agent_id: string;
  timestamp: number;
  conflict_type: 'overlap' | 'boundary_violation' | 'resource_contention' | 'performance_impact';
  affected_region: {
    center: [number, number, number];
    radius: number;
  };
  conflicting_agents: string[]; // Other agents involved
  severity: 'low' | 'medium' | 'high' | 'critical';
  suggested_action?: 'pause' | 'relocate' | 'reduce_quality' | 'defer';
}

/**
 * Performance metric message
 */
export interface PerformanceMetricMessage {
  type: 'performance_metric';
  agent_id: string;
  timestamp: number;
  metric_name: string;
  value: number;
  unit: 'ms' | 'fps' | 'percent' | 'count' | 'bytes';
}

/**
 * Union type for all real-time messages
 */
export type RealTimeMessage =
  | PositionSyncMessage
  | FrameBudgetMessage
  | SpatialConflictMessage
  | PerformanceMetricMessage;

/**
 * Binary protocol configuration for minimal overhead
 */
export interface RealTimeProtocolConfig {
  /** Use binary encoding (vs JSON) */
  binary: boolean;
  /** Maximum message size in bytes */
  maxMessageSize: number;
  /** Target latency in milliseconds */
  targetLatency: number;
  /** Messages per second per agent */
  messagesPerSecond: number;
  /** Enable message compression */
  compression: boolean;
  /** UDP port for real-time messages */
  udpPort?: number;
  /** WebRTC configuration */
  webrtc?: {
    iceServers: RTCIceServer[];
    dataChannelOptions?: RTCDataChannelInit;
  };
}

/**
 * Default real-time protocol configuration
 */
export const DEFAULT_REALTIME_CONFIG: RealTimeProtocolConfig = {
  binary: true,
  maxMessageSize: 512, // 512 bytes max
  targetLatency: 1, // <1ms target
  messagesPerSecond: 90, // 90fps coordination
  compression: false, // No compression for minimal latency
  udpPort: 9001,
};

// ============================================================================
// LAYER 2: COORDINATION LAYER (A2A over HTTP/2)
// ============================================================================

/**
 * A2A message types for agent collaboration
 */
export type A2AMessageType =
  | 'task_assignment' // Assign task to agent
  | 'task_complete' // Task completion notification
  | 'spatial_claim' // Claim spatial region
  | 'conflict_resolution' // Resolve spatial conflict
  | 'resource_request' // Request shared resource
  | 'resource_release' // Release shared resource
  | 'agent_handshake' // Establish agent connection
  | 'agent_disconnect'; // Disconnect agent

/**
 * Task specification for task assignment
 */
export interface TaskSpec {
  task_id: string;
  task_type: 'terrain' | 'assets' | 'physics' | 'lighting' | 'audio' | 'custom';
  priority: 'low' | 'medium' | 'high' | 'critical';
  parameters: Record<string, any>;
  spatial_region?: {
    center: [number, number, number];
    size: [number, number, number];
  };
  frame_budget_ms?: number; // Frame budget allocation
  dependencies?: string[]; // Task IDs this task depends on
  deadline?: number; // Unix timestamp
}

/**
 * Task assignment message
 */
export interface TaskAssignmentMessage {
  type: 'task_assignment';
  message_id: string;
  from_agent: string;
  to_agent: string;
  timestamp: number;
  task: TaskSpec;
}

/**
 * Task completion message
 */
export interface TaskCompleteMessage {
  type: 'task_complete';
  message_id: string;
  from_agent: string;
  timestamp: number;
  task_id: string;
  success: boolean;
  result?: any;
  error?: string;
  performance_metrics?: {
    duration_ms: number;
    frame_time_avg_ms: number;
    frame_time_max_ms: number;
    quality_level: 'high' | 'medium' | 'low' | 'minimal';
  };
}

/**
 * Spatial claim message
 */
export interface SpatialClaimMessage {
  type: 'spatial_claim';
  message_id: string;
  from_agent: string;
  timestamp: number;
  claim_id: string;
  bounding_box: {
    min: [number, number, number];
    max: [number, number, number];
  };
  priority: 'low' | 'medium' | 'high' | 'critical';
  duration_ms?: number; // How long to hold claim (undefined = indefinite)
  exclusive: boolean; // Whether other agents can overlap
}

/**
 * Conflict resolution strategy
 */
export type ConflictResolutionStrategy =
  | 'priority_based' // Higher priority agent wins
  | 'time_slicing' // Agents take turns
  | 'spatial_partitioning' // Divide space between agents
  | 'quality_reduction' // All agents reduce quality
  | 'agent_relocation'; // Move conflicting agent(s)

/**
 * Conflict resolution message
 */
export interface ConflictResolutionMessage {
  type: 'conflict_resolution';
  message_id: string;
  from_agent: string;
  timestamp: number;
  conflict_id: string;
  strategy: ConflictResolutionStrategy;
  involved_agents: string[];
  resolution_params?: Record<string, any>;
}

/**
 * Resource request message
 */
export interface ResourceRequestMessage {
  type: 'resource_request';
  message_id: string;
  from_agent: string;
  timestamp: number;
  resource_id: string;
  resource_type: 'mesh' | 'texture' | 'material' | 'audio' | 'compute' | 'memory';
  amount?: number;
  priority: 'low' | 'medium' | 'high' | 'critical';
}

/**
 * Resource release message
 */
export interface ResourceReleaseMessage {
  type: 'resource_release';
  message_id: string;
  from_agent: string;
  timestamp: number;
  resource_id: string;
}

/**
 * Agent handshake message
 */
export interface AgentHandshakeMessage {
  type: 'agent_handshake';
  message_id: string;
  from_agent: string;
  to_agent: string;
  timestamp: number;
  capabilities: string[];
  protocol_version: string;
}

/**
 * Agent disconnect message
 */
export interface AgentDisconnectMessage {
  type: 'agent_disconnect';
  message_id: string;
  from_agent: string;
  timestamp: number;
  reason?: string;
}

/**
 * Union type for all A2A messages
 */
export type A2AMessage =
  | TaskAssignmentMessage
  | TaskCompleteMessage
  | SpatialClaimMessage
  | ConflictResolutionMessage
  | ResourceRequestMessage
  | ResourceReleaseMessage
  | AgentHandshakeMessage
  | AgentDisconnectMessage;

/**
 * A2A protocol configuration
 */
export interface A2AProtocolConfig {
  /** HTTP/2 endpoint */
  endpoint: string;
  /** Request timeout in milliseconds */
  timeout: number;
  /** Maximum retry attempts */
  maxRetries: number;
  /** Exponential backoff base (ms) */
  retryBackoffBase: number;
  /** Enable acknowledgments */
  requireAck: boolean;
  /** Enable request batching */
  enableBatching: boolean;
  /** Batch size */
  batchSize: number;
}

/**
 * Default A2A protocol configuration
 */
export const DEFAULT_A2A_CONFIG: A2AProtocolConfig = {
  endpoint: 'http://localhost:3002/a2a',
  timeout: 5000, // 5 seconds
  maxRetries: 3,
  retryBackoffBase: 100, // 100ms, 200ms, 400ms
  requireAck: true,
  enableBatching: true,
  batchSize: 10,
};

/**
 * A2A response
 */
export interface A2AResponse {
  message_id: string;
  success: boolean;
  data?: any;
  error?: string;
  timestamp: number;
}

// ============================================================================
// LAYER 3: METADATA LAYER (MCP)
// ============================================================================

/**
 * MCP command types for high-level operations
 */
export type MCPCommandType =
  | 'create_world' // Create new VR world
  | 'get_world_status' // Get world status
  | 'export_world' // Export world to format
  | 'get_agent_registry' // Get registered agents
  | 'get_performance_metrics' // Get system performance
  | 'set_global_config' // Set global configuration
  | 'trigger_event'; // Trigger system event

/**
 * World specification for world creation
 */
export interface WorldSpec {
  world_id?: string; // Optional, generated if not provided
  name: string;
  template?: 'blank' | 'office' | 'gallery' | 'playground' | 'analytics' | 'collaboration';
  dimensions: {
    width: number;
    height: number;
    depth: number;
  };
  target_fps: number; // Target FPS (usually 90)
  max_agents: number; // Maximum concurrent agents
  features?: {
    terrain?: boolean;
    physics?: boolean;
    lighting?: boolean;
    audio?: boolean;
    networking?: boolean;
  };
  agent_roles?: {
    role: string;
    agent_type: string;
    spatial_region?: {
      center: [number, number, number];
      size: [number, number, number];
    };
  }[];
}

/**
 * World status
 */
export interface WorldStatus {
  world_id: string;
  name: string;
  status: 'initializing' | 'active' | 'paused' | 'error' | 'stopped';
  active_agents: {
    agent_id: string;
    role: string;
    status: 'online' | 'offline' | 'degraded';
  }[];
  performance: {
    current_fps: number;
    target_fps: number;
    frame_time_avg_ms: number;
    frame_time_max_ms: number;
    quality_level: 'high' | 'medium' | 'low' | 'minimal';
  };
  spatial_conflicts: number;
  resource_utilization: {
    cpu_percent: number;
    memory_mb: number;
    gpu_percent: number;
  };
  uptime_ms: number;
  created_at: string;
}

/**
 * Export format options
 */
export type ExportFormat = 'gltf' | 'fbx' | 'usdz' | 'vrm' | 'json' | 'holoscript';

/**
 * Performance metrics
 */
export interface PerformanceMetrics {
  timestamp: number;
  agents: {
    agent_id: string;
    role: string;
    frame_time_avg_ms: number;
    frame_time_max_ms: number;
    messages_sent: number;
    messages_received: number;
    spatial_conflicts: number;
  }[];
  system: {
    total_fps: number;
    target_fps: number;
    frame_time_avg_ms: number;
    frame_time_max_ms: number;
    quality_level: 'high' | 'medium' | 'low' | 'minimal';
    cpu_percent: number;
    memory_mb: number;
    gpu_percent: number;
  };
}

/**
 * MCP command request
 */
export interface MCPCommandRequest {
  command: MCPCommandType;
  params: Record<string, any>;
}

/**
 * MCP command response
 */
export interface MCPCommandResponse {
  success: boolean;
  data?: any;
  error?: string;
  timestamp: number;
}

/**
 * MCP protocol configuration
 */
export interface MCPProtocolConfig {
  /** MCP orchestrator endpoint */
  endpoint: string;
  /** API key for authentication */
  apiKey: string;
  /** Request timeout */
  timeout: number;
}

/**
 * Default MCP protocol configuration
 */
export const DEFAULT_MCP_CONFIG: MCPProtocolConfig = {
  endpoint: 'http://localhost:5567',
  apiKey: process.env.MCP_API_KEY || 'dev-key-12345',
  timeout: 30000, // 30 seconds
};

// ============================================================================
// UNIFIED PROTOCOL CONFIGURATION
// ============================================================================

/**
 * Complete three-layer protocol configuration
 */
export interface SpatialCommProtocolConfig {
  layer1: RealTimeProtocolConfig;
  layer2: A2AProtocolConfig;
  layer3: MCPProtocolConfig;
}

/**
 * Default unified protocol configuration
 */
export const DEFAULT_SPATIAL_COMM_CONFIG: SpatialCommProtocolConfig = {
  layer1: DEFAULT_REALTIME_CONFIG,
  layer2: DEFAULT_A2A_CONFIG,
  layer3: DEFAULT_MCP_CONFIG,
};

// ============================================================================
// PROTOCOL VERSIONING
// ============================================================================

/**
 * Protocol version
 */
export const PROTOCOL_VERSION = '1.0.0';

/**
 * Protocol compatibility
 */
export interface ProtocolCompatibility {
  version: string;
  minVersion: string;
  maxVersion: string;
}

export const PROTOCOL_COMPATIBILITY: ProtocolCompatibility = {
  version: PROTOCOL_VERSION,
  minVersion: '1.0.0',
  maxVersion: '1.x.x',
};
