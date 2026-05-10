/**
 * emergent-spacetime.ts — Research Data Export API
 *
 * Persists simulation data from the EmergentSpacetime demo for offline analysis
 * (Python, Mathematica, Jupyter notebooks) with auth, ownership, retention, and
 * evidence metadata.
 */

import { Router, Request, Response } from 'express';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { stringify } from 'csv-stringify/sync';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { getDb } from '../db/client.js';
import { projects } from '../db/schema.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';

export const router = Router();

// =============================================================================
// Types
// =============================================================================

export interface EmergentSpacetimeExport {
  id: string;
  ownerId: string;
  projectId: string;
  createdAt: string;
  expiresAt: string;
  metadata: {
    voxelCount: number;
    edgeCount: number;
    durationSeconds: number;
    seed: number;
    experimentId?: string;
    notes?: string;
  };
  provenance: {
    exportFormatVersion: 1;
    evidenceSha256: string;
    byteSize: number;
    frameCount: number;
    submittedBy: {
      userId: string;
      githubUsername?: string;
      tier?: string;
    };
    source: 'emergent-spacetime-route';
    clientProvenance?: Record<string, unknown>;
  };
  retention: {
    ttlDays: number;
    retainUntil: string;
    policy: 'soft-delete-until-expiry';
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

interface RequestIdentity {
  ownerId: string;
  isAdmin: boolean;
  githubUsername?: string;
  tier?: string;
}

interface ExportIndexEntry {
  id: string;
  ownerId: string;
  projectId: string;
  createdAt: string;
  expiresAt: string;
  deletedAt?: string;
  metadata: EmergentSpacetimeExport['metadata'];
  provenance: EmergentSpacetimeExport['provenance'];
  retention: EmergentSpacetimeExport['retention'];
  storagePath: string;
}

interface ExportIndexFile {
  version: 1;
  exports: ExportIndexEntry[];
}

// =============================================================================
// Validation and limits
// =============================================================================

const DEFAULT_EXPORT_DIR = join(process.cwd(), '.data', 'emergent-spacetime-exports');
const EXPORT_DIR = process.env.EMERGENT_SPACETIME_EXPORT_DIR || DEFAULT_EXPORT_DIR;
const INDEX_FILE = join(EXPORT_DIR, 'index.json');
const MAX_EXPORT_BYTES = Number(process.env.EMERGENT_SPACETIME_EXPORT_MAX_BYTES) || 10 * 1024 * 1024;
const MAX_TIME_SERIES_FRAMES = Number(process.env.EMERGENT_SPACETIME_EXPORT_MAX_FRAMES) || 12_000;
const EXPORT_TTL_DAYS = Math.max(1, Number(process.env.EMERGENT_SPACETIME_EXPORT_TTL_DAYS) || 90);
const PROJECT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const VoxelSnapshotSchema = z.object({
  id: z.string().min(1).max(256),
  position: z.tuple([z.number().finite(), z.number().finite(), z.number().finite()]),
  provenance: z.number().finite(),
  ricci: z.number().finite(),
});

const EdgeSnapshotSchema = z.object({
  source: z.string().min(1).max(256),
  target: z.string().min(1).max(256),
  weight: z.number().finite(),
  mutualInfo: z.number().finite(),
  provenance: z.number().finite(),
});

const FrameSchema = z.object({
  frame: z.number().int().nonnegative(),
  timestamp: z.number().finite(),
  voxels: z.array(VoxelSnapshotSchema),
  edges: z.array(EdgeSnapshotSchema),
  hubbleCorrection: z.number().finite(),
  violationCount: z.number().int().nonnegative(),
  frameTimeMs: z.number().finite().nonnegative(),
});

const ExportRequestSchema = z.object({
  projectId: z.string().trim().min(1).max(160).regex(PROJECT_ID_PATTERN),
  data: z.object({
    timeSeries: z.array(FrameSchema).min(1),
  }),
  metadata: z
    .object({
      voxelCount: z.number().int().nonnegative().optional(),
      edgeCount: z.number().int().nonnegative().optional(),
      durationSeconds: z.number().finite().nonnegative().optional(),
      seed: z.number().int().optional(),
      experimentId: z.string().max(256).optional(),
      notes: z.string().max(2_000).optional(),
    })
    .optional(),
  provenance: z.record(z.string(), z.unknown()).optional(),
});

const getParam = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? value[0] : value;

// =============================================================================
// Persistence helpers
// =============================================================================

function sanitizeFileName(id: string): string {
  return id.replace(/[^A-Za-z0-9._-]/g, '_');
}

function exportFilePath(id: string): string {
  return join(EXPORT_DIR, `${sanitizeFileName(id)}.json`);
}

async function atomicWriteJson(filePath: string, data: unknown): Promise<void> {
  await mkdir(EXPORT_DIR, { recursive: true });
  const tmpPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  try {
    await writeFile(tmpPath, JSON.stringify(data, null, 2), 'utf8');
    await rename(tmpPath, filePath);
  } catch (err) {
    await rm(tmpPath, { force: true }).catch(() => {});
    throw err;
  }
}

async function readIndex(): Promise<ExportIndexFile> {
  if (!existsSync(INDEX_FILE)) {
    return { version: 1, exports: [] };
  }

  try {
    const raw = await readFile(INDEX_FILE, 'utf8');
    const parsed = JSON.parse(raw) as ExportIndexFile;
    if (parsed.version !== 1 || !Array.isArray(parsed.exports)) {
      return { version: 1, exports: [] };
    }
    return parsed;
  } catch {
    return { version: 1, exports: [] };
  }
}

async function writeIndex(index: ExportIndexFile): Promise<void> {
  await atomicWriteJson(INDEX_FILE, index);
}

function indexEntryFromExport(exportData: EmergentSpacetimeExport): ExportIndexEntry {
  return {
    id: exportData.id,
    ownerId: exportData.ownerId,
    projectId: exportData.projectId,
    createdAt: exportData.createdAt,
    expiresAt: exportData.expiresAt,
    metadata: exportData.metadata,
    provenance: exportData.provenance,
    retention: exportData.retention,
    storagePath: exportFilePath(exportData.id),
  };
}

async function saveExport(exportData: EmergentSpacetimeExport): Promise<void> {
  await atomicWriteJson(exportFilePath(exportData.id), exportData);

  const index = await readIndex();
  const nextEntry = indexEntryFromExport(exportData);
  const withoutExisting = index.exports.filter((entry) => entry.id !== exportData.id);
  await writeIndex({
    version: 1,
    exports: [...withoutExisting, nextEntry],
  });
}

async function loadExport(entry: ExportIndexEntry): Promise<EmergentSpacetimeExport | null> {
  try {
    const raw = await readFile(entry.storagePath, 'utf8');
    return JSON.parse(raw) as EmergentSpacetimeExport;
  } catch {
    return null;
  }
}

function isExpired(entry: ExportIndexEntry, now = Date.now()): boolean {
  return new Date(entry.expiresAt).getTime() <= now;
}

function canAccessEntry(entry: ExportIndexEntry, identity: RequestIdentity): boolean {
  return identity.isAdmin || entry.ownerId === identity.ownerId;
}

function isVisibleEntry(entry: ExportIndexEntry, identity: RequestIdentity): boolean {
  return canAccessEntry(entry, identity) && !entry.deletedAt && !isExpired(entry);
}

async function findVisibleExport(
  id: string,
  identity: RequestIdentity
): Promise<EmergentSpacetimeExport | null> {
  const index = await readIndex();
  const entry = index.exports.find((candidate) => candidate.id === id);
  if (!entry || !isVisibleEntry(entry, identity)) {
    return null;
  }
  return loadExport(entry);
}

async function listVisibleExports(
  identity: RequestIdentity,
  projectId?: string
): Promise<ExportIndexEntry[]> {
  const index = await readIndex();
  return index.exports
    .filter((entry) => isVisibleEntry(entry, identity))
    .filter((entry) => !projectId || entry.projectId === projectId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

async function softDeleteExport(
  id: string,
  identity: RequestIdentity
): Promise<ExportIndexEntry | null> {
  const index = await readIndex();
  const entryIndex = index.exports.findIndex((candidate) => candidate.id === id);
  if (entryIndex < 0) {
    return null;
  }

  const entry = index.exports[entryIndex];
  if (!isVisibleEntry(entry, identity)) {
    return null;
  }

  const deletedAt = new Date().toISOString();
  const nextEntry = { ...entry, deletedAt };
  index.exports[entryIndex] = nextEntry;
  await writeIndex(index);

  const exportData = await loadExport(entry);
  if (exportData) {
    await atomicWriteJson(entry.storagePath, { ...exportData, deletedAt });
  }

  return nextEntry;
}

// =============================================================================
// Auth and ownership
// =============================================================================

function getIdentity(req: Request): RequestIdentity | null {
  const authReq = req as AuthenticatedRequest;
  if (!authReq.authenticated) {
    return null;
  }

  const ownerId = authReq.userId || 'service:absorb-api-key';
  return {
    ownerId,
    isAdmin: Boolean(authReq.isAdmin),
    githubUsername: authReq.githubUsername,
    tier: authReq.tier,
  };
}

function requireIdentity(req: Request, res: Response): RequestIdentity | null {
  const identity = getIdentity(req);
  if (!identity) {
    res.status(401).json({
      error: 'Authentication required',
      message: 'Emergent spacetime exports require an authenticated owner.',
    });
    return null;
  }
  return identity;
}

async function canBindProject(identity: RequestIdentity, projectId: string): Promise<boolean> {
  if (identity.isAdmin) {
    return true;
  }

  const db = getDb();
  if (!db || !UUID_PATTERN.test(identity.ownerId) || !UUID_PATTERN.test(projectId)) {
    return true;
  }

  const rows = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.ownerId, identity.ownerId)))
    .limit(1);

  return rows.length > 0;
}

// =============================================================================
// Export construction
// =============================================================================

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function summarizeMetadata(
  parsed: z.infer<typeof ExportRequestSchema>
): EmergentSpacetimeExport['metadata'] {
  return {
    voxelCount: parsed.metadata?.voxelCount ?? 0,
    edgeCount: parsed.metadata?.edgeCount ?? 0,
    durationSeconds: parsed.metadata?.durationSeconds ?? parsed.data.timeSeries.length / 60,
    seed: parsed.metadata?.seed ?? 0,
    experimentId: parsed.metadata?.experimentId,
    notes: parsed.metadata?.notes,
  };
}

function buildExport(
  parsed: z.infer<typeof ExportRequestSchema>,
  identity: RequestIdentity,
  byteSize: number,
  evidenceSha256: string
): EmergentSpacetimeExport {
  const createdAt = new Date();
  const expiresAt = addDays(createdAt, EXPORT_TTL_DAYS);
  const id = `es-export-${uuidv4()}`;

  return {
    id,
    ownerId: identity.ownerId,
    projectId: parsed.projectId,
    createdAt: createdAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    metadata: summarizeMetadata(parsed),
    provenance: {
      exportFormatVersion: 1,
      evidenceSha256,
      byteSize,
      frameCount: parsed.data.timeSeries.length,
      submittedBy: {
        userId: identity.ownerId,
        githubUsername: identity.githubUsername,
        tier: identity.tier,
      },
      source: 'emergent-spacetime-route',
      clientProvenance: parsed.provenance,
    },
    retention: {
      ttlDays: EXPORT_TTL_DAYS,
      retainUntil: expiresAt.toISOString(),
      policy: 'soft-delete-until-expiry',
    },
    timeSeries: parsed.data.timeSeries,
  };
}

// =============================================================================
// Routes
// =============================================================================

/**
 * POST /api/emergent-spacetime/export
 *
 * Export current simulation state for research analysis.
 */
router.post('/export', async (req: Request, res: Response) => {
  const identity = requireIdentity(req, res);
  if (!identity) return;

  const payloadJson = JSON.stringify(req.body ?? {});
  const byteSize = Buffer.byteLength(payloadJson, 'utf8');
  if (byteSize > MAX_EXPORT_BYTES) {
    return res.status(413).json({
      error: 'Export too large',
      maxBytes: MAX_EXPORT_BYTES,
      actualBytes: byteSize,
    });
  }

  const parsed = ExportRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Invalid export payload',
      details: parsed.error.issues,
    });
  }

  if (parsed.data.data.timeSeries.length > MAX_TIME_SERIES_FRAMES) {
    return res.status(413).json({
      error: 'Too many time-series frames',
      maxFrames: MAX_TIME_SERIES_FRAMES,
      actualFrames: parsed.data.data.timeSeries.length,
    });
  }

  if (!(await canBindProject(identity, parsed.data.projectId))) {
    return res.status(403).json({
      error: 'Project access denied',
      message: 'The authenticated owner is not allowed to bind exports to this project.',
    });
  }

  const exportData = buildExport(parsed.data, identity, byteSize, sha256(payloadJson));
  await saveExport(exportData);

  res.status(201).json({
    id: exportData.id,
    projectId: exportData.projectId,
    createdAt: exportData.createdAt,
    expiresAt: exportData.expiresAt,
    evidenceSha256: exportData.provenance.evidenceSha256,
    byteSize: exportData.provenance.byteSize,
    formats: {
      json: `/api/emergent-spacetime/${exportData.id}/json`,
      csv: `/api/emergent-spacetime/${exportData.id}/csv`,
    },
    hint: `GET /api/emergent-spacetime/${exportData.id} to retrieve`,
  });
});

/**
 * GET /api/emergent-spacetime
 *
 * List exports visible to the authenticated owner.
 */
router.get('/', async (req: Request, res: Response) => {
  const identity = requireIdentity(req, res);
  if (!identity) return;

  const projectId = getParam(req.query.projectId as string | string[] | undefined);
  if (projectId && !PROJECT_ID_PATTERN.test(projectId)) {
    return res.status(400).json({ error: 'Invalid projectId filter' });
  }

  const allExports = await listVisibleExports(identity, projectId);

  res.json({
    exports: allExports.map((entry) => ({
      id: entry.id,
      projectId: entry.projectId,
      createdAt: entry.createdAt,
      expiresAt: entry.expiresAt,
      voxelCount: entry.metadata.voxelCount,
      edgeCount: entry.metadata.edgeCount,
      durationSeconds: entry.metadata.durationSeconds,
      evidenceSha256: entry.provenance.evidenceSha256,
      byteSize: entry.provenance.byteSize,
      frameCount: entry.provenance.frameCount,
    })),
    total: allExports.length,
  });
});

/**
 * GET /api/emergent-spacetime/:id
 *
 * Get full export data.
 */
router.get('/:id', async (req: Request, res: Response) => {
  const identity = requireIdentity(req, res);
  if (!identity) return;

  const id = getParam(req.params.id);
  const exportData = id ? await findVisibleExport(id, identity) : null;

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
router.get('/:id/json', async (req: Request, res: Response) => {
  const identity = requireIdentity(req, res);
  if (!identity) return;

  const id = getParam(req.params.id);
  const exportData = id ? await findVisibleExport(id, identity) : null;

  if (!exportData) {
    return res.status(404).json({ error: 'Export not found' });
  }

  res.setHeader('Content-Type', 'application/json');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="emergent-spacetime-${exportData.id}.json"`
  );
  res.json(exportData);
});

/**
 * GET /api/emergent-spacetime/:id/csv
 *
 * Get export as CSV (for Excel, Python pandas, R).
 */
router.get('/:id/csv', async (req: Request, res: Response) => {
  const identity = requireIdentity(req, res);
  if (!identity) return;

  const id = getParam(req.params.id);
  const exportData = id ? await findVisibleExport(id, identity) : null;

  if (!exportData) {
    return res.status(404).json({ error: 'Export not found' });
  }

  const rows: Record<string, unknown>[] = [];

  for (const frame of exportData.timeSeries) {
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
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="emergent-spacetime-${exportData.id}.csv"`
  );
  res.send(csv);
});

/**
 * DELETE /api/emergent-spacetime/:id
 *
 * Soft-delete an export. The payload remains retained until expiresAt so paper
 * evidence can still be audited by operators while normal reads are hidden.
 */
router.delete('/:id', async (req: Request, res: Response) => {
  const identity = requireIdentity(req, res);
  if (!identity) return;

  const id = getParam(req.params.id);
  const deleted = id ? await softDeleteExport(id, identity) : null;

  if (!deleted) {
    return res.status(404).json({ error: 'Export not found' });
  }

  res.json({
    deleted: true,
    id,
    retainedUntil: deleted.retention.retainUntil,
    evidenceSha256: deleted.provenance.evidenceSha256,
  });
});

export default router;
