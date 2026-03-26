/**
 * HoloScript Codebase Absorption Engine — Re-export Shim
 *
 * All codebase intelligence functionality has moved to @holoscript/absorb-service.
 * This file re-exports everything for backward compatibility.
 *
 * @deprecated Import from '@holoscript/absorb-service/engine' instead.
 */
export * from '@holoscript/absorb-service/engine';

// ============================================================================
// Gap 4: Dedup + God File Detection (new additions)
// ============================================================================

export {
  DedupFilter,
  createDedupFilter,
  type Dedupable,
  type DedupReport,
  type DedupRemoval,
  type DedupConfig,
} from './DedupFilter';

export {
  GodFileDetector,
  createGodFileDetector,
  type FileMetrics,
  type GodFileClassification,
  type GodFileReport,
  type VirtualSplitPlan,
  type SplitSegment,
  type GodFileThresholds,
} from './GodFileDetector';
