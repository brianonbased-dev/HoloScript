/**
 * HoloScript strict layer — the missing "no".
 *
 * The shipped parser never rejects: `{{{@@@`, a SQL statement and an empty
 * string all come back as a successful parse of an empty composition, and
 * `parseHoloStrict` goes further and invents trait nodes named "@" and "".
 * This module adds the rejection on top of the existing tokenizer and parser,
 * without touching the grammar, so it can land in the core as a wrapper today
 * and be absorbed into the parser later with the same codes and messages.
 *
 * Two modes, same checks, same diagnostics:
 *
 *   parseTolerant(src) -> { ok: true,  ast, diagnostics }   // editors, partial input
 *   parseStrict(src)   -> { ok: false, ast: null, diagnostics } on any error
 *
 * Strict refuses what is not HoloScript: empty, unbalanced, unparseable, or
 * parsed into nothing. An unknown trait (HS1006) is a warning in both modes,
 * as in core's own validators: the trait vocabulary is open (plugins add to
 * it), so it is not grounds to refuse a file. A caller that wants it to be
 * passes { unknownTraits: "error" } (see ERROR_CONTRACT.md).
 *
 * Every diagnostic carries { code, severity, message, line, column }, both
 * 1-based and pointing at a real place in the source. Codes are stable; see
 * ERROR_CONTRACT.md. This file uses no Node built-ins: the tokenizer, parser
 * and trait vocabulary are passed in as `deps` (index.mjs wires them from core).
 */

/** Delimiters that must balance, in any grammar. */
const OPENERS = { LBRACE: "RBRACE", LBRACKET: "RBRACKET", LPAREN: "RPAREN" };
const CLOSERS = { RBRACE: "LBRACE", RBRACKET: "LBRACKET", RPAREN: "LPAREN" };
const CLOSING_TEXT = { RBRACE: "}", RBRACKET: "]", RPAREN: ")" };

/**
 * Tokens that cannot begin a top-level item in any reading of the grammar.
 * Deliberately conservative: a token missing from this list is simply not
 * reported, so a grammar addition never turns a valid file into an error.
 * Closers are not listed because an unmatched closer is HS1002's job. `;` is
 * not listed because core accepts it as a statement terminator at top level
 * (`import "./x.holo";`, `} from '@scope/pkg';`).
 */
const NEVER_STARTS_A_TOP_LEVEL_ITEM = new Set([
  "COLON",
  "COMMA",
  "STAR",
  "SLASH",
  "PLUS",
  "EQUALS",
  "ARROW",
  "QUESTION",
]);

/**
 * HS1004 counts every field of the composition AST as content except these.
 * They are the fields of `HoloNode` (type, loc, provenance) that every node
 * carries, plus the composition's own `name` — see `HoloComposition extends
 * HoloNode` in packages/core/src/parser/HoloCompositionTypes.ts. Working from
 * the base type rather than a list of content fields means a construct added
 * to the grammar counts as content the day it lands.
 */
const BOOKKEEPING_KEYS = new Set(["type", "loc", "provenance", "name"]);

const WORD_START = /^[A-Za-z0-9_]/;
/** A whole name as written, read from a given offset (sticky). */
const WORD_AT = /[A-Za-z0-9_]+/y;

const diag = (code, severity, message, at, hint) => ({
  code,
  severity,
  message,
  line: at.line,
  column: at.column,
  ...(hint ? { hint } : {}),
});

/** File-level diagnostics (empty source, not a string, a crash) point at the start. */
const START = { line: 1, column: 1 };

/**
 * @param {string} source
 * @param {object} deps - { tokenizeHoloSource, parseHolo, traitIds?: Set<string> }
 *   `traitIds` is the trait vocabulary, in any of the spellings normalizeTrait
 *   accepts. When it is missing or empty, the unknown-trait check (HS1006) is
 *   skipped.
 * @param {{ knownTraits?: Iterable<string>, unknownTraits?: "warning" | "error" }} [options]
 *   `knownTraits` adds trait names for this call (plugin vocabularies).
 *   `unknownTraits: "error"` makes HS1006 an error (default: a warning).
 */
export function analyze(source, deps, options = {}) {
  const { tokenizeHoloSource, parseHolo, traitIds } = deps;
  const unknownTraitSeverity = options.unknownTraits === "error" ? "error" : "warning";
  const diagnostics = [];
  const seen = new Set();
  const push = (d) => {
    const key = `${d.code}|${d.line}|${d.column}|${d.message}`;
    if (seen.has(key)) return;
    seen.add(key);
    diagnostics.push(d);
  };

  if (typeof source !== "string") {
    push(diag("HS1009", "error", `Source must be a string, received ${typeof source}.`, START));
    return { ast: null, diagnostics };
  }

  let tokens = [];
  try {
    tokens = tokenizeHoloSource(source) || [];
  } catch (err) {
    push(diag("HS1010", "error", `The tokenizer failed: ${err && err.message}`, START));
    return { ast: null, diagnostics };
  }

  const anchors = anchorTokens(source, tokens);
  const at = (token) => anchors.of(token);

  const real = tokens.filter((t) => t.type !== "EOF" && t.type !== "COMMENT");
  const meaningful = real.filter((t) => t.type !== "NEWLINE");

  // HS1001 — nothing to parse.
  if (meaningful.length === 0) {
    push(diag("HS1001", "error", "Source is empty. A composition needs at least one item.", START));
    return { ast: null, diagnostics };
  }

  // HS1002 — delimiters must balance.
  const stack = [];
  for (const token of real) {
    if (OPENERS[token.type]) {
      stack.push(token);
    } else if (CLOSERS[token.type]) {
      const opened = stack.pop();
      if (!opened) {
        push(diag("HS1002", "error", `Closing "${token.value}" with nothing open.`, at(token)));
      }
    }
  }
  for (const opened of stack) {
    push(
      diag(
        "HS1002",
        "error",
        `"${opened.value}" is never closed.`,
        at(opened),
        `Add a matching "${CLOSING_TEXT[OPENERS[opened.type]]}".`
      )
    );
  }

  // HS1003 / HS1005 — tokens at depth 0 that cannot start anything.
  let depth = 0;
  for (let i = 0; i < real.length; i++) {
    const token = real[i];
    if (OPENERS[token.type]) {
      depth++;
      continue;
    }
    if (CLOSERS[token.type]) {
      depth = Math.max(0, depth - 1);
      continue;
    }
    if (depth !== 0) continue;
    if (NEVER_STARTS_A_TOP_LEVEL_ITEM.has(token.type)) {
      push(diag("HS1003", "error", `"${token.value}" cannot start a top-level item.`, at(token)));
    }
    // A trait marker must be followed by a name.
    if (token.type === "AT" && !isNameToken(real[i + 1])) {
      push(
        diag(
          "HS1005",
          "error",
          "\"@\" is not followed by a trait name.",
          at(token),
          "Write a trait as @name, for example @grabbable."
        )
      );
    }
  }

  // Run the parser itself and carry its findings through, with positions
  // mapped from the lexer's convention to real 1-based ones. Only the first
  // error on a token is kept (see the loop below).
  let parsed;
  try {
    parsed = parseHolo(source);
  } catch (err) {
    push(diag("HS1010", "error", `The parser threw: ${err && err.message}`, START));
    return { ast: null, diagnostics };
  }
  for (const err of parsed.errors || []) {
    const where = anchors.fromParser(err);
    // A token that already carries an error (from the checks above, such as an
    // unclosed "{" or a nameless "@", or from an earlier parser error) keeps
    // only that first one: later reports on the same token are knock-ons.
    if (diagnostics.some((d) => d.severity === "error" && d.line === where.line && d.column === where.column)) {
      continue;
    }
    // The parser names some findings with a contract code itself (HS1005 for a
    // nameless "@"); keep it. Everything else is carried as HS1007.
    const code = typeof err?.code === "string" && /^HS1\d{3}$/.test(err.code) ? err.code : "HS1007";
    push(diag(code, "error", messageOf(err), where));
  }
  for (const warn of parsed.warnings || []) {
    push(diag("HS1008", "warning", messageOf(warn), anchors.fromParser(warn)));
  }

  const ast = parsed.ast || null;

  // HS1004 — the source said something, the AST holds nothing.
  if (!hasContent(ast)) {
    push(
      diag(
        "HS1004",
        "error",
        "Nothing in this source parsed into a composition.",
        at(meaningful[0]),
        "This is what a non-HoloScript file looks like to the parser."
      )
    );
  }

  // HS1005 / HS1006 — trait names in the AST, located at their `@name` in the source.
  const traits = collectTraits(ast);
  const checkTraits = !!(traitIds && traitIds.size);
  const declared = checkTraits ? declaredTraits(ast, traits, options.knownTraits) : new Set();
  const locator = traitLocator(source, real, anchors);
  for (const { trait, owner } of traits) {
    const bare = String(trait.name ?? "").trim().replace(/^@/, "");
    if (!WORD_START.test(bare)) {
      const where = locator.unnamed()?.at ?? anchors.fromNode(owner) ?? at(meaningful[0]);
      // The depth-0 check above may already have reported this same "@".
      const already = diagnostics.some(
        (d) => d.code === "HS1005" && d.line === where.line && d.column === where.column
      );
      if (!already) push(diag("HS1005", "error", "A trait was parsed with an empty name.", where));
      continue;
    }
    if (!checkTraits || isKnownTrait(bare, traitIds) || declared.has(normalizeTrait(bare))) continue;
    const found = locator.named(bare);
    const written = found && found.word;
    const misread = written && written.toLowerCase() !== bare.toLowerCase();
    push(
      diag(
        "HS1006",
        unknownTraitSeverity,
        misread
          ? `The parser read "@${written}" as a trait named "@${bare}", which is not a known trait.`
          : `Unknown trait "@${bare}".`,
        (found && found.at) ?? anchors.fromNode(owner) ?? at(meaningful[0]),
        misread
          ? "This is a parser defect, not a fault in the source; it needs fixing in core."
          : "Check the trait registry, or register it before use."
      )
    );
  }

  return { ast, diagnostics };
}

/**
 * Trait names this source itself makes known, plus any the caller passes:
 *  - `@trait { name: "@x", ... }` declares x. `@trait` is the declaration
 *    form core reads trait definitions from (deriveTraitSchema in
 *    packages/core/src/compiler/identity), so `trait` itself is known too.
 *  - `trait X { ... }` declares X (the AST's traitDefinitions).
 *  - `knownTraits` from the caller: plugin vocabularies, the same seam as
 *    core's `HoloParserOptions.knownTraits`.
 */
function declaredTraits(ast, traits, knownTraits) {
  const names = new Set(["trait"]);
  for (const { trait } of traits) {
    const config = trait.config;
    if (String(trait.name).replace(/^@/, "").toLowerCase() === "trait" && config && typeof config.name === "string") {
      names.add(normalizeTrait(config.name));
    }
  }
  for (const definition of (ast && ast.traitDefinitions) || []) {
    if (definition && definition.name) names.add(normalizeTrait(definition.name));
  }
  for (const name of knownTraits || []) names.add(normalizeTrait(name));
  return names;
}

function messageOf(entry) {
  return typeof entry === "string" ? entry : (entry && entry.message) || String(entry);
}

/** A token that can be (the start of) a trait name: a word, a keyword, or a digit-led name. */
function isNameToken(token) {
  return !!token && token.type !== "STRING" && token.type !== "NEWLINE" && WORD_START.test(String(token.value));
}

/** True when any non-bookkeeping field of the composition holds something. */
function hasContent(ast) {
  if (!ast || typeof ast !== "object") return false;
  for (const [key, value] of Object.entries(ast)) {
    if (BOOKKEEPING_KEYS.has(key)) continue;
    if (value === null || value === undefined) continue;
    if (Array.isArray(value)) {
      if (value.length > 0) return true;
    } else if (typeof value === "object") {
      if (Object.keys(value).length > 0) return true;
    } else if (typeof value === "string") {
      if (value.length > 0) return true;
    } else {
      return true;
    }
  }
  return false;
}

/**
 * Normalize a trait name for comparison: @camelCase, kebab-case and
 * snake_case all compare as snake_case.
 */
export function normalizeTrait(name) {
  return String(name)
    .replace(/^@/, "")
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/-/g, "_")
    .toLowerCase();
}

const squash = (normalized) => normalized.replace(/_/g, "");
const vocabularies = new WeakMap();

/** Normalized lookup tables for a trait vocabulary, built once per Set. */
function vocabularyIndex(traitIds) {
  let index = vocabularies.get(traitIds);
  if (!index) {
    index = { normalized: new Set(), squashed: new Set() };
    for (const id of traitIds) {
      const normalized = normalizeTrait(id);
      index.normalized.add(normalized);
      index.squashed.add(squash(normalized));
    }
    vocabularies.set(traitIds, index);
  }
  return index;
}

function isKnownTrait(bare, traitIds) {
  const index = vocabularyIndex(traitIds);
  const normalized = normalizeTrait(bare);
  // Registry ids split acronyms (`AIDriver` -> `a_i_driver`), so also compare without separators.
  return index.normalized.has(normalized) || index.squashed.has(squash(normalized));
}

/** Every trait node in the AST, with the nearest ancestor that carries a `loc`. */
function collectTraits(node, found = [], owner = null) {
  if (!node || typeof node !== "object") return found;
  if (Array.isArray(node)) {
    for (const item of node) collectTraits(item, found, owner);
    return found;
  }
  if (node.type === "ObjectTrait" || node.type === "Trait") found.push({ trait: node, owner });
  const nextOwner = node.loc && node.loc.start ? node : owner;
  for (const value of Object.values(node)) {
    if (value && typeof value === "object") collectTraits(value, found, nextOwner);
  }
  return found;
}

/**
 * Finds the `@name` in the source for each trait the parser produced. The
 * k-th trait named X is placed at the k-th `@X` in the source; trait nodes
 * carry no position of their own. Returns { at, word } where `word` is the
 * name as written in the source.
 */
function traitLocator(source, real, anchors) {
  const named = new Map();
  const unnamed = [];
  for (let i = 0; i < real.length; i++) {
    if (real[i].type !== "AT") continue;
    const next = real[i + 1];
    const at = anchors.of(real[i]);
    if (isNameToken(next)) {
      const start = anchors.offsetOf(next);
      let word = String(next.value);
      if (start !== undefined) {
        WORD_AT.lastIndex = start;
        word = (WORD_AT.exec(source) || [word])[0];
      }
      const key = word.toLowerCase();
      if (!named.has(key)) named.set(key, { list: [], used: 0 });
      named.get(key).list.push({ at, word });
    } else {
      unnamed.push({ at, word: "" });
    }
  }
  let unnamedUsed = 0;
  const take = (entry) => entry.list[Math.min(entry.used++, entry.list.length - 1)];
  return {
    named(bare) {
      const key = bare.toLowerCase();
      if (named.has(key)) return take(named.get(key));
      // The parser's name and the written one can differ in length: it joins
      // some names from several tokens (`@ns.trait`) and, in places, keeps only
      // the first token of one (`@2d_canvas` read as `2`).
      for (const [word, entry] of named) {
        if (key.startsWith(word) || word.startsWith(key)) return take(entry);
      }
      return undefined;
    },
    unnamed() {
      if (unnamed.length === 0) return undefined;
      return unnamed[Math.min(unnamedUsed++, unnamed.length - 1)];
    },
  };
}

// ---------------------------------------------------------------------------
// Positions
//
// The lexer reports words, strings and numbers at their 1-based start column,
// but most symbols and newlines at that column minus their own length, so `{`
// in column 1 is reported as column 0. It also does not count newlines inside
// a string, so every line after a multi-line string is reported too early.
// Rather than correct each convention, each token is found in the source:
// starting where the previous token ended, skip what the lexer skips (spaces,
// tabs, comments, characters it ignores) and expect the token's own text.
// The offset found gives a real line and column.
// ---------------------------------------------------------------------------

const SYMBOL_START = new Set("{}[]():,.=+-*/<>!@#;?".split(""));

/** Length of `token`'s source text if it starts at offset `p`, else -1. */
function tokenLengthAt(source, p, token) {
  const ch = source[p];
  switch (token.type) {
    case "EOF":
      return p >= source.length ? 0 : -1;
    case "NEWLINE":
      if (ch === "\r") return source[p + 1] === "\n" ? 2 : 1;
      return ch === "\n" ? 1 : -1;
    case "STRING": {
      if (ch !== '"' && ch !== "'") return -1;
      let i = p + 1;
      while (i < source.length && source[i] !== ch) i += source[i] === "\\" ? 2 : 1;
      return Math.min(i + 1, source.length) - p;
    }
    default: {
      const text = String(token.value);
      if (text.length === 0) return -1;
      const raw = source.substr(p, text.length);
      if (raw === text) return text.length;
      if (token.type === "BOOLEAN" && raw.toLowerCase() === text) return text.length;
      return -1;
    }
  }
}

/** Would the lexer start a token at offset p? (If so, nothing may be skipped there.) */
function startsToken(source, p) {
  const ch = source[p];
  const next = source[p + 1];
  if (ch === "\n" || ch === "\r" || ch === '"' || ch === "'") return true;
  if (/[A-Za-z0-9_]/.test(ch)) return true;
  if (SYMBOL_START.has(ch)) return true;
  return (ch === "&" && next === "&") || (ch === "|" && next === "|");
}

function lineStarts(source) {
  const starts = [0];
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (c === "\n") starts.push(i + 1);
    else if (c === "\r") {
      if (source[i + 1] === "\n") i++;
      starts.push(i + 1);
    }
  }
  return starts;
}

function positionAt(starts, offset) {
  let lo = 0;
  let hi = starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (starts[mid] <= offset) lo = mid;
    else hi = mid - 1;
  }
  return { line: lo + 1, column: offset - starts[lo] + 1 };
}

/**
 * Locate every token in the source. Returns lookups from a token (or from a
 * position the parser reported, which is always some token's lexer position)
 * to a real 1-based line and column. `exact` is false if any token could not
 * be found where the lexer must have read it; those tokens fall back to the
 * lexer's own line and a column of at least 1.
 */
export function anchorTokens(source, tokens) {
  const starts = lineStarts(source);
  const byToken = new Map();
  const offsets = new Map();
  const byLexerPosition = new Map();
  let p = 0;
  let exact = true;
  for (const token of tokens) {
    if (token.type === "COMMENT") continue;
    let found = -1;
    let length = 0;
    if (exact) {
      while (p <= source.length) {
        if (source[p] === "/" && source[p + 1] === "/") {
          while (p < source.length && source[p] !== "\n") p++;
          continue;
        }
        if (source[p] === "/" && source[p + 1] === "*") {
          const end = source.indexOf("*/", p + 2);
          p = end === -1 ? source.length : end + 2;
          continue;
        }
        const len = tokenLengthAt(source, p, token);
        if (len >= 0) {
          found = p;
          length = len;
          break;
        }
        if (p >= source.length || startsToken(source, p)) break;
        p++; // space, tab, or a character the lexer ignores
      }
    }
    let pos;
    if (found >= 0) {
      pos = positionAt(starts, found);
      offsets.set(token, found);
      p = found + length;
    } else {
      exact = false;
      pos = { line: Math.max(1, token.line | 0), column: Math.max(1, token.column | 0) };
    }
    byToken.set(token, pos);
    const key = `${token.line}:${token.column}`;
    if (!byLexerPosition.has(key)) byLexerPosition.set(key, pos);
  }

  const clamp = (line, column) => ({ line: Math.max(1, line | 0), column: Math.max(1, column | 0) });
  const fromLexer = (loc) => {
    if (!loc || typeof loc.line !== "number") return undefined;
    return byLexerPosition.get(`${loc.line}:${loc.column}`) ?? clamp(loc.line, loc.column);
  };
  return {
    get exact() {
      return exact;
    },
    of: (token) => byToken.get(token) ?? clamp(token.line, token.column),
    offsetOf: (token) => offsets.get(token),
    /** Parser errors and warnings carry `loc: { line, column }` from the current token. */
    fromParser: (entry) => fromLexer((entry && entry.loc) || entry) ?? START,
    /** AST nodes carry `loc: { start, end }` from the token that opened them. */
    fromNode: (node) => (node && node.loc ? fromLexer(node.loc.start) : undefined),
  };
}

export function parseTolerant(source, deps, options = {}) {
  const { ast, diagnostics } = analyze(source, deps, options);
  return { ok: true, mode: "tolerant", ast, diagnostics };
}

export function parseStrict(source, deps, options = {}) {
  const { ast, diagnostics } = analyze(source, deps, options);
  const errors = diagnostics.filter((d) => d.severity === "error");
  return errors.length
    ? { ok: false, mode: "strict", ast: null, diagnostics }
    : { ok: true, mode: "strict", ast, diagnostics };
}
