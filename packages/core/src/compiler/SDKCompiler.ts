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

export type SDKCompilerTarget = 'sdk:typescript' | 'sdk:python' | 'sdk:react' | 'sdk:connectors';
export type SDKCompilerLanguage = 'typescript' | 'python' | 'react' | 'connectors';

export interface SDKCompilerOptions {
  target?: SDKCompilerTarget | SDKCompilerLanguage;
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
  target: SDKCompilerTarget;
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
    const target = this.resolveTarget(options.target ?? options.language);
    const clientClassName = options.clientClassName ?? 'GeneratedSDKClient';
    const defaultOutputDir = target === 'sdk:python' ? 'holoscript_sdk' : 'src';
    this.options = {
      target,
      language: this.languageForTarget(target),
      clientClassName,
      packageName: options.packageName ?? '@holoscript/generated-sdk',
      outputDir: this.trimSlashes(options.outputDir ?? defaultOutputDir),
      clientFileName: options.clientFileName ?? this.defaultClientFileName(target, clientClassName),
      runtimeFileName: options.runtimeFileName ?? this.defaultRuntimeFileName(target),
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
    const contract = this.extractContract(composition);

    switch (this.options.target) {
      case 'sdk:typescript':
        return this.emitTypeScriptFiles(contract);
      case 'sdk:python':
        return this.emitPythonFiles(contract);
      case 'sdk:react':
        return this.emitReactFiles(contract);
      case 'sdk:connectors':
        return this.emitConnectorFiles(contract);
      default:
        throw new Error(`Unsupported SDKCompiler target: ${this.options.target}`);
    }
  }

  private emitTypeScriptFiles(contract: ServiceContractIR): Record<string, string> {
    const files: Record<string, string> = {};
    files[this.joinOutputPath(this.options.clientFileName)] = this.emitClient(contract);
    files[this.joinOutputPath(this.options.runtimeFileName)] = this.emitRuntime(contract);

    if (this.options.includePackageJson) files['package.json'] = this.emitPackageJson(contract);
    if (this.options.includeTsConfig) files['tsconfig.json'] = this.emitTsConfig();
    if (this.options.includeReadme) files['README.md'] = this.emitReadme(contract);

    return this.attachReceipt(files, contract);
  }

  protected override defaultOutputFileName(): string {
    return this.joinOutputPath(this.options.clientFileName);
  }

  private resolveTarget(rawTarget: SDKCompilerOptions['target']): SDKCompilerTarget {
    switch (rawTarget ?? 'sdk:typescript') {
      case 'typescript':
      case 'sdk:typescript':
        return 'sdk:typescript';
      case 'python':
      case 'sdk:python':
        return 'sdk:python';
      case 'react':
      case 'sdk:react':
        return 'sdk:react';
      case 'connectors':
      case 'sdk:connectors':
        return 'sdk:connectors';
      default:
        throw new Error(
          `Unsupported SDKCompiler target "${String(rawTarget)}"; expected sdk:typescript, sdk:python, sdk:react, or sdk:connectors`
        );
    }
  }

  private languageForTarget(target: SDKCompilerTarget): SDKCompilerLanguage {
    switch (target) {
      case 'sdk:typescript':
        return 'typescript';
      case 'sdk:python':
        return 'python';
      case 'sdk:react':
        return 'react';
      case 'sdk:connectors':
        return 'connectors';
    }
  }

  private defaultClientFileName(target: SDKCompilerTarget, clientClassName: string): string {
    switch (target) {
      case 'sdk:python':
        return `${this.toSnake(clientClassName)}.py`;
      case 'sdk:react':
      case 'sdk:connectors':
      case 'sdk:typescript':
        return `${clientClassName}.ts`;
    }
  }

  private defaultRuntimeFileName(target: SDKCompilerTarget): string {
    switch (target) {
      case 'sdk:python':
        return 'sdk_runtime.py';
      case 'sdk:react':
      case 'sdk:connectors':
      case 'sdk:typescript':
        return 'sdk-runtime.ts';
    }
  }

  private attachReceipt(
    files: Record<string, string>,
    contract: ServiceContractIR
  ): Record<string, string> {
    files['sdk-compiler-receipt.json'] = this.emitReceipt(contract, Object.keys(files));
    return files;
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

  private emitPythonFiles(contract: ServiceContractIR): Record<string, string> {
    const files: Record<string, string> = {};
    files[this.joinOutputPath(this.options.clientFileName)] = this.emitPythonClient(contract);
    files[this.joinOutputPath(this.options.runtimeFileName)] = this.emitPythonRuntime(contract);
    if (this.options.includePackageJson)
      files['pyproject.toml'] = this.emitPythonProjectToml(contract);
    if (this.options.includeTsConfig) files[this.joinOutputPath('py.typed')] = '';
    if (this.options.includeReadme) files['README.md'] = this.emitReadme(contract);
    return this.attachReceipt(files, contract);
  }

  private emitPythonClient(contract: ServiceContractIR): string {
    const runtimeModule = this.options.runtimeFileName.replace(/\.py$/, '');
    const lines: string[] = [
      '"""',
      'Generated by HoloScript SDKCompiler - DO NOT EDIT.',
      `Source composition: ${contract.compositionName}.`,
      '"""',
      '',
      'from __future__ import annotations',
      '',
      'from typing import Any, NotRequired, TypedDict',
      '',
      `from .${runtimeModule} import SDKRuntime`,
      '',
    ];

    for (const schema of contract.schemas) {
      lines.push(...this.emitPythonTypedDict(schema.name, schema.fields), '');
    }

    for (const endpoint of contract.endpoints) {
      if (endpoint.params.length > 0) {
        lines.push(
          ...this.emitPythonTypedDict(this.paramsInterfaceName(endpoint), endpoint.params),
          ''
        );
      }
    }

    lines.push(
      `DEFAULT_BASE_URL = "${this.escapeStringValue(contract.service.baseUrl, 'JSON')}"`,
      ''
    );
    lines.push(`class ${this.options.clientClassName}:`);
    lines.push('    """Typed client generated from the .holo service-contract AST."""');
    lines.push('');
    lines.push(
      '    def __init__(self, base_url: str = DEFAULT_BASE_URL, *, partner_id: str | None = None, api_key: str | None = None, holo_key: str | None = None, secret_key: str | None = None, headers: dict[str, str] | None = None) -> None:'
    );
    lines.push(
      '        self.runtime = SDKRuntime(base_url, partner_id=partner_id, api_key=api_key, holo_key=holo_key, secret_key=secret_key, headers=headers)'
    );
    lines.push('');

    contract.endpoints.forEach((endpoint, index) => {
      lines.push(...this.emitPythonEndpointMethod(endpoint));
      if (index < contract.endpoints.length - 1) lines.push('');
    });

    return lines.join('\n');
  }

  private emitPythonTypedDict(
    name: string,
    fields: Array<{ name: string; optional: boolean; tsType: string }>
  ): string[] {
    const lines = [`class ${name}(TypedDict):`];
    if (fields.length === 0) {
      lines.push('    pass');
      return lines;
    }

    for (const field of fields) {
      const key = /^[A-Za-z_][A-Za-z0-9_]*$/.test(field.name)
        ? field.name
        : JSON.stringify(field.name);
      const valueType = this.pythonTypeFromTsType(field.tsType);
      lines.push(
        field.optional ? `    ${key}: NotRequired[${valueType}]` : `    ${key}: ${valueType}`
      );
    }
    return lines;
  }

  private emitPythonEndpointMethod(endpoint: ContractEndpoint): string[] {
    const paramsName = this.paramsInterfaceName(endpoint);
    const args: string[] = [];
    if (endpoint.params.length > 0) {
      const optional = this.allParamsOptional(endpoint) ? ' | None = None' : '';
      args.push(`params: ${paramsName}${optional}`);
    }
    if (endpoint.requestBodyType) {
      args.push(`body: ${this.pythonTypeFromTsType(endpoint.requestBodyType)} | dict[str, Any]`);
    }
    args.push('options: dict[str, Any] | None = None');

    const responseType = this.pythonTypeFromTsType(endpoint.responseType);
    const lines = [
      `    def ${this.toSnake(endpoint.name)}(self, ${args.join(', ')}) -> ${responseType}:`,
      `        """${this.escapeStringValue(endpoint.summary ?? endpoint.name, 'Python')}"""`,
    ];
    const paramsExpression = this.allParamsOptional(endpoint) ? '(params or {})' : 'params';
    if (endpoint.params.some((param) => param.location === 'path')) {
      lines.push(
        `        path = SDKRuntime.interpolate_path("${this.escapeStringValue(endpoint.path, 'JSON')}", ${paramsExpression})`
      );
    } else {
      lines.push(`        path = "${this.escapeStringValue(endpoint.path, 'JSON')}"`);
    }

    const queryParamNames = endpoint.params
      .filter((param) => param.location === 'query')
      .map((param) => param.name);
    if (queryParamNames.length > 0) {
      lines.push(
        `        query = SDKRuntime.pick_query(${paramsExpression}, ${JSON.stringify(queryParamNames)})`
      );
    } else {
      lines.push('        query = None');
    }

    const bodyArg = endpoint.requestBodyType ? 'body' : 'None';
    lines.push(
      `        return self.runtime.request("${endpoint.method}", path, body=${bodyArg}, query=query, options=options)`
    );
    return lines;
  }

  private emitPythonRuntime(contract: ServiceContractIR): string {
    const authHeaders = JSON.stringify({
      partnerId: contract.auth?.headers['partner_id'] ?? 'X-Partner-ID',
      apiKey: contract.auth?.headers['api_key'] ?? 'X-API-Key',
      timestamp: contract.auth?.signature?.timestampHeader ?? 'X-Timestamp',
      signature: contract.auth?.signature?.signatureHeader ?? 'X-Signature',
    });

    return [
      '"""Generated fixed runtime shim for HoloScript SDKCompiler Python clients."""',
      '',
      'from __future__ import annotations',
      '',
      'import hashlib',
      'import hmac',
      'import json',
      'import time',
      'from typing import Any',
      'from urllib import parse, request',
      '',
      `SDK_AUTH_HEADERS = ${authHeaders}`,
      `SDK_SIGNATURE_PAYLOAD_TEMPLATE = "${this.escapeStringValue(contract.auth?.signature?.payloadTemplate ?? '{method}:{endpoint}:{timestamp}:{body}', 'JSON')}"`,
      '',
      'class SDKError(Exception):',
      '    def __init__(self, message: str, status: int = 0, code: str = "sdk_error", details: Any = None) -> None:',
      '        super().__init__(message)',
      '        self.status = status',
      '        self.code = code',
      '        self.details = details',
      '',
      'class SDKRuntime:',
      '    def __init__(self, base_url: str, *, partner_id: str | None = None, api_key: str | None = None, holo_key: str | None = None, secret_key: str | None = None, headers: dict[str, str] | None = None) -> None:',
      '        self.base_url = base_url.rstrip("/")',
      '        self.partner_id = partner_id',
      '        self.api_key = api_key or holo_key',
      '        self.secret_key = secret_key',
      '        self.headers = headers or {}',
      '',
      '    def request(self, method: str, path: str, *, body: Any = None, query: dict[str, Any] | None = None, options: dict[str, Any] | None = None) -> Any:',
      '        url = self.build_url(path, query)',
      '        body_text = None if body is None else json.dumps(body).encode("utf-8")',
      '        headers = self.build_headers(method, path, body_text.decode("utf-8") if body_text else None, (options or {}).get("headers"))',
      '        req = request.Request(url, data=body_text, headers=headers, method=method)',
      '        try:',
      '            with request.urlopen(req, timeout=(options or {}).get("timeout", 30)) as response:',
      '                text = response.read().decode("utf-8")',
      '                return json.loads(text) if text else None',
      '        except Exception as error:',
      '            raise SDKError(str(error)) from error',
      '',
      '    def build_url(self, path: str, query: dict[str, Any] | None) -> str:',
      '        base = path if path.startswith("http") else f"{self.base_url}{path}"',
      '        if not query:',
      '            return base',
      '        clean_query = {key: value for key, value in query.items() if value is not None}',
      '        return f"{base}?{parse.urlencode(clean_query, doseq=True)}"',
      '',
      '    def build_headers(self, method: str, path: str, body_text: str | None, extra: dict[str, str] | None) -> dict[str, str]:',
      '        headers = {"Accept": "application/json", "Content-Type": "application/json", **self.headers, **(extra or {})}',
      '        if self.partner_id:',
      '            headers[SDK_AUTH_HEADERS["partnerId"]] = self.partner_id',
      '        if self.api_key:',
      '            headers[SDK_AUTH_HEADERS["apiKey"]] = self.api_key',
      '        if self.secret_key:',
      '            timestamp = str(int(time.time() * 1000))',
      '            headers[SDK_AUTH_HEADERS["timestamp"]] = timestamp',
      '            headers[SDK_AUTH_HEADERS["signature"]] = self.sign(method, path, timestamp, body_text or "")',
      '        return headers',
      '',
      '    def sign(self, method: str, path: str, timestamp: str, body_text: str) -> str:',
      '        payload = SDK_SIGNATURE_PAYLOAD_TEMPLATE.replace("{method}", method).replace("{endpoint}", path).replace("{path}", path).replace("{timestamp}", timestamp).replace("{body}", body_text)',
      '        secret = (self.secret_key or self.api_key or "").encode("utf-8")',
      '        return hmac.new(secret, payload.encode("utf-8"), hashlib.sha256).hexdigest()',
      '',
      '    @staticmethod',
      '    def interpolate_path(path: str, params: dict[str, Any]) -> str:',
      '        for key, value in params.items():',
      '            path = path.replace("{" + key + "}", parse.quote(str(value), safe=""))',
      '        return path',
      '',
      '    @staticmethod',
      '    def pick_query(params: dict[str, Any], names: list[str]) -> dict[str, Any]:',
      '        return {name: params.get(name) for name in names if params.get(name) is not None}',
      '',
    ].join('\n');
  }

  private emitReactFiles(contract: ServiceContractIR): Record<string, string> {
    const files = this.emitTypeScriptFilesWithoutReceipt(contract);
    files[this.joinOutputPath(`use${this.options.clientClassName}.tsx`)] =
      this.emitReactHooks(contract);
    if (this.options.includePackageJson)
      files['package.json'] = this.emitReactPackageJson(contract);
    if (this.options.includeTsConfig) files['tsconfig.json'] = this.emitTsConfig();
    if (this.options.includeReadme) files['README.md'] = this.emitReadme(contract);
    return this.attachReceipt(files, contract);
  }

  private emitTypeScriptFilesWithoutReceipt(contract: ServiceContractIR): Record<string, string> {
    const files: Record<string, string> = {};
    files[this.joinOutputPath(this.options.clientFileName)] = this.emitClient(contract);
    files[this.joinOutputPath(this.options.runtimeFileName)] = this.emitRuntime(contract);
    return files;
  }

  private emitReactHooks(contract: ServiceContractIR): string {
    const clientModule = this.options.clientFileName.replace(/\.ts$/, '.js');
    const hookName = `use${this.options.clientClassName}`;
    const lines = [
      "'use client';",
      '',
      '/**',
      ' * @generated by HoloScript SDKCompiler React emitter - DO NOT EDIT.',
      ` * Source composition: ${this.escapeStringValue(contract.compositionName, 'TypeScript')}.`,
      ' */',
      '',
      "import { useCallback, useMemo } from 'react';",
      `import { ${this.options.clientClassName}, type ${this.options.clientClassName}Config } from './${clientModule}';`,
      '',
      `export function ${hookName}(config: ${this.options.clientClassName}Config = {}) {`,
      `  const client = useMemo(() => new ${this.options.clientClassName}(config), [config]);`,
      '',
    ];

    for (const endpoint of contract.endpoints) {
      lines.push(
        `  const ${endpoint.name} = useCallback((...args: Parameters<${this.options.clientClassName}['${endpoint.name}']>) => client.${endpoint.name}(...args), [client]);`
      );
    }

    lines.push('', '  return {', '    client,');
    for (const endpoint of contract.endpoints) {
      lines.push(`    ${endpoint.name},`);
    }
    lines.push('  };', '}', '', `export type ${hookName}Result = ReturnType<typeof ${hookName}>;`);
    return lines.join('\n');
  }

  private emitConnectorFiles(contract: ServiceContractIR): Record<string, string> {
    const files = this.emitTypeScriptFilesWithoutReceipt(contract);
    const connectorFileName = `${this.connectorClassName()}Connector.ts`;
    files[this.joinOutputPath(connectorFileName)] = this.emitConnector(contract);
    files[this.joinOutputPath('tools.ts')] = this.emitConnectorTools(contract);
    files[this.joinOutputPath('index.ts')] = [
      `export * from './${this.options.clientFileName.replace(/\.ts$/, '.js')}';`,
      `export * from './${connectorFileName.replace(/\.ts$/, '.js')}';`,
      "export * from './tools.js';",
      '',
    ].join('\n');
    if (this.options.includePackageJson)
      files['package.json'] = this.emitConnectorPackageJson(contract);
    if (this.options.includeTsConfig) files['tsconfig.json'] = this.emitTsConfig();
    if (this.options.includeReadme) files['README.md'] = this.emitReadme(contract);
    return this.attachReceipt(files, contract);
  }

  private emitConnector(contract: ServiceContractIR): string {
    const connectorClassName = `${this.connectorClassName()}Connector`;
    const clientModule = this.options.clientFileName.replace(/\.ts$/, '.js');
    const lines = [
      '/**',
      ' * @generated by HoloScript SDKCompiler connector emitter - DO NOT EDIT.',
      ` * Source composition: ${this.escapeStringValue(contract.compositionName, 'TypeScript')}.`,
      ' */',
      '',
      "import { ServiceConnector } from '@holoscript/connector-core';",
      "import type { Tool } from '@modelcontextprotocol/sdk/types.js';",
      `import { ${this.options.clientClassName}, type ${this.options.clientClassName}Config } from './${clientModule}';`,
      "import { createConnectorTools } from './tools.js';",
      '',
      `export class ${connectorClassName} extends ServiceConnector {`,
      `  private readonly client: ${this.options.clientClassName};`,
      '',
      `  constructor(config: ${this.options.clientClassName}Config = {}) {`,
      '    super();',
      `    this.client = new ${this.options.clientClassName}(config);`,
      '  }',
      '',
      '  async connect(): Promise<void> {',
      '    this.isConnected = true;',
      '  }',
      '',
      '  async disconnect(): Promise<void> {',
      '    this.isConnected = false;',
      '  }',
      '',
      '  async health(): Promise<boolean> {',
      '    return this.isConnected;',
      '  }',
      '',
      '  async listTools(): Promise<Tool[]> {',
      '    return createConnectorTools();',
      '  }',
      '',
      '  async executeTool(name: string, args: Record<string, unknown>): Promise<unknown> {',
      '    switch (name) {',
    ];

    for (const endpoint of contract.endpoints) {
      lines.push(`      case '${this.connectorToolName(endpoint)}':`);
      lines.push(
        `        return this.client.${endpoint.name}(${this.connectorCallArgs(endpoint)});`
      );
    }

    lines.push(
      '      default:',
      '        throw new Error(`Unknown connector tool: ${name}`);',
      '    }',
      '  }',
      '}',
      ''
    );
    return lines.join('\n');
  }

  private emitConnectorTools(contract: ServiceContractIR): string {
    const lines = [
      '/** @generated by HoloScript SDKCompiler connector emitter - DO NOT EDIT. */',
      '',
      "import type { Tool } from '@modelcontextprotocol/sdk/types.js';",
      '',
      'export function createConnectorTools(): Tool[] {',
      '  return [',
    ];

    for (const endpoint of contract.endpoints) {
      lines.push('    {');
      lines.push(`      name: '${this.connectorToolName(endpoint)}',`);
      lines.push(
        `      description: '${this.escapeStringValue(endpoint.summary ?? endpoint.name, 'TypeScript')}',`
      );
      lines.push(
        `      inputSchema: ${JSON.stringify(this.connectorInputSchema(endpoint), null, 8)},`
      );
      lines.push('    },');
    }

    lines.push('  ];', '}', '');
    return lines.join('\n');
  }

  private emitPythonProjectToml(contract: ServiceContractIR): string {
    return [
      '[project]',
      `name = "${this.options.packageName.replace(/^@[^/]+\//, '')}"`,
      `version = "${contract.service.version}"`,
      'requires-python = ">=3.11"',
      'dependencies = []',
      '',
    ].join('\n');
  }

  private emitReactPackageJson(contract: ServiceContractIR): string {
    return JSON.stringify(
      {
        name: this.options.packageName,
        version: contract.service.version,
        type: 'module',
        main: `dist/${this.options.clientFileName.replace(/\.ts$/, '.js')}`,
        types: `dist/${this.options.clientFileName.replace(/\.ts$/, '.d.ts')}`,
        peerDependencies: {
          react: '>=18',
        },
        devDependencies: {
          typescript: '^5.5.0',
        },
      },
      null,
      2
    );
  }

  private emitConnectorPackageJson(contract: ServiceContractIR): string {
    return JSON.stringify(
      {
        name: this.options.packageName,
        version: contract.service.version,
        type: 'module',
        main: 'dist/index.js',
        types: 'dist/index.d.ts',
        dependencies: {
          '@holoscript/connector-core': 'workspace:*',
          '@modelcontextprotocol/sdk': '^1.0.0',
        },
        devDependencies: {
          typescript: '^5.5.0',
        },
      },
      null,
      2
    );
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

  private emitReceipt(contract: ServiceContractIR, generatedFiles: string[]): string {
    return JSON.stringify(
      {
        type: 'SDKCompilerReceipt',
        target: this.options.target,
        language: this.options.language,
        sourceComposition: contract.compositionName,
        service: contract.service.name,
        clientClassName: this.options.clientClassName,
        serviceBaseUrl: contract.service.baseUrl,
        schemaCount: contract.schemas.length,
        endpointCount: contract.endpoints.length,
        generatedFiles,
        contractSurfaces: {
          auth: contract.auth?.name,
          responseEnvelope: contract.service.responseEnvelope,
          rateLimit: contract.service.rateLimit,
        },
        integrationSurfaces: {
          credential: 'HoloKey-compatible apiKey/holoKey credential headers',
          routing: 'UmbrellaRoute-compatible baseUrl and endpoint path contract',
          provenance: 'triad-ready sourceComposition/service/generatedFiles receipt',
          holoGate:
            'documentation umbrella only; generated SDKs bind concrete HoloKey, UmbrellaRoute, and triad receipt surfaces',
        },
        fanOut: {
          source: 'single ServiceContractIR extracted from the .holo contract AST',
          targets: ['sdk:typescript', 'sdk:python', 'sdk:react', 'sdk:connectors'],
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

  private pythonTypeFromTsType(tsType: string): string {
    if (tsType.endsWith('[]')) {
      return `list[${this.pythonTypeFromTsType(tsType.slice(0, -2))}]`;
    }

    switch (tsType) {
      case 'string':
        return 'str';
      case 'number':
        return 'float';
      case 'boolean':
        return 'bool';
      case 'void':
        return 'None';
      case 'unknown':
      case 'Record<string, unknown>':
        return 'Any';
      default:
        return /^[A-Za-z_][A-Za-z0-9_]*$/.test(tsType) ? tsType : 'Any';
    }
  }

  private connectorClassName(): string {
    return this.options.clientClassName.replace(/Client$/, '') || this.options.clientClassName;
  }

  private connectorToolName(endpoint: ContractEndpoint): string {
    const prefix = this.toSnake(this.connectorClassName());
    return `${prefix}_${this.toSnake(endpoint.name)}`;
  }

  private connectorCallArgs(endpoint: ContractEndpoint): string {
    const args: string[] = [];
    if (endpoint.params.length > 0) args.push('args.params as any');
    if (endpoint.requestBodyType) args.push('args.body as any');
    args.push('args.options as any');
    return args.join(', ');
  }

  private connectorInputSchema(endpoint: ContractEndpoint): Record<string, unknown> {
    const properties: Record<string, unknown> = {};
    const required: string[] = [];

    if (endpoint.params.length > 0) {
      const paramProperties: Record<string, unknown> = {};
      const requiredParams: string[] = [];
      for (const param of endpoint.params) {
        paramProperties[param.name] = { type: this.jsonSchemaTypeFromTsType(param.tsType) };
        if (!param.optional) requiredParams.push(param.name);
      }
      properties.params = {
        type: 'object',
        properties: paramProperties,
        ...(requiredParams.length > 0 ? { required: requiredParams } : {}),
      };
      if (requiredParams.length > 0) required.push('params');
    }

    if (endpoint.requestBodyType) {
      properties.body = { type: 'object' };
      required.push('body');
    }

    properties.options = { type: 'object' };

    return {
      type: 'object',
      properties,
      ...(required.length > 0 ? { required } : {}),
    };
  }

  private jsonSchemaTypeFromTsType(tsType: string): string {
    if (tsType.endsWith('[]')) return 'array';
    switch (tsType) {
      case 'string':
        return 'string';
      case 'number':
        return 'number';
      case 'boolean':
        return 'boolean';
      default:
        return 'object';
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

  private toSnake(value: string): string {
    return this.toKebab(value).replace(/-/g, '_') || 'sdk';
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
