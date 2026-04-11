/**
 * MetadataSchema — Full simulation configuration capture for reproducibility.
 *
 * Every simulation run produces a JSON metadata record that captures:
 * - Solver type and version
 * - Complete parameter set
 * - Mesh/grid description
 * - Material properties used
 * - Boundary conditions
 * - Convergence settings and results
 * - Provenance (timestamp, software version)
 *
 * This record, combined with the solver code at the recorded commit,
 * should be sufficient to reproduce the simulation exactly.
 */

// ── Types ────────────────────────────────────────────────────────────────────

export interface SimulationMetadata {
  /** Schema version for forward compatibility */
  schemaVersion: '1.0.0';

  /** Unique run identifier */
  runId: string;

  /** ISO 8601 timestamp of when the simulation was executed */
  timestamp: string;

  /** Software identification */
  software: {
    name: 'HoloScript';
    version: string;
    commitHash?: string;
  };

  /** Solver configuration */
  solver: {
    type: 'thermal' | 'structural' | 'hydraulic' | 'coupled';
    /** Full solver config as-provided (JSON-serializable) */
    config: Record<string, unknown>;
  };

  /** Mesh/grid description */
  mesh: {
    type: 'regular_grid' | 'tetrahedral' | 'pipe_network';
    /** Grid dimensions or node/element counts */
    dimensions: Record<string, number>;
    /** Hash of mesh data for integrity checking */
    dataHash?: string;
  };

  /** Materials used in the simulation */
  materials: {
    name: string;
    properties: Record<string, number>;
    source?: string;
  }[];

  /** Convergence results */
  convergence?: {
    converged: boolean;
    iterations: number;
    finalResidual: number;
  };

  /** Result summary (min/max/avg of primary field) */
  resultSummary: {
    fieldName: string;
    min: number;
    max: number;
    avg: number;
  };

  /** Whether the run is deterministically reproducible */
  deterministic: boolean;

  /** Free-form notes */
  notes?: string;
}

// ── Builder ──────────────────────────────────────────────────────────────────

/**
 * Create a metadata record for a simulation run.
 */
export function createMetadata(
  partial: Omit<SimulationMetadata, 'schemaVersion' | 'timestamp' | 'runId'> & {
    runId?: string;
    timestamp?: string;
  }
): SimulationMetadata {
  return {
    schemaVersion: '1.0.0',
    runId: partial.runId ?? generateRunId(),
    timestamp: partial.timestamp ?? new Date().toISOString(),
    ...partial,
  };
}

/**
 * Validate a metadata record. Returns list of errors (empty = valid).
 */
export function validateMetadata(meta: SimulationMetadata): string[] {
  const errors: string[] = [];

  if (meta.schemaVersion !== '1.0.0') {
    errors.push(`Unknown schema version: ${meta.schemaVersion}`);
  }
  if (!meta.runId) errors.push('Missing runId');
  if (!meta.timestamp) errors.push('Missing timestamp');
  if (!meta.software?.name) errors.push('Missing software name');
  if (!meta.solver?.type) errors.push('Missing solver type');
  if (!meta.mesh?.type) errors.push('Missing mesh type');
  if (!meta.resultSummary?.fieldName) errors.push('Missing result summary');

  return errors;
}

/**
 * Serialize metadata to formatted JSON string.
 */
export function serializeMetadata(meta: SimulationMetadata): string {
  return JSON.stringify(meta, null, 2);
}

/**
 * Deserialize and validate a JSON metadata string.
 * Throws on parse error or validation failure.
 */
export function deserializeMetadata(json: string): SimulationMetadata {
  const parsed = JSON.parse(json) as SimulationMetadata;
  const errors = validateMetadata(parsed);
  if (errors.length > 0) {
    throw new Error(`Invalid simulation metadata: ${errors.join('; ')}`);
  }
  return parsed;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function generateRunId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `sim_${timestamp}_${random}`;
}
