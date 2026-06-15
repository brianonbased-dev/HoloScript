/**
 * @fileoverview Freshness Bound Checker — Safety-by-Construction for Stale-Sensor Actuation
 * @module @holoscript/core/compiler/safety
 *
 * Implements the @freshnessBound(ms) safety primitive.
 *
 * DOCTRINE (from briefing):
 *   The parser is PERMISSIVE. This module is a SEPARATE VALIDATION PASS —
 *   it does NOT touch parser logic. It is wired into runSafetyPass as an
 *   additional layer, exactly as LinearTypeChecker was.
 *
 * WHAT IT DOES:
 *   When an AST node carries a @freshnessBound(ms) decorator AND consumes
 *   sensor/perception traits that expose a worst-case staleness
 *   (via update_interval or equivalent freshness metadata), this checker
 *   emits an EffectViolation (severity 'error') if:
 *
 *     sensor.worst_case_staleness_ms > declared_bound_ms
 *
 *   A worst-case staleness violation means the agent COULD act on perception
 *   data that is older than the declared safety bound — a compile error,
 *   not a runtime warning.
 *
 * CANONICAL PET-CARE CASE:
 *   @freshnessBound(500) on a move/actuate effect consuming a water-bowl or
 *   proximity sensor with update_interval=2000ms → compile error.
 *   Never actuate near the pet on stale perception.
 *
 * NEW PRIMITIVE — SENSOR STALENESS METADATA:
 *   The AST does not currently carry sensor staleness metadata. This checker
 *   introduces a clean typed seam: `FreshnessASTNode` extends `EffectASTNode`
 *   with an optional `sensorMetadata` field. The compiler front-end or test
 *   harness populates this field when it knows sensor update intervals.
 *
 *   ASSUMPTION (documented): When `sensorMetadata` is absent for a trait
 *   that looks like a sensor (matched by SENSOR_TRAIT_PATTERN), the checker
 *   conservatively assumes an UNKNOWN worst-case staleness and emits a
 *   'warning' (not 'error') asking for explicit metadata. When metadata IS
 *   present and exceeds the bound, it emits 'error'. This is the correct
 *   safety posture: unknown is cautious, known-stale is a hard compile error.
 *
 * @version 1.0.0
 */

import type { EffectASTNode } from './EffectChecker';
import type { EffectViolation } from '../../types/effects';

// =============================================================================
// SENSOR METADATA — NEW PRIMITIVE
// =============================================================================

/**
 * Freshness metadata for a sensor/perception source.
 *
 * ASSUMPTION: This is a NEW primitive. The compiler front-end must populate
 * this field when it resolves traits that expose sensor data. Until the
 * front-end is wired, tests supply it directly (the correct approach for
 * a new primitive: clean typed seam, explicit metadata, no silent fake-pass).
 */
export interface SensorFreshnessMetadata {
  /**
   * The trait name this metadata applies to (e.g. '@proximity_sensor',
   * '@water_bowl_sensor', '@lidar').
   */
  traitName: string;

  /**
   * Worst-case update interval in milliseconds. This is the maximum time
   * between consecutive sensor readings — i.e. the worst-case staleness
   * the consumer may observe.
   *
   * Example: update_interval=2000 means a reading could be up to 2000ms old.
   */
  worstCaseStalenessMs: number;
}

// =============================================================================
// FRESHNESS-BOUND AST NODE — EXTENDS EffectASTNode
// =============================================================================

/**
 * Extension of EffectASTNode that carries:
 *   1. `freshnessBoundMs` — parsed from @freshnessBound(ms)
 *   2. `sensorMetadata`  — per-trait staleness facts from the compiler front-end
 *
 * Both fields are optional so FreshnessASTNode is backward-compatible with
 * EffectASTNode: nodes without these fields are simply not freshness-checked.
 */
export interface FreshnessASTNode extends EffectASTNode {
  /**
   * Declared freshness bound in milliseconds, parsed from @freshnessBound(ms).
   * When present, all sensor traits consumed by this node are checked against
   * this bound. Absent = no freshness constraint on this node.
   */
  freshnessBoundMs?: number;

  /**
   * Sensor freshness metadata for the traits this node consumes.
   * Supplied by the compiler front-end (or test harness).
   * Each entry describes one sensor trait's worst-case staleness.
   */
  sensorMetadata?: SensorFreshnessMetadata[];
}

// =============================================================================
// SENSOR TRAIT HEURISTICS
// =============================================================================

/**
 * Trait name substrings that identify perception/sensor sources.
 * Used ONLY when sensorMetadata is absent and we need to decide whether
 * to emit a 'warning' (unknown staleness on a sensor-like trait).
 *
 * Conservative: matches broadly so we don't silently skip traits.
 */
const SENSOR_TRAIT_SUBSTRINGS: readonly string[] = [
  'sensor',
  'perception',
  'lidar',
  'camera',
  'proximity',
  'distance',
  'water',
  'temperature',
  'pressure',
  'accelerometer',
  'gyroscope',
  'gps',
  'localization',
  'slam',
  'depth',
  'infrared',
  'ultrasonic',
];

/**
 * Returns true if the trait name looks like a sensor/perception source.
 * Only used for the 'unknown staleness' warning path (not the error path).
 */
function looksLikeSensorTrait(traitName: string): boolean {
  const lower = traitName.toLowerCase();
  return SENSOR_TRAIT_SUBSTRINGS.some((sub) => lower.includes(sub));
}

// =============================================================================
// FRESHNESS BOUND CHECKER
// =============================================================================

/**
 * Result from the freshness bound checker.
 */
export interface FreshnessBoundCheckResult {
  /** Whether all freshness bound constraints are satisfied. */
  passed: boolean;
  /** Violations found (errors = stale sensor exceeds bound; warnings = unknown staleness). */
  violations: EffectViolation[];
}

/**
 * Check AST nodes for @freshnessBound violations.
 *
 * For each node that declares a `freshnessBoundMs`:
 *   - For each trait in `sensorMetadata`: if worstCaseStalenessMs > freshnessBoundMs → error.
 *   - For each trait in `traits` NOT covered by sensorMetadata that looks like a sensor:
 *     emit a warning (unknown staleness — cannot prove safe, but cannot prove unsafe either).
 *
 * Nodes without `freshnessBoundMs` are skipped entirely.
 *
 * @param nodes  AST nodes to check (may be FreshnessASTNode instances)
 * @param moduleId  Module identifier for violation source attribution
 * @returns FreshnessBoundCheckResult
 */
export function checkFreshnessBounds(
  nodes: FreshnessASTNode[],
  moduleId: string
): FreshnessBoundCheckResult {
  const violations: EffectViolation[] = [];

  for (const node of nodes) {
    // No freshness bound declared on this node → skip.
    if (node.freshnessBoundMs === undefined) continue;

    const boundMs = node.freshnessBoundMs;
    const nodeName = node.name ?? '<anonymous>';
    const metadataByTrait = buildMetadataIndex(node.sensorMetadata ?? []);

    // ── Check traits with explicit metadata ──────────────────────────────────
    for (const [traitName, meta] of metadataByTrait) {
      if (meta.worstCaseStalenessMs > boundMs) {
        violations.push({
          effect: 'io:read', // Sensor reads are IO reads in the VREffect taxonomy
          source: {
            file: node.file ?? moduleId,
            line: node.line,
            column: node.column,
            functionName: nodeName,
          },
          message:
            `@freshnessBound(${boundMs}ms) violated: sensor trait '${traitName}' has ` +
            `worst-case staleness ${meta.worstCaseStalenessMs}ms, which exceeds the declared ` +
            `bound. Actuation on stale perception is a compile-time safety error.`,
          severity: 'error',
          suggestion:
            `Either increase @freshnessBound to at least ${meta.worstCaseStalenessMs}ms, ` +
            `reduce the sensor's update_interval below ${boundMs}ms, or gate actuation ` +
            `on a freshness timestamp check at runtime.`,
        });
      }
    }

    // ── Check traits WITHOUT metadata that look like sensors ─────────────────
    // Emit a warning: we cannot prove they are safe (we don't know their
    // update interval), but we also cannot prove they are unsafe.
    for (const traitName of node.traits ?? []) {
      const normalized = traitName.startsWith('@') ? traitName : `@${traitName}`;
      if (!metadataByTrait.has(normalized) && looksLikeSensorTrait(normalized)) {
        violations.push({
          effect: 'io:read',
          source: {
            file: node.file ?? moduleId,
            line: node.line,
            column: node.column,
            functionName: nodeName,
          },
          message:
            `@freshnessBound(${boundMs}ms) declared but no staleness metadata found for ` +
            `sensor-like trait '${normalized}'. Cannot prove freshness bound is satisfied.`,
          severity: 'warning',
          suggestion:
            `Provide SensorFreshnessMetadata for '${normalized}' in the FreshnessASTNode ` +
            `so the compiler can verify the bound statically.`,
        });
      }
    }

    // ── Recurse into children ─────────────────────────────────────────────────
    if (node.children && node.children.length > 0) {
      const childResult = checkFreshnessBounds(node.children as FreshnessASTNode[], moduleId);
      violations.push(...childResult.violations);
    }
  }

  const hasError = violations.some((v) => v.severity === 'error');
  return { passed: !hasError, violations };
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Build a Map from normalized trait name → SensorFreshnessMetadata
 * for O(1) lookup during the per-trait checks.
 */
function buildMetadataIndex(
  metadata: SensorFreshnessMetadata[]
): Map<string, SensorFreshnessMetadata> {
  const index = new Map<string, SensorFreshnessMetadata>();
  for (const m of metadata) {
    const normalized = m.traitName.startsWith('@') ? m.traitName : `@${m.traitName}`;
    index.set(normalized, m);
  }
  return index;
}
