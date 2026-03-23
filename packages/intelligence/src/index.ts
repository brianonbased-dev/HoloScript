/**
 * @holoscript/intelligence — AI & Agent Systems
 *
 * Re-exports AI, swarm, agents, training, self-improvement from @holoscript/core.
 * This package serves as the high-level orchestration layer for autonomous systems.
 */

// Core types for Prophetic Intelligence (Phase 32)
export interface PropheticConfig {
  /** N-gram sequence length (default: 4) */
  foresightWindow: number;
  /** Minimum confidence to trigger pre-warming */
  prefetchThreshold: number;
  /** Use GPU SNN retrieval if available */
  enableNeuromorphicRetrieval: boolean;
}

export interface ForecastingResult {
  /** Predicted next state identifier */
  predictedState: string;
  /** Probability distribution across possible states */
  confidenceMap: Record<string, number>;
  /** Resonance score (0-1) for the preferred path */
  resonantConvergence: number;
}

/**
 * PropheticOptimizer — Predictive workspace orchestration
 */
export interface PropheticOptimizer {
  /** Predict the next developmental phase based on recent actions */
  predictNextPhase(actions: string[]): Promise<ForecastingResult>;
  /** Orchestrate pre-warming of predicted resources */
  prewarm(prediction: ForecastingResult): Promise<void>;
}

/**
 * SNNAssociativeMemory — O(1) trait retrieval via spiking neural networks
 */
export interface SNNAssociativeMemory {
  /** Encode a feature vector into a spike train */
  encode(features: Float32Array): void;
  /** Retrieve the most resonant symbol from the knowledge graph */
  retrieve(spikes: Uint8Array): Promise<string>;
}

// Re-export self-improvement subsystem from core subpath
export * from '@holoscript/core/self-improvement';
