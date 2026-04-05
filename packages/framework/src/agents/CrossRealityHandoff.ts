/**
 * @fileoverview Cross-Reality Agent Handoff Protocol
 * @module @holoscript/core/agents
 *
 * Implements the Minimum Viable Continuity (MVC) handoff schema:
 * exactly 5 typed objects transferred during cross-device agent handoff.
 * Payload is <10KB. Full context is lazy-loaded after transition.
 *
 * The handoff protocol:
 * 1. Capability negotiation (source → target)
 * 2. MVC transfer (<10KB payload)
 * 3. Embodiment adaptation (Avatar3D ↔ VoiceHUD ↔ UI2D etc.)
 * 4. Lazy context loading (background)
 *
 * Geospatial coordinates (WGS84) are the universal spatial anchor.
 *
 * @version 1.0.0
 */

import type {
  XRPlatformTarget as PlatformTarget,
  XRPlatformCapabilities as PlatformCapabilities,
  EmbodimentType,
} from '@holoscript/core';
import {
  XR_PLATFORM_CAPABILITIES as PLATFORM_CAPABILITIES,
  embodimentFor,
  platformCategory,
} from '@holoscript/core';

// =============================================================================
// MVC PAYLOAD — The 5 Typed Objects
// =============================================================================

/** A decision the agent has made */
export interface DecisionEntry {
  id: string;
  /** What was decided */
  action: string;
  /** Why (reasoning trace) */
  reasoning: string;
  /** When (ISO timestamp) */
  timestamp: string;
  /** Confidence (0-1) */
  confidence: number;
  /** Outcome if known */
  outcome?: 'success' | 'failure' | 'pending';
}

/** Active task state */
export interface TaskState {
  /** Current task ID */
  taskId: string;
  /** Task description */
  description: string;
  /** Progress (0-1) */
  progress: number;
  /** Sub-tasks remaining */
  subtasks: { id: string; label: string; done: boolean }[];
  /** Blocked on */
  blockedOn?: string;
  /** Priority */
  priority: 'critical' | 'high' | 'medium' | 'low';
}

/** User preferences */
export interface UserPreferences {
  /** Agent personality setting */
  personality: 'professional' | 'casual' | 'minimal' | 'verbose';
  /** Preferred interaction modality */
  modality: 'voice' | 'text' | 'gesture' | 'gaze' | 'auto';
  /** Language */
  language: string;
  /** Accessibility needs */
  accessibility: { highContrast?: boolean; screenReader?: boolean; reducedMotion?: boolean };
  /** Custom key-value preferences */
  custom: Record<string, string>;
}

/** Spatial context summary (WGS84 universal anchor) */
export interface SpatialContext {
  /** WGS84 latitude */
  latitude: number;
  /** WGS84 longitude */
  longitude: number;
  /** Altitude in meters (WGS84 ellipsoid height) */
  altitude: number;
  /** Heading (degrees, 0=north) */
  heading: number;
  /** Indoor location hint (if available) */
  indoor?: { buildingId: string; floor: number; roomId?: string };
  /** Spatial anchor IDs (platform-specific, for lazy resolution) */
  anchorIds?: string[];
  /** Timestamp of last spatial fix */
  fixTimestamp: string;
  /** Accuracy in meters */
  accuracy: number;
}

/** Evidence trail entry */
export interface EvidenceEntry {
  /** What was observed/received */
  type: 'observation' | 'user_input' | 'api_response' | 'sensor_data' | 'agent_message';
  /** Summary (keep brief for <10KB budget) */
  summary: string;
  /** Timestamp */
  timestamp: string;
  /** Source */
  source: string;
  /** Relevance score (0-1) */
  relevance: number;
}

// =============================================================================
// MVC PAYLOAD
// =============================================================================

/**
 * Minimum Viable Continuity payload — the 5 typed objects.
 * Total serialized size MUST be <10KB.
 */
export interface MVCPayload {
  /** Schema version */
  version: '1.0';
  /** Agent identity (DID) */
  agentDID: string;
  /** Session ID for continuity tracking */
  sessionId: string;
  /** 1. Decision history (last N decisions) */
  decisions: DecisionEntry[];
  /** 2. Active task state */
  task: TaskState;
  /** 3. User preferences */
  preferences: UserPreferences;
  /** 4. Spatial context (WGS84) */
  spatial: SpatialContext;
  /** 5. Evidence trail (most relevant entries) */
  evidence: EvidenceEntry[];
  /** Handoff metadata */
  handoff: {
    sourceDevice: string;
    sourcePlatform: PlatformTarget;
    sourceEmbodiment: EmbodimentType;
    timestamp: string;
  };
}

// =============================================================================
// HANDOFF PROTOCOL
// =============================================================================

/** Device capabilities for handoff negotiation */
export interface DeviceCapabilities {
  deviceId: string;
  platform: PlatformTarget;
  capabilities: PlatformCapabilities;
  embodiment: EmbodimentType;
  available: boolean;
}

/** Handoff negotiation result */
export interface HandoffNegotiation {
  sourceDevice: DeviceCapabilities;
  targetDevice: DeviceCapabilities;
  /** Capabilities gained in transition */
  gained: string[];
  /** Capabilities lost in transition */
  lost: string[];
  /** Embodiment transition pair */
  transition: { from: EmbodimentType; to: EmbodimentType };
  /** Estimated transition latency (ms) */
  estimatedLatencyMs: number;
  /** Whether the handoff is feasible */
  feasible: boolean;
  /** Reason if not feasible */
  reason?: string;
}

/**
 * Negotiate a handoff between two devices.
 */
export function negotiateHandoff(
  source: DeviceCapabilities,
  target: DeviceCapabilities
): HandoffNegotiation {
  const gained: string[] = [];
  const lost: string[] = [];

  // Compare capabilities
  const boolCaps: (keyof PlatformCapabilities)[] = [
    'spatialTracking',
    'handTracking',
    'eyeTracking',
    'haptics',
    'spatialAudio',
    'gpu3D',
    'arCamera',
    'gps',
    'npu',
    'webxrSupport',
  ];

  for (const cap of boolCaps) {
    const srcHas = !!source.capabilities[cap];
    const tgtHas = !!target.capabilities[cap];
    if (!srcHas && tgtHas) gained.push(cap as string);
    if (srcHas && !tgtHas) lost.push(cap as string);
  }

  // Estimate latency (simple heuristic)
  const srcCat = platformCategory(source.platform);
  const tgtCat = platformCategory(target.platform);
  let latency = 200; // base
  if (srcCat === tgtCat) latency = 100; // same form factor
  if (tgtCat === 'automotive') latency = 500; // safety-critical

  const feasible = target.available;

  return {
    sourceDevice: source,
    targetDevice: target,
    gained,
    lost,
    transition: { from: source.embodiment, to: target.embodiment },
    estimatedLatencyMs: latency,
    feasible,
    reason: feasible ? undefined : 'Target device not available',
  };
}

/**
 * Create an MVC payload for handoff.
 */
export function createMVCPayload(
  agentDID: string,
  sessionId: string,
  source: { deviceId: string; platform: PlatformTarget },
  data: {
    decisions: DecisionEntry[];
    task: TaskState;
    preferences: UserPreferences;
    spatial: SpatialContext;
    evidence: EvidenceEntry[];
  }
): MVCPayload {
  // Trim to stay within budget
  const trimmedDecisions = data.decisions.slice(-10); // Last 10
  const trimmedEvidence = data.evidence.sort((a, b) => b.relevance - a.relevance).slice(0, 15); // Top 15 by relevance

  return {
    version: '1.0',
    agentDID,
    sessionId,
    decisions: trimmedDecisions,
    task: data.task,
    preferences: data.preferences,
    spatial: data.spatial,
    evidence: trimmedEvidence,
    handoff: {
      sourceDevice: source.deviceId,
      sourcePlatform: source.platform,
      sourceEmbodiment: embodimentFor(source.platform),
      timestamp: new Date().toISOString(),
    },
  };
}

/**
 * Estimate the serialized size of an MVC payload in bytes.
 */
export function estimatePayloadSize(payload: MVCPayload): number {
  return new TextEncoder().encode(JSON.stringify(payload)).length;
}

/**
 * Validate that an MVC payload is within the 10KB budget.
 */
export function validatePayloadBudget(payload: MVCPayload): {
  valid: boolean;
  sizeBytes: number;
  budgetBytes: number;
} {
  const BUDGET = 10 * 1024; // 10KB
  const size = estimatePayloadSize(payload);
  return { valid: size <= BUDGET, sizeBytes: size, budgetBytes: BUDGET };
}
