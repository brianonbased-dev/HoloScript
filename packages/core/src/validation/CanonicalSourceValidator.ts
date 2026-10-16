import { HoloCompositionParser } from '../parser/HoloCompositionParser';
import {
  HoloScriptPlusParser,
  preprocessAgentBrainSource,
  type AgentBrainSourceHeader,
} from '../parser/HoloScriptPlusParser';
import { checkLikeness, LIKENESS_CODE, type ConsentRules } from './LikenessCheck';
import { findUnknownTraits, isKnownTrait, UNKNOWN_TRAIT_CODE } from './KnownTraits';

export type CanonicalSourceSurface = 'holo' | 'hsplus' | 'hs';

/**
 * Which authority produced the verdict. `empty-source-check` means the source
 * was empty or whitespace-only and was refused before any parser ran, so no
 * parser (and no Rust/WASM build) can be credited with the answer.
 */
export type CanonicalValidator =
  'holo-parser' | 'typescript-hsplus' | 'rust-wasm' | 'empty-source-check';

/** Error code for a source that is empty or contains only whitespace. */
const EMPTY_SOURCE_CODE = 'HS1001';
const EMPTY_SOURCE_MESSAGE = 'Source is empty. A HoloScript file needs at least one item.';

export interface CanonicalDiagnostic {
  severity: 'error' | 'warning';
  message: string;
  line?: number;
  column?: number;
  code?: string;
  suggestion?: string;
}

export interface CanonicalSourceValidationRequest {
  source: string;
  /**
   * A path, URI, or bare filename ending in `.holo`, `.hsplus`, or `.hs`.
   * Ignored when `surface` is explicit.
   */
  fileName?: string;
  surface?: CanonicalSourceSurface | `.${CanonicalSourceSurface}`;
  /**
   * Accept a source that is empty or whitespace-only. Default `false`.
   *
   * Editors pass `true`, so a brand-new file that has nothing in it yet shows
   * no error while the author starts typing. The CLI (`holoscript validate`),
   * the MCP `validate_holoscript` tool and CI leave it unset: there an empty
   * file is a failed write or an empty generation, and calling it valid would
   * report success for nothing. Unset, empty source is refused with `HS1001`
   * on every surface, before any parser or Rust/WASM authority runs.
   */
  allowEmpty?: boolean;
  /**
   * The caller's `.hs` `render_likeness` result: for each grant, the likeness sources (face,
   * voice, body) the rule said yes to. `.holo` only. Unset or empty, every likeness source
   * (`@face_mesh`, `@voice_print`, `@body_scan`) is refused with `HS1011`: fail closed.
   * See `LikenessCheck.ts` and strict/ERROR_CONTRACT.md.
   */
  consentRules?: ConsentRules | null;
  /**
   * Extra trait names known to this caller (a plugin's or host's vocabulary), for the HS1006
   * unknown-trait check. See `KnownTraits.ts`.
   */
  knownTraits?: Iterable<string>;
}

export type CanonicalHsDetailedValidator = (source: string) => string | unknown;

export interface CanonicalSourceValidationDependencies {
  /**
   * The canonical Rust/WASM `validate_detailed` export.
   *
   * It is injected so `@holoscript/core` does not acquire a dependency cycle
   * on `@holoscript/wasm`. Consumers validating `.hs` must provide it; the
   * adapter fails closed when they do not.
   */
  validateHsDetailed?: CanonicalHsDetailedValidator;
}

export interface CanonicalSourceValidationResult {
  valid: boolean;
  surface: CanonicalSourceSurface;
  validator: CanonicalValidator;
  errors: CanonicalDiagnostic[];
  warnings: CanonicalDiagnostic[];
  ast?: unknown;
  preprocessedAgentBrain?: boolean;
  agentBrainHeader?: AgentBrainSourceHeader;
}

interface UnknownRecord {
  [key: string]: unknown;
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function positiveNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function normalizeDiagnostic(
  value: unknown,
  severity: CanonicalDiagnostic['severity']
): CanonicalDiagnostic {
  if (typeof value === 'string') {
    return { severity, message: value };
  }

  if (!isRecord(value)) {
    return { severity, message: 'Unknown validation diagnostic' };
  }

  const location = isRecord(value.loc) ? value.loc : undefined;
  const message =
    optionalString(value.message) ?? optionalString(value.error) ?? 'Unknown validation diagnostic';

  return {
    severity,
    message,
    line: positiveNumber(value.line) ?? positiveNumber(location?.line),
    column: positiveNumber(value.column) ?? positiveNumber(location?.column),
    code: optionalString(value.code),
    suggestion: optionalString(value.suggestion),
  };
}

function normalizeDiagnosticList(
  value: unknown,
  severity: CanonicalDiagnostic['severity']
): CanonicalDiagnostic[] {
  return Array.isArray(value)
    ? value.map((diagnostic) => normalizeDiagnostic(diagnostic, severity))
    : [];
}

function remapAgentBrainDiagnostic(
  diagnostic: CanonicalDiagnostic,
  locationMap: Array<{ authoredLine: number; columnOffset: number }>
): CanonicalDiagnostic {
  if (diagnostic.line === undefined) return diagnostic;
  const mapped = locationMap[diagnostic.line - 1];
  if (!mapped) return diagnostic;
  return {
    ...diagnostic,
    line: mapped.authoredLine,
    column:
      diagnostic.column === undefined
        ? undefined
        : Math.max(1, diagnostic.column - mapped.columnOffset),
  };
}

function normalizeSurface(surface: string): CanonicalSourceSurface | undefined {
  const normalized = surface.trim().toLowerCase().replace(/^\./, '');
  if (normalized === 'holo' || normalized === 'hsplus' || normalized === 'hs') {
    return normalized;
  }
  return undefined;
}

/**
 * Resolve the language surface from an explicit value or a filename/URI.
 * `.hsplus` is checked before `.hs` to keep the routing unambiguous.
 */
export function resolveCanonicalSourceSurface(
  request: Pick<CanonicalSourceValidationRequest, 'fileName' | 'surface'>
): CanonicalSourceSurface {
  if (request.surface) {
    const explicit = normalizeSurface(request.surface);
    if (explicit) return explicit;
  }

  const fileName = request.fileName?.toLowerCase();
  if (fileName && /\.hsplus(?:$|[?#])/.test(fileName)) return 'hsplus';
  if (fileName && /\.holo(?:$|[?#])/.test(fileName)) return 'holo';
  if (fileName && /\.hs(?:$|[?#])/.test(fileName)) return 'hs';

  const target = request.surface ?? request.fileName ?? '<missing filename>';
  throw new Error(
    `Cannot resolve canonical HoloScript surface from "${target}". Expected .holo, .hsplus, or .hs.`
  );
}

/**
 * Where the k-th written `@name` (outside comments) is in `source`, else the owner's `loc`.
 * Trait nodes carry no position of their own; every layer places the k-th use of X at the k-th `@X`.
 */
function traitPosition(
  source: string,
  name: string,
  k: number,
  owner: unknown
): { line?: number; column?: number } {
  const re = new RegExp(`@${name.toLowerCase().replace(/[^a-z0-9_]/g, '')}(?![A-Za-z0-9_])`, 'gi');
  const inComment = (index: number) => {
    const lineStart = source.lastIndexOf('\n', index - 1) + 1;
    if (source.slice(lineStart, index).includes('//')) return true;
    return source.lastIndexOf('/*', index) > source.lastIndexOf('*/', index);
  };
  let match: RegExpExecArray | null = null;
  for (let i = 0; i <= k; ) {
    match = re.exec(source);
    if (!match) break;
    if (!inComment(match.index)) i++;
  }
  if (match) {
    const before = source.slice(0, match.index).split(/\r\n|\n|\r/);
    return { line: before.length, column: before[before.length - 1].length + 1 };
  }
  const start = (owner as { loc?: { start?: { line?: number; column?: number } } })?.loc?.start;
  return { line: start?.line, column: start?.column };
}

/**
 * HS1006 (warning, never an error here): each trait use that is not a known trait
 * (KnownTraits.ts, the one check every surface uses), at the k-th written `@name`.
 */
function unknownTraitDiagnostics(
  source: string,
  ast: unknown,
  knownTraits: Iterable<string> | undefined
): CanonicalDiagnostic[] {
  const used = new Map<string, number>();
  return findUnknownTraits(ast, { knownTraits }).map((use) => {
    const key = use.name.toLowerCase();
    const k = used.get(key) ?? 0;
    used.set(key, k + 1);
    const where = traitPosition(source, use.name, k, use.owner);
    return {
      severity: 'warning' as const,
      code: UNKNOWN_TRAIT_CODE,
      message: `Unknown trait "@${use.name}".`,
      line: where.line,
      column: where.column,
      suggestion: 'Check the trait registry, or register it before use.',
    };
  });
}

/**
 * `.hsplus`: HS1006 is authoritative over the parser's HSP001 "Unknown directive @x", and each
 * `@` is reported once. An HSP001 whose name is known (core's set, a name the source declares
 * with `trait X { ... }` / `trait @X { ... }`, or the caller's) is dropped. One that HS1006
 * already reports on the same line is dropped. One the AST does not carry (the parser warned,
 * then recovered without keeping the trait) becomes the HS1006 for that `@`, at the written `@x`.
 */
function reconcileHsp001(
  source: string,
  warnings: CanonicalDiagnostic[],
  unknown: CanonicalDiagnostic[],
  known: string[]
): { warnings: CanonicalDiagnostic[]; unknown: CanonicalDiagnostic[] } {
  const nameIn = (d: CanonicalDiagnostic) => d.message.match(/"@([^"]+)"/)?.[1]?.toLowerCase();
  const reported = new Set(unknown.map((d) => `${d.line}|${nameIn(d)}`));
  const lines = source.split(/\r\n|\n|\r/);
  const kept: CanonicalDiagnostic[] = [];
  const added: CanonicalDiagnostic[] = [];
  for (const d of warnings) {
    const m = /Unknown directive @([A-Za-z0-9_]+)/.exec(d.message);
    if (!m) {
      kept.push(d);
      continue;
    }
    const name = m[1];
    if (name.toLowerCase() === 'trait' || isKnownTrait(name, { knownTraits: known })) continue;
    const key = `${d.line}|${name.toLowerCase()}`;
    if (reported.has(key)) continue;
    reported.add(key);
    const text = d.line !== undefined ? lines[d.line - 1] : undefined;
    const at = text ? new RegExp(`@${name}(?![A-Za-z0-9_])`).exec(text) : null;
    added.push({
      severity: 'warning',
      code: UNKNOWN_TRAIT_CODE,
      message: `Unknown trait "@${name}".`,
      line: d.line,
      column: at ? at.index + 1 : d.column,
      suggestion: 'Check the trait registry, or register it before use.',
    });
  }
  return { warnings: kept, unknown: [...unknown, ...added] };
}

/** Names a `.hsplus` source declares itself: `trait X { ... }` or `trait @X { ... }`. */
function hsplusDeclaredTraits(source: string): string[] {
  return [...source.matchAll(/(?:^|[^\w@])trait\s+@?([A-Za-z_]\w*)\s*\{/g)].map((m) => m[1]);
}

/** HS1011 diagnostics, each at the k-th written `@name` of its trait, else at its object. */
function likenessDiagnostics(
  source: string,
  ast: unknown,
  consentRules: ConsentRules | null | undefined
): CanonicalDiagnostic[] {
  const findings = checkLikeness(ast, consentRules);
  const used = new Map<string, number>();
  return findings.map((finding) => {
    const key = finding.traitName.toLowerCase();
    const k = used.get(key) ?? 0;
    used.set(key, k + 1);
    const { line, column } = traitPosition(source, key, k, finding.owner);
    return {
      severity: 'error' as const,
      code: LIKENESS_CODE,
      message: finding.message,
      line,
      column,
      suggestion: finding.hint,
    };
  });
}

function validateHolo(
  source: string,
  allowEmpty = false,
  consentRules?: ConsentRules | null,
  knownTraits?: Iterable<string>
): CanonicalSourceValidationResult {
  try {
    const result = new HoloCompositionParser().parse(source);
    // The parser refuses blank source with HS1001. An editor that passed allowEmpty keeps the
    // empty composition as valid, as before.
    if (allowEmpty) {
      result.errors = result.errors.filter((error) => error.code !== 'HS1001');
      if (result.ast && result.errors.length === 0) result.success = true;
    }
    const errors = [
      ...normalizeDiagnosticList(result.errors, 'error'),
      ...likenessDiagnostics(source, result.ast, consentRules),
    ];
    const warnings = [
      ...normalizeDiagnosticList(result.warnings, 'warning'),
      ...unknownTraitDiagnostics(source, result.ast, knownTraits),
    ];
    return {
      valid: result.success === true && errors.length === 0,
      surface: 'holo',
      validator: 'holo-parser',
      errors,
      warnings,
      ast: result.ast,
    };
  } catch (error) {
    return {
      valid: false,
      surface: 'holo',
      validator: 'holo-parser',
      errors: [
        {
          severity: 'error',
          code: 'HOLO-PARSER-THREW',
          message: error instanceof Error ? error.message : String(error),
        },
      ],
      warnings: [],
    };
  }
}

function validateHsplus(
  source: string,
  knownTraits?: Iterable<string>
): CanonicalSourceValidationResult {
  let parserSource = source;
  let agentBrainHeader: AgentBrainSourceHeader | undefined;
  let agentBrainLocationMap: Array<{ authoredLine: number; columnOffset: number }> | undefined;
  const preprocessedAgentBrain = /^\s*#brain\s+/m.test(source);

  try {
    if (preprocessedAgentBrain) {
      const prepared = preprocessAgentBrainSource(source);
      parserSource = prepared.source;
      agentBrainHeader = prepared.header;
      agentBrainLocationMap = prepared.locationMap;
    }

    const result = new HoloScriptPlusParser({ strict: preprocessedAgentBrain }).parse(parserSource);
    let errors = normalizeDiagnosticList(result.errors, 'error');
    const known = [...(knownTraits ?? []), ...hsplusDeclaredTraits(parserSource)];
    const reconciled = reconcileHsp001(
      parserSource,
      normalizeDiagnosticList(result.warnings, 'warning'),
      unknownTraitDiagnostics(parserSource, result.ast, known),
      known
    );
    let warnings = [...reconciled.warnings, ...reconciled.unknown];
    if (agentBrainLocationMap) {
      const locationMap = agentBrainLocationMap;
      errors = errors.map((diagnostic) => remapAgentBrainDiagnostic(diagnostic, locationMap));
      warnings = warnings.map((diagnostic) => remapAgentBrainDiagnostic(diagnostic, locationMap));
    }
    return {
      valid: result.success === true && errors.length === 0,
      surface: 'hsplus',
      validator: 'typescript-hsplus',
      errors,
      warnings,
      ast: result.ast,
      preprocessedAgentBrain,
      agentBrainHeader,
    };
  } catch (error) {
    return {
      valid: false,
      surface: 'hsplus',
      validator: 'typescript-hsplus',
      errors: [
        {
          severity: 'error',
          code: preprocessedAgentBrain ? 'HSPLUS-BRAIN-PREPROCESS' : 'HSPLUS-PARSER-THREW',
          message: error instanceof Error ? error.message : String(error),
        },
      ],
      warnings: [],
      preprocessedAgentBrain,
      agentBrainHeader,
    };
  }
}

function validateHs(
  source: string,
  validateHsDetailed: CanonicalSourceValidationDependencies['validateHsDetailed']
): CanonicalSourceValidationResult {
  if (!validateHsDetailed) {
    return {
      valid: false,
      surface: 'hs',
      validator: 'rust-wasm',
      errors: [
        {
          severity: 'error',
          code: 'HS-VALIDATOR-UNAVAILABLE',
          message: 'Canonical .hs validation requires the Rust/WASM validate_detailed authority.',
        },
      ],
      warnings: [],
    };
  }

  try {
    const rawResult = validateHsDetailed(source);
    const parsed = typeof rawResult === 'string' ? (JSON.parse(rawResult) as unknown) : rawResult;

    if (!isRecord(parsed) || typeof parsed.valid !== 'boolean') {
      throw new Error('Rust/WASM validate_detailed returned an invalid result contract');
    }

    const errors = normalizeDiagnosticList(parsed.errors, 'error');
    const warnings = normalizeDiagnosticList(parsed.warnings, 'warning');
    if (parsed.valid === false && errors.length === 0) {
      errors.push({
        severity: 'error',
        code: 'HS-VALIDATOR-REJECTED',
        message: 'Rust/WASM rejected the .hs source without a diagnostic.',
      });
    }

    return {
      valid: parsed.valid === true && errors.length === 0,
      surface: 'hs',
      validator: 'rust-wasm',
      errors,
      warnings,
    };
  } catch (error) {
    return {
      valid: false,
      surface: 'hs',
      validator: 'rust-wasm',
      errors: [
        {
          severity: 'error',
          code: 'HS-VALIDATOR-CONTRACT',
          message: error instanceof Error ? error.message : String(error),
        },
      ],
      warnings: [],
    };
  }
}

function refuseEmptySource(surface: CanonicalSourceSurface): CanonicalSourceValidationResult {
  return {
    valid: false,
    surface,
    validator: 'empty-source-check',
    errors: [
      {
        severity: 'error',
        code: EMPTY_SOURCE_CODE,
        message: EMPTY_SOURCE_MESSAGE,
        line: 1,
        column: 1,
      },
    ],
    warnings: [],
  };
}

/**
 * Validate one HoloScript source with the authority assigned to its extension:
 *
 * - `.holo` -> `HoloCompositionParser`
 * - `.hsplus` -> `HoloScriptPlusParser` (with explicit `#brain` preprocessing)
 * - `.hs` -> Rust/WASM `validate_detailed`
 *
 * Empty or whitespace-only source is refused with `HS1001` on every surface
 * before routing, unless the caller passes `allowEmpty: true` (editors do).
 * Comment-only source is not caught here; it routes to the parser, which refuses it on the
 * `.holo` surface with the same HS1001 (also waived by `allowEmpty: true`).
 */
export function validateCanonicalSource(
  request: CanonicalSourceValidationRequest,
  dependencies: CanonicalSourceValidationDependencies = {}
): CanonicalSourceValidationResult {
  const surface = resolveCanonicalSourceSurface(request);
  if (
    request.allowEmpty !== true &&
    typeof request.source === 'string' &&
    request.source.trim() === ''
  ) {
    return refuseEmptySource(surface);
  }
  if (surface === 'holo')
    return validateHolo(
      request.source,
      request.allowEmpty === true,
      request.consentRules,
      request.knownTraits
    );
  if (surface === 'hsplus') return validateHsplus(request.source, request.knownTraits);
  return validateHs(request.source, dependencies.validateHsDetailed);
}
