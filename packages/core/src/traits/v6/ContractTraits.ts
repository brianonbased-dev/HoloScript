/**
 * @holoscript/core v6 Universal Contract Traits
 *
 * Trait handlers for API contracts, schemas, validators, and serializers.
 * Enables compile-time contract verification between services.
 *
 * @example
 * ```hsplus
 * object "UserContract" {
 *   @contract {
 *     version: "1.0.0"
 *     format: "openapi"
 *   }
 *
 *   @schema {
 *     name: "User"
 *     fields: { id: "uuid", name: "string", email: "email" }
 *   }
 *
 *   @validator {
 *     target: "User"
 *     rules: { email: "required|email", name: "required|min:2" }
 *   }
 * }
 * ```
 */

import type { TraitHandler, TraitContext } from '../TraitTypes';
import type { HSPlusNode } from '../../types/HoloScriptPlus';

// ── Contract Trait ─────────────────────────────────────────────────────────────

export type ContractFormat = 'openapi' | 'asyncapi' | 'graphql' | 'protobuf' | 'jsonschema';

export interface ContractConfig {
  /** Contract version (semver) */
  version: string;
  /** Specification format */
  format: ContractFormat;
  /** Breaking change detection */
  breaking_detection: boolean;
  /** Contract deprecation date (ISO 8601) */
  deprecated_at: string;
  /** Successor contract reference */
  successor: string;
}

export const contractHandler: TraitHandler<ContractConfig> = {
  name: 'contract',
  defaultConfig: {
    version: '1.0.0',
    format: 'openapi',
    breaking_detection: true,
    deprecated_at: '',
    successor: '',
  },
  onAttach(_node: HSPlusNode, _config: ContractConfig, _context: TraitContext) {
    // v6 stub: contract registration
  },
};

// ── Schema Trait ───────────────────────────────────────────────────────────────

export type SchemaFieldType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'uuid'
  | 'email'
  | 'url'
  | 'date'
  | 'datetime'
  | 'json'
  | 'binary'
  | 'array'
  | 'object';

export interface SchemaConfig {
  /** Schema name */
  name: string;
  /** Field definitions (name -> type) */
  fields: Record<string, SchemaFieldType | string>;
  /** Required field names */
  required: string[];
  /** Schema extends another schema */
  extends: string;
  /** Allow additional properties */
  additional_properties: boolean;
  /** Schema description */
  description: string;
}

export const schemaHandler: TraitHandler<SchemaConfig> = {
  name: 'schema',
  defaultConfig: {
    name: '',
    fields: {},
    required: [],
    extends: '',
    additional_properties: false,
    description: '',
  },
  onAttach(_node: HSPlusNode, _config: SchemaConfig, _context: TraitContext) {
    // v6 stub: schema registration and validation setup
  },
};

// ── Validator Trait ────────────────────────────────────────────────────────────

export interface ValidatorConfig {
  /** Target schema name */
  target: string;
  /** Validation rules (field -> rule expression) */
  rules: Record<string, string>;
  /** Custom error messages (field -> message) */
  messages: Record<string, string>;
  /** Fail fast on first error */
  fail_fast: boolean;
  /** Sanitize input before validation */
  sanitize: boolean;
}

export const validatorHandler: TraitHandler<ValidatorConfig> = {
  name: 'validator',
  defaultConfig: {
    target: '',
    rules: {},
    messages: {},
    fail_fast: false,
    sanitize: true,
  },
  onAttach(_node: HSPlusNode, _config: ValidatorConfig, _context: TraitContext) {
    // v6 stub: validator registration
  },
};

// ── Serializer Trait ──────────────────────────────────────────────────────────

export type SerializationFormat = 'json' | 'msgpack' | 'protobuf' | 'cbor' | 'avro';

export interface SerializerConfig {
  /** Target schema name */
  target: string;
  /** Serialization format */
  format: SerializationFormat;
  /** Include null fields */
  include_nulls: boolean;
  /** Field renaming strategy */
  rename_strategy: 'camelCase' | 'snake_case' | 'PascalCase' | 'none';
  /** Custom field mappings (source -> target) */
  field_map: Record<string, string>;
}

export const serializerHandler: TraitHandler<SerializerConfig> = {
  name: 'serializer',
  defaultConfig: {
    target: '',
    format: 'json',
    include_nulls: false,
    rename_strategy: 'camelCase',
    field_map: {},
  },
  onAttach(_node: HSPlusNode, _config: SerializerConfig, _context: TraitContext) {
    // v6 stub: serializer registration
  },
};
