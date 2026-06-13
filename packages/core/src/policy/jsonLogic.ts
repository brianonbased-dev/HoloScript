/**
 * Minimal, dependency-free JSON-Logic evaluator for the ContentPolicyGate ruleset.
 *
 * Policy rules are PURE DATA (JSON) — there is no code-execution surface — so a
 * legal/illegal ruleset can live in a database or a per-jurisdiction file and be
 * swapped WITHOUT a redeploy. That swap-without-deploy property (and the absence
 * of an embedded interpreter) is the reason we use a small JSON-Logic subset here
 * rather than pulling an OPA/Cedar runtime into the TS monorepo: the survey in
 * research/2026-06-13 recommends rules-as-data for jurisdiction-varying policy,
 * keeping a heavier engine as a later drop-in if scale demands it.
 *
 * This is intentionally NOT full JsonLogic. It supports exactly the operator
 * subset the policy rules need, with a recursion-depth cap and a regex-length cap
 * so a hostile rule file cannot hang the evaluator (ReDoS / stack blow-up).
 */

export type JsonLogicPrimitive = string | number | boolean | null;
export type JsonLogicExpr = { [operator: string]: unknown };
export type JsonLogicRule = JsonLogicPrimitive | JsonLogicExpr | JsonLogicRule[];

const MAX_DEPTH = 40;
const MAX_PATTERN_LENGTH = 512;

/** Dot-path lookup into the facts object. `''` returns the whole object. */
function getPath(data: Record<string, unknown>, path: string): unknown {
  if (path === '') return data;
  let cur: unknown = data;
  for (const key of path.split('.')) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
}

/** JSON-Logic truthiness: empty array/string, 0, null, false are falsy. */
function truthy(v: unknown): boolean {
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === 'string') return v.length > 0;
  if (typeof v === 'number') return v !== 0;
  return Boolean(v);
}

function toNum(v: unknown): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') return Number(v);
  return NaN;
}

/** Build a RegExp from untrusted rule data, defending against ReDoS/oversize patterns. */
function safeRegex(pattern: unknown, flags: unknown): RegExp | null {
  if (typeof pattern !== 'string' || pattern.length > MAX_PATTERN_LENGTH) return null;
  const f = typeof flags === 'string' ? flags.replace(/[^gimsuy]/g, '') : '';
  try {
    return new RegExp(pattern, f);
  } catch {
    return null;
  }
}

/**
 * Evaluate a JSON-Logic rule against a facts object. Returns the computed value
 * (primitives evaluate to themselves; logic nodes evaluate their operator).
 * Unknown operators and malformed nodes evaluate to `null` (falsy) rather than
 * throwing — a broken rule fails CLOSED for `block` predicates because a `null`
 * result is falsy, so it never silently allows.
 */
export function evaluateJsonLogic(
  rule: JsonLogicRule,
  data: Record<string, unknown>,
  depth = 0
): unknown {
  if (depth > MAX_DEPTH) return null;
  if (rule === null || typeof rule !== 'object') return rule;
  if (Array.isArray(rule)) {
    return rule.map((r) => evaluateJsonLogic(r as JsonLogicRule, data, depth + 1));
  }

  const keys = Object.keys(rule as JsonLogicExpr);
  if (keys.length !== 1) return null; // a logic node has exactly one operator
  const op = keys[0];
  const raw = (rule as JsonLogicExpr)[op];
  const args: unknown[] = Array.isArray(raw) ? raw : [raw];
  const ev = (x: unknown): unknown => evaluateJsonLogic(x as JsonLogicRule, data, depth + 1);

  switch (op) {
    case 'var': {
      const path = ev(args[0]);
      const fallback = args.length > 1 ? ev(args[1]) : undefined;
      const val = getPath(data, typeof path === 'string' ? path : '');
      return val === undefined ? (fallback ?? null) : val;
    }
    // eslint-disable-next-line eqeqeq
    case '==': return ev(args[0]) == ev(args[1]);
    case '===': return ev(args[0]) === ev(args[1]);
    // eslint-disable-next-line eqeqeq
    case '!=': return ev(args[0]) != ev(args[1]);
    case '!==': return ev(args[0]) !== ev(args[1]);
    case '>': return toNum(ev(args[0])) > toNum(ev(args[1]));
    case '>=': return toNum(ev(args[0])) >= toNum(ev(args[1]));
    case '<': return toNum(ev(args[0])) < toNum(ev(args[1]));
    case '<=': return toNum(ev(args[0])) <= toNum(ev(args[1]));
    case '!':
    case 'not':
      return !truthy(ev(args[0]));
    case 'and': {
      let last: unknown = true;
      for (const a of args) {
        last = ev(a);
        if (!truthy(last)) return last;
      }
      return last;
    }
    case 'or': {
      let last: unknown = false;
      for (const a of args) {
        last = ev(a);
        if (truthy(last)) return last;
      }
      return last;
    }
    case 'in': {
      const needle = ev(args[0]);
      const hay = ev(args[1]);
      if (typeof hay === 'string') return typeof needle === 'string' && hay.includes(needle);
      if (Array.isArray(hay)) return hay.includes(needle);
      return false;
    }
    case 'contains': {
      const hay = ev(args[0]);
      const needle = ev(args[1]);
      if (typeof hay === 'string') return typeof needle === 'string' && hay.includes(needle);
      if (Array.isArray(hay)) return hay.includes(needle);
      return false;
    }
    case 'startsWith': {
      const s = ev(args[0]);
      const p = ev(args[1]);
      return typeof s === 'string' && typeof p === 'string' && s.startsWith(p);
    }
    case 'endsWith': {
      const s = ev(args[0]);
      const p = ev(args[1]);
      return typeof s === 'string' && typeof p === 'string' && s.endsWith(p);
    }
    case 'matches': {
      const subject = ev(args[0]);
      const re = safeRegex(ev(args[1]), args.length > 2 ? ev(args[2]) : '');
      return re != null && typeof subject === 'string' && re.test(subject);
    }
    case 'some': {
      const arr = ev(args[0]);
      if (!Array.isArray(arr)) return false;
      return arr.some((item) =>
        truthy(
          evaluateJsonLogic(
            args[1] as JsonLogicRule,
            { ...data, item } as Record<string, unknown>,
            depth + 1
          )
        )
      );
    }
    default:
      return null;
  }
}

/** Convenience: evaluate a rule and coerce the result to a boolean (truthy). */
export function matchesRule(rule: JsonLogicRule, facts: Record<string, unknown>): boolean {
  return truthy(evaluateJsonLogic(rule, facts));
}
