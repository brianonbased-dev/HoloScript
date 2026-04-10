/**
 * @holoscript/mvc-schema - Minimal Viable Context Schema
 *
 * TypeScript types, JSON schemas, and utilities for cross-reality agent state
 * synchronization. All 5 MVC objects with CRDT-compatible schemas, targeting
 * <2KB per object, <10KB total compressed size.
 *
 * ## MVC Objects
 *
 * 1. **DecisionHistory** (G-Set CRDT) - Append-only decision log
 * 2. **ActiveTaskState** (OR-Set + LWW hybrid) - Current active tasks
 * 3. **UserPreferences** (LWW-Map) - Per-field preferences
 * 4. **SpatialContextSummary** (LWW + G-Set hybrid) - WGS84 geospatial anchors
 * 5. **EvidenceTrail** (VCP v1.1 hash chain) - Tamper-proof evidence
 *
 * ## Compression Pipeline
 *
 * Two-stage compression for maximum size reduction:
 * 1. Schema-based JSON compression (remove redundancy, compact keys)
 * 2. CBOR binary encoding (compact representation)
 *
 * ## Usage
 *
 * ```typescript
 * import { DecisionHistory, compressMVCFull, validateDecisionHistory } from '@holoscript/mvc-schema';
 *
 * const history: DecisionHistory = {
 *   crdtType: 'g-set',
 *   crdtId: 'abc-123',
 *   decisions: [],
 *   vectorClock: {},
 *   lastUpdated: Date.now(),
 * };
 *
 * // Validate
 * const validation = validateDecisionHistory(history);
 * console.log(validation.valid); // true
 *
 * // Compress (schema + CBOR)
 * const compressed = compressMVCFull(history);
 * console.log(compressed.finalSize); // <2KB
 * console.log(compressed.validation.valid); // true
 * ```
 *
 * @packageDocumentation
 */

// Export types
export * from './types';

// Export schemas
export * from './schemas';

// Export compression
export * from './compression';

// Export validation
export * from './validation';
