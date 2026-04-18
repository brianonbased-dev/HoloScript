/**
 * HoloScript MCP TypeScript Absorb Tool
 *
 * Enhanced one-way TypeScript → .holo conversion with @imperative { ... } regions.
 * Detects patterns from popular frameworks:
 * - Express/Fastify → service {} + @endpoint + @handler
 * - Prisma/TypeORM → data {} + @model + @migration
 * - Retry/circuit breaker libs → @circuit_breaker, @retry
 * - BullMQ/RabbitMQ → pipeline {} + @queue + @worker
 * - Docker → container {} + @dockerfile
 *
 * Function bodies are preserved in @imperative { ... } regions.
 *
 * @version 1.0.0
 * @package @holoscript/mcp-server
 */

import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import * as fs from 'fs';
import * as path from 'path';
import { parseHolo } from '@holoscript/core';

// =============================================================================
// TYPES
// =============================================================================

interface DetectedEndpoint {
  method: string;
  path: string;
  handlerName?: string;
  body: string;
}

interface DetectedModel {
  name: string;
  fields: Array<{ name: string; type: string; optional: boolean }>;
}

interface DetectedQueue {
  name: string;
  processor?: string;
  body?: string;
}

interface AbsorbResult {
  success: boolean;
  holo: string;
  detections: {
    endpoints: number;
    models: number;
    queues: number;
    resiliencePatterns: string[];
    containerPatterns: string[];
  };
  error?: string;
  /**
   * B4 validation record — `valid` is false when `parseHolo` rejected
   * the generated composition. `parseErrors` carries the parser's
   * message list. Absent only when validation was skipped (e.g. on
   * error paths where `holo` was never produced).
   */
  validation?: {
    valid: boolean;
    parseErrors: string[];
  };
}

// =============================================================================
// PATTERN DETECTORS
// =============================================================================

/**
 * Detect Express/Fastify route handlers.
 */
function detectEndpoints(code: string): DetectedEndpoint[] {
  const endpoints: DetectedEndpoint[] = [];

  // Match: app.get('/path', handler) or router.post('/path', async (req, res) => { ... })
  const routeRegex =
    /(?:app|router)\.(get|post|put|delete|patch)\s*\(\s*['"`]([^'"`]+)['"`]\s*,\s*((?:async\s+)?(?:\([^)]*\)|[a-zA-Z_]\w*)\s*(?:=>|{)[^]*?(?:\n\s*\}[);]*))/g;
  let match;
  while ((match = routeRegex.exec(code)) !== null) {
    endpoints.push({
      method: match[1].toUpperCase(),
      path: match[2],
      body: match[3].trim(),
    });
  }

  // Fallback: simpler pattern for named handler functions
  if (endpoints.length === 0) {
    const simpleRouteRegex =
      /(?:app|router)\.(get|post|put|delete|patch)\s*\(\s*['"`]([^'"`]+)['"`]\s*,\s*(\w+)\s*\)/g;
    while ((match = simpleRouteRegex.exec(code)) !== null) {
      endpoints.push({
        method: match[1].toUpperCase(),
        path: match[2],
        handlerName: match[3],
        body: '',
      });
    }
  }

  return endpoints;
}

/**
 * Detect Prisma models or TypeORM entities.
 */
function detectModels(code: string): DetectedModel[] {
  const models: DetectedModel[] = [];

  // Prisma-style: model User { id Int @id ... }
  const prismaRegex = /model\s+(\w+)\s*\{([^}]+)\}/g;
  let match;
  while ((match = prismaRegex.exec(code)) !== null) {
    const fields: DetectedModel['fields'] = [];
    const body = match[2];
    const fieldRegex =
      /^\s+(\w+)\s+(String|Int|Float|Boolean|DateTime|BigInt|Decimal|Bytes|Json|\w+)(\?)?/gm;
    let fieldMatch;
    while ((fieldMatch = fieldRegex.exec(body)) !== null) {
      fields.push({
        name: fieldMatch[1],
        type: fieldMatch[2],
        optional: !!fieldMatch[3],
      });
    }
    models.push({ name: match[1], fields });
  }

  // TypeScript interface/class with @Entity() or plain interfaces
  if (models.length === 0) {
    const interfaceRegex =
      /(?:export\s+)?(?:interface|class)\s+(\w+)(?:\s+extends\s+\w+)?\s*\{([^}]+)\}/g;
    while ((match = interfaceRegex.exec(code)) !== null) {
      const fields: DetectedModel['fields'] = [];
      const body = match[2];
      const fieldRegex = /(\w+)(\?)?\s*:\s*([^;\n]+)/g;
      let fieldMatch;
      while ((fieldMatch = fieldRegex.exec(body)) !== null) {
        fields.push({
          name: fieldMatch[1],
          type: fieldMatch[3].trim(),
          optional: !!fieldMatch[2],
        });
      }
      if (fields.length > 0) {
        models.push({ name: match[1], fields });
      }
    }
  }

  return models;
}

/**
 * Detect BullMQ / message queue patterns.
 */
function detectQueues(code: string): DetectedQueue[] {
  const queues: DetectedQueue[] = [];

  // new Queue('name') or new Worker('name', processor)
  const queueRegex = /new\s+(?:Queue|Worker)\s*\(\s*['"`]([^'"`]+)['"`]/g;
  let match;
  while ((match = queueRegex.exec(code)) !== null) {
    queues.push({ name: match[1] });
  }

  return queues;
}

/**
 * Detect resilience patterns (circuit breaker, retry, etc.).
 */
function detectResiliencePatterns(code: string): string[] {
  const patterns: string[] = [];

  if (/circuit[_-]?breaker|CircuitBreaker/i.test(code)) patterns.push('circuit_breaker');
  if (/\.retry\(|retryable|@Retry|withRetry/i.test(code)) patterns.push('retry');
  if (/timeout\s*\(|@Timeout|withTimeout/i.test(code)) patterns.push('timeout');
  if (/fallback|@Fallback/i.test(code)) patterns.push('fallback');
  if (/bulkhead|@Bulkhead/i.test(code)) patterns.push('bulkhead');

  return patterns;
}

/**
 * Detect container/deployment patterns.
 */
function detectContainerPatterns(code: string): string[] {
  const patterns: string[] = [];

  if (/FROM\s+node|dockerfile/i.test(code)) patterns.push('dockerfile');
  if (/kubernetes|k8s|apiVersion.*Kind/i.test(code)) patterns.push('kubernetes_pod');
  if (/docker-compose|services:/i.test(code)) patterns.push('container');

  return patterns;
}

// =============================================================================
// HOLO GENERATION
// =============================================================================

/**
 * Generate a .holo composition from detected patterns.
 */
function generateHolo(
  code: string,
  serviceName: string,
  endpoints: DetectedEndpoint[],
  models: DetectedModel[],
  queues: DetectedQueue[],
  resiliencePatterns: string[],
  containerPatterns: string[]
): string {
  const lines: string[] = [];

  lines.push(`composition "${serviceName}" {`);
  lines.push('');

  // Service block
  if (endpoints.length > 0) {
    lines.push('  service {');
    lines.push('    @service');
    if (resiliencePatterns.length > 0) {
      for (const p of resiliencePatterns) {
        lines.push(`    @${p}`);
      }
    }
    lines.push('');

    for (const ep of endpoints) {
      lines.push(`    @endpoint("${ep.method} ${ep.path}")`);
      if (ep.handlerName) {
        lines.push(`    @handler("${ep.handlerName}")`);
      }
      if (ep.body) {
        lines.push('    @imperative {');
        // Indent the body
        const bodyLines = ep.body.split('\n');
        for (const bl of bodyLines) {
          lines.push(`      ${bl}`);
        }
        lines.push('    }');
      }
      lines.push('');
    }
    lines.push('  }');
    lines.push('');
  }

  // Data block
  if (models.length > 0) {
    lines.push('  data {');
    lines.push('    @db');
    lines.push('');

    for (const model of models) {
      lines.push(`    @model("${model.name}")`);
      for (const field of model.fields) {
        const opt = field.optional ? '?' : '';
        lines.push(`    // ${field.name}${opt}: ${field.type}`);
      }
      lines.push('');
    }
    lines.push('  }');
    lines.push('');
  }

  // Pipeline block
  if (queues.length > 0) {
    lines.push('  pipeline {');
    lines.push('    @pipeline');
    for (const q of queues) {
      lines.push(`    @queue("${q.name}")`);
      lines.push(`    @worker`);
    }
    lines.push('  }');
    lines.push('');
  }

  // Container block
  if (containerPatterns.length > 0) {
    lines.push('  container {');
    for (const p of containerPatterns) {
      lines.push(`    @${p}`);
    }
    lines.push('  }');
    lines.push('');
  }

  // If nothing was detected, produce a skeleton
  if (
    endpoints.length === 0 &&
    models.length === 0 &&
    queues.length === 0 &&
    containerPatterns.length === 0
  ) {
    lines.push('  // No recognizable patterns detected.');
    lines.push('  // Add your service, data, pipeline, or container blocks here.');
    lines.push('  service {');
    lines.push('    @service');
    lines.push('  }');
    lines.push('');
  }

  lines.push('}');
  return lines.join('\n');
}

/**
 * Infer a service name from the source code.
 */
function inferServiceName(code: string): string {
  // Look for app = express() or export class SomeService
  const expressMatch = code.match(/const\s+(\w+)\s*=\s*express\s*\(/);
  if (expressMatch) return expressMatch[1] + 'Service';

  const classMatch = code.match(/(?:export\s+)?class\s+(\w+)/);
  if (classMatch) return classMatch[1];

  return 'AbsorbedService';
}

// =============================================================================
// MAIN HANDLER
// =============================================================================

function absorbTypeScript(code: string, name?: string): AbsorbResult {
  const serviceName = name || inferServiceName(code);
  const endpoints = detectEndpoints(code);
  const models = detectModels(code);
  const queues = detectQueues(code);
  const resiliencePatterns = detectResiliencePatterns(code);
  const containerPatterns = detectContainerPatterns(code);

  const holo = generateHolo(
    code,
    serviceName,
    endpoints,
    models,
    queues,
    resiliencePatterns,
    containerPatterns
  );

  // B4 (NORTH_STAR DT-14): validate the generated .holo through the
  // real parser before returning. Any syntax problem introduced by
  // the string-concat generator (e.g. unbalanced braces from embedded
  // @imperative regions, unescaped quotes in endpoint paths) surfaces
  // as a structured error instead of silently shipping malformed code
  // to the MCP client.
  const validation = validateGeneratedHolo(holo);

  return {
    success: true,
    holo,
    detections: {
      endpoints: endpoints.length,
      models: models.length,
      queues: queues.length,
      resiliencePatterns,
      containerPatterns,
    },
    validation,
  };
}

/**
 * Parse the generated .holo output through `@holoscript/core` and
 * return a structured validation record. Attached to tool responses
 * so downstream consumers can decide whether to trust the emission.
 */
function validateGeneratedHolo(holo: string): {
  valid: boolean;
  parseErrors: string[];
} {
  try {
    const result = parseHolo(holo, { tolerant: true, locations: false });
    const errs = result.errors ?? [];
    return {
      valid: errs.length === 0 && result.ast != null,
      parseErrors: errs.map((e) => e.message ?? String(e)),
    };
  } catch (err) {
    return {
      valid: false,
      parseErrors: [err instanceof Error ? err.message : String(err)],
    };
  }
}

/**
 * Scan a directory to suggest which files would yield "fruitful" HoloScript architectures.
 */
async function suggestHoloTransforms(rootDir: string, maxFiles: number = 2000): Promise<unknown> {
  const suggestions: Array<{
    file: string;
    score: number;
    endpoints: number;
    models: number;
    queues: number;
    resiliencePatterns: string[];
    containerPatterns: string[];
  }> = [];

  const excludeDirs = new Set(['node_modules', '.git', 'dist', 'build', 'out', 'target', '.next']);
  let filesProcessed = 0;

  async function walk(dir: string) {
    if (filesProcessed >= maxFiles) return;

    let entries;
    try {
      entries = await fs.promises.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (filesProcessed >= maxFiles) break;
      if (excludeDirs.has(entry.name)) continue;
      if (entry.name.startsWith('.') && entry.name !== '.') continue;

      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile()) {
        if (!entry.name.endsWith('.ts') && !entry.name.endsWith('.js')) continue;

        filesProcessed++;
        try {
          const code = await fs.promises.readFile(fullPath, 'utf8');
          const endpoints = detectEndpoints(code);
          const models = detectModels(code);
          const queues = detectQueues(code);
          const resiliencePatterns = detectResiliencePatterns(code);
          const containerPatterns = detectContainerPatterns(code);

          const score =
            endpoints.length * 2 +
            models.length * 3 +
            queues.length * 2 +
            resiliencePatterns.length +
            containerPatterns.length;

          if (score > 0) {
            suggestions.push({
              file: path.relative(rootDir, fullPath),
              score,
              endpoints: endpoints.length,
              models: models.length,
              queues: queues.length,
              resiliencePatterns,
              containerPatterns,
            });
          }
        } catch {
          // graceful degradation on unreachable files
        }
      }
    }
  }

  await walk(rootDir);

  suggestions.sort((a, b) => b.score - a.score);

  return {
    success: true,
    scannedFiles: filesProcessed,
    suggestionsFound: suggestions.length,
    suggestions: suggestions.slice(0, 50), // Return Top 50 prime transformation candidates
  };
}

export async function handleAbsorbTypescriptTool(
  name: string,
  args: Record<string, unknown>
): Promise<unknown | null> {
  if (name === 'absorb_typescript') {
    const code = args.code as string;
    if (!code) {
      return {
        success: false,
        error: 'The "code" parameter is required: provide TypeScript source code to absorb',
      };
    }

    const serviceName = args.name as string | undefined;
    return absorbTypeScript(code, serviceName);
  }

  if (name === 'absorb_suggest_holoscript_transform') {
    const rootDir = args.rootDir as string;
    if (!rootDir) {
      return {
        success: false,
        error: 'The "rootDir" parameter is required to analyze codebase files.',
      };
    }
    const maxFiles = args.maxFiles as number | undefined;
    return await suggestHoloTransforms(rootDir, maxFiles);
  }

  return null;
}

// =============================================================================
// MCP TOOL DEFINITION
// =============================================================================

export const absorbTypescriptTools: Tool[] = [
  {
    name: 'absorb_typescript',
    description:
      'Convert TypeScript source code into a .holo composition. Detects Express/Fastify ' +
      'routes, Prisma/TypeORM models, BullMQ queues, and resilience patterns. Preserves ' +
      'function bodies in @imperative regions.',
    inputSchema: {
      type: 'object',
      properties: {
        code: {
          type: 'string',
          description: 'TypeScript source code to convert to .holo',
        },
        name: {
          type: 'string',
          description: 'Optional service name (auto-detected if omitted)',
        },
      },
      required: ['code'],
    },
  },
  {
    name: 'absorb_suggest_holoscript_transform',
    description:
      'Scans a directory for codebase files that are excellent candidates for HoloScript transformation ' +
      '(e.g. Express routes, TypeORM models, queues). Returns a ranked list of file paths to feed into ' +
      'absorb_typescript to bring them fully into the native semantic framework.',
    inputSchema: {
      type: 'object',
      properties: {
        rootDir: {
          type: 'string',
          description: 'Absolute path to the root directory to scan.',
        },
        maxFiles: {
          type: 'number',
          description: 'Maximum number of files to process (default 2000).',
        },
      },
      required: ['rootDir'],
    },
  },
];
