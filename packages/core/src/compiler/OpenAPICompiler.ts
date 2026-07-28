/**
 * @fileoverview OpenAPI Compiler (Bridge Target)
 * @module @holoscript/core/compiler
 *
 * PURPOSE:
 * Compile HoloScript compositions to OpenAPI 3.1 JSON spec, bridging
 * .hs node service definitions to a standard machine-readable API contract.
 *
 * INPUT:  HoloComposition containing HoloObjectDecl nodes with service traits.
 * OUTPUT: OpenAPI 3.1 JSON string.
 *
 * Trait extraction rules:
 *   @endpoint    → paths entry (method from value: GET/POST/PUT/DELETE, default GET)
 *   @param       → parameters array on the path operation
 *   @returns     → responses 200 schema + components/schemas entry
 *   @auth        → security scheme reference (Bearer / ApiKey / OAuth2)
 *   @description → operation summary + description
 *
 * Fallback: if no @endpoint traits are found, emits a sample spec with one
 * GET /health endpoint so consumers always receive a valid document.
 */

import type {
  HoloComposition,
  HoloObjectDecl,
  HoloObjectTrait,
  HoloValue,
} from '../parser/HoloCompositionTypes.js';
import { CompilerBase, type CompilerToken } from './CompilerBase';
import { ANSCapabilityPath, type ANSCapabilityPathValue } from '@holoscript/core-types/ans';

// ── Public option types ────────────────────────────────────────────────────

export interface OpenAPICompilerOptions {
  /** Output format — 'json' (default) or 'yaml' */
  format: 'json' | 'yaml';
  /** API info title override (defaults to composition name) */
  title?: string;
  /** API info version override (defaults to "1.0.0") */
  version?: string;
  /** Server URL override (defaults to "/api") */
  serverUrl?: string;
  /** Pretty-print JSON output */
  pretty: boolean;
}

// ── Internal structural types ──────────────────────────────────────────────

type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete' | 'head' | 'options';

interface OpenAPIParameter {
  name: string;
  in: 'query' | 'path' | 'header' | 'cookie';
  required: boolean;
  description?: string;
  schema: { type: string };
}

interface OpenAPIMediaContent {
  schema?: {
    $ref?: string;
    type?: string;
    properties?: Record<string, { type: string }>;
  };
}

interface OpenAPIResponse {
  description: string;
  content?: Record<string, OpenAPIMediaContent>;
}

interface OpenAPIOperation {
  summary?: string;
  description?: string;
  operationId: string;
  parameters?: OpenAPIParameter[];
  requestBody?: {
    required: boolean;
    content: Record<string, OpenAPIMediaContent>;
  };
  responses: Record<string, OpenAPIResponse>;
  security?: Array<Record<string, string[]>>;
  tags?: string[];
}

interface OpenAPIPathItem {
  [method: string]: OpenAPIOperation;
}

interface OpenAPISchema {
  type: string;
  properties?: Record<string, { type: string; description?: string }>;
}

interface OpenAPISecurityScheme {
  type: string;
  scheme?: string;
  bearerFormat?: string;
  in?: string;
  name?: string;
  flows?: Record<string, unknown>;
}

interface OpenAPISpec {
  openapi: '3.1.0';
  info: {
    title: string;
    version: string;
    description?: string;
  };
  servers: Array<{ url: string }>;
  paths: Record<string, OpenAPIPathItem>;
  components?: {
    schemas?: Record<string, OpenAPISchema>;
    securitySchemes?: Record<string, OpenAPISecurityScheme>;
  };
}

// ── Result type ────────────────────────────────────────────────────────────

export interface OpenAPICompilationResult {
  success: boolean;
  format: 'json' | 'yaml';
  spec: string;
  endpointCount: number;
  schemaCount: number;
  warnings: string[];
  errors: string[];
}

// ── Trait name constants ───────────────────────────────────────────────────

type OpenAPITraitName =
  | 'endpoint'
  | 'param'
  | 'returns'
  | 'auth'
  | 'description'
  | 'service'
  | 'http'
  | 'route';

const OPENAPI_TRAIT_NAMES: readonly OpenAPITraitName[] = [
  'endpoint',
  'param',
  'returns',
  'auth',
  'description',
  'service',
  'http',
  'route',
];

const ENDPOINT_TRAIT_NAMES: readonly string[] = ['endpoint', 'http', 'route'];

const VALID_METHODS: ReadonlySet<HttpMethod> = new Set([
  'get',
  'post',
  'put',
  'patch',
  'delete',
  'head',
  'options',
]);

// ── Compiler ───────────────────────────────────────────────────────────────

export class OpenAPICompiler extends CompilerBase {
  protected readonly compilerName = 'OpenAPICompiler';

  protected override getRequiredCapability(): ANSCapabilityPathValue {
    // OpenAPI lives in the interchange domain — closest ANS peer is NODE_SERVICE
    // (BRIDGE target). Until 'openapi' is added to ANSNamespace, this returns
    // the interchange/gltf slot as a runtime fallback so UCAN checks are
    // structurally gated; callers using JWT RBAC are unaffected (token is
    // validated in validateCompilerAccess regardless of ANS path).
    return ANSCapabilityPath.NODE_SERVICE;
  }

  private options: Required<OpenAPICompilerOptions>;
  private errors: string[] = [];
  private warnings: string[] = [];
  private schemas: Record<string, OpenAPISchema> = {};
  private securitySchemes: Record<string, OpenAPISecurityScheme> = {};

  constructor(options: Partial<OpenAPICompilerOptions> = {}) {
    super();
    this.options = {
      format: options.format ?? 'json',
      title: options.title ?? '',
      version: options.version ?? '1.0.0',
      serverUrl: options.serverUrl ?? '/api',
      pretty: options.pretty ?? true,
    };
  }

  override compile(
    composition: HoloComposition,
    agentToken: string,
    outputPath?: string
  ): OpenAPICompilationResult {
    this.validateCompilerAccess(agentToken as CompilerToken, outputPath);

    // Reset per-compilation state
    this.errors = [];
    this.warnings = [];
    this.schemas = {};
    this.securitySchemes = {};

    if (!composition || composition.type !== 'Composition') {
      this.errors.push('Invalid composition tree');
      return this.buildResult('', 0);
    }

    const endpointNodes = this.extractEndpointNodes(composition);

    if (endpointNodes.length === 0) {
      this.warnings.push(
        'No @endpoint, @http, or @route traits found. Emitting sample /health spec.'
      );
    }

    const title = this.options.title || composition.name || 'HoloScript API';
    const paths =
      endpointNodes.length > 0 ? this.buildPaths(endpointNodes) : this.buildFallbackPaths();

    const spec: OpenAPISpec = {
      openapi: '3.1.0',
      info: {
        title,
        version: this.options.version,
      },
      servers: [{ url: this.options.serverUrl }],
      paths,
    };

    // Attach components only when populated during path building
    const hasSchemas = Object.keys(this.schemas).length > 0;
    const hasSecuritySchemes = Object.keys(this.securitySchemes).length > 0;
    if (hasSchemas || hasSecuritySchemes) {
      spec.components = {};
      if (hasSchemas) spec.components.schemas = this.schemas;
      if (hasSecuritySchemes) spec.components.securitySchemes = this.securitySchemes;
    }

    const specString =
      this.options.format === 'json'
        ? JSON.stringify(spec, null, this.options.pretty ? 2 : 0)
        : this.specToYaml(spec);

    return this.buildResult(specString, endpointNodes.length);
  }

  // ── Node extraction ────────────────────────────────────────────────────────

  private extractEndpointNodes(astNode: unknown): HoloObjectDecl[] {
    const matched: HoloObjectDecl[] = [];
    const seen = new Set<HoloObjectDecl>();

    const traverse = (node: unknown): void => {
      if (Array.isArray(node)) {
        for (const item of node) traverse(item);
        return;
      }
      if (!node || typeof node !== 'object') return;
      const record = node as Record<string, unknown>;
      if (this.isObjectDecl(record) && this.nodeHasAnyEndpointTrait(record) && !seen.has(record)) {
        matched.push(record);
        seen.add(record);
      }
      for (const value of Object.values(record)) {
        if (value && typeof value === 'object') {
          traverse(value);
        }
      }
    };
    traverse(astNode);
    return matched;
  }

  private isObjectDecl(
    record: Record<string, unknown>
  ): record is Record<string, unknown> & HoloObjectDecl {
    return (
      (record.type === 'Object' || record.type === 'ObjectDecl') &&
      typeof record.name === 'string' &&
      Array.isArray(record.traits) &&
      Array.isArray(record.properties)
    );
  }

  private nodeHasAnyEndpointTrait(node: HoloObjectDecl): boolean {
    return node.traits.some((trait) =>
      ENDPOINT_TRAIT_NAMES.includes(this.cleanTraitName(String(trait.name)))
    );
  }

  // ── Path building ──────────────────────────────────────────────────────────

  private buildPaths(nodes: HoloObjectDecl[]): Record<string, OpenAPIPathItem> {
    const paths: Record<string, OpenAPIPathItem> = {};
    const operationIdCounts: Record<string, number> = {};

    for (const node of nodes) {
      const endpointTrait = this.getFirstEndpointTrait(node);
      if (!endpointTrait) continue;

      const rawPath = this.extractEndpointPath(node, endpointTrait);
      const method = this.extractEndpointMethod(node, endpointTrait);
      const operationId = this.deriveOperationId(method, rawPath, operationIdCounts);
      const operation = this.buildOperation(node, operationId);

      if (!paths[rawPath]) paths[rawPath] = {};
      paths[rawPath][method] = operation;
    }

    return paths;
  }

  private buildFallbackPaths(): Record<string, OpenAPIPathItem> {
    return {
      '/health': {
        get: {
          summary: 'Health check',
          description: 'Returns service health status.',
          operationId: 'getHealth',
          responses: {
            '200': {
              description: 'Service is healthy',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      status: { type: 'string' },
                    },
                  },
                },
              },
            },
          },
        },
      },
    };
  }

  private buildOperation(node: HoloObjectDecl, operationId: string): OpenAPIOperation {
    const operation: OpenAPIOperation = {
      operationId,
      responses: {},
    };

    // @description → summary / description
    const descriptionTrait = this.getTrait(node, 'description');
    if (descriptionTrait) {
      const summary = this.extractStringFromTrait(descriptionTrait, ['summary', 'text', 'value']);
      const description = this.extractStringFromTrait(descriptionTrait, ['description', 'detail']);
      if (summary) operation.summary = summary;
      if (description) operation.description = description;
    }
    if (!operation.summary) {
      operation.summary = node.name;
    }

    // @param traits → parameters
    const paramTraits = this.getAllTraits(node, 'param');
    if (paramTraits.length > 0) {
      operation.parameters = paramTraits.map((trait) => this.buildParameter(trait));
    }

    // @auth trait → security
    const authTrait = this.getTrait(node, 'auth');
    if (authTrait) {
      const schemeName = this.buildSecurityScheme(authTrait);
      operation.security = [{ [schemeName]: [] }];
    }

    // @returns trait → 200 response
    const returnsTrait = this.getTrait(node, 'returns');
    if (returnsTrait) {
      operation.responses['200'] = this.buildResponse200(node, returnsTrait);
    } else {
      operation.responses['200'] = {
        description: 'OK',
        content: { 'application/json': {} },
      };
    }

    // Always include a generic error response
    operation.responses['default'] = {
      description: 'Unexpected error',
      content: {
        'application/json': {
          schema: { type: 'object' },
        },
      },
    };

    // Tag with node name for grouping in UI tools
    operation.tags = [node.name];

    return operation;
  }

  // ── Parameter building ─────────────────────────────────────────────────────

  private buildParameter(trait: HoloObjectTrait): OpenAPIParameter {
    const config = trait.config ?? trait.params ?? {};
    const name = this.valueToString(config['name'], 'param');
    const paramIn = this.coerceParamIn(this.valueToString(config['in'], 'query'));
    const required = config['required'] === true || paramIn === 'path';
    const description = this.valueToString(config['description'], undefined);
    const type = this.valueToString(config['type'], 'string');

    const param: OpenAPIParameter = {
      name,
      in: paramIn,
      required,
      schema: { type },
    };
    if (description) param.description = description;
    return param;
  }

  private coerceParamIn(raw: string): OpenAPIParameter['in'] {
    const lower = raw.toLowerCase();
    if (lower === 'path' || lower === 'header' || lower === 'cookie') {
      return lower as OpenAPIParameter['in'];
    }
    return 'query';
  }

  // ── Response / schema building ─────────────────────────────────────────────

  private buildResponse200(node: HoloObjectDecl, returnsTrait: HoloObjectTrait): OpenAPIResponse {
    const config = returnsTrait.config ?? returnsTrait.params ?? {};
    const typeName = this.valueToString(config['type'] ?? config['schema'] ?? config['value'], '');
    const description = this.valueToString(config['description'], 'Success');

    if (!typeName) {
      return {
        description,
        content: { 'application/json': {} },
      };
    }

    // Register schema for the returned type
    const schemaRef = this.registerSchema(typeName, config);

    return {
      description,
      content: {
        'application/json': {
          schema: { $ref: `#/components/schemas/${schemaRef}` },
        },
      },
    };
  }

  private registerSchema(typeName: string, config: Record<string, HoloValue>): string {
    const safeName = this.toSchemaName(typeName);
    if (!this.schemas[safeName]) {
      const schema: OpenAPISchema = { type: 'object' };
      // If config contains a 'properties' key, attempt to extract it
      const propsRaw = config['properties'];
      if (
        propsRaw &&
        typeof propsRaw === 'object' &&
        !Array.isArray(propsRaw) &&
        !('__bind' in propsRaw)
      ) {
        schema.properties = {};
        for (const [k, v] of Object.entries(propsRaw)) {
          schema.properties[k] = { type: typeof v === 'string' ? v : 'string' };
        }
      }
      this.schemas[safeName] = schema;
    }
    return safeName;
  }

  private toSchemaName(raw: string): string {
    // PascalCase sanitized schema name
    return raw.replace(/[^A-Za-z0-9_]/g, '_').replace(/^[^A-Za-z_]/, '_') || 'Schema';
  }

  // ── Security scheme building ───────────────────────────────────────────────

  private buildSecurityScheme(authTrait: HoloObjectTrait): string {
    const config = authTrait.config ?? authTrait.params ?? {};
    const authType = this.valueToString(config['type'] ?? config['scheme'], 'bearer').toLowerCase();

    if (authType === 'apikey' || authType === 'api_key') {
      const schemeName = 'ApiKeyAuth';
      if (!this.securitySchemes[schemeName]) {
        this.securitySchemes[schemeName] = {
          type: 'apiKey',
          in: this.valueToString(config['in'], 'header'),
          name: this.valueToString(config['name'], 'X-API-Key'),
        };
      }
      return schemeName;
    }

    if (authType === 'oauth2') {
      const schemeName = 'OAuth2';
      if (!this.securitySchemes[schemeName]) {
        this.securitySchemes[schemeName] = {
          type: 'oauth2',
          flows: {
            clientCredentials: {
              tokenUrl: this.valueToString(config['tokenUrl'], '/oauth/token'),
              scopes: {},
            },
          },
        };
      }
      return schemeName;
    }

    // Default: BearerAuth
    const schemeName = 'BearerAuth';
    if (!this.securitySchemes[schemeName]) {
      this.securitySchemes[schemeName] = {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: this.valueToString(config['format'] ?? config['bearerFormat'], 'JWT'),
      };
    }
    return schemeName;
  }

  // ── Trait helpers ──────────────────────────────────────────────────────────

  private cleanTraitName(name: string): string {
    return name.startsWith('@') ? name.slice(1) : name;
  }

  private getTrait(node: HoloObjectDecl, traitName: string): HoloObjectTrait | undefined {
    const clean = this.cleanTraitName(traitName);
    return node.traits.find((t) => this.cleanTraitName(String(t.name)) === clean);
  }

  private getAllTraits(node: HoloObjectDecl, traitName: string): HoloObjectTrait[] {
    const clean = this.cleanTraitName(traitName);
    return node.traits.filter((t) => this.cleanTraitName(String(t.name)) === clean);
  }

  private getFirstEndpointTrait(node: HoloObjectDecl): HoloObjectTrait | undefined {
    for (const name of ENDPOINT_TRAIT_NAMES) {
      const trait = this.getTrait(node, name);
      if (trait) return trait;
    }
    return undefined;
  }

  private extractStringFromTrait(
    trait: HoloObjectTrait,
    keys: readonly string[]
  ): string | undefined {
    const config = trait.config ?? trait.params ?? {};
    for (const key of keys) {
      if (config[key] !== undefined) return this.valueToString(config[key], '');
    }
    // Also try direct trait value if present
    if ('value' in trait && trait.value !== undefined) {
      return this.valueToString(trait.value as HoloValue, '');
    }
    return undefined;
  }

  // ── Endpoint path / method extraction ─────────────────────────────────────

  private extractEndpointPath(node: HoloObjectDecl, trait: HoloObjectTrait): string {
    const config = trait.config ?? trait.params ?? {};

    // Try config keys in priority order
    for (const key of ['path', 'url', 'route']) {
      const val = this.valueToString(config[key], '');
      if (val) return this.normalizePath(val);
    }

    // Try trait value directly (e.g. @endpoint "/users")
    if ('value' in trait && typeof (trait as Record<string, unknown>)['value'] === 'string') {
      const val = (trait as Record<string, unknown>)['value'] as string;
      if (val) return this.normalizePath(val);
    }

    // Fall back to node name as path segment
    return '/' + node.name.toLowerCase().replace(/[^a-z0-9_-]/g, '-');
  }

  private extractEndpointMethod(node: HoloObjectDecl, trait: HoloObjectTrait): HttpMethod {
    const config = trait.config ?? trait.params ?? {};

    for (const key of ['method', 'verb', 'http_method']) {
      const val = this.valueToString(config[key], '').toLowerCase();
      if (VALID_METHODS.has(val as HttpMethod)) return val as HttpMethod;
    }

    // Heuristic from node name prefix
    const lower = node.name.toLowerCase();
    if (lower.startsWith('create') || lower.startsWith('add') || lower.startsWith('post')) {
      return 'post';
    }
    if (lower.startsWith('update') || lower.startsWith('edit') || lower.startsWith('put')) {
      return 'put';
    }
    if (lower.startsWith('patch')) return 'patch';
    if (lower.startsWith('delete') || lower.startsWith('remove')) return 'delete';

    return 'get';
  }

  private normalizePath(raw: string): string {
    const trimmed = raw.trim();
    return trimmed.startsWith('/') ? trimmed : '/' + trimmed;
  }

  // ── Operation ID deduplication ─────────────────────────────────────────────

  private deriveOperationId(
    method: HttpMethod,
    path: string,
    counts: Record<string, number>
  ): string {
    // e.g. GET /users/{id} → getUsersById
    const segments = path
      .split('/')
      .filter(Boolean)
      .map((seg) =>
        seg.startsWith('{')
          ? 'By' + seg.replace(/[{}]/g, '').replace(/^./, (c) => c.toUpperCase())
          : seg.replace(/[^A-Za-z0-9]/g, '').replace(/^./, (c) => c.toUpperCase())
      );
    const base = method + (segments.join('') || 'Root');
    counts[base] = (counts[base] ?? 0) + 1;
    return counts[base] > 1 ? `${base}${counts[base]}` : base;
  }

  // ── Primitive value helpers ────────────────────────────────────────────────

  private valueToString(value: HoloValue | undefined, fallback: string): string;
  private valueToString(value: HoloValue | undefined, fallback: undefined): string | undefined;
  private valueToString(
    value: HoloValue | undefined,
    fallback: string | undefined
  ): string | undefined {
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    return fallback;
  }

  // ── Minimal YAML serialiser (avoids a yaml dependency) ────────────────────

  private specToYaml(spec: OpenAPISpec): string {
    // Emit JSON-compatible YAML by stringifying via JSON then converting.
    // For a proper YAML target with multi-line strings or anchors, consumers
    // should use format: 'json' and pipe through a YAML library externally.
    // This implementation covers the common round-trip case without adding deps.
    this.warnings.push(
      'YAML output is produced by naive JSON-to-YAML conversion. ' +
        'For production use, convert the JSON output with a dedicated YAML library.'
    );
    return this.jsonToYaml(spec as unknown as Record<string, unknown>, 0);
  }

  private jsonToYaml(value: unknown, indent: number): string {
    const pad = '  '.repeat(indent);
    if (value === null || value === undefined) return 'null';
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    if (typeof value === 'number') return String(value);
    if (typeof value === 'string') return this.yamlString(value);
    if (Array.isArray(value)) {
      if (value.length === 0) return '[]';
      return value.map((item) => `${pad}- ${this.jsonToYaml(item, indent + 1)}`).join('\n');
    }
    if (typeof value === 'object') {
      const obj = value as Record<string, unknown>;
      const keys = Object.keys(obj);
      if (keys.length === 0) return '{}';
      return keys
        .map((key) => {
          const v = obj[key];
          const yamlKey = /[: #{}[\],&*?|<>=!%@`]/.test(key) ? `"${key}"` : key;
          if (
            v !== null &&
            typeof v === 'object' &&
            !Array.isArray(v) &&
            Object.keys(v as Record<string, unknown>).length > 0
          ) {
            return `${pad}${yamlKey}:\n${this.jsonToYaml(v, indent + 1)}`;
          }
          if (Array.isArray(v) && v.length > 0) {
            return `${pad}${yamlKey}:\n${this.jsonToYaml(v, indent + 1)}`;
          }
          return `${pad}${yamlKey}: ${this.jsonToYaml(v, indent + 1)}`;
        })
        .join('\n');
    }
    return String(value);
  }

  private yamlString(value: string): string {
    if (/[:\n#{}[\],"'`*&!>|%@\\]/.test(value) || value.trim() !== value) {
      return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`;
    }
    return value;
  }

  // ── Result builder ─────────────────────────────────────────────────────────

  private buildResult(spec: string, endpointCount: number): OpenAPICompilationResult {
    return {
      success: this.errors.length === 0,
      format: this.options.format,
      spec,
      endpointCount,
      schemaCount: Object.keys(this.schemas).length,
      warnings: this.warnings,
      errors: this.errors,
    };
  }
}

export default OpenAPICompiler;
