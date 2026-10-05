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
  /** Structs and imported names: they may be called. */
  names: string[];
  /**
   * Enums and modules: read through their members (`Route.A`, `GameState.addScore(p)`), never
   * called. A checker built before this field ignores it.
   */
  namespaces: string[];
}

/** The fields of a `.hsplus` token that {@link collectHsDocumentContext} reads. */
export interface HsContextToken {
  type: string;
  value: string;
}

/** The closer each opener waits for. `<` counts only while its `>` comes before the next closer. */
const CLOSER_OF: Record<string, string> = {
  LPAREN: 'RPAREN',
  LBRACKET: 'RBRACKET',
  LBRACE: 'RBRACE',
  LESS_THAN: 'GREATER_THAN',
};
const SKIPPED = new Set(['COMMENT', 'INDENT', 'DEDENT']);
const WORD = /^[A-Za-z_][A-Za-z0-9_]*$/;
const NOT_NAME_TYPES = new Set(['STRING', 'NUMBER', 'TEMPLATE_STRING']);
/** Literal words to both readers. `none` is not one: the Rust reader takes it as a name. */
const LITERAL_WORDS = new Set(['true', 'false', 'null']);

/**
 * A word the Rust reader takes as a name. The `.hsplus` lexer gives some words their own token
 * type (`state`, `transition`, `match`, `assert`, `none`, ...); they are still names to the
 * checker.
 */
function isName(token: HsContextToken | undefined): token is HsContextToken {
  return (
    !!token &&
    !NOT_NAME_TYPES.has(token.type) &&
    !LITERAL_WORDS.has(token.value) &&
    WORD.test(token.value)
  );
}

/**
 * Parameter count of the list that opens at `list[open]` (an `LPAREN`), or `undefined` when it is
 * not a plain count: a parameter has a default, an optional mark or a spread, or the list does
 * not close cleanly. Counts top-level commas, so a parameter the lexer reads oddly (a keyword
 * name, a dropped `&`) still counts once.
 */
function parameterCount(list: ReadonlyArray<HsContextToken>, open: number): number | undefined {
  const waiting: string[] = [];
  let commas = 0;
  let sawParameter = false;
  let endsWithComma = false;
  let exact = true;
  for (let j = open + 1; j < list.length; j++) {
    const part = list[j];
    if (part.type === 'NEWLINE') continue;
    const closer = CLOSER_OF[part.type];
    if (closer) {
      waiting.push(closer);
      sawParameter = true;
      endsWithComma = false;
      continue;
    }
    if (part.type === 'GREATER_THAN') {
      // Closes a generic `<`; with no `<` waiting it is a comparison.
      if (waiting[waiting.length - 1] === 'GREATER_THAN') waiting.pop();
      continue;
    }
    if (part.type === 'RPAREN' || part.type === 'RBRACKET' || part.type === 'RBRACE') {
      // A `<` still waiting at a closer was a comparison, not a generic.
      while (waiting[waiting.length - 1] === 'GREATER_THAN') waiting.pop();
      if (waiting.length === 0) {
        if (part.type !== 'RPAREN') return undefined;
        if (!exact) return undefined;
        return sawParameter ? commas + (endsWithComma ? 0 : 1) : 0;
      }
      if (waiting[waiting.length - 1] !== part.type) return undefined;
      waiting.pop();
      continue;
    }
    if (waiting.length === 0 && part.type === 'COMMA') {
      commas++;
      endsWithComma = true;
      continue;
    }
    sawParameter = true;
    endsWithComma = false;
    if (
      waiting.length === 0 &&
      (part.type === 'EQUALS' || part.type === 'QUESTION' || part.type === 'SPREAD')
    ) {
      exact = false;
    }
  }
  return undefined;
}

/**
 * Names an import binds, in the forms the `.hsplus` reader accepts after `@import` or `import`:
 * `{ A, B as C } from "p"` binds `A` and `C`; `* as NS from "p"` binds `NS`; `"p" as X` binds
 * `X`; `"p"` alone binds the file's name without its extension; `X from "p"` binds `X`.
 * `@import(...)` is a directive with parameters and binds nothing.
 */
function importedNames(list: ReadonlyArray<HsContextToken>, at: number, names: Set<string>): void {
  let j = at + 1;
  const first = list[j];
  if (!first || first.type === 'LPAREN' || first.type === 'NEWLINE') return;
  if (first.type === 'LBRACE') {
    for (j += 1; j < list.length && list[j].type !== 'RBRACE'; j++) {
      const part = list[j];
      if (!isName(part) || part.value === 'as' || part.value === 'type') continue;
      if (list[j + 1]?.value === 'as') continue; // `a as b` binds `b`
      names.add(part.value);
    }
    return;
  }
  let alias: string | undefined;
  let leading: string | undefined;
  let path: string | undefined;
  for (; j < list.length && list[j].type !== 'NEWLINE'; j++) {
    const part = list[j];
    if (part.type === 'STRING') {
      path = part.value;
      continue;
    }
    if (!isName(part)) continue;
    if (part.value === 'as') {
      if (isName(list[j + 1])) alias = list[++j].value;
      continue;
    }
    if (part.value !== 'from' && leading === undefined && path === undefined) leading = part.value;
  }
  const fromPath = path
    ?.split('/')
    .pop()
    ?.replace(/\.[^.]+$/, '');
  const bound = alias ?? leading ?? fromPath;
  if (bound) names.add(bound);
}

/**
 * Collect the document's functions (with their parameter counts), structs, imported names, enums
 * and modules from its tokens. Declarations anywhere in the document count, nested ones included.
 * A function is listed without an arity when its count is not plain (see `parameterCount`) or it
 * is declared twice with different counts.
 */
export function collectHsDocumentContext(tokens: ReadonlyArray<HsContextToken>): HsDocumentContext {
  const list = tokens.filter((token) => !SKIPPED.has(token.type));
  const arities = new Map<string, number | undefined>();
  const names = new Set<string>();
  const namespaces = new Set<string>();
  const nextIndex = (index: number): number => {
    let j = index + 1;
    while (list[j]?.type === 'NEWLINE') j++;
    return j;
  };

  for (let i = 0; i < list.length; i++) {
    const token = list[i];
    if (!isName(token)) continue;
    let before = i - 1;
    while (before >= 0 && list[before].type === 'NEWLINE') before--;
    const previous = list[before];
    // `x.function` is a member, not a declaration; after `@` only `@import` declares.
    if (previous && (previous.type === 'DOT' || previous.type === 'OPTIONAL_DOT')) continue;
    if (previous?.type === 'AT' && token.value !== 'import') continue;

    if (token.value === 'struct') {
      const nameToken = list[nextIndex(i)];
      if (isName(nameToken)) names.add(nameToken.value);
      continue;
    }
    if (token.value === 'enum' || token.value === 'module') {
      // `module` declares only as `module Name {`; elsewhere it is an ordinary word.
      const at = nextIndex(i);
      const nameToken = list[at];
      if (isName(nameToken) && (token.value === 'enum' || list[nextIndex(at)]?.type === 'LBRACE')) {
        namespaces.add(nameToken.value);
      }
      continue;
    }
    if (token.value === 'import') {
      importedNames(list, i, names);
      continue;
    }
    if (token.value !== 'function') continue;

    let j = nextIndex(i);
    const nameToken = list[j];
    if (!nameToken || !(nameToken.type === 'STRING' || isName(nameToken))) continue;
    j = nextIndex(j);
    if (
      list[j]?.type === 'LESS_THAN' &&
      list[nextIndex(j)]?.type === 'LIFETIME' &&
      list[nextIndex(nextIndex(j))]?.type === 'GREATER_THAN'
    ) {
      j = nextIndex(nextIndex(nextIndex(j)));
    }
    if (list[j]?.type !== 'LPAREN') continue;

    const name = nameToken.value;
    const arity = parameterCount(list, j);
    arities.set(name, arities.has(name) && arities.get(name) !== arity ? undefined : arity);
  }

  return {
    functions: [...arities].map(([name, arity]) =>
      arity === undefined ? { name } : { name, arity }
    ),
    names: [...names],
    namespaces: [...namespaces],
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
