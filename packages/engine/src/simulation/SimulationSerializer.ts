/**
 * SimulationSerializer — Serialize/deserialize complete simulation configs.
 *
 * Enables shareable simulations: mesh + config + results in a single JSON
 * that can be embedded in URLs, stored in databases, or shared as files.
 */

// ── Types ────────────────────────────────────────────────────────────────────

export interface SerializedSimulation {
  /** Format version */
  v: 1;
  /** Solver type identifier */
  solverType: string;
  /** Solver configuration */
  config: Record<string, unknown>;
  /** Mesh data (compressed as regular arrays) */
  mesh?: {
    vertices: number[];
    tetrahedra?: number[];
    triangles?: number[];
    nodesPerElement?: number;
  };
  /** Simulation results (if solved) */
  results?: {
    scalarFields: Record<string, number[]>;
    stats: Record<string, unknown>;
    insights?: { severity: string; message: string }[];
  };
  /** Metadata */
  metadata: {
    createdAt: string;
    solveTimeMs?: number;
    description?: string;
  };
}

// ── Serialization ────────────────────────────────────────────────────────────

/**
 * Serialize a simulation setup (and optionally results) to a portable JSON object.
 */
export function serializeSimulation(opts: {
  solverType: string;
  config: Record<string, unknown>;
  vertices?: Float64Array | Float32Array;
  tetrahedra?: Uint32Array;
  triangles?: Uint32Array;
  nodesPerElement?: number;
  scalarFields?: Record<string, Float64Array | Float32Array>;
  stats?: Record<string, unknown>;
  description?: string;
}): SerializedSimulation {
  const result: SerializedSimulation = {
    v: 1,
    solverType: opts.solverType,
    config: opts.config,
    metadata: {
      createdAt: new Date().toISOString(),
      description: opts.description,
    },
  };

  // Mesh
  if (opts.vertices) {
    result.mesh = {
      vertices: Array.from(opts.vertices),
    };
    if (opts.tetrahedra) result.mesh.tetrahedra = Array.from(opts.tetrahedra);
    if (opts.triangles) result.mesh.triangles = Array.from(opts.triangles);
    if (opts.nodesPerElement) result.mesh.nodesPerElement = opts.nodesPerElement;
  }

  // Results
  if (opts.scalarFields || opts.stats) {
    result.results = {
      scalarFields: {},
      stats: opts.stats ?? {},
    };
    if (opts.scalarFields) {
      for (const [name, data] of Object.entries(opts.scalarFields)) {
        result.results.scalarFields[name] = Array.from(data);
      }
    }
    if (opts.stats?.solveTimeMs) {
      result.metadata.solveTimeMs = opts.stats.solveTimeMs as number;
    }
  }

  return result;
}

/**
 * Deserialize a simulation back into typed arrays.
 */
export function deserializeSimulation(data: SerializedSimulation): {
  solverType: string;
  config: Record<string, unknown>;
  vertices?: Float64Array;
  tetrahedra?: Uint32Array;
  scalarFields: Record<string, Float32Array>;
  stats: Record<string, unknown>;
} {
  const scalarFields: Record<string, Float32Array> = {};

  if (data.results?.scalarFields) {
    for (const [name, arr] of Object.entries(data.results.scalarFields)) {
      scalarFields[name] = new Float32Array(arr);
    }
  }

  return {
    solverType: data.solverType,
    config: data.config,
    vertices: data.mesh?.vertices ? new Float64Array(data.mesh.vertices) : undefined,
    tetrahedra: data.mesh?.tetrahedra ? new Uint32Array(data.mesh.tetrahedra) : undefined,
    scalarFields,
    stats: data.results?.stats ?? {},
  };
}

/**
 * Compress a serialized simulation to a base64url string for URL embedding.
 * Uses JSON → UTF-8 encoding. For browser, pair with CompressionStream for deflate.
 */
export function simulationToBase64(sim: SerializedSimulation): string {
  const json = JSON.stringify(sim);
  // Node.js compatible base64url encoding
  return Buffer.from(json, 'utf-8').toString('base64url');
}

/**
 * Decompress a base64url string back to a SerializedSimulation.
 */
export function base64ToSimulation(encoded: string): SerializedSimulation {
  const json = Buffer.from(encoded, 'base64url').toString('utf-8');
  return JSON.parse(json) as SerializedSimulation;
}

/**
 * Estimate the URL size of a serialized simulation (bytes when base64-encoded).
 */
export function estimateURLSize(sim: SerializedSimulation): number {
  const json = JSON.stringify(sim);
  // Base64 expands by ~33%
  return Math.ceil(json.length * 4 / 3);
}
