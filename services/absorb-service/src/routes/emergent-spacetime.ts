/**
 * emergent-spacetime.ts — Research Data Export API
 *
 * Export simulation data from EmergentSpacetime demo for offline analysis
 * (Python, Mathematica, Jupyter notebooks).
 *
 * Endpoints:
 *   POST /api/emergent-spacetime/export — Export current simulation state
 *   GET  /api/emergent-spacetime/:id    — Get export by ID
 *   GET  /api/emergent-spacetime        — List all exports
 *
 * Data exported:
 *   - Voxel positions, provenance, Ricci scalars (time-series)
 *   - Edge weights, mutual information, provenance (time-series)
 *   - Hubble correction δ(t)
 *   - Violation count over time
 *   - Frame timing performance metrics
 *
 * Formats: JSON, CSV, HDF5 (for large datasets)
 */

import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { stringify } from 'csv-stringify/sync';

export const router = Router();

// =============================================================================
// Types
// =============================================================================

export interface EmergentSpacetimeExport {
  id: string;
  projectId: string;
  createdAt: string;
  metadata: {
    voxelCount: number;
    edgeCount: number;
    durationSeconds: number;
    seed: number;
  };
  timeSeries: {
    frame: number;
    timestamp: number;
    voxels: VoxelSnapshot[];
    edges: EdgeSnapshot[];
    hubbleCorrection: number;
    violationCount: number;
    frameTimeMs: number;
  }[];
}

interface VoxelSnapshot {
  id: string;
  position: [number, number, number];
  provenance: number;
  ricci: number;
}

interface EdgeSnapshot {
  source: string;
  target: string;
  weight: number;
  mutualInfo: number;
  provenance: number;
}

// =============================================================================
// In-memory export registry (swap for PostgreSQL in production)
// =============================================================================

const exports = new Map<string, EmergentSpacetimeExport>();

const getParam = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? value[0] : value;

// =============================================================================
// Routes
// =============================================================================

/**
 * POST /api/emergent-spacetime/export
 *
 * Export current simulation state for research analysis.
 *
 * Body:
 *   - projectId: string (optional, links to absorb project)
 *   - data: time-series data from client
 *   - metadata: seed, voxel count, etc.
 */
router.post('/export', async (req: Request, res: Response) => {
  const { projectId, data, metadata } = req.body;

  if (!data || !Array.isArray(data.timeSeries)) {
    return res.status(400).json({ error: 'timeSeries array is required' });
  }

  const id = `es-export-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

  const exportData: EmergentSpacetimeExport = {
    id,
    projectId: projectId || 'anonymous',
    createdAt: new Date().toISOString(),
    metadata: {
      voxelCount: metadata?.voxelCount || 0,
      edgeCount: metadata?.edgeCount || 0,
      durationSeconds: data.timeSeries.length / 60, // Assume 60 FPS
      seed: metadata?.seed || 0,
    },
    timeSeries: data.timeSeries,
  };

  exports.set(id, exportData);

  res.json({
    id,
    projectId,
    formats: {
      json: `/api/emergent-spacetime/${id}/json`,
      csv: `/api/emergent-spacetime/${id}/csv`,
    },
    hint: `GET /api/emergent-spacetime/${id} to retrieve`,
  });
});

/**
 * GET /api/emergent-spacetime
 *
 * List all exports.
 */
router.get('/', (req: Request, res: Response) => {
  const allExports = Array.from(exports.values())
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  res.json({
    exports: allExports.map(e => ({
      id: e.id,
      projectId: e.projectId,
      createdAt: e.createdAt,
      voxelCount: e.metadata.voxelCount,
      edgeCount: e.metadata.edgeCount,
      durationSeconds: e.metadata.durationSeconds,
    })),
    total: allExports.length,
  });
});

/**
 * GET /api/emergent-spacetime/:id
 *
 * Get full export data.
 */
router.get('/:id', (req: Request, res: Response) => {
  const id = getParam(req.params.id);
  const exportData = id ? exports.get(id) : undefined;

  if (!exportData) {
    return res.status(404).json({ error: 'Export not found' });
  }

  res.json(exportData);
});

/**
 * GET /api/emergent-spacetime/:id/json
 *
 * Get export as JSON (full fidelity).
 */
router.get('/:id/json', (req: Request, res: Response) => {
  const id = getParam(req.params.id);
  const exportData = id ? exports.get(id) : undefined;

  if (!exportData) {
    return res.status(404).json({ error: 'Export not found' });
  }

  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="emergent-spacetime-${exportData.id}.json"`);
  res.json(exportData);
});

/**
 * GET /api/emergent-spacetime/:id/csv
 *
 * Get export as CSV (for Excel, Python pandas, R).
 * Flattens time-series into rows:
 *   frame,timestamp,voxel_id,position_x,position_y,position_z,provenance,ricci,hubble_delta,violations
 */
router.get('/:id/csv', async (req: Request, res: Response) => {
  const id = getParam(req.params.id);
  const exportData = id ? exports.get(id) : undefined;

  if (!exportData) {
    return res.status(404).json({ error: 'Export not found' });
  }

  // Flatten time-series into rows
  const rows: Record<string, unknown>[] = [];

  for (const frame of exportData.timeSeries) {
    // Voxel-level data
    for (const voxel of frame.voxels) {
      rows.push({
        frame: frame.frame,
        timestamp_ms: frame.timestamp,
        entity_type: 'voxel',
        entity_id: voxel.id,
        position_x: voxel.position[0],
        position_y: voxel.position[1],
        position_z: voxel.position[2],
        provenance: voxel.provenance,
        ricci_scalar: voxel.ricci,
        hubble_delta: frame.hubbleCorrection,
        violation_count: frame.violationCount,
        frame_time_ms: frame.frameTimeMs,
      });
    }

    // Edge-level data
    for (const edge of frame.edges) {
      rows.push({
        frame: frame.frame,
        timestamp_ms: frame.timestamp,
        entity_type: 'edge',
        entity_id: `${edge.source}-${edge.target}`,
        source: edge.source,
        target: edge.target,
        weight: edge.weight,
        mutual_info: edge.mutualInfo,
        provenance: edge.provenance,
        hubble_delta: frame.hubbleCorrection,
        violation_count: frame.violationCount,
        frame_time_ms: frame.frameTimeMs,
      });
    }
  }

  const csv = stringify(rows, {
    header: true,
    columns: [
      'frame',
      'timestamp_ms',
      'entity_type',
      'entity_id',
      'position_x',
      'position_y',
      'position_z',
      'provenance',
      'ricci_scalar',
      'hubble_delta',
      'violation_count',
      'frame_time_ms',
      'source',
      'target',
      'weight',
      'mutual_info',
    ],
  });

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="emergent-spacetime-${exportData.id}.csv"`);
  res.send(csv);
});

/**
 * DELETE /api/emergent-spacetime/:id
 *
 * Delete an export.
 */
router.delete('/:id', (req: Request, res: Response) => {
  const id = getParam(req.params.id);
  const deleted = id ? exports.delete(id) : false;

  if (!deleted) {
    return res.status(404).json({ error: 'Export not found' });
  }

  res.json({ deleted: true, id });
});

export default router;
