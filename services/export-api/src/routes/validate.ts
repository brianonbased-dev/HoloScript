/**
 * Validate Route
 *
 * POST /api/v1/validate - Validate HoloScript source without compiling.
 *
 * Returns parse errors, type errors, and target compatibility issues.
 * Faster than compile since it skips code generation.
 */

import { Router, type Request, type Response } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { authorize } from '../middleware/authorize.js';
import { validateBody } from '../middleware/validateBody.js';
import { SUPPORTED_TARGETS } from '../services/compileWorker.js';
import { logger } from '../utils/logger.js';

export const validateRouter = Router();

/** Validation result */
interface ValidationIssue {
  severity: 'error' | 'warning' | 'info';
  message: string;
  line?: number;
  column?: number;
  rule?: string;
}

/**
 * POST /api/v1/validate
 * Validate HoloScript source code.
 */
validateRouter.post(
  '/',
  authenticate,
  authorize('validate:submit'),
  validateBody('validate'),
  async (req: Request, res: Response) => {
    try {
      const { source, target } = req.body;
      const startTime = Date.now();

      // TODO: Integrate with @holoscript/core parser and validator
      // For scaffold: simulate validation with basic checks
      const issues: ValidationIssue[] = [];

      // Basic source validation
      if (!source.trim()) {
        issues.push({
          severity: 'error',
          message: 'Source code is empty',
          line: 1,
          column: 1,
          rule: 'non-empty-source',
        });
      }

      if (source.length > 1_000_000) {
        issues.push({
          severity: 'error',
          message: 'Source code exceeds maximum size of 1MB',
          rule: 'max-source-size',
        });
      }

      // Target compatibility check
      if (target && !SUPPORTED_TARGETS.includes(target)) {
        issues.push({
          severity: 'error',
          message: `Unsupported target: ${target}. Supported: ${SUPPORTED_TARGETS.join(', ')}`,
          rule: 'valid-target',
        });
      }

      // Check for basic HoloScript syntax markers
      const hasScene = /scene\s+\w+/.test(source);
      const hasEntity = /entity\s+\w+/.test(source);
      const hasTrait = /@\w+/.test(source);

      if (!hasScene && !hasEntity && source.length > 10) {
        issues.push({
          severity: 'warning',
          message: 'No scene or entity declarations found. Source may not be valid HoloScript.',
          rule: 'has-declarations',
        });
      }

      const durationMs = Date.now() - startTime;
      const errorCount = issues.filter((i) => i.severity === 'error').length;
      const warningCount = issues.filter((i) => i.severity === 'warning').length;

      res.status(200).json({
        valid: errorCount === 0,
        issues,
        summary: {
          errors: errorCount,
          warnings: warningCount,
          infos: issues.length - errorCount - warningCount,
        },
        sourceStats: {
          length: source.length,
          lines: source.split('\n').length,
          hasScene,
          hasEntity,
          hasTrait,
        },
        target: target ?? null,
        durationMs,
      });
    } catch (error) {
      logger.error({ error }, 'Validation error');
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);
