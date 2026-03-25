/**
 * Codebase Scene Types
 *
 * Shared type definitions for CodebaseSceneCompiler and InteractiveSceneEnricher.
 * Extracted to avoid circular dependencies between these modules.
 *
 * @version 1.0.0
 */

import type { CodebaseGraphStats } from '../CodebaseGraph';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Subset of HoloComposition types needed for scene compilation.
 * We define them here to avoid a circular dependency on the full parser types.
 */
export interface SceneComposition {
  type: 'Composition';
  name: string;
  environment: SceneEnvironment;
  objects: SceneObject[];
  spatialGroups: SceneSpatialGroup[];
  edges: SceneEdge[];
  metadata: SceneMetadata;
  /** Interaction events (populated when interactive: true) */
  interactionEvents?: Array<{ event: string; handler: string; target: string; action: unknown }>;
  /** Attached traits (populated when interactive: true) */
  traits?: Array<{ name: string; config: Record<string, unknown> }>;
}

export interface SceneEnvironment {
  skybox: string;
  ambientLight: number;
  shadows: boolean;
  fog?: { type: string; color: string; near: number; far: number };
}

export interface SceneObject {
  type: 'Object';
  name: string;
  position: [number, number, number];
  scale: number;
  color: string;
  emissive: string;
  emissiveIntensity: number;
  opacity: number;
  geometry: string;
  traits: string[];
  properties: Record<string, unknown>;
}

export interface SceneSpatialGroup {
  type: 'SpatialGroup';
  name: string;
  objects: SceneObject[];
}

export interface SceneEdge {
  from: string;
  to: string;
  edgeType: 'import' | 'call';
  points: Array<{ x: number; y: number; z: number }>;
  color: string;
  opacity: number;
  width: number;
}

export interface SceneMetadata {
  stats: CodebaseGraphStats;
  communities: Array<{ name: string; fileCount: number }>;
  generatedAt: string;
}
