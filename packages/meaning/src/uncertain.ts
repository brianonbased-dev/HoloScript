/**
 * Uncertain<T> — first-class ignorance as a value (language-architecture.md roadmap, inventiveness #1).
 *
 * WHY THIS EXISTS (D.129 — drop a human-shaped assumption): mainstream languages force you to model
 * "I don't know this value" with `null` / `Option<T>` / a sentinel — all of which conflate ABSENCE
 * with UNKNOWN-WHY and let you silently forget to handle the gap (`null` flows anywhere a `T` flows).
 * Honest abstention is already HoloMeaning's signature primitive at the query layer (MeaningResolution)
 * and inside the IR (three-state opacity). Uncertain<T> lifts it to a VALUE: a thing that is either
 * KNOWN (carries a T) or honestly UNKNOWN, and — critically — the unknown branch carries WHY, in the
 * SAME MeaningGapReason vocabulary the resolvers use. So an unknown VALUE and an unresolvable QUERY
 * speak one honesty language, and the type system makes ignoring the gap a COMPILE ERROR, not a
 * runtime surprise.
 *
 * WHY IT IS **NOT** CALLED `Epistemic<T>`: this package draws a precise line between the two classes
 * of not-knowing — `MeaningEpistemicReason` (REDUCIBLE: some stated fact would resolve it) and
 * `MeaningAleatoricReason` (IRREDUCIBLE: genuinely stochastic). This wrapper's unknown branch accepts
 * `MeaningGapReason`, the UNION of both, so naming it "Epistemic" would make one word mean two things
 * inside one package — exactly the ambiguity the stratum taxonomy exists to kill. `Uncertain` is the
 * honest span; `isAleatoric` narrows to the irreducible class when a caller must tell "we could learn
 * this" apart from "this is random."
 *
 * THE GUARANTEE: `Uncertain<T>` is not assignable to `T`. You cannot pass it where a `T` is expected;
 * to obtain a `T` you must call a combinator that forces you to handle the unknown case (`orElse` with
 * a fallback, or the explicitly-named, greppable escape hatch `requireKnown`). "Unknown-handling is
 * compile-checked" falls out of the discriminated union — no extra machinery.
 *
 * This is the SEMANTIC CORE that a future surface `@unknown` field annotation lowers to (that surface
 * syntax lives in the Rust/WASM grammar — see the RFC research/2026-07-17_first-class-ignorance-rfc.md).
 * Distinct from Option (present/absent, no reason) and Result (ok/error): the unknown here is a typed
 * epistemic-or-aleatoric STATE, not a failure.
 */

import type { MeaningGapReason, MeaningResolution, MeaningStructuredGap } from './contract';

/** A value that is either known (carries a T) or honestly unknown with a typed reason. */
export type Uncertain<T> =
  | { readonly known: true; readonly value: T }
  | { readonly known: false; readonly reason: MeaningGapReason; readonly gap?: MeaningStructuredGap };

/** Wrap a known value. */
export function known<T>(value: T): Uncertain<T> {
  return { known: true, value };
}

/** Declare a value unknown, with a typed reason (and optionally a family-scoped gap). */
export function unknown<T = never>(reason: MeaningGapReason, gap?: MeaningStructuredGap): Uncertain<T> {
  return gap === undefined ? { known: false, reason } : { known: false, reason, gap };
}

/** Type guard: narrows to the known branch (so `.value` is reachable). */
export function isKnown<T>(e: Uncertain<T>): e is { known: true; value: T } {
  return e.known;
}

/**
 * True when this value is unknown for an IRREDUCIBLE (aleatoric) reason — no additional stated fact
 * would resolve it. Lets a caller distinguish "we could learn this" (epistemic, worth investigating)
 * from "this is genuinely stochastic" (aleatoric, stop asking) without inspecting the family code.
 */
export function isAleatoric<T>(e: Uncertain<T>): boolean {
  return !e.known && e.gap?.aleatoric === true;
}

/**
 * Transform a known value; propagate an unknown UNCHANGED (reason + gap preserved). The workhorse:
 * you can compute over an Uncertain without ever asserting the value is present.
 */
export function map<T, U>(e: Uncertain<T>, fn: (value: T) => U): Uncertain<U> {
  return e.known ? { known: true, value: fn(e.value) } : e;
}

/** Chain a computation that itself may be unknown; the first unknown short-circuits. */
export function flatMap<T, U>(e: Uncertain<T>, fn: (value: T) => Uncertain<U>): Uncertain<U> {
  return e.known ? fn(e.value) : e;
}

/**
 * Combine two uncertain values; the result is unknown iff EITHER is unknown (the first unknown's
 * reason wins). This is the property that makes silent combination impossible — you cannot pair a
 * known with an unknown and get a usable pair.
 */
export function both<A, B>(a: Uncertain<A>, b: Uncertain<B>): Uncertain<readonly [A, B]> {
  if (!a.known) return a;
  if (!b.known) return b;
  return { known: true, value: [a.value, b.value] as const };
}

/** Extract a T by supplying an explicit fallback for the unknown case — the safe unwrap. */
export function orElse<T>(e: Uncertain<T>, fallback: T): T {
  return e.known ? e.value : fallback;
}

/**
 * The EXPLICIT escape hatch: assert the value is known, throwing if it is not. Named `requireKnown`
 * (never a silent `!` or cast) precisely so an audit can grep every place code claims knowledge it
 * cannot prove — the honest analog of a non-null assertion.
 */
export function requireKnown<T>(e: Uncertain<T>, context?: string): T {
  if (e.known) return e.value;
  const where = context ? ` (${context})` : '';
  throw new Error(`requireKnown${where}: value is unknown — reason "${e.reason}"${e.gap ? `, gap "${e.gap.code}"` : ''}`);
}

/**
 * Bridge the query world to the value world: a resolver's answer IS an uncertain value. `resolved`
 * ⇒ known(answer); `unresolvable` ⇒ unknown(reason, gap). Lets a resolution flow into any Uncertain
 * pipeline with no translation — one honesty vocabulary across queries and values, spanning both the
 * reducible and irreducible reason classes.
 */
export function fromResolution<A>(resolution: MeaningResolution<A>): Uncertain<A> {
  if (resolution.status === 'resolved' && resolution.answer !== undefined) {
    return { known: true, value: resolution.answer };
  }
  return unknown<A>(resolution.reason ?? 'underdetermined', resolution.gap);
}

// Compile-time proof of the core guarantee, checked by this package's dts build (tsc): Uncertain<T>
// is NOT assignable to T, so it can never be used where a bare T is expected without unwrapping. Pure
// types, zero runtime footprint. If a future edit makes Uncertain<T> assignable to T, the conditional
// yields 'broken', which violates the `extends 'ok'` bound and fails the build. (A `@ts-expect-error`
// in the test file would NOT catch this — vitest's esbuild skips type-checking, W.860.)
type AssertOk<X extends 'ok'> = X;
export type UncertainNotAssignableToT = AssertOk<Uncertain<number> extends number ? 'broken' : 'ok'>;
