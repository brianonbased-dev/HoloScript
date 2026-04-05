/**
 * @holoscript/core - Agent Manifest Definitions
 *
 * Defines the structure for agent registration and capability declaration.
 * Part of HoloScript v3.1 Agentic Choreography.
 */

import type { AgentCategory, AgentPosition, AgentSection } from './AgentTypes';

// ============================================================================
// RESOURCE & LATENCY PROFILES
// ============================================================================

/**
 * Resource cost for executing a capability
 */
export interface ResourceCost {
  /** Estimated compute cost (0-100 scale) */
  compute: number;
  /** Estimated memory usage (0-100 scale) */
  memory: number;
  /** Estimated network usage (0-100 scale) */
  network: number;
  /** Token cost for LLM operations (if applicable) */
  tokens?: number;
}

/**
 * Latency profile for a capability
 */
export type LatencyProfile = 'instant' | 'fast' | 'medium' | 'slow' | 'background';

/**
 * Latency thresholds in milliseconds
 */
export const LATENCY_THRESHOLDS: Record<LatencyProfile, number> = {
  instant: 10,
  fast: 100,
  medium: 1000,
  slow: 10000,
  background: Infinity,
};

// ============================================================================
// CAPABILITY DEFINITIONS
// ============================================================================

/**
 * Capability types that agents can provide
 */
export type CapabilityType =
  | 'render' // Visual rendering / generation
  | 'analyze' // Data analysis
  | 'generate' // Content generation
  | 'approve' // Human/AI approval workflow
  | 'detect' // Detection / recognition
  | 'transform' // Data transformation
  | 'store' // Data storage
  | 'retrieve' // Data retrieval
  | 'communicate' // Messaging / notification
  | 'orchestrate' // Workflow orchestration
  | 'validate' // Validation / verification
  | 'optimize' // Optimization / tuning
  | 'custom'; // Custom capability

/**
 * Capability domains
 */
export type CapabilityDomain =
  | 'vision' // Computer vision
  | 'nlp' // Natural language processing
  | 'spatial' // Spatial computing / 3D
  | 'blockchain' // Web3 / blockchain
  | 'audio' // Audio processing
  | 'video' // Video processing
  | 'physics' // Physics simulation
  | 'networking' // Network operations
  | 'storage' // Data storage
  | 'security' // Security operations
  | 'trading' // Trading / DeFi
  | 'social' // Social interactions
  | 'gaming' // Game mechanics
  | 'general'; // General purpose

/**
 * Single agent capability
 */
export interface AgentCapability {
  /** Capability type identifier */
  type: CapabilityType | string;
  /** Domain the capability operates in */
  domain: CapabilityDomain | string;
  /** Unique capability identifier */
  id?: string;
  /** Human-readable name */
  name?: string;
  /** Description of what this capability does */
  description?: string;
  /** Resource cost profile */
  cost?: Partial<ResourceCost>;
  /** Expected latency */
  latency?: LatencyProfile;
  /** Capability version */
  version?: string;
  /** Required input types */
  inputs?: string[];
  /** Output type */
  output?: string;
  /** Whether this capability is currently available */
  available?: boolean;
  /** Priority for conflict resolution (higher = preferred) */
  priority?: number;
  /** Custom metadata */
  metadata?: Record<string, unknown>;
}

// ============================================================================
// AGENT ENDPOINTS
// ============================================================================

/**
 * Endpoint protocol types
 */
export type EndpointProtocol =
  | 'local' // In-process
  | 'ipc' // Inter-process
  | 'http' // HTTP REST
  | 'https' // HTTPS REST
  | 'ws' // WebSocket
  | 'wss' // Secure WebSocket
  | 'grpc' // gRPC
  | 'mqtt' // MQTT
  | 'custom'; // Custom protocol

/**
 * Agent communication endpoint
 */
export interface AgentEndpoint {
  /** Endpoint protocol */
  protocol: EndpointProtocol;
  /** Endpoint address (URL, IPC path, etc.) */
  address: string;
  /** Endpoint port (if applicable) */
  port?: number;
  /** Whether this is the primary endpoint */
  primary?: boolean;
  /** Health check path (if applicable) */
  healthPath?: string;
  /** Authentication required */
  authRequired?: boolean;
  /** Supported message formats */
  formats?: Array<'json' | 'msgpack' | 'protobuf' | 'custom'>;
}

// ============================================================================
// SPATIAL BOUNDS
// ============================================================================

/**
 * 3D Vector for spatial definitions
 */
export interface Vector3 {
  x: number;
  y: number;
  z: number;
}

/**
 * Bounding box for spatial agents
 */
export interface BoundingBox {
  /** Minimum point (corner) */
  min: Vector3;
  /** Maximum point (opposite corner) */
  max: Vector3;
  /** Coordinate system reference */
  coordinateSystem?: 'world' | 'local' | 'scene';
}

/**
 * Spatial scope for agents
 */
export interface SpatialScope {
  /** Bounding box if defined */
  bounds?: BoundingBox;
  /** Named scene/world */
  scene?: string;
  /** Specific node IDs this agent operates on */
  nodes?: string[];
  /** Radius from a center point */
  radius?: { center: Vector3; distance: number };
  /** Whether agent can operate outside its spatial scope */
  global?: boolean;
}

// ============================================================================
// TRUST & VERIFICATION
// ============================================================================

/**
 * Trust level for agents
 */
export type TrustLevel =
  | 'local' // Same process, fully trusted
  | 'verified' // Cryptographically verified
  | 'known' // Known agent, limited trust
  | 'external' // External/unknown agent, minimal trust
  | 'untrusted'; // Explicitly untrusted

/**
 * Verification status
 */
export interface VerificationStatus {
  /** Whether the agent is verified */
  verified: boolean;
  /** Verification method used */
  method?: 'signature' | 'certificate' | 'oauth' | 'token' | 'manual';
  /** When verification was performed */
  verifiedAt?: number;
  /** When verification expires */
  expiresAt?: number;
  /** Verifying authority */
  authority?: string;
  /** Verification signature/proof */
  proof?: string;
}

// ============================================================================
// AGENT MANIFEST
// ============================================================================

/**
 * Complete agent manifest for registration
 */
export interface AgentManifest {
  // === Identity ===
  /** Unique agent identifier */
  id: string;
  /** Human-readable agent name */
  name: string;
  /** Agent version (semver) */
  version: string;
  /** Agent description */
  description?: string;

  // === Classification ===
  /** Agent categories */
  categories?: AgentCategory[];
  /** Position in architecture */
  position?: AgentPosition;
  /** Orchestral section */
  section?: AgentSection;
  /** Custom tags for filtering */
  tags?: string[];

  // === Capabilities ===
  /** List of capabilities this agent provides */
  capabilities: AgentCapability[];

  // === Communication ===
  /** Available endpoints for communication */
  endpoints: AgentEndpoint[];

  // === Spatial ===
  /** Spatial scope this agent operates in */
  spatialScope?: SpatialScope;

  // === Trust ===
  /** Trust level */
  trustLevel: TrustLevel;
  /** Verification status */
  verification?: VerificationStatus;

  // === Health ===
  /** Health check interval in ms */
  healthCheckInterval?: number;
  /** Last heartbeat timestamp */
  lastHeartbeat?: number;
  /** Current health status */
  status?: 'online' | 'offline' | 'degraded' | 'unknown';

  // === Metadata ===
  /** Registration timestamp */
  registeredAt?: number;
  /** Last updated timestamp */
  updatedAt?: number;
  /** Owner/creator identifier */
  owner?: string;
  /** Source repository/package */
  source?: string;
  /** Custom metadata */
  metadata?: Record<string, unknown>;
}

// ============================================================================
// MANIFEST BUILDER
// ============================================================================

/**
 * Fluent builder for creating agent manifests
 */
export class AgentManifestBuilder {
  private manifest: Partial<AgentManifest> = {
    capabilities: [],
    endpoints: [],
    trustLevel: 'local',
    status: 'unknown',
  };

  /**
   * Set agent identity
   */
  identity(id: string, name: string, version: string): this {
    this.manifest.id = id;
    this.manifest.name = name;
    this.manifest.version = version;
    return this;
  }

  /**
   * Set agent description
   */
  description(desc: string): this {
    this.manifest.description = desc;
    return this;
  }

  /**
   * Set classification
   */
  classify(categories: AgentCategory[], position?: AgentPosition, section?: AgentSection): this {
    this.manifest.categories = categories;
    this.manifest.position = position;
    this.manifest.section = section;
    return this;
  }

  /**
   * Add a capability
   */
  addCapability(capability: AgentCapability): this {
    this.manifest.capabilities!.push(capability);
    return this;
  }

  /**
   * Add multiple capabilities
   */
  addCapabilities(capabilities: AgentCapability[]): this {
    this.manifest.capabilities!.push(...capabilities);
    return this;
  }

  /**
   * Add an endpoint
   */
  addEndpoint(endpoint: AgentEndpoint): this {
    this.manifest.endpoints!.push(endpoint);
    return this;
  }

  /**
   * Set spatial scope
   */
  spatial(scope: SpatialScope): this {
    this.manifest.spatialScope = scope;
    return this;
  }

  /**
   * Set trust level
   */
  trust(level: TrustLevel, verification?: VerificationStatus): this {
    this.manifest.trustLevel = level;
    this.manifest.verification = verification;
    return this;
  }

  /**
   * Set health check interval
   */
  healthCheck(intervalMs: number): this {
    this.manifest.healthCheckInterval = intervalMs;
    return this;
  }

  /**
   * Add custom tags
   */
  tags(...tags: string[]): this {
    this.manifest.tags = [...(this.manifest.tags || []), ...tags];
    return this;
  }

  /**
   * Set metadata
   */
  metadata(data: Record<string, unknown>): this {
    this.manifest.metadata = { ...this.manifest.metadata, ...data };
    return this;
  }

  /**
   * Build the manifest
   */
  build(): AgentManifest {
    if (!this.manifest.id || !this.manifest.name || !this.manifest.version) {
      throw new Error('AgentManifest requires id, name, and version');
    }
    if (this.manifest.capabilities!.length === 0) {
      throw new Error('AgentManifest requires at least one capability');
    }
    if (this.manifest.endpoints!.length === 0) {
      throw new Error('AgentManifest requires at least one endpoint');
    }

    const now = Date.now();
    return {
      ...this.manifest,
      registeredAt: now,
      updatedAt: now,
      status: 'online',
    } as AgentManifest;
  }
}

/**
 * Create a new manifest builder
 */
export function createManifest(): AgentManifestBuilder {
  return new AgentManifestBuilder();
}

// ============================================================================
// VALIDATION
// ============================================================================

/**
 * Validation result
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validate an agent manifest
 */
export function validateManifest(manifest: Partial<AgentManifest>): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Required fields
  if (!manifest.id) errors.push('Missing required field: id');
  if (!manifest.name) errors.push('Missing required field: name');
  if (!manifest.version) errors.push('Missing required field: version');
  if (!manifest.capabilities || manifest.capabilities.length === 0) {
    errors.push('At least one capability is required');
  }
  if (!manifest.endpoints || manifest.endpoints.length === 0) {
    errors.push('At least one endpoint is required');
  }

  // Validate capabilities
  manifest.capabilities?.forEach((cap, i) => {
    if (!cap.type) errors.push(`Capability ${i}: missing type`);
    if (!cap.domain) errors.push(`Capability ${i}: missing domain`);
  });

  // Validate endpoints
  manifest.endpoints?.forEach((ep, i) => {
    if (!ep.protocol) errors.push(`Endpoint ${i}: missing protocol`);
    if (!ep.address) errors.push(`Endpoint ${i}: missing address`);
  });

  // Warnings
  if (!manifest.description) {
    warnings.push('Consider adding a description for better discovery');
  }
  if (!manifest.healthCheckInterval) {
    warnings.push('No health check interval set, agent health may not be tracked');
  }
  if (manifest.trustLevel === 'untrusted') {
    warnings.push('Untrusted agents have limited capabilities');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
