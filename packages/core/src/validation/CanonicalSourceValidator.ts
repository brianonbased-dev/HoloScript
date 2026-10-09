import { HoloCompositionParser } from '../parser/HoloCompositionParser';
import {
  HoloScriptPlusParser,
  preprocessAgentBrainSource,
  type AgentBrainSourceHeader,
} from '../parser/HoloScriptPlusParser';

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

function validateHolo(source: string): CanonicalSourceValidationResult {
  try {
    const result = new HoloCompositionParser().parse(source);
    const errors = normalizeDiagnosticList(result.errors, 'error');
    const warnings = normalizeDiagnosticList(result.warnings, 'warning');
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

function validateHsplus(source: string): CanonicalSourceValidationResult {
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
    let warnings = normalizeDiagnosticList(result.warnings, 'warning');
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
 * Comment-only source is not caught here; it still routes to the parser.
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
  if (surface === 'holo') return validateHolo(request.source);
  if (surface === 'hsplus') return validateHsplus(request.source);
  return validateHs(request.source, dependencies.validateHsDetailed);
}
