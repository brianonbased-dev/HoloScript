/**
 * Render Network Types
 *
 * Shared type definitions for RenderNetworkTrait and RenderJobPersistence.
 * Extracted to avoid circular dependencies between these modules.
 *
 * NOTE: This file must NOT import from RenderNetworkTrait or RenderJobPersistence
 * to keep the dependency graph acyclic.
 *
 * @version 3.2.0
 * @milestone v3.2 (June 2026)
 */

// =============================================================================
// TYPES
// =============================================================================

export type RenderQuality = 'preview' | 'draft' | 'production' | 'film';
export type RenderEngine = 'octane' | 'redshift' | 'arnold' | 'blender_cycles' | 'auto';
export type OutputFormat = 'png' | 'exr' | 'jpg' | 'mp4' | 'webm' | 'glb';
export type JobPriority = 'low' | 'normal' | 'high' | 'rush';
export type JobStatus = 'queued' | 'processing' | 'rendering' | 'compositing' | 'complete' | 'failed';

export interface RenderOutput {
  type: 'frame' | 'sequence' | 'video' | 'volumetric' | 'splat';
  url: string;
  format: OutputFormat;
  resolution: { width: number; height: number };
  size: number; // bytes
  checksum: string;
}

export interface RenderCredits {
  balance: number;
  pending: number;
  spent: number;
  earned: number; // If providing GPU resources
  walletAddress: string;
  lastRefresh: number;
}

export interface RenderJob {
  id: string;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  status: JobStatus;
  progress: number; // 0-100
  quality: RenderQuality;
  engine: RenderEngine;
  priority: JobPriority;
  estimatedCredits: number;
  actualCredits?: number;
  frames: {
    total: number;
    completed: number;
    failed: number;
  };
  outputs: RenderOutput[];
  error?: string;
  nodeCount: number;
  gpuHours: number;
}

/**
 * Render Network State.
 * The `persistence` field uses an opaque type to avoid importing JobQueuePersistence
 * here (which would re-introduce the cycle). RenderNetworkTrait.ts narrows this
 * to `JobQueuePersistence | null` at the point of use.
 */
export interface RenderNetworkState {
  isConnected: boolean;
  apiKey: string | null;
  credits: RenderCredits | null;
  activeJobs: RenderJob[];
  completedJobs: RenderJob[];
  queuePosition: number;
  networkStatus: 'online' | 'degraded' | 'offline';
  availableNodes: number;
  estimatedWaitTime: number; // ms
  totalCost: number;
  costByQuality: Record<RenderQuality, number>;
  monthlyCost: number;
  uploadSessions: Map<string, string>; // sceneId -> sessionId
  selectedRegion: string;
  /** Opaque persistence handle — narrowed to JobQueuePersistence in RenderNetworkTrait */
  persistence: unknown;
}
