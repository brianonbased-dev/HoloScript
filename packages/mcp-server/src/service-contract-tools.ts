/**
 * HoloScript MCP Service Contract Tools
 *
 * Generates .holo compositions from OpenAPI specs or TypeScript interfaces.
 * Two tools:
 *
 * 1. `generate_service_contract` - Parse an OpenAPI/TypeScript contract and emit
 *    a valid .holo composition with @service, @endpoint, @schema, and @handler traits.
 *
 * 2. `explain_service_contract` - Analyze an existing .holo service composition and
 *    explain the contract structure in plain English.
 *
 * @version 1.0.0
 * @package @holoscript/mcp-server
 */

import type { Tool } from '@modelcontextprotocol/sdk/types.js';

// =============================================================================
// TYPES
// =============================================================================

interface OpenAPIPath {
  [method: string]: {
    operationId?: string;
    summary?: string;
    description?: string;
    parameters?: Array<{
      name: string;
      in: string;
      required?: boolean;
      schema?: { type: string; format?: string };
    }>;
    requestBody?: {
      content?: {
        [mime: string]: {
          schema?: SchemaObject;
        };
      };
    };
    responses?: {
      [statusCode: string]: {
        description?: string;
        content?: {
          [mime: string]: {
            schema?: SchemaObject;
          };
        };
      };
    };
  };
}

interface SchemaObject {
  type?: string;
  format?: string;
  properties?: Record<string, SchemaObject>;
  items?: SchemaObject;
  required?: string[];
  $ref?: string;
  enum?: unknown[];
  description?: string;
}

interface OpenAPISpec {
  openapi?: string;
  swagger?: string;
  info?: {
    title?: string;
    version?: string;
    description?: string;
  };
  paths?: Record<string, OpenAPIPath>;
  components?: {
    schemas?: Record<string, SchemaObject>;
  };
  definitions?: Record<string, SchemaObject>; // Swagger 2.0
}

interface TSInterface {
  name: string;
  fields: Array<{
    name: string;
    type: string;
    optional: boolean;
  }>;
}

interface ServiceContractResult {
  success: boolean;
  holoCode?: string;
  stats?: {
    endpoints: number;
    schemas: number;
    traits: number;
    lines: number;
  };
  detectedFormat?: string;
  error?: string;
}

// =============================================================================
// FORMAT DETECTION
// =============================================================================

function detectContractFormat(input: string): 'openapi' | 'typescript' | 'unknown' {
  const trimmed = input.trim();

  // JSON-based OpenAPI
  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed.openapi || parsed.swagger || parsed.paths) return 'openapi';
    } catch {
      // Not valid JSON
    }
  }

  // YAML-based OpenAPI
  if (/^openapi:\s/m.test(trimmed) || /^swagger:\s/m.test(trimmed)) {
    return 'openapi';
  }

  // TypeScript interface
  if (/\binterface\s+\w+/.test(trimmed) || /\btype\s+\w+\s*=/.test(trimmed)) {
    return 'typescript';
  }

  return 'unknown';
}

// =============================================================================
// OPENAPI PARSER
// =============================================================================

function parseOpenAPI(input: string): OpenAPISpec {
  const trimmed = input.trim();

  // Try JSON first
  if (trimmed.startsWith('{')) {
    return JSON.parse(trimmed) as OpenAPISpec;
  }

  // Minimal YAML parsing for common OpenAPI patterns
  return parseMinimalYAML(trimmed);
}

function parseMinimalYAML(yaml: string): OpenAPISpec {
  const spec: OpenAPISpec = {};
  const lines = yaml.split('\n');

  // Extract top-level fields
  for (const line of lines) {
    const match = line.match(/^(openapi|swagger):\s*['"]?([^'"]+)['"]?/);
    if (match) {
      if (match[1] === 'openapi') spec.openapi = match[2].trim();
      else spec.swagger = match[2].trim();
    }
  }

  // Extract info
  const infoMatch = yaml.match(/info:\s*\n((?:\s+.+\n?)*)/);
  if (infoMatch) {
    spec.info = {};
    const titleMatch = infoMatch[1].match(/title:\s*['"]?([^'"\n]+)['"]?/);
    const versionMatch = infoMatch[1].match(/version:\s*['"]?([^'"\n]+)['"]?/);
    if (titleMatch) spec.info.title = titleMatch[1].trim();
    if (versionMatch) spec.info.version = versionMatch[1].trim();
  }

  // Extract paths — simplified: detect /path patterns
  const pathsSection = yaml.match(/paths:\s*\n((?:\s+.+\n?)*)/);
  if (pathsSection) {
    spec.paths = {};
    const pathLines = pathsSection[1].split('\n');
    let currentPath = '';
    let currentMethod = '';

    for (const line of pathLines) {
      const pathMatch = line.match(/^\s{2}(\/\S+):/);
      if (pathMatch) {
        currentPath = pathMatch[1];
        spec.paths[currentPath] = {};
        continue;
      }

      const methodMatch = line.match(/^\s{4}(get|post|put|patch|delete|head|options):/);
      if (methodMatch && currentPath) {
        currentMethod = methodMatch[1];
        spec.paths[currentPath][currentMethod] = {};
        continue;
      }

      if (currentPath && currentMethod) {
        const summaryMatch = line.match(/^\s{6}summary:\s*['"]?(.+?)['"]?\s*$/);
        const opIdMatch = line.match(/^\s{6}operationId:\s*['"]?(.+?)['"]?\s*$/);
        if (summaryMatch) {
          spec.paths[currentPath][currentMethod].summary = summaryMatch[1];
        }
        if (opIdMatch) {
          spec.paths[currentPath][currentMethod].operationId = opIdMatch[1];
        }
      }
    }
  }

  // Extract schemas from components
  const schemasSection = yaml.match(
    /(?:components:\s*\n\s+schemas:|definitions:)\s*\n((?:\s+.+\n?)*)/
  );
  if (schemasSection) {
    const schemas: Record<string, SchemaObject> = {};
    const schemaLines = schemasSection[1].split('\n');
    let currentSchema = '';
    let currentField = '';

    for (const line of schemaLines) {
      const schemaMatch = line.match(/^\s{4}(\w+):/);
      if (schemaMatch) {
        currentSchema = schemaMatch[1];
        schemas[currentSchema] = { type: 'object', properties: {} };
        continue;
      }

      if (currentSchema) {
        const propMatch = line.match(/^\s{8}(\w+):/);
        if (propMatch) {
          currentField = propMatch[1];
          if (currentField !== 'required' && currentField !== 'type') {
            schemas[currentSchema].properties![currentField] = {};
          }
          continue;
        }

        const typeMatch = line.match(/^\s{10}type:\s*(\w+)/);
        if (typeMatch && currentField && schemas[currentSchema].properties![currentField]) {
          schemas[currentSchema].properties![currentField].type = typeMatch[1];
        }

        const requiredMatch = line.match(/^\s{6}required:/);
        if (requiredMatch) {
          schemas[currentSchema].required = [];
          currentField = '';
        }

        const reqItemMatch = line.match(/^\s{8}-\s*(\w+)/);
        if (reqItemMatch && schemas[currentSchema].required) {
          schemas[currentSchema].required!.push(reqItemMatch[1]);
        }
      }
    }

    if (Object.keys(schemas).length > 0) {
      spec.components = { schemas };
    }
  }

  return spec;
}

// =============================================================================
// TYPESCRIPT INTERFACE PARSER
// =============================================================================

function parseTypeScriptInterfaces(input: string): TSInterface[] {
  const interfaces: TSInterface[] = [];

  // Match interface blocks
  const interfaceRegex = /\binterface\s+(\w+)\s*(?:extends\s+[\w,\s]+)?\s*\{([^}]*)\}/g;
  let match;

  while ((match = interfaceRegex.exec(input)) !== null) {
    const name = match[1];
    const body = match[2];
    const fields: TSInterface['fields'] = [];

    const fieldRegex = /(\w+)(\??)\s*:\s*([^;]+);?/g;
    let fieldMatch;

    while ((fieldMatch = fieldRegex.exec(body)) !== null) {
      fields.push({
        name: fieldMatch[1],
        type: fieldMatch[3].trim(),
        optional: fieldMatch[2] === '?',
      });
    }

    interfaces.push({ name, fields });
  }

  // Match type aliases with object shapes
  const typeRegex = /\btype\s+(\w+)\s*=\s*\{([^}]*)\}/g;
  while ((match = typeRegex.exec(input)) !== null) {
    const name = match[1];
    const body = match[2];
    const fields: TSInterface['fields'] = [];

    const fieldRegex = /(\w+)(\??)\s*:\s*([^;]+);?/g;
    let fieldMatch;

    while ((fieldMatch = fieldRegex.exec(body)) !== null) {
      fields.push({
        name: fieldMatch[1],
        type: fieldMatch[3].trim(),
        optional: fieldMatch[2] === '?',
      });
    }

    interfaces.push({ name, fields });
  }

  return interfaces;
}

// =============================================================================
// HOLOSCRIPT TYPE MAPPING
// =============================================================================

const TS_TO_HOLO_TYPE: Record<string, string> = {
  string: 'string',
  number: 'number',
  boolean: 'boolean',
  Date: 'datetime',
  any: 'json',
  object: 'json',
  undefined: 'null',
  null: 'null',
};

const OPENAPI_TO_HOLO_TYPE: Record<string, string> = {
  string: 'string',
  integer: 'number',
  number: 'number',
  boolean: 'boolean',
  object: 'json',
  array: 'array',
};

function mapTsType(tsType: string): string {
  // Handle array types
  if (tsType.endsWith('[]')) return 'array';
  if (tsType.startsWith('Array<')) return 'array';

  // Handle union types — take first concrete type
  if (tsType.includes('|')) {
    const first = tsType.split('|')[0].trim();
    return mapTsType(first);
  }

  return TS_TO_HOLO_TYPE[tsType] || 'string';
}

function mapOpenAPIType(schema: SchemaObject): string {
  if (schema.$ref) {
    const refName = schema.$ref.split('/').pop() || 'unknown';
    return refName;
  }
  if (schema.type === 'array' && schema.items) {
    return `array<${mapOpenAPIType(schema.items)}>`;
  }
  return OPENAPI_TO_HOLO_TYPE[schema.type || 'string'] || 'string';
}

function httpMethodToUpper(method: string): string {
  return method.toUpperCase();
}

// =============================================================================
// HOLO CODE GENERATORS
// =============================================================================

function generateFromOpenAPI(spec: OpenAPISpec): ServiceContractResult {
  const lines: string[] = [];
  const serviceName = spec.info?.title?.replace(/[^a-zA-Z0-9]/g, '') || 'APIService';
  const version = spec.info?.version || '1.0.0';

  let endpointCount = 0;
  let schemaCount = 0;

  lines.push(`// Generated from OpenAPI ${spec.openapi || spec.swagger || '3.0'} spec`);
  lines.push(`// ${spec.info?.title || 'API Service'} v${version}`);
  lines.push('');
  lines.push(`composition "${serviceName}" {`);
  lines.push('');

  // Generate schema blocks from components/schemas
  const schemas = spec.components?.schemas || spec.definitions || {};
  for (const [schemaName, schemaObj] of Object.entries(schemas)) {
    lines.push(`  schema "${schemaName}" @schema @contract {`);

    if (schemaObj.properties) {
      for (const [fieldName, fieldSchema] of Object.entries(schemaObj.properties)) {
        const holoType = mapOpenAPIType(fieldSchema);
        const required = schemaObj.required?.includes(fieldName) ? '' : '?';
        const desc = fieldSchema.description ? ` // ${fieldSchema.description}` : '';
        lines.push(`    ${fieldName}${required}: ${holoType}${desc}`);
      }
    }

    lines.push('  }');
    lines.push('');
    schemaCount++;
  }

  // Generate endpoint blocks from paths
  if (spec.paths) {
    for (const [pathStr, pathItem] of Object.entries(spec.paths)) {
      const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'];
      for (const method of HTTP_METHODS) {
        const operation = pathItem[method];
        if (!operation) continue;

        const opName =
          operation.operationId || `${method}_${pathStr.replace(/[^a-zA-Z0-9]/g, '_')}`;
        const summary = operation.summary || `${httpMethodToUpper(method)} ${pathStr}`;

        lines.push(`  endpoint "${opName}" @endpoint @handler {`);
        lines.push(`    method: "${httpMethodToUpper(method)}"`);
        lines.push(`    path: "${pathStr}"`);
        if (operation.summary) {
          lines.push(`    summary: "${operation.summary}"`);
        }

        // Parameters
        if (operation.parameters?.length) {
          lines.push('    params {');
          for (const param of operation.parameters) {
            const paramType = param.schema?.type || 'string';
            const required = param.required ? '' : '?';
            lines.push(
              `      ${param.name}${required}: ${OPENAPI_TO_HOLO_TYPE[paramType] || 'string'} // in: ${param.in}`
            );
          }
          lines.push('    }');
        }

        // Request body
        if (operation.requestBody?.content) {
          const jsonSchema = operation.requestBody.content['application/json']?.schema;
          if (jsonSchema) {
            const bodyType = mapOpenAPIType(jsonSchema);
            lines.push(`    request_body: ${bodyType}`);
          }
        }

        // Responses
        if (operation.responses) {
          for (const [status, response] of Object.entries(operation.responses)) {
            const jsonSchema = response.content?.['application/json']?.schema;
            if (jsonSchema) {
              const responseType = mapOpenAPIType(jsonSchema);
              lines.push(`    response_${status}: ${responseType}`);
            }
          }
        }

        lines.push('  }');
        lines.push('');
        endpointCount++;
      }
    }
  }

  // Service metadata block
  lines.push(`  service "${serviceName}" @service @rest_resource {`);
  lines.push(`    version: "${version}"`);
  lines.push(`    framework: "express"`);
  lines.push(`    endpoints: ${endpointCount}`);
  lines.push('  }');

  lines.push('}');
  lines.push('');

  const code = lines.join('\n');
  const traitCount = (code.match(/@\w+/g) || []).length;

  return {
    success: true,
    holoCode: code,
    stats: {
      endpoints: endpointCount,
      schemas: schemaCount,
      traits: traitCount,
      lines: code.split('\n').length,
    },
    detectedFormat: 'openapi',
  };
}

function generateFromTypeScript(interfaces: TSInterface[]): ServiceContractResult {
  const lines: string[] = [];
  let schemaCount = 0;

  lines.push('// Generated from TypeScript interfaces');
  lines.push('');
  lines.push('composition "TypeScriptContract" {');
  lines.push('');

  for (const iface of interfaces) {
    lines.push(`  schema "${iface.name}" @schema @contract @validator {`);

    for (const field of iface.fields) {
      const holoType = mapTsType(field.type);
      const optional = field.optional ? '?' : '';
      lines.push(`    ${field.name}${optional}: ${holoType}`);
    }

    lines.push('  }');
    lines.push('');
    schemaCount++;
  }

  lines.push('}');
  lines.push('');

  const code = lines.join('\n');
  const traitCount = (code.match(/@\w+/g) || []).length;

  return {
    success: true,
    holoCode: code,
    stats: {
      endpoints: 0,
      schemas: schemaCount,
      traits: traitCount,
      lines: code.split('\n').length,
    },
    detectedFormat: 'typescript',
  };
}

// =============================================================================
// HANDLER
// =============================================================================

export async function handleGenerateServiceContract(
  args: Record<string, unknown>
): Promise<ServiceContractResult> {
  const input = args.input as string;
  const formatHint = args.format as string | undefined;

  if (!input) {
    return {
      success: false,
      error: 'input is required: provide OpenAPI spec or TypeScript interfaces',
    };
  }

  const format = formatHint || detectContractFormat(input);

  try {
    if (format === 'openapi') {
      const spec = parseOpenAPI(input);
      return generateFromOpenAPI(spec);
    }

    if (format === 'typescript') {
      const interfaces = parseTypeScriptInterfaces(input);
      if (interfaces.length === 0) {
        return { success: false, error: 'No TypeScript interfaces found in input' };
      }
      return generateFromTypeScript(interfaces);
    }

    return {
      success: false,
      error: `Could not detect contract format. Use the "format" parameter ("openapi" or "typescript") or provide valid OpenAPI JSON/YAML or TypeScript interfaces.`,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function handleExplainServiceContract(
  args: Record<string, unknown>
): Promise<{ success: boolean; explanation?: string; error?: string }> {
  const code = args.code as string;

  if (!code) {
    return { success: false, error: 'code is required: provide .holo composition code' };
  }

  const endpoints = (code.match(/@endpoint/g) || []).length;
  const schemas = (code.match(/@schema/g) || []).length;
  const services = (code.match(/@service/g) || []).length;
  const handlers = (code.match(/@handler/g) || []).length;

  const lines: string[] = [];
  lines.push('## Service Contract Summary');
  lines.push('');
  lines.push(`- **${services}** service(s) defined`);
  lines.push(`- **${endpoints}** endpoint(s) declared`);
  lines.push(`- **${schemas}** schema(s) for data contracts`);
  lines.push(`- **${handlers}** handler(s) for request processing`);

  // Extract endpoint details
  const endpointMatches = code.matchAll(/endpoint\s+"([^"]+)"\s+[^{]*\{([^}]*)\}/g);
  const endpointDetails: string[] = [];
  for (const match of endpointMatches) {
    const name = match[1];
    const body = match[2];
    const methodMatch = body.match(/method:\s*"(\w+)"/);
    const pathMatch = body.match(/path:\s*"([^"]+)"/);
    if (methodMatch && pathMatch) {
      endpointDetails.push(`  - \`${methodMatch[1]} ${pathMatch[1]}\` (${name})`);
    }
  }

  if (endpointDetails.length > 0) {
    lines.push('');
    lines.push('### Endpoints');
    lines.push(...endpointDetails);
  }

  // Extract schema names
  const schemaMatches = code.matchAll(/schema\s+"([^"]+)"/g);
  const schemaNames: string[] = [];
  for (const match of schemaMatches) {
    schemaNames.push(match[1]);
  }

  if (schemaNames.length > 0) {
    lines.push('');
    lines.push('### Schemas');
    lines.push(schemaNames.map((s) => `  - ${s}`).join('\n'));
  }

  return {
    success: true,
    explanation: lines.join('\n'),
  };
}

// =============================================================================
// HANDLER DISPATCHER
// =============================================================================

export async function handleServiceContractTool(
  name: string,
  args: Record<string, unknown>
): Promise<unknown | null> {
  switch (name) {
    case 'generate_service_contract':
      return handleGenerateServiceContract(args);
    case 'explain_service_contract':
      return handleExplainServiceContract(args);
    default:
      return null;
  }
}

// =============================================================================
// MCP TOOL DEFINITIONS
// =============================================================================

export const serviceContractTools: Tool[] = [
  {
    name: 'generate_service_contract',
    description:
      'Generate a HoloScript .holo composition from an OpenAPI spec or TypeScript interfaces. ' +
      'Auto-detects input format. Produces @service, @endpoint, @schema, @handler, and ' +
      '@contract traits. Supports OpenAPI 3.x JSON/YAML and TypeScript interface/type syntax.',
    inputSchema: {
      type: 'object',
      properties: {
        input: {
          type: 'string',
          description:
            'OpenAPI spec (JSON or YAML) or TypeScript interface/type definitions to convert',
        },
        format: {
          type: 'string',
          enum: ['openapi', 'typescript'],
          description: 'Input format hint. Auto-detected if omitted.',
        },
      },
      required: ['input'],
    },
  },
  {
    name: 'explain_service_contract',
    description:
      'Analyze a .holo service composition and explain its contract structure. ' +
      'Returns endpoint details, schema names, and trait counts.',
    inputSchema: {
      type: 'object',
      properties: {
        code: {
          type: 'string',
          description: 'HoloScript .holo composition code with service/contract traits',
        },
      },
      required: ['code'],
    },
  },
];
