/**
 * GET /health body. Host `version` stays the absorb-service-host package
 * version. `engineVersion` is the @holoscript/absorb-service copy Node loaded.
 */

import type { Request, Response } from 'express';
import { ENGINE_VERSION_FIELDS, SERVICE_VERSION } from './version.js';

export interface HealthProbeSnapshot {
  database: 'connected' | 'degraded' | 'not configured';
  moltbookAgentCountProbe: 'ok' | 'timeout' | 'error' | 'unavailable';
  mcpSessions: number;
  mcpTools: number;
  moltbookActiveAgents: number | null;
  moltbookProbeLastError: string | null;
}

export function writeHealthResponse(_req: Request, res: Response, snapshot: HealthProbeSnapshot): void {
  const db = snapshot.database;
  const diagnostics =
    db === 'degraded'
      ? {
          likely502Cause:
            'Edge proxy timeout or Postgres probe slow; check Railway logs and DATABASE_URL pool.',
          dbLayer: 'Postgres SELECT 1 probe failed or exceeded HEALTH_DB_TIMEOUT_MS.',
        }
      : db === 'not configured'
        ? {
            likely502Cause: 'App up without DATABASE_URL; API routes that require DB may error.',
            dbLayer: 'No database configured.',
          }
        : {
            likely502Cause: 'If clients still see 502, fault is usually upstream proxy or app crash — compare with this JSON.',
            dbLayer: 'Postgres probe succeeded recently.',
          };

  const engineFields: {
    engineVersion: string | null;
    engine?: { name: string; version: string };
    engineVersionReason?: string;
  } = {
    engineVersion: ENGINE_VERSION_FIELDS.engineVersion,
  };
  if (ENGINE_VERSION_FIELDS.engine) {
    engineFields.engine = ENGINE_VERSION_FIELDS.engine;
  }
  if (ENGINE_VERSION_FIELDS.engineVersion === null) {
    engineFields.engineVersionReason =
      ENGINE_VERSION_FIELDS.engineVersionReason ?? 'engine package version could not be resolved';
  }

  res.json({
    status: 'ok',
    service: 'absorb-service',
    version: SERVICE_VERSION,
    ...engineFields,
    uptime: process.uptime(),
    database: snapshot.database,
    moltbookAgentCountProbe: snapshot.moltbookAgentCountProbe,
    mcpSessions: snapshot.mcpSessions,
    mcpTools: snapshot.mcpTools,
    moltbookActiveAgents: snapshot.moltbookActiveAgents,
    moltbookProbeLastError:
      snapshot.moltbookAgentCountProbe === 'error' ? snapshot.moltbookProbeLastError : null,
    diagnostics,
    timestamp: new Date().toISOString(),
  });
}
