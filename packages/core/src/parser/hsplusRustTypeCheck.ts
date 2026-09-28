/**
 * Lazy call into the Rust `.hs` checker (`validate_detailed` → `check_semantics`
 * → `semantic_types.rs`). The TypeScript reader does not implement type rules.
 *
 * The WASM package is loaded on the first typed function only. An untyped
 * function never reaches this module's loader.
 */

import { createRequire } from 'node:module';

export interface RustFunctionDiagnostic {
  /** The `HS-*` code when the Rust checker emitted one (`HS-TYPE-RETURN-001`, `HS-NAME-001`, ...). */
  code: string;
  /** The Rust diagnostic sentence, unchanged. */
  message: string;
  line: number;
  column: number;
}

interface WasmValidate {
  validate_detailed(source: string): string;
  /** Present from the build that added names, calls and returns (G11). */
  validate_detailed_in_context?: (source: string, contextJson: string) => string;
}

/**
 * What the document around a typed function declares. The Rust checker sees one function at a
 * time, so without this a call to a sibling function would read as an unknown function.
 */
export interface HsDocumentContext {
  /** Every `function` in the document. `arity` is left out when it is not a plain count. */
  functions: Array<{ name: string; arity?: number }>;
  /** Structs, enums and imported names. */
  names: string[];
}

/** The fields of a `.hsplus` token that {@link collectHsDocumentContext} reads. */
export interface HsContextToken {
  type: string;
  value: string;
}

const OPENERS = new Set(['LPAREN', 'LBRACKET', 'LBRACE', 'LESS_THAN']);
const CLOSERS = new Set(['RPAREN', 'RBRACKET', 'RBRACE', 'GREATER_THAN']);
const SKIPPED = new Set(['NEWLINE', 'COMMENT', 'INDENT', 'DEDENT']);

/**
 * Collect the document's functions (with their parameter counts), structs, enums and imported
 * names from its tokens. Declarations anywhere in the document count, nested ones included.
 * A function whose parameters have a default, an optional mark or a spread, or whose name is
 * declared twice with different counts, is listed without an arity.
 */
export function collectHsDocumentContext(tokens: ReadonlyArray<HsContextToken>): HsDocumentContext {
  const list = tokens.filter((token) => !SKIPPED.has(token.type));
  const arities = new Map<string, number | undefined>();
  const names = new Set<string>();

  for (let i = 0; i < list.length; i++) {
    const token = list[i];
    if (token.type !== 'IDENTIFIER') continue;

    if (
      (token.value === 'struct' || token.value === 'enum') &&
      list[i + 1]?.type === 'IDENTIFIER'
    ) {
      names.add(list[i + 1].value);
      continue;
    }

    if (token.value === 'import') {
      for (let j = i + 1; j < list.length && j < i + 256; j++) {
        const part = list[j];
        if (part.type === 'STRING' || (part.type === 'IDENTIFIER' && part.value === 'from')) break;
        if (part.type !== 'IDENTIFIER' || part.value === 'as' || part.value === 'type') continue;
        // `a as b` binds `b`.
        if (list[j + 1]?.type === 'IDENTIFIER' && list[j + 1].value === 'as') continue;
        names.add(part.value);
      }
      continue;
    }

    if (token.value !== 'function') continue;
    const nameToken = list[i + 1];
    if (!nameToken || (nameToken.type !== 'IDENTIFIER' && nameToken.type !== 'STRING')) continue;
    let j = i + 2;
    if (
      list[j]?.type === 'LESS_THAN' &&
      list[j + 1]?.type === 'LIFETIME' &&
      list[j + 2]?.type === 'GREATER_THAN'
    ) {
      j += 3;
    }
    if (list[j]?.type !== 'LPAREN') continue;

    let depth = 0;
    let count = 0;
    let expectParameter = true;
    let exact = true;
    let closed = false;
    for (j += 1; j < list.length; j++) {
      const part = list[j];
      if (OPENERS.has(part.type)) {
        depth++;
      } else if (CLOSERS.has(part.type)) {
        if (depth === 0) {
          closed = part.type === 'RPAREN';
          break;
        }
        depth--;
      } else if (depth === 0) {
        if (part.type === 'COMMA') {
          expectParameter = true;
        } else {
          if (part.type === 'EQUALS' || part.type === 'QUESTION' || part.type === 'SPREAD') {
            exact = false;
          }
          if (expectParameter && part.type === 'IDENTIFIER') {
            count++;
            expectParameter = false;
          }
        }
      }
    }
    if (!closed) continue;

    const name = nameToken.value;
    const arity = exact ? count : undefined;
    arities.set(name, arities.has(name) && arities.get(name) !== arity ? undefined : arity);
  }

  return {
    functions: [...arities].map(([name, arity]) =>
      arity === undefined ? { name } : { name, arity }
    ),
    names: [...names],
  };
}

interface ValidateJson {
  valid?: boolean;
  errors?: Array<{ message?: string; line?: number; column?: number }>;
}

let checker: WasmValidate | null = null;
let attempted = false;
let loadError: string | null = null;

export function hsplusRustCheckerLoaded(): boolean {
  return checker !== null;
}

/** Test hook. Does not unload a WASM module Node has already cached. */
export function resetHsplusRustCheckerForTests(): void {
  checker = null;
  attempted = false;
  loadError = null;
}

/**
 * Package export for the node build of `@holoscript/wasm` (`pkg-node`).
 * Joined at runtime so a bundler does not try to resolve the glue while
 * compiling a consumer that has not installed the package yet.
 */
const WASM_NODE_SPECIFIER = ['@holoscript', 'wasm', 'node'].join('/');

function loadChecker(): WasmValidate | null {
  if (attempted) return checker;
  attempted = true;
  try {
    // Resolution starts at this module. From source that is
    // packages/core/src/parser. From the tsup bundle it is packages/core/dist.
    // From an installed package it is node_modules/@holoscript/core/dist.
    // Walking relative to the file only reaches compiler-wasm inside the
    // monorepo source tree. require.resolve of the package export works in
    // all three places, because @holoscript/core depends on @holoscript/wasm
    // and that package publishes pkg-node behind the "./node" export.
    const require = createRequire(import.meta.url);
    const resolved = require.resolve(WASM_NODE_SPECIFIER);
    const loaded = require(resolved) as {
      validate_detailed?: unknown;
      validate_detailed_in_context?: unknown;
    };
    if (typeof loaded.validate_detailed === 'function') {
      checker = {
        validate_detailed: loaded.validate_detailed.bind(
          loaded
        ) as WasmValidate['validate_detailed'],
      };
      if (typeof loaded.validate_detailed_in_context === 'function') {
        checker.validate_detailed_in_context = loaded.validate_detailed_in_context.bind(
          loaded
        ) as NonNullable<WasmValidate['validate_detailed_in_context']>;
      }
      return checker;
    }
    loadError = 'validate_detailed is not exported';
  } catch (error) {
    loadError = error instanceof Error ? error.message : String(error);
  }
  return null;
}

function codeOf(message: string): string {
  const coded = message.match(/\[(HS-[A-Z0-9-]+)\]/);
  if (coded?.[1]) return coded[1];
  if (message.includes('HS010')) return 'HS010';
  return 'HS-CHECK';
}

/**
 * Run the Rust checker on one function that already has a type written on it.
 * `origin` is the `function` keyword in the `.hsplus` file. Lines inside the
 * slice are shifted back onto that file. `context` is what the rest of the
 * document declares (see {@link collectHsDocumentContext}); without it a call
 * to a sibling function is refused as unknown.
 */
export function checkTypedHsFunction(
  functionSource: string,
  origin: { line: number; column: number },
  context?: HsDocumentContext
): RustFunctionDiagnostic[] {
  const wasm = loadChecker();
  if (!wasm) {
    const detail = loadError ? `: ${loadError}` : '';
    return [
      {
        code: 'HS-CHECK',
        message: `The Rust type checker could not be loaded${detail}`,
        line: origin.line,
        column: origin.column,
      },
    ];
  }

  let parsed: ValidateJson;
  try {
    const raw =
      context && wasm.validate_detailed_in_context
        ? wasm.validate_detailed_in_context(functionSource, JSON.stringify(context))
        : wasm.validate_detailed(functionSource);
    parsed = JSON.parse(raw) as ValidateJson;
  } catch {
    return [
      {
        code: 'HS-CHECK',
        message: 'The Rust type checker returned a result that was not JSON',
        line: origin.line,
        column: origin.column,
      },
    ];
  }

  if (parsed.valid === true) return [];

  const errors = parsed.errors ?? [];
  if (errors.length === 0) {
    return [
      {
        code: 'HS-CHECK',
        message: 'The Rust type checker rejected this function',
        line: origin.line,
        column: origin.column,
      },
    ];
  }

  return errors.map((error) => {
    const message = error.message ?? 'The Rust type checker rejected this function';
    const rustLine = error.line && error.line > 0 ? error.line : 1;
    const rustColumn = error.column && error.column > 0 ? error.column : 1;
    return {
      code: codeOf(message),
      message,
      line: origin.line + rustLine - 1,
      column: rustLine === 1 ? origin.column + rustColumn - 1 : rustColumn,
    };
  });
}
