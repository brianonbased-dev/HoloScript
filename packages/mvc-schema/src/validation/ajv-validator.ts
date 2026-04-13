/**
 * AJV-based JSON Schema validation for MVC objects
 *
 * Validates MVC objects against JSON schemas with comprehensive error reporting.
 *
 * @version 1.0.0
 */

import Ajv, { type ErrorObject } from 'ajv';
import addFormats from 'ajv-formats';
import { mvcSchemas, type MVCSchemaType } from '../schemas';
import type { MVCObject } from '../types';

/**
 * Validation result
 */
export interface ValidationResult {
  /** Is valid */
  valid: boolean;

  /** Validation errors (if any) */
  errors?: ValidationError[];

  /** Schema type validated against */
  schemaType?: MVCSchemaType;
}

/**
 * Detailed validation error
 */
export interface ValidationError {
  /** JSON path to error location */
  path: string;

  /** Error message */
  message: string;

  /** Schema keyword that failed */
  keyword?: string;

  /** Expected value/type */
  expected?: unknown;

  /** Actual value */
  actual?: unknown;

  /** Additional error params */
  params?: Record<string, unknown>;
}

/**
 * Create configured AJV instance
 */
function createValidator(): Ajv {
  const ajv = new Ajv({
    allErrors: true,
    verbose: true,
    strict: false,
    validateFormats: true,
    validateSchema: false, // Disable meta-schema validation
  });

  // Add format validators (uuid, date-time, etc.)
  addFormats(ajv);

  // Add all MVC schemas
  for (const [name, schema] of Object.entries(mvcSchemas)) {
    ajv.addSchema(schema, name);
  }

  return ajv;
}

/**
 * Global validator instance (singleton)
 */
let validatorInstance: Ajv | null = null;

/**
 * Get or create validator instance
 */
function getValidator(): Ajv {
  if (!validatorInstance) {
    validatorInstance = createValidator();
  }
  return validatorInstance;
}

/**
 * Convert AJV errors to detailed ValidationError format
 */
function formatErrors(ajvErrors: ErrorObject[] | null | undefined): ValidationError[] {
  if (!ajvErrors) return [];

  return ajvErrors.map((error) => ({
    path: error.instancePath || '/',
    message: error.message || 'Validation failed',
    keyword: error.keyword,
    expected: error.params,
    actual: error.data,
    params: error.params,
  }));
}

/**
 * Validate MVC object against its schema
 */
export function validateMVC(obj: unknown, schemaType: MVCSchemaType): ValidationResult {
  const validator = getValidator();
  const validate = validator.getSchema(schemaType);

  if (!validate) {
    return {
      valid: false,
      errors: [
        {
          path: '/',
          message: `Schema not found: ${schemaType}`,
        },
      ],
    };
  }

  const valid = validate(obj);

  if (valid) {
    return {
      valid: true,
      schemaType,
    };
  }

  return {
    valid: false,
    errors: formatErrors(validate.errors),
    schemaType,
  };
}

/**
 * Validate DecisionHistory
 */
export function validateDecisionHistory(obj: unknown): ValidationResult {
  return validateMVC(obj, 'decision-history');
}

/**
 * Validate ActiveTaskState
 */
export function validateTaskState(obj: unknown): ValidationResult {
  return validateMVC(obj, 'task-state');
}

/**
 * Validate UserPreferences
 */
export function validatePreferences(obj: unknown): ValidationResult {
  return validateMVC(obj, 'preferences');
}

/**
 * Validate SpatialContextSummary
 */
export function validateSpatialContext(obj: unknown): ValidationResult {
  return validateMVC(obj, 'spatial-context');
}

/**
 * Validate EvidenceTrail
 */
export function validateEvidenceTrail(obj: unknown): ValidationResult {
  return validateMVC(obj, 'evidence-trail');
}

/**
 * Auto-detect schema type and validate
 */
export function validateAuto(obj: unknown): ValidationResult {
  if (typeof obj !== 'object' || obj === null) {
    return {
      valid: false,
      errors: [
        {
          path: '/',
          message: 'Object is null or not an object',
        },
      ],
    };
  }

  const typedObj = obj as { crdtType?: string };

  // Detect schema type from crdtType field
  const crdtType = typedObj.crdtType;

  let schemaType: MVCSchemaType | null = null;

  switch (crdtType) {
    case 'g-set':
      schemaType = 'decision-history';
      break;
    case 'or-set+lww':
      schemaType = 'task-state';
      break;
    case 'lww-map':
      schemaType = 'preferences';
      break;
    case 'lww+gset':
      schemaType = 'spatial-context';
      break;
    case 'hash-chain':
      schemaType = 'evidence-trail';
      break;
    default:
      return {
        valid: false,
        errors: [
          {
            path: '/crdtType',
            message: `Unknown CRDT type: ${crdtType}`,
            expected: ['g-set', 'or-set+lww', 'lww-map', 'lww+gset', 'hash-chain'],
            actual: crdtType,
          },
        ],
      };
  }

  return validateMVC(obj, schemaType);
}

/**
 * Batch validate multiple MVC objects
 */
export function validateBatch(objects: Array<{ obj: unknown; schemaType?: MVCSchemaType }>): {
  results: ValidationResult[];
  allValid: boolean;
  errorCount: number;
} {
  const results = objects.map(({ obj, schemaType }) => {
    if (schemaType) {
      return validateMVC(obj, schemaType);
    }
    return validateAuto(obj);
  });

  const allValid = results.every((r) => r.valid);
  const errorCount = results.reduce((sum, r) => sum + (r.errors?.length ?? 0), 0);

  return {
    results,
    allValid,
    errorCount,
  };
}
