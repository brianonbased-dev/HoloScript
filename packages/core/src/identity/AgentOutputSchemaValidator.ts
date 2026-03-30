/**
 * AgentOutputSchemaValidator -- Schema validation gate for agent outputs.
 *
 * Extends the AgentRBAC confabulation risk layer with structured schema
 * validation to ensure agent-generated outputs conform to expected types
 * before they reach compiler targets.
 *
 * This module adds:
 * 1. Output schema definitions for each compiler target (R3F, GLTF, Unity, Unreal)
 * 2. Runtime type checking for agent-produced compositions
 * 3. Risk scoring based on deviation from expected schemas
 * 4. Integration point for AgentRBAC.checkAccessWithSchemaGate()
 *
 * TARGET: packages/core/src/compiler/identity/AgentOutputSchemaValidator.ts
 *
 * @version 1.0.0
 */

import type {
  HoloComposition,
  HoloObjectDecl,
  HoloObjectTrait,
} from '../../parser/HoloCompositionTypes';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Supported value types for schema validation.
 */
export type SchemaValueType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'array'
  | 'object'
  | 'vector2'
  | 'vector3'
  | 'vector4'
  | 'quaternion'
  | 'color'
  | 'enum'
  | 'null'
  | 'any';

/**
 * Schema for a single property in an output object.
 */
export interface OutputPropertySchema {
  /** Property name (dot-separated for nested paths) */
  name: string;
  /** Expected type */
  type: SchemaValueType;
  /** Whether the property is required in output */
  required: boolean;
  /** For enum types, the allowed values */
  enumValues?: string[];
  /** For number types, minimum value */
  min?: number;
  /** For number types, maximum value */
  max?: number;
  /** For array types, expected element type */
  elementType?: SchemaValueType;
  /** For array types, expected length */
  length?: number;
  /** Default value if not provided */
  defaultValue?: unknown;
  /** Human-readable description */
  description?: string;
}

/**
 * Schema for a complete output object (e.g., a compiled mesh, material, etc.)
 */
export interface OutputObjectSchema {
  /** Schema name (e.g., 'R3FMesh', 'GLTFNode') */
  name: string;
  /** Target compiler this schema applies to */
  target: CompilerTarget;
  /** Properties in this schema */
  properties: OutputPropertySchema[];
}

/**
 * Compiler targets supported by the schema validator.
 */
export type CompilerTarget = 'r3f' | 'gltf' | 'unity' | 'unreal' | 'generic';

/**
 * Result of schema validation on agent output.
 */
export interface SchemaValidationResult {
  /** Whether the output passed all schema checks */
  valid: boolean;
  /** Overall risk score (0-100) */
  riskScore: number;
  /** Individual validation errors */
  errors: SchemaValidationError[];
  /** Non-blocking warnings */
  warnings: SchemaValidationWarning[];
  /** Schemas checked */
  schemasChecked: number;
  /** Properties validated */
  propertiesValidated: number;
  /** Validation time in ms */
  validationTimeMs: number;
}

/**
 * A schema validation error (blocks output).
 */
export interface SchemaValidationError {
  code: SchemaErrorCode;
  message: string;
  path: string;
  expectedType?: SchemaValueType;
  actualType?: string;
  riskContribution: number;
}

/**
 * A schema validation warning (non-blocking).
 */
export interface SchemaValidationWarning {
  code: string;
  message: string;
  path: string;
  riskContribution: number;
}

/**
 * Error codes for schema validation.
 */
export enum SchemaErrorCode {
  MISSING_REQUIRED = 'SCHEMA_MISSING_REQUIRED',
  TYPE_MISMATCH = 'SCHEMA_TYPE_MISMATCH',
  VALUE_OUT_OF_RANGE = 'SCHEMA_VALUE_OUT_OF_RANGE',
  INVALID_ENUM = 'SCHEMA_INVALID_ENUM',
  INVALID_ARRAY_LENGTH = 'SCHEMA_INVALID_ARRAY_LENGTH',
  INVALID_VECTOR = 'SCHEMA_INVALID_VECTOR',
  UNKNOWN_PROPERTY = 'SCHEMA_UNKNOWN_PROPERTY',
  STRUCTURAL_ANOMALY = 'SCHEMA_STRUCTURAL_ANOMALY',
}

// =============================================================================
// BUILT-IN OUTPUT SCHEMAS
// =============================================================================

/**
 * R3F output schemas -- validates that compiled R3F nodes have correct structure.
 */
const R3F_MESH_SCHEMA: OutputObjectSchema = {
  name: 'R3FMesh',
  target: 'r3f',
  properties: [
    { name: 'type', type: 'string', required: true, description: 'Node type (mesh, group, light)' },
    { name: 'id', type: 'string', required: true, description: 'Unique node identifier' },
    {
      name: 'props.position',
      type: 'vector3',
      required: false,
      description: 'World position [x,y,z]',
    },
    {
      name: 'props.rotation',
      type: 'vector3',
      required: false,
      description: 'Euler rotation [x,y,z]',
    },
    { name: 'props.scale', type: 'vector3', required: false, description: 'Scale [x,y,z]' },
    { name: 'props.color', type: 'color', required: false, description: 'Material color' },
    {
      name: 'props.metalness',
      type: 'number',
      required: false,
      min: 0,
      max: 1,
      description: 'PBR metalness',
    },
    {
      name: 'props.roughness',
      type: 'number',
      required: false,
      min: 0,
      max: 1,
      description: 'PBR roughness',
    },
    {
      name: 'props.opacity',
      type: 'number',
      required: false,
      min: 0,
      max: 1,
      description: 'Opacity',
    },
    {
      name: 'props.hsType',
      type: 'enum',
      required: false,
      enumValues: [
        'box',
        'sphere',
        'cylinder',
        'cone',
        'plane',
        'torus',
        'ring',
        'capsule',
        'hull',
        'metaball',
        'blob',
        'spline',
        'membrane',
      ],
      description: 'Geometry type',
    },
    { name: 'props.size', type: 'number', required: false, min: 0, description: 'Geometry size' },
  ],
};

const GLTF_NODE_SCHEMA: OutputObjectSchema = {
  name: 'GLTFNode',
  target: 'gltf',
  properties: [
    { name: 'name', type: 'string', required: true, description: 'Node name' },
    { name: 'translation', type: 'vector3', required: false, description: 'Translation [x,y,z]' },
    {
      name: 'rotation',
      type: 'quaternion',
      required: false,
      description: 'Rotation quaternion [x,y,z,w]',
    },
    { name: 'scale', type: 'vector3', required: false, description: 'Scale [x,y,z]' },
    { name: 'mesh', type: 'number', required: false, min: 0, description: 'Mesh index' },
  ],
};

const BUILT_IN_SCHEMAS: OutputObjectSchema[] = [R3F_MESH_SCHEMA, GLTF_NODE_SCHEMA];

// =============================================================================
// VALIDATOR
// =============================================================================

export interface AgentOutputSchemaValidatorConfig {
  /** Risk score threshold (default: 50) */
  riskThreshold?: number;
  /** Treat unknown properties as errors (default: false) */
  strictUnknownProperties?: boolean;
  /** Additional schemas */
  customSchemas?: OutputObjectSchema[];
  /** Target compiler for validation context */
  target?: CompilerTarget;
}

export class AgentOutputSchemaValidator {
  private readonly schemas: OutputObjectSchema[];
  private readonly config: Required<AgentOutputSchemaValidatorConfig>;

  constructor(config: AgentOutputSchemaValidatorConfig = {}) {
    this.config = {
      riskThreshold: config.riskThreshold ?? 50,
      strictUnknownProperties: config.strictUnknownProperties ?? false,
      customSchemas: config.customSchemas ?? [],
      target: config.target ?? 'generic',
    };

    this.schemas = [...BUILT_IN_SCHEMAS, ...this.config.customSchemas];
  }

  /**
   * Validate an agent-produced value against a schema type.
   */
  private validateType(value: unknown, schema: OutputPropertySchema): SchemaValidationError | null {
    if (value === undefined || value === null) {
      if (schema.required) {
        return {
          code: SchemaErrorCode.MISSING_REQUIRED,
          message: `Required property '${schema.name}' is missing`,
          path: schema.name,
          expectedType: schema.type,
          riskContribution: 15,
        };
      }
      return null;
    }

    const actualType = typeof value;

    switch (schema.type) {
      case 'string':
        if (actualType !== 'string') {
          return {
            code: SchemaErrorCode.TYPE_MISMATCH,
            message: `'${schema.name}' expected string, got ${actualType}`,
            path: schema.name,
            expectedType: 'string',
            actualType,
            riskContribution: 20,
          };
        }
        break;

      case 'number':
        if (actualType !== 'number' || !isFinite(value as number)) {
          return {
            code: SchemaErrorCode.TYPE_MISMATCH,
            message: `'${schema.name}' expected finite number, got ${actualType}`,
            path: schema.name,
            expectedType: 'number',
            actualType,
            riskContribution: 20,
          };
        }
        if (schema.min !== undefined && (value as number) < schema.min) {
          return {
            code: SchemaErrorCode.VALUE_OUT_OF_RANGE,
            message: `'${schema.name}' value ${value} is below minimum ${schema.min}`,
            path: schema.name,
            riskContribution: 10,
          };
        }
        if (schema.max !== undefined && (value as number) > schema.max) {
          return {
            code: SchemaErrorCode.VALUE_OUT_OF_RANGE,
            message: `'${schema.name}' value ${value} exceeds maximum ${schema.max}`,
            path: schema.name,
            riskContribution: 10,
          };
        }
        break;

      case 'boolean':
        if (actualType !== 'boolean') {
          return {
            code: SchemaErrorCode.TYPE_MISMATCH,
            message: `'${schema.name}' expected boolean, got ${actualType}`,
            path: schema.name,
            expectedType: 'boolean',
            actualType,
            riskContribution: 15,
          };
        }
        break;

      case 'array':
        if (!Array.isArray(value)) {
          return {
            code: SchemaErrorCode.TYPE_MISMATCH,
            message: `'${schema.name}' expected array, got ${actualType}`,
            path: schema.name,
            expectedType: 'array',
            actualType,
            riskContribution: 20,
          };
        }
        if (schema.length !== undefined && (value as unknown[]).length !== schema.length) {
          return {
            code: SchemaErrorCode.INVALID_ARRAY_LENGTH,
            message: `'${schema.name}' expected array of length ${schema.length}, got ${(value as unknown[]).length}`,
            path: schema.name,
            riskContribution: 10,
          };
        }
        break;

      case 'vector2':
        if (
          !Array.isArray(value) ||
          (value as number[]).length !== 2 ||
          !(value as number[]).every((v) => typeof v === 'number' && isFinite(v))
        ) {
          return {
            code: SchemaErrorCode.INVALID_VECTOR,
            message: `'${schema.name}' expected [x,y] vector2, got ${JSON.stringify(value)}`,
            path: schema.name,
            expectedType: 'vector2',
            riskContribution: 15,
          };
        }
        break;

      case 'vector3':
        if (
          !Array.isArray(value) ||
          (value as number[]).length !== 3 ||
          !(value as number[]).every((v) => typeof v === 'number' && isFinite(v))
        ) {
          return {
            code: SchemaErrorCode.INVALID_VECTOR,
            message: `'${schema.name}' expected [x,y,z] vector3, got ${JSON.stringify(value)}`,
            path: schema.name,
            expectedType: 'vector3',
            riskContribution: 15,
          };
        }
        break;

      case 'vector4':
      case 'quaternion':
        if (
          !Array.isArray(value) ||
          (value as number[]).length !== 4 ||
          !(value as number[]).every((v) => typeof v === 'number' && isFinite(v))
        ) {
          return {
            code: SchemaErrorCode.INVALID_VECTOR,
            message: `'${schema.name}' expected [x,y,z,w] ${schema.type}, got ${JSON.stringify(value)}`,
            path: schema.name,
            expectedType: schema.type,
            riskContribution: 15,
          };
        }
        break;

      case 'color':
        if (actualType === 'string') {
          const colorStr = value as string;
          if (
            !colorStr.match(/^#[0-9a-fA-F]{3,8}$/) &&
            !colorStr.match(/^(rgb|hsl)a?\(/) &&
            !colorStr.match(/^[a-z]+$/i)
          ) {
            return {
              code: SchemaErrorCode.TYPE_MISMATCH,
              message: `'${schema.name}' invalid color format: ${colorStr}`,
              path: schema.name,
              expectedType: 'color',
              actualType: 'string',
              riskContribution: 10,
            };
          }
        } else if (actualType !== 'number') {
          return {
            code: SchemaErrorCode.TYPE_MISMATCH,
            message: `'${schema.name}' expected color (string or number), got ${actualType}`,
            path: schema.name,
            expectedType: 'color',
            actualType,
            riskContribution: 15,
          };
        }
        break;

      case 'enum':
        if (schema.enumValues && !schema.enumValues.includes(String(value))) {
          return {
            code: SchemaErrorCode.INVALID_ENUM,
            message: `'${schema.name}' value '${value}' not in allowed values: [${schema.enumValues.join(', ')}]`,
            path: schema.name,
            riskContribution: 20,
          };
        }
        break;

      case 'object':
        if (actualType !== 'object' || value === null || Array.isArray(value)) {
          return {
            code: SchemaErrorCode.TYPE_MISMATCH,
            message: `'${schema.name}' expected object, got ${Array.isArray(value) ? 'array' : actualType}`,
            path: schema.name,
            expectedType: 'object',
            actualType,
            riskContribution: 20,
          };
        }
        break;

      case 'any':
        // Accept anything
        break;
    }

    return null;
  }

  /**
   * Resolve a dot-separated property path on an object.
   */
  private resolvePath(obj: Record<string, any>, path: string): unknown {
    const parts = path.split('.');
    let current: any = obj;
    for (const part of parts) {
      if (current === undefined || current === null) return undefined;
      current = current[part];
    }
    return current;
  }

  /**
   * Validate a single output object against a schema.
   */
  validateObject(obj: Record<string, any>, schema: OutputObjectSchema): SchemaValidationResult {
    const start = Date.now();
    const errors: SchemaValidationError[] = [];
    const warnings: SchemaValidationWarning[] = [];
    let propertiesValidated = 0;

    for (const propSchema of schema.properties) {
      const value = this.resolvePath(obj, propSchema.name);
      const error = this.validateType(value, propSchema);

      if (error) {
        errors.push(error);
      }
      propertiesValidated++;
    }

    const riskScore = Math.min(
      100,
      errors.reduce((sum, e) => sum + e.riskContribution, 0)
    );

    return {
      valid: riskScore < this.config.riskThreshold,
      riskScore,
      errors,
      warnings,
      schemasChecked: 1,
      propertiesValidated,
      validationTimeMs: Date.now() - start,
    };
  }

  /**
   * Validate a full composition's objects against the appropriate schema.
   */
  validateComposition(composition: HoloComposition): SchemaValidationResult {
    const start = Date.now();
    const allErrors: SchemaValidationError[] = [];
    const allWarnings: SchemaValidationWarning[] = [];
    let totalProps = 0;
    let schemasChecked = 0;

    // Find schemas matching target
    const targetSchemas = this.schemas.filter(
      (s) => s.target === this.config.target || s.target === 'generic'
    );

    // Structural checks on the composition itself
    if (!composition) {
      allErrors.push({
        code: SchemaErrorCode.STRUCTURAL_ANOMALY,
        message: 'Composition is null or undefined',
        path: '',
        riskContribution: 100,
      });
    } else {
      // Validate composition metadata
      if (!composition.name || typeof composition.name !== 'string') {
        allWarnings.push({
          code: 'SCHEMA_MISSING_NAME',
          message: 'Composition is missing a name',
          path: 'name',
          riskContribution: 5,
        });
      }

      // Validate each object
      if (composition.objects && Array.isArray(composition.objects)) {
        for (const obj of composition.objects) {
          for (const schema of targetSchemas) {
            const result = this.validateObject(obj as unknown as Record<string, any>, schema);
            allErrors.push(...result.errors);
            allWarnings.push(...result.warnings);
            totalProps += result.propertiesValidated;
            schemasChecked++;
          }
        }
      }
    }

    const riskScore = Math.min(
      100,
      allErrors.reduce((sum, e) => sum + e.riskContribution, 0)
    );

    return {
      valid: riskScore < this.config.riskThreshold,
      riskScore,
      errors: allErrors,
      warnings: allWarnings,
      schemasChecked,
      propertiesValidated: totalProps,
      validationTimeMs: Date.now() - start,
    };
  }

  /**
   * Get all registered schemas.
   */
  getSchemas(): OutputObjectSchema[] {
    return [...this.schemas];
  }

  /**
   * Register a custom schema.
   */
  registerSchema(schema: OutputObjectSchema): void {
    this.schemas.push(schema);
  }
}

// =============================================================================
// SINGLETON
// =============================================================================

let _globalValidator: AgentOutputSchemaValidator | null = null;

export function getOutputSchemaValidator(
  config?: AgentOutputSchemaValidatorConfig
): AgentOutputSchemaValidator {
  if (!_globalValidator) {
    _globalValidator = new AgentOutputSchemaValidator(config);
  }
  return _globalValidator;
}

export function resetOutputSchemaValidator(): void {
  _globalValidator = null;
}
