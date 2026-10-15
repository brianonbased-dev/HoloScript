/**
 * Rule-conflict check (board task_1791419247017_rsth).
 *
 * Finds two rules in one action (or handler) that can both apply in the same
 * call and set the same state to different values, where nothing but their
 * order in the program decides which one wins. Each finding is reported as a
 * plain question for the owner, with a concrete moment (a witness) where it
 * happens.
 *
 * Why: in the HVAC back-translation round the founder's own rules disagreed
 * (heat pump checklist lines 14 and 15 — his rules 6 and 7): below the outdoor
 * cut-off with the room only 2 degrees cold, one rule leaves the backup strips
 * off and the other runs them. Read one at a time, nobody noticed; a rebuild
 * diverged exactly there.
 *
 * What counts as a rule: a guarded write — an assignment to `state.*` that sits
 * inside one or more `if` blocks. What counts as a decision about which rule
 * wins (no report): an `else` chain, an early `return`, a guard that excludes the
 * other rule, nesting one rule inside the other, an unconditional default that a
 * rule then overrides, a later write that builds on the earlier value (`+=`), or
 * a declared priority comment (`// rule 15 wins over rule 14`). The one shape
 * left is two sibling rules that overlap and disagree: the later write silently
 * wins, and nobody chose that.
 *
 * Decidable core: linear comparisons over numeric state, inputs and constants
 * (`+`, `-`, multiplication or division by a constant), booleans, string
 * equality. `?:`, `min`, `max` and `abs` are split into cases. Anything else
 * becomes an opaque term. State ranges come from a fixpoint over every action
 * (so "swing is always 1 to 3" rules out moments no call can reach). Every
 * candidate is replayed concretely before it is reported, so an opaque term can
 * cost a finding but never invent one.
 *
 * Rule names: a comment that starts with `rule <name>` labels the statement on
 * the next code line (or the same line, when the comment trails code), and
 * everything nested inside it. Without labels the report names line numbers.
 */

import { parseHolo } from '../parser/HoloCompositionParser';
import type {
  HoloAssignment,
  HoloComposition,
  HoloExpression,
  HoloIfStatement,
  HoloStatement,
} from '../parser/HoloCompositionTypes';

// =============================================================================
// PUBLIC TYPES
// =============================================================================

export type RuleJson = string | number | boolean | null | RuleJson[] | { [key: string]: RuleJson };

export type RuleConflictKind = 'conflict' | 'priority-mismatch';

export interface RuleConflictSide {
  /** Label from a `// rule <name>` comment, when there is one. */
  label?: string;
  /** Line of the rule's outermost `if` that the other rule does not share. */
  line: number;
  /** Line of the assignment itself. */
  writeLine: number;
  /** What this rule sets the target to at the witness. */
  value: RuleJson;
  /** The same, in plain words ("turns backup heating on"). */
  effect: string;
}

export interface RuleConflictWitness {
  /** Full state at the start of the call. */
  state: Record<string, RuleJson>;
  /** The inputs given to the action. */
  args: Record<string, RuleJson>;
  /** The values the two rules read, as shown in the message. */
  shown: Array<{ name: string; value: RuleJson; given: boolean }>;
}

export interface RuleConflict {
  kind: RuleConflictKind;
  /** Action (or handler event) name. */
  action: string;
  /** The state both rules write, e.g. `state.backupHeating`. */
  target: string;
  /** The rule that comes first in the program. */
  first: RuleConflictSide;
  /** The rule that comes later — it wins as written. */
  second: RuleConflictSide;
  witness: RuleConflictWitness;
  /** The declared priority this finding contradicts (priority-mismatch only). */
  declared?: { winner: string; loser: string; line: number };
  /** The plain question for the owner. */
  message: string;
  /** What to change, for whoever edits the program. */
  suggestion: string;
}

export interface RuleConflictReport {
  conflicts: RuleConflict[];
  /** Actions the check could not finish, with the reason (it abstains, never guesses). */
  skipped: Array<{ action: string; reason: string }>;
  /** Actions that were checked to the end. */
  checkedActions: string[];
  /** Candidates the concrete replay did not confirm (dropped, not reported). */
  unconfirmed: number;
}

export interface RuleConflictOptions {
  /** Paths explored per action before abstaining (default 1024). */
  maxPathsPerAction?: number;
  /** Search steps across the whole check before abstaining (default 400000). */
  maxSolverSteps?: number;
}

// =============================================================================
// LINEAR TERMS AND FORMULAS
// =============================================================================

class Abstain extends Error {}

const EPS = 1e-9;

interface Lin {
  c: Map<string, number>;
  k: number;
}

function lconst(k: number): Lin {
  return { c: new Map(), k };
}

function lvar(name: string): Lin {
  return { c: new Map([[name, 1]]), k: 0 };
}

function ladd(a: Lin, b: Lin, sign = 1): Lin {
  const c = new Map(a.c);
  for (const [v, x] of b.c) {
    const n = (c.get(v) ?? 0) + sign * x;
    if (Math.abs(n) < EPS) c.delete(v);
    else c.set(v, n);
  }
  return { c, k: a.k + sign * b.k };
}

function lscale(a: Lin, s: number): Lin {
  if (s === 0) return lconst(0);
  const c = new Map<string, number>();
  for (const [v, x] of a.c) c.set(v, x * s);
  return { c, k: a.k * s };
}

function lkey(a: Lin): string {
  return (
    [...a.c.entries()]
      .sort(([x], [y]) => (x < y ? -1 : x > y ? 1 : 0))
      .map(([v, x]) => `${x}*${v}`)
      .join('+') + `+${a.k}`
  );
}

type StrTerm = { lit: string } | { v: string };

type Formula =
  | { t: 'T' }
  | { t: 'F' }
  | { t: 'and'; xs: Formula[] }
  | { t: 'or'; xs: Formula[] }
  | { t: 'not'; x: Formula }
  /** lin < 0 (strict) or lin <= 0 */
  | { t: 'le'; lin: Lin; strict: boolean }
  | { t: 'seq'; a: StrTerm; b: StrTerm }
  | { t: 'b'; key: string };

const TRUE: Formula = { t: 'T' };
const FALSE: Formula = { t: 'F' };

function fAnd(...xs: Formula[]): Formula {
  const out: Formula[] = [];
  for (const x of xs) {
    if (x.t === 'F') return FALSE;
    if (x.t === 'T') continue;
    if (x.t === 'and') out.push(...x.xs);
    else out.push(x);
  }
  if (out.length === 0) return TRUE;
  return out.length === 1 ? out[0] : { t: 'and', xs: out };
}

function fOr(...xs: Formula[]): Formula {
  const out: Formula[] = [];
  for (const x of xs) {
    if (x.t === 'T') return TRUE;
    if (x.t === 'F') continue;
    if (x.t === 'or') out.push(...x.xs);
    else out.push(x);
  }
  if (out.length === 0) return FALSE;
  return out.length === 1 ? out[0] : { t: 'or', xs: out };
}

function fNot(x: Formula): Formula {
  switch (x.t) {
    case 'T':
      return FALSE;
    case 'F':
      return TRUE;
    case 'not':
      return x.x;
    case 'le':
      // not(l < 0) is -l <= 0; not(l <= 0) is -l < 0
      return mkLe(lscale(x.lin, -1), !x.strict);
    case 'and':
      return fOr(...x.xs.map(fNot));
    case 'or':
      return fAnd(...x.xs.map(fNot));
    default:
      return { t: 'not', x };
  }
}

function mkLe(lin: Lin, strict: boolean): Formula {
  if (lin.c.size === 0) {
    const holds = strict ? lin.k < -EPS : lin.k <= EPS;
    return holds ? TRUE : FALSE;
  }
  return { t: 'le', lin, strict };
}

function mkSeq(a: StrTerm, b: StrTerm): Formula {
  if ('lit' in a && 'lit' in b) return a.lit === b.lit ? TRUE : FALSE;
  if ('v' in a && 'v' in b && a.v === b.v) return TRUE;
  return { t: 'seq', a, b };
}

function linEq(a: Lin, b: Lin): Formula {
  const d = ladd(a, b, -1);
  return fAnd(mkLe(d, false), mkLe(lscale(d, -1), false));
}

// =============================================================================
// SYMBOLIC VALUES
// =============================================================================

type Sym =
  | { k: 'num'; lin: Lin }
  | { k: 'str'; term: StrTerm }
  | { k: 'bool'; f: Formula }
  | { k: 'null' }
  /** A leaf whose type is decided where it is used (inputs, opaque terms). */
  | { k: 'var'; key: string }
  | { k: 'ite'; c: Formula; a: Sym; b: Sym }
  /** Objects and arrays: only compared by identity of their structure. */
  | { k: 'obj'; key: string };

const MAX_SYM_SIZE = 256;

function symSize(s: Sym): number {
  return s.k === 'ite' ? 1 + symSize(s.a) + symSize(s.b) : 1;
}

function fkey(f: Formula): string {
  switch (f.t) {
    case 'T':
    case 'F':
      return f.t;
    case 'and':
    case 'or':
      return `${f.t}(${f.xs.map(fkey).join(',')})`;
    case 'not':
      return `!(${fkey(f.x)})`;
    case 'le':
      return `${lkey(f.lin)}${f.strict ? '<' : '<='}0`;
    case 'seq':
      return `${tkey(f.a)}==${tkey(f.b)}`;
    case 'b':
      return `b:${f.key}`;
  }
}

function tkey(t: StrTerm): string {
  return 'lit' in t ? JSON.stringify(t.lit) : `v:${t.v}`;
}

function skey(s: Sym): string {
  switch (s.k) {
    case 'num':
      return `n(${lkey(s.lin)})`;
    case 'str':
      return `s(${tkey(s.term)})`;
    case 'bool':
      return `b(${fkey(s.f)})`;
    case 'null':
      return 'null';
    case 'var':
      return `v(${s.key})`;
    case 'ite':
      return `ite(${fkey(s.c)},${skey(s.a)},${skey(s.b)})`;
    case 'obj':
      return `o(${s.key})`;
  }
}

function opaque(prefix: string, parts: Sym[]): Sym {
  return { k: 'var', key: `op:${prefix}(${parts.map(skey).join(',')})` };
}

function mkIte(c: Formula, a: Sym, b: Sym): Sym {
  if (c.t === 'T') return a;
  if (c.t === 'F') return b;
  if (skey(a) === skey(b)) return a;
  const s: Sym = { k: 'ite', c, a, b };
  if (symSize(s) > MAX_SYM_SIZE) return { k: 'var', key: `op:big(${skey(s)})` };
  return s;
}

function lift2(a: Sym, b: Sym, f: (x: Sym, y: Sym) => Sym): Sym {
  if (a.k === 'ite') return mkIte(a.c, lift2(a.a, b, f), lift2(a.b, b, f));
  if (b.k === 'ite') return mkIte(b.c, lift2(a, b.a, f), lift2(a, b.b, f));
  return f(a, b);
}

function lift1(a: Sym, f: (x: Sym) => Sym): Sym {
  if (a.k === 'ite') return mkIte(a.c, lift1(a.a, f), lift1(a.b, f));
  return f(a);
}

function liftF(a: Sym, f: (x: Sym) => Formula): Formula {
  if (a.k === 'ite') return fOr(fAnd(a.c, liftF(a.a, f)), fAnd(fNot(a.c), liftF(a.b, f)));
  return f(a);
}

function liftF2(a: Sym, b: Sym, f: (x: Sym, y: Sym) => Formula): Formula {
  if (a.k === 'ite') {
    return fOr(fAnd(a.c, liftF2(a.a, b, f)), fAnd(fNot(a.c), liftF2(a.b, b, f)));
  }
  if (b.k === 'ite') {
    return fOr(fAnd(b.c, liftF2(a, b.a, f)), fAnd(fNot(b.c), liftF2(a, b.b, f)));
  }
  return f(a, b);
}

function numOf(s: Sym): Lin | null {
  if (s.k === 'num') return s.lin;
  if (s.k === 'var') return lvar(s.key);
  return null;
}

function strOf(s: Sym): StrTerm | null {
  if (s.k === 'str') return s.term;
  if (s.k === 'var') return { v: s.key };
  return null;
}

/** Truth of a value used as a condition. */
function truth(s: Sym): Formula {
  return liftF(s, (x) => {
    if (x.k === 'bool') return x.f;
    if (x.k === 'var') return { t: 'b', key: x.key };
    // The runtime refuses non-boolean conditions; keep the path but learn nothing.
    return { t: 'b', key: `op:truth(${skey(x)})` };
  });
}

/** Strict equality of two values (the runtime's `==`). */
function equal(a: Sym, b: Sym): Formula {
  return liftF2(a, b, (x, y) => {
    if (x.k === 'null' || y.k === 'null') {
      if (x.k === 'null' && y.k === 'null') return TRUE;
      const other = x.k === 'null' ? y : x;
      if (other.k === 'var') return { t: 'b', key: `op:isnull(${other.key})` };
      return FALSE;
    }
    if (x.k === 'obj' || y.k === 'obj') {
      return { t: 'b', key: `op:eq(${[skey(x), skey(y)].sort().join(',')})` };
    }
    if (x.k === 'num' || y.k === 'num') {
      const lx = numOf(x);
      const ly = numOf(y);
      return lx && ly ? linEq(lx, ly) : FALSE;
    }
    if (x.k === 'str' || y.k === 'str') {
      const sx = strOf(x);
      const sy = strOf(y);
      return sx && sy ? mkSeq(sx, sy) : FALSE;
    }
    if (x.k === 'bool' || y.k === 'bool') {
      const fx = truth(x);
      const fy = truth(y);
      return fOr(fAnd(fx, fy), fAnd(fNot(fx), fNot(fy)));
    }
    // two untyped leaves
    if (x.k === 'var' && y.k === 'var' && x.key === y.key) return TRUE;
    return { t: 'b', key: `op:eq(${[skey(x), skey(y)].sort().join(',')})` };
  });
}

function compare(op: string, a: Sym, b: Sym): Formula {
  return liftF2(a, b, (x, y) => {
    const lx = numOf(x);
    const ly = numOf(y);
    if (!lx || !ly) return { t: 'b', key: `op:cmp${op}(${skey(x)},${skey(y)})` };
    switch (op) {
      case '<':
        return mkLe(ladd(lx, ly, -1), true);
      case '<=':
        return mkLe(ladd(lx, ly, -1), false);
      case '>':
        return mkLe(ladd(ly, lx, -1), true);
      default:
        return mkLe(ladd(ly, lx, -1), false);
    }
  });
}

function arith(op: string, a: Sym, b: Sym): Sym {
  return lift2(a, b, (x, y) => {
    if (op === '+' && x.k === 'str' && y.k === 'str' && 'lit' in x.term && 'lit' in y.term) {
      return { k: 'str', term: { lit: x.term.lit + y.term.lit } };
    }
    if ((op === '+' && (x.k === 'str' || y.k === 'str')) || x.k === 'bool' || y.k === 'bool') {
      return opaque(op, [x, y]);
    }
    const lx = numOf(x);
    const ly = numOf(y);
    if (!lx || !ly) return opaque(op, [x, y]);
    if (op === '+') return { k: 'num', lin: ladd(lx, ly) };
    if (op === '-') return { k: 'num', lin: ladd(lx, ly, -1) };
    if (op === '*') {
      if (lx.c.size === 0) return { k: 'num', lin: lscale(ly, lx.k) };
      if (ly.c.size === 0) return { k: 'num', lin: lscale(lx, ly.k) };
      return opaque('*', [x, y]);
    }
    if (op === '/') {
      if (ly.c.size === 0 && Math.abs(ly.k) > EPS) return { k: 'num', lin: lscale(lx, 1 / ly.k) };
      return opaque('/', [x, y]);
    }
    return opaque(op, [x, y]);
  });
}

/** A formula that holds exactly when the two values differ. */
function differ(a: Sym, b: Sym): Formula {
  return fNot(equal(a, b));
}

// =============================================================================
// SOLVER — case search over or-branches, theories for booleans, strings and
// linear arithmetic (Fourier–Motzkin elimination with a model read back).
// =============================================================================

interface NumRange {
  lo: number;
  hi: number;
}

interface Invariants {
  num: Map<string, NumRange>;
  /** Finite set of possible strings, or null when unknown. */
  str: Map<string, Set<string> | null>;
  /** Which of yes/no a state flag can ever hold. */
  bool: Map<string, Set<boolean>>;
}

interface Model {
  num: Map<string, number>;
  str: Map<string, string>;
  bool: Map<string, boolean>;
}

interface SolverContext {
  inv: Invariants;
  numHints: Map<string, number>;
  strHints: Map<string, string>;
  /** Every string literal in the program, plus initial strings. */
  literals: string[];
  budget: { steps: number };
}

type Lit =
  | { t: 'le'; lin: Lin; strict: boolean }
  | { t: 'seq'; a: StrTerm; b: StrTerm; neg: boolean }
  | { t: 'b'; key: string; neg: boolean };

interface Cons {
  c: Map<string, number>;
  k: number;
  strict: boolean;
}

const MAX_FM_CONSTRAINTS = 600;

function consKey(c: Cons): string {
  return lkey({ c: c.c, k: c.k }) + (c.strict ? '<' : '<=');
}

function round9(x: number): number {
  return Number.isFinite(x) ? Math.round(x * 1e9) / 1e9 : x;
}

/** Normalize so the largest coefficient magnitude is 1 (keeps dedupe effective). */
function normalizeCons(c: Cons): Cons {
  let m = 0;
  for (const x of c.c.values()) m = Math.max(m, Math.abs(x));
  if (m === 0 || Math.abs(m - 1) < EPS) return c;
  const out = new Map<string, number>();
  for (const [v, x] of c.c) out.set(v, x / m);
  return { c: out, k: c.k / m, strict: c.strict };
}

/** Eliminate variables; return the elimination stages, or null when unsatisfiable. */
function fmEliminate(
  input: Cons[],
  keep: string | null
): { stages: Array<{ v: string; cons: Cons[] }>; rest: Cons[] } | null {
  let cur: Cons[] = [];
  const seen = new Set<string>();
  for (const raw of input) {
    const c = normalizeCons(raw);
    if (c.c.size === 0) {
      if (c.strict ? c.k < -EPS : c.k <= EPS) continue;
      return null;
    }
    const key = consKey(c);
    if (!seen.has(key)) {
      seen.add(key);
      cur.push(c);
    }
  }
  const stages: Array<{ v: string; cons: Cons[] }> = [];
  for (;;) {
    const vars = new Set<string>();
    for (const c of cur) for (const v of c.c.keys()) if (v !== keep) vars.add(v);
    if (vars.size === 0) break;
    let best = '';
    let bestScore = Infinity;
    for (const v of [...vars].sort()) {
      let pos = 0;
      let neg = 0;
      for (const c of cur) {
        const a = c.c.get(v);
        if (a === undefined) continue;
        if (a > 0) pos++;
        else neg++;
      }
      const score = pos * neg - pos - neg;
      if (score < bestScore) {
        bestScore = score;
        best = v;
      }
    }
    const pos: Cons[] = [];
    const neg: Cons[] = [];
    const next: Cons[] = [];
    for (const c of cur) {
      const a = c.c.get(best);
      if (a === undefined) next.push(c);
      else if (a > 0) pos.push(c);
      else neg.push(c);
    }
    stages.push({ v: best, cons: [...pos, ...neg] });
    const nextSeen = new Set(next.map(consKey));
    for (const p of pos) {
      const ap = p.c.get(best)!;
      for (const n of neg) {
        const an = -n.c.get(best)!;
        const c = new Map<string, number>();
        for (const [v, x] of p.c) if (v !== best) c.set(v, x / ap);
        for (const [v, x] of n.c) {
          if (v === best) continue;
          const val = (c.get(v) ?? 0) + x / an;
          if (Math.abs(val) < EPS) c.delete(v);
          else c.set(v, val);
        }
        const combined = normalizeCons({ c, k: p.k / ap + n.k / an, strict: p.strict || n.strict });
        if (combined.c.size === 0) {
          if (combined.strict ? combined.k < -EPS : combined.k <= EPS) continue;
          return null;
        }
        const key = consKey(combined);
        if (!nextSeen.has(key)) {
          nextSeen.add(key);
          next.push(combined);
        }
      }
    }
    if (next.length > MAX_FM_CONSTRAINTS) throw new Abstain('too many number constraints');
    cur = next;
  }
  return { stages, rest: cur };
}

function boundsFor(
  v: string,
  cons: Cons[],
  values: Map<string, number>
): { lo: number; loStrict: boolean; hi: number; hiStrict: boolean } {
  let lo = -Infinity;
  let hi = Infinity;
  let loStrict = false;
  let hiStrict = false;
  for (const c of cons) {
    const a = c.c.get(v);
    if (a === undefined) continue;
    let rest = c.k;
    for (const [u, x] of c.c) if (u !== v) rest += x * (values.get(u) ?? 0);
    const bound = round9(-rest / a);
    if (a > 0) {
      if (bound < hi || (bound === hi && c.strict)) {
        hi = bound;
        hiStrict = c.strict;
      }
    } else if (bound > lo || (bound === lo && c.strict)) {
      lo = bound;
      loStrict = c.strict;
    }
  }
  return { lo, loStrict, hi, hiStrict };
}

/** Pick a value in the range: an integer as close to the hint as possible. */
function pickValue(
  b: { lo: number; loStrict: boolean; hi: number; hiStrict: boolean },
  hint: number | undefined
): number {
  const v = pickRaw(b, hint);
  return v === 0 ? 0 : v; // never negative zero (strict JSON refuses it)
}

function pickRaw(
  b: { lo: number; loStrict: boolean; hi: number; hiStrict: boolean },
  hint: number | undefined
): number {
  const L = Number.isFinite(b.lo)
    ? b.loStrict
      ? Math.floor(b.lo) + 1
      : Math.ceil(b.lo)
    : -Infinity;
  const U = Number.isFinite(b.hi)
    ? b.hiStrict
      ? Math.ceil(b.hi) - 1
      : Math.floor(b.hi)
    : Infinity;
  let target = hint;
  if (target === undefined) {
    if (Number.isFinite(L) && Number.isFinite(U)) target = Math.round((L + U) / 2);
    else if (Number.isFinite(L)) target = Math.max(L, 0) === L ? L : 0;
    else if (Number.isFinite(U)) target = Math.min(U, 0) === U ? U : 0;
    else target = 0;
  }
  if (L <= U) return Math.min(Math.max(Math.round(target), L), U);
  if (Number.isFinite(b.lo) && Number.isFinite(b.hi)) return (b.lo + b.hi) / 2;
  return Number.isFinite(b.lo) ? b.lo + 0.5 : b.hi - 0.5;
}

function invariantCons(vars: Iterable<string>, inv: Invariants): Cons[] {
  const out: Cons[] = [];
  for (const v of vars) {
    const r = inv.num.get(v);
    if (!r) continue;
    if (Number.isFinite(r.hi)) out.push({ c: new Map([[v, 1]]), k: -r.hi, strict: false });
    if (Number.isFinite(r.lo)) out.push({ c: new Map([[v, -1]]), k: r.lo, strict: false });
  }
  return out;
}

function linearCons(lits: Lit[], inv: Invariants): Cons[] {
  const cons: Cons[] = [];
  const vars = new Set<string>();
  for (const l of lits) {
    if (l.t !== 'le') continue;
    cons.push({ c: l.lin.c, k: l.lin.k, strict: l.strict });
    for (const v of l.lin.c.keys()) vars.add(v);
  }
  return cons.concat(invariantCons(vars, inv));
}

function solveLinear(lits: Lit[], ctx: SolverContext): Map<string, number> | null {
  const elim = fmEliminate(linearCons(lits, ctx.inv), null);
  if (!elim) return null;
  const values = new Map<string, number>();
  for (let i = elim.stages.length - 1; i >= 0; i--) {
    const { v, cons } = elim.stages[i];
    values.set(v, pickValue(boundsFor(v, cons, values), ctx.numHints.get(v)));
  }
  return values;
}

function solveStrings(lits: Lit[], ctx: SolverContext): Map<string, string> | null {
  const parent = new Map<string, string>();
  const node = (t: StrTerm) => ('lit' in t ? `l:${t.lit}` : `v:${t.v}`);
  const find = (x: string): string => {
    let r = x;
    while (parent.has(r) && parent.get(r) !== r) r = parent.get(r)!;
    return r;
  };
  const add = (x: string) => {
    if (!parent.has(x)) parent.set(x, x);
  };
  const neqs: Array<[string, string]> = [];
  for (const l of lits) {
    if (l.t !== 'seq') continue;
    const a = node(l.a);
    const b = node(l.b);
    add(a);
    add(b);
    if (l.neg) neqs.push([a, b]);
    else parent.set(find(a), find(b));
  }
  // classes
  const classes = new Map<string, string[]>();
  for (const x of parent.keys()) {
    const r = find(x);
    if (!classes.has(r)) classes.set(r, []);
    classes.get(r)!.push(x);
  }
  const fixed = new Map<string, string>();
  for (const [r, members] of classes) {
    const lits2 = members.filter((m) => m.startsWith('l:')).map((m) => m.slice(2));
    if (new Set(lits2).size > 1) return null;
    if (lits2.length === 1) fixed.set(r, lits2[0]);
  }
  for (const [a, b] of neqs) if (find(a) === find(b)) return null;
  const domainOf = (r: string): string[] | null => {
    const known: Array<Set<string>> = [];
    for (const m of classes.get(r) ?? []) {
      if (!m.startsWith('v:')) continue;
      const d = ctx.inv.str.get(m.slice(2));
      if (d) known.push(d);
    }
    if (known.length === 0) return null;
    return [...known[0]].filter((x) => known.every((d) => d.has(x))).sort();
  };
  // fixed classes must sit inside their domains
  for (const [r, val] of fixed) {
    const dom = domainOf(r);
    if (dom && !dom.includes(val)) return null;
  }
  const open = [...classes.keys()].filter((r) => !fixed.has(r)).sort();
  const assignment = new Map(fixed);
  const neighbours = (r: string) =>
    neqs.flatMap(([a, b]) => (find(a) === r ? [find(b)] : find(b) === r ? [find(a)] : []));
  const candidates = (r: string): string[] => {
    const dom = domainOf(r);
    if (dom) return dom;
    const hints: string[] = [];
    for (const m of classes.get(r) ?? []) {
      const h = m.startsWith('v:') ? ctx.strHints.get(m.slice(2)) : undefined;
      if (h !== undefined) hints.push(h);
    }
    return [...new Set([...hints, ...ctx.literals, 'other', 'other 2', 'other 3'])];
  };
  const assign = (i: number): boolean => {
    if (--ctx.budget.steps < 0) throw new Abstain('search budget used up');
    if (i === open.length) return true;
    const r = open[i];
    for (const cand of candidates(r)) {
      if (neighbours(r).some((n) => assignment.get(n) === cand)) continue;
      assignment.set(r, cand);
      if (assign(i + 1)) return true;
      assignment.delete(r);
    }
    return false;
  };
  if (!assign(0)) return null;
  const out = new Map<string, string>();
  for (const [r, members] of classes) {
    for (const m of members) if (m.startsWith('v:')) out.set(m.slice(2), assignment.get(r)!);
  }
  return out;
}

function theoryCheck(lits: Lit[], ctx: SolverContext): Model | null {
  const bool = new Map<string, boolean>();
  for (const l of lits) {
    if (l.t !== 'b') continue;
    const want = !l.neg;
    const have = bool.get(l.key);
    if (have !== undefined && have !== want) return null;
    const reachable = ctx.inv.bool.get(l.key);
    if (reachable && !reachable.has(want)) return null;
    bool.set(l.key, want);
  }
  const str = solveStrings(lits, ctx);
  if (!str) return null;
  const num = solveLinear(lits, ctx);
  if (!num) return null;
  return { num, str, bool };
}

function toLit(f: Formula, neg: boolean): Lit | null {
  if (f.t === 'le') return neg ? (fNot(f) as Lit) : f;
  if (f.t === 'seq') return { t: 'seq', a: f.a, b: f.b, neg };
  if (f.t === 'b') return { t: 'b', key: f.key, neg };
  return null;
}

function quickConflict(lits: Lit[]): boolean {
  const seen = new Map<string, boolean>();
  for (const l of lits) {
    if (l.t === 'le') continue;
    const key = l.t === 'b' ? `b:${l.key}` : `s:${[tkey(l.a), tkey(l.b)].sort().join('=')}`;
    const have = seen.get(key);
    if (have !== undefined && have !== l.neg) return true;
    seen.set(key, l.neg);
  }
  return false;
}

/**
 * Search the or-branches depth first. `onModel` returns true to stop.
 * Returns true when it stopped early.
 */
function search(
  pending: Formula[],
  lits: Lit[],
  ctx: SolverContext,
  onModel: (m: Model, lits: Lit[]) => boolean
): boolean {
  if (--ctx.budget.steps < 0) throw new Abstain('search budget used up');
  const stack = [...pending];
  const ls = [...lits];
  const ors: Array<{ t: 'or'; xs: Formula[] }> = [];
  while (stack.length > 0) {
    const f = stack.pop()!;
    switch (f.t) {
      case 'T':
        break;
      case 'F':
        return false;
      case 'and':
        stack.push(...f.xs);
        break;
      case 'or':
        ors.push(f);
        break;
      case 'not': {
        const l = toLit(f.x, true);
        if (l) ls.push(l);
        else stack.push(fNot(f.x));
        break;
      }
      default: {
        const l = toLit(f, false);
        if (l) ls.push(l);
      }
    }
  }
  if (quickConflict(ls)) return false;
  if (ors.length === 0) {
    const m = theoryCheck(ls, ctx);
    return m ? onModel(m, ls) : false;
  }
  // prune before branching
  if (ls.length > lits.length && !theoryCheck(ls, ctx)) return false;
  const [first, ...rest] = ors;
  for (const d of first.xs) {
    if (search([...rest, d], ls, ctx, onModel)) return true;
  }
  return false;
}

function solve(fs: Formula[], ctx: SolverContext): Model | null {
  let found: Model | null = null;
  search(fs, [], ctx, (m) => {
    found = m;
    return true;
  });
  return found;
}

/** Range of a linear term over every case of the constraints (capped). */
function rangeOf(lin: Lin, fs: Formula[], ctx: SolverContext): NumRange {
  if (lin.c.size === 0) return { lo: lin.k, hi: lin.k };
  let lo = Infinity;
  let hi = -Infinity;
  let cases = 0;
  const T = '__range_t';
  search(fs, [], ctx, (_m, lits) => {
    if (++cases > 64) {
      lo = -Infinity;
      hi = Infinity;
      return true;
    }
    const cons = linearCons(lits, ctx.inv);
    const vars = new Set<string>();
    for (const v of lin.c.keys()) vars.add(v);
    cons.push(...invariantCons(vars, ctx.inv));
    const d = ladd(lin, lvar(T), -1);
    cons.push({ c: d.c, k: d.k, strict: false });
    const nd = lscale(d, -1);
    cons.push({ c: nd.c, k: nd.k, strict: false });
    const elim = fmEliminate(cons, T);
    if (!elim) return false;
    const b = boundsFor(T, elim.rest, new Map());
    lo = Math.min(lo, b.lo);
    hi = Math.max(hi, b.hi);
    return !Number.isFinite(lo) && !Number.isFinite(hi);
  });
  return { lo, hi };
}

// =============================================================================
// PATH EXPLORATION
// =============================================================================

interface Frame {
  s: HoloIfStatement;
  br: 0 | 1;
}

interface WriteRec {
  target: string;
  stmt: HoloAssignment;
  value: Sym;
  frames: Frame[];
  readsSelf: boolean;
}

interface Path {
  pc: Formula[];
  store: Map<string, Sym>;
  writes: WriteRec[];
  frames: Frame[];
  done: boolean;
}

interface Body {
  name: string;
  params: string[];
  statements: HoloStatement[];
}

interface Program {
  bodies: Body[];
  initial: Record<string, RuleJson>;
  /** Flattened initial state leaves: `state.a.b` -> value. */
  leaves: Map<string, RuleJson>;
  literals: string[];
}

function memberPath(expression: HoloExpression): string[] | null {
  const parts: string[] = [];
  let cur: HoloExpression = expression;
  while (cur.type === 'MemberExpression') {
    if (cur.computed) return null;
    parts.push(cur.property);
    cur = cur.object;
  }
  if (cur.type !== 'Identifier') return null;
  return [cur.name, ...parts.reverse()];
}

function entrySym(key: string, value: RuleJson): Sym {
  if (typeof value === 'number') return { k: 'num', lin: lvar(key) };
  if (typeof value === 'string') return { k: 'str', term: { v: key } };
  if (typeof value === 'boolean') return { k: 'bool', f: { t: 'b', key } };
  if (value === null) return { k: 'var', key };
  return { k: 'obj', key };
}

function readsTarget(expr: HoloExpression | undefined, target: string): boolean {
  let found = false;
  const visit = (e: HoloExpression | undefined): void => {
    if (!e || found) return;
    if (e.type === 'MemberExpression') {
      const p = memberPath(e);
      if (p && (p.join('.') === target || target.startsWith(p.join('.') + '.'))) found = true;
      else visit(e.object);
      return;
    }
    if (e.type === 'Identifier') {
      if (e.name === target) found = true;
      return;
    }
    for (const child of childExpressions(e)) visit(child);
  };
  visit(expr);
  return found;
}

function childExpressions(e: HoloExpression): HoloExpression[] {
  switch (e.type) {
    case 'BinaryExpression':
      return [e.left, e.right];
    case 'UnaryExpression':
      return [e.argument];
    case 'MemberExpression':
      return [e.object];
    case 'CallExpression':
      return [e.callee, ...e.arguments];
    case 'ArrayExpression':
      return e.elements;
    case 'ObjectExpression':
      return e.properties.map((p) => p.value);
    case 'ConditionalExpression':
      return [e.test, e.consequent, e.alternate];
    case 'UpdateExpression':
      return [e.argument];
    default:
      return [];
  }
}

class Explorer {
  constructor(
    private readonly program: Program,
    private readonly ctx: SolverContext,
    private readonly maxPaths: number
  ) {}

  run(body: Body): Path[] {
    const store = new Map<string, Sym>();
    for (const [key, value] of this.program.leaves) store.set(key, entrySym(key, value));
    const start: Path = { pc: [], store, writes: [], frames: [], done: false };
    return this.block(body.statements, [start], new Set(body.params));
  }

  private block(stmts: HoloStatement[], paths: Path[], params: Set<string>): Path[] {
    let current = paths;
    for (const s of stmts) {
      const next: Path[] = [];
      for (const p of current) {
        if (p.done) next.push(p);
        else next.push(...this.stmt(s, p, params));
      }
      if (next.length > this.maxPaths) throw new Abstain(`more than ${this.maxPaths} paths`);
      current = next;
    }
    return current;
  }

  private stmt(s: HoloStatement, p: Path, params: Set<string>): Path[] {
    switch (s.type) {
      case 'Assignment': {
        const target = s.target;
        const rhs = this.eval(s.value, p.store, params);
        if (!target.includes('.')) {
          p.store.set(`local:${target}`, rhs);
          return [p];
        }
        const old = p.store.get(target) ?? { k: 'var', key: `op:missing(${target})` };
        let value: Sym = rhs;
        if (s.operator !== '=') value = arith(s.operator.slice(0, 1), old, rhs);
        for (const key of [...p.store.keys()])
          if (key.startsWith(target + '.')) p.store.delete(key);
        p.store.set(target, value);
        p.writes.push({
          target,
          stmt: s,
          value,
          frames: [...p.frames],
          readsSelf: s.operator !== '=' || readsTarget(s.value, target),
        });
        return [p];
      }
      case 'VariableDeclaration':
        p.store.set(
          `local:${s.name}`,
          s.value ? this.eval(s.value, p.store, params) : { k: 'null' }
        );
        return [p];
      case 'ReturnStatement':
        p.done = true;
        return [p];
      case 'IfStatement': {
        const c = truth(this.eval(s.condition, p.store, params));
        const out: Path[] = [];
        const branches: Array<[Formula, HoloStatement[], 0 | 1]> = [
          [c, s.consequent, 0],
          [fNot(c), s.alternate ?? [], 1],
        ];
        for (const [cond, stmts, br] of branches) {
          if (cond.t === 'F') continue;
          const pc = cond.t === 'T' ? p.pc : [...p.pc, cond];
          if (cond.t !== 'T' && !solve(pc, this.ctx)) continue;
          const fork: Path = {
            pc,
            store: new Map(p.store),
            writes: [...p.writes],
            frames: [...p.frames, { s, br }],
            done: false,
          };
          for (const q of this.block(stmts, [fork], params)) {
            if (!q.done) q.frames = q.frames.slice(0, p.frames.length);
            out.push(q);
          }
        }
        return out;
      }
      case 'EmitStatement':
      case 'ExpressionStatement':
      case 'MethodCall':
        return [p];
      default:
        throw new Abstain(`statement "${s.type}" is outside the checked subset`);
    }
  }

  eval(e: HoloExpression, store: Map<string, Sym>, params: Set<string>): Sym {
    switch (e.type) {
      case 'Literal': {
        const v = e.value;
        if (typeof v === 'number') return { k: 'num', lin: lconst(v) };
        if (typeof v === 'string') return { k: 'str', term: { lit: v } };
        if (typeof v === 'boolean') return { k: 'bool', f: v ? TRUE : FALSE };
        return { k: 'null' };
      }
      case 'Identifier': {
        if (params.has(e.name)) return { k: 'var', key: `arg.${e.name}` };
        const local = store.get(`local:${e.name}`);
        if (local) return local;
        return { k: 'var', key: `op:id(${e.name})` };
      }
      case 'MemberExpression': {
        const path = memberPath(e);
        if (!path) return { k: 'var', key: `op:member(${JSON.stringify(e)})` };
        if (path[0] === 'state') {
          const key = path.join('.');
          const hit = store.get(key);
          if (hit) return hit;
          return { k: 'var', key: `op:missing(${key})` };
        }
        if (params.has(path[0])) return { k: 'var', key: `arg.${path.join('.')}` };
        const local = store.get(`local:${path[0]}`);
        return {
          k: 'var',
          key: `op:path(${local ? skey(local) : path[0]}.${path.slice(1).join('.')})`,
        };
      }
      case 'UnaryExpression': {
        const a = this.eval(e.argument, store, params);
        if (e.operator === '!') return { k: 'bool', f: fNot(truth(a)) };
        return arith('-', { k: 'num', lin: lconst(0) }, a);
      }
      case 'BinaryExpression': {
        const op = e.operator;
        const a = this.eval(e.left, store, params);
        const b = this.eval(e.right, store, params);
        switch (op) {
          case '&&':
            return { k: 'bool', f: fAnd(truth(a), truth(b)) };
          case '||':
            return { k: 'bool', f: fOr(truth(a), truth(b)) };
          case '==':
          case '===':
            return { k: 'bool', f: equal(a, b) };
          case '!=':
          case '!==':
            return { k: 'bool', f: fNot(equal(a, b)) };
          case '<':
          case '<=':
          case '>':
          case '>=':
            return { k: 'bool', f: compare(op, a, b) };
          case '+':
          case '-':
          case '*':
          case '/':
            return arith(op, a, b);
          case '??':
            return lift1(a, (x) => (x.k === 'null' ? b : x.k === 'var' ? opaque('??', [x, b]) : x));
          default:
            return opaque(op, [a, b]);
        }
      }
      case 'ConditionalExpression':
        return mkIte(
          truth(this.eval(e.test, store, params)),
          this.eval(e.consequent, store, params),
          this.eval(e.alternate, store, params)
        );
      case 'CallExpression': {
        const args = e.arguments.map((a) => this.eval(a, store, params));
        const name = e.callee.type === 'Identifier' ? e.callee.name : null;
        if ((name === 'min' || name === 'max') && args.length === 2) {
          const [x, y] = args;
          return mkIte(compare(name === 'min' ? '<=' : '>=', x, y), x, y);
        }
        if (name === 'abs' && args.length === 1) {
          const [x] = args;
          return mkIte(
            compare('<', x, { k: 'num', lin: lconst(0) }),
            arith('-', { k: 'num', lin: lconst(0) }, x),
            x
          );
        }
        return opaque(`call:${name ?? JSON.stringify(e.callee)}`, args);
      }
      default:
        return { k: 'obj', key: `expr:${JSON.stringify(e)}` };
    }
  }
}

// =============================================================================
// INVARIANTS — what each state value can ever be, as a fixpoint over all
// actions starting from the declared initial state.
// =============================================================================

function cloneInv(inv: Invariants): Invariants {
  return {
    num: new Map([...inv.num].map(([k, r]) => [k, { ...r }])),
    str: new Map([...inv.str].map(([k, s]) => [k, s ? new Set(s) : null])),
    bool: new Map([...inv.bool].map(([k, s]) => [k, new Set(s)])),
  };
}

function sameInv(a: Invariants, b: Invariants): boolean {
  for (const [k, r] of a.num) {
    const o = b.num.get(k);
    if (!o || o.lo !== r.lo || o.hi !== r.hi) return false;
  }
  for (const [k, s] of a.str) {
    const o = b.str.get(k);
    if (s === null || o === null || o === undefined) {
      if (s !== o) return false;
      continue;
    }
    if (s.size !== o.size || [...s].some((x) => !o.has(x))) return false;
  }
  for (const [k, s] of a.bool) {
    const o = b.bool.get(k);
    if (!o || o.size !== s.size) return false;
  }
  return true;
}

function cases(s: Sym, c: Formula = TRUE): Array<{ c: Formula; v: Sym }> {
  if (s.k === 'ite') return [...cases(s.a, fAnd(c, s.c)), ...cases(s.b, fAnd(c, fNot(s.c)))];
  return [{ c, v: s }];
}

function computeInvariants(
  program: Program,
  ctxBase: Omit<SolverContext, 'inv'>,
  maxPaths: number
) {
  const inv: Invariants = { num: new Map(), str: new Map(), bool: new Map() };
  for (const [key, value] of program.leaves) {
    if (typeof value === 'number') inv.num.set(key, { lo: value, hi: value });
    if (typeof value === 'string') inv.str.set(key, new Set([value]));
    if (typeof value === 'boolean') inv.bool.set(key, new Set([value]));
  }
  const skipped = new Map<string, string>();
  let current = inv;
  const MAX_ROUNDS = 8;
  for (let round = 1; round <= MAX_ROUNDS; round++) {
    const next = cloneInv(current);
    const ctx: SolverContext = { ...ctxBase, inv: current };
    const explorer = new Explorer(program, ctx, maxPaths);
    for (const body of program.bodies) {
      let paths: Path[];
      try {
        paths = explorer.run(body);
      } catch (error) {
        if (!(error instanceof Abstain)) throw error;
        skipped.set(body.name, error.message);
        // Unknown effects: anything this body writes could be anything.
        for (const key of writtenTargets(body.statements)) {
          if (next.num.has(key)) next.num.set(key, { lo: -Infinity, hi: Infinity });
          if (next.str.has(key)) next.str.set(key, null);
          if (next.bool.has(key)) next.bool.set(key, new Set([true, false]));
        }
        continue;
      }
      for (const path of paths) {
        const written = new Set(path.writes.map((w) => w.target));
        for (const key of written) {
          const value = path.store.get(key);
          if (!value) continue;
          if (next.num.has(key)) {
            const r = next.num.get(key)!;
            for (const kase of cases(value)) {
              // inputs and opaque terms are numeric leaves here; strings or booleans are not
              const lin = numOf(kase.v);
              if (!lin) {
                r.lo = -Infinity;
                r.hi = Infinity;
                continue;
              }
              const b = rangeOf(lin, [...path.pc, kase.c], ctx);
              r.lo = Math.min(r.lo, b.lo);
              r.hi = Math.max(r.hi, b.hi);
            }
          }
          const flags = next.bool.get(key);
          if (flags && flags.size < 2) {
            for (const kase of cases(value)) {
              const f = kase.v.k === 'bool' || kase.v.k === 'var' ? truth(kase.v) : null;
              if (!f) {
                flags.add(true).add(false);
                break;
              }
              const fs = [...path.pc, kase.c];
              if (!flags.has(true) && solve([...fs, f], ctx)) flags.add(true);
              if (!flags.has(false) && solve([...fs, fNot(f)], ctx)) flags.add(false);
            }
          }
          if (next.str.has(key)) {
            const set = next.str.get(key);
            if (set === null || set === undefined) continue;
            for (const kase of cases(value)) {
              const term = strOf(kase.v);
              if (!term) {
                next.str.set(key, null);
                break;
              }
              if ('lit' in term) {
                set.add(term.lit);
                continue;
              }
              const prior = current.str.get(term.v);
              if (prior) {
                for (const x of prior) set.add(x);
                continue;
              }
              // an input: which known strings can it be on this path, and can it be another?
              const fs = [...path.pc, kase.c];
              let open = false;
              for (const lit of ctx.literals) {
                if (solve([...fs, mkSeq(term, { lit })], ctx)) set.add(lit);
              }
              const outside = fAnd(...ctx.literals.map((lit) => fNot(mkSeq(term, { lit }))));
              if (solve([...fs, outside], ctx)) open = true;
              if (open) {
                next.str.set(key, null);
                break;
              }
            }
          }
        }
      }
    }
    if (round >= 3) {
      // widen whatever is still growing
      for (const [key, r] of next.num) {
        const o = current.num.get(key)!;
        if (r.lo < o.lo) r.lo = -Infinity;
        if (r.hi > o.hi) r.hi = Infinity;
      }
      for (const [key, s] of next.str) {
        const o = current.str.get(key);
        if (s && o && s.size > o.size) next.str.set(key, null);
      }
    }
    if (sameInv(next, current)) return { inv: current, skipped };
    current = next;
  }
  // No fixpoint: fall back to knowing nothing (sound).
  for (const r of current.num.values()) {
    r.lo = -Infinity;
    r.hi = Infinity;
  }
  for (const key of current.str.keys()) current.str.set(key, null);
  for (const key of current.bool.keys()) current.bool.set(key, new Set([true, false]));
  return { inv: current, skipped };
}

function writtenTargets(stmts: HoloStatement[]): Set<string> {
  const out = new Set<string>();
  const visit = (list: HoloStatement[]) => {
    for (const s of list) {
      if (s.type === 'Assignment' && s.target.includes('.')) out.add(s.target);
      if (s.type === 'IfStatement') {
        visit(s.consequent);
        visit(s.alternate ?? []);
      }
      if ('body' in s && Array.isArray((s as { body?: unknown }).body)) {
        visit((s as unknown as { body: HoloStatement[] }).body);
      }
    }
  };
  visit(stmts);
  return out;
}

// =============================================================================
// CONCRETE REPLAY — the same rules as the headless runtime, with a trace.
// =============================================================================

class ReplayError extends Error {}

interface Replay {
  writes: Array<{ stmt: HoloAssignment; target: string; value: RuleJson }>;
  snapshots: Map<
    HoloIfStatement,
    { state: Record<string, RuleJson>; locals: Record<string, RuleJson> }
  >;
}

const BUILTINS: Record<string, (args: number[]) => number> = {
  sqrt: ([x]) => Math.sqrt(x),
  sin: ([x]) => Math.sin(x),
  cos: ([x]) => Math.cos(x),
  acos: ([x]) => Math.acos(x),
  abs: ([x]) => Math.abs(x),
  floor: ([x]) => Math.floor(x),
  min: ([x, y]) => Math.min(x, y),
  max: ([x, y]) => Math.max(x, y),
};

function cloneJson<T extends RuleJson>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

function isRecord(v: unknown): v is Record<string, RuleJson> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function replay(
  body: Body,
  state0: Record<string, RuleJson>,
  args: Record<string, RuleJson>
): Replay {
  const state = cloneJson(state0);
  const locals: Record<string, RuleJson> = {};
  const out: Replay = { writes: [], snapshots: new Map() };
  const num = (v: RuleJson): number => {
    if (typeof v !== 'number') throw new ReplayError('number expected');
    return v;
  };
  const bool = (v: RuleJson): boolean => {
    if (typeof v !== 'boolean') throw new ReplayError('boolean expected');
    return v;
  };
  const read = (path: string[]): RuleJson => {
    let v: RuleJson | undefined;
    const [root, ...parts] = path;
    if (root === 'state') v = state;
    else if (Object.prototype.hasOwnProperty.call(args, root)) v = args[root];
    else v = locals[root];
    for (const part of parts) {
      if (!isRecord(v) || !Object.prototype.hasOwnProperty.call(v, part)) {
        throw new ReplayError(`missing ${path.join('.')}`);
      }
      v = v[part];
    }
    if (v === undefined) throw new ReplayError(`missing ${path.join('.')}`);
    return v;
  };
  const ev = (e: HoloExpression): RuleJson => {
    switch (e.type) {
      case 'Literal':
        return e.value;
      case 'Identifier':
        if (Object.prototype.hasOwnProperty.call(args, e.name)) return args[e.name];
        if (Object.prototype.hasOwnProperty.call(locals, e.name)) return locals[e.name];
        throw new ReplayError(`unknown ${e.name}`);
      case 'MemberExpression': {
        const path = memberPath(e);
        if (!path) throw new ReplayError('computed member');
        return read(path);
      }
      case 'UnaryExpression': {
        const a = ev(e.argument);
        return e.operator === '!' ? !bool(a) : -num(a);
      }
      case 'BinaryExpression': {
        const left = ev(e.left);
        if (e.operator === '&&') return bool(left) ? bool(ev(e.right)) : false;
        if (e.operator === '||') return bool(left) ? true : bool(ev(e.right));
        if (e.operator === '??') return left === null ? ev(e.right) : left;
        const right = ev(e.right);
        switch (e.operator) {
          case '+':
            if (typeof left === 'number' && typeof right === 'number') return left + right;
            if (typeof left === 'string' && typeof right === 'string') return left + right;
            throw new ReplayError('bad +');
          case '-':
            return num(left) - num(right);
          case '*':
            return num(left) * num(right);
          case '/':
            if (num(right) === 0) throw new ReplayError('division by zero');
            return num(left) / num(right);
          case '==':
          case '===':
            if (typeof left === 'object' && left !== null) throw new ReplayError('object equality');
            if (typeof right === 'object' && right !== null)
              throw new ReplayError('object equality');
            return left === right;
          case '!=':
          case '!==':
            if (typeof left === 'object' && left !== null) throw new ReplayError('object equality');
            if (typeof right === 'object' && right !== null)
              throw new ReplayError('object equality');
            return left !== right;
          case '<':
            return num(left) < num(right);
          case '>':
            return num(left) > num(right);
          case '<=':
            return num(left) <= num(right);
          case '>=':
            return num(left) >= num(right);
          default:
            throw new ReplayError(`operator ${e.operator}`);
        }
      }
      case 'ConditionalExpression':
        return bool(ev(e.test)) ? ev(e.consequent) : ev(e.alternate);
      case 'ObjectExpression': {
        const o: Record<string, RuleJson> = {};
        for (const p of e.properties) o[p.key] = ev(p.value);
        return o;
      }
      case 'ArrayExpression':
        return e.elements.map(ev);
      case 'CallExpression': {
        if (e.callee.type !== 'Identifier' || !BUILTINS[e.callee.name]) {
          throw new ReplayError('call outside the replayable subset');
        }
        return BUILTINS[e.callee.name](e.arguments.map((a) => num(ev(a))));
      }
      default:
        throw new ReplayError(`expression ${e.type}`);
    }
  };
  const exec = (stmts: HoloStatement[]): boolean => {
    for (const s of stmts) {
      switch (s.type) {
        case 'Assignment': {
          const incoming = ev(s.value);
          if (!s.target.includes('.')) {
            locals[s.target] = incoming;
            break;
          }
          const path = s.target.split('.').slice(1);
          let holder: Record<string, RuleJson> = state;
          for (const part of path.slice(0, -1)) {
            const nextHolder = holder[part];
            if (!isRecord(nextHolder)) throw new ReplayError('undeclared object state');
            holder = nextHolder;
          }
          const leaf = path[path.length - 1];
          if (!Object.prototype.hasOwnProperty.call(holder, leaf)) {
            throw new ReplayError('undeclared state');
          }
          const current = holder[leaf];
          let value: RuleJson;
          switch (s.operator) {
            case '=':
              value = incoming;
              break;
            case '+=':
              if (typeof current === 'number' && typeof incoming === 'number')
                value = current + incoming;
              else if (typeof current === 'string' && typeof incoming === 'string')
                value = current + incoming;
              else throw new ReplayError('bad +=');
              break;
            case '-=':
              value = num(current) - num(incoming);
              break;
            case '*=':
              value = num(current) * num(incoming);
              break;
            default:
              if (num(incoming) === 0) throw new ReplayError('division by zero');
              value = num(current) / num(incoming);
          }
          holder[leaf] = value;
          out.writes.push({ stmt: s, target: s.target, value: cloneJson(value) });
          break;
        }
        case 'VariableDeclaration':
          locals[s.name] = s.value ? ev(s.value) : null;
          break;
        case 'IfStatement': {
          if (!out.snapshots.has(s)) {
            out.snapshots.set(s, { state: cloneJson(state), locals: cloneJson(locals) });
          }
          if (exec(bool(ev(s.condition)) ? s.consequent : (s.alternate ?? []))) return true;
          break;
        }
        case 'ReturnStatement':
          if (s.value) ev(s.value);
          return true;
        case 'EmitStatement':
          if (s.data) ev(s.data);
          break;
        default:
          break;
      }
    }
    return false;
  };
  exec(body.statements);
  return out;
}

function jsonEqual(a: RuleJson, b: RuleJson): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

// =============================================================================
// RULE LABELS AND DECLARED PRIORITIES (from comments)
// =============================================================================

interface CommentInfo {
  labels: Map<number, string>;
  priorities: Array<{ winner: string; loser: string; line: number }>;
}

function commentOf(line: string): { code: string; comment: string } | null {
  let quote: string | null = null;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quote) {
      if (ch === '\\') i++;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') quote = ch;
    else if (ch === '/' && line[i + 1] === '/') {
      return { code: line.slice(0, i), comment: line.slice(i + 2).trim() };
    }
  }
  return null;
}

function cleanLabel(raw: string): string {
  return raw.trim().replace(/[.,;:]+$/, '');
}

const LABEL_RE = /^rules?\s+([0-9A-Za-z][\w.-]*(?:\s*(?:,|and)\s*[0-9A-Za-z][\w.-]*)*)/i;
const PRIORITY_RE = /\brule\s+([0-9A-Za-z][\w.-]*)\s+wins\s+over\s+rule\s+([0-9A-Za-z][\w.-]*)/i;

function readComments(source: string): CommentInfo {
  const lines = source.split(/\r?\n/);
  const labels = new Map<number, string>();
  const priorities: CommentInfo['priorities'] = [];
  let pending: string | null = null;
  for (let i = 0; i < lines.length; i++) {
    const lineNo = i + 1;
    const parsed = commentOf(lines[i]);
    const code = parsed ? parsed.code : lines[i];
    const comment = parsed?.comment ?? '';
    const priority = PRIORITY_RE.exec(comment);
    if (priority) {
      priorities.push({
        winner: cleanLabel(priority[1]),
        loser: cleanLabel(priority[2]),
        line: lineNo,
      });
    }
    const label = priority ? null : LABEL_RE.exec(comment);
    if (code.trim().length > 0) {
      if (label) labels.set(lineNo, cleanLabel(label[1]));
      else if (pending !== null) labels.set(lineNo, pending);
      pending = null;
    } else if (label) {
      pending = cleanLabel(label[1]);
    }
  }
  return { labels, priorities };
}

// =============================================================================
// PLAIN WORDS
// =============================================================================

function words(name: string): string {
  return name
    .replace(/[_.]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .toLowerCase()
    .trim();
}

function targetWords(target: string): string {
  return words(target.split('.').slice(1).join(' '));
}

function valueWords(v: RuleJson): string {
  if (typeof v === 'boolean') return v ? 'yes' : 'no';
  if (v === null) return 'nothing';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

function listWords(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

function effectWords(target: string, v: RuleJson, first: boolean): string {
  const name = first ? targetWords(target) : 'it';
  if (typeof v === 'boolean') return `turns ${name} ${v ? 'on' : 'off'}`;
  return `sets ${name} to ${valueWords(v)}`;
}

function ruleName(label: string): string {
  return /,|\band\b/.test(label) ? `rules ${label}` : `rule ${label}`;
}

function capital(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function witnessWords(action: string, shown: RuleConflictWitness['shown']): string {
  const given = shown.filter((s) => s.given).map((s) => `${words(s.name)} ${valueWords(s.value)}`);
  const held = shown
    .filter((s) => !s.given)
    .map((s) => `${words(s.name)} is ${valueWords(s.value)}`);
  if (given.length > 0 && held.length > 0) {
    return `${action} is given ${listWords(given)}, while ${listWords(held)}`;
  }
  if (given.length > 0) return `${action} is given ${listWords(given)}`;
  if (held.length > 0) return listWords(held);
  return `${action} runs`;
}

// =============================================================================
// THE CHECK
// =============================================================================

function programOf(ast: HoloComposition): Program {
  const initial: Record<string, RuleJson> = {};
  for (const prop of ast.state?.properties ?? []) initial[prop.key] = prop.value as RuleJson;
  const leaves = new Map<string, RuleJson>();
  const flatten = (prefix: string, value: RuleJson) => {
    leaves.set(prefix, value);
    if (isRecord(value)) for (const [k, v] of Object.entries(value)) flatten(`${prefix}.${k}`, v);
  };
  for (const [k, v] of Object.entries(initial)) flatten(`state.${k}`, v);
  const bodies: Body[] = [];
  for (const action of ast.logic?.actions ?? []) {
    bodies.push({
      name: action.name,
      params: action.parameters.map((p) => p.name),
      statements: action.body,
    });
  }
  for (const handler of ast.logic?.handlers ?? []) {
    bodies.push({
      name: handler.event,
      params: handler.parameters.map((p) => p.name),
      statements: handler.body,
    });
  }
  const literals = new Set<string>();
  for (const v of leaves.values()) if (typeof v === 'string') literals.add(v);
  const visitExpr = (e: HoloExpression | undefined): void => {
    if (!e) return;
    if (e.type === 'Literal' && typeof e.value === 'string') literals.add(e.value);
    for (const c of childExpressions(e)) visitExpr(c);
  };
  const visit = (list: HoloStatement[]) => {
    for (const s of list) {
      if (s.type === 'Assignment') visitExpr(s.value);
      if (s.type === 'IfStatement') {
        visitExpr(s.condition);
        visit(s.consequent);
        visit(s.alternate ?? []);
      }
    }
  };
  for (const b of bodies) visit(b.statements);
  return { bodies, initial, leaves, literals: [...literals].sort() };
}

function hasRuleShape(body: Body): boolean {
  // at least two guarded writes to the same target
  const counts = new Map<string, number>();
  const visit = (list: HoloStatement[], guarded: boolean) => {
    for (const s of list) {
      if (s.type === 'Assignment' && guarded && s.target.includes('.')) {
        counts.set(s.target, (counts.get(s.target) ?? 0) + 1);
      }
      if (s.type === 'IfStatement') {
        visit(s.consequent, true);
        visit(s.alternate ?? [], true);
      }
    }
  };
  visit(body.statements, false);
  return [...counts.values()].some((n) => n >= 2);
}

function labelFor(w: WriteRec, labels: Map<number, string>): string | undefined {
  const own = w.stmt.loc ? labels.get(w.stmt.loc.start.line) : undefined;
  if (own) return own;
  for (let i = w.frames.length - 1; i >= 0; i--) {
    const loc = w.frames[i].s.loc;
    const label = loc ? labels.get(loc.start.line) : undefined;
    if (label) return label;
  }
  return undefined;
}

function readNames(exprs: Array<HoloExpression | undefined>, params: Set<string>) {
  const out: Array<{ name: string; given: boolean; path: string[] }> = [];
  const seen = new Set<string>();
  const visit = (e: HoloExpression | undefined): void => {
    if (!e) return;
    if (e.type === 'MemberExpression') {
      const path = memberPath(e);
      if (path) {
        const key = path.join('.');
        if (!seen.has(key)) {
          seen.add(key);
          if (path[0] === 'state') out.push({ name: path.slice(1).join('.'), given: false, path });
          else out.push({ name: key, given: params.has(path[0]), path });
        }
        return;
      }
    }
    if (e.type === 'Identifier') {
      if (!seen.has(e.name)) {
        seen.add(e.name);
        out.push({ name: e.name, given: params.has(e.name), path: [e.name] });
      }
      return;
    }
    for (const c of childExpressions(e)) visit(c);
  };
  for (const e of exprs) visit(e);
  return out;
}

function modelInputs(
  model: Model,
  program: Program,
  body: Body
): { state: Record<string, RuleJson>; args: Record<string, RuleJson> } {
  const state = cloneJson(program.initial);
  const setLeaf = (key: string, value: RuleJson) => {
    const path = key.split('.').slice(1);
    let holder: Record<string, RuleJson> = state;
    for (const part of path.slice(0, -1)) {
      const next = holder[part];
      if (!isRecord(next)) return;
      holder = next;
    }
    holder[path[path.length - 1]] = value;
  };
  for (const [key, initialValue] of program.leaves) {
    if (typeof initialValue === 'number' && model.num.has(key)) setLeaf(key, model.num.get(key)!);
    if (typeof initialValue === 'string' && model.str.has(key)) setLeaf(key, model.str.get(key)!);
    if (typeof initialValue === 'boolean' && model.bool.has(key))
      setLeaf(key, model.bool.get(key)!);
    if (initialValue === null) {
      if (model.num.has(key)) setLeaf(key, model.num.get(key)!);
      else if (model.str.has(key)) setLeaf(key, model.str.get(key)!);
      else if (model.bool.has(key)) setLeaf(key, model.bool.get(key)!);
    }
  }
  const args: Record<string, RuleJson> = {};
  for (const p of body.params) {
    const key = `arg.${p}`;
    if (model.num.has(key)) args[p] = model.num.get(key)!;
    else if (model.str.has(key)) args[p] = model.str.get(key)!;
    else if (model.bool.has(key)) args[p] = model.bool.get(key)!;
    else {
      const same = program.initial[p];
      args[p] = same !== undefined && !isRecord(same) && !Array.isArray(same) ? same : 0;
    }
  }
  return { state, args };
}

/**
 * Check a parsed composition. `source` is used for rule labels and declared
 * priorities (comments); pass '' when there is none.
 */
export function findRuleConflictsInComposition(
  ast: HoloComposition,
  source: string,
  options: RuleConflictOptions = {}
): RuleConflictReport {
  const report: RuleConflictReport = {
    conflicts: [],
    skipped: [],
    checkedActions: [],
    unconfirmed: 0,
  };
  const program = programOf(ast);
  const candidates = program.bodies.filter(hasRuleShape);
  if (candidates.length === 0) {
    report.checkedActions = program.bodies.map((b) => b.name);
    return report;
  }
  const maxPaths = options.maxPathsPerAction ?? 1024;
  const numHints = new Map<string, number>();
  const strHints = new Map<string, string>();
  for (const [key, value] of program.leaves) {
    const shortName = key.split('.').slice(1).join('.');
    if (typeof value === 'number') {
      numHints.set(key, value);
      numHints.set(`arg.${shortName}`, value);
    }
    if (typeof value === 'string') {
      strHints.set(key, value);
      strHints.set(`arg.${shortName}`, value);
    }
  }
  const ctxBase = {
    numHints,
    strHints,
    literals: program.literals,
    budget: { steps: options.maxSolverSteps ?? 400000 },
  };
  let invariants: Invariants;
  try {
    const computed = computeInvariants(program, ctxBase, maxPaths);
    invariants = computed.inv;
  } catch (error) {
    if (!(error instanceof Abstain)) throw error;
    for (const b of candidates) report.skipped.push({ action: b.name, reason: error.message });
    return report;
  }
  const ctx: SolverContext = { ...ctxBase, inv: invariants };
  const comments = readComments(source);
  const explorer = new Explorer(program, ctx, maxPaths);
  for (const body of program.bodies) {
    if (!candidates.includes(body)) {
      report.checkedActions.push(body.name);
      continue;
    }
    let paths: Path[];
    try {
      paths = explorer.run(body);
    } catch (error) {
      if (!(error instanceof Abstain)) throw error;
      report.skipped.push({ action: body.name, reason: error.message });
      continue;
    }
    const decided = new Set<string>();
    try {
      for (const path of paths) {
        const lastWrite = new Map<string, WriteRec>();
        for (const w of path.writes) {
          const prev = lastWrite.get(w.target);
          lastWrite.set(w.target, w);
          if (!prev) continue;
          let k = 0;
          while (
            k < prev.frames.length &&
            k < w.frames.length &&
            prev.frames[k].s === w.frames[k].s &&
            prev.frames[k].br === w.frames[k].br
          ) {
            k++;
          }
          const r1 = prev.frames.slice(k);
          const r2 = w.frames.slice(k);
          // a default that a rule overrides, or a later unconditional write: decided
          if (r1.length === 0 || r2.length === 0) continue;
          // one finding per pair of rules (their outermost unshared `if`s) and target
          const pairKey = `${w.target}|${ifKey(r1[0].s)}|${ifKey(r2[0].s)}`;
          if (decided.has(pairKey)) continue;
          // the later rule builds on the earlier value (+=, x = x + 1): not an override
          if (w.readsSelf) continue;
          const d = differ(prev.value, w.value);
          if (d.t === 'F') continue;
          const model = solve([...path.pc, d], ctx);
          if (!model) continue;
          const finding = confirm(program, body, prev, w, r1, r2, model, comments);
          if (!finding) {
            report.unconfirmed++;
            continue;
          }
          decided.add(pairKey);
          if (finding !== 'declared') report.conflicts.push(finding);
        }
      }
      report.checkedActions.push(body.name);
    } catch (error) {
      if (!(error instanceof Abstain)) throw error;
      report.skipped.push({ action: body.name, reason: error.message });
    }
  }
  return report;
}

const ifKeys = new WeakMap<HoloIfStatement, string>();
let ifKeyCounter = 0;
function ifKey(s: HoloIfStatement): string {
  let key = ifKeys.get(s);
  if (!key) {
    key = s.loc ? `${s.loc.start.line}:${s.loc.start.column}` : `if#${++ifKeyCounter}`;
    ifKeys.set(s, key);
  }
  return key;
}

function confirm(
  program: Program,
  body: Body,
  w1: WriteRec,
  w2: WriteRec,
  r1: Frame[],
  r2: Frame[],
  model: Model,
  comments: CommentInfo
): RuleConflict | 'declared' | null {
  const inputs = modelInputs(model, program, body);
  let run: Replay;
  try {
    run = replay(body, inputs.state, inputs.args);
  } catch (error) {
    if (error instanceof ReplayError) return null;
    throw error;
  }
  const i = run.writes.findIndex((x) => x.stmt === w1.stmt);
  if (i < 0) return null;
  const j = run.writes.findIndex((x, idx) => idx > i && x.target === w1.target);
  if (j < 0 || run.writes[j].stmt !== w2.stmt) return null;
  const v1 = run.writes[i].value;
  const v2 = run.writes[j].value;
  if (jsonEqual(v1, v2)) return null;

  const params = new Set(body.params);
  const firstIf = r1[0].s;
  const snapshot = run.snapshots.get(firstIf) ?? { state: inputs.state, locals: {} };
  const reads = readNames(
    [
      ...r1.map((f) => f.s.condition),
      w1.stmt.value,
      ...r2.map((f) => f.s.condition),
      w2.stmt.value,
    ],
    params
  );
  const shown: RuleConflictWitness['shown'] = [];
  for (const r of reads) {
    let value: RuleJson | undefined;
    if (r.given) {
      value = inputs.args[r.path[0]];
      for (const part of r.path.slice(1)) value = isRecord(value) ? value[part] : undefined;
    } else if (r.path[0] === 'state') {
      value = snapshot.state;
      for (const part of r.path.slice(1)) value = isRecord(value) ? value[part] : undefined;
    } else {
      value = snapshot.locals[r.path[0]];
      for (const part of r.path.slice(1)) value = isRecord(value) ? value[part] : undefined;
    }
    if (value === undefined) continue;
    shown.push({ name: r.name, value, given: r.given });
  }

  const label1 = labelFor(w1, comments.labels);
  const label2 = labelFor(w2, comments.labels);
  const line1 = firstIf.loc?.start.line ?? 0;
  const line2 = r2[0].s.loc?.start.line ?? 0;
  const first: RuleConflictSide = {
    label: label1,
    line: line1,
    writeLine: w1.stmt.loc?.start.line ?? 0,
    value: v1,
    effect: effectWords(w1.target, v1, true),
  };
  const second: RuleConflictSide = {
    label: label2,
    line: line2,
    writeLine: w2.stmt.loc?.start.line ?? 0,
    value: v2,
    effect: effectWords(w1.target, v2, true),
  };
  const witness: RuleConflictWitness = { state: inputs.state, args: inputs.args, shown };
  const when = witnessWords(body.name, shown);
  const e1 = effectWords(w1.target, v1, true);
  const e2 = effectWords(w1.target, v2, false);

  if (label1 && label2 && label1 !== label2) {
    const n1 = ruleName(label1);
    const n2 = ruleName(label2);
    const declared = comments.priorities.find(
      (p) =>
        (p.winner === label1 && p.loser === label2) || (p.winner === label2 && p.loser === label1)
    );
    if (declared && declared.winner === label2) return 'declared';
    if (declared) {
      return {
        kind: 'priority-mismatch',
        action: body.name,
        target: w1.target,
        first,
        second,
        witness,
        declared,
        message:
          `You said ${n1} wins over ${n2}, but as written ${n2} wins when ${when}: ` +
          `${n1} ${e1}, but ${n2} ${e2}.`,
        suggestion: `Change the rules so ${n2} does not apply then, or change what you said on line ${declared.line}.`,
      };
    }
    return {
      kind: 'conflict',
      action: body.name,
      target: w1.target,
      first,
      second,
      witness,
      message:
        `${capital(n1)} and ${n2} both apply when ${when}. ` +
        `They say different things: ${n1} ${e1}, but ${n2} ${e2}. ` +
        `Which should win? As written, ${n2} wins only because it comes later.`,
      suggestion:
        `If ${n2} should win, write "// rule ${label2} wins over rule ${label1}" next to the rules. ` +
        `If ${n1} should win, change the rules so ${n2} does not apply then.`,
    };
  }
  if (label1 && label1 === label2) {
    const n = ruleName(label1);
    return {
      kind: 'conflict',
      action: body.name,
      target: w1.target,
      first,
      second,
      witness,
      message:
        `${capital(n)} says two different things when ${when}: ` +
        `one part ${e1}, but a later part ${e2}. Which should win? As written, the later part wins.`,
      suggestion: `Change ${n} so only one part applies then.`,
    };
  }
  const n1 = label1 ? ruleName(label1) : `the rule at line ${line1}`;
  const n2 = label2 ? ruleName(label2) : `the rule at line ${line2}`;
  return {
    kind: 'conflict',
    action: body.name,
    target: w1.target,
    first,
    second,
    witness,
    message:
      `Two rules in ${body.name} (lines ${line1} and ${line2}) both apply when ${when}. ` +
      `They say different things: ${n1} ${e1}, but ${n2} ${e2}. ` +
      `Which should win? As written, ${n2} wins only because it comes later.`,
    suggestion:
      'Make only one of them apply then (for example with else), or name them with ' +
      '"// rule <name>" comments and write "// rule <A> wins over rule <B>".',
  };
}

/**
 * Check a `.holo` or `.hsplus` composition source. Sources that are not
 * compositions with logic, or do not parse, give an empty report.
 */
export function findRuleConflicts(
  source: string,
  options: RuleConflictOptions = {}
): RuleConflictReport {
  const empty: RuleConflictReport = {
    conflicts: [],
    skipped: [],
    checkedActions: [],
    unconfirmed: 0,
  };
  if (!/\blogic\s*\{/.test(source)) return empty;
  const parsed = parseHolo(source);
  if (!parsed.success || !parsed.ast) return empty;
  return findRuleConflictsInComposition(parsed.ast, source, options);
}

export interface RuleConflictDiagnostic {
  severity: 'warning';
  code: 'RULE-CONFLICT' | 'RULE-PRIORITY-MISMATCH';
  message: string;
  line: number;
  column: number;
  suggestion: string;
}

/** Findings as validator warnings (never throws; a conflict is a question, not an error). */
export function ruleConflictDiagnostics(
  input: { source: string; ast?: HoloComposition },
  options: RuleConflictOptions = {}
): RuleConflictDiagnostic[] {
  try {
    const report = input.ast
      ? findRuleConflictsInComposition(input.ast, input.source, options)
      : findRuleConflicts(input.source, options);
    return report.conflicts.map((c) => ({
      severity: 'warning',
      code: c.kind === 'conflict' ? 'RULE-CONFLICT' : 'RULE-PRIORITY-MISMATCH',
      message: c.message,
      line: c.second.line,
      column: 1,
      suggestion: c.suggestion,
    }));
  } catch {
    return [];
  }
}
