/**
 * HoloScript NextJS API Compiler
 *
 * Compiles .holo compositions with @http traits into Next.js App Router
 * API route handler files (`route.ts`) for use in the `app/api/` directory.
 *
 * Mapping:
 *   @http { method: "GET" }    →  export async function GET(_request: NextRequest)
 *   @http { method: "POST" }   →  export async function POST(request: NextRequest)
 *   @http { method: "PUT" }    →  export async function PUT(request: NextRequest)
 *   @http { method: "PATCH" }  →  export async function PATCH(request: NextRequest)
 *   @http { method: "DELETE" } →  export async function DELETE(_request: NextRequest)
 *   @http { method: "HEAD" }   →  export async function HEAD(_request: Request)
 *
 * Handlers can be declared at the composition root level or on child objects:
 *
 * ```holo
 * // Root-level single handler
 * composition "EnvironmentPresetsAPI" {
 *   @http { method: "GET" }
 *   route: "/api/environment-presets"
 *   description: "Returns curated environment preset catalog"
 * }
 *
 * // Object-level multi-handler (multiple methods on one route)
 * composition "ItemsAPI" {
 *   object "ListItems" @http {
 *     method: "GET"
 *     path: "/api/items"
 *   }
 *   object "CreateItem" @http {
 *     method: "POST"
 *     path: "/api/items"
 *     statusCode: 201
 *   }
 * }
 * ```
 *
 * @module NextJSAPICompiler
 */

import type { HoloComposition, HoloObjectDecl } from '../parser/HoloCompositionTypes';
import type { HoloValue } from '../parser/HoloCompositionTypes';

// ── Public Types ───────────────────────────────────────────────────────────

export interface NextJSAPICompilerOptions {
  /** Override output directory prefix (default: 'api') */
  outputDir?: string;
  /** Override the route path segment (default: derived from composition name) */
  apiRoute?: string;
  /** Include JSDoc header comment in the generated file (default: true) */
  includeJsDoc?: boolean;
  /** Generate a runtime-check for the HTTP method (default: false) */
  strictMethodCheck?: boolean;
}

export interface NextJSAPICompileResult {
  /** Relative path for the generated file (e.g., 'api/environment-presets/route.ts') */
  path: string;
  /** Generated file content */
  code: string;
}

// ── Internal Types ─────────────────────────────────────────────────────────

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';

const VALID_METHODS = new Set<HttpMethod>([
  'GET',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
  'HEAD',
  'OPTIONS',
]);

/** Methods that typically carry a request body */
const BODY_METHODS = new Set<HttpMethod>(['POST', 'PUT', 'PATCH']);

/** Methods where the request parameter is unused / not needed */
const PASSTHROUGH_METHODS = new Set<HttpMethod>(['HEAD', 'DELETE']);

interface HttpHandlerConfig {
  method: HttpMethod;
  statusCode: number;
  description: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Extract a scalar value (string or number) from a HoloValue union.
 */
function toScalar(val: HoloValue | undefined): string | number | undefined {
  if (val === null || val === undefined) return undefined;
  if (typeof val === 'string' || typeof val === 'number') return val;
  // HoloBindValue or HoloObject — extract inner `value` if present
  if (typeof val === 'object' && !Array.isArray(val) && 'value' in val) {
    return toScalar((val as { value: HoloValue }).value);
  }
  return undefined;
}

/**
 * Extract a trait config Record from a composition's root-level traits array.
 */
function findRootTrait(
  composition: HoloComposition,
  traitName: string
): Record<string, HoloValue> | null {
  if (!composition.traits) return null;
  const found = composition.traits.find((t) => t.name === traitName);
  return found ? (found.config as Record<string, HoloValue>) : null;
}

/**
 * Build a key→scalar property map from an object's property list.
 */
function buildPropMap(obj: HoloObjectDecl): Map<string, string | number> {
  const map = new Map<string, string | number>();
  for (const prop of obj.properties) {
    const scalar = toScalar(prop.value);
    if (scalar !== undefined) map.set(prop.key, scalar);
  }
  return map;
}

/**
 * Convert a composition name to a kebab-case API route segment.
 *
 * Examples:
 *   "EnvironmentPresetsAPI" → "environment-presets"
 *   "AudioPresets"          → "audio-presets"
 *   "LOD"                   → "lod"
 *   "ItemsAPI"              → "items"
 */
function toApiRouteSegment(name: string, override?: string): string {
  if (override) {
    return override
      .replace(/^\/+api\/+/, '')
      .replace(/^\/+/, '')
      .replace(/\/+$/, '');
  }

  return (
    name
      .replace(/API$/, '')
      .replace(/Api$/, '')
      .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
      .replace(/([A-Z]{2,})([A-Z][a-z])/g, '$1-$2')
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '') || 'api'
  );
}

/**
 * Parse a raw method string into a validated HttpMethod.
 * Returns undefined if the value is not a recognised HTTP verb.
 */
function parseMethod(raw: string | number | undefined): HttpMethod | undefined {
  if (raw === undefined) return undefined;
  const upper = String(raw).trim().toUpperCase() as HttpMethod;
  return VALID_METHODS.has(upper) ? upper : undefined;
}

// ── Handler Extraction ─────────────────────────────────────────────────────

/**
 * Collect all @http handler descriptors from a composition.
 *
 * Extraction order (later entries override earlier for the same HTTP method):
 * 1. Root-level @http trait (single handler)
 * 2. Child objects that carry an `@http` trait
 */
function extractHandlers(composition: HoloComposition): HttpHandlerConfig[] {
  const byMethod = new Map<HttpMethod, HttpHandlerConfig>();

  // 1. Root-level @http trait
  const rootHttp = findRootTrait(composition, 'http');
  if (rootHttp) {
    const method = parseMethod(toScalar(rootHttp['method']));
    if (method) {
      byMethod.set(method, {
        method,
        statusCode: Number(toScalar(rootHttp['statusCode']) ?? toScalar(rootHttp['status']) ?? 200),
        description: String(toScalar(rootHttp['description']) ?? ''),
      });
    }
  }

  // 2. Object-level @http traits
  for (const obj of composition.objects) {
    const hasHttpTrait = obj.traits.some((t) => t.name === 'http');
    if (!hasHttpTrait) continue;

    const traitConfig = (obj.traits.find((t) => t.name === 'http')?.config ?? {}) as Record<
      string,
      HoloValue
    >;
    const props = buildPropMap(obj);

    // Method can come from the @http trait config (@http { method: "GET" })
    // or from object properties (method: "GET"). Trait config takes precedence.
    const rawMethod = toScalar(traitConfig['method']) ?? props.get('method');
    const method = parseMethod(rawMethod);
    if (!method) continue;
    const traitStatus = toScalar(traitConfig['statusCode'] ?? traitConfig['status']);
    const propStatus = props.get('statusCode') ?? props.get('status');

    byMethod.set(method, {
      method,
      statusCode: Number(traitStatus ?? propStatus ?? 200),
      description: String(
        props.get('description') ?? toScalar(traitConfig['description']) ?? obj.name ?? ''
      ),
    });
  }

  return [...byMethod.values()];
}

// ── Code Emission ──────────────────────────────────────────────────────────

/**
 * Emit the function signature and body for a single HTTP handler.
 */
function emitHandler(handler: HttpHandlerConfig): string[] {
  const { method, statusCode, description } = handler;
  const lines: string[] = [];

  const hasBody = BODY_METHODS.has(method);
  const isPassthrough = PASSTHROUGH_METHODS.has(method);

  // JSDoc for the individual handler
  if (description) {
    lines.push(`/** ${description} */`);
  }

  // Function signature — prefix unused param with underscore to satisfy lint
  const param = isPassthrough ? '_request: Request' : '_request: NextRequest';
  lines.push(`export async function ${method}(${param}): Promise<NextResponse> {`);

  if (method === 'HEAD') {
    lines.push(`  return new NextResponse(null, { status: 200 });`);
  } else if (method === 'DELETE') {
    const code = statusCode === 200 ? 204 : statusCode;
    lines.push(`  return new NextResponse(null, { status: ${code} });`);
  } else if (hasBody) {
    lines.push(`  let body: unknown;`);
    lines.push(`  try {`);
    lines.push(`    body = await _request.json();`);
    lines.push(`  } catch {`);
    lines.push(`    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });`);
    lines.push(`  }`);
    lines.push(``);
    lines.push(`  void body; // TODO: validate and process body`);
    lines.push(``);
    lines.push(`  return NextResponse.json(`);
    lines.push(`    { /* TODO: return response data */ },`);
    lines.push(`    { status: ${statusCode} }`);
    lines.push(`  );`);
  } else {
    lines.push(`  return NextResponse.json(`);
    lines.push(`    { /* TODO: return response data */ },`);
    lines.push(`    { status: ${statusCode} }`);
    lines.push(`  );`);
  }

  lines.push(`}`);
  return lines;
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Compile a HoloComposition with @http traits into a Next.js App Router
 * API route file.
 *
 * @param composition - Parsed HoloScript composition
 * @param options     - Optional compiler settings
 * @returns           - Path + generated TypeScript code for the route file
 *
 * @example
 * ```typescript
 * const result = compileToNextJSAPI(composition);
 * // result.path → 'api/environment-presets/route.ts'
 * // result.code → '// @generated ... export async function GET(...) { ... }'
 * ```
 */
export function compileToNextJSAPI(
  composition: HoloComposition,
  options: NextJSAPICompilerOptions = {}
): NextJSAPICompileResult {
  let handlers = extractHandlers(composition);

  // Fall back to a GET stub when no @http traits are present
  if (handlers.length === 0) {
    handlers = [
      {
        method: 'GET',
        statusCode: 200,
        description: `${composition.name} API endpoint`,
      },
    ];
  }

  const routeSegment = toApiRouteSegment(composition.name, options.apiRoute);
  const outputBase = options.outputDir ? options.outputDir.replace(/\/$/, '') : 'api';
  const filePath = `${outputBase}/${routeSegment}/route.ts`;

  const lines: string[] = [];

  // ── File header ──────────────────────────────────────────────────────
  if (options.includeJsDoc !== false) {
    lines.push(`// @generated by HoloScript NextJSAPICompiler — DO NOT EDIT`);
    lines.push(`// Source composition: "${composition.name}"`);
    lines.push(`// Route: /${outputBase}/${routeSegment}`);
    lines.push(``);
  }

  // ── Imports ──────────────────────────────────────────────────────────
  const needsNextRequest = handlers.some((h) => !PASSTHROUGH_METHODS.has(h.method));
  if (needsNextRequest) {
    lines.push(`import { NextRequest, NextResponse } from 'next/server';`);
  } else {
    lines.push(`import { NextResponse } from 'next/server';`);
  }
  lines.push(``);

  // ── Handler functions ─────────────────────────────────────────────────
  for (let i = 0; i < handlers.length; i++) {
    lines.push(...emitHandler(handlers[i]!));
    if (i < handlers.length - 1) {
      lines.push(``);
    }
  }

  return {
    path: filePath,
    code: lines.join('\n').trimEnd() + '\n',
  };
}

/**
 * Compile multiple HoloCompositions to Next.js API route files.
 */
export function compileAllToNextJSAPI(
  compositions: Array<{ name: string; composition: HoloComposition }>,
  options: NextJSAPICompilerOptions = {}
): NextJSAPICompileResult[] {
  return compositions.map(({ composition }) => compileToNextJSAPI(composition, options));
}
