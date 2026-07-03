/**
 * HoloScript SDK Compiler.
 *
 * Emits a typed TypeScript client from a .holo service-contract AST. The
 * contract-shaped surface, methods, request/response types, and error taxonomy
 * are generated; the only handwritten tier is a fixed fetch/auth/retry runtime
 * shim that generated clients call.
 */

import { CompilerBase } from './CompilerBase';
import { ANSCapabilityPath, type ANSCapabilityPathValue } from './identity';
import type { HoloComposition, HoloDomainBlock, HoloValue } from '../parser/HoloCompositionTypes';
import { DialectRegistry } from './DialectRegistry';

export type SDKCompilerLanguage = 'typescript';

export interface SDKCompilerOptions {
  language?: SDKCompilerLanguage;
  clientClassName?: string;
  packageName?: string;
  outputDir?: string;
  clientFileName?: string;
  runtimeFileName?: string;
  includePackageJson?: boolean;
  includeTsConfig?: boolean;
  includeReadme?: boolean;
}

interface ContractField {
  name: string;
  optional: boolean;
  tsType: string;
}

interface ContractSchema {
  name: string;
  fields: ContractField[];
}

interface ContractParam {
  name: string;
  optional: boolean;
  tsType: string;
  location: 'path' | 'query';
}

interface ContractEndpoint {
  name: string;
  method: string;
  path: string;
  summary?: string;
  params: ContractParam[];
  requestBodyType?: string;
  responseType: string;
  errorResponses: number[];
}

interface ContractAuth {
  name: string;
  scheme: string;
  headers: Record<string, string>;
  signature?: {
    algorithm?: string;
    timestampHeader?: string;
    signatureHeader?: string;
    payloadTemplate?: string;
  };
}

interface ContractService {
  name: string;
  version: string;
  baseUrl: string;
  auth?: string;
  responseEnvelope?: string;
  rateLimit?: string;
}

interface ServiceContractIR {
  compositionName: string;
  schemas: ContractSchema[];
  endpoints: ContractEndpoint[];
  auth?: ContractAuth;
  service: ContractService;
}

interface SDKCompilerResolvedOptions {
  language: SDKCompilerLanguage;
  clientClassName: string;
  packageName: string;
  outputDir: string;
  clientFileName: string;
  runtimeFileName: string;
  includePackageJson: boolean;
  includeTsConfig: boolean;
  includeReadme: boolean;
}

export class SDKCompiler extends CompilerBase {
  protected readonly compilerName = 'SDKCompiler';

  private readonly options: SDKCompilerResolvedOptions;

  constructor(options: SDKCompilerOptions = {}) {
    super();
    const clientClassName = options.clientClassName ?? 'GeneratedSDKClient';
    this.options = {
      language: options.language ?? 'typescript',
      clientClassName,
      packageName: options.packageName ?? '@holoscript/generated-sdk',
      outputDir: this.trimSlashes(options.outputDir ?? 'src'),
      clientFileName: options.clientFileName ?? `${clientClassName}.ts`,
      runtimeFileName: options.runtimeFileName ?? 'sdk-runtime.ts',
      includePackageJson: options.includePackageJson ?? true,
      includeTsConfig: options.includeTsConfig ?? true,
      includeReadme: options.includeReadme ?? true,
    };
  }

  protected override getRequiredCapability(): ANSCapabilityPathValue {
    return ANSCapabilityPath.SDK;
  }

  compile(
    composition: HoloComposition,
    agentToken: string,
    outputPath?: string
  ): Record<string, string> {
    this.validateCompilerAccess(agentToken, outputPath);
    if (this.options.language !== 'typescript') {
      throw new Error(
        `SDKCompiler only supports TypeScript in SDK 2/7, got ${this.options.language}`
      );
    }

    const contract = this.extractContract(composition);
    const files: Record<string, string> = {};
    files[this.joinOutputPath(this.options.clientFileName)] = this.emitClient(contract);
    files[this.joinOutputPath(this.options.runtimeFileName)] = this.emitRuntime(contract);
    files['sdk-compiler-receipt.json'] = this.emitReceipt(contract);

    if (this.options.includePackageJson) files['package.json'] = this.emitPackageJson(contract);
    if (this.options.includeTsConfig) files['tsconfig.json'] = this.emitTsConfig();
    if (this.options.includeReadme) files['README.md'] = this.emitReadme(contract);

    return files;
  }

  protected override defaultOutputFileName(): string {
    return this.joinOutputPath(this.options.clientFileName);
  }

  private extractContract(composition: HoloComposition): ServiceContractIR {
    const blocks = composition.domainBlocks ?? [];
    const schemas = blocks
      .filter((block) => block.domain === 'contract' && block.keyword === 'schema')
      .map((block) => this.extractSchema(block));
    const endpoints = blocks
      .filter((block) => block.domain === 'service' && block.keyword === 'endpoint')
      .map((block) => this.extractEndpoint(block));
    if (endpoints.length === 0) {
      throw new Error('SDKCompiler requires at least one service endpoint block');
    }

    const serviceBlock = blocks.find(
      (block) => block.domain === 'service' && block.keyword === 'service'
    );
    const authBlock = blocks.find((block) => block.keyword === 'auth');

    return {
      compositionName: composition.name,
      schemas,
      endpoints,
      auth: authBlock ? this.extractAuth(authBlock) : undefined,
      service: this.extractService(serviceBlock, composition.name),
    };
  }

  private extractSchema(block: HoloDomainBlock): ContractSchema {
    return {
      name: this.toPascalIdentifier(block.name, 'Schema'),
      fields: Object.entries(block.properties).map(([rawName, rawType]) => {
        const { name, optional } = this.splitOptionalName(rawName);
        return {
          name,
          optional,
          tsType: this.tsTypeFromHoloValue(rawType),
        };
      }),
    };
  }

  private extractEndpoint(block: HoloDomainBlock): ContractEndpoint {
    const props = block.properties;
    const method = this.readString(props, 'method')?.toUpperCase() ?? 'GET';
    const path = this.readString(props, 'path') ?? `/${this.toKebab(block.name)}`;
    const pathParamNames = new Set(this.extractPathParamNames(path));
    const params = this.extractParams(props['params'], pathParamNames);
    const responseType = this.tsTypeFromHoloValue(props['response_200'] ?? 'void');
    const requestBodyType =
      props['request_body'] === undefined
        ? undefined
        : this.tsTypeFromHoloValue(props['request_body']);

    return {
      name: this.toCamelIdentifier(block.name, 'endpoint'),
      method,
      path,
      summary: this.readString(props, 'summary'),
      params,
      requestBodyType,
      responseType,
      errorResponses: this.extractErrorResponses(props['error_responses']),
    };
  }

  private extractAuth(block: HoloDomainBlock): ContractAuth {
    const headersValue = block.properties['headers'];
    const signatureValue = block.properties['signature'];
    const headers: Record<string, string> = {};
    if (this.isRecord(headersValue)) {
      for (const [key, value] of Object.entries(headersValue)) {
        if (typeof value === 'string') headers[key] = value;
      }
    }

    let signature: ContractAuth['signature'];
    if (this.isRecord(signatureValue)) {
      signature = {
        algorithm: this.stringFromRecord(signatureValue, 'algorithm'),
        timestampHeader: this.stringFromRecord(signatureValue, 'timestamp_header'),
        signatureHeader: this.stringFromRecord(signatureValue, 'signature_header'),
        payloadTemplate: this.stringFromRecord(signatureValue, 'payload_template'),
      };
    }

    return {
      name: this.toPascalIdentifier(block.name, 'Auth'),
      scheme: this.readString(block.properties, 'scheme') ?? 'api_key',
      headers,
      signature,
    };
  }

  private extractService(
    block: HoloDomainBlock | undefined,
    compositionName: string
  ): ContractService {
    if (!block) {
      return {
        name: this.toPascalIdentifier(compositionName, 'Service'),
        version: '1.0.0',
        baseUrl: '/api',
      };
    }

    return {
      name: this.toPascalIdentifier(block.name, 'Service'),
      version: this.readString(block.properties, 'version') ?? '1.0.0',
      baseUrl: this.readString(block.properties, 'base_url') ?? '/api',
      auth: this.readString(block.properties, 'auth'),
      responseEnvelope: this.readString(block.properties, 'response_envelope'),
      rateLimit: this.readString(block.properties, 'rate_limit'),
    };
  }

  private extractParams(
    value: HoloValue | undefined,
    pathParamNames: ReadonlySet<string>
  ): ContractParam[] {
    if (!this.isRecord(value)) return [];
    return Object.entries(value).map(([rawName, rawType]) => {
      const { name, optional } = this.splitOptionalName(rawName);
      return {
        name,
        optional,
        tsType: this.tsTypeFromHoloValue(rawType),
        location: pathParamNames.has(name) ? 'path' : 'query',
      };
    });
  }

  private extractErrorResponses(value: HoloValue | undefined): number[] {
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is number => typeof item === 'number');
  }

  private emitClient(contract: ServiceContractIR): string {
    const runtimeModule = this.relativeRuntimeImport();
    const lines: string[] = [
      '/**',
      ' * @generated by HoloScript SDKCompiler - DO NOT EDIT.',
      ` * Source composition: ${this.escapeStringValue(contract.compositionName, 'TypeScript')}.`,
      ' */',
      '',
      `import { SDKRuntime, SDKAuthenticationError, SDKError, SDKRateLimitError } from '${runtimeModule}';`,
      `import type { SDKRequestOptions, SDKRuntimeConfig, SDKRateLimitSnapshot } from '${runtimeModule}';`,
      '',
      `export { SDKRuntime, SDKAuthenticationError, SDKError, SDKRateLimitError } from '${runtimeModule}';`,
      `export type { SDKRequestOptions, SDKRuntimeConfig, SDKRateLimitSnapshot } from '${runtimeModule}';`,
      '',
    ];

    for (const schema of contract.schemas) {
      lines.push(...this.emitSchema(schema), '');
    }

    for (const endpoint of contract.endpoints) {
      if (endpoint.params.length > 0) {
        lines.push(...this.emitParamsInterface(endpoint), '');
      }
    }

    lines.push(...this.emitClientConfig(contract), '');
    lines.push(...this.emitClientClass(contract), '');
    lines.push(...this.emitFactory());
    return lines.join('\n');
  }

  private emitSchema(schema: ContractSchema): string[] {
    const lines = [`export interface ${schema.name} {`];
    for (const field of schema.fields) {
      lines.push(`  ${this.emitPropertyName(field.name, field.optional)}: ${field.tsType};`);
    }
    lines.push('}');
    return lines;
  }

  private emitParamsInterface(endpoint: ContractEndpoint): string[] {
    const lines = [`export interface ${this.paramsInterfaceName(endpoint)} {`];
    for (const param of endpoint.params) {
      lines.push(`  ${this.emitPropertyName(param.name, param.optional)}: ${param.tsType};`);
    }
    lines.push('}');
    return lines;
  }

  private emitClientConfig(contract: ServiceContractIR): string[] {
    return [
      `export interface ${this.options.clientClassName}Config extends SDKRuntimeConfig {`,
      `  baseUrl?: string;`,
      `}`,
      '',
      `const DEFAULT_BASE_URL = '${this.escapeStringValue(contract.service.baseUrl, 'TypeScript')}';`,
    ];
  }

  private emitClientClass(contract: ServiceContractIR): string[] {
    const lines: string[] = [
      `export class ${this.options.clientClassName} {`,
      '  private readonly runtime: SDKRuntime;',
      '',
      `  constructor(config: ${this.options.clientClassName}Config = {}) {`,
      '    this.runtime = new SDKRuntime({',
      '      ...config,',
      '      baseUrl: config.baseUrl ?? DEFAULT_BASE_URL,',
      '    });',
      '  }',
      '',
      '  getRateLimitStatus(): SDKRateLimitSnapshot | null {',
      '    return this.runtime.getRateLimitStatus();',
      '  }',
      '',
    ];

    contract.endpoints.forEach((endpoint, index) => {
      lines.push(...this.emitEndpointMethod(endpoint));
      if (index < contract.endpoints.length - 1) lines.push('');
    });

    lines.push('}');
    return lines;
  }

  private emitEndpointMethod(endpoint: ContractEndpoint): string[] {
    const paramsName = this.paramsInterfaceName(endpoint);
    const args = this.methodArgs(endpoint);
    const lines = [
      `  /** ${this.escapeStringValue(endpoint.summary ?? endpoint.name, 'TypeScript')} */`,
      `  async ${endpoint.name}(${args}): Promise<${endpoint.responseType}> {`,
    ];

    const paramsExpression = this.paramsExpression(endpoint);
    if (endpoint.params.some((param) => param.location === 'path')) {
      lines.push(
        `    const path = SDKRuntime.interpolatePath('${this.escapeStringValue(endpoint.path, 'TypeScript')}', ${paramsExpression});`
      );
    } else {
      lines.push(`    const path = '${this.escapeStringValue(endpoint.path, 'TypeScript')}';`);
    }

    const queryParamNames = endpoint.params
      .filter((param) => param.location === 'query')
      .map((param) => param.name);
    if (queryParamNames.length > 0) {
      lines.push(
        `    const query = SDKRuntime.pickQuery(${paramsExpression}, ${JSON.stringify(queryParamNames)});`
      );
    }

    lines.push(
      `    return this.runtime.request<${endpoint.responseType}>('${endpoint.method}', path, ${this.requestOptionsExpression(endpoint)});`
    );
    lines.push('  }');

    if (endpoint.params.length === 0 && args.includes(paramsName)) {
      throw new Error(`Unexpected parameter signature for endpoint ${endpoint.name}`);
    }
    return lines;
  }

  private methodArgs(endpoint: ContractEndpoint): string {
    const parts: string[] = [];
    if (endpoint.params.length > 0) {
      const optional = this.allParamsOptional(endpoint) ? '?' : '';
      parts.push(`params${optional}: ${this.paramsInterfaceName(endpoint)}`);
    }
    if (endpoint.requestBodyType) parts.push(`body: ${endpoint.requestBodyType}`);
    parts.push('options?: SDKRequestOptions');
    return parts.join(', ');
  }

  private paramsExpression(endpoint: ContractEndpoint): string {
    return this.allParamsOptional(endpoint) ? 'params ?? {}' : 'params';
  }

  private allParamsOptional(endpoint: ContractEndpoint): boolean {
    return endpoint.params.length > 0 && endpoint.params.every((param) => param.optional);
  }

  private requestOptionsExpression(endpoint: ContractEndpoint): string {
    const entries: string[] = ['...options'];
    if (endpoint.requestBodyType) entries.push('body');
    if (endpoint.params.some((param) => param.location === 'query')) entries.push('query');
    return `{ ${entries.join(', ')} }`;
  }

  private emitFactory(): string[] {
    const fnName = `create${this.options.clientClassName}`;
    return [
      `export function ${fnName}(config: ${this.options.clientClassName}Config = {}): ${this.options.clientClassName} {`,
      `  return new ${this.options.clientClassName}(config);`,
      `}`,
    ];
  }

  private emitRuntime(contract: ServiceContractIR): string {
    const authHeaders = JSON.stringify(
      {
        partnerId: contract.auth?.headers['partner_id'] ?? 'X-Partner-ID',
        apiKey: contract.auth?.headers['api_key'] ?? 'X-API-Key',
        timestamp: contract.auth?.signature?.timestampHeader ?? 'X-Timestamp',
        signature: contract.auth?.signature?.signatureHeader ?? 'X-Signature',
      },
      null,
      2
    );
    const payloadTemplate =
      contract.auth?.signature?.payloadTemplate ?? '{method}:{endpoint}:{timestamp}:{body}';

    return [
      '/**',
      ' * @generated by HoloScript SDKCompiler - fixed runtime shim.',
      ' * Contract-shaped client code is generated separately.',
      ' */',
      '',
      `const SDK_AUTH_HEADERS = ${authHeaders} as const;`,
      `const SDK_SIGNATURE_PAYLOAD_TEMPLATE = '${this.escapeStringValue(payloadTemplate, 'TypeScript')}';`,
      '',
      'export type SDKQueryPrimitive = string | number | boolean;',
      'export type SDKQueryValue = SDKQueryPrimitive | null | undefined | readonly SDKQueryPrimitive[];',
      '',
      'export interface SDKCredentials {',
      '  partnerId?: string;',
      '  apiKey?: string;',
      '  holoKey?: string;',
      '  secretKey?: string;',
      '}',
      '',
      'export interface SDKRuntimeConfig {',
      '  baseUrl?: string;',
      '  credentials?: SDKCredentials;',
      '  headers?: Record<string, string>;',
      '  timeoutMs?: number;',
      '  retries?: number;',
      '  retryDelayMs?: number;',
      '  fetch?: SDKFetch;',
      '}',
      '',
      'export interface SDKRequestOptions {',
      '  headers?: Record<string, string>;',
      '  query?: Record<string, unknown>;',
      '  body?: unknown;',
      '  signal?: AbortSignal;',
      '  timeoutMs?: number;',
      '  retries?: number;',
      '}',
      '',
      'export interface SDKRateLimitSnapshot {',
      '  remaining: number;',
      '  limit: number;',
      '  resetAt: string;',
      '}',
      '',
      'export interface SDKErrorPayload {',
      '  code?: string;',
      '  message?: string;',
      '  details?: unknown;',
      '}',
      '',
      'export type SDKFetch = (input: string | URL, init?: RequestInit) => Promise<Response>;',
      '',
      'export class SDKError extends Error {',
      '  constructor(',
      '    message: string,',
      '    public readonly status: number,',
      "    public readonly code = 'sdk_error',",
      '    public readonly details?: unknown',
      '  ) {',
      '    super(message);',
      "    this.name = 'SDKError';",
      '  }',
      '}',
      '',
      'export class SDKAuthenticationError extends SDKError {',
      '  constructor(message: string, status: number, details?: unknown) {',
      "    super(message, status, 'authentication_error', details);",
      "    this.name = 'SDKAuthenticationError';",
      '  }',
      '}',
      '',
      'export class SDKRateLimitError extends SDKError {',
      '  constructor(',
      '    message: string,',
      '    status: number,',
      '    public readonly retryAfterSeconds: number,',
      '    public readonly rateLimit?: SDKRateLimitSnapshot',
      '  ) {',
      "    super(message, status, 'rate_limit_error', rateLimit);",
      "    this.name = 'SDKRateLimitError';",
      '  }',
      '}',
      '',
      'interface SDKEnvelope<T> {',
      '  success?: boolean;',
      '  data?: T;',
      '  error?: SDKErrorPayload;',
      '  rateLimit?: SDKRateLimitSnapshot;',
      '}',
      '',
      'export class SDKRuntime {',
      '  private readonly baseUrl: string;',
      '  private readonly credentials: SDKCredentials;',
      '  private readonly headers: Record<string, string>;',
      '  private readonly timeoutMs: number;',
      '  private readonly retries: number;',
      '  private readonly retryDelayMs: number;',
      '  private readonly fetchImpl: SDKFetch;',
      '  private rateLimit: SDKRateLimitSnapshot | null = null;',
      '',
      '  constructor(config: SDKRuntimeConfig = {}) {',
      "    this.baseUrl = (config.baseUrl ?? '/api').replace(/\\/$/, '');",
      '    this.credentials = config.credentials ?? {};',
      '    this.headers = config.headers ?? {};',
      '    this.timeoutMs = config.timeoutMs ?? 30000;',
      '    this.retries = config.retries ?? 3;',
      '    this.retryDelayMs = config.retryDelayMs ?? 250;',
      '    const fetchImpl = config.fetch ?? globalThis.fetch;',
      "    if (!fetchImpl) throw new Error('SDKRuntime requires a fetch implementation');",
      '    this.fetchImpl = fetchImpl.bind(globalThis) as SDKFetch;',
      '  }',
      '',
      '  getRateLimitStatus(): SDKRateLimitSnapshot | null {',
      '    return this.rateLimit;',
      '  }',
      '',
      '  async request<T>(method: string, path: string, options: SDKRequestOptions = {}): Promise<T> {',
      '    const retries = options.retries ?? this.retries;',
      '    let lastError: Error | null = null;',
      '    for (let attempt = 0; attempt < retries; attempt += 1) {',
      '      try {',
      '        return await this.execute<T>(method, path, options);',
      '      } catch (error) {',
      '        lastError = error instanceof Error ? error : new Error(String(error));',
      '        if (error instanceof SDKAuthenticationError || error instanceof SDKRateLimitError) throw error;',
      '        if (attempt < retries - 1) await this.sleep(this.retryDelayMs * 2 ** attempt);',
      '      }',
      '    }',
      "    throw lastError ?? new SDKError('Request failed', 0);",
      '  }',
      '',
      '  private async execute<T>(',
      '    method: string,',
      '    path: string,',
      '    options: SDKRequestOptions',
      '  ): Promise<T> {',
      '    const url = this.buildUrl(path, options.query);',
      '    const bodyText = options.body === undefined ? undefined : JSON.stringify(options.body);',
      '    const headers = await this.buildHeaders(method, path, bodyText, options.headers);',
      '    const controller = options.signal ? undefined : new AbortController();',
      '    const timeout = controller',
      '      ? setTimeout(() => controller.abort(), options.timeoutMs ?? this.timeoutMs)',
      '      : undefined;',
      '    try {',
      '      const response = await this.fetchImpl(url, {',
      '        method,',
      '        headers,',
      '        body: bodyText,',
      '        signal: options.signal ?? controller?.signal,',
      '      });',
      '      const parsed = await this.parseJson(response);',
      '      const envelope = this.isRecord(parsed) ? (parsed as SDKEnvelope<T>) : undefined;',
      '      const rateLimit = this.extractRateLimit(response, envelope);',
      '      if (rateLimit) this.rateLimit = rateLimit;',
      '      if (response.status === 429) {',
      "        const retryAfter = Number(response.headers.get('Retry-After') ?? '60');",
      "        throw new SDKRateLimitError(envelope?.error?.message ?? 'Rate limit exceeded', response.status, retryAfter, rateLimit);",
      '      }',
      '      if (response.status === 401 || response.status === 403) {',
      "        throw new SDKAuthenticationError(envelope?.error?.message ?? 'Authentication failed', response.status, envelope?.error?.details);",
      '      }',
      '      if (!response.ok || envelope?.success === false) {',
      '        throw new SDKError(envelope?.error?.message ?? `Request failed with status ${response.status}`, response.status, envelope?.error?.code, envelope?.error?.details);',
      '      }',
      "      if (envelope && Object.prototype.hasOwnProperty.call(envelope, 'data')) return envelope.data as T;",
      '      return parsed as T;',
      '    } catch (error) {',
      "      if (error instanceof Error && error.name === 'AbortError') {",
      "        throw new SDKError(`Request timed out after ${options.timeoutMs ?? this.timeoutMs}ms`, 0, 'timeout');",
      '      }',
      '      throw error;',
      '    } finally {',
      '      if (timeout) clearTimeout(timeout);',
      '    }',
      '  }',
      '',
      '  private buildUrl(path: string, query: Record<string, unknown> | undefined): string {',
      "    const url = new URL(path.startsWith('http') ? path : `${this.baseUrl}${path}`);",
      '    for (const [key, value] of Object.entries(query ?? {})) {',
      '      if (value === undefined || value === null) continue;',
      '      if (Array.isArray(value)) {',
      '        url.searchParams.set(key, value.join(","));',
      '      } else {',
      '        url.searchParams.set(key, String(value));',
      '      }',
      '    }',
      '    return url.toString();',
      '  }',
      '',
      '  private async buildHeaders(',
      '    method: string,',
      '    path: string,',
      '    bodyText: string | undefined,',
      '    headers: Record<string, string> | undefined',
      '  ): Promise<Record<string, string>> {',
      '    const merged: Record<string, string> = {',
      "      Accept: 'application/json',",
      "      'Content-Type': 'application/json',",
      '      ...this.headers,',
      '      ...headers,',
      '    };',
      '    const apiKey = this.credentials.apiKey ?? this.credentials.holoKey;',
      '    if (this.credentials.partnerId) merged[SDK_AUTH_HEADERS.partnerId] = this.credentials.partnerId;',
      '    if (apiKey) merged[SDK_AUTH_HEADERS.apiKey] = apiKey;',
      '    if (this.credentials.secretKey) {',
      '      const timestamp = Date.now().toString();',
      '      merged[SDK_AUTH_HEADERS.timestamp] = timestamp;',
      '      const payload = this.signaturePayload(method, path, timestamp, bodyText);',
      '      merged[SDK_AUTH_HEADERS.signature] = await this.sign(payload, apiKey);',
      '    }',
      '    return merged;',
      '  }',
      '',
      '  private signaturePayload(',
      '    method: string,',
      '    path: string,',
      '    timestamp: string,',
      '    bodyText: string | undefined',
      '  ): string {',
      '    return SDK_SIGNATURE_PAYLOAD_TEMPLATE',
      "      .replaceAll('{method}', method)",
      "      .replaceAll('{endpoint}', path)",
      "      .replaceAll('{path}', path)",
      "      .replaceAll('{timestamp}', timestamp)",
      "      .replaceAll('{body}', bodyText ?? '');",
      '  }',
      '',
      '  private async sign(payload: string, apiKey: string | undefined): Promise<string> {',
      "    const secret = this.credentials.secretKey ?? apiKey ?? '';",
      "    if (!globalThis.crypto?.subtle) throw new Error('SDKRuntime HMAC signing requires Web Crypto');",
      '    const encoder = new TextEncoder();',
      '    const key = await globalThis.crypto.subtle.importKey(',
      "      'raw',",
      '      encoder.encode(secret),',
      "      { name: 'HMAC', hash: 'SHA-256' },",
      '      false,',
      "      ['sign']",
      '    );',
      "    const signature = await globalThis.crypto.subtle.sign('HMAC', key, encoder.encode(payload));",
      '    return Array.from(new Uint8Array(signature))',
      "      .map((byte) => byte.toString(16).padStart(2, '0'))",
      "      .join('');",
      '  }',
      '',
      '  private async parseJson(response: Response): Promise<unknown> {',
      '    const text = await response.text();',
      '    if (!text) return undefined;',
      '    try {',
      '      return JSON.parse(text) as unknown;',
      '    } catch {',
      '      return text;',
      '    }',
      '  }',
      '',
      '  private extractRateLimit<T>(',
      '    response: Response,',
      '    envelope: SDKEnvelope<T> | undefined',
      '  ): SDKRateLimitSnapshot | undefined {',
      '    if (envelope?.rateLimit) return envelope.rateLimit;',
      "    const remaining = response.headers.get('X-RateLimit-Remaining');",
      "    const reset = response.headers.get('X-RateLimit-Reset');",
      '    if (!remaining || !reset) return undefined;',
      "    const limit = response.headers.get('X-RateLimit-Limit') ?? remaining;",
      '    return {',
      '      remaining: Number(remaining),',
      '      limit: Number(limit),',
      '      resetAt: new Date(Number(reset) * 1000).toISOString(),',
      '    };',
      '  }',
      '',
      '  private isRecord(value: unknown): value is Record<string, unknown> {',
      "    return typeof value === 'object' && value !== null && !Array.isArray(value);",
      '  }',
      '',
      '  private sleep(ms: number): Promise<void> {',
      '    return new Promise((resolve) => setTimeout(resolve, ms));',
      '  }',
      '',
      '  static interpolatePath(path: string, params: object): string {',
      '    const values = params as Record<string, unknown>;',
      '    return path.replace(/\\{([^}]+)\\}/g, (_match, name: string) => {',
      '      const value = values[name];',
      '      if (value === undefined || value === null) throw new Error(`Missing path param: ${name}`);',
      '      return encodeURIComponent(String(value));',
      '    });',
      '  }',
      '',
      '  static pickQuery(params: object, names: readonly string[]): Record<string, unknown> {',
      '    const values = params as Record<string, unknown>;',
      '    const query: Record<string, unknown> = {};',
      '    for (const name of names) {',
      '      if (values[name] !== undefined) query[name] = values[name];',
      '    }',
      '    return query;',
      '  }',
      '}',
    ].join('\n');
  }

  private emitPackageJson(contract: ServiceContractIR): string {
    const pkg = {
      name: this.options.packageName,
      version: contract.service.version,
      type: 'module',
      main: `dist/${this.options.clientFileName.replace(/\.ts$/, '.js')}`,
      types: `dist/${this.options.clientFileName.replace(/\.ts$/, '.d.ts')}`,
      scripts: {
        build: 'tsc',
      },
      devDependencies: {
        typescript: '^5.5.0',
      },
    };
    return JSON.stringify(pkg, null, 2);
  }

  private emitTsConfig(): string {
    return JSON.stringify(
      {
        compilerOptions: {
          target: 'ES2022',
          module: 'NodeNext',
          moduleResolution: 'NodeNext',
          outDir: 'dist',
          rootDir: 'src',
          strict: true,
          declaration: true,
          esModuleInterop: true,
          skipLibCheck: true,
        },
        include: ['src/**/*.ts'],
      },
      null,
      2
    );
  }

  private emitReadme(contract: ServiceContractIR): string {
    return [
      `# ${this.options.packageName}`,
      '',
      'Generated by HoloScript SDKCompiler from a .holo service contract.',
      '',
      `- Source composition: ${contract.compositionName}`,
      `- Service: ${contract.service.name}`,
      `- Endpoints: ${contract.endpoints.length}`,
      `- Schemas: ${contract.schemas.length}`,
      '',
      'The generated client owns contract-shaped methods and types. The fixed runtime shim owns fetch, auth, retry, rate-limit, and error behavior.',
      '',
    ].join('\n');
  }

  private emitReceipt(contract: ServiceContractIR): string {
    return JSON.stringify(
      {
        type: 'SDKCompilerReceipt',
        target: 'sdk:typescript',
        sourceComposition: contract.compositionName,
        service: contract.service.name,
        clientClassName: this.options.clientClassName,
        serviceBaseUrl: contract.service.baseUrl,
        schemaCount: contract.schemas.length,
        endpointCount: contract.endpoints.length,
        generatedFiles: [
          this.joinOutputPath(this.options.clientFileName),
          this.joinOutputPath(this.options.runtimeFileName),
        ],
        contractSurfaces: {
          auth: contract.auth?.name,
          responseEnvelope: contract.service.responseEnvelope,
          rateLimit: contract.service.rateLimit,
        },
        integrationSurfaces: {
          credential: 'HoloKey-compatible apiKey/holoKey credential headers',
          routing: 'UmbrellaRoute-compatible baseUrl and endpoint path contract',
          provenance: 'triad-ready sourceComposition/service/generatedFiles receipt',
        },
      },
      null,
      2
    );
  }

  private tsTypeFromHoloValue(value: HoloValue | undefined): string {
    if (typeof value === 'string') return this.tsTypeFromAnnotation(value);
    if (typeof value === 'number') return 'number';
    if (typeof value === 'boolean') return 'boolean';
    if (Array.isArray(value)) return 'unknown[]';
    if (value === null || value === undefined) return 'unknown';
    return 'Record<string, unknown>';
  }

  private tsTypeFromAnnotation(annotation: string): string {
    const trimmed = annotation.trim();
    const arrayMatch = trimmed.match(/^array<(.+)>$/);
    if (arrayMatch) return `${this.tsTypeFromAnnotation(arrayMatch[1].trim())}[]`;
    if (trimmed.endsWith('[]')) return `${this.tsTypeFromAnnotation(trimmed.slice(0, -2))}[]`;
    switch (trimmed) {
      case 'string':
      case 'number':
      case 'boolean':
      case 'void':
        return trimmed;
      case 'any':
      case 'json':
      case 'object':
        return 'unknown';
      default:
        return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(trimmed) ? trimmed : 'unknown';
    }
  }

  private paramsInterfaceName(endpoint: ContractEndpoint): string {
    return `${this.toPascalIdentifier(endpoint.name, 'Endpoint')}Params`;
  }

  private emitPropertyName(name: string, optional: boolean): string {
    const suffix = optional ? '?' : '';
    return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name)
      ? `${name}${suffix}`
      : `${JSON.stringify(name)}${suffix}`;
  }

  private extractPathParamNames(path: string): string[] {
    return Array.from(path.matchAll(/\{([^}]+)\}/g), (match) => match[1]);
  }

  private readString(record: Record<string, HoloValue>, key: string): string | undefined {
    const value = record[key];
    return typeof value === 'string' ? value : undefined;
  }

  private stringFromRecord(record: Record<string, unknown>, key: string): string | undefined {
    const value = record[key];
    return typeof value === 'string' ? value : undefined;
  }

  private isRecord(value: unknown): value is Record<string, HoloValue> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private splitOptionalName(rawName: string): { name: string; optional: boolean } {
    return rawName.endsWith('?')
      ? { name: rawName.slice(0, -1), optional: true }
      : { name: rawName, optional: false };
  }

  private toPascalIdentifier(value: string, fallback: string): string {
    const parts = value.match(/[A-Za-z0-9]+/g) ?? [];
    const joined = parts.map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join('');
    const candidate = joined || fallback;
    return /^[A-Za-z_$]/.test(candidate) ? candidate : `${fallback}${candidate}`;
  }

  private toCamelIdentifier(value: string, fallback: string): string {
    const pascal = this.toPascalIdentifier(value, fallback);
    return pascal.charAt(0).toLowerCase() + pascal.slice(1);
  }

  private toKebab(value: string): string {
    return value
      .replace(/([a-z])([A-Z])/g, '$1-$2')
      .replace(/[^A-Za-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase();
  }

  private trimSlashes(value: string): string {
    return value.replace(/^\/+|\/+$/g, '');
  }

  private joinOutputPath(fileName: string): string {
    const outDir = this.options.outputDir;
    return outDir ? `${outDir}/${fileName}` : fileName;
  }

  private relativeRuntimeImport(): string {
    return `./${this.options.runtimeFileName.replace(/\.ts$/, '.js')}`;
  }
}

if (!DialectRegistry.has('sdk')) {
  DialectRegistry.register({
    name: 'sdk',
    domain: 'runtime',
    description: 'Compiles .holo service contracts to typed TypeScript SDK clients',
    supportedTraits: ['service', 'endpoint', 'schema', 'contract', 'auth', 'rest_resource'],
    riskTier: 'standard',
    ansPath: ANSCapabilityPath.SDK,
    factory: (options) => new SDKCompiler(options as SDKCompilerOptions),
    outputExtensions: ['.ts', '.json', '.md'],
    experimental: true,
  });
}

export default SDKCompiler;
