/**
 * Source-level fault planter for `.hs` / `.hsplus` (C-family surface syntax).
 *
 * Works on text, not the AST, on purpose: a planted fault must be a change a
 * human or model could plausibly make while editing, and must survive the
 * real parser. Every operator skips comments and string contents unless it
 * explicitly targets a string (event-rename). Output is deterministic: the
 * same source always yields the same mutants in the same order.
 */

export type MutationOperator =
  | 'arith-flip'
  | 'comparison-flip'
  | 'constant-change'
  | 'boolean-flip'
  | 'drop-statement'
  | 'event-rename'
  | 'drop-refusal';

export const MUTATION_OPERATORS: readonly MutationOperator[] = [
  'arith-flip',
  'comparison-flip',
  'constant-change',
  'boolean-flip',
  'drop-statement',
  'event-rename',
  'drop-refusal',
];

export interface SourceMutant {
  /** `<operator>#<site>` — stable across runs for the same source. */
  id: string;
  operator: MutationOperator;
  site: number;
  /** 1-based line of the change in the original source. */
  line: number;
  /** True when the change sits in a decision: an `if` condition or a refusal guard. */
  inDecision: boolean;
  before: string;
  after: string;
  description: string;
  source: string;
}

export type SpanKind = 'code' | 'string' | 'comment';
export interface Span {
  kind: SpanKind;
  start: number;
  end: number;
}

/** Split source into code / string / comment spans (C-family lexical rules). */
export function lexSpans(source: string): Span[] {
  const spans: Span[] = [];
  let i = 0;
  let codeStart = 0;
  const pushCode = (end: number) => {
    if (end > codeStart) spans.push({ kind: 'code', start: codeStart, end });
  };
  while (i < source.length) {
    const ch = source[i];
    const next = source[i + 1];
    if (ch === '/' && next === '/') {
      pushCode(i);
      const nl = source.indexOf('\n', i);
      const end = nl === -1 ? source.length : nl;
      spans.push({ kind: 'comment', start: i, end });
      i = end;
      codeStart = i;
      continue;
    }
    if (ch === '/' && next === '*') {
      pushCode(i);
      const close = source.indexOf('*/', i + 2);
      const end = close === -1 ? source.length : close + 2;
      spans.push({ kind: 'comment', start: i, end });
      i = end;
      codeStart = i;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      pushCode(i);
      let j = i + 1;
      while (j < source.length && source[j] !== ch) {
        if (source[j] === '\\') j++;
        j++;
      }
      const end = Math.min(j + 1, source.length);
      spans.push({ kind: 'string', start: i, end });
      i = end;
      codeStart = i;
      continue;
    }
    i++;
  }
  pushCode(source.length);
  return spans;
}

function lineOf(source: string, index: number): number {
  let line = 1;
  for (let k = 0; k < index && k < source.length; k++) if (source[k] === '\n') line++;
  return line;
}

interface Site {
  start: number;
  end: number;
  replacement: string;
  description: string;
}

function codeRegexSites(
  source: string,
  spans: Span[],
  pattern: RegExp,
  replace: (match: RegExpExecArray) => { text: string; offset: number; length: number } | null,
  describe: (before: string, after: string) => string
): Site[] {
  const sites: Site[] = [];
  for (const span of spans) {
    if (span.kind !== 'code') continue;
    const text = source.slice(span.start, span.end);
    const re = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g');
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const r = replace(m);
      if (!r) continue;
      const start = span.start + m.index + r.offset;
      const before = source.slice(start, start + r.length);
      sites.push({
        start,
        end: start + r.length,
        replacement: r.text,
        description: describe(before, r.text),
      });
    }
  }
  return sites;
}

const ARITH_SWAP: Record<string, string> = { '+': '-', '-': '+', '*': '/', '/': '*' };
const COMPARISON_SWAP: Record<string, string> = {
  '<=': '>',
  '>=': '<',
  '<': '>=',
  '>': '<=',
  '===': '!==',
  '!==': '===',
  '==': '!=',
  '!=': '==',
};

function sitesFor(operator: MutationOperator, source: string, spans: Span[]): Site[] {
  switch (operator) {
    case 'arith-flip':
      // Binary operator written with spaces on both sides (excludes unary minus,
      // `++`, `+=`, and arrows).
      return codeRegexSites(
        source,
        spans,
        /(\S) ([+\-*/]) (?=\S)/g,
        (m) => {
          const op = m[2];
          return { text: ARITH_SWAP[op], offset: m[1].length + 1, length: 1 };
        },
        (b, a) => `arithmetic "${b}" changed to "${a}"`
      );
    case 'comparison-flip':
      return codeRegexSites(
        source,
        spans,
        /(===|!==|==|!=|<=|>=|(?<![<=>!-])<(?![<=])|(?<![=>-])>(?![>=]))/g,
        (m) => ({ text: COMPARISON_SWAP[m[1]], offset: 0, length: m[1].length }),
        (b, a) => `comparison "${b}" changed to "${a}"`
      );
    case 'constant-change':
      return codeRegexSites(
        source,
        spans,
        /(?<![\w.])(\d+(?:\.\d+)?)(?![\w.])/g,
        (m) => {
          const n = Number(m[1]);
          const next = Number.isInteger(n) ? String(n + 1) : String(n * 2);
          return { text: next, offset: 0, length: m[1].length };
        },
        (b, a) => `number ${b} changed to ${a}`
      );
    case 'boolean-flip':
      return codeRegexSites(
        source,
        spans,
        /\b(true|false)\b/g,
        (m) => ({ text: m[1] === 'true' ? 'false' : 'true', offset: 0, length: m[1].length }),
        (b, a) => `${b} changed to ${a}`
      );
    case 'drop-statement': {
      // Whole-line statements that do work: an emit call or an assignment.
      const sites: Site[] = [];
      const lines = source.split('\n');
      let offset = 0;
      for (const line of lines) {
        const trimmed = line.trim();
        if (
          /^emit\s*\(.*\)\s*;?$/.test(trimmed) ||
          /^(state\.)?[A-Za-z_]\w*(\.\w+)*\s*([+\-*/]?=)(?!=)\s*.+$/.test(trimmed)
        ) {
          // Skip declarations inside `state { key: value }` (no `=`) — regex above
          // requires an `=` so plain `key: value` lines never match.
          sites.push({
            start: offset,
            end: offset + line.length + 1,
            replacement: '',
            description: `statement removed: ${trimmed}`,
          });
        }
        offset += line.length + 1;
      }
      return sites;
    }
    case 'drop-refusal': {
      // Remove a whole `if (...) { ... allowed: false ... }` guard (no else).
      const sites: Site[] = [];
      const codeAt = (index: number) =>
        spans.some((sp) => sp.kind === 'code' && index >= sp.start && index < sp.end);
      const guard = /^[ \t]*if\s*\(.*\)\s*\{[ \t]*$/gm;
      let m: RegExpExecArray | null;
      while ((m = guard.exec(source)) !== null) {
        const open = m.index + m[0].lastIndexOf('{');
        let depth = 0;
        let close = -1;
        for (let k = open; k < source.length; k++) {
          if (!codeAt(k)) continue;
          if (source[k] === '{') depth++;
          else if (source[k] === '}') {
            depth--;
            if (depth === 0) {
              close = k;
              break;
            }
          }
        }
        if (close === -1) continue;
        const block = source.slice(open, close + 1);
        if (!/allowed\s*:\s*false/.test(block)) continue;
        const after = source.slice(close + 1).match(/^\s*else\b/);
        if (after) continue;
        // Also skip `} else if (...) {` heads: only plain guards.
        const lineEnd = source.indexOf('\n', close);
        const end = lineEnd === -1 ? source.length : lineEnd + 1;
        sites.push({
          start: m.index,
          end,
          replacement: '',
          description: `refusal removed: ${m[0].trim()} ... }`,
        });
      }
      return sites;
    }
    case 'event-rename': {
      const sites: Site[] = [];
      for (let k = 0; k < spans.length; k++) {
        const span = spans[k];
        if (span.kind !== 'string') continue;
        const prev = spans[k - 1];
        if (!prev || prev.kind !== 'code') continue;
        const before = source.slice(prev.start, prev.end);
        if (!/\bemit\s*\(\s*$/.test(before)) continue;
        const literal = source.slice(span.start, span.end);
        const quote = literal[0];
        const inner = literal.slice(1, -1);
        const renamed = `${quote}${inner}_renamed${quote}`;
        sites.push({
          start: span.start,
          end: span.end,
          replacement: renamed,
          description: `event name ${literal} changed to ${renamed}`,
        });
      }
      return sites;
    }
  }
}

/** Every possible single-site mutant of `source`, grouped by operator order. */
export function enumerateMutants(source: string): SourceMutant[] {
  const spans = lexSpans(source);
  const out: SourceMutant[] = [];
  for (const operator of MUTATION_OPERATORS) {
    const sites = sitesFor(operator, source, spans);
    sites.forEach((site, index) => {
      const mutated = source.slice(0, site.start) + site.replacement + source.slice(site.end);
      if (mutated === source) return;
      const line = lineOf(source, site.start);
      const lineText = source.split('\n')[line - 1] ?? '';
      out.push({
        id: `${operator}#${index}`,
        operator,
        site: index,
        line,
        inDecision: operator === 'drop-refusal' || /\bif\s*\(/.test(lineText),
        before: source.slice(site.start, site.end).replace(/\n$/, ''),
        after: site.replacement,
        description: site.description,
        source: mutated,
      });
    });
  }
  return out;
}

/**
 * Pick a small deterministic set: the first site of each operator that has
 * one, up to `max` mutants.
 */
export function selectMutants(source: string, max = 5): SourceMutant[] {
  const seen = new Set<MutationOperator>();
  const picked: SourceMutant[] = [];
  for (const mutant of enumerateMutants(source)) {
    if (seen.has(mutant.operator)) continue;
    seen.add(mutant.operator);
    picked.push(mutant);
    if (picked.length >= max) break;
  }
  return picked;
}

/**
 * Prefer faults in decision logic: comparison flips and off-by-one limits in
 * `if` conditions, dropped refusal guards, then flipped booleans, arithmetic,
 * dropped statements and renamed events. Round-robin across those groups so a
 * small set still spreads over kinds of mistake. Deterministic.
 */
export function selectDecisionMutants(source: string, max = 6): SourceMutant[] {
  const all = enumerateMutants(source);
  const groups: SourceMutant[][] = [
    all.filter((m) => m.operator === 'comparison-flip' && m.inDecision),
    all.filter((m) => m.operator === 'constant-change' && m.inDecision),
    all.filter((m) => m.operator === 'drop-refusal'),
    all.filter((m) => m.operator === 'boolean-flip'),
    all.filter((m) => m.operator === 'arith-flip'),
    all.filter((m) => m.operator === 'drop-statement'),
    all.filter((m) => m.operator === 'event-rename'),
  ];
  const picked: SourceMutant[] = [];
  for (let round = 0; picked.length < max; round++) {
    let any = false;
    for (const group of groups) {
      if (picked.length >= max) break;
      const m = group[round];
      if (!m) continue;
      any = true;
      picked.push(m);
    }
    if (!any) break;
  }
  return picked;
}
