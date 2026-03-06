/**
 * Spatial Training Data Pipeline
 *
 * Generates labeled spatial reasoning training examples from
 * HoloScript compositions with spatial constraints.
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
