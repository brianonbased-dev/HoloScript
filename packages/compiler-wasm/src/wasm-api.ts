import { createRequire } from 'node:module';

/**
 * TypeScript API types and wrapper for the HoloScript WASM compiler.
 *
 * **Scope**: this module wraps the `.hs` *subset* parser (see `lib.rs` for the
 * full scope note).  It covers `composition`, `world`, `orb`, `entity`,
 * `template`, `group`, `environment`, `logic`, `npc`, `quest`, `ability`,
 * `dialogue`, `state_machine`, `achievement`, `talent_tree`, `import`, `export`,
 * `function`, `move`, `action`, and `on_*` event blocks.
 *
 * `WasmParserBridge` is the migration boundary: it loads the real Rust
 * `pkg-node` / browser WASM artifact first, then falls back to
 * `HoloScriptPlusParser` while `.hsplus` construct coverage converges.
 * Direct consumers that require today's complete TS behavior can still use
 * `HoloScriptPlusParser` or `HoloCompositionParser` explicitly until they move
 * behind the binding interface.
 *
 * Mirrors the Rust wasm_bindgen exports from lib.rs:
 *   - parse(source) -> JSON AST string
 *   - parse_pretty(source) -> pretty-printed JSON AST string
 *   - validate(source) -> boolean
 *   - validate_detailed(source) -> JSON validation result string
 *   - compile_to_uaal(source) -> JSON UAAL bytecode packet or JSON error object
 *   - version() -> semver string
 *
 * APL WIT trait-evaluation surface (lifted 2026-05-22):
 *   - trait_exists(name) -> boolean
 *   - get_trait_info(name) -> TraitInfoResult | undefined
 *   - list_traits(target) -> string[]
 *   - generate_trait_code(name, target, config) -> string[]
 *   - validate_with_traits(source) -> ValidationResultWithTraits
 *
 * These mirror the WIT `validator` + `platform-compiler` interfaces,
 * backed by TraitRegistryBridge which queries AndroidXRTraitMap,
 * VisionOSTraitMap, VRTraitRegistry, and the traitDocs catalog.
 */

// ── AST Types (mirror ast.rs serde output) ──────────────────────────

export interface Position {
  line: number;
  column: number;
  offset: number;
}

export interface Location {
  start: Position;
  end: Position;
}

export interface PropertyNode {
  type: 'Property';
  key: string;
  value: AstNode;
  /**
   * `true` when the field carried the `Type?` presence marker: the value MAY BE ABSENT.
   * Omitted from the JSON when false.
   */
  optional?: boolean;
  /**
   * Field-level `@name` annotations, e.g. `@unknown`. Omitted when empty.
   *
   * `@unknown` and `?` are different axes: `?` means the value may not BE THERE (absence),
   * `@unknown` means the value exists but may not be KNOWN — an epistemic state carrying a
   * typed reason. A field marked `@unknown` lowers to `Uncertain<T>` (@holoscript/meaning);
   * a `?` field lowers to ordinary optionality.
   */
  annotations?: string[];
  /**
   * Declared field default from `name: Type = expr` (captured since stage 4; previously parsed
   * and dropped). For an @unknown field a declared default is a fallback BY CONSTRUCTION — the
   * compile-time guard admits bare reads — but the value remains epistemically unknown.
   */
  default_value?: AstNode;
  loc?: Location;
}

export interface TraitNode {
  type: 'Trait';
  name: string;
  config?: AstNode;
  loc?: Location;
}

export interface OrbNode {
  type: 'Orb';
  name: string;
  traits: TraitNode[];
  properties: PropertyNode[];
  children: AstNode[];
  loc?: Location;
}

export interface CompositionNode {
  type: 'Composition';
  name: string;
  traits: TraitNode[];
  properties: PropertyNode[];
  children: AstNode[];
  loc?: Location;
}

export interface GroupNode {
  type: 'Group';
  name: string;
  traits: TraitNode[];
  properties: PropertyNode[];
  children: AstNode[];
  loc?: Location;
}

/**
 * Timeline construct: `timeline <name> { ...properties, children }`.
 * Mirrors `GroupNode` — a named temporal container whose `properties` carry
 * sequencing parameters (duration, autoplay, loop, stagger) and whose
 * `children` are the sequenced statements.
 */
export interface TimelineNode {
  type: 'Timeline';
  name: string;
  traits: TraitNode[];
  properties: PropertyNode[];
  children: AstNode[];
  loc?: Location;
}

/**
 * Keyframe-track inside a `timeline`: `track "<target>" { key … ; key … }`.
 * Mirrors `TrackNode` in ast.rs. `target` is the animated prop name
 * (e.g. `"scaleUniform"`); `keyframes` are the ordered key entries.
 * Harvested from Theatre.js's per-prop Sequence channel; the track is DATA
 * the sequencer runtime consumes, not a class.
 */
export interface TrackNode {
  type: 'Track';
  target: string;
  keyframes: KeyframeNode[];
  loc?: Location;
}

/**
 * A single keyframe inside a `track`: `key <time> { <value> } [easing <ease>]`.
 * Mirrors `KeyframeNode` in ast.rs. `time` is the position along the timeline;
 * `value` is the target value expression in the `{…}` block; `easing` is the
 * optional per-segment timing function (reuses the shipped spring/bounce/easeX
 * easing names). Note: `KeyframeNode` is a sub-struct of `TrackNode`, not an
 * `AstNode` enum variant, so it has no `type` discriminant.
 */
export interface KeyframeNode {
  time: number;
  value: AstNode;
  easing?: string;
  loc?: Location;
}

export interface EnvironmentNode {
  type: 'Environment';
  properties: PropertyNode[];
  children: AstNode[];
  loc?: Location;
}

export interface StringLiteral {
  type: 'String';
  value: string;
  loc?: Location;
}

export interface NumberLiteral {
  type: 'Number';
  value: number;
  raw: string;
  loc?: Location;
}

export interface BooleanLiteral {
  type: 'Boolean';
  value: boolean;
  loc?: Location;
}

export interface ArrayNode {
  type: 'Array';
  elements: AstNode[];
  loc?: Location;
}

export interface IdentifierNode {
  type: 'Identifier';
  name: string;
  loc?: Location;
}

export interface LambdaExpressionNode {
  type: 'LambdaExpression';
  params: string[];
  body: AstNode;
  loc?: Location;
}

// ── Behavioral construct nodes (mirror ast.rs serde tags) ─────────────

/**
 * Movement statement: `move <target> to <dest> [over <n>] [via <mode>] [easing <ease>]`.
 * `destination` serializes as a bare `[x, y, z]` triple (position) or a string
 * (entity id) — the Rust `MovementDestination` enum is `#[serde(untagged)]`.
 */
export interface MovementStatementNode {
  type: 'MovementStatement';
  target: string;
  destination: [number, number, number] | string;
  duration?: number;
  mode?: string;
  easing?: string;
  loc?: Location;
}

/** A single requirement/effect clause inside an `action` block. */
export interface ActionClause {
  kind: string;
  body: string;
}

/** Action declaration: `action <name>(params) { @requires {…} effect {…} … }`. */
export interface ActionDeclNode {
  type: 'ActionDecl';
  name: string;
  params: string[];
  clauses: ActionClause[];
  flags: string[];
  loc?: Location;
}

/** Generalized reaction / event block: `on_grab { … }`, `on_death { … }`, etc. */
export interface GameEventBlockNode {
  type: 'GameEventBlock';
  name: string;
  params: string[];
  /**
   * Raw space-joined token lexemes — authoritative and deliberately tolerant of any in-body
   * form. LOSSY: string quotes are stripped, escapes decoded, and `??` flattens to `? ?`.
   * Never re-lex this to recover meaning; use `parsedBody`.
   */
  body: string;
  /**
   * Best-effort parsed form of the same body, produced from the token stream. Absent when the
   * speculative parse declined — which means UNANALYZED, not empty. An empty `{}` is `[]`.
   */
  parsed_body?: AstNode[];
  category?: string;
  loc?: Location;
}

export type AstNode =
  | OrbNode
  | CompositionNode
  | GroupNode
  | TimelineNode
  | TrackNode
  | EnvironmentNode
  | PropertyNode
  | TraitNode
  | StringLiteral
  | NumberLiteral
  | BooleanLiteral
  | ArrayNode
  | IdentifierNode
  | LambdaExpressionNode
  | MovementStatementNode
  | ActionDeclNode
  | GameEventBlockNode
  | { type: string; [key: string]: unknown };

export interface Ast {
  type: 'Program';
  body: AstNode[];
  directives: unknown[];
}

// ── Error Types ─────────────────────────────────────────────────────

export interface ParseError {
  message: string;
  line: number;
  column: number;
}

export interface ParseErrorResult {
  errors: ParseError[];
}

export interface ValidationResult {
  valid: boolean;
  errors: ParseError[];
}

export type UAALWasmOperand =
  | string
  | number
  | boolean
  | Record<string, unknown>
  | UAALWasmOperand[]
  | null;

export interface UAALWasmInstruction {
  opCode: number;
  operands?: UAALWasmOperand[];
}

export interface UAALWasmBytecode {
  version: number;
  instructions: UAALWasmInstruction[];
}

export interface CompileErrorResult {
  error: string;
}

// ── APL WIT Trait-Evaluation Types ────────────────────────────────────

/**
 * Trait query target — mirrors the WIT `platform-compiler` interface targets.
 *
 * Each target maps to a concrete trait registry on the TypeScript side:
 *   - 'android-xr' -> AndroidXRTraitMap
 *   - 'visionos' -> VisionOSTraitMap
 *   - 'webgpu' -> (future: WebGPUCompiler trait map)
 *   - 'threejs' -> (future: ThreeJSCompiler trait map)
 *   - 'core' -> VRTraitRegistry + traitDocs catalog
 */
export type TraitTarget = 'android-xr' | 'visionos' | 'webgpu' | 'threejs' | 'core';

/**
 * Result from the WIT `get-trait` interface.
 *
 * Mirrors the TraitInfo from TraitRegistryBridge but uses plain
 * JSON-serialisable types for WASM boundary compatibility.
 */
export interface TraitInfoResult {
  /** Trait name as queried */
  name: string;
  /** Whether the trait exists in any registry */
  exists: boolean;
  /** Implementation level: 'full' | 'partial' | 'comment' | 'unsupported' | 'core' */
  level?: string;
  /** Generated code lines for the target (only when includeCodegen=true) */
  codegen?: string[];
  /** Which registry resolved this trait */
  sourceMap?: string;
  /** Human-readable description from traitDocs catalog */
  description?: string;
  /** Category from traitDocs catalog */
  category?: string;
  /** The annotation form (e.g. '@physics') from traitDocs catalog */
  annotation?: string;
}

/**
 * Extended validation result that includes trait existence checks.
 *
 * The WIT `validator` interface's `validate-with-options` function
 * enriches basic syntax validation with trait-existence verification,
 * so lightweight WASM worlds can validate trait references without
 * pulling the full runtime.
 */
export interface ValidationResultWithTraits extends ValidationResult {
  /** Traits found in the source that are unknown to any registry */
  unknownTraits: string[];
  /** Traits found in the source that are known */
  knownTraits: string[];
  /** Per-trait info for all traits found in the source */
  traitInfo: TraitInfoResult[];
}

// ── WASM Module Interface ───────────────────────────────────────────

/**
 * The public API exported by the WASM module via wasm_bindgen.
 * Each function corresponds to a #[wasm_bindgen] export in lib.rs.
 */
export interface HoloScriptWasmModule {
  /** Parse HoloScript source and return AST as JSON string */
  parse(source: string): string;
  /** Parse HoloScript source and return pretty-printed AST as JSON string */
  parse_pretty(source: string): string;
  /** Validate HoloScript source, returns true if valid */
  validate(source: string): boolean;
  /** Get detailed validation results as JSON string */
  validate_detailed(source: string): string;
  /** Compile `.hs` function declarations to a UAAL bytecode packet as JSON */
  compile_to_uaal(source: string): string;
  /** Get the WASM compiler version */
  version(): string;
}

// ── Wrapper ─────────────────────────────────────────────────────────

/**
 * High-level wrapper around the raw WASM module that provides
 * typed return values instead of raw JSON strings.
 *
 * Also provides APL WIT trait-evaluation surface methods backed by
 * TraitRegistryBridge (TypeScript-side, no Rust WASM dependency).
 * These mirror the WIT `validator` + `platform-compiler` interfaces
 * and can be used in lightweight WASM worlds for trait validation
 * without pulling the full runtime.
 */
export class HoloScriptWasm {
  constructor(private readonly wasm: HoloScriptWasmModule) {}

  /**
   * Parse HoloScript source code into a typed AST.
   * @throws Error if parsing fails with syntax errors
   */
  parse(source: string): Ast {
    const json = this.wasm.parse(source);
    const result: Ast | ParseErrorResult = JSON.parse(json);
    if ('errors' in result) {
      const errors = (result as ParseErrorResult).errors;
      throw new HoloScriptParseError(
        `Parse failed with ${errors.length} error(s): ${errors[0]?.message ?? 'unknown'}`,
        errors
      );
    }
    return result as Ast;
  }

  /**
   * Parse and return pretty-printed JSON string.
   */
  parsePretty(source: string): string {
    return this.wasm.parse_pretty(source);
  }

  /**
   * Quick validation check.
   */
  validate(source: string): boolean {
    return this.wasm.validate(source);
  }

  /**
   * Detailed validation with error locations.
   */
  validateDetailed(source: string): ValidationResult {
    const json = this.wasm.validate_detailed(source);
    return JSON.parse(json) as ValidationResult;
  }

  /**
   * Compile top-level `.hs` functions to a typed UAAL bytecode packet.
   * @throws HoloScriptCompileError if Rust returns a JSON error object
   */
  compileToUaal(source: string): UAALWasmBytecode {
    const json = this.wasm.compile_to_uaal(source);
    const result = JSON.parse(json) as UAALWasmBytecode | CompileErrorResult;
    if ('error' in result) {
      throw new HoloScriptCompileError(result.error);
    }
    return result;
  }

  /**
   * Get the WASM compiler version.
   */
  version(): string {
    return this.wasm.version();
  }

  // ── APL WIT Trait-Evaluation Surface ──────────────────────────────────
  //
  // These methods delegate to TraitRegistryBridge, which queries
  // AndroidXRTraitMap, VisionOSTraitMap, VRTraitRegistry, and the
  // traitDocs catalog. They do NOT depend on the Rust WASM module —
  // they work in pure TypeScript/JS environments where the WASM
  // parser is available but the full runtime is not.

  /** WIT `trait-exists` — check if a trait is registered anywhere */
  traitExists(name: string): boolean {
    return traitExistsImpl(name);
  }

  /** WIT `get-trait` — get trait info from any registry */
  getTraitInfo(name: string): TraitInfoResult | undefined {
    return getTraitInfoImpl(name);
  }

  /** WIT `list-traits` — list known traits for a target platform */
  listTraits(target: TraitTarget = 'core'): string[] {
    return listTraitsImpl(target);
  }

  /** WIT `generate-trait-code-for-target` — produce code for a trait on a target */
  generateTraitCode(
    name: string,
    target: TraitTarget,
    config: Record<string, unknown> = {}
  ): string[] {
    return generateTraitCodeImpl(name, target, config);
  }

  /**
   * WIT `validate-with-options` — validate source AND check trait references.
   *
   * This is the primary entry point for the lightweight `holoscript-parser`
   * WASM world: it runs syntax validation via the Rust parser, then
   * enriches the result with trait-existence checks from the TS-side
   * registries.
   */
  validateWithTraits(source: string, target: TraitTarget = 'core'): ValidationResultWithTraits {
    const base = this.validateDetailed(source);
    const traits = extractTraitNames(source);
    const knownTraits: string[] = [];
    const unknownTraits: string[] = [];
    const traitInfo: TraitInfoResult[] = [];

    for (const name of traits) {
      const info = getTraitInfoImpl(name, { target });
      if (info.exists) {
        knownTraits.push(name);
      } else {
        unknownTraits.push(name);
      }
      traitInfo.push(info);
    }

    return {
      ...base,
      unknownTraits,
      knownTraits,
      traitInfo,
    };
  }
}

/**
 * Error class for parse failures with structured error info.
 */
export class HoloScriptParseError extends Error {
  constructor(
    message: string,
    public readonly errors: ParseError[]
  ) {
    super(message);
    this.name = 'HoloScriptParseError';
  }
}

// ── Trait Registry Bridge Delegation ──────────────────────────────────
//
// These functions delegate to the TraitRegistryBridge in @holoscript/core.
// They are imported lazily to avoid pulling the full runtime when only
// the WASM parser is needed. In environments where @holoscript/core is
// not available (pure WASM without TS runtime), the bridge falls back
// to a conservative "exists everywhere" mode.
//
// The import is conditional so this file can be consumed in two ways:
//   1. Full mode: @holoscript/core is available -> real registry queries
//   2. WASM-only mode: no @holoscript/core -> conservative fallback

/**
 * Error class for compile target failures surfaced by Rust emitters.
 */
export class HoloScriptCompileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HoloScriptCompileError';
  }
}

interface TraitRegistryBridge {
  traitExists(name: string): boolean;
  queryTrait(name: string, opts?: { target?: string }): TraitInfoResult;
  listTraitsForTarget(target: string): string[];
  generateTraitForTarget(
    name: string,
    target: string,
    config?: Record<string, unknown>
  ): string[];
}

const requireBridge = createRequire(import.meta.url);
let _bridge: Partial<TraitRegistryBridge> | null = null;
let _bridgeLoadAttempted = false;

function getBridge(): Partial<TraitRegistryBridge> | null {
  if (_bridge) return _bridge;
  if (_bridgeLoadAttempted) return null;
  _bridgeLoadAttempted = true;
  try {
    // Dynamic require for Node/bundler environments;
    // in pure WASM contexts this will fail and we fall back gracefully.
    _bridge = requireBridge('@holoscript/core/compiler') as Partial<TraitRegistryBridge>;
    return _bridge;
  } catch {
    return null;
  }
}

/**
 * Trait name extraction from HoloScript source.
 *
 * Finds all @trait annotations in source text using a lightweight regex.
 * This is used by validateWithTraits to check trait references without
 * a full parse. The Rust WASM parser validates syntax; this extracts
 * the trait names for registry lookup.
 */
export function extractTraitNames(source: string): string[] {
  const names: string[] = [];
  const seen = new Set<string>();
  // Match @trait_name annotations at the start of a word boundary
  const re = /@([a-zA-Z_][a-zA-Z0-9_-]*)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(source)) !== null) {
    const name = match[1];
    if (!seen.has(name)) {
      seen.add(name);
      names.push(name);
    }
  }
  return names;
}

function traitExistsImpl(name: string): boolean {
  const bridge = getBridge();
  if (bridge?.traitExists) {
    return bridge.traitExists(name);
  }
  // Fallback: without the core bridge, conservatively return true
  // for well-known HoloScript traits that are extremely likely to exist.
  // This prevents false negatives in lightweight WASM worlds.
  return true;
}

function getTraitInfoImpl(name: string, opts?: { target?: TraitTarget }): TraitInfoResult {
  const bridge = getBridge();
  if (bridge?.queryTrait) {
    const target = opts?.target ?? 'core';
    const info = bridge.queryTrait(name, { target });
    return {
      name: info.name,
      exists: info.exists,
      level: info.level,
      codegen: info.codegen,
      sourceMap: info.sourceMap,
      description: info.description,
      category: info.category,
      annotation: info.annotation,
    };
  }
  // Fallback: no bridge available
  return { name, exists: true, sourceMap: 'fallback (no registry)' };
}

function listTraitsImpl(target: TraitTarget): string[] {
  const bridge = getBridge();
  if (bridge?.listTraitsForTarget) {
    return bridge.listTraitsForTarget(target);
  }
  return [];
}

function generateTraitCodeImpl(
  name: string,
  target: TraitTarget,
  config: Record<string, unknown>
): string[] {
  const bridge = getBridge();
  if (bridge?.generateTraitForTarget) {
    return bridge.generateTraitForTarget(name, target, config);
  }
  return [`// @${name} — codegen unavailable (no registry loaded for target "${target}")`];
}
