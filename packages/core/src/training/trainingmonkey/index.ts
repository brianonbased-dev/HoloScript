/**
 * TrainingMonkey Integration Module
 *
 * Converts HoloScript spatial reasoning JSONL training data into
 * TrainingMonkey-compatible Alpaca format with SoftDedup reweighting,
 * stratified train/validation splits, and W.006-compliant training configs.
 *
 * @module training/trainingmonkey
 */

export {
  TrainingMonkeyIntegration,
  createTrainingMonkeyIntegration,
} from './TrainingMonkeyIntegration';

export type {
  AlpacaEntry,
  WeightedAlpacaEntry,
  DatasetSplit,
  SplitStats,
  TrainingMonkeyConfig,
  TrainingMonkeyIntegrationConfig,
  IntegrationResult,
} from './TrainingMonkeyTypes';

export { DEFAULT_INTEGRATION_CONFIG } from './TrainingMonkeyTypes';
