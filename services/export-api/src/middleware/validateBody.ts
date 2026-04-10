/**
 * Request Body Validation Middleware
 *
 * Validates request bodies against JSON schemas using AJV.
 * SOC 2 CC6.1: Input validation controls.
 *
 * Schemas are defined alongside routes and registered at startup.
 */

import type { Request, Response, NextFunction } from 'express';
import Ajv, { type JSONSchemaType, type ValidateFunction } from 'ajv';
import addFormats from 'ajv-formats';
import { logger } from '../utils/logger.js';

const ajv = new Ajv({
  allErrors: true,
  removeAdditional: true,
  useDefaults: true,
  coerceTypes: false,
  strict: true,
});
addFormats(ajv);

/** Compile submission request body */
export interface CompileRequestBody {
  /** HoloScript source code */
  source: string;
  /** Target export format */
  target: string;
  /** Optional compilation options */
  options?: Record<string, unknown>;
  /** Idempotency key (prevents duplicate submissions) */
  idempotencyKey?: string;
}

/** Validation-only request body */
export interface ValidateRequestBody {
  /** HoloScript source code */
  source: string;
  /** Optional target for target-specific validation */
  target?: string;
}

/** API key creation request body */
export interface CreateApiKeyBody {
  /** Human-readable name for the key */
  name: string;
  /** Role assigned to the key */
  role: 'developer' | 'viewer' | 'service';
  /** Expiry date (ISO 8601) */
  expiresAt?: string;
}

// Schema definitions
const compileSchema = {
  type: 'object' as const,
  properties: {
    source: { type: 'string' as const, minLength: 1, maxLength: 1_000_000 },
    target: { type: 'string' as const, minLength: 1, maxLength: 64 },
    options: { type: 'object' as const, nullable: true },
    idempotencyKey: { type: 'string' as const, minLength: 1, maxLength: 128, nullable: true },
  },
  required: ['source', 'target'] as const,
  additionalProperties: false,
};

const validateSchema = {
  type: 'object' as const,
  properties: {
    source: { type: 'string' as const, minLength: 1, maxLength: 1_000_000 },
    target: { type: 'string' as const, minLength: 1, maxLength: 64, nullable: true },
  },
  required: ['source'] as const,
  additionalProperties: false,
};

const createApiKeySchema = {
  type: 'object' as const,
  properties: {
    name: { type: 'string' as const, minLength: 1, maxLength: 255 },
    role: { type: 'string' as const, enum: ['developer', 'viewer', 'service'] },
    expiresAt: { type: 'string' as const, format: 'date-time', nullable: true },
  },
  required: ['name', 'role'] as const,
  additionalProperties: false,
};

// Pre-compiled validators
const validators = {
  compile: ajv.compile(compileSchema),
  validate: ajv.compile(validateSchema),
  createApiKey: ajv.compile(createApiKeySchema),
};

/**
 * Create a validation middleware for a specific schema.
 *
 * @param schemaName - Name of the pre-compiled schema
 */
export function validateBody(schemaName: keyof typeof validators) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const validate = validators[schemaName];
    if (!validate) {
      logger.error({ schemaName }, 'Unknown validation schema');
      res.status(500).json({ error: 'Internal server error' });
      return;
    }

    const valid = validate(req.body);
    if (!valid) {
      const errors = validate.errors?.map((err) => ({
        field: err.instancePath || err.schemaPath,
        message: err.message ?? 'Validation error',
        params: err.params,
      }));

      res.status(400).json({
        error: 'Validation error',
        message: 'Request body validation failed',
        details: errors,
      });
      return;
    }

    next();
  };
}
