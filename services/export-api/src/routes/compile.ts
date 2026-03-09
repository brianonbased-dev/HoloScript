/**
 * Compile Routes
 *
 * POST /api/v1/compile         - Submit a compilation job (202 Accepted)
 * GET  /api/v1/compile/:jobId  - Poll job status
 * GET  /api/v1/compile/:jobId/output - Download compilation result
 *
 * ADR-002: All compilations are async. No sync mode.
 * ADR-005: Source code stored in encrypted S3, not database.
 * ADR-006: Not-found returns 404 (prevents job ID enumeration).
 */

import { Router, type Request, type Response } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { authorize } from '../middleware/authorize.js';
import { validateBody } from '../middleware/validateBody.js';
import { compileRateLimiter } from '../middleware/rateLimiter.js';
import { compileWorkerService } from '../services/compileWorker.js';
import { logger } from '../utils/logger.js';

export const compileRouter = Router();

/**
 * POST /api/v1/compile
 * Submit a new compilation job.
 * Returns 202 Accepted with job ID for polling.
 */
compileRouter.post(
  '/',
  authenticate,
  authorize('compile:submit'),
  compileRateLimiter,
  validateBody('compile'),
  async (req: Request, res: Response) => {
    try {
      const { source, target, options, idempotencyKey } = req.body;

      const job = await compileWorkerService.submit({
        source,
        target,
        options,
        idempotencyKey,
        createdBy: req.identity!.sub,
      });

      // ADR-002: Always return 202 Accepted
      res.status(202).json({
        jobId: job.id,
        status: job.status,
        target: job.target,
        createdAt: job.createdAt,
        pollUrl: `/api/v1/compile/${job.id}`,
        message: 'Compilation job accepted. Poll the status URL for updates.',
      });
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('Unsupported target')) {
        res.status(400).json({
          error: 'Bad request',
          message: error.message,
        });
        return;
      }

      logger.error({ error }, 'Compile submission error');
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

/**
 * GET /api/v1/compile/:jobId
 * Poll compilation job status.
 */
compileRouter.get(
  '/:jobId',
  authenticate,
  authorize('compile:status'),
  (req: Request, res: Response) => {
    const job = compileWorkerService.getJob(req.params.jobId);

    // ADR-006: Return 404 for non-existent jobs (prevents enumeration)
    if (!job) {
      res.status(404).json({ error: 'Not found' });
      return;
    }

    // Only allow viewing own jobs (unless admin)
    if (req.identity!.role !== 'admin' && job.createdBy !== req.identity!.sub) {
      res.status(404).json({ error: 'Not found' });
      return;
    }

    const response: Record<string, unknown> = {
      jobId: job.id,
      status: job.status,
      target: job.target,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
    };

    if (job.status === 'completed') {
      response.completedAt = job.completedAt;
      response.outputUrl = job.outputUrl;
      response.outputSizeBytes = job.outputSizeBytes;
      response.durationMs = job.durationMs;
    }

    if (job.status === 'failed') {
      response.error = job.error;
      response.completedAt = job.completedAt;
    }

    if (job.status === 'processing') {
      response.startedAt = job.startedAt;
    }

    res.status(200).json(response);
  }
);

/**
 * GET /api/v1/compile/:jobId/output
 * Download the compilation output.
 * In production: returns a signed S3 URL (ADR-005).
 */
compileRouter.get(
  '/:jobId/output',
  authenticate,
  authorize('compile:download'),
  (req: Request, res: Response) => {
    const job = compileWorkerService.getJob(req.params.jobId);

    if (!job) {
      res.status(404).json({ error: 'Not found' });
      return;
    }

    if (req.identity!.role !== 'admin' && job.createdBy !== req.identity!.sub) {
      res.status(404).json({ error: 'Not found' });
      return;
    }

    if (job.status !== 'completed') {
      res.status(409).json({
        error: 'Conflict',
        message: `Job is ${job.status}, not completed. Cannot download output.`,
      });
      return;
    }

    // In production: generate a signed S3 URL and redirect
    // For scaffold: return a placeholder response
    res.status(200).json({
      jobId: job.id,
      downloadUrl: job.outputUrl,
      contentType: job.outputContentType,
      sizeBytes: job.outputSizeBytes,
      expiresIn: 3600, // URL expires in 1 hour
      message: 'In production, this would return a signed S3 download URL.',
    });
  }
);
