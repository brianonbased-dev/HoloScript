/**
 * HoloScript MCP Composition Validation Tool
 *
 * Validates .holo compositions against the full constraint system:
 * - Spatial trait constraints (requires/conflicts/oneof)
 * - v6 universal domain constraints (service, data, pipeline, resilience, etc.)
 * - Domain block coherence (traits match their enclosing domain)
 * - Dependency graph validation
 *
 * @version 1.0.0
 * @package @holoscript/mcp-server
 */

import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { parseHolo, BUILTIN_CONSTRAINTS } from '@holoscript/core';
import type {
  HoloComposition,
  HoloObjectDecl,
  HoloDomainBlock,
  HoloDomainType,
} from '@holoscript/core';
import type { TraitConstraint } from '@holoscript/core';

// =============================================================================
// TYPES
// =============================================================================

interface ValidationDiagnostic {
  severity: 'error' | 'warning' | 'info';
  code: string;
  message: string;
  source?: string; // trait or block name
  suggestion?: string;
}

interface ValidationResult {
  valid: boolean;
  diagnostics: ValidationDiagnostic[];
  stats: {
    totalTraits: number;
    totalObjects: number;
    totalDomainBlocks: number;
    domainsUsed: string[];
    constraintsChecked: number;
  };
}

// Domain → expected traits mapping for coherence checking
const DOMAIN_TRAIT_MAP: Record<string, string[]> = {
  service: [
    'service',
    'endpoint',
    'route',
    'handler',
    'middleware',
    'api_gateway',
    'load_balancer',
    'service_discovery',
    'cors_policy',
    'rate_limiter',
    'rest_resource',
    'health_endpoint',
    'graphql_resolver',
    'webhook_sender',
    'webhook_receiver',
  ],
  data: [
    'db',
    'model',
    'query',
    'migration',
    'cache',
    'repository',
    'transaction',
    'event_store',
    'cursor_pagination',
    'soft_delete',
    'audit_column',
  ],
  contract: [
    'contract',
    'schema',
    'validator',
    'serializer',
    'json_schema',
    'openapi_path',
    'schema_evolution',
    'dto',
  ],
  pipeline: [
    'stream',
    'queue',
    'worker',
    'scheduler',
    'message_broker',
    'idempotent_consumer',
    'saga_orchestrator',
    'pipeline',
  ],
  container: [
    'container',
    'deployment',
    'scaling',
    'secret',
    'dockerfile',
    'kubernetes_pod',
    'helm_chart',
  ],
  metric: ['metric', 'trace', 'log', 'health_check', 'structured_log', 'span', 'slo', 'alert_rule'],
  resilience: [
    'circuit_breaker',
    'retry',
    'timeout',
    'fallback',
    'bulkhead',
    'exponential_backoff',
    'canary_release',
    'blue_green_deploy',
  ],
  network: ['http', 'websocket', 'grpc', 'graphql', 'tls_config', 'jwt_config', 'oauth2_config'],
};

// =============================================================================
// VALIDATION ENGINE
// =============================================================================

/**
 * Extract all traits from a composition (objects + domain blocks).
 */
function extractAllTraits(composition: HoloComposition): {
  objectTraits: Map<string, string[]>; // objectName → traits[]
  domainBlockTraits: Map<string, { domain: HoloDomainType; traits: string[] }>;
  allTraits: string[];
} {
  const objectTraits = new Map<string, string[]>();
  const domainBlockTraits = new Map<string, { domain: HoloDomainType; traits: string[] }>();
  const allTraits: string[] = [];

  // Extract from objects
  if (composition.objects) {
    for (const obj of composition.objects) {
      const traits = extractObjectTraits(obj);
      objectTraits.set(obj.name, traits);
      allTraits.push(...traits);
    }
  }

  // Extract from domain blocks
  if (composition.domainBlocks) {
    for (const block of composition.domainBlocks) {
      const key = `${block.domain}:${block.name}`;
      domainBlockTraits.set(key, { domain: block.domain, traits: block.traits || [] });
      allTraits.push(...(block.traits || []));
    }
  }

  return { objectTraits, domainBlockTraits, allTraits };
}

/**
 * Extract trait names from an object declaration.
 */
function extractObjectTraits(obj: HoloObjectDecl): string[] {
  const traits: string[] = [];
  if (obj.traits) {
    for (const t of obj.traits) {
      // HoloObjectTrait has a .name property
      if (typeof t === 'string') {
        traits.push(t);
      } else if (t && typeof t === 'object' && 'name' in t) {
        traits.push((t as { name: string }).name);
      }
    }
  }
  return traits;
}

/**
 * Check all trait constraints (requires/conflicts/oneof) against a trait set.
 */
function checkConstraints(
  traitSet: string[],
  sourceName: string,
  constraints: TraitConstraint[]
): ValidationDiagnostic[] {
  const diagnostics: ValidationDiagnostic[] = [];
  const traitSetLower = new Set(traitSet.map((t) => t.toLowerCase()));

  for (const constraint of constraints) {
    if (!traitSetLower.has(constraint.source.toLowerCase())) continue;

    if (constraint.type === 'requires') {
      for (const target of constraint.targets) {
        if (!traitSetLower.has(target.toLowerCase())) {
          diagnostics.push({
            severity: 'error',
            code: 'CONSTRAINT_REQUIRES',
            message: `@${constraint.source} requires @${target}: ${constraint.message}`,
            source: sourceName,
            suggestion: `Add @${target} to ${sourceName}`,
          });
        }
      }
    } else if (constraint.type === 'conflicts') {
      for (const target of constraint.targets) {
        if (traitSetLower.has(target.toLowerCase())) {
          diagnostics.push({
            severity: 'error',
            code: 'CONSTRAINT_CONFLICTS',
            message: `@${constraint.source} conflicts with @${target}: ${constraint.message}`,
            source: sourceName,
            suggestion: `Remove either @${constraint.source} or @${target} from ${sourceName}`,
          });
        }
      }
    } else if (constraint.type === 'oneof') {
      const present = constraint.targets.filter((t: any) => traitSetLower.has(t.toLowerCase()));
      if (present.length > 1) {
        diagnostics.push({
          severity: 'error',
          code: 'CONSTRAINT_ONEOF',
          message: `Only one of [${constraint.targets.map((t: any) => '@' + t).join(', ')}] allowed: ${constraint.message}`,
          source: sourceName,
          suggestion: `Keep only one of: ${present.map((t: any) => '@' + t).join(', ')}`,
        });
      }
    }
  }

  return diagnostics;
}

/**
 * Check domain block coherence — traits inside a domain block should belong to that domain.
 */
function checkDomainCoherence(
  domainBlockTraits: Map<string, { domain: HoloDomainType; traits: string[] }>
): ValidationDiagnostic[] {
  const diagnostics: ValidationDiagnostic[] = [];

  for (const [key, { domain, traits }] of domainBlockTraits) {
    const expectedTraits = DOMAIN_TRAIT_MAP[domain];
    if (!expectedTraits) continue; // spatial domains don't have a strict trait list

    for (const trait of traits) {
      if (!expectedTraits.includes(trait.toLowerCase())) {
        // Check if it belongs to a different v6 domain
        let belongsToDomain: string | null = null;
        for (const [d, dTraits] of Object.entries(DOMAIN_TRAIT_MAP)) {
          if (dTraits.includes(trait.toLowerCase())) {
            belongsToDomain = d;
            break;
          }
        }

        if (belongsToDomain) {
          diagnostics.push({
            severity: 'warning',
            code: 'DOMAIN_COHERENCE',
            message: `@${trait} in ${key} belongs to domain "${belongsToDomain}", not "${domain}"`,
            source: key,
            suggestion: `Move @${trait} to a "${belongsToDomain}" block, or keep it here if intentional`,
          });
        }
      }
    }
  }

  return diagnostics;
}

/**
 * Main validation function.
 */
function validateComposition(code: string): ValidationResult {
  const diagnostics: ValidationDiagnostic[] = [];

  // Step 1: Parse (tolerant mode — AST may exist even when success=false)
  const parseResult = parseHolo(code);

  // Add parse errors as diagnostics
  if (parseResult.errors?.length) {
    for (const e of parseResult.errors) {
      diagnostics.push({
        severity: 'error',
        code: 'PARSE_ERROR',
        message: e.message,
        source: e.loc ? `line ${e.loc.line}` : undefined,
      });
    }
  }

  // If no AST at all, return early
  if (!parseResult.ast) {
    return {
      valid: false,
      diagnostics,
      stats: {
        totalTraits: 0,
        totalObjects: 0,
        totalDomainBlocks: 0,
        domainsUsed: [],
        constraintsChecked: 0,
      },
    };
  }

  const composition = parseResult.ast;

  // Step 2: Extract all traits
  const { objectTraits, domainBlockTraits, allTraits } = extractAllTraits(composition);

  // Step 3: Check object-level constraints
  let constraintsChecked = 0;
  for (const [name, traits] of objectTraits) {
    const objDiags = checkConstraints(traits, name, BUILTIN_CONSTRAINTS);
    diagnostics.push(...objDiags);
    constraintsChecked += BUILTIN_CONSTRAINTS.length;
  }

  // Step 4: Check domain block constraints
  for (const [key, { traits }] of domainBlockTraits) {
    const blockDiags = checkConstraints(traits, key, BUILTIN_CONSTRAINTS);
    diagnostics.push(...blockDiags);
    constraintsChecked += BUILTIN_CONSTRAINTS.length;
  }

  // Step 5: Check domain coherence
  const coherenceDiags = checkDomainCoherence(domainBlockTraits);
  diagnostics.push(...coherenceDiags);

  // Step 6: Collect domains used
  const domainsUsed = new Set<string>();
  if (composition.domainBlocks) {
    for (const block of composition.domainBlocks) {
      domainsUsed.add(block.domain);
    }
  }

  const hasErrors = diagnostics.some((d) => d.severity === 'error');

  return {
    valid: !hasErrors,
    diagnostics,
    stats: {
      totalTraits: allTraits.length,
      totalObjects: composition.objects?.length || 0,
      totalDomainBlocks: composition.domainBlocks?.length || 0,
      domainsUsed: [...domainsUsed],
      constraintsChecked,
    },
  };
}

// =============================================================================
// HANDLER
// =============================================================================

export async function handleValidationTool(
  name: string,
  args: Record<string, unknown>
): Promise<unknown | null> {
  if (name !== 'validate_composition') return null;

  const code = args.code as string;
  if (!code) {
    return {
      valid: false,
      diagnostics: [
        {
          severity: 'error',
          code: 'MISSING_INPUT',
          message: 'The "code" parameter is required',
        },
      ],
      stats: {
        totalTraits: 0,
        totalObjects: 0,
        totalDomainBlocks: 0,
        domainsUsed: [],
        constraintsChecked: 0,
      },
    };
  }

  return validateComposition(code);
}

// =============================================================================
// MCP TOOL DEFINITION
// =============================================================================

export const validationTools: Tool[] = [
  {
    name: 'validate_composition',
    description:
      'Validate a .holo composition against trait constraints (requires/conflicts), ' +
      'v6 domain coherence, and dependency rules. Returns diagnostics with suggestions.',
    inputSchema: {
      type: 'object',
      properties: {
        code: {
          type: 'string',
          description: 'The .holo composition source code to validate',
        },
      },
      required: ['code'],
    },
  },
];
