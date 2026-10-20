/**
 * A small GBNF reader for tests: parse a llama.cpp grammar, decide whether a text is
 * in its language, and sample random members of it.
 *
 * The HoloScript grammar guard (holoscript-gbnf.ts) is only worth anything if (1) the
 * programs we teach are IN its language and (2) everything in its language PARSES.
 * Nothing in the repo could check either before: the generator's own tests only
 * looked for substrings. This reader covers the GBNF subset llama.cpp documents and the
 * generator emits: rules `name ::= ...`, alternation `|`, sequences, groups `( )`,
 * `?` `*` `+`, string literals with escapes, character classes (ranges, `^` negation,
 * escapes), rule references and `#` comments.
 *
 * Acceptance computes, for each rule at each position, the set of positions where a
 * match can end (memoised), so ambiguity costs sets, not backtracking.
 */

export type GbnfExpr =
  | { t: 'alt'; items: GbnfExpr[] }
  | { t: 'seq'; items: GbnfExpr[] }
  | { t: 'lit'; s: string }
  | { t: 'cls'; ranges: Array<[number, number]>; neg: boolean }
  | { t: 'ref'; name: string }
  | { t: 'rep'; e: GbnfExpr; min: 0 | 1; max: 1 | typeof Infinity };

export type GbnfRules = Map<string, GbnfExpr>;

const ESCAPES: Record<string, string> = {
  n: '\n',
  t: '\t',
  r: '\r',
  '\\': '\\',
  '"': '"',
  "'": "'",
  '[': '[',
  ']': ']',
  '-': '-',
  '^': '^',
  '/': '/',
};

class Reader {
  pos = 0;
  constructor(readonly src: string) {}

  skipSpace(newlines: boolean): void {
    for (;;) {
      const c = this.src[this.pos];
      if (c === '#') {
        while (this.pos < this.src.length && this.src[this.pos] !== '\n') this.pos++;
      } else if (c === ' ' || c === '\t' || c === '\r' || (newlines && c === '\n')) {
        this.pos++;
      } else {
        return;
      }
    }
  }

  ruleNameAt(at: number): string | null {
    const m = /^([a-zA-Z0-9-]+)[ \t]*::=/.exec(this.src.slice(at));
    return m ? m[1] : null;
  }

  escape(): string {
    const c = this.src[this.pos++];
    if (c === 'x') {
      const hex = this.src.slice(this.pos, this.pos + 2);
      this.pos += 2;
      return String.fromCharCode(parseInt(hex, 16));
    }
    if (c === 'u') {
      const hex = this.src.slice(this.pos, this.pos + 4);
      this.pos += 4;
      return String.fromCharCode(parseInt(hex, 16));
    }
    if (!(c in ESCAPES)) throw new Error(`GBNF: unknown escape \\${c} at ${this.pos}`);
    return ESCAPES[c];
  }

  literal(): GbnfExpr {
    this.pos++; // opening quote
    let s = '';
    while (this.src[this.pos] !== '"') {
      if (this.pos >= this.src.length) throw new Error('GBNF: unterminated string literal');
      const c = this.src[this.pos++];
      s += c === '\\' ? this.escape() : c;
    }
    this.pos++;
    return { t: 'lit', s };
  }

  charClass(): GbnfExpr {
    this.pos++; // [
    let neg = false;
    if (this.src[this.pos] === '^') {
      neg = true;
      this.pos++;
    }
    const ranges: Array<[number, number]> = [];
    const one = (): number => {
      const c = this.src[this.pos++];
      return (c === '\\' ? this.escape() : c).charCodeAt(0);
    };
    while (this.src[this.pos] !== ']') {
      if (this.pos >= this.src.length) throw new Error('GBNF: unterminated character class');
      const lo = one();
      if (this.src[this.pos] === '-' && this.src[this.pos + 1] !== ']') {
        this.pos++;
        ranges.push([lo, one()]);
      } else {
        ranges.push([lo, lo]);
      }
    }
    this.pos++;
    return { t: 'cls', ranges, neg };
  }

  /** alternation := sequence ('|' sequence)* ; newlines only continue inside parentheses. */
  alternation(depth: number): GbnfExpr {
    const items = [this.sequence(depth)];
    for (;;) {
      this.skipSpace(depth > 0);
      if (this.src[this.pos] !== '|') break;
      this.pos++;
      items.push(this.sequence(depth));
    }
    return items.length === 1 ? items[0] : { t: 'alt', items };
  }

  sequence(depth: number): GbnfExpr {
    const items: GbnfExpr[] = [];
    for (;;) {
      this.skipSpace(depth > 0);
      const c = this.src[this.pos];
      if (c === undefined || c === '|' || c === ')' || c === '\n') break;
      let item: GbnfExpr;
      if (c === '"') item = this.literal();
      else if (c === '[') item = this.charClass();
      else if (c === '(') {
        this.pos++;
        item = this.alternation(depth + 1);
        this.skipSpace(true);
        if (this.src[this.pos] !== ')') throw new Error(`GBNF: expected ) at ${this.pos}`);
        this.pos++;
      } else {
        const m = /^[a-zA-Z0-9-]+/.exec(this.src.slice(this.pos));
        if (!m) throw new Error(`GBNF: unexpected ${JSON.stringify(c)} at ${this.pos}`);
        this.pos += m[0].length;
        item = { t: 'ref', name: m[0] };
      }
      const q = this.src[this.pos];
      if (q === '?') item = { t: 'rep', e: item, min: 0, max: 1 };
      else if (q === '*') item = { t: 'rep', e: item, min: 0, max: Infinity };
      else if (q === '+') item = { t: 'rep', e: item, min: 1, max: Infinity };
      if (q === '?' || q === '*' || q === '+') this.pos++;
      items.push(item);
    }
    return items.length === 1 ? items[0] : { t: 'seq', items };
  }
}

/** Parse GBNF text into rules. Throws on syntax it does not understand. */
export function parseGbnf(text: string): GbnfRules {
  const reader = new Reader(text);
  const rules: GbnfRules = new Map();
  for (;;) {
    reader.skipSpace(true);
    if (reader.pos >= text.length) break;
    const name = reader.ruleNameAt(reader.pos);
    if (!name) throw new Error(`GBNF: expected a rule at ${reader.pos}`);
    reader.pos = text.indexOf('::=', reader.pos) + 3;
    if (rules.has(name)) throw new Error(`GBNF: rule ${name} defined twice`);
    rules.set(name, reader.alternation(0));
  }
  return rules;
}

/** Every rule name referenced anywhere, for well-formedness checks. */
export function referencedRules(rules: GbnfRules): Set<string> {
  const out = new Set<string>();
  const walk = (e: GbnfExpr): void => {
    if (e.t === 'ref') out.add(e.name);
    else if (e.t === 'alt' || e.t === 'seq') e.items.forEach(walk);
    else if (e.t === 'rep') walk(e.e);
  };
  rules.forEach(walk);
  return out;
}

function inClass(e: Extract<GbnfExpr, { t: 'cls' }>, code: number): boolean {
  const hit = e.ranges.some(([lo, hi]) => code >= lo && code <= hi);
  return e.neg ? !hit : hit;
}

/** True when `input` is exactly one `start` of the grammar. */
export function gbnfAccepts(rules: GbnfRules, input: string, start = 'root'): boolean {
  const memo = new Map<string, Set<number>>();
  const EMPTY = new Set<number>();

  const match = (e: GbnfExpr, pos: number): Set<number> => {
    switch (e.t) {
      case 'lit':
        return input.startsWith(e.s, pos) ? new Set([pos + e.s.length]) : EMPTY;
      case 'cls':
        return pos < input.length && inClass(e, input.charCodeAt(pos)) ? new Set([pos + 1]) : EMPTY;
      case 'ref': {
        const key = `${e.name}@${pos}`;
        const hit = memo.get(key);
        if (hit) return hit;
        const rule = rules.get(e.name);
        if (!rule) throw new Error(`GBNF: undefined rule ${e.name}`);
        memo.set(key, EMPTY); // a left-recursive re-entry matches nothing
        const result = match(rule, pos);
        memo.set(key, result);
        return result;
      }
      case 'seq': {
        let positions = new Set([pos]);
        for (const item of e.items) {
          const next = new Set<number>();
          for (const p of positions) for (const q of match(item, p)) next.add(q);
          if (next.size === 0) return EMPTY;
          positions = next;
        }
        return positions;
      }
      case 'alt': {
        const out = new Set<number>();
        for (const item of e.items) for (const q of match(item, pos)) out.add(q);
        return out;
      }
      case 'rep': {
        const reached = new Set<number>();
        let frontier = new Set([pos]);
        for (let count = 0; frontier.size > 0 && count < e.max; count++) {
          const next = new Set<number>();
          for (const p of frontier) for (const q of match(e.e, p)) if (!reached.has(q)) next.add(q);
          next.forEach((q) => reached.add(q));
          frontier = next;
        }
        if (e.min === 0) reached.add(pos);
        return reached;
      }
    }
  };

  return match({ t: 'ref', name: start }, 0).has(input.length);
}

/** Deterministic PRNG (mulberry32), so a failing sample can be reproduced from its seed. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Characters a negated class may draw from: printable ASCII plus newline and tab. */
const SAMPLE_POOL = [9, 10, ...Array.from({ length: 95 }, (_, i) => 32 + i)];

/**
 * Sample one random member of the grammar. Past `maxDepth` rule expansions every choice
 * takes its shortest way out, so sampling always terminates.
 */
export function sampleGbnf(
  rules: GbnfRules,
  random: () => number,
  { start = 'root', maxDepth = 24 }: { start?: string; maxDepth?: number } = {}
): string {
  // Shortest expansion length of every rule (fixpoint), to steer deep samples home.
  const shortest = new Map<string, number>();
  const cost = (e: GbnfExpr): number => {
    switch (e.t) {
      case 'lit':
        return e.s.length;
      case 'cls':
        return 1;
      case 'ref':
        return shortest.get(e.name) ?? Infinity;
      case 'seq':
        return e.items.reduce((sum, item) => sum + cost(item), 0);
      case 'alt':
        return Math.min(...e.items.map(cost));
      case 'rep':
        return e.min === 0 ? 0 : cost(e.e);
    }
  };
  for (let changed = true; changed;) {
    changed = false;
    for (const [name, e] of rules) {
      const c = cost(e);
      if (c < (shortest.get(name) ?? Infinity)) {
        shortest.set(name, c);
        changed = true;
      }
    }
  }

  let out = '';
  const pick = <T>(items: T[]): T => items[Math.floor(random() * items.length)];
  const gen = (e: GbnfExpr, depth: number): void => {
    const deep = depth > maxDepth;
    switch (e.t) {
      case 'lit':
        out += e.s;
        return;
      case 'cls': {
        const pool = e.neg
          ? SAMPLE_POOL.filter((code) => inClass(e, code))
          : e.ranges.flatMap(([lo, hi]) => Array.from({ length: hi - lo + 1 }, (_, i) => lo + i));
        out += String.fromCharCode(pick(pool));
        return;
      }
      case 'ref':
        gen(rules.get(e.name)!, depth + 1);
        return;
      case 'seq':
        for (const item of e.items) gen(item, depth);
        return;
      case 'alt': {
        const finite = e.items.filter((item) => cost(item) < Infinity);
        if (deep) {
          const best = Math.min(...finite.map(cost));
          gen(
            finite.find((item) => cost(item) === best)!,
            depth
          );
        } else {
          gen(pick(finite), depth);
        }
        return;
      }
      case 'rep': {
        let count = e.min;
        if (!deep) while (count < e.max && count < e.min + 4 && random() < 0.55) count++;
        for (let i = 0; i < count; i++) gen(e.e, depth + 1);
        return;
      }
    }
  };
  gen({ t: 'ref', name: start }, 0);
  return out;
}
