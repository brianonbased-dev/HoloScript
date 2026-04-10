/**
 * Health Check Routes
 *
 * Public endpoints for load balancer health checks and readiness probes.
 * No authentication required.
 */

import { Router, type Request, type Response } from 'express';
import { auditService } from '../services/auditService.js';

export const healthRouter = Router();

/**
 * GET /health
 * Basic health check for load balancers.
 */
healthRouter.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'healthy',
    service: '@holoscript/export-api',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

/**
 * GET /health/ready
 * Readiness probe - checks all dependencies.
 */
healthRouter.get('/health/ready', (_req: Request, res: Response) => {
  const checks = {
    auditLog: auditService.getStats().integrityValid,
    // In production: database, S3, Redis checks
    database: true, // Placeholder
    storage: true, // Placeholder
  };

  const allReady = Object.values(checks).every(Boolean);

  res.status(allReady ? 200 : 503).json({
    status: allReady ? 'ready' : 'not_ready',
    checks,
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /health/live
 * Liveness probe - is the process alive?
 */
healthRouter.get('/health/live', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'alive',
    pid: process.pid,
    memory: process.memoryUsage(),
    timestamp: new Date().toISOString(),
  });
});
