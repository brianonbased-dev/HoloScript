/**
 * HoloScript -> MCP Server Compiler (P0 skeleton + P1 trait-walk Tool[] emission)
 *
 * The inverse of MCPConfigCompiler: where that compiler emits IDE *client*
 * connection config, this compiler emits an MCP *server* — making the agent
 * tool surface a first-class compile target of the HoloScript trait library
 * (one trait -> rendered object + A2A agent card + MCP tool surface).
 *
 * P0 (a03c6300a): dialect registration, ANS, skeleton manifest.
 * P1 (this commit): trait-walk that derives `Tool[]` + per-tool `inputSchema`
 *   from trait declarations. For `@llm_agent` traits the existing
 *   `LLMTool.parameters` shape is reused (no new schema idiom invented).
 *   For all other traits, schema is inferred from config value types.
 *   Per-trait `required[]` is collected at the top-level JSON Schema position
 *   (NOT as per-property booleans — AJV-valid contract).
 *
 * P2+: emitted .mcp-server.ts runtime module, contract wrapper, handler dispatch.
 *
 * W.731 gate: P1 adds NO new @holoscript/core subpath imports (all relative).
 *   Any new subpath import introduced in P2+ must land in tsup.core.docker.cjs
 *   in the same commit.
 *
 * Design + phased plan + the narrowed governance claim:
 *   ai-ecosystem research/2026-06-16_holoscript-mcp-compiler-design.md
 *
 * @version 0.2.0 (P1: trait-walk + Tool[] emission)
 * @module @holoscript/core/compiler/HoloMCPCompiler
 */

import { CompilerBase } from './CompilerBase';
import type {
  HoloComposition,
  HoloObjectDecl,
  HoloObjectTrait,
  HoloTemplate,
  HoloValue,
} from '../parser/HoloCompositionTypes';

// =============================================================================
// PUBLIC TYPES
// =============================================================================

export interface HoloMCPCompilerOptions {
  /** Server name for the emitted MCP manifest (defaults to a generic name). */
  serverName?: string;
  /** Server version for the emitted MCP manifest. */
  serverVersion?: string;
}

// =============================================================================
// INTERNAL TYPES
// =============================================================================

/** JSON Schema fragment for a single MCP tool input property. */
interface MCPSchemaProperty {
  type: string;
  description: string;
  enum?: string[];
  items?: { type: string };
}

/** JSON Schema (object type) used as MCP tool inputSchema. */
interface MCPInputSchema {
  type: 'object';
  properties: Record<string, MCPSchemaProperty>;
  required: string[];
}

/**
 * A single emitted MCP Tool definition.
 * Shape matches MCP SDK Tool (name, description, inputSchema).
 */
export interface HoloMCPTool {
  name: string;
  description: string;
  inputSchema: MCPInputSchema;
  /** Audit provenance: which object/template + trait this tool was derived from. */
  _provenance: {
    source: 'object' | 'template';
    sourceName: string;
    traitName: string;
  };
  /** How faithfully the schema captures the trait config. */
  _schemaFidelity: 'inferred' | 'llm_tool';
}

/**
 * Emitted MCP server manifest shape.
 * P1: `tools` is now populated from the composition's traits.
 */
interface HoloMCPServerManifest {
  _generated: 'HoloMCPCompiler';
  _phase: string;
  _configKind: 'mcp-server';
  __holoMeta: {
    hashTier: 'fnv1a32';
    contractEnforcement: 'none';
  };
  server: { name: string; version: string };
  capabilities: { tools: Record<string, unknown> };
  /** Count of composition objects seen — proves the AST was traversed. */
  sourceObjectCount: number;
  tools: HoloMCPTool[];
}

// =============================================================================
// HELPERS — schema derivation (the core P1 contribution)
// =============================================================================

/**
 * Infer a JSON Schema type string from a HoloValue.
 * Returns 'string' for unknowns (safe fallback).
 */
function inferTypeFromValue(value: HoloValue): string {
  if (value === null) return 'string';
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'number') return 'number';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'object') return 'object';
  return 'string';
}

/**
 * Derive an MCP inputSchema from a trait's `config` Record<string, HoloValue>.
 * Type is inferred from the config value at parse time; description is the key name
 * (honest: we have no doc annotations yet — that lands in P5 @param layer).
 * No `required` entries for config-inferred schemas (we can't distinguish
 * "required with default" from "truly optional" without @param).
 */
function deriveSchemaFromConfig(config: Record<string, HoloValue>): {
  schema: MCPInputSchema;
  fidelity: 'inferred';
} {
  const properties: Record<string, MCPSchemaProperty> = {};
  const required: string[] = [];

  for (const [key, value] of Object.entries(config)) {
    const type = inferTypeFromValue(value);
    const prop: MCPSchemaProperty = {
      type,
      description: key,
    };
    if (type === 'array') {
      prop.items = { type: 'string' }; // conservative default
    }
    properties[key] = prop;
    // config-inferred: no required entries (no annotation to distinguish required from optional)
  }

  return {
    schema: { type: 'object', properties, required },
    fidelity: 'inferred',
  };
}

/**
 * Shape of the LLMTool.parameters record as used in LLMAgentTrait.ts.
 * Matches: Record<string, { type: string; description: string; required?: boolean }>
 */
interface LLMToolParam {
  type: string;
  description: string;
  required?: boolean;
  enum?: string[];
  items?: { type: string };
}

/**
 * Derive an MCP inputSchema from the `tools[].parameters` fields of an `@llm_agent`
 * trait config, using the existing LLMTool schema idiom (LLMAgentTrait.ts:36).
 *
 * The `tools` config value is an array of LLMTool objects. We union all
 * parameter definitions into one inputSchema that represents every parameter
 * the LLM tool surface exposes.
 *
 * Critically: per-parameter `required` booleans are collected into the
 * top-level `required: string[]` — NOT left as per-property booleans
 * (which would be invalid JSON Schema / AJV rejects them).
 */
function deriveSchemaFromLLMToolParams(tools: HoloValue[]): {
  schema: MCPInputSchema;
  fidelity: 'llm_tool';
} {
  const properties: Record<string, MCPSchemaProperty> = {};
  const required: string[] = [];
  const requiredSet = new Set<string>();

  for (const tool of tools) {
    if (
      typeof tool !== 'object' ||
      tool === null ||
      Array.isArray(tool)
    ) continue;

    const params = (tool as Record<string, HoloValue>)['parameters'];
    if (
      typeof params !== 'object' ||
      params === null ||
      Array.isArray(params)
    ) continue;

    const paramRecord = params as Record<string, HoloValue>;
    for (const [paramKey, paramSpec] of Object.entries(paramRecord)) {
      if (
        typeof paramSpec !== 'object' ||
        paramSpec === null ||
        Array.isArray(paramSpec)
      ) continue;

      const spec = paramSpec as Record<string, HoloValue>;
      const type = typeof spec['type'] === 'string' ? spec['type'] : 'string';
      const description =
        typeof spec['description'] === 'string' ? spec['description'] : paramKey;

      const prop: MCPSchemaProperty = { type, description };

      // Carry enum if present
      const enumVal = spec['enum'];
      if (Array.isArray(enumVal) && enumVal.length > 0) {
        prop.enum = enumVal.filter((v) => typeof v === 'string') as string[];
      }

      // Carry items if present
      const itemsVal = spec['items'];
      if (
        typeof itemsVal === 'object' &&
        itemsVal !== null &&
        !Array.isArray(itemsVal)
      ) {
        const itemsType = (itemsVal as Record<string, HoloValue>)['type'];
        if (typeof itemsType === 'string') {
          prop.items = { type: itemsType };
        }
      }

      properties[paramKey] = prop;

      // Collect required at top level (JSON-Schema-valid contract)
      if (spec['required'] === true && !requiredSet.has(paramKey)) {
        requiredSet.add(paramKey);
        required.push(paramKey);
      }
    }
  }

  return {
    schema: { type: 'object', properties, required },
    fidelity: 'llm_tool',
  };
}

/**
 * Derive one MCP Tool from a trait.
 * Strategy:
 *   - @llm_agent with tools[]: use LLMTool.parameters (richer schema)
 *   - all others: infer from config value types
 */
function deriveToolFromTrait(
  trait: HoloObjectTrait,
  sourceName: string,
  source: 'object' | 'template'
): HoloMCPTool {
  const traitName = trait.name;
  const isLLMAgent = traitName === 'llm_agent';

  let schema: MCPInputSchema;
  let fidelity: 'inferred' | 'llm_tool';

  if (isLLMAgent) {
    const toolsVal = trait.config['tools'];
    if (Array.isArray(toolsVal) && toolsVal.length > 0) {
      ({ schema, fidelity } = deriveSchemaFromLLMToolParams(toolsVal));
    } else {
      // @llm_agent with no tools[] — fall back to config inference
      ({ schema, fidelity } = deriveSchemaFromConfig(trait.config));
    }
  } else {
    ({ schema, fidelity } = deriveSchemaFromConfig(trait.config));
  }

  // Tool name: sanitize to valid identifier (snake_case)
  const rawName = `${sourceName}__${traitName}`;
  const toolName = rawName.toLowerCase().replace(/[^a-z0-9_]/g, '_');

  const description =
    `Invoke @${traitName} capability on ${sourceName} (source: ${source}).`;

  return {
    name: toolName,
    description,
    inputSchema: schema,
    _provenance: { source, sourceName, traitName },
    _schemaFidelity: fidelity,
  };
}

// =============================================================================
// COMPILER
// =============================================================================

export class HoloMCPCompiler extends CompilerBase {
  protected readonly compilerName = 'HoloMCPCompiler';

  private options: Required<HoloMCPCompilerOptions>;

  constructor(options: HoloMCPCompilerOptions = {}) {
    super();
    this.options = {
      serverName: options.serverName ?? '',
      serverVersion: options.serverVersion ?? '1.0.0',
    };
  }

  /**
   * Compile a HoloComposition into an MCP server manifest JSON string.
   *
   * P1 output: derives one MCP Tool per trait on each object and template in
   * the composition. The `inputSchema` per tool is AJV-valid JSON Schema with
   * a top-level `required: string[]` (NOT per-property booleans).
   *
   * @param composition - Parsed HoloScript composition AST
   * @param agentToken - Agent token for RBAC validation (JWT or UCAN)
   * @param outputPath - Optional output path for scope validation
   * @returns JSON string of the MCP server manifest (P1: Tool[] populated)
   */
  compile(composition: HoloComposition, agentToken: string, outputPath?: string): string {
    this.validateCompilerAccess(agentToken, outputPath);

    const serverName = this.options.serverName || 'holoscript-mcp-server';
    const sourceObjectCount = composition.objects?.length ?? 0;

    const tools: HoloMCPTool[] = [];

    // ── Walk templates (primary reusable capability definitions) ──────────────
    if (composition.templates) {
      for (const template of composition.templates as HoloTemplate[]) {
        if (!template.traits) continue;
        for (const trait of template.traits) {
          // HoloObjectTrait is the concrete shape; HoloTemplate.traits is typed
          // as HoloObjectTrait[] in HoloCompositionTypes.ts.
          tools.push(deriveToolFromTrait(trait, template.name, 'template'));
        }
      }
    }

    // ── Walk objects (instance capability overrides) ──────────────────────────
    if (composition.objects) {
      for (const obj of composition.objects as HoloObjectDecl[]) {
        if (!obj.traits || obj.traits.length === 0) continue;
        for (const trait of obj.traits) {
          tools.push(deriveToolFromTrait(trait, obj.name, 'object'));
        }
      }
    }

    const manifest: HoloMCPServerManifest = {
      _generated: 'HoloMCPCompiler',
      _phase: 'P1 — trait-walk Tool[] emission',
      _configKind: 'mcp-server',
      // Honest: hash is fnv1a32 (DomainSimulationReceipt.ts:5,134,183);
      // contract enforcement is none until Phase 3 evaluator gate.
      // See design doc governance section for the full audit trail.
      __holoMeta: {
        hashTier: 'fnv1a32',
        contractEnforcement: 'none',
      },
      server: { name: serverName, version: this.options.serverVersion },
      capabilities: { tools: {} },
      sourceObjectCount,
      tools,
    };

    return JSON.stringify(manifest, null, 2);
  }
}
