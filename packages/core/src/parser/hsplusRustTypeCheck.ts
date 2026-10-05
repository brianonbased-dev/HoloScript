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
  /** Structs and names imported from files: they may be called. */
  names: string[];
  /**
   * Enums and modules: read through their members (`Route.A`, `GameState.addScore(p)`), never
   * called. A checker built before this field ignores it.
   */
  namespaces: string[];
  /**
   * Structs with their fields, so the checker resolves `record.field` through the record's struct
   * and holds a lifted function to the `@unknown` read rule exactly as a whole `.hs` file
   * (`HS-UNKNOWN-001` to `003`). A checker built before this field ignores it.
   */
  structs: HsContextStruct[];
  /**
   * Imports whose source has a scheme (`holo:absorb`): the checker resolves them against its
   * embedded Holo modules instead of taking the names on trust (G21). An older checker, which
   * does not read `imports`, refuses a call to them as an unknown function.
   */
  imports?: HsDocumentImport[];
}

/** An import the checker resolves itself. `line`, `column` and `form` stay on this side. */
export interface HsDocumentImport {
  source: string;
  specifiers: Array<{ imported: string; local: string; line?: number; column?: number }>;
  line?: number;
  column?: number;
  /** `named` is `{ a, b as c } from "..."`; no other form imports a Holo module. */
  form: 'named' | 'other';
}

/** One struct of the document, as the checker's `@unknown` read rule reads it. */
export interface HsContextStruct {
  name: string;
  fields: Array<{ name: string; type?: string; unknown?: true }>;
}

/** The fields of a `.hsplus` token that {@link collectHsDocumentContext} reads. */
export interface HsContextToken {
  type: string;
  value: string;
  line?: number;
  column?: number;
}

/** A source with a scheme of two or more characters (`holo:`, `https:`); `C:` is a drive. */
const SCHEME_SOURCE = /^[A-Za-z][A-Za-z0-9+.-]+:/;

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
function importedNames(
  list: ReadonlyArray<HsContextToken>,
  at: number,
  names: Set<string>,
  imports: HsDocumentImport[]
): void {
  let j = at + 1;
  const first = list[j];
  if (!first || first.type === 'LPAREN' || first.type === 'NEWLINE') return;
  const written = { line: list[at].line, column: list[at].column };
  if (first.type === 'LBRACE') {
    const specifiers: HsDocumentImport['specifiers'] = [];
    for (j += 1; j < list.length && list[j].type !== 'RBRACE'; j++) {
      const part = list[j];
      if (!isName(part) || part.value === 'as' || part.value === 'type') continue;
      const alias = list[j + 1]?.value === 'as' && isName(list[j + 2]) ? list[j + 2] : undefined;
      specifiers.push({
        imported: part.value,
        local: alias ? alias.value : part.value, // `a as b` binds `b`
        line: part.line,
        column: part.column,
      });
      if (alias) j += 2;
    }
    let k = j + 1;
    while (list[k]?.type === 'NEWLINE') k++;
    if (list[k]?.value === 'from') k++;
    while (list[k]?.type === 'NEWLINE') k++;
    const source = list[k]?.type === 'STRING' ? list[k].value : undefined;
    if (source !== undefined && SCHEME_SOURCE.test(source)) {
      imports.push({ source, specifiers, ...written, form: 'named' });
    } else {
      for (const specifier of specifiers) names.add(specifier.local);
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
  // `* as NS from "holo:x"` or `"holo:x"`: only named imports reach a Holo module.
  if (path !== undefined && SCHEME_SOURCE.test(path)) {
    imports.push({ source: path, specifiers: [], ...written, form: 'other' });
  }
}

/**
 * `[@unknown] name[?]:` at `list[at]`, the head of one struct field: its name, whether it is
 * marked `@unknown`, and where its type starts. A newline may sit between a modifier and the name,
 * as the struct reader allows.
 */
function structFieldHead(
  list: ReadonlyArray<HsContextToken>,
  at: number
): { name: string; unknown: boolean; typeStart: number } | undefined {
  let j = at;
  let unknown = false;
  while (list[j]?.type === 'AT' && isName(list[j + 1])) {
    if (list[j + 1].value === 'unknown') unknown = true;
    j += 2;
    while (list[j]?.type === 'NEWLINE') j++;
  }
  const name = list[j];
  if (!isName(name)) return undefined;
  j++;
  if (list[j]?.type === 'QUESTION') j++;
  if (list[j]?.type !== 'COLON') return undefined;
  return { name: name.value, unknown, typeStart: j + 1 };
}

/**
 * A field's type as the checker reads it. The `.hsplus` lexer drops a single `&`, so a lifetime or
 * `mut` at the start of the type is a reference whose `&` was dropped; it is written back. Any
 * other type is its token text, which the checker uses only to tell a struct name from the rest.
 */
function fieldTypeText(tokens: ReadonlyArray<HsContextToken>): string | undefined {
  let k = 0;
  const lifetime = tokens[k]?.type === 'LIFETIME' ? tokens[k++].value : undefined;
  const mutable = tokens[k]?.value === 'mut' && tokens.length > k + 1;
  if (mutable) k++;
  const rest = tokens
    .slice(k)
    .map((token) => token.value)
    .join(' ');
  if (rest.length === 0) return undefined;
  if (lifetime === undefined && !mutable) return rest;
  return `&${lifetime === undefined ? '' : `'${lifetime} `}${mutable ? 'mut ' : ''}${rest}`;
}

/**
 * The fields of the struct body that opens at `list[open]` (an `LBRACE`). Fields end at a comma,
 * a newline, the next field head (a `;` the lexer drops), or the closing brace; a default after
 * `=` is not part of the type. Returns `undefined` when the body does not close.
 */
function structFields(
  list: ReadonlyArray<HsContextToken>,
  open: number
): HsContextStruct['fields'] | undefined {
  const fields: HsContextStruct['fields'] = [];
  let current:
    { name: string; unknown: boolean; type: HsContextToken[]; initializer: boolean } | undefined;
  const finish = (): void => {
    if (!current) return;
    const type = fieldTypeText(current.type);
    fields.push({
      name: current.name,
      ...(type === undefined ? {} : { type }),
      ...(current.unknown ? { unknown: true as const } : {}),
    });
    current = undefined;
  };
  let depth = 0;
  // `<` nests only inside a type (`Map<string, i32>`); in a default it is a comparison.
  let angle = 0;
  for (let j = open + 1; j < list.length; j++) {
    const token = list[j];
    if (depth === 0 && token.type === 'RBRACE') {
      finish();
      return fields;
    }
    if (depth === 0 && angle === 0) {
      if (token.type === 'COMMA' || token.type === 'NEWLINE') {
        finish();
        continue;
      }
      const head = structFieldHead(list, j);
      if (head) {
        finish();
        current = { name: head.name, unknown: head.unknown, type: [], initializer: false };
        j = head.typeStart - 1;
        continue;
      }
      if (token.type === 'EQUALS' && current) {
        current.initializer = true;
        continue;
      }
    }
    if (token.type === 'LBRACE' || token.type === 'LBRACKET' || token.type === 'LPAREN') depth++;
    if (token.type === 'RBRACE' || token.type === 'RBRACKET' || token.type === 'RPAREN') depth--;
    if (current && !current.initializer) {
      if (token.type === 'LESS_THAN') angle++;
      if (token.type === 'GREATER_THAN' && angle > 0) angle--;
      current.type.push(token);
    }
  }
  return undefined;
}

/**
 * Collect the document's functions (with their parameter counts), structs (with their fields),
 * imported names, enums and modules from its tokens. Declarations anywhere in the document count,
 * nested ones included. A function is listed without an arity when its count is not plain (see
 * `parameterCount`) or it is declared twice with different counts; a struct declared twice with
 * different fields is left out of `structs`, so the checker reads its fields by name only.
 */
export function collectHsDocumentContext(tokens: ReadonlyArray<HsContextToken>): HsDocumentContext {
  const list = tokens.filter((token) => !SKIPPED.has(token.type));
  const arities = new Map<string, number | undefined>();
  const names = new Set<string>();
  const namespaces = new Set<string>();
  /** Struct name -> its fields, or `null` once two declarations disagree. */
  const structs = new Map<string, HsContextStruct['fields'] | null>();
  const imports: HsDocumentImport[] = [];
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
      const at = nextIndex(i);
      const nameToken = list[at];
      if (isName(nameToken)) {
        names.add(nameToken.value);
        // `struct Name {`, `struct Name(params) {`: the reader tolerates a parameter list.
        let brace = nextIndex(at);
        if (list[brace]?.type === 'LPAREN') {
          let open = 0;
          for (; brace < list.length; brace++) {
            if (list[brace].type === 'LPAREN') open++;
            if (list[brace].type === 'RPAREN' && --open === 0) break;
          }
          brace = nextIndex(brace);
        }
        const fields = list[brace]?.type === 'LBRACE' ? structFields(list, brace) : undefined;
        if (fields) {
          const earlier = structs.get(nameToken.value);
          structs.set(
            nameToken.value,
            earlier === undefined || JSON.stringify(earlier) === JSON.stringify(fields)
              ? fields
              : null
          );
        }
      }
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
      importedNames(list, i, names, imports);
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
    structs: [...structs]
      .filter((entry): entry is [string, HsContextStruct['fields']] => entry[1] !== null)
      .map(([name, fields]) => ({ name, fields })),
    ...(imports.length > 0 ? { imports } : {}),
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
 * Check a document's scheme imports once (G21), whether or not a typed function reaches the
 * checker. Each named import is validated on its own, so a refusal lands on the name it is
 * about; an unknown module is reported once at the import. A form other than `{ ... } from` is
 * refused here, since `.hs` has no other form for a Holo module. With a checker older than the
 * Holo modules, a `holo:` import validates and nothing is reported.
 */
export function checkHoloImports(context: HsDocumentContext): RustFunctionDiagnostic[] {
  const imports = context.imports ?? [];
  if (imports.length === 0) return [];
  const wasm = loadChecker();
  if (!wasm) {
    const detail = loadError ? `: ${loadError}` : '';
    return [
      {
        code: 'HS-CHECK',
        message: `The Rust type checker could not be loaded${detail}`,
        line: imports[0].line ?? 1,
        column: imports[0].column ?? 1,
      },
    ];
  }
  const diagnostics: RustFunctionDiagnostic[] = [];
  for (const entry of imports) {
    const at = { line: entry.line ?? 1, column: entry.column ?? 1 };
    if (entry.form !== 'named') {
      diagnostics.push({
        code: 'HS-HOST-001',
        message: `[HS-HOST-001] \`${entry.source}\` is imported by name only: write \`@import { name } from "${entry.source}"\`, so the file lists every capability it uses`,
        ...at,
      });
      continue;
    }
    for (const specifier of entry.specifiers) {
      const alias = specifier.local !== specifier.imported ? ` as ${specifier.local}` : '';
      const probe = `import { ${specifier.imported}${alias} } from ${JSON.stringify(entry.source)}\n`;
      let parsed: ValidateJson;
      try {
        parsed = JSON.parse(wasm.validate_detailed(probe)) as ValidateJson;
      } catch {
        diagnostics.push({
          code: 'HS-CHECK',
          message: 'The Rust type checker returned a result that was not JSON',
          ...at,
        });
        break;
      }
      if (parsed.valid === true) continue;
      const message = parsed.errors?.[0]?.message ?? 'The Rust checker refused this import';
      const code = codeOf(message);
      const onName = code === 'HS-HOST-002' && specifier.line !== undefined;
      diagnostics.push({
        code,
        message,
        line: onName ? (specifier.line as number) : at.line,
        column: onName ? (specifier.column ?? at.column) : at.column,
      });
      // The module itself is refused: one message for it, not one per name.
      if (code !== 'HS-HOST-002') break;
    }
  }
  return diagnostics;
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
