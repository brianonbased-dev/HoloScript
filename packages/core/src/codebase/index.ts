/**
 * HoloScript Codebase — Local Utilities
 *
 * Codebase intelligence (scanning, graphs, RAG) lives in @holoscript/absorb-service.
 * Import from '@holoscript/absorb-service/engine' for those features.
 *
 * This module only exports local utilities (DedupFilter, GodFileDetector)
 * that have no dependency on absorb-service.
 */

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
