/**
 * @holoscript/core LOD System
 *
 * Comprehensive Level of Detail (LOD) system for HoloScript.
 * Includes types, runtime management, and mesh simplification.
 *
 * @example
 * ```typescript
 * import {
 *   LODManager,
 *   LODGenerator,
 *   createStandardLODConfig,
 *   createTestSphere,
 * } from '@holoscript/core/lod';
 *
 * // Create LOD manager
 * const manager = new LODManager({ targetFrameRate: 60 });
 *
 * // Create standard 3-level LOD config
 * const config = createStandardLODConfig('myObject', 3, 10);
 * manager.registerConfig('myObject', config);
 *
 * // Generate LODs from a high-poly mesh
 * const generator = new LODGenerator({ levelCount: 4 });
 * const mesh = createTestSphere(32);
 * const result = generator.generate(mesh);
 *
 * // Update LOD each frame
 * manager.setCameraPosition([0, 0, 10]);
 * manager.update(deltaTime);
 * const currentLevel = manager.getCurrentLevel('myObject');
 * ```
 *
 * @module
 */

// ============================================================================
// Types
// ============================================================================

export {
  // Core types
  type LODStrategy,
  type LODTransition,
  type SimplificationAlgorithm,
  type LODFeature,

  // Configuration
  type LODLevel,
  type LODConfig,
  type LODGroup,
  type LODHierarchy,

  // State and metrics
  type LODState,
  type LODMetrics,

  // Generation
  type LODGenerationOptions,
  type LODGenerationResult,
  type GeneratedLODLevel,

  // Constants
  DEFAULT_LOD_LEVEL,
  DEFAULT_LOD_CONFIG,
  DEFAULT_GENERATION_OPTIONS,
  STANDARD_DISTANCES,
  STANDARD_RATIOS,

  // Helper functions
  createLODLevel,
  createStandardLODConfig,
  createLODGroup,
  createLODState,
  createLODMetrics,
  selectLODLevelByDistance,
  selectLODLevelByScreenCoverage,
  calculateScreenCoverage,
  getTrianglesSaved,
  validateLODConfig,
  mergeLODConfigs,
  getRecommendedLODCount,
  calculateOptimalDistances,
} from './LODTypes';

// ============================================================================
// Manager
// ============================================================================

export {
  // Types
  type LODEventType,
  type LODEvent,
  type LODEventHandler,
  type LODManagerOptions,
  DEFAULT_MANAGER_OPTIONS,

  // Manager class
  LODManager,

  // Factory functions
  createLODManager,
  createVRLODManager,
  createMobileLODManager,
} from './LODManager';

// ============================================================================
// Generator
// ============================================================================

export {
  // Types
  type MeshData,
  type MeshValidation,

  // Generator class
  LODGenerator,

  // Factory functions
  createLODGenerator,
  generateLODs,

  // Test utilities
  createTestCube,
  createTestSphere,
} from './LODGenerator';

// ============================================================================
// v3.5 Performance Optimizations
// ============================================================================

export {
  // Transition types and classes
  type TransitionMode,
  type LODTransitionConfig,
  type TransitionState,
  type TransitionBudget,
  type ScheduledTransition,
  LODTransition,
  TransitionScheduler,
} from './LODTransition';

export {
  // Memory pool types
  type PooledBuffer,
  type PoolStatistics,
  type MemoryPoolOptions,

  // Memory pool class
  LODMemoryPool,

  // Factory functions
  createLODMemoryPool,
  createVRMemoryPool,
  createMobileMemoryPool,
} from './LODMemoryPool';

export {
  // Metrics types
  type LODLevelHistogram,
  type TransitionCostAnalysis,
  type PerformanceSnapshot,
  type ProfilingData,

  // Metrics class
  LODPerformanceMetrics,

  // Factory functions
  createLODPerformanceMetrics,
} from './LODMetrics';

// ============================================================================
// LOD Bridge (Core → Renderer Pipeline)
// ============================================================================

export {
  // Types
  type LODChain,
  type LODChainLevel,
  type LODBridgeOptions,

  // Bridge class
  LODBridge,
} from './LODBridge';
