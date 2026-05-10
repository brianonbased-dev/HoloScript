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
 *
 *   @serializer {
 *     target: "User"
 *     format: "json"
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

interface ContractState {
  config: ContractConfig;
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
  onAttach(node: HSPlusNode, config: ContractConfig, context: TraitContext) {
    node.__contractState = { config };
    context.emit?.('contract_attached', {
      nodeId: node.id,
      version: config.version,
      format: config.format,
      breakingDetection: config.breaking_detection,
    });
  },
  onDetach(node: HSPlusNode, _config: ContractConfig, context: TraitContext) {
    const state = node.__contractState as ContractState | undefined;
    if (!state) return;
    context.emit?.('contract_detached', {
      nodeId: node.id,
      version: state.config.version,
      format: state.config.format,
    });
    delete node.__contractState;
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

interface SchemaState {
  config: SchemaConfig;
  validate: (input: Record<string, unknown>) => { valid: boolean; errors: string[] };
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
  onAttach(node: HSPlusNode, config: SchemaConfig, context: TraitContext) {
    const validate = (input: Record<string, unknown>) => {
      const errors: string[] = [];
      for (const field of config.required) {
        if (!(field in input) || input[field] === undefined || input[field] === null) {
          errors.push(`Required field "${field}" is missing`);
        }
      }
      for (const [key, value] of Object.entries(input)) {
        const expected = config.fields[key];
        if (!expected && !config.additional_properties) {
          errors.push(`Unknown field "${key}"`);
          continue;
        }
        if (expected === 'email' && typeof value === 'string' && !value.includes('@')) {
          errors.push(`Field "${key}" must be a valid email`);
        }
        if (expected === 'uuid' && typeof value === 'string' && value.length < 32) {
          errors.push(`Field "${key}" must be a valid UUID`);
        }
        if (expected === 'url' && typeof value === 'string' && !value.startsWith('http')) {
          errors.push(`Field "${key}" must be a valid URL`);
        }
      }
      return { valid: errors.length === 0, errors };
    };
    node.__schemaState = { config, validate };
    context.emit?.('schema_attached', {
      nodeId: node.id,
      name: config.name,
      fields: Object.keys(config.fields),
      required: config.required,
    });
  },
  onDetach(node: HSPlusNode, _config: SchemaConfig, context: TraitContext) {
    const state = node.__schemaState as SchemaState | undefined;
    if (!state) return;
    context.emit?.('schema_detached', { nodeId: node.id, name: state.config.name });
    delete node.__schemaState;
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

interface ValidatorState {
  config: ValidatorConfig;
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
  onAttach(node: HSPlusNode, config: ValidatorConfig, context: TraitContext) {
    node.__validatorState = { config };
    context.emit?.('validator_attached', {
      nodeId: node.id,
      target: config.target,
      rules: Object.keys(config.rules),
    });
  },
  onDetach(node: HSPlusNode, _config: ValidatorConfig, context: TraitContext) {
    const state = node.__validatorState as ValidatorState | undefined;
    if (!state) return;
    context.emit?.('validator_detached', { nodeId: node.id, target: state.config.target });
    delete node.__validatorState;
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

interface SerializerState {
  config: SerializerConfig;
  serialize: (input: Record<string, unknown>) => string | Uint8Array;
}

function renameKey(key: string, strategy: SerializerConfig['rename_strategy']) {
  switch (strategy) {
    case 'camelCase':
      return key.replace(/_([a-z])/g, (_, ch) => ch.toUpperCase());
    case 'snake_case':
      return key.replace(/[A-Z]/g, (ch) => `_${ch.toLowerCase()}`);
    case 'PascalCase':
      return key.replace(/(^|_)([a-z])/g, (_, __, ch) => ch.toUpperCase()).replace(/_/g, '');
    default:
      return key;
  }
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
  onAttach(node: HSPlusNode, config: SerializerConfig, context: TraitContext) {
    const serialize = (input: Record<string, unknown>) => {
      const mapped: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(input)) {
        if (value === null && !config.include_nulls) continue;
        const renamed = renameKey(config.field_map[key] || key, config.rename_strategy);
        mapped[renamed] = value;
      }
      if (config.format === 'json') {
        return JSON.stringify(mapped);
      }
      // Other formats are not yet supported at runtime; emit diagnostic
      context.emit?.('serializer_unsupported_format', {
        nodeId: node.id,
        format: config.format,
      });
      return JSON.stringify(mapped);
    };
    node.__serializerState = { config, serialize };
    context.emit?.('serializer_attached', {
      nodeId: node.id,
      target: config.target,
      format: config.format,
    });
  },
  onDetach(node: HSPlusNode, _config: SerializerConfig, context: TraitContext) {
    const state = node.__serializerState as SerializerState | undefined;
    if (!state) return;
    context.emit?.('serializer_detached', { nodeId: node.id, target: state.config.target });
    delete node.__serializerState;
  },
};
