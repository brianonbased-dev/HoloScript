/**
 * Source scanner for the type annotations the Rust `.hs` reader already accepts.
 *
 * The spelling matches `parse_type_annotation` in
 * `packages/compiler-wasm/src/parser.rs`: a bare name, `[i32]`, `[i32; 4]`,
 * `&Packet`, `&mut Packet`, `&'a Packet`, and `&'a mut Packet`.
 * `Vec<T>`, `T?`, and dotted names are not recognized.
 */

export interface ScannedHsType {
  /** Canonical spelling, the same text the Rust parser stores. */
  type: string;
  /** Index just after the type in `source`. */
  end: number;
}

export interface FunctionRegion {
  /** True when a type colon appears in the signature, outside strings. */
  typed: boolean;
  /** Index just after the signature (params and optional return type). */
  signatureEnd: number;
  /** Index just after the closing `}` of the body, when a body brace follows. */
  bodyEnd: number | null;
}

const IDENT_START = /[A-Za-z_]/;
const IDENT_PART = /[A-Za-z0-9_]/;

function isIdentStart(char: string | undefined): boolean {
  return char !== undefined && IDENT_START.test(char);
}

function isIdentPart(char: string | undefined): boolean {
  return char !== undefined && IDENT_PART.test(char);
}

function skipWhitespace(source: string, index: number): number {
  let i = index;
  while (i < source.length) {
    const char = source[i];
    if (char === ' ' || char === '\t' || char === '\r' || char === '\n') {
      i++;
      continue;
    }
    if (char === '/' && source[i + 1] === '/') {
      i += 2;
      while (i < source.length && source[i] !== '\n') i++;
      continue;
    }
    if (char === '/' && source[i + 1] === '*') {
      i += 2;
      while (i < source.length && !(source[i] === '*' && source[i + 1] === '/')) i++;
      i = Math.min(source.length, i + 2);
      continue;
    }
    break;
  }
  return i;
}

function readIdent(source: string, index: number): { text: string; end: number } | null {
  if (!isIdentStart(source[index])) return null;
  let i = index + 1;
  while (isIdentPart(source[i])) i++;
  return { text: source.slice(index, i), end: i };
}

/**
 * A lifetime is `'ident` only in the positions the Rust lexer accepts:
 * immediately after `&`, or inside `<...>` when `>` follows the name.
 */
function isLifetimeAt(source: string, index: number): boolean {
  if (source[index] !== "'") return false;
  const previous = index > 0 ? source[index - 1] : '';
  if (previous !== '&' && previous !== '<') return false;
  if (!isIdentStart(source[index + 1])) return false;
  if (previous === '&') return true;
  let i = index + 1;
  while (isIdentPart(source[i])) i++;
  return source[i] === '>';
}

function readLifetime(source: string, index: number): { name: string; end: number } | null {
  if (!isLifetimeAt(source, index)) return null;
  const ident = readIdent(source, index + 1);
  if (!ident) return null;
  return { name: ident.text, end: ident.end };
}

function skipString(source: string, index: number): number {
  const quote = source[index];
  if (quote !== '"' && quote !== "'") return index;
  let i = index + 1;
  while (i < source.length) {
    if (source[i] === '\\') {
      i += 2;
      continue;
    }
    if (source[i] === quote) return i + 1;
    i++;
  }
  return source.length;
}

function skipBalanced(source: string, index: number, open: string, close: string): number {
  if (source[index] !== open) return index;
  let depth = 0;
  let i = index;
  while (i < source.length) {
    const char = source[i];
    if (char === '/' && source[i + 1] === '/') {
      i += 2;
      while (i < source.length && source[i] !== '\n') i++;
      continue;
    }
    if (char === '/' && source[i + 1] === '*') {
      i += 2;
      while (i < source.length && !(source[i] === '*' && source[i + 1] === '/')) i++;
      i = Math.min(source.length, i + 2);
      continue;
    }
    if ((char === '"' || char === "'") && !isLifetimeAt(source, i)) {
      i = skipString(source, i);
      continue;
    }
    if (char === open) depth++;
    else if (char === close) {
      depth--;
      if (depth === 0) return i + 1;
    }
    i++;
  }
  return source.length;
}

function hasTypeColon(source: string, start: number, end: number): boolean {
  let i = start;
  while (i < end) {
    const char = source[i];
    if (char === '/' && source[i + 1] === '/') {
      i += 2;
      while (i < end && source[i] !== '\n') i++;
      continue;
    }
    if ((char === '"' || char === "'") && !isLifetimeAt(source, i)) {
      const next = skipString(source, i);
      i = Math.min(next, end);
      continue;
    }
    if (char === ':') return true;
    i++;
  }
  return false;
}

function scanBracketType(source: string, index: number): ScannedHsType | null {
  if (source[index] !== '[') return null;
  let i = skipWhitespace(source, index + 1);
  const element = readIdent(source, i);
  if (!element) return null;
  i = skipWhitespace(source, element.end);
  if (source[i] === ']') {
    return { type: `[${element.text}]`, end: i + 1 };
  }
  if (source[i] !== ';') return null;
  i = skipWhitespace(source, i + 1);
  const numberStart = i;
  if (source[i] === '-' || source[i] === '+') i++;
  if (!/[0-9]/.test(source[i] ?? '')) return null;
  while (/[0-9]/.test(source[i] ?? '')) i++;
  if (source[i] === '.' && /[0-9]/.test(source[i + 1] ?? '')) {
    i++;
    while (/[0-9]/.test(source[i] ?? '')) i++;
  }
  const length = source.slice(numberStart, i);
  i = skipWhitespace(source, i);
  if (source[i] !== ']') return null;
  return { type: `[${element.text}; ${length}]`, end: i + 1 };
}

/**
 * Read one `.hs` type starting at `index` (whitespace before it is skipped).
 * Returns null when the text is not one of the accepted forms.
 */
export function scanHsType(source: string, index: number): ScannedHsType | null {
  let i = skipWhitespace(source, index);
  if (i >= source.length) return null;

  if (source[i] === '&') {
    i = skipWhitespace(source, i + 1);
    let lifetime: string | null = null;
    if (source[i] === "'") {
      const life = readLifetime(source, i);
      if (!life) return null;
      lifetime = life.name;
      i = skipWhitespace(source, life.end);
    }
    let mutable = false;
    const mut = readIdent(source, i);
    if (mut && mut.text === 'mut') {
      const after = source[mut.end];
      if (after === undefined || !isIdentPart(after)) {
        mutable = true;
        i = skipWhitespace(source, mut.end);
      }
    }
    let pointee: string;
    if (source[i] === '[') {
      const bracket = scanBracketType(source, i);
      if (!bracket) return null;
      pointee = bracket.type;
      i = bracket.end;
    } else {
      const name = readIdent(source, i);
      if (!name) return null;
      pointee = name.text;
      i = name.end;
    }
    let type: string;
    if (lifetime && mutable) type = `&'${lifetime} mut ${pointee}`;
    else if (lifetime) type = `&'${lifetime} ${pointee}`;
    else if (mutable) type = `&mut ${pointee}`;
    else type = `&${pointee}`;
    return { type, end: i };
  }

  if (source[i] === '[') return scanBracketType(source, i);

  const name = readIdent(source, i);
  if (!name) return null;
  return { type: name.text, end: name.end };
}

/**
 * Locate a `function` signature that starts at `functionOffset`.
 * The body brace counts only when it follows the signature directly
 * (whitespace and newlines allowed), so a later declaration is not swallowed.
 */
export function analyzeFunctionRegion(source: string, functionOffset: number): FunctionRegion {
  if (!source.startsWith('function', functionOffset)) {
    return { typed: false, signatureEnd: functionOffset, bodyEnd: null };
  }
  let i = functionOffset + 'function'.length;
  i = skipWhitespace(source, i);
  if (source[i] === '"' || (source[i] === "'" && !isLifetimeAt(source, i))) {
    i = skipString(source, i);
  } else {
    const name = readIdent(source, i);
    if (name) i = name.end;
  }
  i = skipWhitespace(source, i);
  if (source[i] === '<') {
    const saved = i;
    i = skipWhitespace(source, i + 1);
    const life = source[i] === "'" ? readLifetime(source, i) : null;
    if (life) {
      i = skipWhitespace(source, life.end);
      if (source[i] === '>') i++;
      else i = saved;
    } else {
      i = saved;
    }
  }
  i = skipWhitespace(source, i);
  if (source[i] === '(') {
    i = skipBalanced(source, i, '(', ')');
  }
  i = skipWhitespace(source, i);
  if (source[i] === ':') {
    i++;
    const returnType = scanHsType(source, i);
    if (returnType) i = returnType.end;
  }
  const signatureEnd = i;
  i = skipWhitespace(source, i);
  const bodyEnd = source[i] === '{' ? skipBalanced(source, i, '{', '}') : null;
  return {
    typed: hasTypeColon(source, functionOffset, signatureEnd),
    signatureEnd,
    bodyEnd,
  };
}
