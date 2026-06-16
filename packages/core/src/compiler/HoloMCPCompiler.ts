/**
 * HoloScript -> MCP Server Compiler
 * (P0 skeleton + P1 trait-walk Tool[] emission + P2 TypeScript module emission)
 *
 * The inverse of MCPConfigCompiler: where that compiler emits IDE *client*
 * connection config, this compiler emits an MCP *server* — making the agent
 * tool surface a first-class compile target of the HoloScript trait library
 * (one trait -> rendered object + A2A agent card + MCP tool surface).
 *
 * P0 (a03c6300a): dialect registration, ANS, skeleton manifest.
 * P1 (edfdeaa18): trait-walk that derives `Tool[]` + per-tool `inputSchema`
 *   from trait declarations. For `@llm_agent` traits the existing
 *   `LLMTool.parameters` shape is reused (no new schema idiom invented).
 *   For all other traits, schema is inferred from config value types.
 *   Per-trait `required[]` is collected at the top-level JSON Schema position
 *   (NOT as per-property booleans — AJV-valid contract).
 * P2 (99f96c797): `compileModule()` emits a self-contained `.mcp-server.ts`
 *   TypeScript module — import-free, passes `tsc --noEmit --strict`, carries
 *   `HoloMCPRuntimeAdapter` interface + `TOOL_DISPATCH` + `verifyContractWiring`
 *   + honest `__holoMeta`. Handler dispatch wired by caller via `registerAdapter`.
 * P3 (this commit): startup evaluator gate — the emitted module tracks
 *   `_adapterRegistered` + `_contractVerified`; `verifyContractWiring()` throws
 *   immediately on empty registry (registerAdapter never called); `handleToolCall()`
 *   refuses requests until `verifyContractWiring()` has passed. This makes the
 *   Trust-by-Construction claim structurally real: a hand-authored TS tool file
 *   cannot provide this guarantee without per-file convention.
 *   `contractEnforcement` updated from 'none' → 'startup-gate' (honest).
 *
 * P4 (1b387deb5): `compile_to_mcp_server` registered as live MCP tool in compiler-tools.ts;
 *   `handleListExportTargets` replaced hardcoded 25-entry list with `DialectRegistry.names()
 *   .filter(not internal) + legacy targets`; `compile_holoscript` enum synced (was missing
 *   8 wired targets + had 'multi-layer' internal leak); `check:export-targets-sync` CI gate
 *   added to catch future enum drift at push time.
 * P5 (this commit): `@param` annotation layer — in-language per-parameter schema declarations.
 *   An `@param { key: { type, description, required, enum } }` meta-trait placed immediately
 *   before a real trait provides `HoloParamAnnotation` overrides for any config key.
 *   Annotations win over value-inference for type, description, required[], and enum.
 *   Pure-annotation parameters (present in `@param` but not in config defaults) are also emitted.
 *   `_schemaFidelity` gains `'annotated'` (previously only `'inferred'` | `'llm_tool'`).
 *   No parser changes: `@param { ... }` is valid existing block-trait syntax.
 *
 * W.731 gate: P2 adds NO new @holoscript/core subpath imports (all relative).
 *   Any new subpath import introduced in P3+ must land in tsup.core.docker.cjs
 *   in the same commit.
 *
 * Design + phased plan + the narrowed governance claim:
 *   ai-ecosystem research/2026-06-16_holoscript-mcp-compiler-design.md
 *
 * @version 0.5.0 (P5: @param annotation layer)
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
 * P5 — in-language schema annotation for one parameter.
 * Emitted by `@param { key: { type, description, required, enum } }` meta-traits.
 * Fields override value-inference in `deriveSchemaFromConfig`.
 */
export interface HoloParamAnnotation {
  /** JSON Schema type string ('string' | 'number' | 'boolean' | 'array' | 'object'). */
  type?: string;
  /** Human-readable description surfaced in the MCP tool schema. */
  description?: string;
  /** Whether this parameter is required (populates top-level `required[]`). */
  required?: boolean;
  /** Enum constraint — restricts to a discrete set of string values. */
  enum?: string[];
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
  /**
   * How faithfully the schema captures the trait config.
   * - 'inferred'  — type derived from config value at parse time; no doc annotations.
   * - 'llm_tool'  — schema from LLMTool.parameters (explicit types + descriptions).
   * - 'annotated' — schema from adjacent @param meta-trait (P5+; lossless in-language SSOT).
   */
  _schemaFidelity: 'inferred' | 'llm_tool' | 'annotated';
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
 * Collect `@param` annotations from a trait list for the trait at `currentIndex`.
 *
 * Convention (P5): an `@param { key: { type, description, required, enum } }` meta-trait
 * placed immediately before a real trait provides per-parameter schema overrides.
 * The meta-trait has `name === 'param'` and a block config where each key is a
 * parameter name and the value is a `HoloParamAnnotation`-shaped object.
 * This function is no-op (returns {}) when no adjacent `@param` trait exists.
 */
function collectParamAnnotations(
  traits: HoloObjectTrait[],
  currentIndex: number,
): Record<string, HoloParamAnnotation> {
  if (currentIndex === 0) return {};
  const prev = traits[currentIndex - 1];
  if (prev.name !== 'param') return {};

  const result: Record<string, HoloParamAnnotation> = {};
  for (const [key, val] of Object.entries(prev.config)) {
    if (typeof val !== 'object' || val === null || Array.isArray(val)) continue;
    const ann = val as Record<string, HoloValue>;
    const annotation: HoloParamAnnotation = {};
    if (typeof ann['type'] === 'string') annotation.type = ann['type'];
    if (typeof ann['description'] === 'string') annotation.description = ann['description'];
    if (ann['required'] === true) annotation.required = true;
    if (Array.isArray(ann['enum'])) {
      annotation.enum = (ann['enum'] as HoloValue[]).filter(
        (v): v is string => typeof v === 'string',
      );
    }
    result[key] = annotation;
  }
  return result;
}

/**
 * Derive an MCP inputSchema from a trait's `config` Record<string, HoloValue>.
 *
 * P1 behaviour (no params): type is inferred from the config value at parse time;
 * description defaults to the key name; no `required[]` entries (cannot distinguish
 * "required with default" from "truly optional" without annotation).
 *
 * P5 behaviour (params present): annotation fields override inference for any key
 * that has a matching `HoloParamAnnotation`. Annotated params that are absent from
 * the default `config` values are also emitted (pure-annotation parameters).
 */
function deriveSchemaFromConfig(
  config: Record<string, HoloValue>,
  params: Record<string, HoloParamAnnotation> = {},
): {
  schema: MCPInputSchema;
  fidelity: 'inferred' | 'annotated';
} {
  const properties: Record<string, MCPSchemaProperty> = {};
  const required: string[] = [];
  const hasAnnotations = Object.keys(params).length > 0;

  // Config-derived properties (with optional annotation overrides)
  for (const [key, value] of Object.entries(config)) {
    const ann = params[key];
    const type = ann?.type ?? inferTypeFromValue(value);
    const description = ann?.description ?? key;
    const prop: MCPSchemaProperty = { type, description };
    if (type === 'array') {
      prop.items = { type: 'string' }; // conservative default
    }
    if (ann?.enum && ann.enum.length > 0) {
      prop.enum = ann.enum;
    }
    properties[key] = prop;
    if (ann?.required === true) {
      required.push(key);
    }
  }

  // Pure-annotation parameters (not in config defaults but declared via @param)
  for (const [key, ann] of Object.entries(params)) {
    if (key in config) continue; // already handled above
    const type = ann.type ?? 'string';
    const description = ann.description ?? key;
    const prop: MCPSchemaProperty = { type, description };
    if (ann.enum && ann.enum.length > 0) prop.enum = ann.enum;
    properties[key] = prop;
    if (ann.required === true) required.push(key);
  }

  return {
    schema: { type: 'object', properties, required },
    fidelity: hasAnnotations ? 'annotated' : 'inferred',
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
 * Strategy (priority order):
 *   1. `@llm_agent` with tools[]: LLMTool.parameters schema (richest — explicit types + descriptions)
 *   2. Adjacent `@param` annotations present: annotated schema (P5 — in-language SSOT)
 *   3. Fallback: value-inference from config
 */
function deriveToolFromTrait(
  trait: HoloObjectTrait,
  sourceName: string,
  source: 'object' | 'template',
  params: Record<string, HoloParamAnnotation> = {},
): HoloMCPTool {
  const traitName = trait.name;
  const isLLMAgent = traitName === 'llm_agent';

  let schema: MCPInputSchema;
  let fidelity: 'inferred' | 'llm_tool' | 'annotated';

  if (isLLMAgent) {
    const toolsVal = trait.config['tools'];
    if (Array.isArray(toolsVal) && toolsVal.length > 0) {
      // LLMTool.parameters is the richer source — @param annotations are redundant here.
      ({ schema, fidelity } = deriveSchemaFromLLMToolParams(toolsVal));
    } else {
      // @llm_agent with no tools[] — annotation or value-inference
      ({ schema, fidelity } = deriveSchemaFromConfig(trait.config, params));
    }
  } else {
    ({ schema, fidelity } = deriveSchemaFromConfig(trait.config, params));
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
// CODEGEN HELPERS (P2 — TypeScript module emission)
// =============================================================================

/** Map a JSON Schema type string to its TypeScript equivalent. */
function jsonSchemaTypeToTs(schemaType: string): string {
  switch (schemaType) {
    case 'string':  return 'string';
    case 'number':  return 'number';
    case 'boolean': return 'boolean';
    case 'array':   return 'unknown[]';
    case 'object':  return 'Record<string, unknown>';
    case 'null':    return 'null';
    default:        return 'unknown';
  }
}

/**
 * Derive a valid TypeScript interface name for a tool's parameter interface.
 * e.g. "brittney__llm_agent" → "HoloParams_brittney__llm_agent"
 */
function paramInterfaceName(toolName: string): string {
  return `HoloParams_${toolName}`;
}

/** Emit a TypeScript parameter interface for one tool's inputSchema. */
function emitParamInterface(tool: HoloMCPTool): string {
  const name = paramInterfaceName(tool.name);
  const props = Object.entries(tool.inputSchema.properties);
  if (props.length === 0) {
    return `export interface ${name} { [key: string]: unknown }`;
  }
  const required = new Set(tool.inputSchema.required);
  const lines = props.map(([key, prop]) => {
    const optional = required.has(key) ? '' : '?';
    return `  ${key}${optional}: ${jsonSchemaTypeToTs(prop.type)};`;
  });
  return `export interface ${name} {\n${lines.join('\n')}\n}`;
}

/** Emit the TOOLS array literal as a TypeScript const declaration. */
function emitToolsArray(tools: HoloMCPTool[]): string {
  const toolLiterals = tools.map((t) => {
    const propsEntries = Object.entries(t.inputSchema.properties).map(([k, p]) => {
      const enumPart = p.enum ? `, enum: ${JSON.stringify(p.enum)}` : '';
      const itemsPart = p.items ? `, items: { type: '${p.items.type}' as const }` : '';
      return `      ${k}: { type: '${p.type}' as const, description: ${JSON.stringify(p.description)}${enumPart}${itemsPart} }`;
    });
    const reqPart = t.inputSchema.required.length > 0
      ? `\n      required: ${JSON.stringify(t.inputSchema.required)},`
      : '\n      required: [],';
    return `  {\n    name: ${JSON.stringify(t.name)},\n    description: ${JSON.stringify(t.description)},\n    inputSchema: {\n      type: 'object' as const,\n      properties: {\n${propsEntries.join(',\n')}\n      },${reqPart}\n    },\n  }`;
  });
  return `export const TOOLS: _HoloTool[] = [\n${toolLiterals.join(',\n')}\n];`;
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
   * Walk all templates and objects in a composition, returning derived tools.
   *
   * P5: `@param` meta-traits (name === 'param') are skipped for tool emission but
   * are consumed by the immediately-following real trait as schema annotations.
   * Each `@param` block config maps parameter names to `HoloParamAnnotation` objects.
   */
  private _walkTraits(composition: HoloComposition): HoloMCPTool[] {
    const tools: HoloMCPTool[] = [];

    // Templates first (primary reusable capability definitions)
    if (composition.templates) {
      for (const template of composition.templates as HoloTemplate[]) {
        if (!template.traits) continue;
        const traits = template.traits as HoloObjectTrait[];
        for (let i = 0; i < traits.length; i++) {
          const trait = traits[i];
          if (trait.name === 'param') continue; // annotation-only, consumed by next trait
          const params = collectParamAnnotations(traits, i);
          tools.push(deriveToolFromTrait(trait, template.name, 'template', params));
        }
      }
    }

    // Objects (instance capability overrides)
    if (composition.objects) {
      for (const obj of composition.objects as HoloObjectDecl[]) {
        if (!obj.traits || obj.traits.length === 0) continue;
        const traits = obj.traits as HoloObjectTrait[];
        for (let i = 0; i < traits.length; i++) {
          const trait = traits[i];
          if (trait.name === 'param') continue; // annotation-only, consumed by next trait
          const params = collectParamAnnotations(traits, i);
          tools.push(deriveToolFromTrait(trait, obj.name, 'object', params));
        }
      }
    }

    return tools;
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
    const tools = this._walkTraits(composition);

    const manifest: HoloMCPServerManifest = {
      _generated: 'HoloMCPCompiler',
      _phase: 'P5 — @param annotation layer',
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

  /**
   * Compile a HoloComposition into a self-contained TypeScript module string.
   *
   * P2 output: emits a `.mcp-server.ts` file that:
   * - Has NO external imports (passes `tsc --noEmit --strict` in any project)
   * - Exports `TOOLS` (MCP-SDK-compatible tool definitions)
   * - Exports `HoloMCPRuntimeAdapter` interface (one method per derived tool)
   * - Exports `registerAdapter(adapter)` to wire handlers to the dispatch table
   * - Exports `verifyContractWiring()` to assert all handlers are registered
   * - Exports `handleToolCall(name, params)` for MCP tool call delegation
   * - Exports `__holoMeta` with honest governance metadata
   *
   * The caller wires this module into their MCP server via `registerAdapter()`
   * and delegates `CallToolRequest` to `handleToolCall()`.
   *
   * @param composition - Parsed HoloScript composition AST
   * @param agentToken - Agent token for RBAC validation (JWT or UCAN)
   * @param outputPath - Optional output path for scope validation
   * @returns TypeScript source string (write to `<name>.mcp-server.ts`)
   */
  compileModule(composition: HoloComposition, agentToken: string, outputPath?: string): string {
    this.validateCompilerAccess(agentToken, outputPath);

    const serverName = this.options.serverName || 'holoscript-mcp-server';
    const tools = this._walkTraits(composition);

    // ── Inline type declarations (no external imports) ─────────────────────
    const header = [
      `// Generated by HoloMCPCompiler — do not hand-edit`,
      `// Server: ${serverName} | Version: ${this.options.serverVersion} | Phase: P5`,
      `// Governance: hashTier=fnv1a32, contractEnforcement=startup-gate (see design doc)`,
      ``,
      `/* eslint-disable */`,
      ``,
      `// ── Inline schema types (no external imports needed) ───────────────────────`,
      ``,
      `type _HoloJsonSchemaType = 'string' | 'number' | 'boolean' | 'array' | 'object' | 'null';`,
      ``,
      `interface _HoloSchemaProperty {`,
      `  type: _HoloJsonSchemaType;`,
      `  description: string;`,
      `  enum?: string[];`,
      `  items?: { type: _HoloJsonSchemaType };`,
      `}`,
      ``,
      `interface _HoloInputSchema {`,
      `  type: 'object';`,
      `  properties: Record<string, _HoloSchemaProperty>;`,
      `  required: string[];`,
      `}`,
      ``,
      `interface _HoloTool {`,
      `  name: string;`,
      `  description: string;`,
      `  inputSchema: _HoloInputSchema;`,
      `}`,
    ].join('\n');

    // ── Tool definitions ───────────────────────────────────────────────────
    const toolsSection = [
      ``,
      `// ── Tool definitions (derived from HoloScript trait walk) ──────────────────`,
      ``,
      emitToolsArray(tools),
    ].join('\n');

    // ── Parameter interfaces (one per tool) ────────────────────────────────
    const paramInterfaces = tools.length > 0
      ? [
          ``,
          `// ── Parameter interfaces (one per tool) ────────────────────────────────────`,
          ``,
          ...tools.map(emitParamInterface),
        ].join('\n')
      : '';

    // ── Runtime adapter interface ──────────────────────────────────────────
    const adapterMethods = tools.length > 0
      ? tools.map((t) => `  ${t.name}(params: ${paramInterfaceName(t.name)}): Promise<unknown>;`)
      : ['  // no tools derived from this composition'];

    const adapterSection = [
      ``,
      `// ── Runtime adapter — implement one method per tool ────────────────────────`,
      ``,
      `export interface HoloMCPRuntimeAdapter {`,
      ...adapterMethods,
      `}`,
    ].join('\n');

    // ── Dispatch table + wiring ────────────────────────────────────────────
    const dispatchEntries = tools.map((t) =>
      `  _dispatch.set(${JSON.stringify(t.name)}, (p) => adapter.${t.name}(p as unknown as ${paramInterfaceName(t.name)}));`
    );

    const dispatchSection = [
      ``,
      `// ── Dispatch table (P3: startup evaluator gate) ─────────────────────────────`,
      ``,
      `const _dispatch = new Map<string, (params: Record<string, unknown>) => Promise<unknown>>();`,
      `let _adapterRegistered = false;`,
      `let _contractVerified = false;`,
      ``,
      `/**`,
      ` * Wire your adapter implementation.`,
      ` * Must be called before verifyContractWiring() at server startup.`,
      ` * Re-calling resets the dispatch table and clears the verified flag.`,
      ` */`,
      `export function registerAdapter(adapter: HoloMCPRuntimeAdapter): void {`,
      `  _adapterRegistered = true;`,
      `  _contractVerified = false;`,
      `  _dispatch.clear();`,
      ...(dispatchEntries.length > 0 ? dispatchEntries : ['  // no tools to register']),
      `}`,
      ``,
      `/**`,
      ` * (P3 startup evaluator gate) Assert that registerAdapter() was called and`,
      ` * every tool has a registered handler. Call once at server startup — throws`,
      ` * immediately on any gap so wiring failures surface at boot, not on the`,
      ` * first live request. handleToolCall() refuses requests until this passes.`,
      ` */`,
      `export function verifyContractWiring(): void {`,
      `  if (!_adapterRegistered) {`,
      `    throw new Error(`,
      `      'HoloMCPCompiler: registerAdapter() was not called. Wire an adapter before verifyContractWiring().'`,
      `    );`,
      `  }`,
      `  const tools: _HoloTool[] = TOOLS;`,
      `  for (const tool of tools) {`,
      `    if (!_dispatch.has(tool.name)) {`,
      `      throw new Error(`,
      `        \`HoloMCPCompiler: tool '\${tool.name}' has no registered handler. Call registerAdapter() first.\``,
      `      );`,
      `    }`,
      `  }`,
      `  _contractVerified = true;`,
      `}`,
      ``,
      `/** Handle an MCP tool call — returns MCP-SDK-compatible content array. */`,
      `export async function handleToolCall(`,
      `  name: string,`,
      `  params: Record<string, unknown>`,
      `): Promise<{ content: Array<{ type: 'text'; text: string }> }> {`,
      `  if (!_contractVerified) {`,
      `    throw new Error(`,
      `      'HoloMCPCompiler: verifyContractWiring() must be called at startup before handleToolCall().'`,
      `    );`,
      `  }`,
      `  const handler = _dispatch.get(name);`,
      `  if (!handler) {`,
      `    throw new Error(\`HoloMCPCompiler: unknown tool '\${name}'\`);`,
      `  }`,
      `  const result = await handler(params);`,
      `  return { content: [{ type: 'text', text: JSON.stringify(result) }] };`,
      `}`,
    ].join('\n');

    // ── Governance metadata ────────────────────────────────────────────────
    const metaSection = [
      ``,
      `// ── Governance metadata ─────────────────────────────────────────────────────`,
      `// Honest per design doc audit (DomainSimulationReceipt.ts:5,134,183;`,
      `// PluginSolverContract.ts:422,461).`,
      `// P3: contractEnforcement='startup-gate' (wiring + verified flag enforced).`,
      `// SHA-256 hashTier upgrade lands in P5.`,
      ``,
      `export const __holoMeta = {`,
      `  hashTier: 'fnv1a32' as const,`,
      `  contractEnforcement: 'startup-gate' as const,`,
      `} as const;`,
    ].join('\n');

    return [header, toolsSection, paramInterfaces, adapterSection, dispatchSection, metaSection].join('\n');
  }
}
