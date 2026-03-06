/**
 * Training Data Pipeline
 *
 * Generates labeled spatial reasoning training examples from
 * HoloScript compositions with spatial constraints, and monitors
 * SNN sparsity for energy-efficient neural computation.
 *
 * @module training
 */

export {
  SpatialTrainingDataGenerator,
  createSpatialTrainingDataGenerator,
} from './SpatialTrainingDataGenerator';

export type {
  SpatialDifficulty,
  SpatialRelationshipType,
  SceneObject,
  SpatialRelationship,
  SpatialScene,
  SpatialTrainingExample,
  SpatialGeneratorConfig,
  SpatialGeneratorStats,
  SpatialTrainingJSONLEntry,
  SpatialRelationshipParams,
} from './SpatialTrainingDataTypes';

export {
  SparsityMonitor,
  createSparsityMonitor,
} from './SparsityMonitor';

export type { LayerActivityInput } from './SparsityMonitor';

export type {
  SNNLayerMetrics,
  SparsitySnapshot,
  EnergyEfficiencyMetrics,
  SparsityViolation,
  SparsityMonitorConfig,
  SparsityMonitorStats,
  SparsityQualityHistoryEntry,
} from './SparsityMonitorTypes';
