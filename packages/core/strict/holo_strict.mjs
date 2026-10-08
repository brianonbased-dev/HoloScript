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
 * Two modes, both documented, both returning the same diagnostics:
 *
 *   parseTolerant(src) -> { ok: true,  ast, diagnostics }   // editors, partial input
 *   parseStrict(src)   -> { ok: false, ast: null, diagnostics } on any error
 *
 * Every diagnostic carries { code, severity, message, line, column }. Codes are
 * stable; see ERROR_CONTRACT.md. Nothing here depends on Node built-ins, so the
 * same file compiles into the WASM build the Python package calls.
 */

/** Delimiters that must balance, in any grammar. */
const OPENERS = { LBRACE: "RBRACE", LBRACKET: "RBRACKET", LPAREN: "RPAREN" };
const CLOSERS = { RBRACE: "LBRACE", RBRACKET: "LBRACKET", RPAREN: "LPAREN" };

/**
 * Tokens that cannot begin a top-level construct in any reading of the
 * grammar. Deliberately conservative: a token missing from this list is simply
 * not reported, so a grammar addition never turns a valid file into an error.
 */
const NEVER_STARTS_A_TOP_LEVEL_ITEM = new Set([
  "RBRACE",
  "RBRACKET",
  "RPAREN",
  "COLON",
  "COMMA",
  "SEMICOLON",
  "STAR",
  "SLASH",
  "PLUS",
  "EQUALS",
  "ARROW",
  "QUESTION",
  "PIPE",
  "AMPERSAND",
]);

/** AST arrays that count as "something was parsed". */
const CONTENT_KEYS = [
  "objects",
  "templates",
  "spatialGroups",
  "lights",
  "imports",
  "timelines",
  "audio",
  "zones",
  "transitions",
  "conditionals",
  "iterators",
  "npcs",
  "domainBlocks",
];

const diag = (code, severity, message, line, column, hint) => ({
  code,
  severity,
  message,
  line: line ?? 1,
  column: column ?? 1,
  ...(hint ? { hint } : {}),
});

/**
 * @param {string} source
 * @param {object} deps - { tokenizeHoloSource, parseHolo, traitIds?: Set<string> }
 */
export function analyze(source, deps) {
  const { tokenizeHoloSource, parseHolo, traitIds } = deps;
  const diagnostics = [];
  const text = typeof source === "string" ? source : "";

  if (typeof source !== "string") {
    diagnostics.push(
      diag("HS1009", "error", `Source must be a string, received ${typeof source}.`, 1, 1)
    );
    return { ast: null, diagnostics };
  }

  let tokens = [];
  try {
    tokens = tokenizeHoloSource(text) || [];
  } catch (err) {
    diagnostics.push(
      diag("HS1010", "error", `The tokenizer failed: ${err && err.message}`, 1, 1)
    );
    return { ast: null, diagnostics };
  }

  const real = tokens.filter((t) => t.type !== "EOF" && t.type !== "COMMENT");

  // HS1001 — nothing to parse.
  if (real.length === 0) {
    diagnostics.push(
      diag("HS1001", "error", "Source is empty. A composition needs at least one item.", 1, 1)
    );
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
        diagnostics.push(
          diag(
            "HS1002",
            "error",
            `Closing "${token.value}" with nothing open.`,
            token.line,
            token.column
          )
        );
      }
    }
  }
  for (const opened of stack) {
    diagnostics.push(
      diag(
        "HS1002",
        "error",
        `"${opened.value}" is never closed.`,
        opened.line,
        opened.column,
        `Add a matching "${OPENERS[opened.type] === "RBRACE" ? "}" : OPENERS[opened.type] === "RBRACKET" ? "]" : ")"}".`
      )
    );
  }

  // HS1003 — a token at depth 0 that cannot start anything.
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
      diagnostics.push(
        diag(
          "HS1003",
          "error",
          `"${token.value}" cannot start a top-level item.`,
          token.line,
          token.column
        )
      );
    }
    // A trait marker must be followed by a name.
    if (token.type === "AT") {
      const next = real[i + 1];
      if (!next || next.type !== "IDENTIFIER") {
        diagnostics.push(
          diag(
            "HS1005",
            "error",
            "\"@\" is not followed by a trait name.",
            token.line,
            token.column,
            "Write a trait as @name, for example @grabbable."
          )
        );
      }
    }
  }

  // Run the parser itself and carry its own findings through unchanged.
  let parsed;
  try {
    parsed = parseHolo(text);
  } catch (err) {
    diagnostics.push(
      diag("HS1010", "error", `The parser threw: ${err && err.message}`, 1, 1)
    );
    return { ast: null, diagnostics };
  }
  for (const err of parsed.errors || []) {
    diagnostics.push(
      diag(
        "HS1007",
        "error",
        typeof err === "string" ? err : err.message || String(err),
        err && err.line,
        err && err.column
      )
    );
  }
  for (const warn of parsed.warnings || []) {
    diagnostics.push(
      diag(
        "HS1008",
        "warning",
        typeof warn === "string" ? warn : warn.message || String(warn),
        warn && warn.line,
        warn && warn.column
      )
    );
  }

  const ast = parsed.ast || null;

  // HS1004 — the source said something, the AST holds nothing.
  const parsedAnything = CONTENT_KEYS.some(
    (key) => Array.isArray(ast && ast[key]) && ast[key].length > 0
  );
  if (!parsedAnything) {
    diagnostics.push(
      diag(
        "HS1004",
        "error",
        "Nothing in this source parsed into a composition.",
        real[0].line,
        real[0].column,
        "This is what a non-HoloScript file looks like to the parser."
      )
    );
  }

  // HS1005 / HS1006 — trait names in the AST.
  for (const trait of collectTraits(ast)) {
    const name = String(trait.name ?? "");
    const bare = name.replace(/^@/, "");
    if (bare === "") {
      diagnostics.push(
        diag("HS1005", "error", "A trait was parsed with an empty name.", trait.line, trait.column)
      );
    } else if (traitIds && traitIds.size && !traitIds.has(normalizeTrait(bare))) {
      diagnostics.push(
        diag(
          "HS1006",
          "error",
          `Unknown trait "@${bare}".`,
          trait.line,
          trait.column,
          "Check the trait registry, or register it before use."
        )
      );
    }
  }

  return { ast, diagnostics };
}

/** snake_case ids in the registry, @camelCase or @snake_case in source. */
function normalizeTrait(name) {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/-/g, "_")
    .toLowerCase();
}

function collectTraits(node, found = []) {
  if (!node || typeof node !== "object") return found;
  if (Array.isArray(node)) {
    for (const item of node) collectTraits(item, found);
    return found;
  }
  if (node.type === "ObjectTrait" || node.type === "Trait") found.push(node);
  for (const value of Object.values(node)) {
    if (value && typeof value === "object") collectTraits(value, found);
  }
  return found;
}

export function parseTolerant(source, deps) {
  const { ast, diagnostics } = analyze(source, deps);
  return { ok: true, mode: "tolerant", ast, diagnostics };
}

export function parseStrict(source, deps) {
  const { ast, diagnostics } = analyze(source, deps);
  const errors = diagnostics.filter((d) => d.severity === "error");
  return errors.length
    ? { ok: false, mode: "strict", ast: null, diagnostics }
    : { ok: true, mode: "strict", ast, diagnostics };
}
